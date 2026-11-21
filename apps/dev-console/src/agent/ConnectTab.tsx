import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button, Panel, WarningBanner, useTokens } from "@cyoda/console-design-system";
import { detectAgents, writeProjectTextFile } from "../ipc/agent.js";
import { readTextFile } from "../ipc/fsio.js";
import { useAgentContext } from "./AgentContext.js";
import { generateRuleFile, RULE_FILE_FOR_AGENT, type AgentId, type TemplateInput } from "./templates.js";
import { toRelativePath } from "./pathUtils.js";

interface AgentCardMeta {
  id: AgentId;
  label: string;
  /** Install commands, verbatim where known. Empty when there is no install command. */
  commands: string[];
  /** Shown when the install verb is not yet verified (BYO_AI-spec Open Q6). */
  pending?: boolean;
  note?: string;
}

const AGENTS: AgentCardMeta[] = [
  {
    id: "claude",
    label: "Claude Code",
    commands: [
      "/plugin marketplace add Cyoda/cyoda-skills",
      "/plugin install cyoda@cyoda",
      "/reload-plugins",
    ],
  },
  {
    id: "gemini",
    label: "Gemini CLI",
    commands: ["gemini extensions install Cyoda/cyoda-skills"],
    pending: true,
    note: "Install verb pending verification — confirm against current Gemini CLI docs before relying on it.",
  },
  {
    id: "codex",
    label: "Codex CLI / app",
    commands: [],
    note: "Codex reads AGENTS.md from the project root. Write the rule file below, then point Codex at this project.",
  },
];

export function ConnectTab() {
  const t = useTokens();
  const ctx = useAgentContext();
  const statusQ = useQuery({ queryKey: ["agent-detect"], queryFn: detectAgents });

  if (!ctx) {
    return (
      <Note>Open a project to write agent rule files into it.</Note>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: t.space.md, padding: t.space.lg }}>
      <p style={{ fontFamily: t.font.sans, fontSize: t.font.sizes.md, color: t.color.textMuted, margin: 0 }}>
        Install Cyoda skills into your agent, then write a rule file into the project so the agent
        has Cyoda context. Authoritative skills live at{" "}
        <code style={{ fontFamily: t.font.mono }}>github.com/Cyoda/cyoda-skills</code>.
      </p>
      {AGENTS.map((agent) => (
        <AgentCard
          key={agent.id}
          meta={agent}
          projectRoot={ctx.projectRoot}
          context={ctx}
          installed={statusQ.data?.find((s) => s.id === agent.id)}
        />
      ))}
    </div>
  );
}

function AgentCard({
  meta,
  projectRoot,
  context,
  installed,
}: {
  meta: AgentCardMeta;
  projectRoot: string;
  context: { projectRoot: string; selectedWorkflowPath?: string; selectedEntityPath?: string };
  installed: { installed: boolean; version?: string } | undefined;
}) {
  const t = useTokens();
  const ruleFile = RULE_FILE_FOR_AGENT[meta.id];
  const [status, setStatus] = useState<string | null>(null);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);

  const workflowRel = toRelativePath(context.selectedWorkflowPath, projectRoot);
  const entityRel = toRelativePath(context.selectedEntityPath, projectRoot);
  const templateInput: TemplateInput = {
    projectRoot,
    ...(workflowRel ? { workflowRelPath: workflowRel } : {}),
    ...(entityRel ? { entityRelPath: entityRel } : {}),
  };

  async function fileExists(): Promise<boolean> {
    try {
      await readTextFile(`${projectRoot}/${ruleFile}`, projectRoot);
      return true;
    } catch {
      return false;
    }
  }

  async function write() {
    setBusy(true);
    setStatus(null);
    try {
      await writeProjectTextFile(projectRoot, ruleFile, generateRuleFile(ruleFile, templateInput));
      setStatus(`Wrote ${ruleFile} to project root.`);
      setConfirmOverwrite(false);
    } catch (e) {
      setStatus(`Failed: ${(e as Error).message ?? String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function onWriteClick() {
    try {
      if (await fileExists()) {
        setConfirmOverwrite(true);
        return;
      }
      await write();
    } catch (e) {
      setStatus(`Failed: ${(e as Error).message ?? String(e)}`);
    }
  }

  return (
    <Panel title={meta.label}>
      <div style={{ fontSize: t.font.sizes.sm, color: t.color.textMuted, marginBottom: t.space.sm }}>
        {installed === undefined
          ? "Checking…"
          : installed.installed
            ? `Detected${installed.version ? ` — ${installed.version}` : ""}`
            : "Not detected on PATH"}
      </div>

      {meta.commands.length > 0 && (
        <CommandBlock lines={meta.commands} {...(meta.pending ? { pending: true } : {})} />
      )}
      {meta.note && (
        <div style={{ fontSize: t.font.sizes.sm, color: t.color.textMuted, margin: `${t.space.sm} 0` }}>
          {meta.note}
        </div>
      )}

      {confirmOverwrite ? (
        <div style={{ display: "flex", flexDirection: "column", gap: t.space.sm, marginTop: t.space.sm }}>
          <WarningBanner severity="caution">
            {ruleFile} already exists at the project root and will be overwritten.
          </WarningBanner>
          <div style={{ display: "flex", gap: t.space.sm }}>
            <Button variant="secondary" onClick={() => setConfirmOverwrite(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void write()} disabled={busy}>
              Overwrite {ruleFile}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => void onWriteClick()} disabled={busy} style={{ marginTop: t.space.sm }}>
          Write {ruleFile} to project root
        </Button>
      )}

      {status && (
        <div style={{ fontSize: t.font.sizes.sm, color: t.color.textMuted, marginTop: t.space.sm }}>
          {status}
        </div>
      )}
    </Panel>
  );
}

function CommandBlock({ lines, pending }: { lines: string[]; pending?: boolean }) {
  const t = useTokens();
  const [copied, setCopied] = useState(false);
  async function copyAll() {
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable; ignore
    }
  }
  return (
    <div
      style={{
        background: t.color.surfaceAlt,
        border: `1px solid ${t.color.border}`,
        borderRadius: t.radius.sm,
        fontFamily: t.font.mono,
        fontSize: t.font.sizes.sm,
        overflow: "hidden",
      }}
    >
      {/* Header row */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: t.space.sm,
        padding: "4px 8px",
        borderBottom: `1px solid ${t.color.border}`,
        background: t.color.surface,
      }}>
        {pending && (
          <span style={{
            background: t.color.cyodaOrange,
            color: "#fff",
            borderRadius: 10,
            padding: "1px 8px",
            fontFamily: t.font.sans,
            fontSize: 11,
            marginRight: "auto",
          }}>
            Pending verification
          </span>
        )}
        <button
          type="button"
          onClick={() => void copyAll()}
          aria-label="Copy commands"
          title={copied ? "Copied!" : "Copy commands"}
          style={{
            border: "none",
            background: "transparent",
            cursor: "pointer",
            color: copied ? t.color.success : t.color.textMuted,
            padding: 2,
            display: "flex",
            alignItems: "center",
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      {/* Code lines */}
      <div style={{ padding: t.space.sm }}>
        {lines.map((line) => (
          <div key={line} style={{ whiteSpace: "pre-wrap", color: t.color.text }}>
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  const t = useTokens();
  return (
    <div style={{ padding: t.space.lg, fontFamily: t.font.sans, fontSize: t.font.sizes.md, color: t.color.textMuted }}>
      {children}
    </div>
  );
}

