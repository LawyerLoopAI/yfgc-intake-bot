// Builds a Gmail draft as raw MIME.
//
// Why raw MIME rather than a friendlier helper: the Gmail API lets a raw
// message carry its own From header, and Gmail honours it as long as the
// address is a verified send-as alias on the account. That is the only way to
// make these drafts come from jesse@yfgc.ai rather than the account's default
// identity. The MCP connector has no equivalent, which is why draft creation
// belongs here rather than in a Claude session.

const CRLF = "\r\n";

/**
 * RFC 2047 encoded-word, for header values that are not pure ASCII.
 * Left alone when the value is already ASCII, because an encoded-word is
 * harder to read in a mail client's raw view and buys nothing.
 * @param {string} value
 * @returns {string}
 */
function encodeHeader(value) {
  const text = String(value == null ? "" : value);
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7E]*$/.test(text)) return text;
  return `=?UTF-8?B?${Buffer.from(text, "utf8").toString("base64")}?=`;
}

/**
 * Fold a base64 payload to 76-character lines, as RFC 2045 requires.
 * @param {string} b64
 * @returns {string}
 */
function foldBase64(b64) {
  return (b64.match(/.{1,76}/g) || []).join(CRLF);
}

function base64Part(text) {
  return foldBase64(Buffer.from(String(text == null ? "" : text), "utf8").toString("base64"));
}

/**
 * Compose a multipart/alternative message.
 *
 * Both parts are base64 encoded rather than sent as 8-bit or
 * quoted-printable: the copy carries a trademark sign and names with
 * diacritics, and base64 removes any question about how a relay treats them.
 *
 * @param {object} opts
 * @param {string} opts.from      e.g. "Jesse Strauss <jesse@yfgc.ai>"
 * @param {string} [opts.to]      omit entirely when no address was found
 * @param {string} opts.subject
 * @param {string} opts.text      plain-text body
 * @param {string} opts.html      HTML body
 * @param {string} [opts.replyTo]
 * @returns {string} base64url-encoded message, ready for the Gmail API
 */
function buildRawMessage({ from, to, subject, text, html, replyTo }) {
  if (!from) throw new TypeError("buildRawMessage requires a from address");

  const boundary = `yfgc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

  const headers = [`From: ${encodeHeader(from)}`];
  // A draft with no recipient is legitimate here: research could not find an
  // address and Jesse fills it in. An empty "To:" header would be worse than
  // none, so the header is dropped rather than emitted blank.
  if (to) headers.push(`To: ${encodeHeader(to)}`);
  if (replyTo) headers.push(`Reply-To: ${encodeHeader(replyTo)}`);
  headers.push(`Subject: ${encodeHeader(subject || "")}`);
  headers.push("MIME-Version: 1.0");
  headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);

  const message = [
    headers.join(CRLF),
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64Part(text),
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64Part(html),
    "",
    `--${boundary}--`,
    "",
  ].join(CRLF);

  return Buffer.from(message, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Turn the plain-text body into HTML, linking the site properly.
 * Gmail rewrites the href to its own redirect on save, which cannot be
 * prevented through the API, but an explicit anchor keeps the visible link
 * text as the domain instead of exposing the redirect.
 * @param {string} text
 * @param {string} site bare domain, e.g. "yfgc.ai"
 * @returns {string}
 */
function textToHtml(text, site) {
  const escaped = String(text == null ? "" : text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const linked = site
    ? escaped.replace(
        new RegExp(`\\b${site.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"),
        `<a href="https://${site}">${site}</a>`
      )
    : escaped;

  return `<div>${linked.replace(/\n/g, "<br>")}</div>`;
}

/**
 * Create the draft in Gmail.
 * @param {object} authClient google OAuth2 client
 * @param {object} opts same shape as buildRawMessage
 * @returns {Promise<{id: string, messageId: string}>}
 */
async function createDraft(authClient, opts) {
  // Required lazily so the pure builders above stay testable without the
  // Google SDK installed, which keeps the test suite dependency-free.
  const { google } = require("googleapis");
  const gmail = google.gmail({ version: "v1", auth: authClient });
  const res = await gmail.users.drafts.create({
    userId: "me",
    requestBody: { message: { raw: buildRawMessage(opts) } },
  });
  return {
    id: res.data.id,
    messageId: res.data.message && res.data.message.id,
  };
}

module.exports = { buildRawMessage, textToHtml, encodeHeader, createDraft };
