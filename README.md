# CleverAds Operations

CleverAds team tools. First tool: **DV360 optimization sheets** per advertiser (ACM first, then 20–30 more), each with its own rules module.
Designed & built by Taifur Rahman.

- Static web app (Next.js static export) on Vercel. No server, no database, no secrets.
- Google sign-in, only `@cleverads.com.au`. The browser talks to Google directly; the access token stays in memory.
- The maths is pure TypeScript and is checked against a real report (golden test).
- Time: every calculation and report uses **Asia/Dhaka** (`NEXT_PUBLIC_REPORT_TIME_ZONE`), same as the Apps Script.
  Tracker dates (Australia/Sydney) are carried into the report the way Apps Script does it. The Australian clock on Home is display only.

Plans and design: `../docs/` (proposal, architecture, build plan) and `../mockups/` (every screen as PDF).

## Run it

Requires Node 24 (see `.nvmrc`; Node 22.12+ also works).

```bash
npm ci                     # exact versions from package-lock.json
cp .env.example .env.local # then fill in, or set NEXT_PUBLIC_DEMO_MODE=true to click through without Google
npm run dev                # http://localhost:3000
npm run check              # typecheck + lint + tests + production build (run before every push)
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Local site with hot reload |
| `npm test` | All tests, including the ACM golden test |
| `npm run lint` | Code rules, including the layer rules below |
| `npm run typecheck` | TypeScript strict check |
| `npm run build` | Static site into `out/` (what Vercel serves) |
| `npm run audit:prod` | Known vulnerabilities in the packages the site ships |

## Deploy (Vercel)

1. Push this folder to a **private** GitHub repo.
2. Vercel › Add New › Project › import the repo. Framework: Next.js (detected). Node.js version: 24.
3. Settings › Environment Variables: copy the names from `.env.example` (all are public values, never secrets). Leave `NEXT_PUBLIC_DEMO_MODE` empty.
4. Settings › Git: turn on "Wait for checks" so a failing CI run blocks the deploy.
5. Add the Vercel URL to the Google OAuth client's **Authorized JavaScript origins**.

Security headers (CSP, HSTS, no framing, no camera/mic) are in `vercel.json`.

## Google Cloud (once)

Project **CleverAds Operations** under the cleverads.com.au organisation:
enable Google Sheets API, Google Drive API and Gmail API; OAuth consent screen **Internal**;
create an OAuth Client ID (Web application) with origins `http://localhost:3000` and the Vercel URL.
Only the Client ID goes into `NEXT_PUBLIC_GOOGLE_CLIENT_ID`. No client secret is used.

Scopes requested at sign-in: `openid email profile`, `spreadsheets`, `drive` (to file each report into the shared Results folder;
the app is Internal, so only cleverads.com.au accounts can sign in),
`gmail.send` (only for "Contact the developer"; cannot read mail).

## How the code is organised

```
src/
  app/            Pages: sign-in, home, advertisers, advertisers/report, history, guide
  components/     UI pieces: AppShell (menu + footer), Clock, Button, BackButton, Notice …
  content/        Words and lists you can edit without touching logic (guide, tools menu, advertiser seed)
  features/       Use-cases: auth, build-report, contact-developer, clock
  engine/         Pure maths: CSV reading, 2nd/3rd IO grouping, Sheets rounding, serial dates
  advertisers/    One folder per rules module (acm/ today) + registry.ts + _template/
  adapters/       The only code that talks to Google (sign-in, REST with retries, Gmail)
  shared/         Error classes, app config (validated with Zod)
tests/
  golden/         ACM report of 2 Oct 2026 reproduced number for number
  fixtures/       Anonymised data (names and IDs replaced; real numbers). Real client CSVs go in fixtures/private/ (git-ignored)
```

Layer rules, enforced by `npm run lint`:
`engine/` never imports Google, UI or features; an advertiser module never imports another advertiser's module;
`shared/` imports nothing above it.

Adding a tool to the menu and Home: one entry in `src/content/tools.ts` plus its page folder in `src/app/`.

## Packages and security

Production dependencies are kept to four: `next`, `react`, `react-dom`, `zod`. CSV parsing, Google REST calls and
MIME e-mail are written here instead of pulling extra packages. Versions are pinned exactly (no `^`).

| Package | Version | Why |
| --- | --- | --- |
| next | 16.3.8 | Latest; includes all 2026 security fixes (needs ≥ 16.3.6) |
| react, react-dom | 19.3.0 | Latest; includes the React Server Components fixes |
| zod | 4.6.5 | Config and input validation |
| typescript | 6.0.3 | Latest 6.x. TypeScript 7 is out, but typescript-eslint does not support it yet |
| eslint | 10.12.0 | With typescript-eslint 8.71.0, @eslint/js, eslint-plugin-react-hooks |
| vitest | 5.0.3 | Tests |

`npm audit` reports **0 vulnerabilities** (checked 3 Oct 2026). `eslint-config-next` was left out on purpose: it pulls
`braces` through `fast-glob`, which has an advisory with no fixed version. CI runs `npm audit` on every push.

Fonts (IBM Plex, SIL Open Font License) are served from this site, so no request goes to a font CDN.

## Status

Done: project, sign-in, Home with clock, Advertisers, History, User guide with Contact the developer, ACM engine with golden test,
and **Build optimization sheet** for ACM:

1. Reads Campaign name / Start date / End date / Clicks Target from the Campaign Tracker (`ACM` tab, header row 5).
2. A 2nd/3rd IO starts on its main campaign's start date and ends with it (unless the tracker gives it its own end date).
3. Calculates, then creates `ACM Optimization Report - yyyy-mm-dd` (Asia/Dhaka) with Report (live formulas), Urgent,
   Margin Issue and Formula (copied from the template) tabs, same formats and highlights as the Apps Script.
4. Shows the result with Open in Google Sheets and XLSX / PDF / CSV downloads.

**Campaign Calculator** (left menu › Tools): the marketing-calculator rules (Inventory = media × 1.10, FS 4.5% of media,
Nova A$0.80 CPM) — impressions you can buy and the CTR you need at a target margin. `src/features/calculator/`.

Where each advertiser's files live (tracker, template, Results folder): `src/content/advertisers.ts`.

Next: Hub Data sheet (advertisers, ad types, run history) → Settings → the other advertisers.
