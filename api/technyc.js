require("dotenv").config();

const { google } = require("googleapis");
const { getAuthClient } = require("../gmail/auth");
const { parseMessage } = require("../gmail/parser");
const { parseFundingSection } = require("../technyc/parseFunding");
const { buildOutreachEmail, LINKS } = require("../technyc/emailTemplate");
const { researchContact } = require("../technyc/research");
const { createDraft, updateDraft, textToHtml } = require("../technyc/gmailDraft");
const {
  sourceListParams,
  outreachSubjectQuery,
  summarySentQuery,
  digestDate,
} = require("../technyc/gmailQuery");
const { buildSummary } = require("../technyc/summary");
const { recordRuns, buildRow } = require("../technyc/tracker");

const SOURCE_LABEL_ID = "Label_2387005531655631291"; // "TechNYC Emails"
const FROM = "Jesse Strauss <jesse@yfgc.ai>";
const SUMMARY_TO = "jesse@yfgc.ai";
const LOOKBACK = "7d";

// Drive folder holding the outreach log. The bot creates the sheet inside it
// on first run; see technyc/tracker.js for why it cannot use one made by hand.
const TRACKER_FOLDER_ID =
  process.env.TRACKER_FOLDER_ID || "1Z7SePn8jOA4iwMChfC8JScKxE0lbfPT0";

// Vercel kills the function at maxDuration (set in vercel.json). Stop starting
// new companies before that so the run finishes cleanly and sends its summary
// rather than being cut off mid-draft. Whatever is left is picked up by the
// next run, which is safe because the work product is the state.
// Vercel kills the function at maxDuration, currently 300s. The previous
// design only checked the clock before STARTING a company, so one that began
// at t=250 ran past the cap and killed the whole invocation. Drafts survived,
// because they are written per company, but the sheet write and the summary
// both happen at the end and were lost along with five minutes of API spend.
//
// Three layers now keep that from happening:
//   WORK_BUDGET_MS   a watchdog that abandons in-flight research and proceeds
//                    to the sheet and summary with whatever finished
//   START_RESERVE_MS refuses to start a company without room to finish it
//   the Anthropic client's own per-request timeout, in research.js
const WORK_BUDGET_MS = 200000;
const START_RESERVE_MS = 110000;

// Companies are researched concurrently. Sequentially, two Claude calls per
// company at high effort exhausted the budget by the third one: the September
// 14 run cut Luminary's sweep short and never reached Sequen or Type at all.
// The work is almost entirely waiting on other people's servers, so running a
// few at once turns fifteen minutes of latency into about three. Kept modest
// so a five-company digest does not hammer the Anthropic or Hunter rate limits.
const CONCURRENCY = 5;

/**
 * Run fn over every item, at most `limit` in flight. Rejections are impossible
 * here because fn captures its own errors; a throw would abandon the other
 * workers mid-flight and lose their drafts.
 */
async function mapWithConcurrency(items, limit, fn) {
  const queue = [...items.entries()];
  const results = new Array(items.length);
  const worker = async () => {
    for (;;) {
      const next = queue.shift();
      if (!next) return;
      const [index, item] = next;
      results[index] = await fn(item, index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function isAuthorized(req) {
  const expected = process.env.CRON_SECRET;
  const header =
    (req.headers && (req.headers.authorization || req.headers.Authorization)) || "";
  if (!expected || !header) return false;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return !!match && match[1].trim() === expected;
}

async function search(gmail, q, limit = 25) {
  const res = await gmail.users.messages.list({ userId: "me", q, maxResults: limit });
  return res.data.messages || [];
}

async function listSourceDigests(gmail) {
  const res = await gmail.users.messages.list(sourceListParams(SOURCE_LABEL_ID, LOOKBACK));
  return res.data.messages || [];
}

/**
 * What, if anything, already exists for this company?
 *
 * The Gmail account's drafts and sent mail are the pipeline's only state.
 * There is no processed-marker label because the connector that also runs this
 * workflow has no label-write scope, and a local file would not survive
 * Vercel's read-only, ephemeral filesystem. The work product is durable and
 * lives exactly where a duplicate would do damage.
 *
 * The distinction that matters: a draft with no recipient is unfinished work,
 * not evidence the company was contacted. A previous run that could not find
 * an address should not lock the company out forever, so those drafts are
 * completed in place on a later run rather than skipped or duplicated.
 *
 * @returns {Promise<{state: "sent"|"drafted"|"addressless"|"none", draftId?: string}>}
 */
async function existingWork(gmail, company) {
  const subject = outreachSubjectQuery(company);

  const sent = await search(gmail, `${subject} in:sent`, 1);
  if (sent.length) return { state: "sent" };

  const res = await gmail.users.drafts.list({ userId: "me", q: subject, maxResults: 5 });
  const drafts = res.data.drafts || [];
  if (!drafts.length) return { state: "none" };

  for (const d of drafts) {
    const full = await gmail.users.drafts.get({ userId: "me", id: d.id, format: "metadata" });
    const headers = (full.data.message && full.data.message.payload && full.data.message.payload.headers) || [];
    const to = headers.find((h) => h.name && h.name.toLowerCase() === "to");
    if (to && to.value && to.value.trim()) return { state: "drafted" };
  }

  // Every matching draft lacks a recipient. Take the first and finish it.
  return { state: "addressless", draftId: drafts[0].id };
}

async function summaryAlreadySent(gmail, digestSubject) {
  const date = digestDate(digestSubject);
  if (!date) return false;
  const hits = await search(gmail, summarySentQuery(date), 1);
  return hits.length > 0;
}

async function sendSummary(authClient, subject, body) {
  const gmail = google.gmail({ version: "v1", auth: authClient });
  const raw = Buffer.from(
    [
      `From: ${FROM}`,
      `To: ${SUMMARY_TO}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(body, "utf8").toString("base64"),
    ].join("\r\n"),
    "utf8"
  )
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
}

async function runPipeline() {
  const started = Date.now();
  const deadline = started + WORK_BUDGET_MS;
  const authClient = await getAuthClient();
  const gmail = google.gmail({ version: "v1", auth: authClient });

  const messages = await listSourceDigests(gmail);
  console.log(`technyc: ${messages.length} message(s) under the source label in the last ${LOOKBACK}`);
  const seenSubjects = new Set();
  const outcome = { digests: [], drafted: [], skipped: [], failed: [] };

  const work = (async () => {
  for (const { id } of messages) {
    let digest;
    try {
      digest = await parseMessage(authClient, id);
    } catch (err) {
      outcome.failed.push({ messageId: id, error: err.message });
      continue;
    }

    // Jesse receives each digest at two addresses, so one edition arrives
    // twice. Work each subject once.
    if (seenSubjects.has(digest.subject)) continue;
    seenSubjects.add(digest.subject);

    if (await summaryAlreadySent(gmail, digest.subject)) {
      outcome.skipped.push({ digest: digest.subject, reason: "summary already sent" });
      continue;
    }

    const rows = parseFundingSection(digest.body);
    outcome.digests.push({ subject: digest.subject, companies: rows.length });
    if (!rows.length) continue;

    await mapWithConcurrency(rows, CONCURRENCY, async (row, order) => {
      // Reserve enough time to actually finish, not merely to begin.
      if (Date.now() > deadline - START_RESERVE_MS) {
        outcome.skipped.push({ order, company: row.company, reason: "out of time this run, will retry on the next one" });
        return;
      }

      try {
        const prior = await existingWork(gmail, row.company);
        if (prior.state === "sent" || prior.state === "drafted") {
          outcome.skipped.push({ order, company: row.company, reason: `already ${prior.state}` });
          return;
        }

        const contact = await researchContact(row, { deadline });
        const email = buildOutreachEmail({ ...row, contactFirstName: contact.firstName });
        const payload = {
          from: FROM,
          to: contact.email || undefined,
          subject: email.subject,
          text: email.body,
          html: textToHtml(email.body, LINKS),
        };

        const draft = prior.state === "addressless"
          ? await updateDraft(authClient, prior.draftId, payload)
          : await createDraft(authClient, payload);

        outcome.drafted.push({
          order,
          digest: digestDate(digest.subject),
          row,
          contact,
          draftId: draft.id,
          completed: prior.state === "addressless",
        });
      } catch (err) {
        outcome.failed.push({ order, company: row.company, error: err.message });
      }
    });
  }

  })();

  // The watchdog is what guarantees Jesse gets a sheet row and a summary even
  // when research overruns. Abandoned calls still finish and still cost money,
  // but the invocation returns with its work product instead of being killed.
  let timer;
  const watchdog = new Promise((resolve) => {
    timer = setTimeout(() => {
      outcome.timedOut = true;
      resolve();
    }, WORK_BUDGET_MS);
  });
  await Promise.race([work, watchdog]);
  clearTimeout(timer);

  if (outcome.timedOut) {
    console.warn(`technyc: work budget reached after ${Math.round((Date.now() - started) / 1000)}s, writing what finished`);
  }

  // Concurrent workers finish out of order; the summary should still read in
  // the order the digest listed the companies.
  const byOrder = (a, b) => (a.order || 0) - (b.order || 0);
  outcome.drafted.sort(byOrder);
  outcome.skipped.sort(byOrder);
  outcome.failed.sort(byOrder);

  return { outcome, authClient };
}

module.exports = async (req, res) => {
  const method = (req && req.method) || "GET";
  const reply = (status, payload) => {
    if (res && typeof res.status === "function") return res.status(status).json(payload);
    return payload;
  };

  if (method !== "POST" && method !== "GET") {
    return reply(405, { ok: false, error: "Method not allowed" });
  }
  if (!isAuthorized(req)) {
    console.error("technyc: unauthorized invocation rejected");
    return reply(401, { ok: false, error: "Unauthorized" });
  }

  try {
    console.log("technyc: start");
    const { outcome, authClient } = await runPipeline();

    // A quiet day is not worth an email, but a day with failures is, even when
    // nothing got drafted: silence would look identical to "no digest today".
    // Log to the tracking sheet before the summary, so the summary can carry
    // the link. A failure here must not cost Jesse the summary or the drafts,
    // which are the actual deliverable, so it is reported and swallowed.
    let tracker = null;
    if (outcome.drafted.length) {
      try {
        const today = new Date().toISOString().slice(0, 10);
        tracker = await recordRuns(
          authClient,
          TRACKER_FOLDER_ID,
          outcome.drafted.map((d) => buildRow(d, d.digest, today))
        );
        console.log(`technyc: sheet updated, ${tracker.added} added, ${tracker.updated} corrected`);
      } catch (err) {
        console.error("technyc: tracking sheet failed:", err.message);
        outcome.trackerError = err.message;
      }
    }

    if (outcome.drafted.length || outcome.failed.length) {
      const date = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric" });
      await sendSummary(
        authClient,
        `TechNYC outreach: ${outcome.drafted.length} draft${
          outcome.drafted.length === 1 ? "" : "s"
        } ready (${date})`,
        buildSummary(outcome, tracker)
      );
    }

    console.log(
      `technyc: done. drafted=${outcome.drafted.length} skipped=${outcome.skipped.length} failed=${outcome.failed.length}`
    );
    return reply(200, { ok: true, outcome });
  } catch (err) {
    console.error("technyc: crashed:", err.message);
    return reply(500, { ok: false, error: err.message });
  }
};
