import { describe, it, expect } from 'vitest';
import { createRouter, createServerRenderer } from '../src/index';
import { SwissComponent, createElement, setTitle } from '@swissjs/core';
import type { VNode } from '@swissjs/core';

// FRAME-006-follow-up: ServerRenderer.renderStream -- the router-level streaming path.
// Parity contract (this task's Article 17 bar): joining every chunk renderStream(url)
// yields for a given route must equal render(url)'s `.html` EXACTLY, and it must actually
// arrive as more than one chunk. See server-renderer.ts's renderStream doc comment for the
// design: same route matching / loader data / buildRouteTree() tree as render(), the
// component markup portion driven by @swissjs/core's renderToStringChunks instead of
// renderToString.
async function collect(gen: AsyncGenerator<string, void, void>): Promise<{ html: string; chunks: string[] }> {
    const chunks: string[] = [];
    for await (const chunk of gen) {
        chunks.push(chunk);
    }
    return { html: chunks.join(''), chunks };
}

describe('ServerRenderer.renderStream: parity with render()', () => {
    class Greeting extends SwissComponent {
        render(): VNode {
            return createElement('p', {}, `hello, ${(this.props as { name?: string }).name}`) as VNode;
        }
    }

    it('streamed output equals render()\'s .html for a real component route', async () => {
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

        const buffered = await renderer.render('/hello/world');
        const { html, chunks } = await collect(renderer.renderStream('/hello/world'));

        expect(html).toBe(buffered.html);
        expect(chunks.length).toBeGreaterThan(1);
    });

    it('streams a layout-wrapped leaf (nested component tree) with parity', async () => {
        class Layout extends SwissComponent {
            render(): VNode {
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

        const buffered = await renderer.render('/page');
        expect(buffered.html).toContain('<div class="layout"><span>leaf content</span></div>');

        const { html, chunks } = await collect(renderer.renderStream('/page'));

        expect(html).toBe(buffered.html);
        expect(chunks.length).toBeGreaterThan(1);
    });

    it('a component that throws still streams the SSR-002 error-boundary fallback, matching render()', async () => {
        class Boom extends SwissComponent {
            render(): VNode {
                throw new Error('boom from render()');
            }
        }
        const router = createRouter({ routes: [{ path: '/broken', component: Boom }] });
        const renderer = createServerRenderer(router);

        const buffered = await renderer.render('/broken');
        expect(buffered.html).toContain('boom from render()');

        const { html } = await collect(renderer.renderStream('/broken'));
        expect(html).toBe(buffered.html);
    });

    it('yields a single 404 chunk for an unmatched route, matching render()', async () => {
        const router = createRouter({ routes: [] });
        const renderer = createServerRenderer(router);

        const buffered = await renderer.render('/does-not-exist');
        const { html, chunks } = await collect(renderer.renderStream('/does-not-exist'));

        expect(html).toBe(buffered.html);
        expect(chunks.length).toBe(1);
    });

    it('flushes the document shell chunk before any component markup chunk', async () => {
        const router = createRouter({
            routes: [{ path: '/hello/:name', component: Greeting, loader: async ({ params }) => ({ name: params.name }) }],
        });
        const renderer = createServerRenderer(router);

        const iterator = renderer.renderStream('/hello/world');
        const first = await iterator.next();

        expect(first.done).toBe(false);
        expect(first.value).toContain('<!DOCTYPE html>');
        expect(first.value).toContain('data-swiss-route="/hello/world"');
        // The shell chunk ends right after the app div's OPEN tag -- it must not already
        // contain the component's own rendered markup.
        expect(first.value).not.toContain('hello, world');

        // Drain the rest and confirm full parity too.
        const rest: string[] = [first.value];
        for (;;) {
            const step = await iterator.next();
            if (step.done) break;
            rest.push(step.value);
        }
        const buffered = await renderer.render('/hello/world');
        expect(rest.join('')).toBe(buffered.html);
    });

    // HEAD-001 (document-head management) merged into `development` after this streaming
    // branch was opened. render() honors useHead()/setTitle()/addMeta() calls made from a
    // component's render() because it fully buffers componentHtml before building the head
    // markup from the now-populated HeadContext. renderStream() cannot: its shell chunk
    // (including <title>) is yielded BEFORE any component executes, by design (see
    // 'flushes the document shell chunk before any component markup chunk' above). This
    // test pins that documented divergence -- see server-renderer.ts's renderStream() doc
    // comment ("KNOWN GAP against HEAD-001") -- so the two paths silently drifting further
    // apart, or the gap silently disappearing without the doc comment being updated, both
    // fail this test.
    it('does not reflect useHead()/setTitle() set during a streamed component\'s render, unlike render()', async () => {
        class TitledPage extends SwissComponent {
            render(): VNode {
                setTitle('Custom Streamed Title');
                return createElement('p', {}, 'content') as VNode;
            }
        }
        const router = createRouter({ routes: [{ path: '/titled', component: TitledPage }] });
        const renderer = createServerRenderer(router);

        const buffered = await renderer.render('/titled');
        expect(buffered.html).toContain('<title>Custom Streamed Title</title>');

        const { html } = await collect(renderer.renderStream('/titled'));
        expect(html).toContain('<title>Swiss App</title>');
        expect(html).not.toContain('Custom Streamed Title');

        // Parity does NOT hold for this route -- that is exactly the documented gap.
        expect(html).not.toBe(buffered.html);
    });
});
