import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ThemeProvider } from "@cyoda/console-design-system";
import { HeaderContext } from "../components/HeaderContext.js";

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe("HeaderContext", () => {
  it("shows the project name badge", () => {
    wrap(<HeaderContext projectName="order-demo" dirty={false} />);
    expect(screen.getByText("order-demo")).toBeInTheDocument();
  });

  it("shows the dirty indicator when dirty", () => {
    wrap(<HeaderContext projectName="demo" dirty={true} />);
    expect(screen.getByText("●")).toBeInTheDocument();
  });

  it("hides the dirty indicator when clean", () => {
    wrap(<HeaderContext projectName="demo" dirty={false} />);
    expect(screen.queryByText("●")).not.toBeInTheDocument();
  });

  it("uses a 'Manage projects' tooltip", () => {
    wrap(<HeaderContext projectName="order-demo" dirty={false} />);
    expect(screen.getByRole("button", { name: "order-demo" })).toHaveAttribute(
      "title",
      "Manage projects",
    );
  });

  it("renders a chevron that does not change the accessible name", () => {
    const { container } = wrap(<HeaderContext projectName="order-demo" dirty={false} />);
    expect(container.querySelector(".lucide-chevron-down")).toBeInTheDocument();
    // accessible name is still just the project name (chevron is aria-hidden)
    expect(screen.getByRole("button", { name: "order-demo" })).toBeInTheDocument();
  });

  it("calls onProjectClick when clicked", () => {
    const onProjectClick = vi.fn();
    wrap(<HeaderContext projectName="order-demo" dirty={false} onProjectClick={onProjectClick} />);
    fireEvent.click(screen.getByRole("button", { name: "order-demo" }));
    expect(onProjectClick).toHaveBeenCalledTimes(1);
  });
});
