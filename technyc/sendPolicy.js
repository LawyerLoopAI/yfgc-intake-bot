// Decides whether an outreach email goes out by itself or waits for Jesse.
//
// Kept pure and separate from api/technyc.js so the rules can be read in one
// screen and tested without googleapis installed. This is the one module in
// the pipeline where a bug is not recoverable: a draft can be fixed or
// deleted, a sent email cannot.
//
// Jesse's instruction on 2026-09-27: send automatically unless there is no
// recipient or the funding is over $100M.

// The kill switch: set TECHNYC_AUTOSEND=0 in Vercel to hold everything as a
// draft again, with no deploy and no code change.
//
// Read on every call, not once at module load. Vercel reuses a warm function
// instance across invocations, so a value captured at load time would go on
// applying after Jesse changed it, which is the one thing a kill switch must
// never do.
function disabled() {
  return String(process.env.TECHNYC_AUTOSEND || "").trim() === "0";
}

// Rounds at or above this wait for Jesse. He said "over $100M"; a round of
// exactly $100 million is held too, because it is plainly the kind of raise he
// meant to look at himself, and holding errs toward review rather than away
// from it.
const REVIEW_THRESHOLD_USD = 100000000;

function formatUsd(n) {
  if (!Number.isFinite(n)) return "an unstated amount";
  if (n >= 1000000000) return `$${+(n / 1000000000).toFixed(2)} billion`;
  if (n >= 1000000) return `$${+(n / 1000000).toFixed(1)} million`;
  return `$${n.toLocaleString("en-US")}`;
}

/**
 * @param {object} row a record from parseFundingSection
 * @param {object} contact the research result
 * @returns {{send: boolean, hold: string|null}} hold is the reason, phrased for
 *   the summary email, and is null exactly when send is true
 */
function decideSend(row, contact) {
  if (disabled()) {
    return { send: false, hold: "automatic sending is switched off (TECHNYC_AUTOSEND=0)" };
  }

  // Jesse's first rule. Also the reason the pipeline never sends to a generic
  // inbox: research.js returns no address at all rather than info@.
  if (!contact || !contact.email) {
    return { send: false, hold: "no recipient, so there is nothing to send to" };
  }

  // Jesse's second rule. An amount the parser could not read is held rather
  // than sent: a threshold cannot be applied to a number nobody has, and
  // guessing in the permissive direction is exactly the wrong way to guess.
  const amount = row && row.amountUsd;
  if (!Number.isFinite(amount)) {
    return {
      send: false,
      hold: "the digest did not state an amount, so the $100 million line cannot be applied",
    };
  }
  if (amount >= REVIEW_THRESHOLD_USD) {
    return {
      send: false,
      hold: `${formatUsd(amount)} is at or above the $100 million line, so this one is yours to review`,
    };
  }

  return { send: true, hold: null };
}

module.exports = { decideSend, formatUsd, REVIEW_THRESHOLD_USD };
