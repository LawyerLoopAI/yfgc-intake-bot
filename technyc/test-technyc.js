// Offline checks for the Tech:NYC outreach helpers. No network, no charges.
//   node technyc/test-technyc.js

const fs = require("fs");
const path = require("path");
const { parseFundingSection } = require("./parseFunding");
const {
  buildOutreachEmail, SIGNATURE, SIGNOFF, SITE, LINKS, BOOKING_TEXT, BOOKING_URL,
  CONTACT_EMAIL, SUBSTANTIATION,
} = require("./emailTemplate");

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

console.log("\nparseFundingSection: header lost to the HTML fallback");
// gmail/parser.js falls back to stripped HTML when a digest has no text/plain
// part, and stripping drops the image alt text that marks the section.
const strippedHeading = [
  "New York Funding",
  "",
  "* [Axle](https://www.axle.insure/), an NYC-based insurance data platform, raised $18 million in Series A funding. Anthemis led the round.",
].join("\n");
check("a bare heading still marks the section", parseFundingSection(strippedHeading).map((r) => r.company), ["Axle"]);

const noHeadingAtAll = [
  "* Some prose bullet about [Remepy](https://remepy.com/) with no raise in it.",
  "",
  "* [PineGap](https://pinegap.ai), an NYC-based asset management platform, raised $23 million in Series A funding.",
].join("\n");
check(
  "falls back to funding-shaped bullets when the header is gone entirely",
  parseFundingSection(noHeadingAtAll).map((r) => r.company),
  ["PineGap"]
);
check(
  "the fallback still ignores prose bullets with no raise",
  parseFundingSection(noHeadingAtAll).some((r) => r.company === "Remepy"),
  false
);

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
ok("offers a booking slot", withName.body.includes(BOOKING_TEXT));
ok("makes the proposal offer", withName.body.includes("ask and I will send one"));
ok("says both offers are free", withName.body.includes("Two offers, both free"));
ok("carries the positioning claim", withName.body.includes("preeminent fractional GC service"));
ok("names the large firm alternative", withName.body.includes("cost prohibitive"));
ok("names the AI firm alternative", withName.body.includes("black box AI firm"));
ok("points the reader at the site", withName.body.includes(SITE));
ok("interpolates the site rather than printing the placeholder", !withName.body.includes("${SITE}"));
// Jesse asked for this to be short. Keep it honest with a hard ceiling.
const words = withName.body.split(/\s+/).length;
ok(`body stays under 230 words (was ${words})`, words < 230);
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
  ok("says the address was constructed", /built as first\.last/.test(r.notes.join(" ")));

  return findEmail({
    website: "https://acme.com/",
    personName: "Jane Doe",
    fetchImpl: fakeSite({ "/contact": "press@acme.com privacy@acme.com" }),
  });
}).then((r) => {
  // The bug Jesse caught: a privacy alias scraped off a policy page was being
  // put in the To: line. A generic inbox is the wrong answer, not a weak one.
  check("never returns a generic inbox", [r.email, r.confidence], [null, null]);
  ok("says which generic inboxes it rejected", /only generic inboxes/.test(r.notes.join(" ")));
  check("reports them as rejected", r.rejected.sort(), ["press@acme.com", "privacy@acme.com"]);

  return findEmail({
    website: "https://acme.com/",
    personName: "Jane Doe",
    fetchImpl: fakeSite({ "/contact": "sam.smith@acme.com" }),
  });
}).then((r) => {
  check("one colleague is not a convention", [r.email, r.confidence], [null, null]);
  ok("explains that one sample is too few", /too few to infer/.test(r.notes.join(" ")));

  return findEmail({
    website: "https://acme.com/",
    personName: "Jane Doe",
    fetchImpl: fakeSite({}),
  });
}).then((r) => {
  check("returns nothing rather than guessing", [r.email, r.confidence], [null, null]);
  ok("explains why", r.notes.length > 0);

  // Privacy, terms and legal pages publish compliance inboxes and nothing
  // else, so they are no longer swept at all.
  const { CANDIDATE_PATHS } = require("./findEmail");
  ok("does not sweep the privacy page", !CANDIDATE_PATHS.includes("/privacy"));
  ok("does not sweep the terms page", !CANDIDATE_PATHS.includes("/terms"));
  ok("still sweeps the team page", CANDIDATE_PATHS.includes("/team"));

  const { IDENTIFY_SYSTEM, EMAIL_SYSTEM } = require("./research");
  ok("identification is its own stage", /no CEO/.test(IDENTIFY_SYSTEM));
  ok("finding the address is its own stage", /direct work email address of one named person/.test(EMAIL_SYSTEM));
  ok("the email stage names the inboxes to reject", /privacy@/.test(EMAIL_SYSTEM) && /info@/.test(EMAIL_SYSTEM));
  ok("the email stage forbids guessing a pattern", /at least two real addresses/.test(EMAIL_SYSTEM));
  ok("the email stage points at EDGAR and GitHub", /EDGAR/.test(EMAIL_SYSTEM) && /GitHub/.test(EMAIL_SYSTEM));

  return findEmail({
    website: "https://acme.com/",
    personName: "Jane Doe",
    fetchImpl: async () => { throw new Error("network down"); },
  });
}).then((r) => {
  check("survives a dead network", [r.email, r.confidence], [null, null]);
  runSyncSuites();
});

function runSyncSuites() {

// ---------------------------------------------------------------------------

const { buildRawMessage, textToHtml, encodeHeader } = require("./gmailDraft");

function decodeRaw(raw) {
  return Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function partBodies(mime) {
  // Return each base64 part decoded, so tests assert on real content.
  return mime
    .split(/\r\n--[^\r\n-]+\r\n/)
    .slice(1)
    .map((part) => {
      const split = part.indexOf("\r\n\r\n");
      if (split === -1) return "";
      const payload = part.slice(split + 4).split(/\r\n--/)[0].replace(/\r\n/g, "");
      return Buffer.from(payload, "base64").toString("utf8");
    });
}

console.log("\nencodeHeader");
check("leaves ascii alone", encodeHeader("Congratulations on Sequen's Series B"), "Congratulations on Sequen's Series B");
ok("encodes non-ascii as an RFC 2047 word", /^=\?UTF-8\?B\?/.test(encodeHeader("Zoë Weil")));

console.log("\nbuildRawMessage");
const withTo = decodeRaw(
  buildRawMessage({
    from: "Jesse Strauss <jesse@yfgc.ai>",
    to: "alex@inspiren.com",
    subject: "Congratulations on Inspiren's Series C",
    text: "Dear Alex,\n\nHave a look at yfgc.ai and see what we are about.",
    html: textToHtml("Dear Alex,\n\nHave a look at yfgc.ai and see what we are about.", "yfgc.ai"),
  })
);
ok("sets From to the yfgc.ai identity", withTo.includes("From: Jesse Strauss <jesse@yfgc.ai>"));
ok("sets To when an address was found", withTo.includes("To: alex@inspiren.com"));
ok("is multipart/alternative", /Content-Type: multipart\/alternative; boundary="yfgc_/.test(withTo));
ok("declares utf-8 on both parts", (withTo.match(/charset="UTF-8"/g) || []).length === 2);
ok("uses CRLF line endings", withTo.includes("\r\n") && !/[^\r]\n/.test(withTo));

const bodies = partBodies(withTo);
check("carries two alternative parts", bodies.length, 2);
ok("plain part is the plain text", bodies[0].startsWith("Dear Alex,"));
ok("html part is html", bodies[1].startsWith("<div>"));
ok("html links the site", bodies[1].includes('<a href="https://yfgc.ai">yfgc.ai</a>'));

const noTo = decodeRaw(
  buildRawMessage({
    from: "Jesse Strauss <jesse@yfgc.ai>",
    subject: "Congratulations on Type's pre-seed",
    text: "Hello,",
    html: "<div>Hello,</div>",
  })
);
// An empty "To:" header is worse than none: some clients render it as a
// recipient and it can trip spam heuristics.
ok("omits the To header entirely when there is no address", !/^To:/m.test(noTo));

const accented = decodeRaw(
  buildRawMessage({
    from: "Jesse Strauss <jesse@yfgc.ai>",
    subject: "Congratulations on Sequen's Series B",
    text: "Dear Zoë,\n\nYour Fractional General Counsel™ is here.",
    html: "<div>Dear Zoë,</div>",
  })
);
const accentedBodies = partBodies(accented);
ok("round-trips a diaeresis", accentedBodies[0].includes("Zoë"));
ok("round-trips the trademark sign", accentedBodies[0].includes("™"));
ok("wraps base64 at 76 columns", accented.split("\r\n").every((l) => l.length <= 78));

console.log("\ntextToHtml");
ok("escapes angle brackets", textToHtml("a < b & c", "").includes("a &lt; b &amp; c"));
ok("turns newlines into breaks", textToHtml("one\ntwo", "").includes("one<br>two"));
ok("leaves the text alone when no site is given", !textToHtml("visit yfgc.ai", "").includes("<a "));
ok("accepts a bare domain as shorthand", textToHtml("visit yfgc.ai", "yfgc.ai").includes('<a href="https://yfgc.ai">yfgc.ai</a>'));
// The signature carries jesse@yfgc.ai. Without a boundary guard the linker
// chops it into jesse@<a>yfgc.ai</a>, which breaks the address.
check("does not match a domain inside a longer token", textToHtml("write to sam@yfgc.ai today", "yfgc.ai"), "<div>write to sam@yfgc.ai today</div>");

const linked = textToHtml(buildOutreachEmail({ company: "Acme", amountText: "$1 million", contactFirstName: "Sam" }).body, LINKS);
ok("links the site", linked.includes('<a href="https://yfgc.ai">yfgc.ai</a>'));
ok("links the booking page", linked.includes(`<a href="${BOOKING_URL}">${BOOKING_TEXT}</a>`));
ok("links the signature address as mailto", linked.includes(`<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>`));
check("emits exactly three anchors", (linked.match(/<a /g) || []).length, 3);
ok("leaves no placeholder sentinels behind", !linked.includes(String.fromCharCode(57344)));
ok("does not nest anchors", !/<a [^>]*>[^<]*<a /.test(linked));

console.log("\ngmailQuery");
const {
  sourceListParams, outreachSubjectQuery, summarySentQuery, digestDate,
} = require("./gmailQuery");

// The bug this guards: a label ID inside q silently matches nothing on the raw
// Gmail API, which returns a healthy-looking empty result. It must go through
// the labelIds parameter instead.
const params = sourceListParams("Label_2387005531655631291", "7d");
check("filters by labelIds, not by a label: term in q", params.labelIds, ["Label_2387005531655631291"]);
ok("keeps the label ID out of q entirely", !params.q.includes("Label_"));
ok("q carries only the time window", params.q === "newer_than:7d");
check("asks for the user's own mailbox", params.userId, "me");

check("outreach subject query", outreachSubjectQuery("Inspiren"), 'subject:"Congratulations on Inspiren\'s"');
// Gmail's q grammar cannot escape a quote inside a quoted phrase, so a company
// name containing one must not be allowed to break out of the phrase.
ok("strips quotes from a company name", !outreachSubjectQuery('Ac"me').includes('Ac"me'));
check("summary sent query", summarySentQuery("September 10"), 'in:sent subject:"TechNYC outreach" "(September 10)"');
check("digest date", digestDate("Tech:NYC Digest: September 10"), "September 10");
check("digest date when the prefix is absent", digestDate("Something else"), "Something else");

console.log("\nbuildSummary");
const { buildSummary } = require("./summary");
const summary = buildSummary({
  digests: [],
  drafted: [
    {
      row: { company: "Inspiren", amountText: "$70 million", round: "Series C" },
      contact: {
        fullName: "Alex Hejnosz", title: "CEO", isCeo: true, email: "alex@inspiren.com",
        emailConfidence: "verified", otherLeaders: [], notes: "", sources: ["https://x"], errors: [],
      },
      draftId: "r1",
    },
    {
      row: { company: "Type", amountText: "$4 million", round: "pre-seed" },
      contact: {
        fullName: null, title: null, isCeo: false, email: null, emailConfidence: null,
        otherLeaders: [], notes: "Founders not named in any source found.", sources: [], errors: [],
      },
      draftId: "r2",
    },
  ],
  skipped: [{ company: "Sequen", reason: "already drafted or sent" }],
  failed: [],
});
ok("separates ready from needs-an-address", summary.indexOf("READY TO SEND") < summary.indexOf("NEEDS AN ADDRESS"));
ok("shows the verified address", summary.includes("alex@inspiren.com (verified)"));
ok("flags the empty To: line", summary.includes("no address for this person"));
ok("lists skips with a reason", summary.includes("Sequen: already drafted or sent"));

// A run that finishes an earlier addressless draft should say so, otherwise
// Jesse cannot tell a newly filled-in draft from one he already reviewed.
const completedSummary = buildSummary({
  digests: [], skipped: [], failed: [],
  drafted: [{
    row: { company: "Sequen", amountText: "$90 million", round: "Series B" },
    contact: {
      fullName: "Zoe Weil", title: "CEO", isCeo: true, email: "zoe@sequen.ai",
      emailConfidence: "verified", otherLeaders: [], notes: "", sources: [], errors: [],
    },
    draftId: "r9", completed: true,
  }],
});
ok("flags a draft that was filled in later", completedSummary.includes("filled in an earlier draft that had no address"));
ok("says nothing about filling in for a fresh draft", !summary.includes("filled in an earlier draft"));
ok("states nothing was sent", summary.includes("Nothing has been sent."));
ok("no em dash in the summary", !summary.includes("—"));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}
