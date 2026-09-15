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

// Jesse's newsletter, in the signature of every email. Named "Fractionally
// Legal" per the resumes ("Author of 'Fractionally Legal' available at ...").
const SUBSTACK_URL = "https://fractionallyyours.substack.com/";
const SUBSTACK_TEXT = "https://fractionallyyours.substack.com/";

// Anything in the copy that should be a real link in the HTML part. Longest
// first, so a shorter match cannot chew through a longer one.
const CONTACT_EMAIL = "jesse@yfgc.ai";
const LINKS = [
  { text: BOOKING_TEXT, href: BOOKING_URL },
  // Longer than SITE, so it is matched and parked first. Without it the
  // signature's address would be chopped into jesse@<a>yfgc.ai</a>.
  { text: SUBSTACK_TEXT, href: SUBSTACK_URL },
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
// EVERY LINE BELOW IS DRAWN FROM HIS OWN RESUMES, and the source is quoted in a
// comment above it. That is the standard: nothing here may be inferred,
// rounded up, or invented. An overstated claim about his background would be a
// materially misleading communication under Rule 7.1, and unlike a wrong email
// address it goes out under his name reading entirely plausibly.
//
// Sources: the 31 files in the Drive resumes folder, read 2026-09-15. The
// useful distinct versions are the web3 (9-24), media (5-25), litigation
// (3-26 v4 and 5-23 v3), real estate (10-23), venture (11-23), 3-25 and YFGC
// resumes. Where they disagree, ask Jesse rather than guessing. Headcount at
// Common Living is 300, per the web3 and media resumes; the 3-25 and YFGC
// resumes say 250, and Jesse confirmed 300 is right on 2026-09-15.

// True of every recipient, so it carries any sector with no specific line.
// Source: Common Living, "$40M Series C, $50M Series D, $25M bridge financing,
// and $15M venture debt facility", "25 employees operating 100 units in two
// states to 300 employees operating 3,000 units in ten states",
// "acquired in December 2022"; Everyrealm, General Counsel 2022 to 2023.
const DEFAULT_EXPERIENCE =
  "Before this I was in-house general counsel at two venture-backed companies, including one I took from 25 to " +
  "300 people across ten states through a Series C, a Series D, and an acquisition.";

// Shared by the crypto and blockchain keys, so anything crypto picks it up.
// Source (web3 resume): Everyrealm was "a Series A blockchain startup"; he led
// "regulatory compliance ... securities (specifically regulation A filings for
// security tokens)" and advised on "tokenomics, global securities regulations"
// for "all crypto, blockchain and immersive media projects"; Strauss Law today
// is "fractional general counsel to proptech companies, developers, AI
// startups, crypto projects".
const CRYPTO_EXPERIENCE =
  "I was General Counsel at Everyrealm, a Series A blockchain company, where I handled token regulation and " +
  "Regulation A filings for security tokens, and crypto projects are part of my practice today.";

const SECTOR_EXPERIENCE = {
  "crypto": CRYPTO_EXPERIENCE,
  "blockchain": CRYPTO_EXPERIENCE,

  // Source: Common Living, "venture backed B2B and B2C proptech start-up that
  // raised $125M", "over 190 bespoke B2B SaaS-type agreements with
  // institutional real estate developers for the finance and operation of
  // 7,500+ units", "joint ventures and general partnerships ... valued at over
  // $100M".
  "proptech":
    "I was VP and General Counsel at Common Living, a venture-backed proptech company, where I papered over 190 " +
    "agreements with institutional real estate developers covering 7,500 units and joint ventures worth more " +
    "than $100 million.",

  // Source (media resume): Everyrealm was "an immersive media, video games, and
  // other digital content" company; he "negotiated and successfully closed over
  // 50 key agreements with talent and IP holders" and oversaw "the company's
  // intellectual property strategy".
  "media":
    "I was General Counsel at Everyrealm, an immersive media and games company, where I closed over 50 agreements " +
    "with talent and IP holders and ran the intellectual property portfolio.",

  // Source: Common Living, "B2B and B2C proptech start-up", growth to "300
  // employees operating in ten states", "high stakes litigation with local
  // regulators regarding the legality of the business which was resolved by
  // consent decree", and privacy compliance "(GDPR and CCPA)".
  "consumer":
    "I was VP and General Counsel at Common Living as it grew to 300 people across ten states, running its privacy " +
    "compliance and its litigation with regulators over whether the business was legal at all.",

  // Source: Common Living, "over 190 bespoke B2B SaaS-type agreements" and
  // "technology licensing"; TechGC founding member since 2017.
  "enterprise-saas":
    "I drafted and negotiated more than 190 bespoke B2B SaaS agreements as general counsel at Common Living, and I " +
    "am a founding member of TechGC, the peer community for general counsel of technology companies.",

  // Source: Indepayment.com LLC, founder, "an internet-native debt collection
  // platform allowing users to register and sell receivables". Jesse confirmed
  // on 2026-09-15 that it is a prior startup, so this stays in the past tense.
  // Everyrealm,
  // compliance for "payments" and "global securities regulations"; Labaton
  // Sucharow, "Litigated securities fraud cases on behalf of institutional
  // investors".
  "fintech":
    "I founded an internet-native receivables platform, led payments and securities compliance in-house at " +
    "Everyrealm, and litigated federal securities cases at Labaton Sucharow.",

  // Source (media resume, LawyerLoop entry): "LAWYERLOOP AI, Founder, 2024.
  // Beta artificial intelligence platform for lawyers to connect with clients."
  // Plus in-house GC at Everyrealm and Common Living.
  "legaltech":
    "I founded LawyerLoop, an AI platform connecting lawyers with clients, so I have built in this space as well as " +
    "lawyered in it, after six years as general counsel of a venture-backed startup.",

  // Source (web3 resume): Strauss Law is "fractional general counsel to
  // proptech companies, developers, AI startups, crypto projects"; Everyrealm,
  // "actionable advice to cross-functional teams, including product,
  // engineering, and operations".
  "ai-infrastructure":
    "AI startups are a core part of my fractional practice, and before that I was the in-house lawyer two " +
    "venture-backed technology companies relied on for product, privacy, and engineering questions.",

  // Deliberately empty. The resumes do not support a specific claim in these
  // sectors, so DEFAULT_EXPERIENCE carries them. Fill one in only from
  // something actually on a resume.
  "healthtech": "",
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
  `Fractionally Legal: ${SUBSTACK_TEXT}`,
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
  CRYPTO_EXPERIENCE,
  experienceFor,
  SIGNATURE,
  SIGNOFF,
  SITE,
  LINKS,
  CONTACT_EMAIL,
  BOOKING_URL,
  BOOKING_TEXT,
  SUBSTACK_URL,
  SUBSTACK_TEXT,
  SUBSTANTIATION,
  PITCH,
  OFFER,
};
