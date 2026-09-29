// Browser-safe main entry: nothing reachable from here may import a Node built-in
// (ROUTER-BROWSER-ENTRY, enforced by tests/browser-entry.test.ts). Server-only modules
// (SSR renderer, API handler/scanner) are exported from "@swissjs/router/server".
export const VERSION = "0.1.0";

export * from "./core/router.js";
export * from "./core/stateful-router.js";
export * from "./core/outlet.js";
export * from "./core/link.js";
export * from "./ssr/hydration.js";
