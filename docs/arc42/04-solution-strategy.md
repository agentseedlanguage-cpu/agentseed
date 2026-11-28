# 4. Solution strategy

| Goal | Approach |
|---|---|
| Trustworthiness | Data-driven pages (catalogue, academy data) plus checks that fail the build when text and data disagree (`check*.mjs`, per-course tests). |
| Integrity of delivery | One `dist/` build, a content fingerprint (`site-manifest.json`), a single deploy command that verifies the live fingerprint (ADR-004, ADR-014). |
| Confidentiality | AES-256-GCM lesson files; keys derived per course; secrets injected only into the uploaded Function and restored (ADR-007, ADR-016). |
| Changeability | Course engine pattern: one engine, many course modules (ADR-008). Academy ownership and a registry are proposed to remove shared-file collisions (ADR-015, ADR-018). |
| Simplicity | Plain Node scripts, no framework, static output, three small APIs. |

Key shape: build time does the heavy work (generate, encrypt, prerender, fingerprint); run time is static files plus three small APIs.
