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
5. Send Jesse one summary email (`summary.js`).

It runs as a Vercel cron at `/api/technyc`, 12:00 UTC Monday through Saturday,
which is 8am ET in summer and 7am in winter. Digests land around 5:45pm ET on
weekdays, so a morning run picks up the previous evening's issue and Monday
catches Friday's.

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
| `research.js` | Identifies the CEO or founder via Claude's web search tool, then confirms the address with `findEmail.js` |
| `gmailDraft.js` | Builds the draft as raw MIME so it can carry an explicit `From:` |
| `summary.js` | Formats the run summary Jesse receives |
| `../api/technyc.js` | The Vercel cron handler that runs the whole thing |
| `fixtures/2026-09-10.txt` | A real digest section, trimmed, used by the tests |
| `test-technyc.js` | Offline checks. No network, no API charges |
| `../.claude/skills/technyc-outreach/SKILL.md` | The step-by-step procedure the scheduled run follows |

```bash
node technyc/test-technyc.js
```

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

`findEmail.js` reads the company's home page plus its contact, about, team,
leadership, press, privacy and terms pages, keeps only addresses at the
company's own domain, and returns one of four confidences:

| Confidence | Meaning | Goes in the To: line? |
|---|---|---|
| `verified` | Read off a page, and the local part matches the person's name | Yes |
| `pattern` | Built from their name using an address shape seen at least twice at that domain | Yes, labeled as inferred |
| `role` | A real published shared inbox such as `press@` | Yes, labeled, person named in the salutation |
| `null` | Nothing found | No. Empty To: line, never a placeholder |

The rule that does not bend is that a guessed address is never presented as a
found one. One sample is never a pattern, and a shape never seen at the domain
is never invented. Everything else is fair game, because a draft addressed to
nobody is a draft Jesse has to finish by hand.

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

Beyond what `/api/process` already needs, this adds nothing: it reuses
`ANTHROPIC_API_KEY`, the Google OAuth variables, and `CRON_SECRET`. The Gmail
token needs `gmail.modify`, which `gmail/auth.js` already requests.
