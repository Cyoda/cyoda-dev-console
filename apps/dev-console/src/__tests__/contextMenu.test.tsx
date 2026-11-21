import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { ThemeProvider } from "@cyoda/console-design-system";
import { ContextMenu } from "../components/ContextMenu.js";

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

const items = [
  { label: "Reveal in Finder", onClick: vi.fn() },
  { label: "Open in VS Code", onClick: vi.fn() },
];

describe("ContextMenu", () => {
  it("renders all items as menu items", () => {
    wrap(<ContextMenu x={100} y={100} items={items} onDismiss={vi.fn()} />);
    expect(screen.getByRole("menuitem", { name: "Reveal in Finder" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Open in VS Code" })).toBeInTheDocument();
  });

  it("has role='menu' on the list", () => {
    wrap(<ContextMenu x={100} y={100} items={items} onDismiss={vi.fn()} />);
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("calls the item's onClick when clicked", () => {
    const onClick = vi.fn();
    wrap(
      <ContextMenu
        x={100} y={100}
        items={[{ label: "Reveal in Finder", onClick }]}
        onDismiss={vi.fn()}
      />,
    );
    // The clickable element is the <button> inside the <li role="menuitem">
    fireEvent.click(screen.getByRole("button", { name: "Reveal in Finder" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("calls onDismiss when an item is clicked", () => {
    const onDismiss = vi.fn();
    wrap(
      <ContextMenu
        x={100} y={100}
        items={[{ label: "Reveal in Finder", onClick: vi.fn() }]}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Reveal in Finder" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("calls onDismiss when the backdrop overlay is clicked", () => {
    const onDismiss = vi.fn();
    const { container } = wrap(
      <ContextMenu x={100} y={100} items={items} onDismiss={onDismiss} />,
    );
    // Backdrop is a fixed, role-less div rendered before the <ul>.
    const backdrop = Array.from(container.querySelectorAll("div")).find(
      (el) => el.style.position === "fixed" && !el.getAttribute("role"),
    );
    expect(backdrop).toBeDefined();
    fireEvent.click(backdrop!);
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
