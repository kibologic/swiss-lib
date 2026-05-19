
import type { Router } from './router.js';
import type { RouteMatch } from './matcher.js';

let _activeRouter: Router | null = null;
let _currentMatches: RouteMatch[] | null = null;

export function registerRouter(router: Router): void {
    _activeRouter = router;
}

export function _getActiveRouter(): Router | null {
    return _activeRouter;
}

export function setCurrentMatches(matches: RouteMatch[] | null): void {
    _currentMatches = matches;
}

export function getCurrentMatches(): RouteMatch[] | null {
    return _currentMatches;
}
