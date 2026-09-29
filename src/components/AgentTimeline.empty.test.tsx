// Example test for the AgentTimeline empty-state (task 7.5).
//
// When the timeline receives no agent entries it renders the empty-state
// message instead of any nodes (Req 5.6). This example pins that behaviour:
// the EMPTY_TIMELINE_MESSAGE is shown and no toggle buttons are rendered.

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import { AgentTimeline, EMPTY_TIMELINE_MESSAGE } from "./AgentTransparencyTree.tsx";

describe("AgentTimeline empty state", () => {
  it("shows the empty-timeline message and no nodes when there are no entries", () => {
    // Validates: Requirements 5.6
    render(<AgentTimeline entries={[]} />);

    expect(screen.getByText(EMPTY_TIMELINE_MESSAGE)).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
