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
3. Research each company's CEO or founder, then find their email address
   (`research.js` + `findEmail.js`). This is the step that decides whether a
   draft is ready to send or homework.
4. Build the email copy (`emailTemplate.js`) and create a Gmail draft from
   `jesse@yfgc.ai` (`gmailDraft.js`).
5. Log every draft to a Google Sheet in Drive (`tracker.js`).
6. Send Jesse one summary email (`summary.js`), carrying the sheet link.

Companies are researched **concurrently**, four at a time. Run sequentially,
two Claude calls per company at high effort exhausted the time budget by the
third company: the September 14 run cut Luminary's sweep short and never
reached Sequen or Type at all. The work is almost all waiting on other
people's servers, so a few at once turns fifteen minutes of latency into about
three.

It runs as a Vercel cron at `/api/technyc`, **23:00 UTC Monday through
Saturday**, which is 7pm EDT. Digests land around 5:45pm ET on weekdays, so the
run picks up that same evening's issue about an hour later.

**Daylight saving.** Vercel crons are UTC and have no DST awareness, so this
fires at 7pm while Eastern is on EDT and at 6pm once it falls back to EST in
November. Nothing breaks either way: the digest has already arrived by 6pm ET,
and the seven-day lookback plus the drafts-as-state dedup mean a run at a
slightly different hour changes nothing. To hold 7pm year round, change the
hour to 0 (and the days to 2-7, since midnight UTC lands on the next calendar
day) when EST begins.

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
| `findEmail.js` | Sweeps a company's site for published addresses and resolves one for a named person |
| `emailProvider.js` | Hunter.io lookup and mailbox verification, inert without `HUNTER_API_KEY` |
| `research.js` | Identifies the CEO or founder via Claude's web search tool, then confirms the address with `findEmail.js` |
| `gmailDraft.js` | Builds the draft as raw MIME so it can carry an explicit `From:` |
| `summary.js` | Formats the run summary Jesse receives |
| `tracker.js` | Finds or creates the Drive log sheet and upserts a row per company |
| `../api/technyc.js` | The Vercel cron handler that runs the whole thing |
| `fixtures/2026-09-10.txt` | A real digest section, trimmed, used by the tests |
| `test-technyc.js` | Offline checks. No network, no API charges |
| `dry-run.js` | Prints a full sample run with the network stubbed |
| `../.claude/skills/technyc-outreach/SKILL.md` | The step-by-step procedure the scheduled run follows |

```bash
node technyc/test-technyc.js   # offline checks
node technyc/dry-run.js        # what a real run produces, network stubbed
```

`dry-run.js` drives the whole production path against the September 10 fixture
with only the two network calls stubbed, and prints the parsed companies, the
draft headers, one draft in full, and the summary email. Use it to review copy
changes before they reach a founder.

## Editing the pitch

All outgoing copy lives in the constants at the top of `emailTemplate.js`:
`PITCH`, `OFFER`, `PRACTICE_AREAS`, `SIGNATURE`, `SITE`, `BOOKING_URL`,
`CONTACT_EMAIL`. Change wording there.

`LINKS` lists everything that should become a real anchor in the HTML part:
the booking page, the signature address as a `mailto:`, and the site. Order
matters only as a safety net, because `textToHtml` also guards each match on
both sides so a domain cannot be linked inside a longer token. Without that
guard, `jesse@yfgc.ai` in the signature gets chopped into
`jesse@<a>yfgc.ai</a>` and the address stops working.
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

## Finding the address

**The rule: an address counts only if it maps to the named person.** A generic
company inbox is not a weaker answer, it is the wrong answer. Mailing a
founder's `privacy@` alias to congratulate them on a raise is worse than
sending nothing.

Three sources, in order:

0. **Skip anything already in the tracking sheet.** The sheet is the ledger of
   everything ever processed, so a seven-day lookback costs nothing after the
   first night and a company is never researched twice. Delete its row to force
   a retry.
1. **Identify the person** (`research.js`, stage one). Claude Sonnet 5 at medium
   effort. CEO, or the founder only where there is no CEO. Also classifies the
   company into a sector.
2. **Search for that person's address** (`research.js`, stage two). Claude
   Opus 5 at high effort, because this is the half that decides whether a draft
   is usable. A separate call with its own search budget, because folded into stage one the model
   treats the address as an afterthought and settles for the first inbox it
   sees. It is pointed at the places a real address actually appears: staff
   listings, the funding press release contact when it names this person, SEC
   EDGAR filings, GitHub commit authorship, personal sites and newsletters,
   speaker bios and alumni pages.
3. **Ask Hunter** (`emailProvider.js`), when `HUNTER_API_KEY` is set. See below.
4. **Sweep the company's own pages** (`findEmail.js`). Deterministic backstop.

Whichever source produces the strongest evidence wins, and the summary names
which one it came from.

### Hunter.io

Founder addresses are mostly not on the open web. The September 14 run proved
it: for Cymphony the only address anywhere on the domain was `privacy@`, and
for Inspiren the data brokers showed masked stubs like `a***@inspiren.com`.
The brokers hold the address and charge for it, so better searching cannot
close that gap.

Set `HUNTER_API_KEY` in Vercel to turn this on. Without it the module returns
null on every call and the pipeline behaves exactly as before, so there is no
code change needed either way.

Two endpoints are used. `email-finder` takes the domain plus a first and last
name and returns an address with its own confidence score. `email-verifier`
then checks whether that mailbox actually accepts mail, which is the part
worth paying for: it protects the sending reputation of a young domain doing
cold outreach.

| Hunter says | Result |
|---|---|
| deliverable | used, `verified` |
| undeliverable | discarded, even at score 99, because a bounce costs reputation |
| risky or catch-all, finder score at least 80 | used, `pattern`, flagged for a glance |
| risky or catch-all, score below 80 | not used |
| no result, or the API is down | not used, and the run continues |

Roughly 110 lookups a month at five companies a day, which is inside the
entry tier.

| Confidence | Meaning | Used? |
|---|---|---|
| `verified` | Read off a page, and the local part matches the person's name | Yes |
| `pattern` | Built from their name using a shape seen on at least two OTHER real addresses at that domain | Yes, labeled so it gets a glance |
| none | Nothing belonging to this person | No. Empty To: line, and the summary says what was tried |

`info@`, `hello@`, `press@`, `privacy@`, `legal@` and the rest are rejected
outright at every stage, and the summary names the ones it turned down. One
real address at a domain is never a pattern, and a shape never seen at that
domain is never invented.

The sweep does not read privacy, terms or legal pages at all. They publish
compliance inboxes and nothing else, so they cost time and supply exactly the
kind of address that gets rejected.

### Why this runs on Vercel and not in a Claude Code session

`findEmail.js` needs to reach arbitrary company websites, and the Claude Code
sandbox's egress proxy allows only an allowlist. Company sites are not on it:

```
$ curl -o /dev/null -w '%{http_code}' https://inspiren.com/
000
```

Every domain in the September 10 digest returned the same. Search still works
there, so a sandbox run can identify the person but not find their address,
which is the half that matters. Vercel has open outbound HTTPS, so the site
sweep works and `research.js` can use Claude's server-side `web_search` tool.

Running here also solves the sender identity. The Gmail MCP connector has no
`from` parameter, so drafts it creates inherit the account's default send-as
address. `gmailDraft.js` builds raw MIME with an explicit `From:` header, which
Gmail honours because `jesse@yfgc.ai` is a verified alias on the account.

A commercial finder (Hunter.io, Apollo, Clearbit) would raise the hit rate
further and slots in ahead of the site sweep, but it needs an API key and a
budget, so it is not wired in.

### Environment

Reuses `ANTHROPIC_API_KEY`, the Google OAuth variables, and `CRON_SECRET`. The
Gmail token needs `gmail.modify`, which `gmail/auth.js` already requests.

One optional addition: `HUNTER_API_KEY`. Without it the pipeline runs exactly
as before, just with more empty To: lines.

## The tracking sheet

Every drafted company gets a row in **TechNYC Outreach Log**, a Google Sheet in
the Drive folder named by `TRACKER_FOLDER_ID`:

| Date added | Digest | Company | Amount | Round | Contact | Title | Email address | Confidence | Found via | Status | Draft | Website |

Two behaviours worth knowing.

**Rows are upserted, not appended blindly.** A company is keyed on company plus
digest date. A company first logged without an address gets that same row
corrected when a later run finds one, rather than appearing twice. The same
company raising again in a later digest is a genuinely new row.

**Status never claims an email was sent.** This pipeline only drafts, so the
column reads "Draft ready" or "Draft, needs an address". When a send step is
added later it can update the row; writing "Sent" now would be a lie that gets
hard to unpick.

### Why the bot creates the sheet itself

The OAuth token carries `drive.file`, which is per-file access to files **this
application** created or opened. A spreadsheet created by anything else, a
Claude Drive connector or Jesse clicking New in Drive, is invisible to this app
and cannot be written to. So `ensureSheet` looks for its own sheet by name
inside the folder and creates it on first run. Google accepts `drive.file` for
the Sheets API on app-created files, so no broader scope is required.

If the first run reports a permissions error against Sheets, the fallback is to
add `https://www.googleapis.com/auth/spreadsheets` to `SCOPES` in
`gmail/auth.js` and re-run `node auth-setup.js`. That grants access to every
sheet in the account, which is why it is the fallback and not the default.

A failure here is logged and swallowed. The drafts and the summary are the
deliverable, and losing them to a spreadsheet problem would be the wrong
trade.

## Cost

Three things keep the bill down, in order of how much they matter.

**The ledger.** Before the change, a seven-day lookback meant every company in
every digest was re-researched every night for a week: roughly seven times the
necessary work, and the reason drafts kept reappearing for companies Jesse had
already dealt with. Now a company is researched once, ever. Deleting its row in
the sheet is how you ask for a retry.

**Two models.** Working out who runs a company is a lookup, so stage one uses
Claude Sonnet 5 at medium effort. Finding a person's email address is the hard
half and the one that decides whether a draft is usable, so stage two stays on
Claude Opus 5 at high effort.

**Fewer searches.** `max_uses` is 5 for identification and 8 for the address
hunt, down from 10 and 12.

Steady state is one identification and one address hunt per genuinely new
company, about five a day.

## Tailoring the copy to a sector

`SECTOR_EXPERIENCE` in `emailTemplate.js` holds one sentence of Jesse's own
relevant experience per sector, inserted after the practice-area paragraph. The
research step classifies each company into one of the sectors in `research.js`.

`DEFAULT_EXPERIENCE` covers every sector with no entry of its own, so each email
carries exactly one experience sentence and there is never a hole in the copy.
Filled today: proptech, media, consumer, enterprise-saas, fintech, crypto and
blockchain (those two share one line). The rest fall back to the default.

The classifier is told to send anything touching crypto, digital assets,
tokens, stablecoins or blockchain infrastructure to `crypto`, even where it
would otherwise read as fintech or infrastructure.

**Every line is drawn from Jesse's resume, and the source is named in a comment
beside it.** That is the standard: nothing may be inferred, rounded up, or
invented. An overstated claim about his background would be a materially
misleading communication under Rule 7.1, and unlike a wrong email address it
would go out under his name reading entirely plausibly. The tests check the
shape of each line (a full sentence, substantive, no em dash) and that the
fallback works; only the resume can settle whether a line is true.
