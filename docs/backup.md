# Database backup (outside Firebase)

> **بالعربية باختصار:** نسخة احتياطية مشفّرة من قاعدة البيانات كلها (كل مستندات
> `state`) تُحفظ خارج Firebase، في GitHub كملف مرفق بكل تشغيل: يومياً الساعة 02:15
> بتوقيت الكويت (تبقى 14 يوماً)، وأسبوعياً فجر الجمعة (60 يوماً)، وشهرياً أول كل شهر
> (90 يوماً). لا تعمل حتى يضاف السر `BACKUP_PASSPHRASE`: عبارة مرور طويلة عشوائية تُحفظ
> أيضاً خارج GitHub، فبدونها لا تُفتح أي نسخة. المستودع عام، فيستطيع أي شخص تنزيل الملف
> المشفّر، والعبارة هي حمايته الوحيدة. أقصى ما قد يضيع من البيانات: يوم واحد.

## What is backed up

Every document of the Firestore collection `state` in project `ultramed-field-ops`,
which is where the app keeps everything: clinics and doctors, visits (this month's
document, every month's `visitsArch:` archive and the index), tasks, day plans,
events, targets, staff, products, the ERP sales index and every `erpRows:` chunk,
ERP account links and their log, recycle bin and delete logs, photos (`photo:`
documents), the app's own `snap_` backups, settings and logs.

Each document is kept whole, exactly as stored (its `value` string is never parsed
or rewritten), with its create and update times. All pages are read at one instant
(a Firestore read time), so a save made during the backup cannot leave it half old,
half new. The listing is cross-checked against Firestore's own document count.

Not backed up: Firebase Authentication accounts (logins and passwords), Firestore
security rules, project settings, anything outside `state`, and the phones' local
copies.

## Where it lives, and when

`.github/workflows/backup.yml` runs `scripts/backup/run.js` and keeps one encrypted
file per run as an **artifact** of that run (GitHub → Actions → "Database backup").
Cron times are UTC; Kuwait is UTC+3 all year.

| Kind | Cron (UTC) | Kuwait time | Kept |
|---|---|---|---|
| daily | `15 23 * * *` | 02:15 every day | 14 days |
| weekly | `45 23 * * 4` | 02:45 every Friday | 60 days |
| monthly | `15 0 1 * *` | 03:15 on the 1st | 90 days (GitHub's maximum) |

Each is a fresh backup of its own. "Run workflow" on the same page makes one now
(choose the kind). The file is named like `ultramed-state-daily-20261111-231502Z.umbackup`
(UTC time). It is gzip-compressed, then encrypted with AES-256-GCM under a key derived
by scrypt from the passphrase; a random salt and IV are stored in the file's header.
The clear data never touches the runner's disk, and the run log shows only counts,
sizes and checksums per key prefix, never a value, an address or a token.

A run that fails (a page that cannot be read after retries, a count that disagrees,
an empty listing, a file that does not decrypt back) writes nothing and turns red;
GitHub notifies a failed scheduled run to the person who added the schedule, or
last changed or re-enabled it (see your Actions notification settings). Until the
secrets are added, every run says "not configured", keeps nothing and stays green.

## One-time setup (owner)

GitHub → the repository → **Settings → Secrets and variables → Actions → New
repository secret**:

- `BACKUP_PASSPHRASE` (required): a long random passphrase, 20 characters at least
  (let a password manager make 30 or more). Keep a copy outside GitHub as well:
  without it no backup can ever be opened, and GitHub will not show a secret again.
  If you change it later, older files still need the old one until they expire.
- `BACKUP_LOGIN_EMAIL` and `BACKUP_LOGIN_PASSWORD` (recommended): an app login used
  only by the backup (Firebase console → Authentication → Users → Add user). Without
  them the backup signs in with `REPORT_LOGIN_EMAIL` / `REPORT_LOGIN_PASSWORD`, the
  daily e-mails' login, if those are set.

Then Actions → "Database backup" → **Run workflow** once and check that the run is
green and lists an artifact. The schedule only runs from the default branch (`main`).

## Download and verify a backup

1. Actions → "Database backup" → a green run → **Artifacts** → download the one you
   want (a .zip holding one `.umbackup` file), or with the GitHub CLI, which unzips
   it: `gh run download <run-id> --dir ~/ultramed-backups`.
2. With Node.js 22 and a copy of this repository (nothing to install):

   ```sh
   node scripts/backup/verify.js ~/ultramed-backups/ultramed-state-daily-20261111-231502Z.umbackup
   ```

   It asks for the passphrase without showing it (or reads `BACKUP_PASSPHRASE`),
   checks the encryption tag, the data's sha256 and the manifest, prints the
   number of documents and their size per key prefix, and ends with
   "The backup is sound." A wrong passphrase and a changed or damaged file are
   told apart and refused (exit code 1).
3. To get the clear-text bundle (for a restore, or to look inside), add
   `--out ~/ultramed-restore/bundle.json`. That file is the whole database in clear
   text: it is created readable by you only, refused inside this repository's folder
   (the repository is public), and should be deleted when you are done.

## Restore into a separate project

Never restore into production to "have a look". Use a separate Firebase project:

1. Firebase console → **Add project** (e.g. `ultramed-restore-check`) → Firestore
   Database → Create database → Authentication → enable Email/Password → add a user.
2. Its Firestore rules must let that user read and write `state`, e.g.
   `match /state/{doc} { allow read, write: if request.auth.uid == '<that user's UID>'; }`.
3. Project settings → General → copy its **Web API key**.
4. Restore (the input is the bundle from step 3 above, or the `.umbackup` file itself,
   decrypted in memory after asking for the passphrase):

   ```sh
   export RESTORE_PROJECT_ID=ultramed-restore-check
   export RESTORE_API_KEY=<that project's Web API key>
   export RESTORE_LOGIN_EMAIL=<the user you added>
   read -rs RESTORE_LOGIN_PASSWORD && export RESTORE_LOGIN_PASSWORD
   node scripts/backup/restore.js ~/ultramed-restore/bundle.json --dry-run
   node scripts/backup/restore.js ~/ultramed-restore/bundle.json
   ```

   It writes every document whole, in atomic batches, then reads the project back and
   compares each document with the backup ("all N restored documents are identical").

Refusals: the production project `ultramed-field-ops` (or its API key) unless
`--i-understand-this-overwrites-production` is given; a target whose `state` already
has documents unless `--force` (which replaces the documents with the same names and
leaves the others). Overwriting production therefore needs both flags, and replaces
every change made since the backup; `--only=clinics,visitsArch:` limits a restore to
named documents (a name ending in `:` or `_` is a prefix). Decide that with a
developer first.

## Recovery objectives

- **RPO 24 hours**: one backup a day; GitHub can start a scheduled run late (minutes,
  rarely an hour), and a failed run extends the gap until the next good one.
- **RTO about 30–60 minutes** for someone with the passphrase and this page:
  downloading and verifying take a minute or two, preparing a restore project
  15–30 minutes the first time, and the restore itself well under a minute for a
  database of this size (hundreds of documents, tens of MB).

## Limits and recommendations

- **Retention**: artifacts last at most 90 days (and less if the repository's
  Settings → Actions → General → "Artifact and log retention" is lower). For a longer
  history, also copy each encrypted file to a private Google Cloud Storage bucket in a
  separate Google account (object versioning and a retention policy on), or to any
  other off-site storage: the file is encrypted and safe to copy anywhere.
- **Public repository**: anyone signed in to GitHub can download the encrypted files
  and see their names, sizes and times; only the passphrase protects the contents.
- **Inactivity**: GitHub disables scheduled workflows of a public repository after 60
  days without repository activity (it e-mails a warning first); re-enable it on the
  workflow's page.
- **The backup login can also write**: today's Firestore rules let any signed-in
  account read and write `state`. Giving the backup account read-only access in the
  rules would limit the damage if its password leaked.
- **The in-app `snap_` backups** stay as they are; they live in the same database and
  are included in this backup.

## For developers

- `scripts/backup/bundle.js`: bundle, manifest, file format and encryption (pure).
  `scripts/backup/firestore.js`: REST sign-in, paged listing, count, commits, retries
  and a log scrubber. `run.js`, `verify.js`, `restore.js`: the three commands
  (`--help` on each). The project id and API key are read from
  `www/js/app/01-config.js`.
- `tests/backup.test.js` (part of `npm test`) runs the three commands against a local
  fake of Firestore's REST API and identitytoolkit, with a guard that blocks any
  non-local request. `FIRESTORE_EMULATOR_HOST` + `FIREBASE_AUTH_EMULATOR_HOST` (both,
  local addresses only) point the scripts at a local emulator.
