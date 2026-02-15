/*
 * Browser-safe entry for @swissjs/core.
 * Omits DevServerService and runtimeService to avoid pulling in Node-only code.
 */

import "reflect-metadata";

export {
  SwissFramework,
  SwissApp,
  framework,
  SWISS_VERSION,
} from "./framework/index.js";

export * from "./plugins/index.js";
export * from "./component/index.js";
export * from "./vdom/index.js";
export * from "./hooks/index.js";
export { hydrate } from "./renderer/index.js";
export * from "./reactivity/index.js";
export * from "./security/index.js";
export {
  setSecurityGateway,
  getSecurityGateway,
  evaluateCapability,
  audit,
  auditPlugin,
} from "./security/gateway.js";
export {
  ErrorReporter,
  createErrorBoundary,
  type ErrorContext,
  type ErrorReport,
} from "./error/index.js";
export {
  getDevtoolsBridge,
  setDevtoolsBridge,
  isDevtoolsEnabled,
  isTelemetryEnabled,
  InMemoryBridge,
} from "./devtools/bridge.js";
export type {
  DevtoolsBridge,
  GraphSnapshot,
  ComponentNodePayload,
  ComponentUpdatePayload,
  ComponentId,
  CapabilityName,
  DevtoolsEvent,
  DevtoolsEventCategory,
} from "./devtools/bridge.js";
export * from "./fenestration/registry.js";
export { html, escapeHTML, unsafe, css, classNames } from "./utils/html.js";
export type {
  ComponentConstructor,
  ComponentImport,
  RouteDefinition,
  RouteParams,
  RouteMeta,
  RouterContext,
} from "./types/routing.js";
export { jsx, jsxs, Fragment as JSXFragment } from "./jsx-runtime.js";
export {
  jsx as jsxDEV,
  jsxs as jsxsDEV,
  Fragment as JSXFragmentDEV,
} from "./jsx-dev-runtime.js";
