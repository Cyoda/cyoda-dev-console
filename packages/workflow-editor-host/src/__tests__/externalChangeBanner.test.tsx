import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { ThemeProvider } from "@cyoda/console-design-system";
import { ExternalChangeBanner } from "../ExternalChangeBanner.js";

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe("ExternalChangeBanner", () => {
  it("renders a Compare button when onCompare is provided", () => {
    wrap(
      <ExternalChangeBanner onReload={vi.fn()} onIgnore={vi.fn()} onCompare={vi.fn()} dirty={false} />,
    );
    expect(screen.getByRole("button", { name: /compare/i })).toBeInTheDocument();
  });

  it("does not render Compare button when onCompare is absent", () => {
    wrap(<ExternalChangeBanner onReload={vi.fn()} onIgnore={vi.fn()} dirty={false} />);
    expect(screen.queryByRole("button", { name: /compare/i })).not.toBeInTheDocument();
  });

  it("calls onCompare when the Compare button is clicked", async () => {
    const onCompare = vi.fn();
    wrap(
      <ExternalChangeBanner onReload={vi.fn()} onIgnore={vi.fn()} onCompare={onCompare} dirty={false} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /compare/i }));
    expect(onCompare).toHaveBeenCalledOnce();
  });
});
