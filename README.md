# LIVE LARIS AI Builder

Participant tool for the Klinik Bisnes SME workshop **LIVE LARIS: Dari Viewers ke Buyers**. It follows the Trainer Deck and Participant Workbook:

1. **Profil Bisnes**
2. **LIVE Reality Check**: LIVE habits, the 5 leakage points (Attention, Retention, Interest, Confidence, Action) and 2 metrics
3. **Product Selling Blueprint**, including the "PERLU SEMAK" list
4. **AI Prompt Cards**: 10 cards in course order. Claude writes a ChatGPT prompt tailored to the participant's answers, the participant copies it to ChatGPT, then pastes the answer back, edits it and clicks **Lulus**.
5. **Komitmen & Semakan**: Final Quality Check and My Next LIVE Commitment
6. **Master Playbook**: built from the approved outputs

- **App:** Node 20+ / Express (`server/`) serving `public/`. The card definitions in `public/js/cards.mjs` are shared by the browser and the server.
- **AI:** `server/prompt-writer.mjs` makes one Claude call per card click (`CLAUDE_MODEL`, default `claude-sonnet-5-5`, effort `medium`, server-side refusal fallback on). Without `ANTHROPIC_API_KEY`, or if a call fails or is declined, the participant gets the fixed template prompt, so the class never stalls. AI calls are capped per IP per hour (`AI_LIMIT_PER_IP_HOUR`).
- **Data:** the Google Sheet "klinik bisnes sme", tabs **LiveLaris Profiles** and **LiveLaris Prompt Log**, through the Apps Script bridge in `apps-script/Code.gs` (secret-protected, same pattern as the Quick Fix app). Without it the server keeps data in memory.

## Sheet layout

**LiveLaris Profiles** has one row per participant with two-line, colour-coded headers like *Peserta v4*: REKOD · LANGKAH 1 PROFIL BISNES · LANGKAH 2 LIVE REALITY CHECK · LANGKAH 3 PRODUCT SELLING BLUEPRINT · LANGKAH 4 KOMITMEN & SEMAKAN · OUTPUT AI DILULUSKAN (one column per card) · AI · AKTIVITI. Columns are found by header text, so rename them in `Code.gs`, not in the Sheet. `npm test` checks that every form field has a column.

**LiveLaris Prompt Log** has one row per card click: participant, card, `source` (`ai` or `template`), model, tokens, and a note on why the template was used.

If the profile tab has no participant rows yet, `setup` rewrites its header in the current layout. If it has data, it only adds missing columns on the right.

## Deploy

### 1. Apps Script bridge (in the existing LIVE LARIS project)

1. Open **script.google.com** → the LIVE LARIS project.
2. Delete the `Index` HTML file if there is one, and replace `Code.gs` with `apps-script/Code.gs`.
3. Set `SECRET` to a long random string. Railway's `APPS_SCRIPT_SECRET` must be the same.
4. Save, choose **setup** and click **Run**. Approve access if asked. The tabs get the V2 layout.
5. **Deploy → Manage deployments → ✏️ → Version: New version → Deploy.** The `/exec` URL stays the same. Opening it in a browser should show `{"ok":true,"app":"live-laris","secretSet":true}`.

This replaces the old Apps Script website. The address becomes a data bridge only, and participants use the Railway URL.

### 2. GitHub

Create an empty repo, e.g. `ailabsrichworks/live-laris`, then from this folder:

```bash
git remote add origin https://github.com/ailabsrichworks/live-laris.git
git push -u origin main
```

### 3. Railway

1. **New Project → Deploy from GitHub repo →** `live-laris`.
2. **Variables:** `ANTHROPIC_API_KEY`, `APPS_SCRIPT_URL` (the `/exec` URL), `APPS_SCRIPT_SECRET`. Optional: `CLAUDE_MODEL`, `AI_LIMIT_PER_IP_HOUR`.
3. **Settings → Healthcheck path:** `/healthz`.
4. **Settings → Networking → Generate Domain**, or add a custom domain.
5. The deploy log should show `Google Sheet reachable through Apps Script` and `prompts written by claude-sonnet-5-5`.

Set a monthly spend limit in the Anthropic console. A card click costs roughly 2–3k input and 1–2k output tokens on Sonnet 5.5, under US$0.03.

## Local

```bash
cp .env.example .env   # optional: fill in keys
npm install
npm run dev            # http://localhost:3000
npm test               # API, prompt writer (fake Claude), Apps Script (fake Sheet), field ↔ column sync
```
