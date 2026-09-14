// Offline checks for the Tech:NYC outreach helpers. No network, no charges.
//   node technyc/test-technyc.js

const fs = require("fs");
const path = require("path");
const { parseFundingSection } = require("./parseFunding");
const { buildOutreachEmail, SIGNATURE, SIGNOFF, SITE, SUBSTANTIATION } = require("./emailTemplate");

let passed = 0;
let failed = 0;

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    console.log(`  FAIL ${label}\n         expected ${e}\n         actual   ${a}`);
  }
}

function ok(label, cond) {
  check(label, !!cond, true);
}

const body = fs.readFileSync(path.join(__dirname, "fixtures", "2026-09-10.txt"), "utf8");
const rows = parseFundingSection(body);

console.log("parseFundingSection");
check("finds exactly the five funded companies", rows.map((r) => r.company), [
  "Cymphony",
  "Inspiren",
  "Luminary",
  "Sequen",
  "Type",
]);
check("ignores bullets outside the New York Funding section", rows.some((r) => r.company === "NotAFundingItem"), false);
check("website", rows[0].website, "https://www.cymphony.io/");
check("description", rows[0].description, "an NYC-based enterprise security company");
check("amount text", rows[0].amountText, "$30 million");
check("amount in dollars", rows[0].amountUsd, 30000000);
check("round is null when the digest does not name one", rows[0].round, null);
check("investors", rows[0].investors, "Sequoia Capital and Fin Atlas Beyond Fund led the round.");
check("lettered round", rows[1].round, "Series C");
check("investors null when none are listed", rows[2].investors, null);
check("wrapped bullet folds into one company", rows[3].company, "Sequen");
check("wrapped bullet keeps its round", rows[3].round, "Series B");
check("valuation", rows[3].valuationText, "$1.44 billion");
check("pre-seed round", rows[4].round, "pre-seed");
check("pre-seed amount", rows[4].amountUsd, 4000000);

console.log("\nparseFundingSection: no section present");
check("returns empty array", parseFundingSection("A Friday digest with no funding section."), []);
check("tolerates empty input", parseFundingSection(""), []);

console.log("\nbuildOutreachEmail");
const withName = buildOutreachEmail({ ...rows[1], contactFirstName: "Michael", contactTitle: "CEO" });
ok("subject names the company", withName.subject.includes("Inspiren"));
ok("greets the contact by first name", withName.body.startsWith("Dear Michael,"));
ok("states the amount", withName.body.includes("$70 million"));
ok("states the round", withName.body.includes("Series C"));
ok("names the investors", withName.body.includes("NewView Capital"));
ok("cites where the news came from", withName.body.includes("Tech:NYC Digest"));
ok("signs off as asked", withName.body.includes(SIGNOFF));
ok("no stale Best regards sign-off", !withName.body.includes("Best regards"));
ok("makes the free consultation offer", withName.body.includes("just reply"));
ok("makes the proposal offer", withName.body.includes("ask and I will send one"));
ok("says both offers are free", withName.body.includes("Two offers, both free"));
ok("carries the positioning claim", withName.body.includes("preeminent fractional GC service"));
ok("names the large firm alternative", withName.body.includes("cost prohibitive"));
ok("names the AI firm alternative", withName.body.includes("black box AI firm"));
ok("points the reader at the site", withName.body.includes(SITE));
ok("interpolates the site rather than printing the placeholder", !withName.body.includes("${SITE}"));
// Jesse asked for this to be short. Keep it honest with a hard ceiling.
const words = withName.body.split(/\s+/).length;
ok(`body stays under 220 words (was ${words})`, words < 220);
ok("carries the full signature block", withName.body.includes(SIGNATURE));
ok("includes the principal office address", withName.body.includes("765 Amsterdam Avenue"));
ok("includes the office telephone number", withName.body.includes("917-541-8428"));
ok("no em dash", !withName.body.includes("—"));
// The June 1, 2026 amendments repealed the old Rule 7.1(f) notation requirement.
ok("no ATTORNEY ADVERTISING notation in the subject", !/attorney advertising/i.test(withName.subject));
ok("no ATTORNEY ADVERTISING notation in the body", !/attorney advertising/i.test(withName.body));
// The old Rule 7.1(e)(3) disclaimer went with the repealed rule.
ok("no stale prior-results disclaimer", !/prior results/i.test(withName.body));

const noName = buildOutreachEmail({ ...rows[0] });
ok("falls back to a neutral greeting", noName.body.startsWith("Hello,"));
ok("omits the round clause when the digest gave none", !/Series/.test(noName.body));
ok("still states the amount", noName.body.includes("$30 million"));

const noInvestors = buildOutreachEmail({ ...rows[2], contactFirstName: "Alex" });
ok("omits investor sentence when none were listed", !/led the round/i.test(noInvestors.body));

// Not a hard failure, because the pipeline works without it. It is a standing
// reminder: new Rule 7.1 still bars a materially misleading communication, and
// "preeminent" is the claim in this template that would need a basis behind it.
console.log("\nsubstantiation file");
if (/^TODO/.test(SUBSTANTIATION.trim())) {
  console.log(
    "  WARN SUBSTANTIATION in technyc/emailTemplate.js is still a TODO.\n" +
      "       The template asserts the service is 'preeminent'. Record the basis\n" +
      "       for that claim before this runs at volume."
  );
} else {
  ok("SUBSTANTIATION is filled in", true);
}

// ---------------------------------------------------------------------------

const {
  findEmail,
  extractEmails,
  inferShape,
  nameParts,
  isRoleAddress,
} = require("./findEmail");

console.log("\nextractEmails");
check(
  "keeps only addresses at the company domain",
  extractEmails(
    'mail <a href="mailto:Alex.Hejnosz@Inspiren.com">here</a>, pr at agency@flackpr.com, press@inspiren.com',
    "inspiren.com"
  ).sort(),
  ["alex.hejnosz@inspiren.com", "press@inspiren.com"]
);
check("counts subdomain mail as the same company", extractEmails("news@mail.acme.com", "acme.com"), ["news@mail.acme.com"]);
check("strips trailing punctuation", extractEmails("write to sam@acme.com.", "acme.com"), ["sam@acme.com"]);
check("empty page", extractEmails("", "acme.com"), []);

console.log("\nnameParts");
check("splits a name", nameParts("Alex Hejnosz"), { first: "alex", last: "hejnosz" });
check("folds accents", nameParts("Zoë Weil"), { first: "zoe", last: "weil" });
check("uses the last token for three-part names", nameParts("David St Geme"), { first: "david", last: "geme" });
check("rejects a single token", nameParts("Cher"), null);

console.log("\nisRoleAddress");
check("press is a role address", isRoleAddress("press@acme.com"), true);
check("a person is not", isRoleAddress("alex.hejnosz@acme.com"), false);

console.log("\ninferShape");
check(
  "infers first.last from two samples",
  inferShape(["jane.doe@acme.com", "sam.smith@acme.com"]).shape,
  "first.last"
);
check("refuses to infer from one sample", inferShape(["jane.doe@acme.com"]), null);
check("ignores role addresses when inferring", inferShape(["press@acme.com", "info@acme.com", "jane.doe@acme.com"]), null);
check(
  "does not treat single-token locals as a pattern",
  inferShape(["jane@acme.com", "sam@acme.com"]),
  null
);

console.log("\nfindEmail");
function fakeSite(pages) {
  return async (url) => {
    const path = new URL(url).pathname;
    if (!(path in pages)) return { ok: false, text: async () => "" };
    return { ok: true, text: async () => pages[path] };
  };
}

findEmail({
  website: "https://acme.com/",
  personName: "Jane Doe",
  fetchImpl: fakeSite({ "/team": "Jane Doe, CEO. jane.doe@acme.com" }),
}).then((r) => {
  check("verified when the address matches the person", [r.email, r.confidence], ["jane.doe@acme.com", "verified"]);
  check("records where it was found", r.evidence, ["https://acme.com/team"]);

  return findEmail({
    website: "https://acme.com/",
    personName: "Jane Doe",
    fetchImpl: fakeSite({ "/team": "sam.smith@acme.com and rita.kaur@acme.com" }),
  });
}).then((r) => {
  check("constructs from a repeated pattern", [r.email, r.confidence], ["jane.doe@acme.com", "pattern"]);
  ok("says the address was constructed", /constructed as first\.last/.test(r.notes.join(" ")));

  return findEmail({
    website: "https://acme.com/",
    personName: "Jane Doe",
    fetchImpl: fakeSite({ "/contact": "press@acme.com" }),
  });
}).then((r) => {
  check("falls back to a shared inbox", [r.email, r.confidence], ["press@acme.com", "role"]);

  return findEmail({
    website: "https://acme.com/",
    personName: "Jane Doe",
    fetchImpl: fakeSite({}),
  });
}).then((r) => {
  check("returns nothing rather than guessing", [r.email, r.confidence], [null, null]);
  ok("explains why", r.notes.length > 0);

  return findEmail({
    website: "https://acme.com/",
    personName: "Jane Doe",
    fetchImpl: async () => { throw new Error("network down"); },
  });
}).then((r) => {
  check("survives a dead network", [r.email, r.confidence], [null, null]);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
});
