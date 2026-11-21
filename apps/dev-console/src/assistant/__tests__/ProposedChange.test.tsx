import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { ThemeProvider } from "@cyoda/console-design-system";
import { ProposedChange } from "../ProposedChange.js";

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

const base = {
  current: '{"importMode":"MERGE","workflows":[]}',
  proposed: '{"importMode":"MERGE","workflows":[{"name":"updated"}]}',
  applying: false,
  onApply: vi.fn(),
  onCancel: vi.fn(),
};

describe("ProposedChange", () => {
  it("renders the current and proposed diff panes", () => {
    wrap(<ProposedChange {...base} />);
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getByText("Proposed")).toBeInTheDocument();
    expect(screen.getByText(base.current)).toBeInTheDocument();
    expect(screen.getByText(base.proposed)).toBeInTheDocument();
  });

  it("uses the default apply label 'Apply to file'", () => {
    wrap(<ProposedChange {...base} />);
    expect(screen.getByRole("button", { name: "Apply to file" })).toBeInTheDocument();
  });

  it("uses a custom applyLabel when provided", () => {
    wrap(<ProposedChange {...base} applyLabel="Apply to editor" />);
    expect(screen.getByRole("button", { name: "Apply to editor" })).toBeInTheDocument();
  });

  it("shows 'Applying…' and disables buttons while applying", () => {
    wrap(<ProposedChange {...base} applying={true} />);
    expect(screen.getByRole("button", { name: "Applying…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("calls onApply when the apply button is clicked", () => {
    const onApply = vi.fn();
    wrap(<ProposedChange {...base} onApply={onApply} />);
    fireEvent.click(screen.getByRole("button", { name: "Apply to file" }));
    expect(onApply).toHaveBeenCalledOnce();
  });

  it("calls onCancel when the Cancel button is clicked", () => {
    const onCancel = vi.fn();
    wrap(<ProposedChange {...base} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("opens a modal with the full Current JSON when the expand button is clicked", () => {
    wrap(<ProposedChange {...base} />);
    fireEvent.click(screen.getByTitle("Expand Current"));
    const modal = screen.getAllByText(base.current);
    expect(modal.length).toBeGreaterThanOrEqual(2); // inline pane + modal
    expect(screen.getByTitle("Close")).toBeInTheDocument();
  });

  it("opens a modal with the full Proposed JSON when the expand button is clicked", () => {
    wrap(<ProposedChange {...base} />);
    fireEvent.click(screen.getByTitle("Expand Proposed"));
    const modal = screen.getAllByText(base.proposed);
    expect(modal.length).toBeGreaterThanOrEqual(2);
  });

  it("closes the modal when the X button is clicked", () => {
    wrap(<ProposedChange {...base} />);
    fireEvent.click(screen.getByTitle("Expand Current"));
    expect(screen.getByTitle("Close")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Close"));
    expect(screen.queryByTitle("Close")).not.toBeInTheDocument();
  });

  it("closes the modal when the backdrop is clicked", () => {
    wrap(<ProposedChange {...base} />);
    fireEvent.click(screen.getByTitle("Expand Proposed"));
    fireEvent.click(screen.getByTestId("expand-backdrop"));
    expect(screen.queryByTitle("Close")).not.toBeInTheDocument();
  });
});
