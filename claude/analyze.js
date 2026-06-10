require("dotenv").config();

const Anthropic = require("@anthropic-ai/sdk");
const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");
const { buildSystemPrompt } = require("./prompts");

const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 4000;

// Anthropic caps inline PDF documents at 100 pages. Anything larger
// has to be sent as extracted text instead.
const PDF_INLINE_PAGE_LIMIT = 100;

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set in env.");
  }
  return new Anthropic({ apiKey });
}

async function buildContentArray(parsedEmail) {
  const content = [];

  const meta = `Email from: ${parsedEmail.from || "(unknown)"}\nDate: ${
    parsedEmail.date || "(no date)"
  }\nSubject: ${parsedEmail.subject || "(no subject)"}\n\nBody:\n${
    parsedEmail.body || "(empty body)"
  }`;

  content.push({ type: "text", text: meta });

  for (const att of parsedEmail.attachments || []) {
    const filename = att.filename || "(unnamed)";
    const mimeType = att.mimeType || "application/octet-stream";
    const buffer = Buffer.isBuffer(att.data)
      ? att.data
      : Buffer.from(att.data || "");

    if (mimeType === "application/pdf") {
      // First try to count pages so we can decide between inline document
      // (preserves layout, lets Claude see scans/images) and extracted text
      // (handles PDFs over the 100-page inline limit).
      let pdfMeta = null;
      try {
        pdfMeta = await pdfParse(buffer);
      } catch (err) {
        console.error(
          `  PDF parse failed for ${filename}:`,
          err.message
        );
      }

      if (pdfMeta && pdfMeta.numpages > PDF_INLINE_PAGE_LIMIT) {
        // Too big for inline — send extracted text instead.
        console.log(
          `  PDF ${filename} has ${pdfMeta.numpages} pages, exceeds inline limit; sending extracted text`
        );
        content.push({
          type: "text",
          text:
            `[PDF: ${filename}, ${pdfMeta.numpages} pages — too large for inline ` +
            `Anthropic document block (100-page cap), so the extracted text is ` +
            `below. Jesse can open the full PDF directly from the Drive folder.]` +
            `\n\n${pdfMeta.text || "(no text extracted)"}`,
        });
      } else {
        // Within limit (or page count unknown) — send as inline document.
        content.push({
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: buffer.toString("base64"),
          },
        });
      }
    } else if (mimeType === DOCX_MIME) {
      try {
        const { value: extracted } = await mammoth.extractRawText({ buffer });
        content.push({
          type: "text",
          text: `... [DOCX: ${filename}]\n\n${extracted || "(no text extracted)"}`,
        });
      } catch (err) {
        console.error(
          `Failed to extract DOCX ${filename}:`,
          err.message
        );
        content.push({
          type: "text",
          text: `[Attachment ${filename} (${mimeType}) could not be parsed: ${err.message}]`,
        });
      }
    } else {
      content.push({
        type: "text",
        text: `[Attachment ${filename} (${mimeType}) was included but could not be parsed by the triage pipeline. Jesse should review it directly in the Drive folder.]`,
      });
    }
  }

  return content;
}

async function analyzeEmail(parsedEmail, client) {
  const anthropic = getClient();
  const system = buildSystemPrompt(client);
  const content = await buildContentArray(parsedEmail);

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system,
    messages: [
      {
        role: "user",
        content,
      },
    ],
  });

  const textBlocks = Array.isArray(response.content)
    ? response.content
        .filter((b) => b && b.type === "text" && typeof b.text === "string")
        .map((b) => b.text)
    : [];

  return textBlocks.join("\n").trim();
}

module.exports = {
  analyzeEmail,
};