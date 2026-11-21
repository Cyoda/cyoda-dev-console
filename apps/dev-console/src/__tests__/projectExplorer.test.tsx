import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { ThemeProvider } from "@cyoda/console-design-system";
import { ProjectExplorer } from "../components/ProjectExplorer.js";
import type { WorkflowFileIndexEntry } from "@cyoda/workflow-file-indexer";

vi.mock("../ipc/shell.js", () => ({
  revealInFinder: vi.fn().mockResolvedValue(undefined),
  openInIde: vi.fn().mockResolvedValue(undefined),
}));

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

const workflowEntry: WorkflowFileIndexEntry = {
  path: "/project/configs/greeting_workflow.json",
  relativePath: "configs/greeting_workflow.json",
  status: "valid-workflow",
  workflows: [{ name: "greeting_workflow" }],
  lastModified: "",
  sizeBytes: 0,
};

const workflowEntryInSubdir: WorkflowFileIndexEntry = {
  path: "/project/workflows/approval_workflow.json",
  relativePath: "workflows/approval_workflow.json",
  status: "valid-workflow",
  workflows: [{ name: "approval_workflow" }],
  lastModified: "",
  sizeBytes: 0,
};

const entityEntry: WorkflowFileIndexEntry = {
  path: "/project/models/order.json",
  relativePath: "models/order.json",
  status: "json-not-workflow",
  workflows: [],
  lastModified: "",
  sizeBytes: 0,
};

const entityEntryInSubdir: WorkflowFileIndexEntry = {
  path: "/project/entities/customer.json",
  relativePath: "entities/customer.json",
  status: "json-not-workflow",
  workflows: [],
  lastModified: "",
  sizeBytes: 0,
};

const parseErrorEntry: WorkflowFileIndexEntry = {
  path: "/project/configs/broken.json",
  relativePath: "configs/broken.json",
  status: "parse-error",
  workflows: [],
  lastModified: "",
  sizeBytes: 0,
};

const baseProps = {
  selectedPath: null,
  onOpen: vi.fn(),
  collapsed: false,
  onToggleCollapse: vi.fn(),
  onRescan: vi.fn(),
  onOpenSettings: vi.fn(),
  projectRoot: "/project",
};

describe("ProjectExplorer", () => {
  it("renders Workflows and Entities sections", () => {
    wrap(<ProjectExplorer {...baseProps} allEntries={[workflowEntry, entityEntry]} />);
    expect(screen.getByRole("button", { name: /Workflows/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Entities/ })).toBeInTheDocument();
  });

  it("renders the explorer with icon action buttons in the header", () => {
    wrap(<ProjectExplorer {...baseProps} allEntries={[]} />);
    expect(screen.getByRole("button", { name: "Rescan project" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reveal in Finder" })).toBeInTheDocument();
  });

  it("shows a top-level AI Agent nav entry only when onOpenAgent is provided", async () => {
    const onOpenAgent = vi.fn();
    wrap(<ProjectExplorer {...baseProps} allEntries={[]} onOpenAgent={onOpenAgent} />);
    const agentBtn = screen.getByRole("button", { name: /AI Assistant/ });
    expect(agentBtn).toBeInTheDocument();
    await userEvent.click(agentBtn);
    expect(onOpenAgent).toHaveBeenCalledTimes(1);
  });

  it("hides the AI Agent nav entry when onOpenAgent is absent", () => {
    wrap(<ProjectExplorer {...baseProps} allEntries={[]} />);
    expect(screen.queryByRole("button", { name: /AI Assistant/ })).not.toBeInTheDocument();
  });

  it("shows workflow display name — not the full path", () => {
    wrap(<ProjectExplorer {...baseProps} allEntries={[workflowEntry]} />);
    expect(screen.getByText("greeting")).toBeInTheDocument();
    expect(screen.queryByText("configs/greeting_workflow.json")).not.toBeInTheDocument();
  });

  it("full relative path is available as tooltip on the item", () => {
    wrap(<ProjectExplorer {...baseProps} allEntries={[workflowEntry]} />);
    const item = screen.getByTitle("configs/greeting_workflow.json");
    expect(item).toBeInTheDocument();
  });

  it("calls onOpen when a workflow item is clicked", async () => {
    const onOpen = vi.fn();
    wrap(<ProjectExplorer {...baseProps} allEntries={[workflowEntry]} onOpen={onOpen} />);
    await userEvent.click(screen.getByTitle("configs/greeting_workflow.json"));
    expect(onOpen).toHaveBeenCalledWith(workflowEntry);
  });

  it("calls onOpen when an entity item is clicked", async () => {
    const onOpen = vi.fn();
    wrap(<ProjectExplorer {...baseProps} allEntries={[entityEntry]} onOpen={onOpen} />);
    await userEvent.click(screen.getByTitle("models/order.json"));
    expect(onOpen).toHaveBeenCalledWith(entityEntry);
  });

  it("shows selected state on the active item", () => {
    wrap(
      <ProjectExplorer
        {...baseProps}
        allEntries={[workflowEntry]}
        selectedPath={workflowEntry.path}
      />,
    );
    const item = screen.getByTitle("configs/greeting_workflow.json");
    expect(item).toHaveAttribute("aria-pressed", "true");
  });

  it("collapses workflows section when header is clicked", async () => {
    wrap(<ProjectExplorer {...baseProps} allEntries={[workflowEntry]} />);
    expect(screen.getByText("greeting")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Workflows/ }));
    expect(screen.queryByText("greeting")).not.toBeInTheDocument();
  });

  it("collapses entities section when header is clicked", async () => {
    wrap(<ProjectExplorer {...baseProps} allEntries={[entityEntry]} />);
    expect(screen.getByText("order")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Entities/ }));
    expect(screen.queryByText("order")).not.toBeInTheDocument();
  });

  it("filters workflows by search query", async () => {
    wrap(<ProjectExplorer {...baseProps} allEntries={[workflowEntry, parseErrorEntry]} />);
    await userEvent.type(screen.getByRole("searchbox"), "greeting");
    expect(screen.getByText("greeting")).toBeInTheDocument();
    expect(screen.queryByTitle("configs/broken.json")).not.toBeInTheDocument();
  });

  it("shows no-match message when search has no results", async () => {
    wrap(<ProjectExplorer {...baseProps} allEntries={[workflowEntry]} />);
    await userEvent.type(screen.getByRole("searchbox"), "zzznomatch");
    // Both sections show "No matches" when the query has no results
    const msgs = screen.getAllByText("No matches");
    expect(msgs.length).toBeGreaterThan(0);
  });

  it("status dot has accessible label for valid workflow", () => {
    wrap(<ProjectExplorer {...baseProps} allEntries={[workflowEntry]} />);
    expect(screen.getByLabelText("valid")).toBeInTheDocument();
  });

  it("status dot has accessible label for parse error", () => {
    wrap(<ProjectExplorer {...baseProps} allEntries={[parseErrorEntry]} />);
    expect(screen.getByLabelText("error")).toBeInTheDocument();
  });

  it("renders collapse button when not collapsed", () => {
    wrap(<ProjectExplorer {...baseProps} allEntries={[]} />);
    expect(screen.getByRole("button", { name: "Collapse explorer" })).toBeInTheDocument();
  });

  it("renders expand button when collapsed", () => {
    wrap(<ProjectExplorer {...baseProps} allEntries={[]} collapsed={true} />);
    expect(screen.getByRole("button", { name: "Expand explorer" })).toBeInTheDocument();
  });

  it("calls onToggleCollapse when collapse button is clicked", async () => {
    const onToggle = vi.fn();
    wrap(<ProjectExplorer {...baseProps} allEntries={[]} onToggleCollapse={onToggle} />);
    await userEvent.click(screen.getByRole("button", { name: "Collapse explorer" }));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("onOpenSettings prop is accepted (Settings is opened via the header, not the sidebar)", () => {
    // Settings navigation moved to HeaderContext in the redesign.
    // Verify the component accepts the prop without crashing.
    const onOpenSettings = vi.fn();
    wrap(<ProjectExplorer {...baseProps} allEntries={[]} onOpenSettings={onOpenSettings} />);
    expect(screen.queryByRole("button", { name: "Settings" })).not.toBeInTheDocument();
  });

  it("search input has accessible label", () => {
    wrap(<ProjectExplorer {...baseProps} allEntries={[]} />);
    expect(screen.getByLabelText("Search files")).toBeInTheDocument();
  });

  it("item is keyboard-activatable with Enter", async () => {
    const onOpen = vi.fn();
    wrap(<ProjectExplorer {...baseProps} allEntries={[workflowEntry]} onOpen={onOpen} />);
    const item = screen.getByTitle("configs/greeting_workflow.json");
    item.focus();
    await userEvent.keyboard("{Enter}");
    expect(onOpen).toHaveBeenCalledWith(workflowEntry);
  });

  it("workflowRoot hides workflows outside that directory", () => {
    wrap(
      <ProjectExplorer
        {...baseProps}
        allEntries={[workflowEntry, workflowEntryInSubdir]}
        workflowRoot="workflows"
      />,
    );
    expect(screen.getByTitle("workflows/approval_workflow.json")).toBeInTheDocument();
    expect(screen.queryByTitle("configs/greeting_workflow.json")).not.toBeInTheDocument();
  });

  it("entityRoot hides entities outside that directory", () => {
    wrap(
      <ProjectExplorer
        {...baseProps}
        allEntries={[entityEntry, entityEntryInSubdir]}
        entityRoot="entities"
      />,
    );
    expect(screen.getByTitle("entities/customer.json")).toBeInTheDocument();
    expect(screen.queryByTitle("models/order.json")).not.toBeInTheDocument();
  });

  it("null workflowRoot shows all workflows", () => {
    wrap(
      <ProjectExplorer
        {...baseProps}
        allEntries={[workflowEntry, workflowEntryInSubdir]}
        workflowRoot={null}
      />,
    );
    expect(screen.getByTitle("configs/greeting_workflow.json")).toBeInTheDocument();
    expect(screen.getByTitle("workflows/approval_workflow.json")).toBeInTheDocument();
  });

  it("null entityRoot auto-detects entities by folder name", () => {
    wrap(
      <ProjectExplorer
        {...baseProps}
        allEntries={[entityEntry, entityEntryInSubdir]}
        entityRoot={null}
      />,
    );
    // entityEntry is at models/order.json — "models" is an entity folder
    expect(screen.getByTitle("models/order.json")).toBeInTheDocument();
    // entityEntryInSubdir is at entities/customer.json — "entities" is an entity folder
    expect(screen.getByTitle("entities/customer.json")).toBeInTheDocument();
  });

  it("auto-detect excludes files under schema/ folders", () => {
    const schemaEntry: WorkflowFileIndexEntry = {
      path: "/project/schema/entity/Foo.json",
      relativePath: "schema/entity/Foo.json",
      status: "json-not-workflow",
      workflows: [],
      lastModified: "",
      sizeBytes: 0,
    };
    wrap(<ProjectExplorer {...baseProps} allEntries={[schemaEntry]} entityRoot={null} />);
    expect(screen.queryByTitle("schema/entity/Foo.json")).not.toBeInTheDocument();
  });

  it("auto-detect excludes arbitrary JSON files not in entity folders", () => {
    const configEntry: WorkflowFileIndexEntry = {
      path: "/project/config/settings.json",
      relativePath: "config/settings.json",
      status: "json-not-workflow",
      workflows: [],
      lastModified: "",
      sizeBytes: 0,
    };
    wrap(<ProjectExplorer {...baseProps} allEntries={[configEntry]} entityRoot={null} />);
    expect(screen.queryByTitle("config/settings.json")).not.toBeInTheDocument();
  });


  describe("new file (+ button)", () => {
    it("shows + button for workflows when onNewWorkflow is provided", () => {
      wrap(<ProjectExplorer {...baseProps} allEntries={[]} onNewWorkflow={vi.fn()} />);
      expect(screen.getByTitle("New workflow")).toBeInTheDocument();
    });

    it("shows + button for entities when onNewEntity is provided", () => {
      wrap(<ProjectExplorer {...baseProps} allEntries={[]} onNewEntity={vi.fn()} />);
      expect(screen.getByTitle("New entity")).toBeInTheDocument();
    });

    it("hides + button for workflows when onNewWorkflow is absent", () => {
      wrap(<ProjectExplorer {...baseProps} allEntries={[]} />);
      expect(screen.queryByTitle("New workflow")).not.toBeInTheDocument();
    });

    it("hides + button for entities when onNewEntity is absent", () => {
      wrap(<ProjectExplorer {...baseProps} allEntries={[]} />);
      expect(screen.queryByTitle("New entity")).not.toBeInTheDocument();
    });

    it("clicking + shows inline input in Workflows section", async () => {
      wrap(<ProjectExplorer {...baseProps} allEntries={[]} onNewWorkflow={vi.fn()} />);
      await userEvent.click(screen.getByTitle("New workflow"));
      expect(screen.getByPlaceholderText("filename.json")).toBeInTheDocument();
    });

    it("clicking + shows inline input in Entities section", async () => {
      wrap(<ProjectExplorer {...baseProps} allEntries={[]} onNewEntity={vi.fn()} />);
      await userEvent.click(screen.getByTitle("New entity"));
      expect(screen.getByPlaceholderText("filename.json")).toBeInTheDocument();
    });

    it("Enter with name calls onNewWorkflow with .json appended", async () => {
      const onNewWorkflow = vi.fn();
      wrap(<ProjectExplorer {...baseProps} allEntries={[]} onNewWorkflow={onNewWorkflow} />);
      await userEvent.click(screen.getByTitle("New workflow"));
      await userEvent.type(screen.getByPlaceholderText("filename.json"), "my_workflow{Enter}");
      expect(onNewWorkflow).toHaveBeenCalledWith("my_workflow.json");
    });

    it("Enter with name already ending in .json does not double-append", async () => {
      const onNewWorkflow = vi.fn();
      wrap(<ProjectExplorer {...baseProps} allEntries={[]} onNewWorkflow={onNewWorkflow} />);
      await userEvent.click(screen.getByTitle("New workflow"));
      await userEvent.type(screen.getByPlaceholderText("filename.json"), "my_workflow.json{Enter}");
      expect(onNewWorkflow).toHaveBeenCalledWith("my_workflow.json");
    });

    it("Enter with name calls onNewEntity with .json appended", async () => {
      const onNewEntity = vi.fn();
      wrap(<ProjectExplorer {...baseProps} allEntries={[]} onNewEntity={onNewEntity} />);
      await userEvent.click(screen.getByTitle("New entity"));
      await userEvent.type(screen.getByPlaceholderText("filename.json"), "order{Enter}");
      expect(onNewEntity).toHaveBeenCalledWith("order.json");
    });

    it("Escape cancels inline input without calling handler", async () => {
      const onNewWorkflow = vi.fn();
      wrap(<ProjectExplorer {...baseProps} allEntries={[]} onNewWorkflow={onNewWorkflow} />);
      await userEvent.click(screen.getByTitle("New workflow"));
      await userEvent.keyboard("{Escape}");
      expect(screen.queryByPlaceholderText("filename.json")).not.toBeInTheDocument();
      expect(onNewWorkflow).not.toHaveBeenCalled();
    });

    it("clicking + does not collapse the section", async () => {
      wrap(<ProjectExplorer {...baseProps} allEntries={[workflowEntry]} onNewWorkflow={vi.fn()} />);
      expect(screen.getByTitle("configs/greeting_workflow.json")).toBeInTheDocument();
      await userEvent.click(screen.getByTitle("New workflow"));
      expect(screen.getByTitle("configs/greeting_workflow.json")).toBeInTheDocument();
    });
  });

  describe("delete file", () => {
    it("shows Delete in context menu when onDeleteFile is provided", async () => {
      const onDeleteFile = vi.fn();
      wrap(
        <ProjectExplorer
          {...baseProps}
          allEntries={[workflowEntry]}
          onDeleteFile={onDeleteFile}
        />,
      );
      await userEvent.pointer({ target: screen.getByTitle("configs/greeting_workflow.json"), keys: "[MouseRight]" });
      expect(screen.getByText("Delete")).toBeInTheDocument();
    });

    it("hides Delete in context menu when onDeleteFile is absent", async () => {
      wrap(<ProjectExplorer {...baseProps} allEntries={[workflowEntry]} />);
      await userEvent.pointer({ target: screen.getByTitle("configs/greeting_workflow.json"), keys: "[MouseRight]" });
      expect(screen.queryByText("Delete")).not.toBeInTheDocument();
    });

    it("clicking Delete calls onDeleteFile with path and display name", async () => {
      const onDeleteFile = vi.fn();
      wrap(
        <ProjectExplorer
          {...baseProps}
          allEntries={[workflowEntry]}
          onDeleteFile={onDeleteFile}
        />,
      );
      await userEvent.pointer({ target: screen.getByTitle("configs/greeting_workflow.json"), keys: "[MouseRight]" });
      await userEvent.click(screen.getByText("Delete"));
      expect(onDeleteFile).toHaveBeenCalledWith(workflowEntry.path, "greeting");
    });
  });
});
