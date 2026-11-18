# UltraMed Field Ops — setup guide

## What's in this folder

- `www/` — the app itself (this is what runs in the browser and as the installed app)
  - `www/js/core.js` — the app's calculations (order totals, rep scores, dates, CSV) as
    plain functions, shared with the automated tests
- `tests/` — automated tests. Run them with `npm test` (needs Node.js, no installs).
  They also run automatically on GitHub for every change (see the "Actions" tab).

## 1. Turn on cross-device sync (Firebase)

Right now the app saves data with `localStorage`, which only works on one device.
To let Mariam, Renova, and you all see the same clinics/visits/tasks from different
phones, connect it to a free Firebase project:

1. Go to https://console.firebase.google.com and sign in with a Google account
   (create one for UltraMed if you don't want to use a personal account).
2. Click **Add project**, name it something like `ultramed-field-ops`, and finish
   the wizard (Google Analytics is optional — you can skip it).
3. In the left sidebar, click **Build → Firestore Database → Create database**.
   Choose a region close to Kuwait (e.g. `europe-west3` or `me-central1` if offered),
   and start in **production mode**.
4. In the left sidebar, click **Build → Authentication → Get started**, then enable
   the **Email/Password** sign-in provider (under "Sign-in method") — the team signs
   in with their work e-mail (`@ultramed-kw.com`). Keep **Anonymous** off. Add each
   person's login under **Authentication → Users → Add user** (the app never creates
   logins itself), then close self sign-up: **Authentication → Settings → User
   actions → untick "Enable create (sign-up)"**, so accounts are added by you, never
   by whoever finds the app.
5. Go to **Project settings** (gear icon) → scroll to **Your apps** → click the
   **</>** (web) icon → register an app (nickname anything, e.g. "field ops web").
   Firebase will show you a config object like:
   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "ultramed-field-ops.firebaseapp.com",
     projectId: "ultramed-field-ops",
     storageBucket: "ultramed-field-ops.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abc123"
   };
   ```
6. Open `www/js/app/01-config.js`, find `FIREBASE_CONFIG` near the top
   block, and paste your real values in place of the `"YOUR_..."` placeholders.
7. In Firestore, go to the **Rules** tab and paste the whole of `firestore.rules`
   (repository root). In the pasted text, replace `SUPERVISOR_EMAIL@ultramed-kw.com`
   with the login e-mail of every supervisor, in lowercase — in the console only,
   never in the file (the repository is public). Only password logins on
   `@ultramed-kw.com` get in; reps cannot change the team list, targets, sales files,
   account links, prescription types or settings. The file's header lists every
   document and who writes it, and what rules cannot enforce. It is proven on the
   Firestore and Auth emulators, against the app's own storage code — run
   `cd tests/rules && npm ci && npm test` (needs Java 21; never touches the real
   project). A new kind of document in a future version must be added to the rules
   first (the test's source scan names it).
8. Publish the rules, save `index.html`, and reload the app. Console should log
   "UltraMed Field Ops: syncing via Firebase Firestore" instead of the local-only
   message.

Once this is done, host `www/` somewhere reachable (see below) and every device
that opens that URL shares the same data.

## 2. Host it online (so it's reachable "from anywhere")

The app is published by **GitHub Pages**: every push to `main` runs the tests and
`.github/workflows/pages.yml` publishes the built site (`scripts/build.js`, www → dist)
to https://ghaithalmanfe.github.io/ultramed-app/ — https, so install prompts and the
service worker work. Firebase Hosting is not used. The site is public: never put
sales files or other real data in `www/` (the build refuses spreadsheets and ERP lines).

## 3. Installable app (PWA) — works today, no store needed

Once hosted over https, opening the URL in Chrome (Android) shows an **Install**
prompt automatically; on iPhone, Safari → Share → **Add to Home Screen** does the
same. It behaves like an installed app: full-screen, own icon, offline-capable.

## 4. No store app

The team uses the installable web app of section 3 on every phone. The native Android
project and its Capacitor tools were removed in v127 (the owner's decision of 18 Nov 2026:
unused, and their build tools carried known vulnerabilities); they are in the git history
before v127 if a store app is ever wanted. An APK built from that project held a frozen copy
of the app of its day, so nobody should use one.

## Daily e-mail reports (v87)

Two automatic digests go out every working day (Sunday–Thursday), Kuwait time:

| When | What | Who gets it |
|---|---|---|
| 07:30 | Morning: target % (same basis as the Today card), today's plan, follow-ups due/overdue, missed plans, due tasks | each rep her own; the supervisor the whole team |
| 18:30 | End of day: visits/calls/orders/sales logged today, plan vs. reality, no-order reasons, follow-ups scheduled, tomorrow's plan | same |

The digest is built by `UMCore.dailyDigest` in `www/js/core.js` — the very code the app uses for its own
figures — and sent by the GitHub Actions workflow `.github/workflows/daily-report.yml`
(`scripts/daily-report/`). The app's Admin → **Email reports** tab shows the last run, previews any
digest, and its **Send now** button opens the workflow's page on GitHub (Run workflow → morning/evening).
A run that fails is marked red on GitHub, which e-mails the repository owner.

### One-time setup (GitHub → repository Settings → Secrets and variables → Actions)

| Secret | Value |
|---|---|
| `REPORT_LOGIN_EMAIL` / `REPORT_LOGIN_PASSWORD` | a **dedicated** Email/Password user created in Firebase Authentication for this job — never a person's login — on `@ultramed-kw.com`, and its address pasted into `JOB_EMAILS()` in the published security rules (Firebase console → Firestore → Rules). The rules give it read-only access: it reads everything the digest needs and writes only its own `mailLog`. Until it is listed there it cannot log its runs. |
| `RESEND_API_KEY` | API key from [resend.com](https://resend.com) (free tier: 3,000 e-mails/month) |
| `MAIL_FROM` | e.g. `UltraMed Field Ops <reports@ultramed-kw.com>` — the domain must be verified in Resend (add the SPF/DKIM DNS records Resend shows) |
| `MAIL_ALL_DAYS` (a *variable*, not a secret) | optional `1` to also send on Fridays/Saturdays |
| `MAIL_TO_OVERRIDE` (a *variable*) | optional, testing only: every digest goes to this one address |

Recipients and their addresses come from Admin → Team (the `staff` list). After adding the secrets,
use **Send now** in the app (or Actions → Daily e-mail reports → Run workflow) to confirm delivery.
The Actions log is public for a public repository, so it prints names and outcomes only, never addresses. Each run is logged to the `mailLog`
document (last 30 runs) and shown in the app.
