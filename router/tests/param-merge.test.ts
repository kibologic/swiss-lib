// ROUTER-PARAM-MERGE (office navigation-shell design, Part 5.3 item 4): merge params
// across the matched nested chain before Outlet passes them to the leaf component -- a
// parent segment's params must not be silently dropped.
import { describe, it, expect, beforeEach } from 'vitest';
import { createRouter } from '../src/core/router';
import { matchRoute, mergeParams } from '../src/core/matcher';
import { Outlet, registerRouter, setCurrentMatches } from '../src/core/outlet';

describe('Nested-route param merging', () => {
  beforeEach(() => {
    setCurrentMatches(null);
  });

  it('mergeParams() combines params from every level of the matched chain', () => {
    const routes = [
      {
        path: '/teams/:teamId',
        component: 'Team',
        children: [{ path: 'members/:memberId', component: 'Member' }],
      },
    ];
    const match = matchRoute(routes, '/teams/eng/members/42');
    expect(mergeParams(match!)).toEqual({ teamId: 'eng', memberId: '42' });
  });

  it('Outlet passes merged params (not just the leaf-only params) to the rendered component', () => {
    const router = createRouter({
      routes: [
        {
          path: '/teams/:teamId',
          component: { name: 'TeamLayout' },
          children: [{ path: 'members/:memberId', component: { name: 'MemberPage' } }],
        },
      ],
    });
    registerRouter(router);
    setCurrentMatches(router.match('/teams/eng/members/42') ?? null);

    const vnode = new Outlet({}).render();

    expect(vnode).toMatchObject({
      type: { name: 'MemberPage' },
      props: { teamId: 'eng', memberId: '42' },
    });
  });

  it('three-level nesting merges params from every ancestor', () => {
    const router = createRouter({
      routes: [
        {
          path: '/app',
          component: { name: 'App' },
          children: [
            {
              path: 'org/:orgId',
              component: { name: 'Org' },
              children: [{ path: 'team/:teamId', component: { name: 'TeamPage' } }],
            },
          ],
        },
      ],
    });
    registerRouter(router);
    setCurrentMatches(router.match('/app/org/acme/team/eng') ?? null);

    const vnode = new Outlet({}).render();

    expect(vnode).toMatchObject({
      type: { name: 'TeamPage' },
      props: { orgId: 'acme', teamId: 'eng' },
    });
  });

  it('a single-level match is unaffected (backwards compatible)', () => {
    const router = createRouter({
      routes: [{ path: '/user/:id', component: { name: 'UserPage' } }],
    });
    registerRouter(router);
    setCurrentMatches(router.match('/user/42') ?? null);

    const vnode = new Outlet({}).render();

    expect(vnode).toMatchObject({ type: { name: 'UserPage' }, props: { id: '42' } });
  });
});
