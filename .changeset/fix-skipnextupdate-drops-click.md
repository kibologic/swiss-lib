---
"@swissjs/core": patch
---

fix(runtime): scope `_skipNextUpdate` to the child-creation tick so it can no longer silently drop a later explicit update. Fixes the intermittent "clicking a nav icon / tab does nothing, the same click again works, a reload fixes it" bug: `_skipNextUpdate` was armed on child creation but only consumed by the explicit `performUpdate()` path (never by the signal-driven `commitVNode()` path), so when the redundant post-init update never arrived the flag lingered and swallowed the next real prop-driven update to that child.
