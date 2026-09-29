/**
 * ROUTER-SPLAT-SEGMENT: a trailing `*name` segment captures the whole remainder of the path
 * (one or more segments) as a single param, so `/docs/*path` covers /docs/a, /docs/a/b/c, ...
 */
import { describe, it, expect } from 'vitest';
import { matchRoute, mergeParams } from '../src/core/matcher';

const docs = [{ path: '/docs/*path', component: 'Docs' }];

describe('splat segment', () => {
  it('captures depth 1..n as a slash-joined param', () => {
    for (const [url, path] of [
      ['/docs/a', 'a'],
      ['/docs/a/b', 'a/b'],
      ['/docs/a/b/c', 'a/b/c'],
      ['/docs/1/2/3/4/5/6/7/8/9/10/11/12', '1/2/3/4/5/6/7/8/9/10/11/12'],
    ]) {
      const m = matchRoute(docs, url);
      expect(m, url).toBeDefined();
      expect(m![0].params).toEqual({ path });
    }
  });

  it('empty remainder does not match: /docs is not /docs/*path', () => {
    expect(matchRoute(docs, '/docs')).toBeUndefined();
    expect(matchRoute(docs, '/docs/')).toBeUndefined();
  });

  it('an index route can be declared next to the splat for the empty remainder', () => {
    const routes = [...docs, { path: '/docs', component: 'DocsIndex' }];
    expect(matchRoute(routes, '/docs')![0].route.component).toBe('DocsIndex');
    expect(matchRoute(routes, '/docs/x')![0].route.component).toBe('Docs');
  });

  it('does not match a different literal prefix', () => {
    expect(matchRoute(docs, '/other/a/b')).toBeUndefined();
  });

  it('a bare `*` captures under the param name "*"', () => {
    const m = matchRoute([{ path: '/files/*', component: 'F' }], '/files/x/y');
    expect(m![0].params).toEqual({ '*': 'x/y' });
  });

  it('combines with :param segments before it', () => {
    const m = matchRoute([{ path: '/org/:org/files/*rest', component: 'F' }], '/org/acme/files/a/b.txt');
    expect(m![0].params).toEqual({ org: 'acme', rest: 'a/b.txt' });
  });

  it('ignores a trailing slash and query/hash handling stays the caller\'s (like :param)', () => {
    expect(matchRoute(docs, '/docs/a/b/')![0].params).toEqual({ path: 'a/b' });
  });

  it('keeps percent-encoding verbatim, like :param (the router never decodes)', () => {
    expect(matchRoute(docs, '/docs/a%20b/c%2Fd')![0].params).toEqual({ path: 'a%20b/c%2Fd' });
    expect(matchRoute([{ path: '/u/:id', component: 'U' }], '/u/a%20b')![0].params).toEqual({ id: 'a%20b' });
  });

  describe('precedence', () => {
    it('static beats splat regardless of declaration order', () => {
      const routes = [
        { path: '/docs/*path', component: 'Splat' },
        { path: '/docs/intro', component: 'Intro' },
      ];
      expect(matchRoute(routes, '/docs/intro')![0].route.component).toBe('Intro');
      expect(matchRoute(routes, '/docs/intro/more')![0].route.component).toBe('Splat');
    });

    it(':param beats splat regardless of declaration order', () => {
      const routes = [
        { path: '/docs/*path', component: 'Splat' },
        { path: '/docs/:id', component: 'One' },
      ];
      expect(matchRoute(routes, '/docs/x')![0].route.component).toBe('One');
      expect(matchRoute(routes, '/docs/x/y')![0].route.component).toBe('Splat');
    });

    it('a root-level splat is the last resort for unmatched paths', () => {
      const routes = [
        { path: '/*rest', component: 'NotFound' },
        { path: '/', component: 'Home' },
        { path: '/about', component: 'About' },
      ];
      expect(matchRoute(routes, '/')![0].route.component).toBe('Home');
      expect(matchRoute(routes, '/about')![0].route.component).toBe('About');
      expect(matchRoute(routes, '/nope/deep')![0].params).toEqual({ rest: 'nope/deep' });
    });
  });

  describe('nesting', () => {
    it('works as a child route and merges with parent params', () => {
      const routes = [
        {
          path: '/teams/:teamId',
          component: 'Team',
          children: [{ path: 'wiki/*page', component: 'Wiki' }],
        },
      ];
      const m = matchRoute(routes, '/teams/7/wiki/a/b')!;
      expect(m).toHaveLength(2);
      expect(mergeParams(m)).toEqual({ teamId: '7', page: 'a/b' });
    });
  });

  it('rejects a splat that is not the final segment', () => {
    expect(() => matchRoute([{ path: '/a/*rest/b', component: 'X' }], '/a/x/b')).toThrow(/splat/i);
  });
});
