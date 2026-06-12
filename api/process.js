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
const { sendNotification } = require("../output/notify");

function isAuthorized(req) {
  const expected = process.env.CRON_SECRET;
  const header =
    (req.headers && (req.headers.authorization || req.headers.Authorization)) ||
    "";

  // Non-secret debug log — only logs lengths and presence, never the values.
  console.log(
    `auth: env CRON_SECRET ${
      expected ? `present (${expected.length} chars)` : "MISSING"
    }; ` +
      `header authorization ${
        header ? `present (${header.length} chars)` : "MISSING"
      }`
  );

  if (!expected) return false;
  if (!header) return false;

  // Permissive Bearer extraction — handles "Bearer X", "bearer X", and extra whitespace.
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    console.log("auth: header is present but not in 'Bearer <token>' format");
    return false;
  }

  const token = match[1].trim();
  const matches = token === expected;
  console.log(
    `auth: token match=${matches} (expected len ${expected.length}, got len ${token.length})`
  );
  return matches;
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
    console.log(`  ? Parsing message ${messageId}`);
    const parsed = await parseMessage(authClient, messageId);
    result.subject = parsed.subject;
    console.log(
      `    subject="${parsed.subject}" attachments=${
        (parsed.attachments || []).length
      }`
    );

    const archiveFolderId = process.env.EMAIL_ARCHIVE_FOLDER_ID;
    if (!archiveFolderId) {
      throw new Error("EMAIL_ARCHIVE_FOLDER_ID env var is not set");
    }

    console.log(`  ? Uploading email + attachments to archive folder`);
    const driveResult = await uploadEmailToDrive(
      authClient,
      parsed,
      archiveFolderId,
      client.clientName
    );
    result.driveFolderUrl = driveResult.subfolderUrl;
    console.log(
      `    uploaded ${driveResult.uploadedFiles.length} file(s) into archive subfolder`
    );

    console.log(`  ? Calling Claude for triage analysis`);
    const analysis = await analyzeEmail(parsed, client);

    console.log(`  ? Building intake brief`);
    const brief = buildBrief(parsed, analysis, driveResult, client);

    console.log(`  ? Saving brief alongside email in archive subfolder`);
    const briefUrl = await saveBriefToDrive(
      authClient,
      brief,
      driveResult.subfolderId,
      "intake-brief.md"
    );
    result.briefUrl = briefUrl;

    console.log(`  ? Marking message ${messageId} processed`);
    await markProcessed(authClient, messageId);

    try {
      console.log(`  → Sending notification email`);
      await sendNotification(authClient, {
        clientName: client.clientName,
        from: parsed.from,
        subject: parsed.subject,
        subfolderUrl: driveResult.subfolderUrl,
        briefUrl: result.briefUrl,
        uploadedFiles: driveResult.uploadedFiles,
      });
    } catch (notifyErr) {
      console.error(`  Failed to send notification: ${notifyErr.message}`);
    }

    result.success = true;
    console.log(`  ? Done with ${messageId}`);
  } catch (err) {
    result.success = false;
    result.error = err.message;
    console.error(`  ? Failed processing ${messageId}:`, err.message);
  }

  return result;
}

async function runPipeline() {
  const processed = [];

  const authClient = await getAuthClient();

  for (const client of clients) {
    console.log(`? Checking emails for ${client.id} (${client.senderEmail})`);

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

    console.log(`  ? Found ${ids.length} new email(s)`);

    for (const id of ids) {
      const result = await processOneEmail(authClient, client, id);
      processed.push(result);
    }
  }

  return processed;
}

module.exports = async (req, res) => {
  const method = (req && req.method) || "GET";

  // Vercel Cron sends GET; manual invocations from a script may send POST.
  // Accept both. Reject anything else.
  if (method !== "POST" && method !== "GET") {
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