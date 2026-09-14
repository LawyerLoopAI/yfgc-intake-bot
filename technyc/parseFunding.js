// Extracts the "New York Funding" section from a Tech:NYC Digest plain-text body.
//
// The digest is a beehiiv newsletter. In the plain-text rendering each section
// opens with an image marker line whose alt text is the section name, e.g.
//
//   View image: (https://media.beehiiv.com/.../new_york_funding_1600x300_1.png?t=...) [New York Funding]
//
// and runs until the next section marker or the next horizontal rule. Every
// funded company is a single `* ` bullet shaped like:
//
//   * [Sequen](https://www.sequen.ai/), an NYC-based real-time ranking and
//     relevance platform, raised $90 million in Series B funding at a $1.44
//     billion valuation. Prysm Capital led the round, joined by Star Capital
//     and Threshold Ventures.
//
// Not every issue has the section (Friday round-ups usually skip it), so an
// empty array is a normal result, not an error.

// The plain-text digest marks the section with the image alt text. If a future
// issue arrives without a text/plain part, gmail/parser.js falls back to
// stripped HTML, which drops the alt text, so a bare heading line counts too.
const SECTION_MARKER = /\[New York Funding\]|^\s*\**\s*New York Funding\s*\**\s*$/i;
const RULE = /^-{5,}$/;
const NEXT_SECTION = /^View image:.*\[[^\]]+\]\s*$/;
const BULLET = /^\*\s+(.*)$/;
const NESTED_BULLET = /^\s+\*\s+/;

/**
 * Pull the raw bullet lines out of the New York Funding section.
 * Continuation lines (wrapped text) are folded back into their bullet.
 * @param {string} body plain-text email body
 * @returns {string[]} one string per bullet, markdown still intact
 */
function extractFundingBullets(body) {
  const lines = String(body || "").split(/\r?\n/);

  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (SECTION_MARKER.test(lines[i])) {
      start = i + 1;
      break;
    }
  }
  if (start === -1) return [];

  const bullets = [];
  let current = null;

  for (let i = start; i < lines.length; i++) {
    const line = lines[i];

    if (RULE.test(line.trim()) || NEXT_SECTION.test(line.trim())) break;

    const m = line.match(BULLET);
    if (m) {
      if (current) bullets.push(current);
      current = m[1].trim();
      continue;
    }

    // Sub-bullets are commentary on the parent item, not separate companies.
    if (NESTED_BULLET.test(line)) continue;

    if (current && line.trim()) current += " " + line.trim();
  }
  if (current) bullets.push(current);

  return bullets;
}

const LINK = /^\[([^\]]+)\]\(([^)\s]+)\)\s*,?\s*/;
const AMOUNT = /raised\s+\$([\d.,]+)\s*(billion|million|thousand)?/i;
const ROUND = /\bin\s+((?:pre-)?seed|Series\s+[A-Z]\d*(?:-\d+)?|growth|strategic|venture|bridge|extension)\s+(?:round|funding)/i;
const VALUATION = /at\s+a\s+\$([\d.,]+)\s*(billion|million)?\s+valuation/i;

const MULTIPLIER = { thousand: 1e3, million: 1e6, billion: 1e9 };

/**
 * Turn one funding bullet into a structured record.
 * Fields that are not stated in the digest come back null rather than guessed —
 * downstream copy has to be able to tell "not mentioned" from "zero".
 * @param {string} bullet
 * @returns {object|null}
 */
function parseBullet(bullet) {
  const text = String(bullet || "").trim();
  if (!text) return null;

  const link = text.match(LINK);
  if (!link) return null;

  const company = link[1].trim();
  const website = link[2].trim();
  const rest = text.slice(link[0].length).trim();

  const amount = rest.match(AMOUNT);
  const round = rest.match(ROUND);
  const valuation = rest.match(VALUATION);

  // Everything before "raised" describes the company; everything after the
  // first sentence-ending period following the raise is investor colour.
  const raisedAt = amount ? rest.toLowerCase().indexOf("raised") : -1;
  const description = raisedAt > 0 ? rest.slice(0, raisedAt).replace(/[,\s]+$/, "").trim() : null;

  let investors = null;
  if (raisedAt > -1) {
    const after = rest.slice(raisedAt);
    const period = after.indexOf(". ");
    if (period > -1) investors = after.slice(period + 2).trim() || null;
  }

  return {
    company,
    website,
    description: description || null,
    amountText: amount ? `$${amount[1]}${amount[2] ? " " + amount[2] : ""}` : null,
    amountUsd: amount ? toUsd(amount[1], amount[2]) : null,
    round: round ? normalizeRound(round[1]) : null,
    valuationText: valuation ? `$${valuation[1]}${valuation[2] ? " " + valuation[2] : ""}` : null,
    investors,
    raw: text,
  };
}

function toUsd(numeral, unit) {
  const n = Number(String(numeral).replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const mult = unit ? MULTIPLIER[unit.toLowerCase()] : 1;
  return mult ? Math.round(n * mult) : null;
}

function normalizeRound(raw) {
  const r = String(raw).trim();
  if (/^series/i.test(r)) {
    return "Series " + r.replace(/^series\s+/i, "").toUpperCase();
  }
  return r.toLowerCase();
}

// A funding item always opens with a markdown link and states a raise. Prose
// bullets elsewhere in the digest mention funded companies but do not take
// this shape, so it is specific enough to use when the section header is gone.
const FUNDING_SHAPE = /^\[[^\]]+\]\([^)\s]+\)[\s\S]*\braised\s+\$/i;

/**
 * Every `* ` bullet in the document, wrapped lines folded, regardless of
 * section. Used only as a fallback.
 * @param {string} body
 * @returns {string[]}
 */
function allBullets(body) {
  const bullets = [];
  let current = null;
  for (const line of String(body || "").split(/\r?\n/)) {
    const m = line.match(BULLET);
    if (m) {
      if (current) bullets.push(current);
      current = m[1].trim();
      continue;
    }
    if (NESTED_BULLET.test(line)) continue;
    if (current && line.trim()) current += " " + line.trim();
    else if (current && !line.trim()) {
      bullets.push(current);
      current = null;
    }
  }
  if (current) bullets.push(current);
  return bullets;
}

/**
 * Parse a whole digest body into funding records.
 *
 * Normally this reads the New York Funding section. When that header is
 * missing, rather than reporting an empty day it falls back to any bullet
 * shaped like a funding item anywhere in the document. A missed company is a
 * missed client; a stray one costs Jesse ten seconds deleting a draft.
 *
 * @param {string} body plain-text email body
 * @returns {object[]}
 */
function parseFundingSection(body) {
  const inSection = extractFundingBullets(body).map(parseBullet).filter(Boolean);
  if (inSection.length) return inSection;

  return allBullets(body)
    .filter((b) => FUNDING_SHAPE.test(b))
    .map(parseBullet)
    .filter(Boolean);
}

module.exports = { parseFundingSection, extractFundingBullets, parseBullet, allBullets };
