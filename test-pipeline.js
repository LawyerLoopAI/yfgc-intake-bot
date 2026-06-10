/**
 * test-pipeline.js — smoke test for yfgc-intake-bot.
 *
 * Two modes:
 *
 *   MOCK=1 node test-pipeline.js
 *     Runs entirely offline. Verifies that every module loads, every
 *     export is a function with the expected shape, and the pure
 *     functions (buildSystemPrompt, buildBrief) produce the expected
 *     output structure for a fake email. NO network, NO credentials,
 *     NO Anthropic charges. Use this to confirm a fresh `npm install`
 *     gave you a working tree.
 *
 *   node test-pipeline.js
 *     Same as above, plus a live Anthropic call on the fake email
 *     content. Needs ANTHROPIC_API_KEY in .env. Charges your API
 *     account a few cents. Use this to confirm Claude integration
 *     works before deploying.
 *
 * Neither mode hits Gmail or Drive — those need real auth and would
 * write real folders/files. To test the Gmail/Drive pieces, run
 * api/process.js against a real unread email from Roger after
 * configuring .env and token.json.
 */

require("dotenv").config();

const path = require("path");

const MOCK = process.env.MOCK === "1";

// ----- Fake fixtures ------------------------------------------------

const fakeEmail = {
  subject: "Follow-up on Q3 vendor agreement",
  from: "Roger <roger@12zeros.vc>",
  date: "Mon, 09 Jun 2026 14:32:00 +0000",
  body:
    "Jesse,\n\nQuick one. The vendor sent over their proposed redlines on the MSA. " +
    "I think two of them are deal-breakers (sections 7.2 and 11) but I'd like your " +
    "read. Also, can we get the IP-assignment language tightened before they sign?\n\n" +
    "Need to close this week. Thanks.\n\nRoger",
  attachments: [],
};

const fakeClient = {
  id: "12zero",
  senderEmail: "roger@12zeros.vc",
  driveFolderId: "fake-folder-id",
  clientName: "12 Zero",
  matterType: "venture / general counsel",
};

const fakeDriveResult = {
  subfolderId: "fake-subfolder-id",
  subfolderUrl: "https://drive.google.com/drive/folders/fake-subfolder-id",
  uploadedFiles: [
    { name: "email-body.txt", driveId: "fake-body-id", webViewLink: "..." },
  ],
};

const fakeClaudeOutput = `**Matter Summary**
Roger needs a same-week read on vendor redlines to the MSA, specifically sections 7.2 and 11, and wants tightened IP-assignment language before counter-signature.

**Recommended Next Steps**
1. Pull the current MSA and the redline document from the Drive folder.
2. Review sections 7.2 and 11 against 12 Zero's standard positions.
3. Draft tightened IP-assignment language for the counter.
4. Send Roger a one-page summary of the two deal-breaker issues plus the redline proposal within 48 hours.

**Draft Client Response Email**
Roger,

Got it. I will review the redlines on sections 7.2 and 11 today and have a one-page read with my proposed counter language to you by Wednesday morning. I will also tighten the IP-assignment language for the same delivery.

Let me know if anything changes on your end before then.

Jesse`;

// ----- Helpers ------------------------------------------------------

let passed = 0;
let failed = 0;

function check(label, fn) {
  try {
    const result = fn();
    if (result === false) throw new Error("returned false");
    console.log(`  ✓ ${label}`);
    passed += 1;
  } catch (err) {
    console.log(`  ✗ ${label}`);
    console.log(`      ${err.message}`);
    failed += 1;
  }
}

function expect(value, predicate, message) {
  if (!predicate(value)) throw new Error(message || "predicate failed");
}

// ----- Tests --------------------------------------------------------

async function main() {
  console.log("");
  console.log(`yfgc-intake-bot smoke test (${MOCK ? "MOCK mode" : "live Anthropic mode"})`);
  console.log("");

  // 1. Module loading
  console.log("1. Module loading");
  let auth, watcher, parser, uploader, prompts, analyze, briefBuilder, driveDeposit, config;
  check("gmail/auth.js loads", () => {
    auth = require("./gmail/auth.js");
    expect(auth.getAuthClient, (v) => typeof v === "function", "getAuthClient is not a function");
    expect(auth.generateAuthUrl, (v) => typeof v === "function", "generateAuthUrl is not a function");
    expect(auth.exchangeCodeForToken, (v) => typeof v === "function", "exchangeCodeForToken is not a function");
  });
  check("gmail/watcher.js loads", () => {
    watcher = require("./gmail/watcher.js");
    expect(watcher.getUnprocessedEmails, (v) => typeof v === "function", "getUnprocessedEmails is not a function");
    expect(watcher.markProcessed, (v) => typeof v === "function", "markProcessed is not a function");
  });
  check("gmail/parser.js loads", () => {
    parser = require("./gmail/parser.js");
    expect(parser.parseMessage, (v) => typeof v === "function", "parseMessage is not a function");
  });
  check("drive/uploader.js loads", () => {
    uploader = require("./drive/uploader.js");
    expect(uploader.uploadEmailToDrive, (v) => typeof v === "function", "uploadEmailToDrive is not a function");
  });
  check("claude/prompts.js loads", () => {
    prompts = require("./claude/prompts.js");
    expect(prompts.buildSystemPrompt, (v) => typeof v === "function", "buildSystemPrompt is not a function");
  });
  check("claude/analyze.js loads", () => {
    analyze = require("./claude/analyze.js");
    expect(analyze.analyzeEmail, (v) => typeof v === "function", "analyzeEmail is not a function");
  });
  check("output/briefBuilder.js loads", () => {
    briefBuilder = require("./output/briefBuilder.js");
    expect(briefBuilder.buildBrief, (v) => typeof v === "function", "buildBrief is not a function");
  });
  check("output/driveDeposit.js loads", () => {
    driveDeposit = require("./output/driveDeposit.js");
    expect(driveDeposit.saveBriefToDrive, (v) => typeof v === "function", "saveBriefToDrive is not a function");
  });
  check("config.js loads with at least one client", () => {
    config = require("./config.js");
    expect(config, Array.isArray, "config is not an array");
    expect(config.length, (v) => v >= 1, "config has no clients");
    expect(config[0], (c) => c.senderEmail && c.driveFolderId && c.clientName, "first client missing required fields");
  });

  // 2. Pure-function output shape
  console.log("");
  console.log("2. Pure-function output");

  let systemPrompt;
  check("buildSystemPrompt returns a non-empty string", () => {
    systemPrompt = prompts.buildSystemPrompt(fakeClient);
    expect(systemPrompt, (v) => typeof v === "string" && v.length > 100, "system prompt looks empty");
  });
  check("system prompt names the three required sections", () => {
    expect(systemPrompt, (v) => v.includes("Matter Summary"), "missing 'Matter Summary'");
    expect(systemPrompt, (v) => v.includes("Recommended Next Steps"), "missing 'Recommended Next Steps'");
    expect(systemPrompt, (v) => v.includes("Draft Client Response Email"), "missing 'Draft Client Response Email'");
  });
  check("system prompt bans em dashes in the draft email", () => {
    expect(systemPrompt, (v) => /em.?dash/i.test(v), "no mention of em dashes / em-dashes");
  });
  check("system prompt embeds the client name", () => {
    expect(systemPrompt, (v) => v.includes(fakeClient.clientName), "client name missing");
  });

  let brief;
  check("buildBrief renders a valid markdown brief", () => {
    brief = briefBuilder.buildBrief(fakeEmail, fakeClaudeOutput, fakeDriveResult, fakeClient);
    expect(brief, (v) => typeof v === "string" && v.includes("# Client Intake Brief"), "brief title missing");
    expect(brief, (v) => v.includes(fakeEmail.subject), "subject missing");
    expect(brief, (v) => v.includes(fakeClient.clientName), "client name missing");
    expect(brief, (v) => v.includes(fakeDriveResult.subfolderUrl), "drive folder URL missing");
    expect(brief, (v) => v.includes(fakeClaudeOutput.split("\n")[0]), "claude analysis missing");
    expect(brief, (v) => v.includes("Attorney review required"), "review caveat missing");
  });

  // 3. Optional live Anthropic call
  if (!MOCK) {
    console.log("");
    console.log("3. Live Anthropic call (claude-sonnet-4-20250514)");
    if (!process.env.ANTHROPIC_API_KEY) {
      console.log("  ✗ ANTHROPIC_API_KEY not set — skipping live call");
      console.log("      Set MOCK=1 or add ANTHROPIC_API_KEY to .env");
      failed += 1;
    } else {
      try {
        process.stdout.write("  → calling Claude... ");
        const t0 = Date.now();
        const response = await analyze.analyzeEmail(fakeEmail, fakeClient);
        const ms = Date.now() - t0;
        console.log(`done (${ms} ms)`);
        check("response is a non-empty string", () => {
          expect(response, (v) => typeof v === "string" && v.length > 100, "response too short or wrong type");
        });
        check("response contains all three required sections", () => {
          expect(response, (v) => /matter summary/i.test(v), "missing Matter Summary heading");
          expect(response, (v) => /recommended next steps/i.test(v), "missing Recommended Next Steps heading");
          expect(response, (v) => /draft client response/i.test(v), "missing Draft Client Response heading");
        });
        check("draft email contains no em dashes", () => {
          // Look at just the email section
          const idx = response.toLowerCase().indexOf("draft client response");
          const draft = idx >= 0 ? response.slice(idx) : response;
          expect(draft, (v) => !v.includes("—") && !v.includes("--"), "draft email contains an em dash or double-hyphen");
        });
      } catch (err) {
        console.log(`  ✗ live Anthropic call failed: ${err.message}`);
        failed += 1;
      }
    }
  } else {
    console.log("");
    console.log("3. Live Anthropic call — SKIPPED (MOCK=1)");
  }

  // ----- Summary --------------------------------------------------
  console.log("");
  console.log(`Result: ${passed} passed, ${failed} failed`);
  console.log("");
  if (failed === 0) {
    console.log("Smoke test passed. To do a full end-to-end run against real Gmail + Drive:");
    console.log("  1. Make sure .env has ANTHROPIC_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, CRON_SECRET");
    console.log("  2. node auth-setup.js  (one time — generates token.json)");
    console.log("  3. Send a test email to yourself from roger@12zeros.vc");
    console.log("  4. node -e \"require('./api/process.js')({method:'POST',headers:{authorization:'Bearer '+process.env.CRON_SECRET}},{status:c=>({json:o=>console.log(JSON.stringify(o,null,2))})});\"");
    process.exit(0);
  } else {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("");
  console.error("Fatal error during smoke test:");
  console.error(err);
  process.exit(2);
});
