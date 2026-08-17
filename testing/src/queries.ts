/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/**
 * DOM queries over a mounted container's real (jsdom) DOM tree.
 *
 * These operate on plain `Element`/`Node` — there is no shadow model here. The
 * component under test has already been mounted through the real SwissJS
 * renderer (see mount.ts), so what these functions see is exactly the markup
 * the runtime produced.
 */

export class SwissTestingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SwissTestingError";
  }
}

function textOf(el: Element): string {
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

function matches(value: string, matcher: string | RegExp): boolean {
  if (matcher instanceof RegExp) return matcher.test(value);
  return value === matcher;
}

function ownText(el: Element): string {
  return Array.from(el.childNodes)
    .filter((n) => n.nodeType === 3 /* TEXT_NODE */)
    .map((n) => n.textContent ?? "")
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function collectByText(container: ParentNode, matcher: string | RegExp): Element[] {
  const all = Array.from(container.querySelectorAll("*"));
  return all.filter((el) => {
    // Match elements whose own direct text (not a descendant's) satisfies the
    // matcher, so a match on a leaf doesn't also "match" every ancestor. An
    // element with no direct text nodes but exactly one element child (common
    // with components that render `{expr}` through an intermediate wrapper)
    // falls through to that child's combined text instead of double-counting
    // every ancestor in the chain.
    const own = ownText(el);
    if (own) return matches(own, matcher);
    const elementChildren = Array.from(el.children);
    if (elementChildren.length === 0) return matches(textOf(el), matcher);
    return false;
  });
}

function collectByRole(container: ParentNode, role: string): Element[] {
  const explicit = Array.from(
    container.querySelectorAll(`[role="${role}"]`),
  );
  const implicit = Array.from(container.querySelectorAll(IMPLICIT_ROLE_SELECTORS[role] ?? "__none__"));
  return Array.from(new Set([...explicit, ...implicit]));
}

const IMPLICIT_ROLE_SELECTORS: Record<string, string> = {
  button: "button, input[type=button], input[type=submit]",
  textbox: "input[type=text], input:not([type]), textarea",
  checkbox: "input[type=checkbox]",
  radio: "input[type=radio]",
  link: "a[href]",
  heading: "h1, h2, h3, h4, h5, h6",
  list: "ul, ol",
  listitem: "li",
  img: "img",
};

function collectByTestId(container: ParentNode, testId: string, attribute: string): Element[] {
  return Array.from(container.querySelectorAll(`[${attribute}="${testId}"]`));
}

function describe(matcher: string | RegExp): string {
  return matcher instanceof RegExp ? matcher.toString() : JSON.stringify(matcher);
}

function single(results: Element[], kind: string, description: string): Element {
  if (results.length === 0) {
    throw new SwissTestingError(`Unable to find an element ${kind} ${description}`);
  }
  if (results.length > 1) {
    throw new SwissTestingError(
      `Found multiple elements ${kind} ${description} — use getAllBy*/queryAllBy* instead`,
    );
  }
  return results[0];
}

export interface BoundQueries {
  getByText(matcher: string | RegExp): Element;
  getAllByText(matcher: string | RegExp): Element[];
  queryByText(matcher: string | RegExp): Element | null;
  queryAllByText(matcher: string | RegExp): Element[];
  findByText(matcher: string | RegExp, timeout?: number): Promise<Element>;

  getByRole(role: string): Element;
  getAllByRole(role: string): Element[];
  queryByRole(role: string): Element | null;
  queryAllByRole(role: string): Element[];
  findByRole(role: string, timeout?: number): Promise<Element>;

  getByTestId(testId: string): Element;
  getAllByTestId(testId: string): Element[];
  queryByTestId(testId: string): Element | null;
  queryAllByTestId(testId: string): Element[];
  findByTestId(testId: string, timeout?: number): Promise<Element>;
}

export interface CreateQueriesOptions {
  /** Attribute used by getByTestId. Defaults to "data-testid". */
  testIdAttribute?: string;
}

/**
 * Builds the getBy/queryBy/findBy/getAllBy/queryAllBy family bound to a container.
 * findBy* is implemented on top of waitFor so it observes updates flushed through
 * the real scheduler (see wait-for.ts).
 */
export function createQueries(
  container: HTMLElement,
  waitForFn: <T>(fn: () => T, timeout?: number) => Promise<T>,
  options: CreateQueriesOptions = {},
): BoundQueries {
  const testIdAttribute = options.testIdAttribute ?? "data-testid";

  return {
    getAllByText: (matcher) => {
      const results = collectByText(container, matcher);
      if (results.length === 0) {
        throw new SwissTestingError(`Unable to find any element with text ${describe(matcher)}`);
      }
      return results;
    },
    queryAllByText: (matcher) => collectByText(container, matcher),
    queryByText: (matcher) => {
      const results = collectByText(container, matcher);
      return results.length > 0 ? results[0] : null;
    },
    getByText: (matcher) => single(collectByText(container, matcher), "with text", describe(matcher)),
    findByText: (matcher, timeout) =>
      waitForFn(() => single(collectByText(container, matcher), "with text", describe(matcher)), timeout),

    getAllByRole: (role) => {
      const results = collectByRole(container, role);
      if (results.length === 0) {
        throw new SwissTestingError(`Unable to find any element with role "${role}"`);
      }
      return results;
    },
    queryAllByRole: (role) => collectByRole(container, role),
    queryByRole: (role) => {
      const results = collectByRole(container, role);
      return results.length > 0 ? results[0] : null;
    },
    getByRole: (role) => single(collectByRole(container, role), "with role", `"${role}"`),
    findByRole: (role, timeout) =>
      waitForFn(() => single(collectByRole(container, role), "with role", `"${role}"`), timeout),

    getAllByTestId: (testId) => {
      const results = collectByTestId(container, testId, testIdAttribute);
      if (results.length === 0) {
        throw new SwissTestingError(`Unable to find any element with ${testIdAttribute}="${testId}"`);
      }
      return results;
    },
    queryAllByTestId: (testId) => collectByTestId(container, testId, testIdAttribute),
    queryByTestId: (testId) => {
      const results = collectByTestId(container, testId, testIdAttribute);
      return results.length > 0 ? results[0] : null;
    },
    getByTestId: (testId) =>
      single(collectByTestId(container, testId, testIdAttribute), "with", `${testIdAttribute}="${testId}"`),
    findByTestId: (testId, timeout) =>
      waitForFn(
        () => single(collectByTestId(container, testId, testIdAttribute), "with", `${testIdAttribute}="${testId}"`),
        timeout,
      ),
  };
}
