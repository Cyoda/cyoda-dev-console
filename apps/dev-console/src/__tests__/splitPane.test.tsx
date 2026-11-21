import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { ThemeProvider } from "@cyoda/console-design-system";
import { SplitPane } from "../components/SplitPane.js";

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe("SplitPane", () => {
  it("renders left and right panels when not collapsed", () => {
    wrap(
      <SplitPane
        left={<div>File tree</div>}
        right={<div>Editor</div>}
        collapsed={false}
        onToggleCollapse={() => undefined}
      />,
    );
    expect(screen.getByText("File tree")).toBeInTheDocument();
    expect(screen.getByText("Editor")).toBeInTheDocument();
  });

  it("hides the left panel when collapsed", () => {
    wrap(
      <SplitPane
        left={<div>File tree</div>}
        right={<div>Editor</div>}
        collapsed={true}
        onToggleCollapse={() => undefined}
      />,
    );
    const leftContent = screen.getByText("File tree");
    const leftPanel = leftContent.closest("div[style]");
    expect(leftPanel).toHaveStyle({ visibility: "hidden" });
  });

  it("calls onToggleCollapse when the toggle button is clicked", async () => {
    const handler = vi.fn();
    wrap(
      <SplitPane
        left={<div>File tree</div>}
        right={<div>Editor</div>}
        collapsed={false}
        onToggleCollapse={handler}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /collapse|expand/i }));
    expect(handler).toHaveBeenCalledOnce();
  });
});
