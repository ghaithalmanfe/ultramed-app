# UltraMed Field Ops — setup guide

## What's in this folder

- `www/` — the app itself (this is what runs in the browser or inside the Android app)
  - `www/js/core.js` — the app's calculations (order totals, rep scores, dates, CSV) as
    plain functions, shared with the automated tests
- `android/` — the native Android project (built with Capacitor), produces the installable APK
- `capacitor.config.json` — links the web app to the native shell
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
   the **Email/Password** sign-in provider (under "Sign-in method") — that is how the
   team signs in. Keep **Anonymous** off. Add each person's login under
   **Authentication → Users → Add user** (the app never creates logins itself), then
   close self sign-up: **Authentication → Settings → User actions → untick "Enable
   create (sign-up)"**. Without that, anyone who reads the app's public config could
   create a login and, with the rules below, read and change all the data.
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
7. In Firestore, go to the **Rules** tab and set:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /state/{document=**} {
         allow read, write: if request.auth != null;
       }
     }
   }
   ```
   This lets any signed-in user read/write the shared data and blocks everyone else —
   so it is only as safe as step 4: Anonymous off and self sign-up closed, so the
   only logins are the ones you added. The data includes customers, sales and the
   team's details; treat it as confidential. Stronger: also require a verified
   company address (put your own domain in place of `example.com`) —
   `allow read, write: if request.auth != null && request.auth.token.email_verified == true && request.auth.token.email.matches('.*@example[.]com$');`
   Logins added in the console start unverified, so switch this on only after every
   login (the daily e-mail one included) has verified its address — otherwise the
   whole team is locked out.
8. Publish the rules, save `index.html`, and reload the app. Console should log
   "UltraMed Field Ops: syncing via Firebase Firestore" instead of the local-only
   message.

Once this is done, host `www/` somewhere reachable (see below) and every device
that opens that URL — and the Android app, once rebuilt — shares the same data.

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

## 4. Real Android APK (native, not just a browser shortcut)

The `android/` folder is a real native Android Studio project. To rebuild it after
changing anything under `www/`:

```bash
npx cap sync android
cd android
./gradlew assembleDebug
```

The output APK lands at `android/app/build/outputs/apk/debug/app-debug.apk` — copy
it to a phone and install it directly (Android will ask you to allow installs from
this source once).

## 5. Publishing to Google Play

1. Create a Google Play Developer account (one-time $25 fee, your Google account):
   https://play.google.com/console/signup
2. Build a **release** (signed) bundle instead of debug:
   ```bash
   cd android
   ./gradlew bundleRelease
   ```
   You'll need to generate a signing keystore first — Android Studio can do this
   for you (Build → Generate Signed Bundle), or `keytool` on the command line.
3. Create the app listing in Play Console, upload the `.aab` file from
   `android/app/build/outputs/bundle/release/`, fill in the store listing
   (screenshots, description, privacy policy URL), and submit for review.
   Google's review typically takes a few hours to a couple of days.

## 6. iOS App Store

Not possible from this Windows machine — Apple requires Xcode, which only runs on
macOS. Options when you're ready:
- Build on an actual Mac (`npx cap add ios`, then open in Xcode).
- Use a cloud Mac build service (e.g. Codemagic, Ionic Appflow, GitHub Actions
  macOS runners) that builds and signs the iOS app without you owning a Mac.
Either way you'll also need an Apple Developer Program membership ($99/year).



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
| `REPORT_LOGIN_EMAIL` / `REPORT_LOGIN_PASSWORD` | an app login that may read the data (the supervisor's, or a dedicated one added in Firebase Authentication → Users; the run also writes its own `mailLog`) |
| `RESEND_API_KEY` | API key from [resend.com](https://resend.com) (free tier: 3,000 e-mails/month) |
| `MAIL_FROM` | e.g. `UltraMed Field Ops <reports@ultramed-kw.com>` — the domain must be verified in Resend (add the SPF/DKIM DNS records Resend shows) |
| `MAIL_ALL_DAYS` (a *variable*, not a secret) | optional `1` to also send on Fridays/Saturdays |
| `MAIL_TO_OVERRIDE` (a *variable*) | optional, testing only: every digest goes to this one address |

Recipients and their addresses come from Admin → Team (the `staff` list). After adding the secrets,
use **Send now** in the app (or Actions → Daily e-mail reports → Run workflow) to confirm delivery.
The Actions log is public for a public repository, so it prints names and outcomes only, never addresses. Each run is logged to the `mailLog`
document (last 30 runs) and shown in the app.
