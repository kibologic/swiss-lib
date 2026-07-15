---
"@swissjs/core": patch
---

fix(runtime): stop index-derived DOM identity from corrupting reconciliation across dual commit pipelines

`ae25088` fixed the deletion manifestation of the dual-commit-pipeline race (a stale
`vnode.dom` reference caused a live child to be deleted). This closes the remaining
insertion/anchor manifestation, root-caused live in `UsersPage`'s restored-tab lifecycle
("WorkspaceHeader vanishes, KPI cards scatter/overlap"):

- `updateElementNode`'s old/new-child DOM restore loops (`dom-updates.ts`) recovered a
  missing `.dom` reference by matching `dom.childNodes[index]` against tag name only, with
  no key/class/id check. Position is only a valid proxy for identity when the logical
  children count matches the live DOM count; the restore now only fires under that parity.
- `reconcileChildren` (`reconciliation.ts`) now aborts its diff/mutation pass entirely when
  `oldChildren.length` doesn't match the live child count. That mismatch proves this pass's
  view of the parent is stale relative to a more current commit — no amount of smarter
  per-child matching makes partially applying a stale view safe, since the "remove leftover
  nodes" step would still delete whatever the more current commit already added. Both
  commit pipelines always re-render fresh immediately before committing, so bailing out
  defers the stale pass's update to the next, accurate commit rather than losing it.

Covered by `insertion-anchor-repro.test.ts`, a sibling to `record-header-repro.test.ts`.
