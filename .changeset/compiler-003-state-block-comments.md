---
"@swissjs/compiler": patch
---

COMPILER-003: comments between declarations inside a `state {}` block are skipped as trivia. Previously the declaration loop stopped at the first comment and silently dropped every later declaration (they never became Signal-backed state); after COMPILER-002 that became a SWISS_002 error that broke real components (office App.uix).
