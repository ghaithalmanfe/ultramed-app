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
   the **Anonymous** sign-in provider (under "Sign-in method"). This lets the app
   identify devices without you having to build a login/password system.
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
6. Open `www/index.html`, find `FIREBASE_CONFIG` near the top of the `<script>`
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
   This lets any signed-in (anonymous) app user read/write the shared data, and
   blocks everyone else. It's not bank-grade security, but it's reasonable for a
   small internal team tool with no payment or highly sensitive data in it.
8. Publish the rules, save `index.html`, and reload the app. Console should log
   "UltraMed Field Ops: syncing via Firebase Firestore" instead of the local-only
   message.

Once this is done, host `www/` somewhere reachable (see below) and every device
that opens that URL — and the Android app, once rebuilt — shares the same data.

## 2. Host it online (so it's reachable "from anywhere")

Easiest free option, since you already have a Firebase project: **Firebase Hosting**.
Once Node.js is set up (already installed on this machine):

```bash
npm install -g firebase-tools
firebase login
firebase init hosting   # choose the existing project, public dir = www, single-page app = No
firebase deploy
```

This gives you a URL like `https://ultramed-field-ops.web.app` that works from any
phone or laptop, with a free SSL certificate (required for install prompts / service
workers to work — they don't work over plain `http://` or `file://`).

## 3. Installable app (PWA) — works today, no store needed

Once hosted over https, opening the URL in Chrome (Android) shows an **Install**
prompt automatically; on iPhone, Safari → Share → **Add to Home Screen** does the
same. It behaves like an installed app: full-screen, own icon, offline-capable.

## 4. Real Android APK (native, not just a browser shortcut)

The `android/` folder is a real native Android Studio project. To rebuild it after
changing `www/index.html`:

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

