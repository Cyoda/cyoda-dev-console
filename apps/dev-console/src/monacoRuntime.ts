/// <reference types="vite/client" />
import * as monaco from "monaco-editor";
import type { WorkflowJsonMonacoRuntime } from "@cyoda/workflow-react";
import editorWorker from "monaco-editor/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/languages/features/json/json.worker?worker";

let configured = false;

export function getMonacoRuntime(): WorkflowJsonMonacoRuntime {
  const target = window as Window & {
    MonacoEnvironment?: {
      getWorker(_: string, label: string): Worker;
    };
  };

  if (!configured) {
    target.MonacoEnvironment = {
      getWorker(_workerId: string, label: string) {
        if (label === "json") return new jsonWorker();
        return new editorWorker();
      },
    };
    configured = true;
  }
  return monaco;
}
