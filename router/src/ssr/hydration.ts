/**
 * EXPERIMENTAL / UNSUPPORTED (FABLE-SL-001) -- see server-renderer.ts's
 * top-of-file note. Gated on FABLE-FRAME-001's stable node-identity fix.
 */
import { renderToDOM, hydrate as coreHydrate, createElement } from '@swissjs/core';
import type { VNode } from '@swissjs/core';
import type { ComponentLike } from '../core/router.js';

declare global {
    interface Window {
        __SWISS_DATA__: Record<string, unknown>;
    }
}

export interface HydrationData {
    route: string;
    data: Record<string, unknown>;
    /** Component class to mount or hydrate into the root element. */
    component?: ComponentLike;
}

/**
 * Hydrate a server-rendered root element.
 *
 * When the root already contains server-rendered HTML, uses the framework's
 * `hydrate()` — which attaches event listeners to existing DOM nodes without
 * destroying them (true hydration). When the root is empty (CSR mode), falls
 * back to `renderToDOM()`.
 *
 * Steps:
 *  1. Merge window.__SWISS_DATA__ with caller-supplied data
 *  2. Mark root with hydration attributes
 *  3. If component is provided:
 *     - Root has children → hydrate (attach, don't destroy)
 *     - Root is empty    → renderToDOM (initial CSR render)
 *  4. Dispatch `swiss:hydrate` event for app-level listeners
 */
export function hydrate(rootElement: HTMLElement, data: HydrationData): void {
    const serverData: Record<string, unknown> =
        typeof window !== 'undefined'
            ? (window.__SWISS_DATA__ ?? {})
            : {};

    const mergedData = { ...serverData, ...data.data };

    rootElement.setAttribute('data-swiss-hydrated', 'true');
    rootElement.setAttribute('data-swiss-route', data.route);

    if (data.component) {
        const vnode = createElement(data.component, mergedData) as VNode;
        if (rootElement.hasChildNodes()) {
            // Server-rendered content exists: attach event listeners without destroying DOM.
            coreHydrate(vnode, rootElement);
        } else {
            // Empty root (CSR or SSR failed): do a full client-side render.
            renderToDOM(vnode, rootElement);
        }
    }

    if (typeof window !== 'undefined') {
        rootElement.dispatchEvent(
            new CustomEvent('swiss:hydrate', {
                bubbles: true,
                detail: { route: data.route, data: mergedData, rootElement },
            })
        );
    }
}

/** Read the server-serialised data injected into the page as window.__SWISS_DATA__. */
export function getServerData(): Record<string, unknown> {
    if (typeof window === 'undefined') return {};
    return window.__SWISS_DATA__ ?? {};
}
