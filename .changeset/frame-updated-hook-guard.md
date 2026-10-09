---
"@swissjs/core": patch
---

FRAME-UPDATED-HOOK-GUARD: the UpdateManager loop guards (the `updated`-hook commit guard and the `performUpdate` render gate) now use a true sliding 1-second window. Previously the counter reset only after a >1s gap since the last counted event, so any component committing at least once per second for a minute was reported as "60/s" and, for the commit guard, had its `updated` hook silently skipped until a quiet second. The guards now trip only on 60 or more events within one second (a genuine loop) and recover as soon as the rate drops.
