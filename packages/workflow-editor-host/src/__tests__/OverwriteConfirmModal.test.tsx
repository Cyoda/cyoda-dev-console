import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { ThemeProvider } from "@cyoda/console-design-system";
import { OverwriteConfirmModal } from "../OverwriteConfirmModal.js";

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe("OverwriteConfirmModal", () => {
  it("shows the 'Overwrite workflow file?' title", () => {
    wrap(
      <OverwriteConfirmModal
        path="/proj/wf.json"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("Overwrite workflow file?")).toBeInTheDocument();
  });

  it("displays the file path", () => {
    wrap(
      <OverwriteConfirmModal
        path="/proj/workflows/order.json"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("/proj/workflows/order.json")).toBeInTheDocument();
  });

  it("renders Cancel and Overwrite buttons", () => {
    wrap(
      <OverwriteConfirmModal path="/proj/wf.json" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Overwrite" })).toBeInTheDocument();
  });

  it("calls onCancel when Cancel is clicked", () => {
    const onCancel = vi.fn();
    wrap(
      <OverwriteConfirmModal path="/proj/wf.json" onConfirm={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("calls onConfirm when Overwrite is clicked", () => {
    const onConfirm = vi.fn();
    wrap(
      <OverwriteConfirmModal path="/proj/wf.json" onConfirm={onConfirm} onCancel={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Overwrite" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
