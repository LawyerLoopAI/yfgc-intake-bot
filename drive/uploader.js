const { google } = require("googleapis");
const { Readable } = require("stream");

// Replace characters that are problematic in file/folder names on most OSes
// and in Google Drive listings.
function sanitizeName(name) {
  if (!name) return "";
  return name
    .replace(/[\\/:*?"<>|\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(str, max) {
  if (!str) return "";
  if (str.length <= max) return str;
  return str.slice(0, max).trim();
}

function formatDate(rawDate) {
  // Prefer YYYY-MM-DD in local-ish form. Fall back to today if header is unparseable.
  if (rawDate) {
    const d = new Date(rawDate);
    if (!isNaN(d.getTime())) {
      // en-CA happens to render as YYYY-MM-DD.
      try {
        return d.toLocaleDateString("en-CA");
      } catch (_) {
        return d.toISOString().slice(0, 10);
      }
    }
  }
  return new Date().toISOString().slice(0, 10);
}

function bufferToStream(buffer) {
  return Readable.from(buffer);
}

async function createSubfolder(drive, parentFolderId, name) {
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentFolderId],
    },
    fields: "id, webViewLink",
  });
  return res.data;
}

async function uploadFile(drive, subfolderId, filename, mimeType, buffer) {
  const safeName = sanitizeName(filename) || "unnamed";
  const res = await drive.files.create({
    requestBody: {
      name: safeName,
      parents: [subfolderId],
    },
    media: {
      mimeType: mimeType || "application/octet-stream",
      body: bufferToStream(buffer),
    },
    fields: "id, name, webViewLink",
  });
  return res.data;
}

async function uploadEmailToDrive(authClient, parsedEmail, driveFolderId) {
  const drive = google.drive({ version: "v3", auth: authClient });

  const datePrefix = formatDate(parsedEmail.date);
  const subjectClean = sanitizeName(parsedEmail.subject || "(no subject)");
  const rawFolderName = `${datePrefix} — ${subjectClean}`;
  const folderName = truncate(rawFolderName, 100);

  const subfolder = await createSubfolder(drive, driveFolderId, folderName);
  const subfolderId = subfolder.id;
  const subfolderUrl = subfolder.webViewLink;

  const uploadedFiles = [];

  // Upload the email body as a plain-text file.
  try {
    const bodyBuffer = Buffer.from(parsedEmail.body || "", "utf8");
    const bodyFile = await uploadFile(
      drive,
      subfolderId,
      "email-body.txt",
      "text/plain",
      bodyBuffer
    );
    uploadedFiles.push({
      name: bodyFile.name,
      driveId: bodyFile.id,
      webViewLink: bodyFile.webViewLink,
    });
  } catch (err) {
    console.error("Failed to upload email-body.txt:", err.message);
  }

  // Upload each attachment.
  for (const att of parsedEmail.attachments || []) {
    try {
      const data = Buffer.isBuffer(att.data)
        ? att.data
        : Buffer.from(att.data || "");
      const uploaded = await uploadFile(
        drive,
        subfolderId,
        att.filename,
        att.mimeType,
        data
      );
      uploadedFiles.push({
        name: uploaded.name,
        driveId: uploaded.id,
        webViewLink: uploaded.webViewLink,
      });
    } catch (err) {
      console.error(
        `Failed to upload attachment ${att.filename}:`,
        err.message
      );
    }
  }

  return {
    subfolderId,
    subfolderUrl,
    uploadedFiles,
  };
}

module.exports = {
  uploadEmailToDrive,
};
