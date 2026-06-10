# yfgc-intake-bot — Deployment Brief

Copy/paste this whole document to whoever is handling the deployment.

---

## What this is

A Node.js automation that watches Gmail for emails from designated client
senders, archives each email and its attachments into the client's Google
Drive folder, runs them through Claude (Anthropic) for first-pass legal
triage, and writes a structured `intake-brief.md` next to the source files.
Output is reviewed by the attorney before any client communication goes out.

Scoped to one client to start (Roger at `12zeros.vc` → 12 Zero Drive folder)
and parameterized in `config.js` for additional clients.

## Code location

- **Code currently lives at:** `github.com/LawyerLoopAI/yfgc-ai` repo, in
  the `yfgc-intake-bot/` subdirectory (subdirectory deploy via Vercel works
  fine — see below — but the intended permanent home is its own repo)
- **Intended permanent home:** `github.com/LawyerLoopAI/yfgc-intake-bot`
  (private, already created and empty)
- **Local working directory (Jesse's machine):** `C:\Users\jesse\yfgc-intake-bot`

## Pre-reqs already done

- Node.js 20+ installed on Jesse's Windows machine
- Vercel CLI installed (v54.10.3)
- Google Cloud project with Gmail API and Drive API enabled
- OAuth 2.0 Desktop credentials created; `credentials.json` downloaded
- Empty GitHub repo created: `github.com/LawyerLoopAI/yfgc-intake-bot`

## Pre-reqs you'll need

- Access to Jesse's Vercel team (`lawyerloopais-projects`) with permission
  to create projects
- Access to push to `LawyerLoopAI/yfgc-intake-bot`
- Either (a) Jesse's `token.json` after he runs the local OAuth bootstrap
  himself, or (b) the deployed-URL OAuth callback path documented in
  `api/auth-callback.js`

---

## Step-by-step deployment

### Step 1 — Get the code into its own repo

The code currently sits as a subdirectory of `yfgc-ai`. Easiest path
to its own repo:

```powershell
cd C:\Users\jesse
git clone https://github.com/LawyerLoopAI/yfgc-ai.git temp-yfgc
robocopy temp-yfgc\yfgc-intake-bot C:\Users\jesse\yfgc-intake-bot /E /XD node_modules
rmdir /s /q temp-yfgc
cd yfgc-intake-bot
git init
git remote add origin https://github.com/LawyerLoopAI/yfgc-intake-bot.git
git add .
git commit -m "Initial commit"
git branch -M main
git push -u origin main
```

After confirming the new repo has the code, delete the
`yfgc-intake-bot/` folder from the `yfgc-ai` repo so it doesn't fork.

### Step 2 — Local first run

On Jesse's machine:

```powershell
cd C:\Users\jesse\yfgc-intake-bot
npm install
copy .env.example .env
notepad .env
```

Fill in:

| Variable | Value |
|---|---|
| `ANTHROPIC_API_KEY` | from console.anthropic.com → API Keys |
| `GOOGLE_CLIENT_ID` | from `credentials.json` (downloaded earlier) |
| `GOOGLE_CLIENT_SECRET` | from `credentials.json` |
| `GOOGLE_REDIRECT_URI` | `http://localhost:3000/oauth2callback` |
| `CRON_SECRET` | a 32-byte random string. Generate: `[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))` |
| `GOOGLE_TOKEN_JSON` | leave blank; only used on Vercel |

### Step 3 — Smoke test (no charges)

```powershell
$env:MOCK=1; node test-pipeline.js
```

Should show `14 passed, 0 failed`. If anything fails, stop and triage
before continuing. Repeat without `MOCK=1` to also exercise the live
Anthropic API (charges a few cents).

### Step 4 — Google OAuth bootstrap

```powershell
node auth-setup.js
```

The script prints a Google consent URL. Open it, sign in as the Gmail
account the bot will monitor, approve the requested Gmail and Drive
scopes. The browser redirects to a `localhost:3000` URL that probably
won't load — that's fine. Copy the `code=...` value from the address
bar and paste it back into the prompt. `token.json` is written to the
project root.

### Step 5 — End-to-end local run

Send a test email to the monitored inbox from `roger@12zeros.vc` (or
have Roger send one). Then:

```powershell
node -e "require('./api/process.js')({method:'POST',headers:{authorization:'Bearer '+process.env.CRON_SECRET}},{status:c=>({json:o=>{console.log(JSON.stringify(o,null,2));return{end:()=>{}}}})})"
```

Expect a JSON response with `ok: true` and one entry in `processed[]`.
Open the 12 Zero Drive folder and confirm a new dated subfolder
appeared containing `email-body.txt`, any attachments, and
`intake-brief.md`. Read the brief and confirm the three sections
(Matter Summary, Recommended Next Steps, Draft Client Response Email)
are present and reasonable.

### Step 6 — Vercel deploy

1. Sign in at https://vercel.com under the `lawyerloopais-projects` team
2. **New Project** → import `LawyerLoopAI/yfgc-intake-bot`
3. Framework Preset: **Other**. Leave Root Directory at default.
4. Add environment variables — same values as `.env` plus
   `GOOGLE_TOKEN_JSON`:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\Users\jesse\yfgc-intake-bot\token.json"))
```

Copy the entire one-line output. Paste as the value for
`GOOGLE_TOKEN_JSON`.

5. Click **Deploy**. Wait ~60 seconds.

### Step 7 — Verify the cron

1. In the new project: **Settings → Cron Jobs**
2. Confirm `/api/process` is listed with the schedule from
   `vercel.json` (`*/10 * * * *`)
3. Click **Run** to fire it once manually. Check the function logs
   for the run.

---

## Triggering — Vercel cron (built-in)

The Vercel Pro plan is active, so `vercel.json` is already set to
`*/10 * * * *` (every 10 minutes). No third-party automation needed.

When an email arrives from a sender listed in `config.js`, it gets
picked up on the next cron run — within 10 minutes. The pipeline
queries Gmail with `from:{sender} is:unread`, dedupes against
`processed-ids.json` (or, on Vercel's read-only FS, against the
UNREAD label which the pipeline removes after a successful run), and
processes anything new.

### If 10-minute latency isn't tight enough

Migrate to Gmail watch + Cloud Pub/Sub: register a watch on the
Gmail mailbox via `users.watch()` pointed at a Pub/Sub topic; let
Pub/Sub POST to a new `/api/gmail-push` endpoint with a JWT
verification step. Latency drops to seconds. Cost stays free under
typical volumes. About 30 minutes of additional work — scope
separately when volume justifies it.

### What NOT to do

Don't crank the cron to `*/1 * * * *` — once-a-minute polling is
overkill for legal intake, will hit Gmail rate limits, and wastes
function invocations.

---

## Adding a second client (after deploy)

1. Add a new entry to `config.js`:

```js
{
  id: "newclient",
  senderEmail: "person@newclient.com",
  driveFolderId: "<google drive folder id>",
  clientName: "New Client Inc.",
  matterType: "freeform description (used in Claude prompt)",
},
```

2. Commit and push. Vercel auto-deploys.
3. If using Zapier (Option C): create a second Zap for the new
   sender. If using the cron (Options A, B) or push (Option D):
   nothing else to do — the pipeline iterates over every entry in
   `config.js`.

---

## Things NOT to do

- Don't add `yfgc-intake-bot/` as part of the existing `yfgc-ai`
  Vercel project — it needs to be its own project.
- Don't commit `.env`, `credentials.json`, `token.json`, or
  `processed-ids.json` to git. The `.gitignore` covers these but
  double-check before pushing.
- Don't share `CRON_SECRET` with anyone who shouldn't be able to
  trigger the pipeline. It's the only auth on `/api/process`.
- Don't run the bot against a Gmail account that has emails from
  the target sender already buried with the UNREAD label — it will
  process them all on first run. Either clear UNREAD first or
  start with a known-clean inbox.

---

## Success criteria

1. `LawyerLoopAI/yfgc-intake-bot` repo contains the code and is
   connected to a new Vercel project
2. The Vercel project deploys cleanly (look for "Ready" status)
3. Cron Jobs page shows `/api/process` on the configured schedule
4. A manual cron run completes successfully (no errors in logs)
5. Sending a test email from `roger@12zeros.vc` to the monitored
   inbox results in a new dated subfolder in the 12 Zero Drive
   folder containing `email-body.txt`, any attachments, and a
   valid `intake-brief.md`
6. A real test email from `roger@12zeros.vc` triggers the cron
   within 10 minutes and produces a brief end-to-end (verifies the
   Vercel deploy + cron + cron secret + Gmail/Drive auth + Anthropic
   all wired correctly)

---

## Owner / contact

- **GitHub repo owner:** LawyerLoopAI
- **Vercel team:** lawyerloopais-projects
- **Google Cloud project owner:** Jesse Strauss
- **Client / approver:** Jesse Strauss
