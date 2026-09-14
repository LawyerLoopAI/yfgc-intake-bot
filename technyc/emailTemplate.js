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

// Basis for the "preeminent" claim in PITCH. Fill this in and keep it current.
// If it ever goes stale, soften PITCH rather than leaving the claim unsupported.
const SUBSTANTIATION = [
  "TODO(jesse): record the basis for the 'preeminent' claim here, for example",
  "years serving as in-house or outside GC, number of venture-backed clients",
  "served, any published rating and its source, or comparative pricing data.",
].join(" ");

const PRACTICE_AREAS =
  "I am Jesse Strauss, outside general counsel to venture-backed companies in New York. The months right after " +
  "a raise are usually when the legal questions pile up: equity and option grants, contractor classification, " +
  "customer and vendor contracts, IP cleanup, privacy terms, and the board housekeeping your investors will " +
  "start asking about.";

const OFFER =
  "Two offers, both free. If something comes up and you want to talk it through, just reply. If you want a " +
  "proposal for ongoing counsel, ask and I will send one.";

const PITCH =
  "Your Fractional General Counsel\u2122 is the preeminent fractional GC service for companies at your stage: a " +
  "senior lawyer on a predictable fractional arrangement, instead of large firm rates that are cost prohibitive " +
  "for routine work, or a black box AI firm with nobody accountable when you have a real problem. Have a look " +
  `at ${SITE} and see what we are about.`;

const SIGNOFF = "Hope we can talk more!";

const SIGNATURE = [
  "Jesse Strauss",
  "Strauss Law PLLC",
  "765 Amsterdam Avenue, 5E | New York, NY 10024",
  "jesse@strausslawpllc.com | 917-541-8428",
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
    OFFER,
    PITCH,

    SIGNOFF,
    SIGNATURE,
  ].filter(Boolean);

  return { subject, body: paragraphs.join("\n\n") };
}

module.exports = { buildOutreachEmail, SIGNATURE, SIGNOFF, SITE, SUBSTANTIATION, PITCH, OFFER };
