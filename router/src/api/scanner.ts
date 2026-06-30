
import { promises as fs } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { type APIRoute, type APIHandler, type Middleware, type HTTPMethod } from './handler.js';

export interface APIRouteFile {
    GET?: APIHandler;
    POST?: APIHandler;
    PUT?: APIHandler;
    DELETE?: APIHandler;
    PATCH?: APIHandler;
    middleware?: Middleware[];
}

const HTTP_METHODS: HTTPMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'];

export class APIRouteScanner {
    async scanAPIRoutes(apiDir: string): Promise<APIRoute[]> {
        const routes: APIRoute[] = [];

        let entries: string[];
        try {
            entries = await this.collectFiles(apiDir);
        } catch {
            return routes;
        }

        for (const filePath of entries) {
            const routePath = this.filePathToAPIRoute(
                '/' + relative(apiDir, filePath).split(sep).join('/')
            );

            let mod: APIRouteFile;
            try {
                mod = await import(pathToFileURL(filePath).href) as APIRouteFile;
            } catch {
                continue;
            }

            const middleware = Array.isArray(mod.middleware) ? mod.middleware as Middleware[] : undefined;

            for (const method of HTTP_METHODS) {
                const handler = mod[method as keyof APIRouteFile] as APIHandler | undefined;
                if (typeof handler === 'function') {
                    routes.push({ path: routePath, method, handler, middleware });
                }
            }
        }

        return routes;
    }

    private async collectFiles(dir: string): Promise<string[]> {
        const results: string[] = [];
        let entries;
        try {
            entries = await fs.readdir(dir, { withFileTypes: true });
        } catch {
            return results;
        }

        for (const entry of entries) {
            const full = join(dir, entry.name);
            if (entry.isDirectory()) {
                results.push(...await this.collectFiles(full));
            } else if (entry.isFile() && /\.(ts|js|mjs)$/.test(entry.name)) {
                results.push(full);
            }
        }

        return results;
    }

    filePathToAPIRoute(filePath: string): string {
        return filePath
            .replace(/\.(ts|js|mjs)$/, '')
            .replace(/\[([^\]]+)\]/g, ':$1')
            .replace(/\/index$/, '') || '/';
    }
}

export function createAPIScanner(): APIRouteScanner {
    return new APIRouteScanner();
}
