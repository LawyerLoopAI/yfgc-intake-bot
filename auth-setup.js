#!/usr/bin/env node
// One-time local bootstrap. Generates token.json so the rest of the bot can run.
//
// Usage:
//   node auth-setup.js
//
// 1. Prints a Google consent URL.
// 2. You open it in a browser, approve the scopes, get redirected to your
//    GOOGLE_REDIRECT_URI.
// 3. Copy the `code=` value from the redirect URL and paste it into this prompt.
// 4. token.json is written next to this file.

require("dotenv").config();

const readline = require("readline");
const { generateAuthUrl, exchangeCodeForToken } = require("./gmail/auth");

function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  let url;
  try {
    url = generateAuthUrl();
  } catch (err) {
    console.error("Could not build the consent URL:", err.message);
    process.exit(1);
  }

  console.log("");
  console.log("Step 1. Open this URL in a browser and approve access:");
  console.log("");
  console.log(url);
  console.log("");
  console.log(
    "Step 2. After approving, Google will redirect you to your GOOGLE_REDIRECT_URI."
  );
  console.log(
    "        The URL will contain `code=<long string>`. Copy that code value only."
  );
  console.log("");

  const code = (await prompt("Paste the code here: ")).trim();
  if (!code) {
    console.error("No code provided. Aborting.");
    process.exit(1);
  }

  try {
    await exchangeCodeForToken(code);
    console.log("Authentication successful. token.json written.");
  } catch (err) {
    console.error("Token exchange failed:", err.message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("auth-setup failed:", err.message);
  process.exit(1);
});
