const { google } = require("googleapis");
const { Readable } = require("stream");

function bufferToStream(buffer) {
  return Readable.from(buffer);
}

async function saveBriefToDrive(authClient, briefMarkdown, subfolderDriveId) {
  const drive = google.drive({ version: "v3", auth: authClient });

  const buffer = Buffer.from(briefMarkdown || "", "utf8");

  const res = await drive.files.create({
    requestBody: {
      name: "intake-brief.md",
      parents: [subfolderDriveId],
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
