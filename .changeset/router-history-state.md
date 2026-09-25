---
"@swissjs/router": minor
---

ROUTER-HISTORY-STACK: `Router.entries`/`historyIndex`/`back()`/`forward()`/`go(n)`/
`canGoBack`/`canGoForward`, kept consistent with native `popstate`.

ROUTER-PER-ENTRY-STATE: `push()`/`replace()` accept an optional serializable `state`
payload per history entry; `onStateRestore()` restores it on `back()`/`forward()`/`go()`.
Persistence is pluggable via an optional `historyAdapter: HistoryStateAdapter` in
`RouterOptions` -- the router never hard-codes `localStorage`.
