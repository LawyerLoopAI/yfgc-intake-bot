require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/drive.file",
];

const TOKEN_PATH = path.join(__dirname, "..", "token.json");

function buildOAuthClient() {
  const {
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI,
  } = process.env;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    throw new Error(
      "Missing one of GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI in env."
    );
  }

  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );
}

async function getAuthClient() {
  const oAuth2Client = buildOAuthClient();

  let usedEnvToken = false;
  let tokens = null;

  if (process.env.GOOGLE_TOKEN_JSON) {
    try {
      const raw = Buffer.from(
        process.env.GOOGLE_TOKEN_JSON,
        "base64"
      ).toString("utf8");
      tokens = JSON.parse(raw);
      usedEnvToken = true;
    } catch (err) {
      throw new Error(
        "GOOGLE_TOKEN_JSON is set but could not be base64-decoded as JSON."
      );
    }
  } else if (fs.existsSync(TOKEN_PATH)) {
    try {
      tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
    } catch (err) {
      throw new Error(
        "token.json exists but could not be parsed. Re-run `node auth-setup.js`."
      );
    }
  } else {
    throw new Error(
      "No token found. Run `node auth-setup.js` to authenticate."
    );
  }

  oAuth2Client.setCredentials(tokens);

  // Persist refreshed tokens back to disk when running locally.
  oAuth2Client.on("tokens", (newTokens) => {
    if (usedEnvToken) return; // Vercel filesystem is read-only and ephemeral.

    try {
      const merged = { ...tokens, ...newTokens };
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2), "utf8");
      tokens = merged;
    } catch (err) {
      console.error("Failed to persist refreshed token:", err.message);
    }
  });

  return oAuth2Client;
}

function generateAuthUrl() {
  const oAuth2Client = buildOAuthClient();
  return oAuth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });
}

async function exchangeCodeForToken(code) {
  const oAuth2Client = buildOAuthClient();
  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);

  try {
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to write token.json:", err.message);
  }

  return tokens;
}

module.exports = {
  SCOPES,
  getAuthClient,
  generateAuthUrl,
  exchangeCodeForToken,
};
