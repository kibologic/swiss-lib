---
"@swissjs/router": patch
---

Reconcile persisted history with the live browser (ROUTER-HISTORY-RESTORE). The browser URL
(path + query) now always wins for the current entry; a snapshot restored in a new tab/device
keeps its entries as back-history and back()/forward()/go() into restored-only entries navigate
with replaceState instead of hanging on a popstate that never arrives; a same-tab reload no
longer clobbers the native index marker; popstate and persistence keep the query string; the
stack is capped at MAX_HISTORY_ENTRIES (200).
