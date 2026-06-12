const { google } = require("googleapis");
const { Readable } = require("stream");

function bufferToStream(buffer) {
  return Readable.from(buffer);
}

async function saveBriefToDrive(authClient, briefMarkdown, parentFolderId, filename) {
  const drive = google.drive({ version: "v3", auth: authClient });

  const buffer = Buffer.from(briefMarkdown || "", "utf8");

  const res = await drive.files.create({
    requestBody: {
      name: filename || "intake-brief.md",
      parents: [parentFolderId],
      mimeType: "text/markdown",
    },
    media: {
      mimeType: "text/markdown",
      body: bufferToStream(buffer),
    },
    fields: "id, name, webViewLink",
  });

  return res.data.webViewLink;
}

module.exports = {
  saveBriefToDrive,
};
