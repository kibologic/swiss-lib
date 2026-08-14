
import { describe, it, expect } from 'vitest';
import { createAPIHandler, APIRequest } from '../src/api/handler';

describe('API Routes', () => {
    it('should handle GET requests', async () => {
        const handler = createAPIHandler();

        handler.register({
            path: '/api/users',
            method: 'GET',
            handler: async (req, res) => {
                res.json({ users: [] });
            }
        });

        const req: APIRequest = {
            method: 'GET',
            url: '/api/users',
            params: {},
            query: {},
            headers: {}
        };

        const res = await handler.handle(req);
        expect(res).toBeDefined();
    });

    it('should handle dynamic routes', async () => {
        const handler = createAPIHandler();

        handler.register({
            path: '/api/users/:id',
            method: 'GET',
            handler: async (req, res) => {
                res.json({ id: req.params.id });
            }
        });

        const req: APIRequest = {
            method: 'GET',
            url: '/api/users/123',
            params: { id: '123' },
            query: {},
            headers: {}
        };

        const res = await handler.handle(req);
        expect(res).toBeDefined();
    });

    it('should execute middleware', async () => {
        const handler = createAPIHandler();
        let middlewareExecuted = false;

        handler.register({
            path: '/api/protected',
            method: 'GET',
            middleware: [
                async (req, res, next) => {
                    middlewareExecuted = true;
                    next();
                }
            ],
            handler: async (req, res) => {
                res.json({ protected: true });
            }
        });

        const req: APIRequest = {
            method: 'GET',
            url: '/api/protected',
            params: {},
            query: {},
            headers: {}
        };

        await handler.handle(req);
        expect(middlewareExecuted).toBe(true);
    });

    it('returns a 404 for a path with no registered route', async () => {
        const handler = createAPIHandler();
        let registeredHandlerCalled = false;
        // APIResponse (handler.ts) is write-only: status()/json()/send()/setHeader() have
        // no readback, so nothing about a returned response object's actual status code or
        // body is inspectable from outside handle(). That is itself worth noting: it means
        // NEITHER this test nor the pre-existing "should handle GET requests" test above it
        // can verify the response those calls actually produced -- only whether the
        // matching handler ran at all. Recorded here rather than worked around with an
        // internal reflection hack, since the gap is in the type the framework exposes,
        // not in this test's technique.
        handler.register({
            path: '/api/users',
            method: 'GET',
            handler: async (req, res) => { registeredHandlerCalled = true; res.json({ users: [] }); }
        });

        await handler.handle({
            method: 'GET',
            url: '/api/does-not-exist',
            params: {},
            query: {},
            headers: {}
        });

        expect(registeredHandlerCalled).toBe(false);
    });

    it('short-circuits the handler when middleware never calls next()', async () => {
        const handler = createAPIHandler();
        let handlerCalled = false;

        handler.register({
            path: '/api/gated',
            method: 'GET',
            middleware: [
                async (req, res) => {
                    // Deliberately does NOT call next() -- e.g. an auth check that rejects.
                    res.status(401).json({ error: 'unauthorized' });
                }
            ],
            handler: async (req, res) => {
                handlerCalled = true;
                res.json({ protected: true });
            }
        });

        await handler.handle({
            method: 'GET',
            url: '/api/gated',
            params: {},
            query: {},
            headers: {}
        });

        expect(handlerCalled).toBe(false);
    });

    it('runs multiple middleware in registration order and still reaches the handler when all call next()', async () => {
        const handler = createAPIHandler();
        const order: string[] = [];

        handler.register({
            path: '/api/chain',
            method: 'GET',
            middleware: [
                async (req, res, next) => { order.push('first'); next(); },
                async (req, res, next) => { order.push('second'); next(); }
            ],
            handler: async (req, res) => { order.push('handler'); res.json({}); }
        });

        await handler.handle({
            method: 'GET',
            url: '/api/chain',
            params: {},
            query: {},
            headers: {}
        });

        expect(order).toEqual(['first', 'second', 'handler']);
    });

    it('does not match a route registered for a different HTTP method', async () => {
        const handler = createAPIHandler();
        let getCalled = false;
        let postCalled = false;

        handler.register({
            path: '/api/items',
            method: 'GET',
            handler: async (req, res) => { getCalled = true; res.json({}); }
        });
        handler.register({
            path: '/api/items',
            method: 'POST',
            handler: async (req, res) => { postCalled = true; res.json({}); }
        });

        await handler.handle({
            method: 'POST',
            url: '/api/items',
            params: {},
            query: {},
            headers: {}
        });

        expect(postCalled).toBe(true);
        expect(getCalled).toBe(false);
    });
});
