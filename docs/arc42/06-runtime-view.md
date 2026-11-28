# 6. Runtime view

## 6.1 Build and release
1. Author edits sources. 2. `npm run gate`: tests, `sync` (generate in the fixed order, encrypt courses, prerender, fingerprint, assemble `dist/`), `check`. 3. `npm run deploy -- home`: upload `dist/` to the project on branch main. 4. The tool fetches `https://meeting-mind.com/site-manifest.json` and compares its `root` hash with the local one; only equal means VERIFIED.

## 6.2 Learning a paid lesson
Browser loads the course page, the learner enters an access code (`base64url({v:1,b:name,k:key})`), the browser derives the key and decrypts the lesson file it fetched (AES-256-GCM, Web Crypto). Free lessons are not encrypted. The access code is kept in the browser (storage key per course, for example `iwa-course-code`); lesson text is never decrypted on the server.

## 6.3 Buying a course
Buyer picks an offer (`OFFERS` in `pay-api.js`), pays by bank deposit, uploads a receipt. `pay-api` stores the request in D1, asks Workers AI to read the receipt, sends an ntfy alert. The owner opens the review page, approves, and the access code is issued (`tools/code.mjs` builds codes from the course keys). Amounts are checked against `OFFERS`.

## 6.4 Certificate and leaderboard
The learner's browser reports progress; `cert-api` checks it against `ISSUABLE` (lesson, section, check, question counts) and records a self-reported certificate. The leaderboard accepts entries only from browsers holding a real access code: the gate value `PROOF` is sha256 of `board-v1:` + key, written into the uploaded Function at deploy time.

## 6.5 Verifying a visit
`/verify-site/` fetches `site-manifest.json` and re-hashes the served files so anyone can see that the deployed site matches what the owner built.
