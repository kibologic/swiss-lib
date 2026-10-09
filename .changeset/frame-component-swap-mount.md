---
"@swissjs/core": patch
---

FRAME-COMPONENT-SWAP-MOUNT: when a component's render() swapped one child component class for a
different class at the same position with no wrapper element (`return v === 'a' ? <A/> : <B/>`),
the runtime reused the host DOM node and painted B's output, but never constructed-and-mounted B
through createDOMNode, so B's mounted/onMount hook never ran (and A's unmounted never ran). Office's
Users tabs showed the new page with its data load never started. updateDOMNode now replaces the
node when a component vnode's class differs from the instance hosted on it; same-class updates and
component-renders-component chains still update in place.
