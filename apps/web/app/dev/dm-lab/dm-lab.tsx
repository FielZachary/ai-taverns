"use client";

import { useMemo, useState } from "react";

type Stage =
  | "opening_brief_planner"
  | "opening_planner"
  | "opening_narrator"
  | "router"
  | "scene_director"
  | "investigation"
  | "npc_dialogue"
  | "combat"
  | "clarification";

type Run = {
  output: string;
  prompt: string;
  durationMs: number;
  model: string | null;
  validation: { valid: boolean; details: string[] };
};

type Comparison = {
  source: { file: string; function: string; gitRevision: string };
  fixture: string;
  stage: Stage;
  baseline: Run;
  override: Run;
};

const stages: Array<{ value: Stage; label: string }> = [
  { value: "opening_brief_planner", label: "Eldermere — Opening brief planner" },
  { value: "opening_planner", label: "Eldermere — Foundation planner" },
  { value: "opening_narrator", label: "Eldermere — Opening narrator" },
  { value: "router", label: "Normal turn — Router" },
  { value: "scene_director", label: "Normal turn — Scene director" },
  { value: "npc_dialogue", label: "Normal turn — NPC dialogue" },
  { value: "investigation", label: "Normal turn — Investigation" },
  { value: "combat", label: "Normal turn — Combat" },
  { value: "clarification", label: "Normal turn — Clarification" }
];

function lineDiff(before: string, after: string) {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const max = Math.max(beforeLines.length, afterLines.length);
  return Array.from({ length: max }, (_, index) => {
    const left = beforeLines[index];
    const right = afterLines[index];
    return { index, left, right, changed: left !== right };
  });
}

function unifiedDiff(before: string, after: string) {
  return lineDiff(before, after)
    .flatMap(({ left, right, changed }) => {
      if (!changed) return left === undefined ? [] : [` ${left}`];
      return [
        ...(left === undefined ? [] : [`-${left}`]),
        ...(right === undefined ? [] : [`+${right}`])
      ];
    })
    .join("\n");
}

export function DmLab() {
  const [stage, setStage] = useState<Stage>("opening_narrator");
  const [override, setOverride] = useState("");
  const [result, setResult] = useState<Comparison | null>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const promptDiff = useMemo(
    () => (result ? lineDiff(result.baseline.prompt, result.override.prompt) : []),
    [result]
  );
  const outputDiff = useMemo(
    () => (result ? lineDiff(result.baseline.output, result.override.output) : []),
    [result]
  );

  async function run() {
    setRunning(true);
    setError("");
    try {
      const response = await fetch("/api/internal/dm-lab/compare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stage, promptOverride: override })
      });
      const payload = (await response.json()) as Comparison | { error?: { message?: string } };
      if (!response.ok) throw new Error("error" in payload ? payload.error?.message : "DM Lab run failed.");
      setResult(payload as Comparison);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "DM Lab run failed.");
    } finally {
      setRunning(false);
    }
  }

  async function copyHandoff() {
    if (!result) return;
    const packet = [
      "# DM Lab Prompt Change Request",
      "",
      "## Source",
      `- File: \`${result.source.file}\``,
      `- Function: \`${result.source.function}\``,
      `- Git revision: \`${result.source.gitRevision}\``,
      `- Fixture: \`${result.fixture}\``,
      `- Stage: \`${result.stage}\``,
      "",
      "## Exact prompt diff",
      "```diff",
      unifiedDiff(result.baseline.prompt, result.override.prompt),
      "```",
      "",
      "## Baseline output",
      "```text",
      result.baseline.output,
      "```",
      "",
      "## Override output",
      "```text",
      result.override.output,
      "```",
      "",
      "## Validation and runtime comparison",
      `- Baseline: ${result.baseline.validation.valid ? "valid" : "invalid"}; ${result.baseline.durationMs}ms`,
      `- Override: ${result.override.validation.valid ? "valid" : "invalid"}; ${result.override.durationMs}ms`,
      "",
      "## Requested change",
      "Apply only the prompt diff above. Preserve unrelated behavior and run the applicable DM fixture tests."
    ].join("\n");
    await navigator.clipboard.writeText(packet);
  }

  return (
    <main className="dm-lab-page">
      <section className="dm-lab-header">
        <p className="dm-lab-eyebrow">Internal · read-only</p>
        <h1>DM Lab</h1>
        <p>Compare the production prompt against a temporary override. Nothing here edits code or campaign state.</p>
      </section>
      <section className="dm-lab-controls">
        <label>Runtime stage
          <select value={stage} onChange={(event) => setStage(event.target.value as Stage)}>
            {stages.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label>Temporary prompt override
          <textarea value={override} onChange={(event) => setOverride(event.target.value)} placeholder="Add the instruction you want to test. This is never saved or applied." rows={10} />
        </label>
        <div className="dm-lab-actions">
          <button type="button" onClick={run} disabled={running}>{running ? "Running baseline and override…" : "Compare baseline and override"}</button>
          <button type="button" className="dm-lab-secondary" onClick={copyHandoff} disabled={!result}>Copy agent handoff</button>
        </div>
        {error ? <p className="dm-lab-error">{error}</p> : null}
      </section>
      {result ? <section className="dm-lab-results">
        <p className="dm-lab-source">{result.source.file} · {result.source.function} · {result.source.gitRevision}</p>
        <DiffPanel title="Prompt diff" rows={promptDiff} />
        <DiffPanel title="Output diff" rows={outputDiff} />
        <div className="dm-lab-runtime">
          <article><h2>Baseline</h2><p>{result.baseline.validation.valid ? "Valid" : "Invalid"} · {result.baseline.durationMs}ms · {result.baseline.model ?? "configured model"}</p><pre>{result.baseline.validation.details.join("\n")}</pre></article>
          <article><h2>Override</h2><p>{result.override.validation.valid ? "Valid" : "Invalid"} · {result.override.durationMs}ms · {result.override.model ?? "configured model"}</p><pre>{result.override.validation.details.join("\n")}</pre></article>
        </div>
      </section> : null}
    </main>
  );
}

function DiffPanel({ title, rows }: { title: string; rows: ReturnType<typeof lineDiff> }) {
  return <article className="dm-lab-diff"><h2>{title}</h2><div className="dm-lab-diff-grid"><pre>{rows.map((row) => <span className={row.changed ? "changed" : ""} key={`left-${row.index}`}>{row.left ?? ""}{"\n"}</span>)}</pre><pre>{rows.map((row) => <span className={row.changed ? "changed" : ""} key={`right-${row.index}`}>{row.right ?? ""}{"\n"}</span>)}</pre></div></article>;
}
