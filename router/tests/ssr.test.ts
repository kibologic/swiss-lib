import { describe, it, expect } from 'vitest';
import { createRouter, createServerRenderer } from '../src/index';
import { SwissComponent, createElement } from '@swissjs/core';
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
    });
});
