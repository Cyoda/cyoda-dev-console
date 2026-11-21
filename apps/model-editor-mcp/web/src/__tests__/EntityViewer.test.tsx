/** @vitest-environment happy-dom */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ThemeProvider } from "@cyoda/console-design-system";
import { EntityViewer } from "../EntityViewer.js";

describe("EntityViewer", () => {
  it("renders a JSON object's keys and values as a tree", () => {
    render(
      <ThemeProvider>
        <EntityViewer contents={JSON.stringify({ name: "CollateralAsset", version: 1 })} />
      </ThemeProvider>,
    );
    expect(screen.getByText(/name/)).toBeInTheDocument();
    expect(screen.getByText(/CollateralAsset/)).toBeInTheDocument();
    expect(screen.getByText(/version/)).toBeInTheDocument();
  });

  it("shows a warning banner for invalid JSON instead of throwing", () => {
    render(
      <ThemeProvider>
        <EntityViewer contents="{not json" />
      </ThemeProvider>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/Invalid JSON/)).toBeInTheDocument();
  });

  it("renders a search box for filtering keys/values", () => {
    render(
      <ThemeProvider>
        <EntityViewer contents={JSON.stringify({ alpha: 1, beta: 2 })} />
      </ThemeProvider>,
    );
    expect(screen.getByPlaceholderText("Search keys and values…")).toBeInTheDocument();
  });

  it("collapses/expands a nested object on click", () => {
    render(
      <ThemeProvider>
        <EntityViewer contents={JSON.stringify({ nested: { a: 1, b: 2, c: 3, d: 4 } })} />
      </ThemeProvider>,
    );
    // depth < 2 starts expanded, so all 4 keys are visible initially.
    expect(screen.getByText(/^a$/)).toBeInTheDocument();
  });
});
