// =============================================================================
// WARNING: ONE-TIME OAUTH BOOTSTRAP HELPER FOR DEPLOYED ENVIRONMENT.
//
// Use this endpoint only if you need to run the Google OAuth consent flow
// against the deployed Vercel URL instead of localhost. After exchanging the
// auth code, it prints the resulting token JSON as a base64 string for you to
// copy into the GOOGLE_TOKEN_JSON environment variable.
//
// DO NOT call this endpoint routinely.
// DO NOT leave this endpoint accessible in long-term production — delete or
// gate it behind an auth check before going live.
// This handler does NOT persist anything to disk because Vercel's filesystem
// is read-only at runtime.
// =============================================================================

require("dotenv").config();

const { google } = require("googleapis");

function buildOAuthClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } =
    process.env;

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

module.exports = async (req, res) => {
  try {
    const code =
      (req && req.query && req.query.code) ||
      (req && req.body && req.body.code);

    if (!code) {
      if (res && typeof res.status === "function") {
        return res
          .status(400)
          .json({ ok: false, error: "Missing `code` query parameter." });
      }
      return { ok: false, error: "Missing code" };
    }

    const oAuth2Client = buildOAuthClient();
    const { tokens } = await oAuth2Client.getToken(code);

    const tokenJson = JSON.stringify(tokens);
    const tokenB64 = Buffer.from(tokenJson, "utf8").toString("base64");

    const message =
      "OAuth exchange succeeded. Copy the base64 string below into the GOOGLE_TOKEN_JSON environment variable in Vercel, then redeploy.";

    if (res && typeof res.status === "function") {
      return res.status(200).json({
        ok: true,
        message,
        google_token_json_base64: tokenB64,
      });
    }

    return {
      ok: true,
      message,
      google_token_json_base64: tokenB64,
    };
  } catch (err) {
    console.error("auth-callback failed:", err.message);
    if (res && typeof res.status === "function") {
      return res.status(500).json({ ok: false, error: err.message });
    }
    return { ok: false, error: err.message };
  }
};
