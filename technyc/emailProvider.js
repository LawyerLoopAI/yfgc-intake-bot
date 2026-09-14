// Commercial email lookup, currently Hunter.io.
//
// WHY THIS EXISTS: founder email addresses are largely absent from the open
// web. The September 14 run proved it. For Cymphony the only address on the
// whole domain was privacy@; for Inspiren the data brokers showed masked stubs
// like "a***@inspiren.com". The brokers hold the address and charge for it, so
// no amount of better searching closes that gap. This module buys the answer.
//
// Entirely optional. With no HUNTER_API_KEY set, every function here returns
// null and the pipeline behaves exactly as it did before.
//
// API shapes below follow Hunter's v2 documentation. Every field is read
// defensively, so a shape change degrades to "no result" rather than throwing
// mid-run and losing the whole company.

const FINDER_URL = "https://api.hunter.io/v2/email-finder";
const VERIFIER_URL = "https://api.hunter.io/v2/email-verifier";

// Hunter's finder score is its own confidence that the address is right.
// Below this, an unverified address is not worth putting in a To: line.
const MIN_FINDER_SCORE = 80;

const TIMEOUT_MS = 12000;

function signal() {
  return typeof AbortSignal !== "undefined" && AbortSignal.timeout
    ? AbortSignal.timeout(TIMEOUT_MS)
    : undefined;
}

async function getJson(url, fetchImpl) {
  const s = signal();
  const res = await fetchImpl(url, s ? { signal: s } : undefined);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      (body && body.errors && body.errors[0] && body.errors[0].details) || `HTTP ${res.status}`;
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }
  return body;
}

/**
 * Ask Hunter for one person's address at one domain.
 * @returns {Promise<{email: string|null, score: number|null, status: string|null, sources: string[]}>}
 */
async function hunterFind({ domain, firstName, lastName, apiKey, fetchImpl }) {
  const url =
    `${FINDER_URL}?domain=${encodeURIComponent(domain)}` +
    `&first_name=${encodeURIComponent(firstName)}` +
    `&last_name=${encodeURIComponent(lastName)}` +
    `&api_key=${encodeURIComponent(apiKey)}`;

  const body = await getJson(url, fetchImpl);
  const data = (body && body.data) || {};
  return {
    email: data.email || null,
    score: typeof data.score === "number" ? data.score : null,
    // The finder sometimes carries a verification verdict of its own.
    status: (data.verification && data.verification.status) || null,
    sources: Array.isArray(data.sources)
      ? data.sources.map((s) => s && s.uri).filter(Boolean).slice(0, 3)
      : [],
  };
}

/**
 * Ask Hunter whether an address actually accepts mail.
 * @returns {Promise<{result: string|null, status: string|null, score: number|null, acceptAll: boolean}>}
 */
async function hunterVerify({ email, apiKey, fetchImpl }) {
  const url = `${VERIFIER_URL}?email=${encodeURIComponent(email)}&api_key=${encodeURIComponent(apiKey)}`;
  const body = await getJson(url, fetchImpl);
  const data = (body && body.data) || {};
  return {
    result: data.result || null, // deliverable | undeliverable | risky | unknown
    status: data.status || null, // valid | invalid | accept_all | webmail | ...
    score: typeof data.score === "number" ? data.score : null,
    acceptAll: !!data.accept_all,
  };
}

/**
 * Find and vet an address for a named person.
 *
 * The verifier is what makes this worth paying for: it turns "probably right"
 * into "this mailbox accepts mail", which protects the sending reputation of a
 * young domain doing cold outreach.
 *
 * @returns {Promise<null|{email, confidence, source, notes: string[], sources: string[]}>}
 *   null when there is no key, no result, or the result is not good enough.
 */
async function lookupEmail({ domain, fullName, apiKey, fetchImpl }) {
  if (!apiKey || !domain || !fullName) return null;
  const fetcher = fetchImpl || globalThis.fetch;
  if (!fetcher) return null;

  const tokens = String(fullName).trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;
  const firstName = tokens[0];
  const lastName = tokens[tokens.length - 1];

  let found;
  try {
    found = await hunterFind({ domain, firstName, lastName, apiKey, fetchImpl: fetcher });
  } catch (err) {
    return { email: null, confidence: null, source: "hunter", notes: [`Hunter finder failed: ${err.message}`], sources: [] };
  }
  if (!found.email) {
    return { email: null, confidence: null, source: "hunter", notes: ["Hunter had no address for this person"], sources: [] };
  }

  let verdict = { result: null, status: null, score: null, acceptAll: false };
  try {
    verdict = await hunterVerify({ email: found.email, apiKey, fetchImpl: fetcher });
  } catch (err) {
    verdict.result = `verifier failed: ${err.message}`;
  }

  const notes = [];
  const scoreText = found.score == null ? "no score" : `score ${found.score}`;

  // A mailbox confirmed to accept mail is the strongest evidence available,
  // stronger than having read the address on a page.
  if (verdict.result === "deliverable") {
    notes.push(`Hunter ${scoreText}, mailbox verified deliverable`);
    return { email: found.email, confidence: "verified", source: "hunter", notes, sources: found.sources };
  }

  // Undeliverable is a definite no. Sending would bounce and cost reputation.
  if (verdict.result === "undeliverable") {
    notes.push(`Hunter suggested ${found.email} but the mailbox is undeliverable, so it was discarded`);
    return { email: null, confidence: null, source: "hunter", notes, sources: found.sources };
  }

  // "risky" usually means a catch-all domain, where verification cannot prove
  // anything either way. Lean on the finder's own confidence instead.
  if (found.score != null && found.score >= MIN_FINDER_SCORE) {
    notes.push(
      `Hunter ${scoreText}${verdict.acceptAll ? ", catch-all domain so delivery could not be confirmed" : `, verification ${verdict.result || "inconclusive"}`}`
    );
    return { email: found.email, confidence: "pattern", source: "hunter", notes, sources: found.sources };
  }

  notes.push(`Hunter suggested ${found.email} at ${scoreText}, below the ${MIN_FINDER_SCORE} threshold, so it was not used`);
  return { email: null, confidence: null, source: "hunter", notes, sources: found.sources };
}

module.exports = { lookupEmail, hunterFind, hunterVerify, MIN_FINDER_SCORE };
