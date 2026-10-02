---
"@swissjs/core": patch
---

FRAME-011: a component whose render() returns a multi-node Fragment root spread N DOM nodes into its
parent while the parent's vnode list counted one, so the reconcile staleness guard bailed on every
commit and everything beneath that parent froze silently (office PDF reader sidebar stuck on
"Loading table of contents..."). Components render ONE root element; the runtime now warns once per
offending component class at mount, and warns once per parent when the guard's retries are exhausted
instead of dropping the update without a trace.
