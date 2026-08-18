/** @vitest-environment jsdom */
/* Copyright (c) 2024 Themba Mzumara — SwissJS Framework. MIT License. */
// FRAME-WA-005, attempt 2: mirror office-frontend's AgentFloor.uix shape exactly (the
// component that shipped the one-stable-wrapper workaround). There, the STABLE part is the
// outer <section>; the swap happens in a nested call result (`{this.renderBody()}`) that sits
// as one of SEVERAL children of that stable root, alongside a sibling <header> that itself has
// its own conditional child. renderBody() returns a plain text-ish div in one state and a
// deep subtree (a mapped list of keyed child components) in another.
import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { renderToDOM } from "../renderer/renderer.js";
import { SwissComponent } from "../component/component.js";
import { jsx } from "../vdom/vdom.js";

const flush = async () => {
  for (let i = 0; i < 4; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
};

class Card extends SwissComponent<{ id: string }> {
  render() {
    return jsx("div", { class: "card", "data-testid": `card-${this.props.id}`, children: this.props.id });
  }
}

describe("ternary text-to-subtree swap as one of several sibling children (FRAME-WA-005)", () => {
  it("patches when renderBody()-style nested call flips from text to a mapped subtree", async () => {
    let host: Host | null = null;

    class Host extends SwissComponent {
      state = { loadState: "loading", items: [] as { id: string }[] } as {
        loadState: "loading" | "ok";
        items: { id: string }[];
      };
      constructor(p: unknown) {
        super(p as never);
        host = this;
      }
      renderBody() {
        if (this.state.loadState === "loading") {
          return jsx("div", { "data-testid": "placeholder", children: "Scanning projects…" });
        }
        return jsx("div", {
          class: "body",
          children: [
            jsx("div", {
              class: "row",
              children: this.state.items.map((item) =>
                jsx(Card, { id: item.id, key: item.id }),
              ),
            }),
          ],
        });
      }
      render() {
        return jsx("section", {
          class: "floor",
          children: [
            jsx("header", {
              class: "head",
              children: [
                jsx("h2", { children: "Agents" }),
                this.state.loadState === "ok"
                  ? jsx("span", { "data-testid": "meta", children: `${this.state.items.length} discovered` })
                  : null,
              ],
            }),
            this.renderBody(),
          ],
        });
      }
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    renderToDOM(jsx(Host, {}), container);
    await flush();

    expect(container.querySelector('[data-testid="placeholder"]')).not.toBeNull();
    expect(container.querySelector(".card")).toBeNull();

    host!.state.items = [{ id: "a" }, { id: "b" }];
    host!.state.loadState = "ok";
    await flush();

    expect(
      container.querySelector('[data-testid="card-a"]'),
      "mapped rich subtree should be mounted after loadState flips to ok",
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="placeholder"]'),
      "placeholder should be gone",
    ).toBeNull();
    expect(container.querySelector('[data-testid="meta"]')?.textContent).toBe("2 discovered");
  });
});
