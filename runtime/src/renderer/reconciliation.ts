/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { VNode, ComponentVNode } from "../vdom/vdom.js";
import type { VNodeBase } from "../vdom/types/index.js";
import { asInternal } from "../component/internal.js";
import {
  componentInstances,
  domToHostComponent,
  vnodeMetadata,
} from "./storage.js";
import {
  getKey,
  canUpdateInPlace,
  isComponentVNode,
  isElementVNode,
  cleanupNode,
  filterValidVNodes,
} from "./types.js";
import { logger } from "../utils/logger.js";

// Forward declarations - these will be imported from other modules
// We use function declarations to allow hoisting and avoid circular dependency issues
declare function updateDOMNode(dom: Node, vnode: VNode): void;
declare function createDOMNode(vnode: VNode | null | undefined | boolean): Node;

// STUCK-LOADING FIX (dual-commit-pipeline bail has no retry, 2026-07-17): the staleness guard
// below assumes a bailed pass is always superseded by some OTHER, already-in-flight commit that
// will "re-run against an accurate, matching snapshot and correctly reconcile any real, pending
// change" -- but that other commit only revisits the SAME parent if its own vnode tree still
// includes that parent as a live position. If the two racing passes diverge upstream of `parent`
// (e.g. an unrelated sibling subtree's count changed, tripping the guard one level up, while
// `parent` itself belongs to a branch neither pass's surviving commit ever re-touches), the
// change described by THIS pass is not "deferred" as the comment above assumes -- it is dropped
// permanently. Live-confirmed (registry/fable/loading-state/): a DataTable child's `loading`
// prop, recomputed correctly by every render() call, never reached the live instance because
// every commit attempt bailed on a transient count mismatch and nothing else ever re-touched
// that exact position -- the skeleton stayed on screen forever. A single microtask retry against
// the owning component gives a merely-transient race (the common case) a real second chance
// instead of silently losing the update: by the time the microtask fires, whichever pass one the
// race has already committed, so the retry's own fresh render only has to correct positions that
// were genuinely left behind.
// A bail can also be PERSISTENT rather than transient -- some component's own render() shape
// genuinely disagrees with its live DOM on every attempt (a real structural bug elsewhere, not a
// race). Retrying that unboundedly would replace "update silently lost forever" with "update
// silently spins forever" -- itself a real regression (confirmed while validating this fix: an
// unrelated component's retry loop tripped UpdateManager's own 60/s throttle warning). Cap
// retries per parent within a short rolling window; past the cap, stop and leave the guard's
// original (silent-drop) behavior in place rather than spinning -- a persistent mismatch needs a
// real fix at its source, not an indefinitely repeating band-aid.
const MAX_RECONCILE_RETRIES = 3;
const RECONCILE_RETRY_WINDOW_MS = 1000;
const reconcileRetryScheduled = new WeakSet<HTMLElement>();
const reconcileRetryAttempts = new WeakMap<HTMLElement, { count: number; windowStart: number }>();
function scheduleReconcileRetry(parent: HTMLElement): void {
  if (reconcileRetryScheduled.has(parent)) return;

  const now = Date.now();
  const attempts = reconcileRetryAttempts.get(parent);
  if (attempts && now - attempts.windowStart < RECONCILE_RETRY_WINDOW_MS) {
    if (attempts.count >= MAX_RECONCILE_RETRIES) return;
    attempts.count++;
  } else {
    reconcileRetryAttempts.set(parent, { count: 1, windowStart: now });
  }

  reconcileRetryScheduled.add(parent);
  queueMicrotask(() => {
    reconcileRetryScheduled.delete(parent);
    let node: Node | null = parent;
    while (node) {
      const owner = componentInstances.get(node) ?? domToHostComponent.get(node);
      if (owner) {
        owner.scheduleUpdate?.();
        return;
      }
      node = node.parentNode;
    }
  });
}

// Key-based child diffing algorithm
export function reconcileChildren(
  parent: HTMLElement,
  oldChildren: VNode[],
  newChildren: VNode[],
  updateDOMNodeFn: typeof updateDOMNode,
  createDOMNodeFn: typeof createDOMNode,
) {
  const oldChildNodes = Array.from(parent.childNodes);

  // Staleness guard (FRAME-001 / dual-commit-pipeline race): oldChildren is what THIS
  // reconciliation pass believes parent's children currently are. In a healthy,
  // non-racing commit that count always matches what's actually live, because the last
  // commit to touch `parent` left exactly that many children behind. A mismatch means a
  // DIFFERENT, more current commit has already changed parent's live children since this
  // pass's oldVNode snapshot was captured -- e.g. an explicit scheduleUpdate() landed
  // between a signal-driven commit being queued and it firing, or vice versa (see
  // reactivity-setup.ts). Proceeding anyway can only misattribute identity by raw
  // position (no key/class signal disambiguates same-tag siblings) or delete content the
  // more current commit just added, silently -- see insertion-anchor-repro.test.ts.
  // Bail out of this entire pass rather than partially applying it: both commit
  // pipelines always re-render fresh immediately before committing, so whichever pass is
  // actually current will re-run against an accurate, matching snapshot and correctly
  // reconcile any real, pending change. Skip only applies to the diffing/mutation below --
  // it leaves the live DOM exactly as the more current commit left it.
  //
  // CLICK-NO-RESPONSE FIX (registry/fable/click-bug/, 2026-07-17): oldChildren is the RAW
  // logical children array and can contain `null`/`false` entries for conditional children
  // (`{cond && <X/>}`) that render nothing -- createDOMNode never gives those a DOM node (see
  // filterValidVNodes, used at creation time), so oldChildNodes (captured directly from
  // parent.childNodes, immediately above) never counts them either. Comparing the raw length
  // against oldChildNodes.length therefore permanently mismatches for ANY element that has
  // such a conditional among its direct children -- starting with the very first commit after
  // mount, since the initial baseline already carries the same unfiltered count -- and this
  // guard bails out of reconciling that element's entire child list, every time, even though
  // nothing is actually stale. Apply the same filtering used at creation time before comparing
  // (and before any positional matching below) so the guard only fires for genuine
  // dual-commit-pipeline races (see comment above), not for ordinary conditional rendering.
  const oldChildrenRendered = filterValidVNodes(oldChildren);
  if (oldChildrenRendered.length !== oldChildNodes.length) {
    scheduleReconcileRetry(parent);
    return;
  }

  // Build key maps for efficient lookups
  const oldKeyMap = new Map<
    string | number,
    { vnode: VNode; index: number; dom: Node }
  >();
  const newKeyMap = new Map<string | number, { vnode: VNode; index: number }>();

  // Build a map of DOM nodes by id for fallback matching
  const domByIdMap = new Map<string, Node>();
  oldChildNodes.forEach((node) => {
    if (node instanceof HTMLElement) {
      if (node.id) {
        domByIdMap.set(node.id, node);
      }
    }
  });

  // FRAME-001: oldChildNodes[index] below is only a meaningful proxy for identity when
  // oldChildrenRendered and the current live parent.childNodes are the same count --
  // otherwise index N in one has no relationship to index N in the other (e.g. a stale
  // oldChildren tree captured by an independent commit pipeline that never tracked a sibling
  // another pipeline already committed live). The guard above already proved that parity for
  // oldChildrenRendered specifically (raw oldChildren can't be used here for the same reason
  // it can't be used in the guard -- see CLICK-NO-RESPONSE FIX above).
  const oldChildCountMatchesLiveDom = oldChildrenRendered.length === oldChildNodes.length;

  oldChildrenRendered.forEach((vnode, index) => {
    const key = getKey(vnode, index);
    // CRITICAL: Use vnode.dom directly instead of looking up by index
    // This ensures we correctly match old VNodes with their DOM nodes
    const vnodeBase = typeof vnode === "object" && vnode !== null
      ? (vnode as unknown as VNodeBase)
      : null;
    // A vnode's own .dom reference can go stale: when two independent commit
    // pipelines for the same component instance (e.g. an explicit
    // scheduleUpdate() and a signal-driven reactive commit) each build and
    // commit their own vnode tree in close succession, a vnode object from
    // one of those trees can end up with .dom pointing at a node that a
    // LATER commit has already replaced or detached — the vnode was never
    // told. Trusting that stale pointer here means updateDOMNodeFn below
    // mutates a detached node (no error, since DOM ops on detached nodes
    // succeed silently) while the *actual* live child at this position in
    // `parent` never gets marked processed, and the final "remove leftover
    // nodes" pass deletes it as if it were orphaned -- even though it's the
    // exact element the new tree describes. Only trust vnodeBase.dom when
    // it's still genuinely attached to this parent; otherwise the live DOM
    // (oldChildNodes, captured directly from parent.childNodes above) is
    // the one source of truth that can't be stale -- but only once we've
    // confirmed positional correspondence is even possible (see above).
    const vnodeDom = vnodeBase?.dom;
    const vnodeDomIsLive = vnodeDom != null && vnodeDom.parentNode === parent;
    const positionalFallback = oldChildCountMatchesLiveDom ? oldChildNodes[index] : undefined;
    let dom = (vnodeDomIsLive ? vnodeDom : undefined) ?? positionalFallback;

    // Fallback: Try to match by id if direct match fails
    if (!dom && isElementVNode(vnode) && vnode.props?.id) {
      const id = String(vnode.props.id);
      const domById = domByIdMap.get(id);
      if (domById) {
        dom = domById;
        if (vnodeBase) vnodeBase.dom = dom;
      }
    }

    // We intentionally do not scan DOM subtrees to find matches.
    // Identity must come from keys / direct vnode.dom references.

    if (dom) {
      if (typeof process !== "undefined" && process.env["NODE_ENV"] !== "production" && oldKeyMap.has(key)) {
        logger.warn(
          `[SwissJS] Duplicate key "${key}" detected in children list. ` +
          `Keys must be unique among siblings. The component at index ${index} will be recreated.`,
        );
      }
      oldKeyMap.set(key, { vnode, index, dom });
    }
  });

  newChildren.forEach((vnode, index) => {
    const key = getKey(vnode, index);
    newKeyMap.set(key, { vnode, index });
  });

  const processedNodes = new Set<Node>();
  const newDoms: Node[] = [];

  // First pass: update existing nodes
  newChildren.forEach((newVNode, newIndex) => {
    // Skip null/undefined/boolean children (React/SWISS allows these to skip rendering)
    if (newVNode == null || typeof newVNode === "boolean") {
      return;
    }

    const key = getKey(newVNode, newIndex);
    let oldEntry = oldKeyMap.get(key);

    // Type-based fallback for unkeyed component VNodes.
    //
    // When a conditional element is inserted before existing siblings (e.g. a
    // slide-over panel that toggles on), every subsequent component shifts up by
    // one index. getKey() encodes the index in the fallback key, so their keys no
    // longer match the old map — the reconciler would recreate each component from
    // scratch, tearing down mounted instances.
    //
    // When no exact match is found and the component has no explicit key, scan the
    // old map for the first unprocessed entry with the same constructor. This
    // preserves the mounted instance across conditional-sibling toggles without
    // requiring explicit keys in every template.
    if (
      !oldEntry &&
      isComponentVNode(newVNode) &&
      newVNode.key == null &&
      newVNode.props?.key == null
    ) {
      for (const candidate of oldKeyMap.values()) {
        if (
          !processedNodes.has(candidate.dom as Node) &&
          isComponentVNode(candidate.vnode) &&
          candidate.vnode.type === newVNode.type
        ) {
          oldEntry = candidate;
          break;
        }
      }
    }

    // Type-based fallback for unkeyed element VNodes.
    //
    // The same index-shift problem affects element VNodes. When a conditional
    // sibling is inserted before an <input>, the input's key changes from
    // `input_0` to `input_1`. Without this fallback, the reconciler creates a
    // fresh <input> DOM node and removes the focused one — destroying focus.
    //
    // Scan old entries for the first unprocessed element with the same tag.
    // This preserves the existing DOM node (including focus state) even when
    // surrounding siblings shift its position.
    if (
      !oldEntry &&
      isElementVNode(newVNode) &&
      newVNode.key == null &&
      newVNode.props?.key == null
    ) {
      for (const candidate of oldKeyMap.values()) {
        if (
          !processedNodes.has(candidate.dom as Node) &&
          isElementVNode(candidate.vnode) &&
          candidate.vnode.type === newVNode.type
        ) {
          oldEntry = candidate;
          break;
        }
      }
    }

    // ENHANCEMENT: Aggressive ID Matching - try ID matching BEFORE key matching fails
    // This ensures DOM identity is restored early in the process
    if (!oldEntry && isElementVNode(newVNode) && newVNode.props?.id) {
      const id = String(newVNode.props.id);
      const domById = domByIdMap.get(id);
      if (domById) {
        // First, try to find an old VNode that already has this DOM node
        for (const entry of oldKeyMap.values()) {
          if (entry.dom === domById) {
            oldEntry = entry;
            break;
          }
        }

        // If still not found, search recursively in oldChildren by matching id
        if (!oldEntry) {
          const findVNodeById = (vnodes: VNode[]): VNode | null => {
            for (const v of vnodes) {
              if (isElementVNode(v) && v.props?.id === id) {
                return v;
              }
              // Recursively search children
              if (isElementVNode(v) && v.children) {
                const found = findVNodeById(v.children);
                if (found) return found;
              }
            }
            return null;
          };

          const matchingOldVNode = findVNodeById(oldChildren);
          if (matchingOldVNode) {
            const oldIndex = oldChildren.indexOf(matchingOldVNode);
            // CRITICAL: PATCH - Restore the link to the DOM
            // This must happen BEFORE we decide to update or create
            (matchingOldVNode as unknown as VNodeBase).dom = domById;
            oldEntry = {
              vnode: matchingOldVNode,
              index: oldIndex >= 0 ? oldIndex : 0, // Use 0 as fallback if not found in direct children
              dom: domById,
            };
            // Add to map for future lookups
            oldKeyMap.set(key, oldEntry);
          }
        }
      }
    }

    if (oldEntry) {
      const { dom, vnode: oldVNode } = oldEntry;

      // CRITICAL FIX: Transfer DOM reference IMMEDIATELY when we find a match
      const newVNodeBase = typeof newVNode === "object" && newVNode !== null
        ? (newVNode as unknown as VNodeBase)
        : null;
      if (newVNodeBase) newVNodeBase.dom = dom;

      // CRITICAL: For component VNodes, preserve the existing instance before updating
      if (
        newVNode &&
        oldVNode &&
        isComponentVNode(newVNode) &&
        isComponentVNode(oldVNode) &&
        newVNode.type === oldVNode.type
      ) {
        const direct = componentInstances.get(dom as HTMLElement);
        const host = domToHostComponent.get(dom as HTMLElement);
        const existingInstance =
          oldVNode.__componentInstance ||
          (host && host.constructor === newVNode.type ? host : null) ||
          (direct && direct.constructor === newVNode.type ? direct : null);
        if (existingInstance) {
          newVNode.__componentInstance = existingInstance;
          const eci = asInternal(existingInstance);
          eci._initialized = true;
          eci.__initialized = true;
        }
      }

      if (canUpdateInPlace(dom, newVNode, oldVNode)) {
        // DOM reference already set above, just update
        updateDOMNodeFn(dom, newVNode);
        processedNodes.add(dom);
        newDoms.push(dom);
      } else if (
        newVNode &&
        oldVNode &&
        isComponentVNode(newVNode) &&
        isComponentVNode(oldVNode) &&
        newVNode.type === oldVNode.type
      ) {
        // CRITICAL: For same-type component VNodes, ALWAYS update in place
        // Don't create a new DOM node - use updateDOMNode which will call updateComponentNode
        // updateComponentNode knows how to find and reuse the existing instance
        // DOM reference already set above, just update
        updateDOMNodeFn(dom, newVNode);
        processedNodes.add(dom);
        newDoms.push(dom);
      } else {
        // Different types or can't update in place - create new DOM
        const newDom = createDOMNodeFn(newVNode);
        if (newVNodeBase) newVNodeBase.dom = newDom;
        // Check if dom is still a child of parent before replacing
        // It might have been removed or moved during a previous iteration
        if (dom.parentNode === parent) {
          parent.replaceChild(newDom, dom);
        } else {
          // Node was already removed/moved - insert at the correct position
          const nextSibling = parent.childNodes[newIndex];
          if (nextSibling) {
            parent.insertBefore(newDom, nextSibling);
          } else {
            parent.appendChild(newDom);
          }
        }
        processedNodes.add(newDom);
        newDoms.push(newDom);
      }
    } else {
      const newDom = createDOMNodeFn(newVNode);
      const elseBase = typeof newVNode === "object" && newVNode !== null
        ? (newVNode as unknown as VNodeBase)
        : null;
      if (elseBase) elseBase.dom = newDom;
      newDoms.push(newDom);
    }
  });

  // Second pass: reorder nodes
  newDoms.forEach((dom, newIndex) => {
    const currentDom = parent.childNodes[newIndex];
    if (currentDom !== dom) {
      if (parent.childNodes[newIndex]) {
        parent.insertBefore(dom, parent.childNodes[newIndex]);
      } else {
        parent.appendChild(dom);
      }
    }
  });

  // Remove leftover nodes (skip when parent has data-preserve-children, e.g. xterm container)
  if (
    parent instanceof HTMLElement &&
    parent.getAttribute?.("data-preserve-children") != null
  ) {
    return;
  }
  oldChildNodes.forEach((node) => {
    if (!processedNodes.has(node)) {
      cleanupNode(node);
      // Check if node is still a child before removing (it might have been moved/removed during reordering)
      if (node.parentNode === parent) {
        parent.removeChild(node);
      }
    }
  });
}
