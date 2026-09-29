---
"@swissjs/core": patch
---

Fix a list of component siblings losing all but one member when it grows on update
(FRAME-component-list-sibling-instance-steal). When a `Button`/chip list gained items (actions
arriving after data load, a conditional extra chip, shrink-then-grow), every newly added
same-type sibling was handed the already-mounted sibling's instance and DOM node -- by
`transferDOMReferencesFromOldTree`'s type search and by `createDOMNode`'s live-DOM instance
search -- so N positions collapsed onto one DOM node and only the last write survived (the
"first Button of a list does not render" report from office). Instances already backing a
sibling are now excluded from both searches, and a position that matched no old child is
created fresh without the instance search.
