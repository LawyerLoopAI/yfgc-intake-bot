require("dotenv").config();

const clients = require("../config");
const { getAuthClient } = require("../gmail/auth");
const {
  getUnprocessedEmails,
  markProcessed,
} = require("../gmail/watcher");
const { parseMessage } = require("../gmail/parser");
const { uploadEmailToDrive } = require("../drive/uploader");
const { analyzeEmail } = require("../claude/analyze");
const { buildBrief } = require("../output/briefBuilder");
const { saveBriefToDrive } = require("../output/driveDeposit");

function isAuthorized(req) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header =
    (req.headers && (req.headers.authorization || req.headers.Authorization)) ||
    "";
  return header === `Bearer ${expected}`;
}

async function processOneEmail(authClient, client, messageId) {
  const result = {
    id: messageId,
    client: client.id,
    subject: null,
    briefUrl: null,
    driveFolderUrl: null,
    success: false,
    error: null,
  };

  try {
    console.log(`  → Parsing message ${messageId}`);
    const parsed = await parseMessage(authClient, messageId);
    result.subject = parsed.subject;
    console.log(
      `    subject="${parsed.subject}" attachments=${
        (parsed.attachments || []).length
      }`
    );

    console.log(`  → Uploading email + attachments to Drive`);
    const driveResult = await uploadEmailToDrive(
      authClient,
      parsed,
      client.driveFolderId
    );
    result.driveFolderUrl = driveResult.subfolderUrl;
    console.log(
      `    uploaded ${driveResult.uploadedFiles.length} file(s) into subfolder`
    );

    console.log(`  → Calling Claude for triage analysis`);
    const analysis = await analyzeEmail(parsed, client);

    console.log(`  → Building intake brief`);
    const brief = buildBrief(parsed, analysis, driveResult, client);

    console.log(`  → Saving brief to Drive`);
    const briefUrl = await saveBriefToDrive(
      authClient,
      brief,
      driveResult.subfolderId
    );
    result.briefUrl = briefUrl;

    console.log(`  → Marking message ${messageId} processed`);
    await markProcessed(authClient, messageId);

    result.success = true;
    console.log(`  ✓ Done with ${messageId}`);
  } catch (err) {
    result.success = false;
    result.error = err.message;
    console.error(`  ✗ Failed processing ${messageId}:`, err.message);
  }

  return result;
}

async function runPipeline() {
  const processed = [];

  const authClient = await getAuthClient();

  for (const client of clients) {
    console.log(`→ Checking emails for ${client.id} (${client.senderEmail})`);

    let ids = [];
    try {
      ids = await getUnprocessedEmails(authClient, client.senderEmail);
    } catch (err) {
      console.error(
        `  Failed listing emails for ${client.id}:`,
        err.message
      );
      continue;
    }

    console.log(`  → Found ${ids.length} new email(s)`);

    for (const id of ids) {
      const result = await processOneEmail(authClient, client, id);
      processed.push(result);
    }
  }

  return processed;
}

module.exports = async (req, res) => {
  const method = (req && req.method) || "GET";

  if (method !== "POST") {
    if (res && typeof res.status === "function") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }
    return { ok: false, error: "Method not allowed" };
  }

  if (!isAuthorized(req)) {
    console.error("Unauthorized invocation rejected");
    if (res && typeof res.status === "function") {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    return { ok: false, error: "Unauthorized" };
  }

  try {
    console.log("yfgc-intake-bot: pipeline start");
    const processed = await runPipeline();
    console.log(
      `yfgc-intake-bot: pipeline complete (${processed.length} email(s) processed)`
    );

    if (res && typeof res.status === "function") {
      return res.status(200).json({ ok: true, processed });
    }
    return { ok: true, processed };
  } catch (err) {
    console.error("Pipeline crashed:", err.message);
    if (res && typeof res.status === "function") {
      return res.status(500).json({ ok: false, error: err.message });
    }
    return { ok: false, error: err.message };
  }
};
