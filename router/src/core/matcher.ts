import type { Route } from './router.js';

export interface RouteMatch {
  path: string;
  params: Record<string, string>;
  route: Route;
  branches?: RouteMatch[];
}

export function matchRoute(
  routes: Route[],
  path: string,
  basePath = "",
): RouteMatch[] | undefined {
  // A catch-all (`*name`) is the last resort among its siblings whatever the declaration
  // order, so it can never shadow a static or `:param` route (ROUTER-SPLAT-SEGMENT).
  const ordered = [
    ...routes.filter((r) => !hasSplat(r.path)),
    ...routes.filter((r) => hasSplat(r.path)),
  ];
  for (const route of ordered) {
    const fullPath = (basePath + "/" + route.path).replace(/\/+/g, "/");

    // Check if current path matches this route segment
    const match = matchPath(fullPath, path, !route.children);

    if (match) {
      const currentMatch: RouteMatch = {
        path: fullPath,
        params: match.params,
        route,
      };

      // If exact match or no children, we found a leaf (or exact parent match if allowed)
      if (match.isExact) {
        return [currentMatch];
      }

      // If not exact, we must look into children
      if (route.children) {
        const childBranch = matchRoute(route.children, path, fullPath);
        if (childBranch) {
          return [currentMatch, ...childBranch];
        }
      }
    }
  }
  return undefined;
}

/**
 * Merge params across every level of a matched nested chain (ROUTER-PARAM-MERGE). Later
 * (deeper) levels win on key collision. Made explicit here rather than left as a side
 * effect of how each level's own `params` happens to be computed, so consumers (Outlet,
 * loaders) have one documented way to get the full param set for a route.
 */
export function mergeParams(matches: RouteMatch[]): Record<string, string> {
  return matches.reduce<Record<string, string>>(
    (merged, m) => ({ ...merged, ...m.params }),
    {},
  );
}

/**
 * Splat (catch-all) syntax: a FINAL segment starting with `*` -- `/docs/*path` -- captures
 * the whole remainder (one or more segments, slash-joined, verbatim like `:param`) under the
 * name after the `*`; a bare `*` captures under the name `"*"`. It needs at least one
 * remaining segment, so `/docs` does not match `/docs/*path` (declare `/docs` separately).
 */
function hasSplat(routePath: string): boolean {
  const parts = routePath.split("/").filter(Boolean);
  return parts.length > 0 && parts[parts.length - 1].startsWith("*");
}

function matchPath(
  routePath: string,
  currentPath: string,
  end: boolean,
): { params: Record<string, string>; isExact: boolean } | null {
  // Normalize paths
  const routeParts = routePath.split("/").filter(Boolean);
  const currentParts = currentPath.split("/").filter(Boolean);

  const splatAt = routeParts.findIndex((p) => p.startsWith("*"));
  if (splatAt !== -1 && splatAt !== routeParts.length - 1) {
    throw new Error(
      `Invalid route "${routePath}": a splat segment ("*name") must be the last segment`,
    );
  }
  if (splatAt !== -1) {
    // Needs at least one segment for the splat itself; always a leaf (exact) match.
    if (currentParts.length <= splatAt) return null;
    const params: Record<string, string> = {};
    for (let i = 0; i < splatAt; i++) {
      const routePart = routeParts[i];
      if (routePart.startsWith(":")) params[routePart.slice(1)] = currentParts[i];
      else if (routePart !== currentParts[i]) return null;
    }
    params[routeParts[splatAt].slice(1) || "*"] = currentParts.slice(splatAt).join("/");
    return { params, isExact: true };
  }

  // If strict match requested (end=true), lengths must match
  if (end && routeParts.length !== currentParts.length) {
    return null;
  }

  // If prefix match allowed (end=false), route must be shorter or equal
  if (!end && routeParts.length > currentParts.length) {
    return null;
  }

  const params: Record<string, string> = {};

  for (let i = 0; i < routeParts.length; i++) {
    const routePart = routeParts[i];
    const currentPart = currentParts[i];

    if (routePart.startsWith(":")) {
      const paramName = routePart.slice(1);
      params[paramName] = currentPart;
    } else if (routePart !== currentPart) {
      return null;
    }
  }

  return {
    params,
    isExact: routeParts.length === currentParts.length,
  };
}
