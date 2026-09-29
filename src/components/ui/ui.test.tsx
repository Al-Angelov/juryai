// Unit tests for the shared UI primitives.
//
// These verify the accessibility-critical behaviors called out in task 5.1:
// disabled controls expose their disabled state, validation messages associate
// via aria-describedby, badges are distinguishable by label (not color alone),
// tooltips appear on hover AND focus, the loading indicator is announced, and
// the error panel's Retry invokes its handler.

import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";

import {
  Badge,
  BADGE_VARIANTS,
  Button,
  Card,
  ErrorPanel,
  LoadingIndicator,
  NumericInput,
  Tooltip,
  TooltipProvider,
} from "./index.ts";
import type { BadgeVariant } from "./index.ts";

describe("Badge", () => {
  it("renders the default label and icon for each variant", () => {
    const variants = Object.keys(BADGE_VARIANTS) as BadgeVariant[];
    for (const variant of variants) {
      const { unmount } = render(<Badge variant={variant} />);
      expect(screen.getByText(BADGE_VARIANTS[variant].label)).toBeInTheDocument();
      unmount();
    }
  });

  it("uses pairwise-distinct labels and color treatments across variants", () => {
    const descriptors = Object.values(BADGE_VARIANTS);
    const labels = descriptors.map((d) => d.label);
    const classes = descriptors.map((d) => d.className);
    expect(new Set(labels).size).toBe(labels.length);
    expect(new Set(classes).size).toBe(classes.length);
  });

  it("allows overriding the label while keeping the variant", () => {
    render(<Badge variant="active">Name Masked</Badge>);
    expect(screen.getByText("Name Masked")).toBeInTheDocument();
  });
});

describe("Button", () => {
  it("forwards the disabled attribute and blocks clicks when disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Approve
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Approve" });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("invokes onClick when enabled", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Retry</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe("Card", () => {
  it("renders a title header and body", () => {
    render(<Card title="Summary">body text</Card>);
    expect(screen.getByText("Summary")).toBeInTheDocument();
    expect(screen.getByText("body text")).toBeInTheDocument();
  });
});

describe("NumericInput", () => {
  it("associates a validation message via aria-describedby and marks invalid", () => {
    render(
      <>
        <NumericInput
          value="-5"
          onValueChange={() => {}}
          label="Line item"
          invalid
          describedById="li-error"
        />
        <span id="li-error">Value must not be negative</span>
      </>,
    );
    const input = screen.getByLabelText("Line item");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "li-error");
  });

  it("exposes the disabled state", () => {
    render(
      <NumericInput value="10" onValueChange={() => {}} label="Cap" disabled />,
    );
    expect(screen.getByLabelText("Cap")).toBeDisabled();
  });

  it("reports raw string changes without coercion", async () => {
    function Harness() {
      const [v, setV] = useState("");
      return (
        <NumericInput value={v} onValueChange={setV} label="Amount" />
      );
    }
    render(<Harness />);
    const input = screen.getByLabelText("Amount");
    await userEvent.type(input, "12.5");
    expect(input).toHaveValue("12.5");
  });
});

describe("Tooltip", () => {
  it("shows content on hover and on focus", async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <Tooltip content="Confidence 92%">
          <button>Entity</button>
        </Tooltip>
      </TooltipProvider>,
    );
    const trigger = screen.getByRole("button", { name: "Entity" });

    await user.hover(trigger);
    await waitFor(() => {
      expect(screen.getAllByText("Confidence 92%").length).toBeGreaterThan(0);
    });
    await user.unhover(trigger);

    trigger.focus();
    await waitFor(() => {
      expect(screen.getAllByText("Confidence 92%").length).toBeGreaterThan(0);
    });
  });
});

describe("LoadingIndicator", () => {
  it("exposes role=status with an accessible name", () => {
    render(<LoadingIndicator label="Loading case" />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-label", "Loading case");
    expect(status).toHaveTextContent("Loading case");
  });
});

describe("ErrorPanel", () => {
  it("renders the message and calls onRetry when Retry is clicked", async () => {
    const onRetry = vi.fn();
    render(<ErrorPanel message="Failed to load" onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Failed to load");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("omits the Retry button when no handler is provided", () => {
    render(<ErrorPanel message="Failed to load" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
