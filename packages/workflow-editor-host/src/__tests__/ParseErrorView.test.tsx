import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import "@testing-library/jest-dom/vitest";
import { ThemeProvider } from "@cyoda/console-design-system";
import { ParseErrorView } from "../ParseErrorView.js";

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe("ParseErrorView", () => {
  it("shows the parse-error heading", () => {
    wrap(<ParseErrorView issues={[]} />);
    expect(screen.getByText(/Workflow JSON could not be parsed/)).toBeInTheDocument();
  });

  it("renders each validation issue message", () => {
    wrap(
      <ParseErrorView
        issues={[
          { severity: "error", code: "missing_field", message: "Missing importMode field" },
          { severity: "error", code: "invalid_type", message: "workflows must be an array" },
        ]}
      />,
    );
    expect(screen.getByText("Missing importMode field")).toBeInTheDocument();
    expect(screen.getByText("workflows must be an array")).toBeInTheDocument();
  });

  it("prefixes the issue path when detail.path is present", () => {
    wrap(
      <ParseErrorView
        issues={[
          {
            severity: "error",
            code: "schema-invalid_type",
            message: "Required",
            detail: { path: ["workflows", 0, "initialState"] },
          },
        ]}
      />,
    );
    expect(screen.getByText("workflows.0.initialState: Required")).toBeInTheDocument();
  });

  it("shows the raw content block when rawContent is provided", () => {
    wrap(<ParseErrorView issues={[]} rawContent='{"broken": true}' />);
    expect(screen.getByText("File contents:")).toBeInTheDocument();
    expect(screen.getByText('{"broken": true}')).toBeInTheDocument();
  });

  it("does not show the file contents section when rawContent is absent", () => {
    wrap(<ParseErrorView issues={[]} />);
    expect(screen.queryByText("File contents:")).not.toBeInTheDocument();
  });

  it("renders with no issues without errors", () => {
    wrap(<ParseErrorView issues={[]} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
