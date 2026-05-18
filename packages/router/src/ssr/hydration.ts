
import { renderToDOM, createElement } from '@kibologic/core';

export interface HydrationData {
    route: string;
    data: Record<string, any>;
    /** Optional component class to mount if the root element has no children */
    component?: new (...args: any[]) => any;
}

/**
 * Hydrate a server-rendered root element.
 *
 * Steps:
 *  1. Merge window.__SWISS_DATA__ with caller-supplied data
 *  2. If a component class is provided and the root has no children, mount it via renderToDOM
 *  3. Dispatch a `swiss:hydrate` event so app-level code can complete the process
 */
export function hydrate(rootElement: HTMLElement, data: HydrationData): void {
    const serverData: Record<string, any> =
        typeof window !== 'undefined'
            ? ((window as any).__SWISS_DATA__ as Record<string, any> ?? {})
            : {};

    const mergedData = { ...serverData, ...data.data };

    rootElement.setAttribute('data-swiss-hydrated', 'true');
    rootElement.setAttribute('data-swiss-route', data.route);

    // Mount component if root is empty (no server-rendered content)
    if (data.component && !rootElement.hasChildNodes()) {
        const vnode = createElement(data.component, mergedData);
        renderToDOM(vnode, rootElement);
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

export function getServerData(): Record<string, any> {
    if (typeof window === 'undefined') return {};
    return (window as any).__SWISS_DATA__ ?? {};
}
