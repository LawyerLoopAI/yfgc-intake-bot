---
name: technyc-outreach
description: >
  Process new Tech:NYC Digest emails filed under the Gmail label "TechNYC Emails",
  identify the CEO or founder of each company in the "New York Funding" section,
  create a personalized congratulations-and-introduction Gmail draft for each,
  and email Jesse a summary of what is waiting and what could not be found.
  TRIGGER whenever Jesse says "run TechNYC", "TechNYC outreach", "process the
  TechNYC emails", "do the funding outreach", or when fired on a schedule.
---

# Tech:NYC Funding Outreach

Runs daily. Turns each newly funded NYC company in the Tech:NYC Digest into a
reviewed-by-Jesse Gmail draft addressed to that company's CEO or founder.

**You create drafts. You never send outreach.** The only message you send is the
summary to Jesse.

---

## Configuration

| Thing | Value |
|---|---|
| Source label | `TechNYC Emails` (`Label_2387005531655631291`) |
| Done label | `TechNYC Processed` (create it if missing) |
| Summary goes to | `jesse@strausslawpllc.com` |
| Repo helpers | `technyc/parseFunding.js`, `technyc/emailTemplate.js` |

Digests arrive most weekdays around 5:45pm ET. Friday round-up editions often
have no funding section at all, which is a normal empty run.

---

## Step 1 - Find unprocessed digests

Gmail `search_threads` with:

```
label:Label_2387005531655631291 -label:TechNYC Processed
```

The label is the only state. There is no local file to consult, and the runner
gets a fresh checkout each time, so **the `TechNYC Processed` label is what
stops a company being emailed twice.** Apply it in Step 6 and never skip it.

Jesse receives each digest at two addresses, so one calendar day can produce two
near-identical messages. De-duplicate by subject line (`Tech:NYC Digest: <date>`)
and process each date once.

If nothing matches, stop. Send no summary. A quiet day is not worth an email.

## Step 2 - Extract the funded companies

`get_message` with `messageFormat: PLAIN_TEXT`, then run the parser rather than
reading the companies out of the body by eye:

```bash
node -e "
const {parseFundingSection} = require('./technyc/parseFunding');
console.log(JSON.stringify(parseFundingSection(require('fs').readFileSync(process.argv[1],'utf8')), null, 2));
" /tmp/digest.txt
```

Each record has `company`, `website`, `description`, `amountText`, `round`,
`valuationText`, `investors`, `raw`. Fields the digest did not state come back
`null`. **Never fill a null from memory or inference.** If the digest did not
name the round, the email does not name the round.

Only the "New York Funding" section counts. The "Today in Tech" section also
mentions funded companies; those are not targets.

## Step 3 - Identify the CEO or founder

For each company, in this order, stopping at the first solid answer:

1. The company site from `website`: `/about`, `/team`, `/leadership`, `/company`.
2. The funding coverage itself. Search the company name plus the round, for
   example `Inspiren "Series C" CEO`. Press releases almost always quote the CEO.
3. LinkedIn, Crunchbase, or the company's press page.

Rules:

- **CEO first. Only if there is no CEO, use the founder or co-founders.** With
  co-founders and no CEO, address the one whose title is closest to chief
  executive; if they are genuinely equal, address the first listed and note the
  others in the summary.
- Record `contactFirstName`, full name, title, and the URL you got it from. The
  source URL goes in the summary so Jesse can check your work in one click.
- **Two independent sources, or say so.** One blog post is thin. If you have
  only one source, still draft, but flag it in the summary as unconfirmed.
- If you cannot identify a person at all, do not guess and do not address the
  draft to "the team". Skip to Step 5 and report it.

## Step 4 - Find the email address

- Accept an address only if you actually saw it: on the company site, in a press
  release, in an SEC filing, in the digest itself.
- **Never construct an address from a pattern.** `first@company.com` is a guess
  even when it is usually right, and a bounce on a cold introduction is worse
  than a blank To: line.
- No verified address means the draft still gets created, addressed to nobody.
  Jesse fills it in. Flag it in the summary.

## Step 5 - Create one draft per company

Build the copy with the shared template so every draft says the same thing:

```bash
node -e "
const {buildOutreachEmail} = require('./technyc/emailTemplate');
console.log(JSON.stringify(buildOutreachEmail(JSON.parse(process.argv[1]))));
" "$RECORD_JSON"
```

Then `Gmail: create_draft` with:

- `to`: `[verified address]`, or omit entirely when there is none
- `subject`: from the template
- `body`: from the template

Do not hand-edit the body per company beyond what the template already
personalizes. The template is the reviewed copy; drift across drafts is how an
unreviewed claim gets into a client-facing email.

**Compliance, current as of the Appellate Division joint order dated May 27,
2026, effective June 1, 2026** (see the header comment in
`technyc/emailTemplate.js` for detail):

- No `ATTORNEY ADVERTISING` subject-line notation. Old Rule 7.1(f) was repealed
  with the rest of old Rule 7.1.
- No filing with any attorney disciplinary committee. Old Rule 7.3(c)(1) is gone.
- No "Prior results do not guarantee a similar outcome" disclaimer. Old Rule
  7.1(e)(3) went with the repealed rule.
- Do not email anyone who has asked not to be contacted. Before drafting, search
  Gmail for prior correspondence with the company or the person. A reply of
  "not interested" from an earlier round is a permanent stop for that company.
- The pitch text in `emailTemplate.js` is Jesse's, reviewed and approved by him.
  Do not soften it, sharpen it, or add claims of your own.

## Step 6 - Mark the thread processed

Apply `TechNYC Processed` to the thread. Do this even when the digest had no
funding section, and even when every company failed research. An unlabeled
thread will be reprocessed tomorrow and can produce a duplicate draft.

## Step 7 - Email Jesse the summary

`Gmail: send_message` to `jesse@strausslawpllc.com`.

Subject: `TechNYC outreach: N drafts ready (Month D)`

Body, plain and scannable:

- **Drafts ready to send.** One line per company: company, amount and round,
  contact name and title, the address on the draft, and the source URL for the
  identification.
- **Drafts needing an address.** Company, contact name and title, why no address
  was found, and where Jesse might look.
- **No contact identified.** Company, amount and round, everything you did find,
  and the pages you checked. Say what is missing rather than that it "failed".
- **Skipped.** Companies passed over for prior contact or a do-not-contact, with
  the reason.

Close with the count and the reminder that nothing has been sent.

---

## Guardrails

- Never send an outreach email. Drafts only. The summary to Jesse is the one
  message you send.
- Never invent a name, title, email address, funding amount, round, or investor.
  Every fact in a draft traces to the digest or to a page you actually read.
- Never edit the pitch copy in `emailTemplate.js` as part of a run. If it needs
  to change, tell Jesse in the summary and let him decide.
- Never process a thread already carrying `TechNYC Processed`.
- No em dashes in anything you write.
