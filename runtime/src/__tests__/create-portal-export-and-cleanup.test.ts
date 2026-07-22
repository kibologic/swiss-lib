/**
 * @vitest-environment jsdom
 */
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// FRAME-006-A (FABLE-BOUNDARY-001): createPortal is implemented (component/portals.ts) and its
// cleanup is wired into unmountComponent()'s _portals map, but had no test anywhere -- Article 17
// treats that as a bug regardless of whether the implementation currently works. This is that test.
//
// The finding's own claim was narrower and stronger: createPortal is *"absent from the built
// dist/index.js apps install."* Reproduced directly against a real `tsc -b` build of this package
// (not a textual grep of the aggregating barrel files, which can never show a re-exported name as
// literal text regardless of whether the export chain works -- a mistake made twice while
// investigating this task before catching it): both `import { createPortal } from
// '.../runtime/dist/index.js'` (runtime) and a `tsc --noEmit` type-check against that same built
// output (types) succeed today, with or without the redundant re-export removed from component.ts
// below. The claimed defect does not currently reproduce -- filed as a correction, not silently
// dropped (Article 16: "revise findings down when evidence disproves them").
//
// What IS real and fixed here: component.ts imported createPortal/useSlot from portals.ts only to
// re-export them again under the same names -- redundant, and the reason it looked suspicious in
// the first place (component/index.ts's `export * from './component.js'` and
// `export * from './portals.js'` both used to carry a same-named `createPortal` binding). Removed
// as hygiene; verified no observable behavior change (this test passes identically either way).
import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { SwissComponent } from "../component/component.js";
import { createPortal } from "../component/portals.js";
import { jsx } from "../vdom/vdom.js";

describe("FRAME-006-A — createPortal is exported and its cleanup is wired into unmount", () => {
  it("is importable as a named export from the public component barrel", async () => {
    const mod = await import("../component/index.js");
    expect(typeof mod.createPortal).toBe("function");
    expect(typeof mod.useSlot).toBe("function");
  });

  it("registers the portal on the owning CHILD component and cleans it up when that child unmounts", () => {
    // createPortal() registers on getCurrentComponentInstance(), which is only set while a
    // component is being created/rendered as part of a PARENT's tree (component-rendering.ts's
    // renderComponentImpl) -- not during a ROOT component's own initial mountComponent() call,
    // which invokes safeRender() directly with no current-instance context. Real app usage
    // (a Modal-like component nested under a page) is the child shape, so that's what this
    // exercises -- mirrors the Host/Leaf pattern already established in
    // skip-next-update-repro.test.ts for the same reason.
    const portalTarget = document.createElement("div");
    document.body.appendChild(portalTarget);

    let leaf: Leaf | null = null;
    class Leaf extends SwissComponent {
      constructor(props: object) {
        super(props);
        leaf = this;
      }
      render() {
        createPortal(jsx("span", { children: "portal content" }), portalTarget);
        return jsx("div", { class: "leaf-root" });
      }
    }

    class Host extends SwissComponent {
      render() {
        return jsx("div", { class: "host", children: [jsx(Leaf, {})] });
      }
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    const instance = new Host({});
    instance.mount(container);

    expect(leaf).not.toBeNull();
    expect(portalTarget.querySelector("span")?.textContent).toBe("portal content");

    // The real unmount path on the CHILD that actually owns the portal registration --
    // component-lifecycle.ts's unmountComponent(), the function that iterates _portals and
    // clears each container.
    leaf!.unmountComponent();

    expect(portalTarget.innerHTML).toBe("");

    container.remove();
    portalTarget.remove();
  });

  it("the returned cleanup function also removes portal content when called directly", () => {
    const portalTarget = document.createElement("div");
    document.body.appendChild(portalTarget);
    let cleanup: (() => void) | null = null;

    class Host extends SwissComponent {
      render() {
        cleanup = createPortal(jsx("span", { children: "x" }), portalTarget);
        return jsx("div", {});
      }
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    const instance = new Host({});
    instance.mount(container);

    expect(portalTarget.children.length).toBeGreaterThan(0);
    cleanup!();
    expect(portalTarget.innerHTML).toBe("");

    container.remove();
    portalTarget.remove();
  });
});
