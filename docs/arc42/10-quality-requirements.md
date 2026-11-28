# 10. Quality requirements

## 10.1 Quality tree (ISO/IEC 25010 headings)
Reliability (a deploy never publishes a wrong or stale site) · Security (confidentiality of lessons and keys; integrity of purchases) · Maintainability (modularity, modifiability, testability across academies) · Performance efficiency (static, fast first load) · Compatibility (older browsers with Web Crypto) · Usability (plain language, accessibility) · Functional suitability (claims match product).

## 10.2 Scenarios

| ID | Scenario | Response measure | Today |
|---|---|---|---|
| Q-01 | Owner deploys; domain still serves an older build | Deploy ends NOT LIVE YET and exit code 3; never prints VERIFIED | Met (cp43; was weak: kit version compared) |
| Q-02 | Deploy typed with a preview branch or another project | Refused before upload | Met (cp43) |
| Q-03 | Deploy from a checkout behind origin/main | Refused with instruction | Met (cp43) when origin is reachable |
| Q-04 | A chat adds a course while another edits a different academy | Neither overlay overwrites the other's lines | Not met (shared files, R-01); target ADR-019, ADR-015 |
| Q-05 | A new course is added | At most one new folder and one manifest; no edits to shared files | Not met (9 shared places); target ADR-015 |
| Q-06 | Deploy interrupted | No real secret left in the working tree | Not met (R-03); target ADR-016 |
| Q-07 | Text claims a lesson count or status | Build fails if it disagrees with data | Met for academies and catalogue |
| Q-08 | Rebuild the environment from nothing | Documented steps, under half a day | Not met (bindings are manual, R-02) |
| Q-09 | Any page tries to load a third-party script | Blocked by CSP and caught by check | Met |
| Q-10 | A learner enters a wrong access code | Lesson stays encrypted; clear message | Met |
| Q-11 | Change to the shared engine text | Every dependent engine still builds; tests fail otherwise | Partly met (tests exist per course; patch strings unchecked, R-07) |
