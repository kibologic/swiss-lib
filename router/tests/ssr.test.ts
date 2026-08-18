import { describe, it, expect } from 'vitest';
import { createRouter, createServerRenderer } from '../src/index';
import { SwissComponent, createElement, setTitle, addMeta } from '@swissjs/core';
import type { VNode } from '@swissjs/core';

describe('SSR - Comprehensive Tests', () => {
    describe('Server Renderer', () => {
        it('should create server renderer instance', () => {
            const router = createRouter({ routes: [] });
            const renderer = createServerRenderer(router);

            expect(renderer).toBeDefined();
        });

        it('should render route to HTML', async () => {
            const router = createRouter({
                routes: [
                    { path: '/test', component: { name: 'TestComponent' } }
                ]
            });

            const renderer = createServerRenderer(router);
            const result = await renderer.render('/test');

            expect(result.html).toBeDefined();
            expect(result.html).toContain('<!DOCTYPE html>');
            expect(result.statusCode).toBe(200);
        });

        it('should return 404 for non-existent routes', async () => {
            const router = createRouter({ routes: [] });
            const renderer = createServerRenderer(router);

            const result = await renderer.render('/does-not-exist');

            expect(result.statusCode).toBe(404);
            expect(result.html).toContain('404');
        });

        it('should embed route data in HTML', async () => {
            const router = createRouter({
                routes: [
                    {
                        path: '/user/:id',
                        component: { name: 'User' },
                        loader: async ({ params }) => ({ userId: params.id })
                    }
                ]
            });

            const renderer = createServerRenderer(router);
            const result = await renderer.render('/user/123');

            expect(result.html).toContain('__SWISS_DATA__');
            expect(result.data['/user/:id']).toEqual({ userId: '123' });
        });
    });

    describe('Nested Route SSR', () => {
        it('should render nested routes correctly', async () => {
            const router = createRouter({
                routes: [
                    {
                        path: '/parent',
                        component: { name: 'Parent' },
                        children: [
                            { path: 'child', component: { name: 'Child' } }
                        ]
                    }
                ]
            });

            const renderer = createServerRenderer(router);
            const result = await renderer.render('/parent/child');

            expect(result.statusCode).toBe(200);
            expect(result.html).toBeDefined();
        });

        it('should load data for all nested routes', async () => {
            const router = createRouter({
                routes: [
                    {
                        path: '/parent',
                        component: { name: 'Parent' },
                        loader: async () => ({ parent: true }),
                        children: [
                            {
                                path: 'child',
                                component: { name: 'Child' },
                                loader: async () => ({ child: true })
                            }
                        ]
                    }
                ]
            });

            const renderer = createServerRenderer(router);
            const result = await renderer.render('/parent/child');

            expect(result.data['/parent']).toEqual({ parent: true });
            expect(result.data['/parent/child']).toEqual({ child: true });
        });
    });

    describe('SSR Data Serialization', () => {
        it('should serialize data as JSON', async () => {
            const router = createRouter({
                routes: [
                    {
                        path: '/data',
                        component: { name: 'Data' },
                        loader: async () => ({
                            string: 'test',
                            number: 42,
                            boolean: true,
                            array: [1, 2, 3],
                            object: { nested: 'value' }
                        })
                    }
                ]
            });

            const renderer = createServerRenderer(router);
            const result = await renderer.render('/data');

            expect(result.html).toContain('window.__SWISS_DATA__');
            // Data should be properly JSON serialized
            const dataMatch = result.html.match(/window\.__SWISS_DATA__ = (.+);/);
            if (dataMatch) {
                const parsed = JSON.parse(dataMatch[1]);
                expect(parsed['/data']).toBeDefined();
            }
        });

        it('should handle special characters in data', async () => {
            const router = createRouter({
                routes: [
                    {
                        path: '/special',
                        component: { name: 'Special' },
                        loader: async () => ({
                            html: '<script>alert("xss")</script>',
                            quotes: 'He said "hello"',
                            unicode: '你好'
                        })
                    }
                ]
            });

            const renderer = createServerRenderer(router);
            const result = await renderer.render('/special');

            // Should properly escape data
            expect(result.html).toBeDefined();
        });
    });

    describe('Server Renderer with real components (not stub objects)', () => {
        // Every test above this point registers `component: { name: 'X' }` -- a plain
        // object, not a class. renderToString's isComponentVNode check requires
        // `typeof vnode.type === "function"` (runtime/src/renderer/types.ts); a plain
        // object fails that check, so renderToString's component branch never actually
        // ran for any test in this file until now -- it silently fell through to
        // `return ""` for the component's own markup, and every assertion above only
        // checked the OUTER html skeleton (`<!DOCTYPE html>`, `data-swiss-route`, status
        // code), never that a route's own component actually rendered anything. These
        // tests use real SwissComponent classes, matching what a real app registers.
        // createElement is createVNode (vdom.ts): its real signature is
        // `(type, props, ...children)` -- children are rest arguments, never a `children`
        // props key (that convention is `jsx()`'s job, which destructures it back out
        // before calling createVNode). Passing text/nodes as a REST ARG here, matching
        // what buildRouteTree itself now does.
        class Greeting extends SwissComponent {
            render(): VNode {
                return createElement('p', {}, `hello, ${(this.props as { name?: string }).name}`) as VNode;
            }
        }

        it('renders the real component output inside the #app div, not an empty string', async () => {
            const router = createRouter({
                routes: [
                    {
                        path: '/hello/:name',
                        component: Greeting,
                        loader: async ({ params }) => ({ name: params.name }),
                    },
                ],
            });
            const renderer = createServerRenderer(router);
            const result = await renderer.render('/hello/world');

            expect(result.statusCode).toBe(200);
            expect(result.html).toContain('<p>hello, world</p>');
        });

        it('renders a leaf wrapped in its route layout (the exact nested-component shape buildRouteTree builds)', async () => {
            class Layout extends SwissComponent {
                render(): VNode {
                    // this.props.children is populated by renderComponentImpl from the
                    // LAYOUT VNODE'S OWN `.children` field (component-rendering.ts) --
                    // which is exactly what buildRouteTree's `createElement(layout, props,
                    // tree)` rest-arg call now sets correctly.
                    return createElement('div', { class: 'layout' }, this.props.children as VNode) as VNode;
                }
            }
            class Leaf extends SwissComponent {
                render(): VNode {
                    return createElement('span', {}, 'leaf content') as VNode;
                }
            }
            const router = createRouter({
                routes: [{ path: '/page', component: Leaf, layout: Layout }],
            });
            const renderer = createServerRenderer(router);
            const result = await renderer.render('/page');

            expect(result.html).toContain('<div class="layout"><span>leaf content</span></div>');
        });

        it('SSR-002: the caller can tell a component that threw from one that rendered empty', async () => {
            // Before the fix: renderToString's own catch (renderer.ts) returned "" for a
            // failure severe enough to escape renderComponentImpl's own internal catch, and
            // ServerRenderer hardcoded statusCode: 200 regardless. A crashed page and an
            // intentionally empty page were the same HTTP response. This test goes through
            // the FULL ServerRenderer.render() path, not renderToString in isolation, per
            // this task's own Article 17 instruction.
            class Boom extends SwissComponent {
                render(): VNode {
                    throw new Error('boom from render()');
                }
            }
            const router = createRouter({
                routes: [{ path: '/broken', component: Boom }],
            });
            const renderer = createServerRenderer(router);
            const result = await renderer.render('/broken');

            expect(result.statusCode).toBe(500);
            expect(result.hadRenderErrors).toBe(true);
            // The failure is VISIBLE, not fatal to the whole page (never_touch forbids
            // letting the exception escape unshaped) -- the response still ships real HTML,
            // including the error message, just correctly flagged as a failed render.
            expect(result.html).toContain('boom from render()');
        });

        it('SSR-002: a component that renders nothing intentionally still reports 200', async () => {
            // The other half of "the caller can tell" -- an empty render must NOT be
            // mistaken for a failed one just because both produce sparse HTML.
            class Empty extends SwissComponent {
                render(): VNode {
                    return null as unknown as VNode;
                }
            }
            const router = createRouter({ routes: [{ path: '/empty', component: Empty }] });
            const renderer = createServerRenderer(router);
            const result = await renderer.render('/empty');

            expect(result.statusCode).toBe(200);
            expect(result.hadRenderErrors).toBeUndefined();
        });
    });

    describe('HEAD-001: document-head management through the real SSR path', () => {
        // A component calling useHead()/setTitle()/addMeta() from render() executes inside
        // renderToString's synchronous call stack, which ServerRenderer.render() now
        // brackets with pushHeadContext()/popHeadContext() -- so the contribution should
        // land in the response's own <head>, replacing the hardcoded "Swiss App" default.
        class PageA extends SwissComponent {
            render(): VNode {
                setTitle('Page A');
                addMeta({ name: 'description', content: 'This is page A' });
                return createElement('p', {}, 'a') as VNode;
            }
        }
        class PageB extends SwissComponent {
            render(): VNode {
                setTitle('Page B');
                return createElement('p', {}, 'b') as VNode;
            }
        }
        class NoHead extends SwissComponent {
            render(): VNode {
                return createElement('p', {}, 'plain') as VNode;
            }
        }

        it('injects a component-set title and meta tag into the SSR HTML', async () => {
            const router = createRouter({ routes: [{ path: '/a', component: PageA }] });
            const renderer = createServerRenderer(router);
            const result = await renderer.render('/a');

            expect(result.html).toContain('<title>Page A</title>');
            expect(result.html).toContain('<meta name="description" content="This is page A" />');
        });

        it('falls back to the "Swiss App" default title when no component calls useHead', async () => {
            const router = createRouter({ routes: [{ path: '/plain', component: NoHead }] });
            const renderer = createServerRenderer(router);
            const result = await renderer.render('/plain');

            expect(result.html).toContain('<title>Swiss App</title>');
        });

        it('does not leak head state between separate renders (A\'s title never appears in B\'s HTML, and vice versa)', async () => {
            const routerA = createRouter({ routes: [{ path: '/a', component: PageA }] });
            const routerB = createRouter({ routes: [{ path: '/b', component: PageB }] });

            const resultA = await createServerRenderer(routerA).render('/a');
            const resultB = await createServerRenderer(routerB).render('/b');

            expect(resultA.html).toContain('<title>Page A</title>');
            expect(resultA.html).not.toContain('Page B');

            expect(resultB.html).toContain('<title>Page B</title>');
            expect(resultB.html).not.toContain('Page A');
            expect(resultB.html).not.toContain('This is page A');
        });

        it('interleaved renders (B starts before A finishes awaiting) each keep their own head', async () => {
            // loadRouteData is awaited BEFORE renderToString/push/pop run, so two renders
            // triggered back-to-back without awaiting the first can have their data-loading
            // phases interleaved by the event loop; only the synchronous
            // push-renderToString-pop section must never interleave. This exercises exactly
            // that: two render() calls started concurrently via Promise.all.
            const routerA = createRouter({
                routes: [{ path: '/a', component: PageA, loader: async () => ({}) }],
            });
            const routerB = createRouter({
                routes: [{ path: '/b', component: PageB, loader: async () => ({}) }],
            });

            const [resultA, resultB] = await Promise.all([
                createServerRenderer(routerA).render('/a'),
                createServerRenderer(routerB).render('/b'),
            ]);

            expect(resultA.html).toContain('<title>Page A</title>');
            expect(resultA.html).not.toContain('Page B');
            expect(resultB.html).toContain('<title>Page B</title>');
            expect(resultB.html).not.toContain('Page A');
        });
    });
});
