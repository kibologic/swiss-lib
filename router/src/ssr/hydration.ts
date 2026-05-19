import { renderToDOM, hydrate as coreHydrate, createElement } from '@swissjs/core';
import type { VNode } from '@swissjs/core';

export interface HydrationData {
    route: string;
    data: Record<string, any>;
    /** Component class to mount or hydrate into the root element. */
    component?: new (...args: any[]) => any;
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
    const serverData: Record<string, any> =
        typeof window !== 'undefined'
            ? ((window as any).__SWISS_DATA__ as Record<string, any> ?? {})
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
export function getServerData(): Record<string, any> {
    if (typeof window === 'undefined') return {};
    return (window as any).__SWISS_DATA__ ?? {};
}
