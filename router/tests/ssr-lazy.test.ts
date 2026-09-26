// ROUTER-LAZY-SSR-TYPING: bisected regression from #141 (ROUTER-PER-ROUTE-GUARDS +
// ROUTER-LAZY-ROUTES) on top of #106 (streaming SSR). `Route.component` widened to
// `ComponentLike | LazyComponent`, but server-renderer.ts's buildRouteTree/
// buildComponentVNode kept passing `match.route.component` straight into `createElement`,
// which only accepts a `ComponentLike`. `tsc -b router` failed (TS2769); vitest stayed green
// because it never type-checks, and at runtime a `LazyComponent` wrapper object passed to
// createElement fails core's `isComponentVNode`'s `typeof vnode.type === "function"` check
// and silently renders as empty markup -- exactly the class of bug ssr.test.ts's "real
// components, not stub objects" section documents for plain-object stubs.
//
// The fix: buildRouteTree/buildComponentVNode are now async and `await
// component.load()` before building the vnode (see server-renderer.ts's doc comments), for
// BOTH render() and renderStream() -- SSR is already async end to end, so there is no
// pending/placeholder state to render, unlike the client Outlet (outlet.ts).
import { describe, it, expect } from 'vitest';
import { createRouter, createServerRenderer } from '../src/index';
import { SwissComponent, createElement } from '@swissjs/core';
import type { VNode } from '@swissjs/core';
import { lazy } from '../src/core/lazy';

async function collect(gen: AsyncGenerator<string, void, void>): Promise<string> {
    const chunks: string[] = [];
    for await (const chunk of gen) chunks.push(chunk);
    return chunks.join('');
}

class Greeting extends SwissComponent {
    render(): VNode {
        return createElement('p', {}, `hello, ${(this.props as { name?: string }).name}`) as VNode;
    }
}

class Layout extends SwissComponent {
    render(): VNode {
        return createElement('div', { class: 'layout' }, this.props.children as VNode) as VNode;
    }
}

describe('SSR of a lazy route component (ROUTER-LAZY-SSR-TYPING)', () => {
    it('render(): renders the resolved component\'s markup, not an empty placeholder', async () => {
        const router = createRouter({
            routes: [
                {
                    path: '/hello/:name',
                    component: lazy(() => Promise.resolve(Greeting)),
                    loader: async ({ params }) => ({ name: params.name }),
                },
            ],
        });
        const renderer = createServerRenderer(router);
        const result = await renderer.render('/hello/world');

        expect(result.statusCode).toBe(200);
        expect(result.html).toContain('<p>hello, world</p>');
    });

    it('render(): byte-identical to the same route registered with a plain (non-lazy) component', async () => {
        // #106's parity-dump approach: prove a lazy route's rendered output is EXACTLY what
        // the same route produces with a plain component -- the lazy wrapper must be
        // fully transparent to the final HTML.
        const eagerRouter = createRouter({
            routes: [
                { path: '/hello/:name', component: Greeting, loader: async ({ params }) => ({ name: params.name }) },
            ],
        });
        const lazyRouter = createRouter({
            routes: [
                {
                    path: '/hello/:name',
                    component: lazy(() => Promise.resolve(Greeting)),
                    loader: async ({ params }) => ({ name: params.name }),
                },
            ],
        });

        const eager = await createServerRenderer(eagerRouter).render('/hello/world');
        const lazyResult = await createServerRenderer(lazyRouter).render('/hello/world');

        expect(lazyResult.html).toBe(eager.html);
    });

    it('render(): resolves a lazy LEAF wrapped in a (non-lazy) layout', async () => {
        const router = createRouter({
            routes: [
                { path: '/page', component: lazy(() => Promise.resolve(Greeting)), layout: Layout, loader: async () => ({ name: 'layout-test' }) },
            ],
        });
        const renderer = createServerRenderer(router);
        const result = await renderer.render('/page');

        expect(result.html).toContain('<div class="layout"><p>hello, layout-test</p></div>');
    });

    it('render(): the loader runs at most once even though buildRouteTree resolves it', async () => {
        let loadCount = 0;
        const lazyComponent = lazy(() => {
            loadCount += 1;
            return Promise.resolve(Greeting);
        });
        const router = createRouter({
            routes: [{ path: '/hello/:name', component: lazyComponent, loader: async ({ params }) => ({ name: params.name }) }],
        });
        const renderer = createServerRenderer(router);
        await renderer.render('/hello/a');
        await renderer.render('/hello/b');

        expect(loadCount).toBe(1);
    });

    it('renderStream(): renders the resolved component\'s markup, not an empty placeholder', async () => {
        const router = createRouter({
            routes: [
                {
                    path: '/hello/:name',
                    component: lazy(() => Promise.resolve(Greeting)),
                    loader: async ({ params }) => ({ name: params.name }),
                },
            ],
        });
        const renderer = createServerRenderer(router);
        const html = await collect(renderer.renderStream('/hello/world'));

        expect(html).toContain('<p>hello, world</p>');
    });

    it('renderStream(): parity with render() for a lazy route (#106\'s parity-dump approach)', async () => {
        const router = createRouter({
            routes: [
                {
                    path: '/hello/:name',
                    component: lazy(() => Promise.resolve(Greeting)),
                    loader: async ({ params }) => ({ name: params.name }),
                },
            ],
        });
        const renderer = createServerRenderer(router);

        const buffered = await renderer.render('/hello/world');
        const streamed = await collect(renderer.renderStream('/hello/world'));

        expect(streamed).toBe(buffered.html);
    });

    it('renderStream(): byte-identical to the same route registered with a plain (non-lazy) component', async () => {
        const eagerRouter = createRouter({
            routes: [
                { path: '/hello/:name', component: Greeting, loader: async ({ params }) => ({ name: params.name }) },
            ],
        });
        const lazyRouter = createRouter({
            routes: [
                {
                    path: '/hello/:name',
                    component: lazy(() => Promise.resolve(Greeting)),
                    loader: async ({ params }) => ({ name: params.name }),
                },
            ],
        });

        const eagerStreamed = await collect(createServerRenderer(eagerRouter).renderStream('/hello/world'));
        const lazyStreamed = await collect(createServerRenderer(lazyRouter).renderStream('/hello/world'));

        expect(lazyStreamed).toBe(eagerStreamed);
    });

    it('render(): a rejected lazy loader surfaces as an SSR-002 error-boundary render, not a hang or empty page', async () => {
        const router = createRouter({
            routes: [{ path: '/broken', component: lazy(() => Promise.reject(new Error('chunk load failed'))) }],
        });
        const renderer = createServerRenderer(router);
        const result = await renderer.render('/broken');

        expect(result.statusCode).toBe(500);
        expect(result.hadRenderErrors).toBe(true);
    });
});
