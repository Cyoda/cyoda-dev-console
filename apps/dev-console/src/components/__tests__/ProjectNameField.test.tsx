import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, createEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ThemeProvider } from "@cyoda/console-design-system";
import { ProjectNameField } from "../ProjectNameField.js";

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}
const ROOT = "/Users/paul/projects/order-management-demo";

describe("ProjectNameField", () => {
  it("renders an input prefilled with the name", () => {
    wrap(<ProjectNameField name="my-proj" rootPath={ROOT} onCommit={vi.fn()} />);
    expect(screen.getByLabelText("Project name")).toHaveValue("my-proj");
  });

  it("commits a new value on Enter", () => {
    const onCommit = vi.fn();
    wrap(<ProjectNameField name="my-proj" rootPath={ROOT} onCommit={onCommit} />);
    const input = screen.getByLabelText("Project name");
    fireEvent.change(input, { target: { value: "renamed" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("renamed");
  });

  it("commits a new value on blur", () => {
    const onCommit = vi.fn();
    wrap(<ProjectNameField name="my-proj" rootPath={ROOT} onCommit={onCommit} />);
    const input = screen.getByLabelText("Project name");
    fireEvent.change(input, { target: { value: "renamed" } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith("renamed");
  });

  it("trims surrounding whitespace before committing", () => {
    const onCommit = vi.fn();
    wrap(<ProjectNameField name="my-proj" rootPath={ROOT} onCommit={onCommit} />);
    const input = screen.getByLabelText("Project name");
    fireEvent.change(input, { target: { value: "  spaced  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith("spaced");
  });

  it("does not commit empty/whitespace and reverts the input", () => {
    const onCommit = vi.fn();
    wrap(<ProjectNameField name="my-proj" rootPath={ROOT} onCommit={onCommit} />);
    const input = screen.getByLabelText("Project name");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveValue("my-proj");
  });

  it("does not commit the unchanged name (Enter or blur) and keeps it shown", () => {
    const onCommit = vi.fn();
    wrap(<ProjectNameField name="my-proj" rootPath={ROOT} onCommit={onCommit} />);
    const input = screen.getByLabelText("Project name");
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveValue("my-proj");
  });

  it("reverts to the name on Escape without committing", () => {
    const onCommit = vi.fn();
    wrap(<ProjectNameField name="my-proj" rootPath={ROOT} onCommit={onCommit} />);
    const input = screen.getByLabelText("Project name");
    fireEvent.change(input, { target: { value: "scratch" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveValue("my-proj");
  });

  it("caps the input length at 200", () => {
    wrap(<ProjectNameField name="my-proj" rootPath={ROOT} onCommit={vi.fn()} />);
    expect(screen.getByLabelText("Project name")).toHaveAttribute("maxlength", "200");
  });

  it("renders a chip per unique trailing folder segment (last 5), including the leaf", () => {
    wrap(<ProjectNameField name="x" rootPath="/a/b/c/d/e/f/order" onCommit={vi.fn()} />);
    // last 5 of [a,b,c,d,e,f,order] => [c,d,e,f,order]
    expect(screen.getByRole("button", { name: "order" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "c" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "a" })).toBeNull();
    expect(screen.queryByRole("button", { name: "b" })).toBeNull();
  });

  it("drops empty and duplicate segments (trailing slash / repeats)", () => {
    wrap(<ProjectNameField name="x" rootPath="/a/build/build/" onCommit={vi.fn()} />);
    expect(screen.getAllByRole("button", { name: "build" })).toHaveLength(1);
  });

  it("renders no chips for an empty or root path", () => {
    const { rerender } = wrap(<ProjectNameField name="x" rootPath="/" onCommit={vi.fn()} />);
    expect(screen.queryByText("Use a folder name:")).toBeNull();
    rerender(<ThemeProvider><ProjectNameField name="x" rootPath="" onCommit={vi.fn()} /></ThemeProvider>);
    expect(screen.queryByText("Use a folder name:")).toBeNull();
  });

  it("renders exactly one chip for a single-segment path", () => {
    wrap(<ProjectNameField name="x" rootPath="/Projects" onCommit={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Projects" })).toBeInTheDocument();
  });

  it("commits the segment once when a chip is clicked and shows it in the input", () => {
    const onCommit = vi.fn();
    wrap(<ProjectNameField name="x" rootPath={ROOT} onCommit={onCommit} />);
    fireEvent.click(screen.getByRole("button", { name: "order-management-demo" }));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("order-management-demo");
    expect(screen.getByLabelText("Project name")).toHaveValue("order-management-demo");
  });

  it("does not commit a chip whose segment exceeds 200 chars", () => {
    const long = "z".repeat(250);
    const onCommit = vi.fn();
    wrap(<ProjectNameField name="x" rootPath={`/a/${long}`} onCommit={onCommit} />);
    fireEvent.click(screen.getByRole("button", { name: long }));
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("renders chips as native buttons (keyboard-operable) with the segment as the name", () => {
    wrap(<ProjectNameField name="x" rootPath={ROOT} onCommit={vi.fn()} />);
    const chip = screen.getByRole("button", { name: "projects" });
    expect(chip.tagName).toBe("BUTTON");
    expect(chip).toHaveAttribute("type", "button");
  });

  it("prevents the input from blurring when a chip is pressed (mousedown preventDefault)", () => {
    wrap(<ProjectNameField name="x" rootPath={ROOT} onCommit={vi.fn()} />);
    const chip = screen.getByRole("button", { name: "projects" });
    const ev = createEvent.mouseDown(chip);
    fireEvent(chip, ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("does not double-commit when Enter is followed by blur", () => {
    const onCommit = vi.fn();
    wrap(<ProjectNameField name="my-proj" rootPath={ROOT} onCommit={onCommit} />);
    const input = screen.getByLabelText("Project name");
    fireEvent.change(input, { target: { value: "renamed" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("renamed");
  });

  it("preserves unsaved text when the name prop changes, and a later chip click still commits", () => {
    const onCommit = vi.fn();
    const { rerender } = wrap(<ProjectNameField name="a" rootPath={ROOT} onCommit={onCommit} />);
    const input = screen.getByLabelText("Project name");
    fireEvent.change(input, { target: { value: "draft" } });
    rerender(<ThemeProvider><ProjectNameField name="b" rootPath={ROOT} onCommit={onCommit} /></ThemeProvider>);
    expect(input).toHaveValue("draft"); // mount-once seed: not clobbered
    fireEvent.click(screen.getByRole("button", { name: "order-management-demo" }));
    expect(onCommit).toHaveBeenCalledWith("order-management-demo");
  });
});
