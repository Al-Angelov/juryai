// Vitest global setup for React component tests.
// Extends `expect` with jest-dom matchers and cleans up the DOM after each test.
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom does not implement ResizeObserver, which Radix UI primitives (e.g. the
// Tooltip's Popper positioning) rely on. Provide a no-op polyfill so those
// components can mount under the test environment.
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver;
}

afterEach(() => {
  cleanup();
});
