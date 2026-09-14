// Offline checks for the Tech:NYC outreach helpers. No network, no charges.
//   node technyc/test-technyc.js

const fs = require("fs");
const path = require("path");
const { parseFundingSection } = require("./parseFunding");
const { buildOutreachEmail, SIGNATURE, SITE, SUBSTANTIATION } = require("./emailTemplate");

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
ok("makes the free consultation offer", withName.body.includes("just reply and we will talk it through"));
ok("makes the proposal offer", withName.body.includes("ask and I will send one"));
ok("says no charge and no obligation", withName.body.includes("No charge and no obligation"));
ok("carries the positioning claim", withName.body.includes("preeminent fractional general counsel service"));
ok("names the large firm alternative", withName.body.includes("cost prohibitive"));
ok("names the AI firm alternative", withName.body.includes("black box AI firm"));
ok("points the reader at the site", withName.body.includes(SITE));
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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
