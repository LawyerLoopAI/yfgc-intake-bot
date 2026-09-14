// Gmail query builders, kept pure and separate so they can be tested without
// googleapis installed.
//
// The trap this module exists to prevent: the Gmail MCP connector accepts a
// label ID inside a `q` string, so `label:Label_2387005531655631291` works
// there. The raw Gmail API does not. Its `q` grammar matches labels by display
// NAME, so a label ID in `q` silently matches nothing, and the caller sees a
// perfectly healthy empty result. Filtering by ID has to go through the
// separate `labelIds` parameter.

/**
 * Parameters for listing source digests.
 * @param {string} labelId e.g. "Label_2387005531655631291"
 * @param {string} lookback Gmail duration, e.g. "7d"
 * @param {number} [maxResults]
 */
function sourceListParams(labelId, lookback, maxResults = 25) {
  return {
    userId: "me",
    labelIds: [labelId],
    q: `newer_than:${lookback}`,
    maxResults,
  };
}

// Gmail's q grammar has no escape for a double quote inside a quoted phrase,
// so strip them rather than emit a query that parses as something else.
function quotable(value) {
  return String(value == null ? "" : value).replace(/"/g, " ").trim();
}

/** Matches any outreach email for a company, drafted or sent. */
function outreachSubjectQuery(company) {
  return `subject:"Congratulations on ${quotable(company)}'s"`;
}

/** Matches the run summary already sent for a given digest date. */
function summarySentQuery(digestDate) {
  return `in:sent subject:"TechNYC outreach" "(${quotable(digestDate)})"`;
}

/** "Tech:NYC Digest: September 10" -> "September 10" */
function digestDate(subject) {
  return String(subject == null ? "" : subject)
    .replace(/^Tech:NYC Digest:\s*/i, "")
    .trim();
}

module.exports = { sourceListParams, outreachSubjectQuery, summarySentQuery, digestDate, quotable };
