# 12. Glossary

| Term | Meaning |
|---|---|
| ADR | Architecture decision record: one decision with context and consequences (section 9). |
| arc42 | Template for architecture documentation, twelve sections. |
| AES-256-GCM | Encryption method that also detects tampering; used for paid lessons. |
| Access code | Text the buyer enters; holds the course name and key (`base64url({v:1,b:name,k:key})`). |
| AGENTA | iSAQB curriculum for agentic AI architecture (2026.1-rev5). Level 4 is independent of it. |
| CP / checkpoint | A numbered delivery (cpNN) recorded in `CHECKPOINTS.md`. |
| CSP | Content Security Policy: browser rule limiting what a page may load. |
| D1 | Cloudflare's SQL database. |
| `dist/` | Built site folder; git-ignored. |
| Direct upload | Publishing `dist/` with Wrangler rather than through GitHub integration. |
| Engine (course) | Shared browser code that shows slides, quizzes and labs for a course. |
| Fingerprint / manifest root | SHA-256 over all served files in `site-manifest.json`; equal root means identical site. |
| Kit | Shared shell (`site/kit/`): styles, scripts, markdown renderer. |
| Master key | Secret from which per-course keys are derived; in `.course-key` or `COURSE_KEY`. |
| Overlay zip | Zip of only changed files, unpacked over the repo root. |
| Pages Functions | Server code run by Cloudflare Pages (`functions/`). |
| Preview deployment | Deployment on a non-main branch or other project with its own `*.pages.dev` address; never the public site. |
| PROOF | Value gating the leaderboard: sha256 of `board-v1:` + key. |
| Sync | The generation chain run by `npm run sync`. |
| Workers AI | Cloudflare's hosted model service; reads receipts. |
