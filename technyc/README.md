# Tech:NYC funding outreach

Every weekday the Tech:NYC Digest lands in Jesse's inbox with a **New York
Funding** section listing NYC companies that just raised. This pipeline turns
each of those companies into a personalized congratulations-and-introduction
Gmail draft addressed to the company's CEO, or its founder where there is no
CEO, and emails Jesse a summary of what is waiting for him.

Drafts only. Nothing is ever sent to a prospect automatically.

## How a run goes

1. Find threads labeled `TechNYC Emails` from the last seven days.
2. Parse the New York Funding section (`parseFunding.js`).
3. Research each company's CEO or founder, and their email address.
4. Build the email copy (`emailTemplate.js`) and create a Gmail draft.
5. Send Jesse one summary email.

**The work product is the state.** The Gmail connector's scope covers reading,
composing drafts and sending, but not writing labels, so the pipeline cannot
mark a thread done. Instead it checks whether a draft or sent message already
exists for a given company (`subject:"Congratulations on <Company>'s"`) and
whether the day's summary has already gone out
(`in:sent subject:"TechNYC outreach"`). That is more robust than a local
`processed-ids.json` would be, since each scheduled run starts from a fresh
checkout.

If the connector is ever re-authorized with `gmail.labels` or `gmail.modify`,
a `TechNYC Processed` label would be a cheaper check, but it is not required.

## Files

| File | What it does |
|---|---|
| `parseFunding.js` | Pulls structured company records out of the digest's plain-text body |
| `emailTemplate.js` | The approved outreach copy, plus the signature block and the substantiation note |
| `fixtures/2026-09-10.txt` | A real digest section, trimmed, used by the tests |
| `test-technyc.js` | Offline checks. No network, no API charges |
| `../.claude/skills/technyc-outreach/SKILL.md` | The step-by-step procedure the scheduled run follows |

```bash
node technyc/test-technyc.js
```

## Editing the pitch

All outgoing copy lives in the constants at the top of `emailTemplate.js`:
`PITCH`, `OFFER`, `PRACTICE_AREAS`, `SIGNATURE`, `SITE`. Change wording there.
The builder below them only assembles paragraphs and fills in the company
specifics, so the claims stay in one reviewable place instead of drifting from
draft to draft.

`SUBSTANTIATION` is the note recording the basis for the "preeminent" claim in
`PITCH`. The test suite prints a warning while it is still a TODO. It does not
fail the build, because the pipeline works without it, but it is the file you
would point to if the claim were ever questioned.

## New York advertising rules

The Appellate Division's joint order dated May 27, 2026, effective **June 1,
2026**, deleted Rule 1.0(a) and 1.0(c), repealed Rule 7.1 in its entirety and
replaced it with an ABA-style rule, amended Rule 7.3, and folded Rule 7.4 into
Rule 7.1(c). Three requirements that used to apply to exactly this kind of
outreach are gone:

| Old rule | Requirement | Status |
|---|---|---|
| 7.1(f) | `ATTORNEY ADVERTISING` in the subject line of an email advertisement | Repealed |
| 7.3(c)(1) | File a copy of each solicitation with the attorney disciplinary committee at the time of dissemination | Repealed |
| 7.1(e)(3) | Carry the disclaimer "Prior results do not guarantee a similar outcome" | Repealed |

What remains is the core prohibition on a false or misleading communication
about the lawyer or the lawyer's services, so the standard the copy has to meet
is substantiation, not formatting. See the header comment in
`emailTemplate.js`.

Two practical rules the pipeline still enforces itself:

- Check for prior correspondence before drafting. Anyone who has said they do
  not want to be contacted is a permanent skip.
- Name, principal law office address and telephone number appear in every
  message. That was expressly required by the repealed 7.1(h) and is kept
  because it is the safe practice and costs nothing.
