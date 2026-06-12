const { google } = require("googleapis");

function decodeBase64Url(data) {
  if (!data) return Buffer.alloc(0);
  // Gmail uses base64url. Node's "base64" decoder accepts it after replacing chars.
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64");
}

function findHeader(headers, name) {
  if (!Array.isArray(headers)) return null;
  const target = name.toLowerCase();
  const hit = headers.find(
    (h) => typeof h.name === "string" && h.name.toLowerCase() === target
  );
  return hit ? hit.value : null;
}

function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Recursively walk MIME parts, collecting text/plain, text/html, and attachments.
function walkParts(part, collected) {
  if (!part) return;

  const mimeType = part.mimeType || "";
  const filename = part.filename || "";
  const body = part.body || {};

  if (filename && (body.attachmentId || body.data)) {
    collected.attachments.push({
      filename,
      mimeType,
      attachmentId: body.attachmentId || null,
      inlineData: body.data || null,
    });
  } else if (mimeType === "text/plain" && body.data) {
    collected.plainParts.push(decodeBase64Url(body.data).toString("utf8"));
  } else if (mimeType === "text/html" && body.data) {
    collected.htmlParts.push(decodeBase64Url(body.data).toString("utf8"));
  }

  if (Array.isArray(part.parts)) {
    for (const child of part.parts) {
      walkParts(child, collected);
    }
  }
}

async function fetchAttachment(gmail, messageId, attachment) {
  if (attachment.inlineData) {
    return {
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      data: decodeBase64Url(attachment.inlineData),
    };
  }

  try {
    const res = await gmail.users.messages.attachments.get({
      userId: "me",
      messageId,
      id: attachment.attachmentId,
    });
    return {
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      data: decodeBase64Url(res.data.data),
    };
  } catch (err) {
    console.error(
      `Failed to fetch attachment ${attachment.filename}:`,
      err.message
    );
    return {
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      data: Buffer.alloc(0),
    };
  }
}

async function parseMessage(authClient, messageId) {
  const gmail = google.gmail({ version: "v1", auth: authClient });

  const res = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  const payload = res.data.payload || {};
  const headers = payload.headers || [];

  const subject = findHeader(headers, "Subject") || "(no subject)";
  const from = findHeader(headers, "From") || "(unknown sender)";
  const date = findHeader(headers, "Date") || "";

  const collected = { plainParts: [], htmlParts: [], attachments: [] };

  // Handle the case where the payload itself is the only body.
  if (
    payload.body &&
    payload.body.data &&
    (!payload.parts || payload.parts.length === 0)
  ) {
    if ((payload.mimeType || "").startsWith("text/html")) {
      collected.htmlParts.push(
        decodeBase64Url(payload.body.data).toString("utf8")
      );
    } else {
      collected.plainParts.push(
        decodeBase64Url(payload.body.data).toString("utf8")
      );
    }
  } else {
    walkParts(payload, collected);
  }

  let body = collected.plainParts.join("\n\n").trim();
  if (!body && collected.htmlParts.length > 0) {
    body = stripHtml(collected.htmlParts.join("\n\n"));
  }

  const attachments = [];
  for (const att of collected.attachments) {
    const fetched = await fetchAttachment(gmail, messageId, att);
    attachments.push(fetched);
  }

  return {
    messageId,
    threadId: res.data.threadId,
    subject,
    from,
    date,
    body,
    attachments,
  };
}

module.exports = {
  parseMessage,
};
