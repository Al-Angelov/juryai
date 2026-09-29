import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import App from "./App";

// Smoke test confirming the Vitest + Testing Library + jsdom environment is
// wired correctly for React component tests. App renders the Dashboard
// container (task 10.3); with a default caseId it mounts into its loading
// state and issues the real fetch. We only assert the container mounts, so the
// test stays independent of async API resolution.
describe("App", () => {
  it("mounts and renders the dashboard container", () => {
    render(<App />);
    expect(screen.getByTestId("dashboard")).toBeInTheDocument();
  });
});
