// Shows what a real run produces, without touching the network.
//
//   node technyc/dry-run.js
//
// Everything here is the production code path: the real digest fixture, the
// real parser, the real copy, the real summary builder, the real MIME builder.
// Only the two network calls are stubbed, the Claude research call and the
// company-site sweep, because neither can run from a sandbox.
//
// The contact names and titles below are the ones actually researched for the
// September 10 digest. The ADDRESSES ARE ILLUSTRATIVE: they show what each
// confidence level looks like in the summary, and are not real addresses.

const fs = require("fs");
const path = require("path");
const { parseFundingSection } = require("./parseFunding");
const { buildOutreachEmail, LINKS, SITE } = require("./emailTemplate");
const { buildSummary } = require("./summary");
const { buildRawMessage, textToHtml } = require("./gmailDraft");

const FROM = "Jesse Strauss <jesse@yfgc.ai>";

// One per confidence level, so every branch of the summary is visible.
const STUB_CONTACTS = {
  Cymphony: {
    fullName: "Shy Dekel", firstName: "Shy", title: "CEO and founder", isCeo: true,
    otherLeaders: ["Idan Berkovits, co-founder", "Edi Gotlieb, co-founder"],
    email: "shy.dekel@cymphony.io", emailConfidence: "pattern",
    sources: ["https://techcrunch.com/2026/09/09/sequoia-doubles-down-on-cymphony"],
    notes: "Constructed as first.last from the pattern at cymphony.io.", errors: [],
  },
  Inspiren: {
    fullName: "Alex Hejnosz", firstName: "Alex", title: "Chief Executive Officer", isCeo: true,
    otherLeaders: ["Michael Wang, founder and Chief Clinical Officer"],
    email: "ahejnosz@inspiren.com", emailConfidence: "verified",
    sources: ["https://www.crunchbase.com/person/alex-hejnosz", "https://craft.co/inspiren/executives"],
    notes: "", errors: [],
  },
  Luminary: {
    fullName: "David Barnard", firstName: "David", title: "CEO and co-founder", isCeo: true,
    otherLeaders: ["Joe Lonsdale, Chair", "Dave St Geme, co-founder"],
    email: "press@withluminary.com", emailConfidence: "role",
    sources: ["https://withluminary.com/resources/luminary-raises-series-a"],
    notes: "Shared inbox, not the person directly.", errors: [],
  },
  Sequen: {
    fullName: "Zoe Weil", firstName: "Zoe", title: "CEO and founder", isCeo: true,
    otherLeaders: [], email: null, emailConfidence: null,
    sources: ["https://www.prysmcapital.com/news/exclusive-sequen-raises-90-million-for-real-time-ranking"],
    notes: "No address published on the site and none in the press coverage.", errors: [],
  },
  Type: {
    fullName: null, firstName: null, title: null, isCeo: false, otherLeaders: [],
    email: null, emailConfidence: null, sources: [],
    notes: "Founders previously built Halp, but no source names them. The digest links type.ai while the product blog is at type.com, so even the entity is uncertain.",
    errors: [],
  },
};

const body = fs.readFileSync(path.join(__dirname, "fixtures", "2026-09-10.txt"), "utf8");
const rows = parseFundingSection(body);

const outcome = { digests: [{ subject: "Tech:NYC Digest: September 10", companies: rows.length }], drafted: [], skipped: [], failed: [] };

const drafts = [];
for (const row of rows) {
  const contact = STUB_CONTACTS[row.company];
  const email = buildOutreachEmail({ ...row, contactFirstName: contact.firstName });
  const raw = buildRawMessage({
    from: FROM,
    to: contact.email || undefined,
    subject: email.subject,
    text: email.body,
    html: textToHtml(email.body, LINKS),
  });
  drafts.push({ company: row.company, to: contact.email, subject: email.subject, raw });
  outcome.drafted.push({ row, contact, draftId: `r_dryrun_${row.company.toLowerCase()}` });
}

const line = (c) => console.log("\n" + "=".repeat(72) + "\n" + c + "\n" + "=".repeat(72));

line("1. PARSED FROM THE DIGEST");
for (const r of rows) {
  console.log(`  ${r.company.padEnd(10)} ${(r.amountText || "?").padEnd(13)} ${(r.round || "round not stated").padEnd(18)} ${r.website}`);
}

line("2. DRAFTS CREATED (headers only)");
for (const d of drafts) {
  const headers = Buffer.from(d.raw.replace(/-/g, "+").replace(/_/g, "/"), "base64")
    .toString("utf8")
    .split("\r\n\r\n")[0];
  console.log(headers.split("\r\n").filter((h) => /^(From|To|Subject):/.test(h)).map((h) => "  " + h).join("\n"));
  if (!d.to) console.log("  (no To: header, address not found)");
  console.log();
}

line("3. ONE DRAFT IN FULL");
const sample = drafts.find((d) => d.company === "Inspiren");
console.log(
  Buffer.from(sample.raw.replace(/-/g, "+").replace(/_/g, "/"), "base64")
    .toString("utf8")
    .replace(/^(Content-Transfer-Encoding: base64\r\n\r\n)([A-Za-z0-9+/=\r\n]+)/gm, (_, h, b) =>
      h + Buffer.from(b.replace(/\r\n/g, ""), "base64").toString("utf8")
    )
);

line("4. THE SUMMARY EMAIL YOU RECEIVE");
console.log(`To: jesse@yfgc.ai`);
console.log(`Subject: TechNYC outreach: ${outcome.drafted.length} drafts ready (September 10)\n`);
console.log(buildSummary(outcome));

console.log("\nAddresses above are illustrative, chosen to show each confidence level. A real run resolves them from the live web.");
