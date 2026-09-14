// Identifies the person to write to at a newly funded company, and finds their
// email address.
//
// Runs on Vercel rather than in a Claude Code session, because the sandbox's
// egress proxy allows only an allowlist and company websites are not on it.
// Here there is open outbound HTTPS, so the site sweep in findEmail.js works
// and Claude's server-side web_search tool can do the identification.

const { findEmail, siteDomain } = require("./findEmail");
const { lookupEmail } = require("./emailProvider");

const MODEL = "claude-opus-5";

// Dynamic-filtering variant, supported on Opus 5.
const WEB_SEARCH_TOOL = {
  type: "web_search_20260209",
  name: "web_search",
  max_uses: 10,
};

// Stage one: who is this note addressed to.
const IDENTIFY_SYSTEM = `You identify who runs a newly funded startup, so a lawyer can address a congratulations note correctly.

Find the CEO. Only if the company genuinely has no CEO, find the founder, or the senior-most of several co-founders. Founder and CEO are often different people and getting this wrong is the most visible way to fail, so check the title rather than assuming the founder runs the company.

Never invent a name or a title. If you cannot establish who it is, say so.

Reply with a single JSON object and nothing else:
{"fullName": string|null, "firstName": string|null, "title": string|null, "isCeo": boolean, "otherLeaders": string[], "sources": string[], "notes": string}`;

// Stage two: find that specific person's address. Separated from stage one on
// purpose. Folded together, the model treats the address as an afterthought
// and settles for whatever inbox it saw first.
const EMAIL_SYSTEM = `You find the direct work email address of one named person. Nothing else.

THE ONLY ACCEPTABLE ANSWER is an address that belongs to that person. A generic company inbox is not a weaker answer, it is the wrong answer. Reject every one of these outright, no matter how prominently the site displays it: info@, hello@, hi@, contact@, support@, help@, team@, press@, pr@, media@, sales@, careers@, jobs@, legal@, privacy@, security@, admin@, partners@, ir@, investors@, billing@, noreply@. If the only thing you can find is one of those, the answer is null.

Search hard before giving up. Places a person's real address actually turns up:
- The company's team, about, leadership or contact page, where staff are listed individually.
- The funding press release. Use the contact only if it names this person; a PR agency's address is not theirs.
- SEC EDGAR. A company that just raised has very likely filed a Form D, and the filing carries contact details.
- GitHub. For a technical founder, the author address on their public commits is a real address.
- Their own writing: personal site, blog, Substack, newsletter footer.
- Conference speaker bios, podcast show notes, university and alumni pages, professional directories.
- Their public profiles and any link tree those point to.

Try several distinct searches, including the person's name paired with the company domain, and the name paired with the word email or contact.

Rules you do not break:
- Never invent an address, and never guess at a pattern like first.last purely because it is common. Constructing an address is allowed ONLY when you have seen at least two real addresses at that same domain sharing one shape; then report confidence "pattern" and name the two addresses you based it on.
- An address you actually read somewhere is confidence "verified". Say where you read it.
- An honest null beats a plausible fabrication. This lawyer would rather add an address by hand than send mail to the wrong person.

Reply with a single JSON object and nothing else:
{"email": string|null, "emailConfidence": "verified"|"pattern"|null, "sources": string[], "searched": string[], "notes": string}

"searched" lists what you actually tried, so a human knows where to pick up. "notes" says in one or two sentences what you found and what you ruled out.`;

/**
 * Pull the first JSON object out of a model response.
 * Tolerant on purpose: this runs unattended, and a run that throws because the
 * model wrapped its JSON in a code fence would lose the whole company.
 * @param {string} text
 * @returns {object|null}
 */
function extractJson(text) {
  const raw = String(text == null ? "" : text);
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [fenced && fenced[1], raw].filter(Boolean);

  for (const candidate of candidates) {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end <= start) continue;
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      // Fall through to the next candidate.
    }
  }
  return null;
}

function collectText(content) {
  return (content || [])
    .filter((block) => block && block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

/**
 * @param {object} funding a record from parseFundingSection
 * @param {object} [deps] injection points for tests
 * @returns {Promise<object>} contact details, always an object, never a throw
 */
// Strength of evidence, highest first. A mailbox Hunter confirmed accepts
// mail, or an address read off a page that matches the person's name, both
// count as verified; an inferred one is a step below.
const RANK = { verified: 2, pattern: 1 };
const rank = (confidence) => RANK[confidence] || 0;

async function askForJson(client, system, prompt, maxUses, effort = "high") {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system,
    thinking: { type: "adaptive" },
    output_config: { effort },
    tools: [{ ...WEB_SEARCH_TOOL, max_uses: maxUses }],
    messages: [{ role: "user", content: prompt }],
  });

  if (response.stop_reason === "refusal") {
    const category = (response.stop_details && response.stop_details.category) || "unknown";
    return { parsed: null, error: `model declined: ${category}` };
  }
  const parsed = extractJson(collectText(response.content));
  return { parsed, error: parsed ? null : "could not parse a JSON object from the reply" };
}

/**
 * @param {object} funding a record from parseFundingSection
 * @param {object} [deps] injection points for tests
 * @returns {Promise<object>} contact details, always an object, never a throw
 */
async function researchContact(funding, deps = {}) {
  const deadline = deps.deadline || null;
  // Required lazily, like googleapis in gmailDraft.js, so the pure helpers
  // here stay importable without the SDK installed.
  // A per-request ceiling, so one unlucky research call cannot consume the
  // whole function budget on its own. The SDK takes milliseconds.
  const client = deps.client || new (require("@anthropic-ai/sdk"))({ timeout: 75000, maxRetries: 1 });
  const fetchImpl = deps.fetchImpl || globalThis.fetch;

  const { company, website, description, amountText, round } = funding;
  const raise = [amountText, round].filter(Boolean).join(" ");

  const result = {
    company,
    fullName: null, firstName: null, title: null, isCeo: false, otherLeaders: [],
    email: null, emailConfidence: null, emailSource: null, sources: [], searched: [], notes: "", errors: [],
  };

  // Stage 1: who.
  const who = await askForJson(
    client,
    IDENTIFY_SYSTEM,
    [
      `Company: ${company}`,
      website ? `Website: ${website}` : null,
      description ? `Described as: ${description}` : null,
      raise ? `Just raised: ${raise}` : null,
      "",
      "Who is the CEO? If there is no CEO, who is the founder?",
    ].filter(Boolean).join("\n"),
    6,
    "medium"
  );
  if (who.error) result.errors.push(who.error);
  if (who.parsed) {
    Object.assign(result, {
      fullName: who.parsed.fullName || null,
      firstName: who.parsed.firstName || null,
      title: who.parsed.title || null,
      isCeo: !!who.parsed.isCeo,
      otherLeaders: who.parsed.otherLeaders || [],
      sources: who.parsed.sources || [],
      notes: who.parsed.notes || "",
    });
  }

  if (!result.fullName) {
    result.notes = [result.notes, "No person identified, so no address was sought."].filter(Boolean).join(" ");
    return result;
  }

  // Stage 2: that person's address, as its own search with its own budget.
  if (!deadline || Date.now() < deadline) {
    const mail = await askForJson(
      client,
      EMAIL_SYSTEM,
      [
        `Person: ${result.fullName}`,
        result.title ? `Title: ${result.title}` : null,
        `Company: ${company}`,
        website ? `Company website: ${website}` : null,
        "",
        `Find ${result.fullName}'s own work email address.`,
      ].filter(Boolean).join("\n"),
      12
    );
    if (mail.error) result.errors.push(mail.error);
    if (mail.parsed) {
      const confidence = mail.parsed.emailConfidence;
      if (mail.parsed.email && (confidence === "verified" || confidence === "pattern")) {
        result.email = mail.parsed.email;
        result.emailConfidence = confidence;
      }
      result.sources = [...new Set([...result.sources, ...(mail.parsed.sources || [])])];
      result.searched = mail.parsed.searched || [];
      if (mail.parsed.notes) result.notes = [result.notes, mail.parsed.notes].filter(Boolean).join(" ");
    }
  }

  const consider = (candidate, label) => {
    if (!candidate) return;
    if (candidate.email && rank(candidate.confidence) > rank(result.emailConfidence)) {
      result.email = candidate.email;
      result.emailConfidence = candidate.confidence;
      result.emailSource = label;
    }
    if (candidate.sources && candidate.sources.length) {
      result.sources = [...new Set([...result.sources, ...candidate.sources])];
    }
    if (candidate.notes && candidate.notes.length) {
      result.notes = [result.notes, ...candidate.notes].filter(Boolean).join(" ");
    }
  };

  if (result.email) result.emailSource = "web search";

  // Stage 3: Hunter, when a key is configured. This is the source that
  // actually closes the gap, because founder addresses mostly are not on the
  // open web. Its verifier can confirm a mailbox accepts mail, which no amount
  // of reading pages can establish.
  const hunterKey = deps.hunterApiKey || process.env.HUNTER_API_KEY;
  if (hunterKey && (!deadline || Date.now() < deadline)) {
    const domain = siteDomain(website);
    try {
      consider(
        await lookupEmail({ domain, fullName: result.fullName, apiKey: hunterKey, fetchImpl }),
        "hunter"
      );
    } catch (err) {
      result.errors.push(`Hunter lookup failed: ${err.message}`);
    }
  }

  // Stage 4: the deterministic site sweep, as a backstop. It reads pages the
  // model may have skimmed.
  if (website && fetchImpl) {
    try {
      const sweep = await findEmail({ website, personName: result.fullName, fetchImpl, deadline });
      consider(
        { email: sweep.email, confidence: sweep.confidence, sources: sweep.evidence, notes: sweep.email ? [] : sweep.notes },
        "site sweep"
      );
    } catch (err) {
      result.errors.push(`site sweep failed: ${err.message}`);
    }
  }

  return result;
}

module.exports = { researchContact, extractJson, MODEL, WEB_SEARCH_TOOL, IDENTIFY_SYSTEM, EMAIL_SYSTEM };
