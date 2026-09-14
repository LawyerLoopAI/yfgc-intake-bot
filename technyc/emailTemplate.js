// Builds the congratulations-and-introduction email sent to a newly funded
// company's CEO or founder.
//
// COMPLIANCE NOTES (New York Rules of Professional Conduct, as amended by the
// Appellate Division joint order dated May 27, 2026, effective June 1, 2026):
//
//   * The order deletes Rule 1.0(a) (the definition of "Advertisement") and
//     Rule 1.0(c) ("Computer-accessed communication"), repeals Rule 7.1 in its
//     entirety and replaces it with an ABA-style rule, amends Rule 7.3, and
//     folds Rule 7.4 into Rule 7.1(c).
//   * Gone with the old Rule 7.1: the "ATTORNEY ADVERTISING" subject-line
//     notation (old 7.1(f)), the substantiation-plus-disclaimer apparatus for
//     comparisons and quality claims (old 7.1(d) and (e), including the "Prior
//     results do not guarantee a similar outcome" line), and the three-year
//     retention rule (old 7.1(k)). Gone with the old Rule 7.3: filing a copy of
//     each solicitation with the attorney disciplinary committee (old
//     7.3(c)(1)). None of those appear here.
//   * What survives is the core prohibition against a false or misleading
//     communication about the lawyer or the lawyer's services. Keep
//     SUBSTANTIATION below current: it is the file you would point to if the
//     "preeminent" claim were ever questioned.
//   * Name, principal law office address and telephone number are in every
//     message. Expressly required under the old 7.1(h); kept because it is the
//     safe practice and costs nothing.
//   * House style: no em dashes anywhere in outgoing copy.

// ---------------------------------------------------------------------------
// Editable copy. Change wording here, not in the builder below.
// ---------------------------------------------------------------------------

const SITE = "yfgc.ai";
const BOOKING_URL = "https://calendly.com/yfgc/30min";
// Shown in full, scheme and all, because Jesse wants the whole URL visible in
// the plain-text body rather than a bare domain.
const BOOKING_TEXT = "https://calendly.com/yfgc/30min";

// Anything in the copy that should be a real link in the HTML part. Longest
// first, so a shorter match cannot chew through a longer one.
const CONTACT_EMAIL = "jesse@yfgc.ai";
const LINKS = [
  { text: BOOKING_TEXT, href: BOOKING_URL },
  // Longer than SITE, so it is matched and parked first. Without it the
  // signature's address would be chopped into jesse@<a>yfgc.ai</a>.
  { text: CONTACT_EMAIL, href: `mailto:${CONTACT_EMAIL}` },
  { text: SITE, href: `https://${SITE}` },
];

// Basis for the "preeminent" claim in PITCH. Keep it current: if the support
// ever goes stale, soften PITCH rather than leave the claim standing on its
// own. New Rule 7.1 dropped the old substantiation-and-disclaimer machinery but
// kept the bar on a materially misleading communication, so this note is the
// file to point at if the claim is ever questioned.
const SUBSTANTIATION = [
  "2024 Crain's New York Business Notable General Counsel. Confirmed by Jesse",
  "on 2026-09-14; he also cites it in his own email signature. Add further",
  "basis here as it accrues: years as in-house or outside GC, count of",
  "venture-backed clients served, comparative pricing against large firm",
  "hourly rates.",
].join(" ");

const PRACTICE_AREAS =
  "I am Jesse Strauss, outside general counsel to venture-backed companies in New York. The months right after " +
  "a raise are usually when the legal questions pile up: equity and option grants, contractor classification, " +
  "customer and vendor contracts, IP cleanup, privacy terms, and the board housekeeping your investors will " +
  "start asking about.";

const OFFER =
  "Two offers, both free. If something comes up and you want to talk it through, just reply or book time at " +
  `${BOOKING_TEXT}. If you want a proposal for ongoing counsel, ask and I will send one.`;

const PITCH =
  "Your Fractional General Counsel\u2122 is the preeminent fractional GC service for companies at your stage: a " +
  "senior lawyer on a predictable fractional arrangement, instead of large firm rates that are cost prohibitive " +
  "for routine work, or a black box AI firm with nobody accountable when you have a real problem. Have a look " +
  `at ${SITE} and see what we are about.`;

// One sentence of Jesse's relevant experience, keyed by the sector the
// research step assigns, inserted after the practice-area paragraph.
//
// EVERY LINE BELOW IS DRAWN FROM HIS OWN RESUME, and the source is named in a
// comment above it. That is the standard: nothing here may be inferred,
// rounded up, or invented. An overstated claim about his background would be a
// materially misleading communication under Rule 7.1, and unlike a wrong email
// address it goes out under his name reading entirely plausibly.
//
// Source: Jesse Strauss Resume 3-25.docx and YFGC Resume, in the Drive resumes
// folder, read 2026-09-14.

// True of every recipient, so it carries any sector with no specific line.
// Source: Common Living (Series D proptech, VP and GC 2016 to 2022, 25 to 250
// employees across 10 states, $130M+ financings and an acquisition) and
// Everyrealm (GC 2022 to 2023).
const DEFAULT_EXPERIENCE =
  "Before this I was in-house general counsel at two venture-backed companies, including one I helped take from " +
  "25 to 250 people through $130 million of financings and an acquisition.";

const SECTOR_EXPERIENCE = {
  // Source: Common Living, "Led a legal team at a Series D proptech startup,
  // reporting to the CEO", plus Blank Rome commercial real estate practice.
  "proptech":
    "I was VP and General Counsel at Common Living, a Series D proptech company, through its growth from 25 to " +
    "250 people across ten states and its acquisition.",

  // Source: Everyrealm, "joint ventures and other agreements for immersive
  // media and virtual experiences".
  "media":
    "I was General Counsel at Everyrealm, where I structured and closed joint ventures for immersive media and " +
    "virtual experiences.",

  // Source: Common Living, growth to 250 employees across ten states and
  // "high stakes litigation with local regulators regarding the legality of
  // the business which was resolved by consent decree".
  "consumer":
    "I was VP and General Counsel at Common Living as it grew to 250 people across ten states, including high " +
    "stakes litigation with regulators over whether the business was legal at all.",

  // Source: TechGC founding member; in-house GC at Everyrealm and Common
  // Living, both venture-backed technology companies.
  "enterprise-saas":
    "I am a founding member of TechGC, the peer community for general counsel of technology companies, and I have " +
    "been the in-house lawyer at two venture-backed startups.",

  // Source: Labaton Sucharow, "Litigated securities fraud cases on behalf of
  // institutional investors"; Common Living, "$130M+ in financings".
  "fintech":
    "I litigated federal securities cases for institutional investors at Labaton Sucharow, and later ran legal for " +
    "$130 million of financings in-house.",

  // Deliberately empty. The resume does not support a specific claim in these
  // sectors, so DEFAULT_EXPERIENCE carries them. Fill one in only from
  // something actually on the resume.
  "healthtech": "",
  "legaltech": "",
  "ai-infrastructure": "",
  "devtools": "",
  "marketplace": "",
  "climate": "",
  "security": "",
  "biotech": "",
  "logistics": "",
  "edtech": "",
  "other": "",
};

/**
 * @param {string|null} sector
 * @returns {string} the sentence to insert; the default when the sector has no
 *   specific line, because the default is true of every recipient
 */
function experienceFor(sector) {
  const line = SECTOR_EXPERIENCE[String(sector || "").toLowerCase()];
  return line && line.trim() ? line.trim() : DEFAULT_EXPERIENCE;
}

const SIGNOFF = "Hope we can talk more!";

const SIGNATURE = [
  "Jesse Strauss",
  "Strauss Law PLLC",
  "765 Amsterdam Avenue, 5E | New York, NY 10024",
  `${CONTACT_EMAIL} | 917-541-8428`,
].join("\n");

// ---------------------------------------------------------------------------

/**
 * @param {object} funding a record from parseFundingSection, optionally with
 *   contactFirstName and contactTitle filled in by the research step
 * @returns {{subject: string, body: string}}
 */
function buildOutreachEmail(funding) {
  const {
    company,
    description,
    amountText,
    round,
    valuationText,
    investors,
    contactFirstName,
    sector,
  } = funding;

  const raise = [amountText, round].filter(Boolean).join(" ");
  const raisePhrase = raise ? (round ? raise : `${raise} raise`) : "new round";
  const valuation = valuationText ? ` at a ${valuationText} valuation` : "";

  const subject = round
    ? `Congratulations on ${company}'s ${round}`
    : `Congratulations on ${company}'s new funding`;

  const paragraphs = [
    contactFirstName ? `Dear ${contactFirstName},` : "Hello,",

    [
      `Congratulations on ${company}'s ${raisePhrase}${valuation}.`,
      investors || null,
      "I saw it in the Tech:NYC Digest.",
    ]
      .filter(Boolean)
      .join(" "),

    PRACTICE_AREAS,
    experienceFor(sector),
    OFFER,
    PITCH,

    SIGNOFF,
    SIGNATURE,
  ].filter(Boolean);

  return { subject, body: paragraphs.join("\n\n") };
}

module.exports = {
  buildOutreachEmail,
  SECTOR_EXPERIENCE,
  DEFAULT_EXPERIENCE,
  experienceFor,
  SIGNATURE,
  SIGNOFF,
  SITE,
  LINKS,
  CONTACT_EMAIL,
  BOOKING_URL,
  BOOKING_TEXT,
  SUBSTANTIATION,
  PITCH,
  OFFER,
};
