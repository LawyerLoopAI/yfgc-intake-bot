# yfgc-intake-bot

Automated client intake triage for Strauss Law PLLC. Monitors Gmail for emails
from designated client senders, archives each email and its attachments into the
client's Google Drive folder, runs them through Claude for a triage brief, and
writes an `intake-brief.md` summary alongside the source files — all before the
attorney reviews anything.

> **Repo note:** this project currently lives inside `yfgc-ai` at
> `yfgc-intake-bot/`. The intended home is its own repo at
> `github.com/LawyerLoopAI/yfgc-intake-bot`. See [Extracting to its own repo](#extracting-to-its-own-repo) below.

---

## Quick start (Windows PowerShell)

These are the exact commands. Pre-reqs: Node.js 20+, git, the
`yfgc-intake-bot` GitHub repo already created, and `credentials.json`
downloaded from the Google Cloud Console OAuth Desktop credentials.

### 1. Get the code onto your machine

Two options.

**Option A — pull from the yfgc-ai monorepo where it currently lives:**

```powershell
cd C:\Users\jesse
git clone https://github.com/LawyerLoopAI/yfgc-ai.git temp-yfgc
robocopy temp-yfgc\yfgc-intake-bot yfgc-intake-bot /E /XD node_modules
rmdir /s /q temp-yfgc
cd yfgc-intake-bot
git init
git remote add origin https://github.com/LawyerLoopAI/yfgc-intake-bot.git
git add .
git commit -m "Initial commit"
git branch -M main
git push -u origin main
```

**Option B — download the folder from GitHub:**

1. Browse to https://github.com/LawyerLoopAI/yfgc-ai/tree/main/yfgc-intake-bot
2. Use the repo's "Download" button (or a tool like `degit`) and drop the folder at `C:\Users\jesse\yfgc-intake-bot`
3. Initialise git in that folder and push to your own repo as above

### 2. Install + configure

```powershell
cd C:\Users\jesse\yfgc-intake-bot
npm install
copy .env.example .env
notepad .env
```

Fill in:

- `ANTHROPIC_API_KEY` — from console.anthropic.com
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` — from `credentials.json`
- `GOOGLE_REDIRECT_URI` — keep the default `http://localhost:3000/oauth2callback`
- `CRON_SECRET` — any long random string. Generate one with:
  ```powershell
  [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
  ```

Leave `GOOGLE_TOKEN_JSON` empty for now — it's only used in Vercel deploys.

### 3. Run the smoke test

Confirms every module loads and the pure functions behave. No network, no
charges:

```powershell
$env:MOCK=1; node test-pipeline.js
```

You should see `14 passed, 0 failed`.

To also exercise the live Anthropic call on a fake email (a few cents):

```powershell
node test-pipeline.js
```

### 4. One-time Google OAuth

```powershell
node auth-setup.js
```

The script prints a Google consent URL. Open it in a browser, approve the
Gmail + Drive scopes, then paste the `code=` parameter from the redirected
URL back into the prompt. `token.json` is written to the project root (and
git-ignored).

### 5. Run the pipeline locally against a real email

Send an email to yourself from `roger@12zeros.vc` (or whichever sender is in
`config.js`). Then:

```powershell
node -e "require('./api/process.js')({method:'POST',headers:{authorization:'Bearer '+process.env.CRON_SECRET}},{status:c=>({json:o=>{console.log(JSON.stringify(o,null,2));return{end:()=>{}}}})})"
```

You should see status logs per email, and a successful `{ ok: true, processed: [...] }`
JSON response. Check the client's Drive folder — there should be a new dated
subfolder containing `email-body.txt`, any attachments, and `intake-brief.md`.

---

## Adding a new client

Edit `config.js`. Each entry needs:

```js
{
  id: "short-slug",
  senderEmail: "person@client.com",
  driveFolderId: "<google drive folder id>",
  clientName: "Display Name",
  matterType: "freeform description (used in Claude prompt)",
},
```

Commit and push. Vercel auto-deploys. That's the only file that changes.

---

## Deploy to Vercel

### 6. Set up the Vercel project

1. Sign in at https://vercel.com → **New Project**
2. Import `LawyerLoopAI/yfgc-intake-bot`
3. **Configure → Framework Preset:** Other
4. Leave the Root Directory at default (`./`)
5. **Environment Variables** — add each of these:

| Name | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `GOOGLE_CLIENT_ID` | from `credentials.json` |
| `GOOGLE_CLIENT_SECRET` | from `credentials.json` |
| `GOOGLE_REDIRECT_URI` | `http://localhost:3000/oauth2callback` (placeholder, unused server-side) |
| `CRON_SECRET` | same value you put in your local `.env` |
| `GOOGLE_TOKEN_JSON` | base64 of your local `token.json`. See command below. |

Generate `GOOGLE_TOKEN_JSON`:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("token.json"))
```

Copy the whole one-line output. Paste as the value.

6. Click **Deploy**

### 7. Verify the cron

Vercel project → **Settings → Cron Jobs**. You should see `/api/process` on
the schedule from `vercel.json`. Click **Run** to fire it once manually and
watch the logs.

### Cron schedule

`vercel.json` is set to `*/10 * * * *` (every 10 minutes). Pro plan
(active). For tighter latency than polling, see
[Triggering options](#triggering-options).

---

## Triggering options

| Trigger | Latency | Setup | Cost |
|---|---|---|---|
| **Vercel cron `*/10 * * * *`** (current) | up to 10 min | already wired in `vercel.json` | covered by Pro |
| Gmail watch + Cloud Pub/Sub webhook | seconds | needs a new `/api/gmail-push` endpoint + GCP Pub/Sub setup | free |

The current setup uses Vercel's built-in cron. Move to Pub/Sub later if
client volume grows and 10-minute latency becomes the bottleneck.

---

## Extracting to its own repo

The intended permanent home is `github.com/LawyerLoopAI/yfgc-intake-bot`.
Easiest path:

```powershell
cd C:\Users\jesse\yfgc-intake-bot   # whichever local copy you have
git init  # if not already a git repo
git remote add origin https://github.com/LawyerLoopAI/yfgc-intake-bot.git
git add .
git commit -m "Initial commit"
git branch -M main
git push -u origin main
```

Once it's pushed to its own repo, the copy inside `yfgc-ai/yfgc-intake-bot/`
can be deleted from that monorepo.

---

## File layout

```
yfgc-intake-bot/
  api/
    process.js          # Main serverless handler (cron target). POST only.
    auth-callback.js    # One-time OAuth helper for deployed env
  claude/
    analyze.js          # Calls Anthropic with email + attachments
    prompts.js          # System prompt builder
  drive/
    uploader.js         # Creates dated subfolder, uploads email + attachments
  gmail/
    auth.js             # OAuth2 client factory
    parser.js           # Pulls subject/from/body/attachments from a message
    watcher.js          # Finds unread emails, tracks processed IDs
  output/
    briefBuilder.js     # Composes intake-brief.md
    driveDeposit.js     # Saves the brief to Drive
  auth-setup.js         # One-time local OAuth bootstrap
  config.js             # Client list (the only per-client config)
  test-pipeline.js      # Smoke test (MOCK=1 for offline, or live Anthropic)
  vercel.json
  package.json
```

## Safety

- This is **first-pass triage**, not legal advice. The Claude prompt is
  explicit about this and every generated brief carries an "Attorney review
  required" footer.
- Never log token values, message bodies, or other secrets. The pipeline only
  logs subjects, IDs, and step transitions.
- `processed-ids.json` lives at the project root and is appended atomically.
  On Vercel (read-only filesystem) it lives in `/tmp` for the request
  lifetime, so on Vercel the only true dedup signal is removing the UNREAD
  label after each successful run.
