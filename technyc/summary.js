// Formats the run summary Jesse gets by email.
//
// Kept apart from api/technyc.js so it carries no dependency on googleapis or
// dotenv, which means the tests can assert on the exact wording without the
// deployment's packages installed.

/**
 * Make an API error readable.
 *
 * The Anthropic and Google SDKs put the whole response body in err.message, so
 * a failed company arrived in the summary as a wall of JSON. What Jesse needs
 * is the sentence inside it: whether the account is out of credit, rate
 * limited, or sent something malformed.
 *
 * @param {string} message
 * @returns {string}
 */
function cleanError(message) {
  const raw = String(message == null ? "" : message);
  const start = raw.indexOf("{");
  if (start === -1) return raw;

  const prefix = raw.slice(0, start).trim();
  try {
    const parsed = JSON.parse(raw.slice(start));
    const inner =
      (parsed.error && (parsed.error.message || parsed.error.type)) ||
      parsed.message ||
      null;
    if (!inner) return raw;
    return [prefix, inner].filter(Boolean).join(" ");
  } catch {
    return raw;
  }
}

function describe(row, contact, draftId, completed) {
  const bits = [`${row.company}, ${[row.amountText, row.round].filter(Boolean).join(" ") || "amount not stated"}`];
  if (contact.fullName) {
    bits.push(`  ${contact.fullName}${contact.title ? ", " + contact.title : ""}${contact.isCeo ? "" : " (no CEO found, this is the founder)"}`);
  } else {
    bits.push("  no contact identified");
  }
  if (contact.email) {
    const via = contact.emailSource ? ` via ${contact.emailSource}` : "";
    bits.push(`  ${contact.email} (${contact.emailConfidence || "unlabeled"}${via})`);
  } else {
    bits.push("  no address for this person, To: line is empty");
  }
  if (!contact.email && contact.searched && contact.searched.length) {
    bits.push(`  searched: ${contact.searched.slice(0, 4).join(" , ")}`);
  }
  if (contact.otherLeaders && contact.otherLeaders.length) {
    bits.push(`  also at the company: ${contact.otherLeaders.join(", ")}`);
  }
  if (contact.notes) bits.push(`  ${contact.notes}`);
  if (contact.sources && contact.sources.length) {
    bits.push(`  sources: ${contact.sources.slice(0, 3).join(" , ")}`);
  }
  if (contact.errors && contact.errors.length) {
    bits.push(`  problems: ${contact.errors.join("; ")}`);
  }
  if (draftId) {
    bits.push(`  draft ${draftId}${completed ? " (filled in an earlier draft that had no address)" : ""}`);
  }
  return bits.join("\n");
}

function buildSummary(outcome, tracker) {
  const sent = outcome.drafted.filter((d) => d.sent);
  const failedToSend = outcome.drafted.filter((d) => !d.sent && d.sendError);
  const needsAddress = outcome.drafted.filter((d) => !d.sent && !d.sendError && !d.contact.email);
  const held = outcome.drafted.filter((d) => !d.sent && !d.sendError && d.contact.email);

  const counts = [
    sent.length ? `${sent.length} sent` : null,
    held.length ? `${held.length} held for you` : null,
    needsAddress.length ? `${needsAddress.length} with no address` : null,
    failedToSend.length ? `${failedToSend.length} that failed to send` : null,
  ].filter(Boolean);

  const lines = [
    counts.length ? `${counts.join(", ")}.` : "Nothing to report.",
    "",
  ];

  if (outcome.timedOut) {
    lines.push(
      "This run hit its time budget and stopped early. Everything below did finish and is saved. Anything missing is picked up by the next run.",
      ""
    );
  }

  // Failures first: this is the only section that needs Jesse to do something
  // he was not expecting.
  if (failedToSend.length) {
    lines.push("TRIED TO SEND AND COULD NOT", "", "The draft is still there, so nothing is lost.", "");
    for (const d of failedToSend) {
      lines.push(describe(d.row, d.contact, d.draftId, d.completed), `  send failed: ${cleanError(d.sendError)}`, "");
    }
  }

  if (held.length) {
    lines.push("WAITING ON YOU", "");
    for (const d of held) {
      lines.push(describe(d.row, d.contact, d.draftId, d.completed), `  held because ${d.hold}`, "");
    }
  }

  if (needsAddress.length) {
    lines.push("NEEDS AN ADDRESS", "");
    for (const d of needsAddress) lines.push(describe(d.row, d.contact, d.draftId, d.completed), "");
  }

  if (sent.length) {
    lines.push("SENT", "");
    for (const d of sent) lines.push(describe(d.row, d.contact, d.draftId, d.completed), "");
  }

  if (outcome.skipped.length) {
    lines.push("SKIPPED", "");
    for (const s of outcome.skipped) {
      lines.push(`${s.company || s.digest}: ${s.reason}`);
    }
    lines.push("");
  }

  if (outcome.failed.length) {
    lines.push("FAILED", "");
    for (const f of outcome.failed) {
      lines.push(`${f.company || f.messageId}: ${cleanError(f.error)}`);
    }
    lines.push("");
  }

  if (tracker && tracker.url) {
    const counts = [
      tracker.added ? `${tracker.added} new row${tracker.added === 1 ? "" : "s"}` : null,
      tracker.updated ? `${tracker.updated} corrected` : null,
    ].filter(Boolean).join(", ");
    lines.push(`TRACKING SHEET`, "", `${counts || "no changes"}: ${tracker.url}`, "");
  } else if (outcome.trackerError) {
    lines.push("TRACKING SHEET", "", `Could not be updated this run: ${outcome.trackerError}`, "");
  }

  lines.push(
    "Verified means the address was read off a page and matches the person's name. Pattern means it was built from a shape seen on at least two other real addresses at that domain, so worth a glance before sending. Generic inboxes such as info@ and privacy@ are never used: an empty To: line means nothing belonging to that person was found.",
    "",
    "Automatic sending is on. An email goes out by itself only when a named person's address was found and the round came in under $100 million. Anything else is left as a draft for you. Set TECHNYC_AUTOSEND=0 in Vercel to hold everything again.",
    "",
    "Sent by the TechNYC outreach pipeline."
  );

  return lines.join("\n");
}

module.exports = { buildSummary, describe, cleanError };
