/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/**
 * Public DOM update entry-points consumed by renderer.ts.
 *
 * Internal reference-propagation helpers live in dom-update-refs.ts so
 * this file stays within the 700-line limit while remaining the single
 * import target for renderer.ts.
 *
 * Exports:
 *   updateDOMNode       — top-level dispatcher; routes to text/element/component updaters
 *   updateTextNode      — updates a Text node's content
 *   updateElementNode   — reconciles props + children for an element VNode
 *   updateComponentNode — re-renders a component VNode into its existing DOM node
 */

import type { SwissComponent } from "../component/component.js";
import type { VNode, VElement, ComponentVNode } from "../vdom/vdom.js";
import type { VNodeBase } from "../vdom/types/index.js";
import { asInternal } from "../component/internal.js";
import {
  isSignal,
  isTextVNode,
  isElementVNode,
  isComponentVNode,
  cleanupNode,
  filterValidVNodes,
} from "./types.js";
import { DiffingError } from "./errors.js";
import { clearRenderCache } from "./render-cache.js";
import {
  vnodeMetadata,
  componentInstances,
  domToHostComponent,
} from "./storage.js";
import {
  applyRenderedOutput,
  transferDOMReferencesFromOldTree,
} from "./dom-update-refs.js";
import { removeWithTransition } from "../transitions/transition-runtime.js";

// ─── Type aliases ─────────────────────────────────────────────────────────────

type UpdateTextNodeFn = (dom: Text, vnode: string | number) => void;
type UpdateElementNodeFn = (
  dom: HTMLElement,
  vnode: VElement,
  oldVNode?: VNode,
) => void;
type UpdateComponentNodeFn = (
  dom: HTMLElement,
  vnode: ComponentVNode,
  oldVNode?: VNode,
) => void;
type RenderComponentFn = (
  vnode: ComponentVNode,
  existingInstance?: SwissComponent,
) => VNode;
type CreateDOMNodeFn = (vnode: VNode | null | undefined | boolean) => Node;
type UpdateDOMNodeFn = (dom: Node, vnode: VNode) => void;

// ─── updateDOMNode ────────────────────────────────────────────────────────────

export function updateDOMNode(
  dom: Node,
  vnode: VNode,
  updateTextNodeFn: UpdateTextNodeFn,
  updateElementNodeFn: UpdateElementNodeFn,
  updateComponentNodeFn: UpdateComponentNodeFn,
): void {
  try {
    if (vnode == null || typeof vnode === "boolean") {
      const parent = dom.parentNode;
      if (parent) {
        // FRAME-transition-api: same deferral as reconciliation.ts's leftover-node pass --
        // a registered `transition` prop defers removal until the leave sequence settles;
        // untransitioned nodes take the exact synchronous path this replaced.
        removeWithTransition(dom, () => {
          if (dom.parentNode === parent) {
            parent.removeChild(dom);
          }
          cleanupNode(dom);
        });
      }
      return;
    }

    if (isSignal(vnode)) {
      updateDOMNode(
        dom,
        vnode.value as VNode,
        updateTextNodeFn,
        updateElementNodeFn,
        updateComponentNodeFn,
      );
      return;
    }

    const oldVNode = vnodeMetadata.get(dom);

    if (isTextVNode(vnode)) {
      updateTextNodeFn(dom as Text, vnode);
    } else if (isElementVNode(vnode)) {
      updateElementNodeFn(dom as HTMLElement, vnode, oldVNode);
    } else if (isComponentVNode(vnode)) {
      updateComponentNodeFn(dom as HTMLElement, vnode, oldVNode);
    }

    // Do NOT overwrite `dom`'s baseline with a component vnode. updateComponentNode /
    // applyRenderedOutput already stored the component's RENDERED element output (the real
    // child tree) as the baseline for `dom`. A component vnode's own `children` are its slot
    // content — usually empty — so storing it here clobbers that baseline with a zero/mismatched
    // child count. The next reconcile then reads that corrupted baseline, its live-vs-baseline
    // child count disagrees, and reconcileChildren's dual-commit staleness guard bails and
    // silently drops the update. That is the "click / nav produces no response" bug: a child
    // component (e.g. the shell AppStrip) froze after its first commit because its baseline was
    // overwritten with the parent's component vnode instead of its own rendered output.
    if (vnode != null && typeof vnode !== "boolean" && !isComponentVNode(vnode)) {
      vnodeMetadata.set(dom, vnode);
    }
    if (typeof vnode === "object" && vnode !== null && "dom" in vnode) {
      (vnode as { dom: Node }).dom = dom;
    }
  } catch (error) {
    console.error("DOM update error:", error);
    const updateErrorMessage =
      error instanceof Error ? error.message : "Unknown error";
    throw new DiffingError(`DOM update failed: ${updateErrorMessage}`, vnode);
  }
}

// ─── updateTextNode ───────────────────────────────────────────────────────────

export function updateTextNode(dom: Text, vnode: string | number) {
  if (dom.textContent !== String(vnode)) {
    dom.textContent = String(vnode);
  }
}

// ─── updateElementNode ────────────────────────────────────────────────────────

export function updateElementNode(
  dom: HTMLElement,
  vnode: VElement,
  oldVNode: VNode | undefined,
  reconcilePropsFn: (
    element: HTMLElement,
    oldProps: Record<string, unknown>,
    newProps: Record<string, unknown>,
  ) => void,
  reconcileChildrenFn: (
    parent: HTMLElement,
    oldChildren: VNode[],
    newChildren: VNode[],
  ) => void,
) {
  let oldProps: Record<string, unknown> = {};
  let oldChildren: VNode[] = [];

  if (oldVNode !== undefined && isElementVNode(oldVNode)) {
    oldProps = oldVNode.props || {};
    const rawOld = oldVNode.children;
    oldChildren = Array.isArray(rawOld)
      ? rawOld
      : rawOld != null && typeof rawOld !== "boolean"
        ? [rawOld]
        : [];

    // CRITICAL FIX: Restore DOM references on old children VNodes
    // Without this, reconcileChildren can't match old VNodes to existing DOM nodes
    //
    // FRAME-001 hazard: matching below is by raw array INDEX plus a bare tag-name (or
    // constructor) check -- it has no key/class/attribute signal to disambiguate same-tag
    // siblings. Position can only stand in for identity when the old (logical) children
    // and the current live DOM children are the same count: that's the minimum necessary
    // condition for index N in one array to plausibly correspond to index N in the other.
    // When counts differ -- e.g. this oldVNode is a STALE tree captured by an independent
    // commit pipeline that never individually tracked a sibling another pipeline already
    // committed live -- position carries no information at all, and guessing anyway binds
    // an unrelated live sibling's DOM node to this old child (see
    // insertion-anchor-repro.test.ts). Leaving .dom unset here is safe: reconcileChildren's
    // own key-based matching either finds the real match or falls back to creating a fresh
    // DOM node, rather than misappropriating a live one.
    //
    // CLICK-NO-RESPONSE FIX (registry/fable/click-bug/, 2026-07-17): oldChildren is the RAW
    // logical array and can contain `null`/`false` conditional-child placeholders that never
    // got a DOM node at creation (see filterValidVNodes, used by createDOMNode) -- comparing
    // its raw length against domChildren.length, and indexing domChildren by oldChildren's raw
    // index, therefore never lines up for an element with such a conditional among its direct
    // children. Restore against the same filtered view createDOMNode used.
    const domChildren = Array.from(dom.childNodes);
    const oldChildrenRendered = filterValidVNodes(oldChildren);
    const oldChildCountMatchesLiveDom = oldChildrenRendered.length === domChildren.length;
    oldChildrenRendered.forEach((oldChild, index) => {
      // If old child already has DOM reference, keep it
      const oldChildBase = typeof oldChild === "object" && oldChild !== null
        ? (oldChild as unknown as VNodeBase)
        : null;
      if (oldChildBase?.dom) return;

      // Try to restore from metadata first
      if (oldChildCountMatchesLiveDom && index < domChildren.length) {
        const childDom = domChildren[index];
        const metadataVNode = vnodeMetadata.get(childDom);
        if (metadataVNode && oldChildBase) {
          if (
            isComponentVNode(oldChild) &&
            isComponentVNode(metadataVNode) &&
            oldChild.type === metadataVNode.type
          ) {
            oldChild.dom = childDom;
            return;
          }
          if (
            isElementVNode(oldChild) &&
            isElementVNode(metadataVNode) &&
            oldChild.type === metadataVNode.type
          ) {
            oldChild.dom = childDom;
            return;
          }
        }

        // Fallback: match by type and position
        if (isElementVNode(oldChild) && childDom instanceof HTMLElement) {
          if (childDom.tagName.toLowerCase() === oldChild.type.toLowerCase()) {
            oldChild.dom = childDom;
          }
        } else if (isComponentVNode(oldChild) && childDom instanceof HTMLElement) {
          const direct = componentInstances.get(childDom);
          const host = domToHostComponent.get(childDom);
          const instance =
            (host && host.constructor === oldChild.type ? host : null) ||
            (direct && direct.constructor === oldChild.type ? direct : null);
          if (instance) {
            oldChild.dom = childDom;
            oldChild.__componentInstance = instance;
          }
        }
      }
    });
  }

  const newProps = vnode.props || {};
  const rawNew = vnode.children;
  const newChildren: VNode[] = Array.isArray(rawNew)
    ? rawNew
    : rawNew != null && typeof rawNew !== "boolean"
      ? [rawNew]
      : [];

  // CRITICAL: Transfer DOM refs from existing DOM to new children when new child has no .dom
  // Fixes root update clearing content (e.g. App → div.erp-root → EventBusProvider)
  //
  // Same FRAME-001 hazard as the old-children restore loop above: index+tag-name matching
  // is only meaningful when the new (logical) children count matches what's currently
  // live. When it doesn't, skip the transfer and let reconcileChildren's key-based
  // matching (or fresh creation) establish identity instead of guessing by position.
  //
  // CLICK-NO-RESPONSE FIX (registry/fable/click-bug/, 2026-07-17): same raw-vs-filtered
  // mismatch as the old-children loop above -- newChildren can contain `null`/`false`
  // conditional placeholders too, so compare/index against the filtered view.
  const domChildren = Array.from(dom.childNodes);
  const newChildrenRendered = filterValidVNodes(newChildren);
  const newChildCountMatchesLiveDom = newChildrenRendered.length === domChildren.length;
  newChildrenRendered.forEach((newChild, i) => {
    const newChildBase = typeof newChild === "object" && newChild !== null
      ? (newChild as unknown as VNodeBase)
      : null;
    if (newChildBase?.dom) return;
    if (!newChildCountMatchesLiveDom || i >= domChildren.length) return;
    const childDom = domChildren[i];
    if (isComponentVNode(newChild) && childDom instanceof HTMLElement) {
      const direct = componentInstances.get(childDom);
      const host = domToHostComponent.get(childDom);
      const instance =
        (host && host.constructor === newChild.type ? host : null) ||
        (direct && direct.constructor === newChild.type ? direct : null);
      if (instance) {
        newChild.dom = childDom;
        newChild.__componentInstance = instance;
      }
    } else if (isElementVNode(newChild) && childDom instanceof HTMLElement) {
      if (
        childDom.nodeType === Node.ELEMENT_NODE &&
        childDom.tagName.toLowerCase() === newChild.type.toLowerCase()
      ) {
        newChild.dom = childDom;
      }
    }
  });

  reconcilePropsFn(dom, oldProps, newProps);
  // Skip child reconciliation for containers that own their DOM (e.g. xterm). Prevents wiping imperative children.
  if (
    !(dom instanceof HTMLElement) ||
    dom.getAttribute?.("data-preserve-children") == null
  ) {
    reconcileChildrenFn(dom, oldChildren, newChildren);
  }

  vnode.dom = dom;

  if (oldVNode && isElementVNode(oldVNode) && oldVNode.key !== undefined) {
    vnode.key = oldVNode.key;
  }
}

// ─── updateComponentNode ──────────────────────────────────────────────────────

export function updateComponentNode(
  dom: HTMLElement,
  vnode: ComponentVNode,
  oldVNode: VNode | undefined,
  renderComponentFn: RenderComponentFn,
  createDOMNodeFn: CreateDOMNodeFn,
  cleanupNodeFn: (node: Node) => void,
  canUpdateInPlaceFn: (dom: Node, newVNode: VNode, oldVNode?: VNode) => boolean,
  updateDOMNodeFn: UpdateDOMNodeFn,
) {
  const oldRendered = vnodeMetadata.get(dom);

  let existingInstance: SwissComponent | undefined = vnode.__componentInstance;
  if (!(existingInstance && existingInstance.constructor === vnode.type)) {
    existingInstance = undefined;
  }

  if (!existingInstance) {
    const direct = componentInstances.get(dom);
    if (direct && direct.constructor === vnode.type) {
      existingInstance = direct;
    }
  }

  if (!existingInstance && oldVNode && isComponentVNode(oldVNode)) {
    const fromOld = oldVNode.__componentInstance;
    if (fromOld && fromOld.constructor === vnode.type) {
      existingInstance = fromOld;
    }
  }

  if (!existingInstance && oldRendered) {
    const fromRendered = (oldRendered as unknown as VNodeBase).__componentInstance;
    if (fromRendered && fromRendered.constructor === vnode.type) {
      existingInstance = fromRendered;
    }
  }

  if (existingInstance && existingInstance.constructor === vnode.type) {
    const eci = asInternal(existingInstance);
    eci._initialized = true;
    eci.__initialized = true;
    // STUCK-LOADING FIX (dual-commit-pipeline, 2026-07-18): do NOT wholesale-replace
    // existingInstance.props here. renderComponentFn (renderComponentImpl,
    // component-rendering.ts) already does a per-key merge onto the EXISTING reactive
    // proxy when given an existingInstance -- by design, per its own comment: "Replacing
    // the whole object would lose Signal tracking established by the render effect...
    // Mutating individual keys fires their setters, which notifies the render effect and
    // triggers a re-render." Assigning `existingInstance.props = vnode.props` HERE, before
    // that merge runs, discards the reactive proxy the child's OWN setupReactivity()
    // effect is subscribed to and replaces it with a plain object -- renderComponentFn's
    // own merge then sees existingProps already === incomingProps (no per-key diff left to
    // apply) and its setters never fire. This forced render still commits correctly via its
    // own untrack(() => instance.render()) call, but the child's independent reactive
    // effect is left permanently subscribed to an orphaned, discarded props object --
    // any FUTURE update reaching this component through its OWN signal effect (rather
    // than through another parent-driven push like this one) silently no-ops. Live-
    // confirmed as a contributing mechanism to the platform-wide "stuck loading" bug
    // (registry/fable/loading-state/INVESTIGATION-LOG.md).
    clearRenderCache(existingInstance);

    vnode.__componentInstance = existingInstance;
    vnode.dom = dom;

    const preservedDomNode = eci._domNode || dom;
    const newRendered = renderComponentFn(vnode, existingInstance);
    const newInstance = (newRendered as unknown as VNodeBase | null)?.__componentInstance;
    if (newInstance) {
      const nci = asInternal(newInstance);
      componentInstances.set(dom, newInstance);
      vnode.__componentInstance = newInstance;
      const oldVNodeBase = nci._vnode as unknown as VNodeBase | null;
      if (oldVNodeBase) oldVNodeBase.dom = dom;
      nci._domNode = preservedDomNode || dom;
    }

    applyRenderedOutput(
      dom,
      vnode,
      oldRendered as VNode | undefined,
      newRendered as VNode,
      renderComponentFn,
      createDOMNodeFn,
      cleanupNodeFn,
      canUpdateInPlaceFn,
      updateDOMNodeFn,
    );
    return;
  }

  if (oldVNode && isComponentVNode(oldVNode) && oldVNode.type === vnode.type) {
    if (existingInstance) {
      vnode.__componentInstance = existingInstance;
    }

    vnode.dom = oldVNode.dom || dom;

    const preservedDomNode = existingInstance
      ? asInternal(existingInstance)._domNode || dom
      : dom;

    if (existingInstance) {
      // STUCK-LOADING FIX: same wholesale-replace hazard as the branch above -- let
      // renderComponentFn's own per-key merge (component-rendering.ts) update the
      // existing reactive proxy in place instead of discarding it here.
      clearRenderCache(existingInstance);
    }
    const newRendered = renderComponentFn(vnode, existingInstance);

    const newInstance = (newRendered as unknown as VNodeBase | null)?.__componentInstance;
    if (newInstance) {
      const nci = asInternal(newInstance);
      componentInstances.set(dom, newInstance);
      vnode.__componentInstance = newInstance;
      const oldVNodeBase = nci._vnode as unknown as VNodeBase | null;
      if (oldVNodeBase) oldVNodeBase.dom = dom;
      nci._domNode = preservedDomNode || dom;
    }

    applyRenderedOutput(
      dom,
      vnode,
      oldRendered as VNode | undefined,
      newRendered as VNode,
      renderComponentFn,
      createDOMNodeFn,
      cleanupNodeFn,
      canUpdateInPlaceFn,
      updateDOMNodeFn,
    );
    return;
  } else {
    // Component types don't match (e.g., LoginPage → ForgotPasswordPage)
    // Still try to transfer DOM references from old tree to preserve nested components
    const newRendered = renderComponentFn(vnode);

    // CRITICAL FIX: Even when parent component types differ, transfer DOM references
    // from the old rendered tree to the new one. This allows nested components
    // (Stack, Card, Input, Button) to be reused across page changes.
    // We search the old DOM tree for matching component types and transfer their references
    if (
      newRendered &&
      oldRendered &&
      typeof newRendered === "object" &&
      newRendered !== null
    ) {
      // Transfer references before creating new DOM - this allows reconciliation to find existing components
      transferDOMReferencesFromOldTree(newRendered, oldRendered, dom);
    }

    applyRenderedOutput(
      dom,
      vnode,
      oldRendered as VNode | undefined,
      newRendered as VNode,
      renderComponentFn,
      createDOMNodeFn,
      cleanupNodeFn,
      canUpdateInPlaceFn,
      updateDOMNodeFn,
    );
  }
}
