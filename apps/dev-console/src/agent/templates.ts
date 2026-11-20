// Curated, in-repo rule-file and bundle-document templates for the BYO AI surface.
//
// TODO(byo-ai): source rule-file content from Cyoda/cyoda-skills SKILL.md pinned to
// a commit SHA and transform per agent (BYO_AI-spec §7, §14). For now these are hand-written
// briefs that point the agent at the authoritative skills repo.

import type { TaskBundleRequest } from "@cyoda/agent-bridge-contract";

export const TEMPLATE_VERSION = "dev-console-byo-ai-templates-v1";

/** Profile names must be safe to embed in single-quoted shell (BYO_AI-spec §19.3). */
export const PROFILE_NAME_RE = /^[a-zA-Z0-9_.-]{1,64}$/;

export type RuleFileName = TaskBundleRequest["agentRuleFile"];

export type AgentId = "claude" | "gemini" | "codex";

/** The rule file each supported agent reads at the project root. */
export const RULE_FILE_FOR_AGENT: Record<AgentId, RuleFileName> = {
  claude: "CLAUDE.md",
  gemini: "GEMINI.md",
  codex: "AGENTS.md",
};

export interface TemplateInput {
  /** Absolute project root (informational, shown in the brief). */
  projectRoot: string;
  /** Project-relative path of the selected workflow file, if any. */
  workflowRelPath?: string;
  /** Project-relative path of the selected entity/model file, if any. */
  entityRelPath?: string;
  /** Selected profile name, if a profile was chosen. */
  profileName?: string;
  /** Selected profile endpoint, if known. */
  endpoint?: string;
  /** Selected profile environment, if known. */
  env?: "development" | "production";
  /** Free-text brief describing what the user wants, editable before generation. */
  brief?: string;
}

const SKILLS_REPO = "https://github.com/Cyoda/cyoda-skills";

/**
 * Replace backticks in a path string so they cannot break an inline code fence.
 * Uses a visually similar Unicode character (modifier letter grave accent U+02CB).
 */
function safeForCodeFence(value: string): string {
  return value.replace(/`/g, "ˋ");
}


/**
 * Shared body describing how an agent should work against a Cyoda project. The tool list
 * mirrors the cross-track tool contract in BYO_AI-spec §18. Authoritative, evolving
 * instructions live in `cyoda-skills`; this brief points there rather than restating them.
 */
function cyodaBriefBody(input: TemplateInput): string {
  const env = input.env ?? "development";
  const endpoint = input.endpoint ?? "(no profile selected — see profile-instructions.md)";
  const profileLine = input.profileName
    ? `Active Cyoda profile: \`${input.profileName}\` (env: ${env}, endpoint: ${endpoint})`
    : "No Cyoda profile selected. Set one up via profile-instructions.md before calling the backend.";

  return [
    "## Working on a Cyoda project",
    "",
    "Cyoda models business behaviour as **entity workflows**: each entity moves through named",
    "states via transitions, and processors/criteria attached to those transitions implement the",
    "logic. This project contains workflow definitions and entity/model JSON that you help author,",
    "correct, and validate.",
    "",
    profileLine,
    "",
    "### Authoritative skills",
    "",
    `The source of truth for how to build on Cyoda is the skills repository: ${SKILLS_REPO}.`,
    "Read the relevant SKILL.md (app, setup, auth, design, build, compute, test, debug, migrate,",
    "docs, status) before making non-trivial changes. If a skill contradicts this brief, the skill",
    "wins — this file is a generated convenience, not the specification.",
    "",
    "### Cyoda tool contract",
    "",
    "When acting against a connected Cyoda backend, the available operations are:",
    "",
    "| Tool | Kind |",
    "| --- | --- |",
    "| `list_workflows(entity_model)` | read |",
    "| `get_workflow(id)` | read |",
    "| `update_workflow(id, definition, dry_run)` | write |",
    "| `list_entities(model, filter)` | read |",
    "| `get_entity(id, as_of)` | read |",
    "| `create_entity(model, data)` | write |",
    "| `transition_entity(id, transition_name)` | write |",
    "| `run_report(report_id, params)` | read |",
    "",
    "These map to existing Cyoda REST surfaces. Credentials come from the Cyoda profile",
    "(`~/.config/cyoda/cyoda-plugin-config.json`), never from this file.",
    "",
    "### Rules",
    "",
    "1. Never write to a `production` endpoint without explicit user confirmation.",
    "2. Validate every workflow update against the schema before applying it.",
    "3. Treat the workflow JSON as the contract — do not invent states, transitions, or processors",
    "   that the user has not asked for.",
    "4. Prefer `dry_run` first for any write tool, then apply once the user approves the diff.",
    "",
    "### Project context",
    "",
    `- Project root: \`${safeForCodeFence(input.projectRoot)}\``,
    input.workflowRelPath
      ? `- Selected workflow: \`${safeForCodeFence(input.workflowRelPath)}\``
      : "- Selected workflow: (none)",
    input.entityRelPath
      ? `- Selected entity/model: \`${safeForCodeFence(input.entityRelPath)}\``
      : "- Selected entity/model: (none)",
    "",
    input.brief ? `### What the user wants\n\n${input.brief}\n` : "",
  ].join("\n");
}

const AGENT_HEADER: Record<RuleFileName, string> = {
  "CLAUDE.md": "# Cyoda — Claude Code project instructions",
  "GEMINI.md": "# Cyoda — Gemini CLI project instructions",
  "AGENTS.md": "# Cyoda — agent instructions (AGENTS.md)",
  ".cursorrules": "# Cyoda — Cursor rules",
  ".clinerules": "# Cyoda — Cline rules",
};

/** Generate the per-agent rule file content. Sized ~4–12 KiB (BYO_AI-spec AC32). */
export function generateRuleFile(ruleFile: RuleFileName, input: TemplateInput): string {
  const header = AGENT_HEADER[ruleFile] ?? "# Cyoda — agent instructions";
  const padding = [
    "",
    "---",
    "",
    "### Notes for this agent",
    "",
    "- This file was generated by the Cyoda Dev Console. Regenerate it after the project's",
    "  workflows change so the selected-context section stays accurate.",
    "- Keep responses grounded in the workflow/entity JSON present in the repository.",
    "- When you are unsure whether an operation targets development or production, stop and ask.",
    `- Authoritative, versioned instructions: ${SKILLS_REPO}`,
    "",
  ].join("\n");
  return `${header}\n\n${cyodaBriefBody(input)}\n${padding}`;
}

/** Generate `cyoda-agent-task.md`, the portable brief at the root of the bundle. */
export function generateAgentTaskMd(input: TemplateInput, ruleFile: RuleFileName): string {
  const env = input.env ?? "development";
  const endpoint = input.endpoint ?? "(none — see profile-instructions.md)";
  return [
    "# Cyoda Agent Task",
    "",
    `Active Cyoda environment endpoint: ${endpoint}`,
    `Console-side environment label: ${env}`,
    `Cyoda profile target: ${input.profileName ?? "(none)"}`,
    "",
    "## What the user wants",
    "",
    input.brief?.trim() ? input.brief.trim() : "(describe the task here)",
    "",
    "## Cyoda context",
    "",
    `- Workflow file: ${input.workflowRelPath ? "workflow.json" : "(not included)"}`,
    `- Sample entity: ${input.entityRelPath ? "entity-sample.json" : "(not included)"}`,
    `- Skills source: ${SKILLS_REPO}`,
    `- Skills install / conventions: see ${ruleFile}`,
    "",
    "## Rules",
    "",
    "1. Do not write to a production endpoint without explicit user confirmation.",
    "2. Validate every workflow update against the schema before applying.",
    `3. Follow the conventions in the bundled ${ruleFile}.`,
    "",
  ].join("\n");
}

/**
 * Generate `profile-instructions.md`. Validates the profile name and endpoint so they can be
 * safely embedded in single-quoted shell (BYO_AI-spec §19.3). Throws on invalid input.
 */
export function generateProfileInstructionsMd(input: TemplateInput): string {
  const name = input.profileName ?? "default";
  if (!PROFILE_NAME_RE.test(name)) {
    throw new Error(
      `Invalid profile name '${name}': must match ${PROFILE_NAME_RE.source}`,
    );
  }
  const endpoint = input.endpoint ?? "http://localhost:8080";
  // Reject endpoints that are not valid URLs (defends the single-quoted shell below).
  // Throws on invalid input, which the caller surfaces.
  const parsed = new URL(endpoint);
  void parsed;
  const env = input.env ?? "development";

  return [
    "# Setting up your Cyoda profile",
    "",
    "1. Open or create `~/.config/cyoda/cyoda-plugin-config.json`.",
    "",
    "2. Add a profile entry (replace the token placeholder):",
    "",
    "```jsonc",
    "{",
    `  "active": ${JSON.stringify(name)},`,
    '  "profiles": {',
    `    ${JSON.stringify(name)}: {`,
    `      "endpoint": ${JSON.stringify(endpoint)},`,
    `      "env": ${JSON.stringify(env)},`,
    '      "token": "<JWT or empty for local cyoda-go>"',
    "    }",
    "  }",
    "}",
    "```",
    "",
    "3. For Cyoda Cloud, obtain a token via the OAuth client-credentials flow described in the",
    "   `auth` skill. For local `cyoda-go` (`http://localhost:8080`), leave `token` empty.",
    "",
    "4. Agents read the active profile by name. To check it from a shell:",
    "",
    "```sh",
    "jq -r '.active // \"default\"' ~/.config/cyoda/cyoda-plugin-config.json",
    "```",
    "",
  ].join("\n");
}
