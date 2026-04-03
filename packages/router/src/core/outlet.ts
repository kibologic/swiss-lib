import { SwissComponent, createElement } from "@kibologic/core";

// Mock of an Outlet component
// In a real implementation this would use Context to find the matching child route
export class Outlet extends SwissComponent {
  render() {
    // TODO: Get matched route component from context
    // const route = this.fenestrate('route:match');
    return createElement(
      "div",
      { class: "outlet-placeholder" },
      "<!-- Nested Route Content -->",
    );
  }
}
