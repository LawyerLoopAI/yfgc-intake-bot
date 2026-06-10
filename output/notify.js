const { google } = require("googleapis");

function escapeHtml(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHtml({ clientName, from, subject, subfolderUrl, briefUrl, uploadedFiles }) {
  const files = (uploadedFiles || [])
    .map(
      (f) =>
        `<li><a href="${escapeHtml(f.webViewLink || "#")}">${escapeHtml(f.name)}</a></li>`
    )
    .join("");
  return `
    <p>A new client email has been triaged and a brief is waiting for your review.</p>
    <table style="border-collapse:collapse;font-family:system-ui,sans-serif;">
      <tr><td style="padding:4px 8px;"><strong>Client:</strong></td><td style="padding:4px 8px;">${escapeHtml(clientName)}</td></tr>
      <tr><td style="padding:4px 8px;"><strong>From:</strong></td><td style="padding:4px 8px;">${escapeHtml(from)}</td></tr>
      <tr><td style="padding:4px 8px;"><strong>Subject:</strong></td><td style="padding:4px 8px;">${escapeHtml(subject)}</td></tr>
    </table>
    <p style="margin-top:16px;"><a href="${escapeHtml(briefUrl || subfolderUrl)}" style="background:#0040FF;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;display:inline-block;font-family:system-ui,sans-serif;">Open the intake brief</a></p>
    <p style="margin-top:16px;">Or open the full <a href="${escapeHtml(subfolderUrl)}">Drive folder</a>, which contains:</p>
    <ul>${files}</ul>
    <p style="color:#666;font-size:12px;margin-top:24px;">Sent automatically by yfgc-intake-bot. Attorney review required before any client communication.</p>
  `;
}

async function sendNotification(authClient, payload) {
  const to = process.env.NOTIFY_EMAIL;
  if (!to) {
    console.log("  NOTIFY_EMAIL not set — skipping notification");
    return null;
  }
  const gmail = google.gmail({ version: "v1", auth: authClient });
  const subject = `[YFGC Intake] ${payload.clientName}: ${payload.subject || "(no subject)"}`;
  const headers = [
    `To: ${to}`,
    `From: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
    "",
  ].join("\r\n");
  const raw = Buffer.from(headers + buildHtml(payload), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });
  return res.data.id;
}

module.exports = { sendNotification };
