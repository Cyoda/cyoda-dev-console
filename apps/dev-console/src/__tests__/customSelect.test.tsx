import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { ThemeProvider } from "@cyoda/console-design-system";
import { CustomSelect } from "../components/CustomSelect.js";

const options = [
  { value: "claude", label: "Claude Code" },
  { value: "gemini", label: "Gemini CLI" },
  { value: "codex", label: "Codex" },
];

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe("CustomSelect", () => {
  it("shows the label of the currently selected option", () => {
    wrap(<CustomSelect value="claude" onChange={vi.fn()} options={options} />);
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
  });

  it("shows the raw value when no matching option label exists", () => {
    wrap(<CustomSelect value="unknown" onChange={vi.fn()} options={options} />);
    expect(screen.getByText("unknown")).toBeInTheDocument();
  });

  it("dropdown is closed by default — options not visible", () => {
    wrap(<CustomSelect value="claude" onChange={vi.fn()} options={options} />);
    // Only the trigger button shows "Claude Code"; the dropdown list is hidden
    expect(screen.queryByRole("button", { name: "Gemini CLI" })).not.toBeInTheDocument();
  });

  it("opens the dropdown when the trigger button is clicked", () => {
    wrap(<CustomSelect value="claude" onChange={vi.fn()} options={options} />);
    fireEvent.click(screen.getByRole("button", { name: "Claude Code" }));
    expect(screen.getByRole("button", { name: "Gemini CLI" })).toBeInTheDocument();
  });

  it("calls onChange with the selected value when an option is clicked", () => {
    const onChange = vi.fn();
    wrap(<CustomSelect value="claude" onChange={onChange} options={options} />);
    fireEvent.click(screen.getByRole("button", { name: "Claude Code" }));
    fireEvent.click(screen.getByRole("button", { name: "Gemini CLI" }));
    expect(onChange).toHaveBeenCalledWith("gemini");
  });

  it("closes the dropdown after an option is selected", () => {
    wrap(<CustomSelect value="claude" onChange={vi.fn()} options={options} />);
    fireEvent.click(screen.getByRole("button", { name: "Claude Code" }));
    fireEvent.click(screen.getByRole("button", { name: "Gemini CLI" }));
    expect(screen.queryByRole("button", { name: "Codex" })).not.toBeInTheDocument();
  });

  it("closes the dropdown when clicking outside", () => {
    wrap(<CustomSelect value="claude" onChange={vi.fn()} options={options} />);
    fireEvent.click(screen.getByRole("button", { name: "Claude Code" }));
    expect(screen.getByRole("button", { name: "Gemini CLI" })).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("button", { name: "Gemini CLI" })).not.toBeInTheDocument();
  });

  it("toggles closed when the trigger is clicked again while open", () => {
    wrap(<CustomSelect value="claude" onChange={vi.fn()} options={options} />);
    const trigger = screen.getByRole("button", { name: "Claude Code" });
    fireEvent.click(trigger);
    fireEvent.click(trigger);
    expect(screen.queryByRole("button", { name: "Gemini CLI" })).not.toBeInTheDocument();
  });
});
