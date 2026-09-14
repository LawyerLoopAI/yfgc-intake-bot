// Logs every outreach draft to a Google Sheet in Jesse's Drive.
//
// SCOPE NOTE, and it is the reason this module creates the sheet rather than
// pointing at one made by hand: the OAuth token carries drive.file, which is
// per-file access to files THIS app created or opened. A spreadsheet created
// by any other client, including a Claude Drive connector or Jesse clicking
// "New" in Drive, is invisible to this app and cannot be written to. So the
// bot finds its own sheet by name inside the target folder, and creates it the
// first time. Google accepts drive.file for the Sheets API on app-created
// files, so no broader scope is needed.

const SHEET_NAME = "TechNYC Outreach Log";
const TAB = "Outreach";

const HEADERS = [
  "Date added",
  "Digest",
  "Company",
  "Amount",
  "Round",
  "Contact",
  "Title",
  "Email address",
  "Confidence",
  "Found via",
  "Status",
  "Draft",
  "Website",
];

// Company plus digest date identifies a row. The same company can legitimately
// appear again in a later digest (a new round), and that deserves its own row.
function rowKey(company, digest) {
  return `${String(company || "").trim().toLowerCase()}|${String(digest || "").trim().toLowerCase()}`;
}

/**
 * Turn one drafted result into a sheet row.
 * @param {object} entry from outcome.drafted
 * @param {string} digest the digest subject date, e.g. "September 14"
 * @param {string} today ISO date string
 */
function buildRow(entry, digest, today) {
  const { row, contact, draftId } = entry;
  return [
    today,
    digest || "",
    row.company || "",
    row.amountText || "",
    row.round || "",
    contact.fullName || "",
    contact.title || "",
    contact.email || "",
    contact.emailConfidence || "",
    contact.emailSource || "",
    // Nothing is sent by this pipeline. Saying "Sent" here would be a lie that
    // later becomes hard to unpick, so the sheet records what is true now and
    // leaves room for a send step to update it.
    contact.email ? "Draft ready" : "Draft, needs an address",
    draftId ? `https://mail.google.com/mail/u/0/#drafts?compose=${draftId}` : "",
    row.website || "",
  ];
}

/**
 * Decide what to write, given what is already in the sheet.
 *
 * A company whose draft had no address gets revisited on a later run, and when
 * an address finally turns up the existing row must be corrected rather than
 * duplicated. So this returns updates keyed by row number alongside plain
 * appends.
 *
 * @param {string[][]} existing all sheet values including the header row
 * @param {string[][]} incoming rows from buildRow
 * @returns {{updates: Array<{rowNumber: number, values: string[]}>, appends: string[][]}}
 */
function planWrites(existing, incoming) {
  const seen = new Map();
  const rows = existing || [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    // Columns: 0 date, 1 digest, 2 company.
    const key = rowKey(r[2], r[1]);
    if (key !== "|") seen.set(key, i + 1); // 1-indexed for A1 notation
  }

  const updates = [];
  const appends = [];
  for (const values of incoming) {
    const key = rowKey(values[2], values[1]);
    const at = seen.get(key);
    if (at) updates.push({ rowNumber: at, values });
    else appends.push(values);
  }
  return { updates, appends };
}

function columnLetter(n) {
  let s = "";
  let v = n;
  while (v > 0) {
    const rem = (v - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    v = Math.floor((v - 1) / 26);
  }
  return s;
}

const LAST_COLUMN = columnLetter(HEADERS.length);

/**
 * Find this app's log sheet inside a folder, creating it on first use.
 * @returns {Promise<{spreadsheetId: string, url: string, created: boolean}>}
 */
async function ensureSheet(authClient, folderId) {
  const { google } = require("googleapis");
  const drive = google.drive({ version: "v3", auth: authClient });
  const sheets = google.sheets({ version: "v4", auth: authClient });

  // drive.file means this listing only ever returns files this app made, which
  // is exactly the scoping we want: it cannot stumble onto an unrelated sheet.
  const found = await drive.files.list({
    q: `name='${SHEET_NAME}' and '${folderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
    fields: "files(id,name,webViewLink)",
    pageSize: 5,
  });

  const hit = (found.data.files || [])[0];
  if (hit) {
    return {
      spreadsheetId: hit.id,
      url: hit.webViewLink || `https://docs.google.com/spreadsheets/d/${hit.id}`,
      created: false,
    };
  }

  const file = await drive.files.create({
    requestBody: {
      name: SHEET_NAME,
      mimeType: "application/vnd.google-apps.spreadsheet",
      parents: [folderId],
    },
    fields: "id,webViewLink",
  });
  const spreadsheetId = file.data.id;

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const firstSheet = meta.data.sheets[0].properties;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        { updateSheetProperties: { properties: { sheetId: firstSheet.sheetId, title: TAB, gridProperties: { frozenRowCount: 1 } }, fields: "title,gridProperties.frozenRowCount" } },
        { repeatCell: { range: { sheetId: firstSheet.sheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: "userEnteredFormat.textFormat.bold" } },
      ],
    },
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${TAB}!A1:${LAST_COLUMN}1`,
    valueInputOption: "RAW",
    requestBody: { values: [HEADERS] },
  });

  return {
    spreadsheetId,
    url: file.data.webViewLink || `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
    created: true,
  };
}

/**
 * Write the day's rows, updating any that already exist.
 * @returns {Promise<{added: number, updated: number, url: string}>}
 */
async function recordRuns(authClient, folderId, incoming) {
  if (!incoming.length) return { added: 0, updated: 0, url: null };

  const { google } = require("googleapis");
  const sheets = google.sheets({ version: "v4", auth: authClient });
  const { spreadsheetId, url } = await ensureSheet(authClient, folderId);

  const current = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${TAB}!A:${LAST_COLUMN}`,
  });

  const { updates, appends } = planWrites(current.data.values || [], incoming);

  for (const u of updates) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${TAB}!A${u.rowNumber}:${LAST_COLUMN}${u.rowNumber}`,
      valueInputOption: "RAW",
      requestBody: { values: [u.values] },
    });
  }

  if (appends.length) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${TAB}!A:${LAST_COLUMN}`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: appends },
    });
  }

  return { added: appends.length, updated: updates.length, url };
}

module.exports = { ensureSheet, recordRuns, buildRow, planWrites, rowKey, columnLetter, HEADERS, SHEET_NAME, TAB };
