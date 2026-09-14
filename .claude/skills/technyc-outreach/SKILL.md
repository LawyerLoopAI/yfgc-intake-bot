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
| Summary goes to | `jesse@strausslawpllc.com` |
| Outreach subject shape | `Congratulations on <Company>'s ...` |
| Summary subject shape | `TechNYC outreach: N drafts ready (Month D)` |
| Repo helpers | `technyc/parseFunding.js`, `technyc/emailTemplate.js` |

Digests arrive most weekdays around 5:45pm ET. Friday round-up editions often
have no funding section at all, which is a normal empty run.

---

## Step 1 - Find digests that have not been worked yet

Gmail `search_threads` with:

```
label:Label_2387005531655631291
```

**There is no processed-marker label.** The connector's Gmail scope allows
reading, composing drafts and sending, but not writing labels, so the pipeline
cannot mark a thread done. Instead the work product is the state:

- A digest dated D is already done if a sent message matches
  `in:sent subject:"TechNYC outreach" "(Month D)"`.
- A company is already covered if a draft or sent message matches
  `subject:"Congratulations on <Company>'s"`. Check both
  `list_drafts` and `in:sent`, because a draft Jesse has already sent will no
  longer be in Drafts.

Run the per-company check in Step 5 too, not just here. It is the backstop that
actually prevents a duplicate cold email, and it is cheap.

Jesse receives each digest at two addresses, so one calendar day produces two
near-identical messages in the same or adjacent threads. De-duplicate by subject
line (`Tech:NYC Digest: <date>`) and work each date once.

Only look back seven days. Older digests are stale news and congratulating
someone a month late reads badly.

If nothing is left to work, stop. Send no summary. A quiet day is not worth an
email.

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

## Step 4 - Find the email address (the priority step)

**This is the most important part of the run.** A draft addressed to nobody is
a draft Jesse has to finish by hand. Spend real effort here, more than on any
other step, and do not stop at the first dead end.

`technyc/findEmail.js` automates the site sweep. Give it the company URL, the
person's full name, and a fetch implementation:

```js
const { findEmail } = require("./technyc/findEmail");
await findEmail({ website, personName, fetchImpl: fetch, extraPages: [pressReleaseUrl] });
```

It reads the home page plus `/contact`, `/about`, `/team`, `/leadership`,
`/press`, `/privacy`, `/terms` and friends, keeps only addresses at the
company's own domain, and returns one of four confidences: `verified` (read off
a page and matching the person's name), `pattern` (built from their name using
an address shape seen at least twice at that domain), `role` (a real shared
inbox such as `press@`), or `null`.

**Network caveat.** `findEmail.js` needs to reach arbitrary company websites.
Inside the Claude Code sandbox the egress proxy allows only an allowlist, and
company sites are not on it, so the module cannot do its job there. Where you
cannot browse, work the search-only ladder below and say plainly in the summary
that the site sweep did not run.

Work these in order and keep going until something lands:

1. **The company's own site.** Contact, about, team, leadership, press pages.
   Privacy policies and terms of service are the reliable ones: they almost
   always publish a monitored address, and it is usually at the real domain.
2. **The funding press release.** The media contact block at the bottom names a
   person and gives an address. Search `"<Company>" "media contact"` or
   `"<Company>" press release <round>`.
3. **SEC EDGAR.** A company that just raised has very likely filed a Form D,
   which names the executive officers with a company address and phone. Full
   text search at efts.sec.gov.
4. **GitHub.** For a technical founder, commit author addresses on their public
   repos are real addresses. `git log --format='%ae'` on a clone, or the commits
   API.
5. **Their own writing.** Personal site, blog, Substack, conference speaker bio,
   podcast show notes, university or alumni page. People publish their address
   in these places far more often than on their company site.
6. **Their public profiles.** X or LinkedIn bios frequently carry an address or
   a link tree that does.

Then apply this rule about what you may actually put in the `To:` line:

- **Verified beats everything.** An address you read on a page, whose local part
  matches the person's name, goes straight in.
- **A pattern-derived address is allowed, and must be labeled.** If at least two
  real addresses at that domain share a shape, applying that shape to this
  person's name is a sound inference, not a guess. Put it in the `To:` line and
  say in the summary that it is pattern-derived and from what basis.
- **A shared inbox is a fallback, not a failure.** `press@` or `hello@` with the
  person named in the salutation still reaches a desk. Use it, and label it.
- **One sample is not a pattern.** Never extrapolate a shape from a single
  address, and never invent a shape you have not seen at that domain.
- **Nothing found means an empty `To:` line.** Create the draft anyway. Do not
  put a placeholder or a mailing list in the field.

Whatever you land on, record the confidence and the evidence URLs. The summary
tells Jesse which addresses he can send blind and which want a glance first.

## Step 5 - Create one draft per company

Build the copy with the shared template so every draft says the same thing:

```bash
node -e "
const {buildOutreachEmail} = require('./technyc/emailTemplate');
console.log(JSON.stringify(buildOutreachEmail(JSON.parse(process.argv[1]))));
" "$RECORD_JSON"
```

Before creating anything, run the per-company duplicate check from Step 1. If a
draft or a sent message already exists for this company, skip it and note the
skip in the summary.

Then `Gmail: create_draft` with:

- `to`: `[the address from Step 4]`, or omit entirely when there is none
- `subject`: from the template
- `body`: the template text, plain
- `htmlBody`: the same text with `<br>` line breaks and the site as a real
  anchor, `<a href="https://yfgc.ai">yfgc.ai</a>`

**The connector cannot set the From address.** `create_draft` takes no sender
field, so drafts go out as whatever the Gmail account's default Send-mail-as
identity is. Jesse wants these from `jesse@yfgc.ai`, which is a verified alias
on the account. If the default is something else, say so in the summary rather
than assuming he will notice.

**Always send `htmlBody`, not `body` alone.** Gmail linkifies a bare domain in
a plain-text draft and writes its own redirect into the saved body, so the
recipient sees `https://www.google.com/url?q=...` where the site name should
be. Gmail still rewrites the anchor's `href` on save, which cannot be
prevented from the API, but with an anchor the visible link text stays
`yfgc.ai`.

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

## Step 6 - Log each company to the tracking sheet

The Vercel pipeline does this automatically via `technyc/tracker.js`. Working
by hand, add a row per company to **TechNYC Outreach Log** in Drive: date,
digest, company, amount, round, contact, title, email address, confidence,
where it was found, status, draft link, website. Correct an existing row rather
than adding a second one when a company already logged without an address
finally gets one.

## Step 7 - Email Jesse the summary

`Gmail: send_message` to `jesse@strausslawpllc.com`.

Subject: `TechNYC outreach: N drafts ready (Month D)`

Body, plain and scannable:

- **Drafts ready to send.** One line per company: company, amount and round,
  contact name and title, the address on the draft with its confidence
  (`verified`, `pattern`, `role`), and the source URL for the identification.
  Pattern-derived and shared-inbox addresses get a word on the basis, so Jesse
  knows which ones to eyeball before sending.
- **Drafts needing an address.** Company, contact name and title, every source
  in the Step 4 ladder you actually tried, and where Jesse might look next.
- **No contact identified.** Company, amount and round, everything you did find,
  and the pages you checked. Say what is missing rather than that it "failed".
- **Skipped.** Companies passed over for prior contact or a do-not-contact, with
  the reason.

Close with the count and the reminder that nothing has been sent.

Send this even on a run where every company failed research, and even where the
digest had no funding section but a previous digest was worked. The summary is
what records the date as done, so skipping it causes the next run to redo the
work.

---

## Guardrails

- Never send an outreach email. Drafts only. The summary to Jesse is the one
  message you send.
- Never invent a name, title, funding amount, round, or investor. Every fact in
  a draft traces to the digest or to a page you actually read.
- An address may be inferred from a pattern seen at least twice at that domain,
  but it must be labeled as inferred in the summary. Anything weaker than that
  is a guess, and a guess never goes in a To: line.
- Never edit the pitch copy in `emailTemplate.js` as part of a run. If it needs
  to change, tell Jesse in the summary and let him decide.
- Never draft for a company that already has an outreach draft or sent message.
  There is no label to lean on; the check in Steps 1 and 5 is the only guard.
- No em dashes in anything you write.
