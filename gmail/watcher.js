const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

// Vercel's project FS is read-only; only /tmp is writable.
const PROCESSED_PATH = process.env.VERCEL
  ? "/tmp/processed-ids.json"
  : path.join(__dirname, "..", "processed-ids.json");

function loadProcessedIds() {
  if (!fs.existsSync(PROCESSED_PATH)) {
    try {
      fs.writeFileSync(PROCESSED_PATH, "[]", "utf8");
    } catch (err) {
      // On Vercel the filesystem is read-only outside /tmp; fall back to empty list.
      console.error(
        "Could not initialize processed-ids.json:",
        err.message
      );
      return [];
    }
    return [];
  }

  try {
    const raw = fs.readFileSync(PROCESSED_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("processed-ids.json unreadable, treating as empty:", err.message);
    return [];
  }
}

function saveProcessedIds(ids) {
  try {
    fs.writeFileSync(PROCESSED_PATH, JSON.stringify(ids, null, 2), "utf8");
  } catch (err) {
    console.error("Could not write processed-ids.json:", err.message);
  }
}

async function getUnprocessedEmails(authClient, senderEmail) {
  const gmail = google.gmail({ version: "v1", auth: authClient });

  const res = await gmail.users.messages.list({
    userId: "me",
    q: `from:${senderEmail} is:unread`,
  });

  const messages = res.data.messages || [];
  const ids = messages.map((m) => m.id);

  const processed = new Set(loadProcessedIds());
  return ids.filter((id) => !processed.has(id));
}

async function markProcessed(authClient, messageId) {
  const gmail = google.gmail({ version: "v1", auth: authClient });

  try {
    await gmail.users.messages.modify({
      userId: "me",
      id: messageId,
      requestBody: { removeLabelIds: ["UNREAD"] },
    });
  } catch (err) {
    console.error(
      `Failed to remove UNREAD label on ${messageId}:`,
      err.message
    );
  }

  const processed = loadProcessedIds();
  if (!processed.includes(messageId)) {
    processed.push(messageId);
    saveProcessedIds(processed);
  }
}

module.exports = {
  getUnprocessedEmails,
  markProcessed,
};
