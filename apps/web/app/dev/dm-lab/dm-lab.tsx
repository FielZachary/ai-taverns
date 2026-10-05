"use client";

import { useMemo, useState } from "react";

type Stage = "opening_brief_planner" | "opening_planner" | "opening_narrator" | "router" | "scene_director" | "investigation" | "npc_dialogue" | "combat" | "clarification";
type Run = { output: string; durationMs: number; model: string | null; validation: { valid: boolean; details: string[] } };
type Source = { file: string; function: string; gitRevision: string };
type PromptRequest = { instructions: string; message: string; fullPrompt: string };
type LabResponse = { action: "baseline" | "override"; source: Source; fixture: string; stage: Stage; request: PromptRequest; result: Run };

const instructionsHeading = "SYSTEM INSTRUCTIONS\n";
const requestDivider = "\n\nUSER / FIXTURE MESSAGE\n";
const stages: Array<{ value: Stage; label: string }> = [
  { value: "opening_brief_planner", label: "Eldermere — Opening brief planner" }, { value: "opening_planner", label: "Eldermere — Foundation planner" }, { value: "opening_narrator", label: "Eldermere — Opening narrator" }, { value: "router", label: "Normal turn — Router" }, { value: "scene_director", label: "Normal turn — Scene director" }, { value: "npc_dialogue", label: "Normal turn — NPC dialogue" }, { value: "investigation", label: "Normal turn — Investigation" }, { value: "combat", label: "Normal turn — Combat" }, { value: "clarification", label: "Normal turn — Clarification" }
];

function lineDiff(before: string, after: string) {
  const left = before.split("\n"); const right = after.split("\n");
  return Array.from({ length: Math.max(left.length, right.length) }, (_, index) => ({ index, left: left[index], right: right[index], changed: left[index] !== right[index] }));
}
function unifiedDiff(before: string, after: string) {
  return lineDiff(before, after).flatMap(({ left, right, changed }) => !changed ? (left === undefined ? [] : [` ${left}`]) : [...(left === undefined ? [] : [`-${left}`]), ...(right === undefined ? [] : [`+${right}`])]).join("\n");
}
function parseEditableRequest(value: string) {
  if (!value.startsWith(instructionsHeading)) throw new Error("Keep the SYSTEM INSTRUCTIONS heading at the top of the override request.");
  const divider = value.indexOf(requestDivider);
  if (divider < 0) throw new Error("Keep the USER / FIXTURE MESSAGE heading in the override request.");
  const instructions = value.slice(instructionsHeading.length, divider).trim();
  const message = value.slice(divider + requestDivider.length).trim();
  if (!instructions || !message) throw new Error("The override needs both instructions and fixture context.");
  return { instructions, message };
}

export function DmLab() {
  const [stage, setStage] = useState<Stage>("opening_narrator");
  const [baseline, setBaseline] = useState<LabResponse | null>(null);
  const [overrideText, setOverrideText] = useState("");
  const [override, setOverride] = useState<LabResponse | null>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState<"baseline" | "override" | null>(null);
  const outputDiff = useMemo(() => baseline && override ? lineDiff(baseline.result.output, override.result.output) : [], [baseline, override]);

  async function call(body: Record<string, unknown>) {
    const response = await fetch("/api/internal/dm-lab/compare", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const payload = (await response.json()) as LabResponse | { error?: { message?: string } };
    if (!response.ok) throw new Error("error" in payload ? payload.error?.message : "DM Lab run failed.");
    return payload as LabResponse;
  }
  async function triggerBaseline() {
    setRunning("baseline"); setError(""); setOverride(null);
    try { const response = await call({ stage, action: "baseline" }); setBaseline(response); setOverrideText(response.request.fullPrompt); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Baseline run failed."); }
    finally { setRunning(null); }
  }
  async function testOverride() {
    if (!baseline) return;
    setRunning("override"); setError("");
    try { const edited = parseEditableRequest(overrideText); setOverride(await call({ stage, action: "override", overrideInstructions: edited.instructions, overrideMessage: edited.message })); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Override run failed."); }
    finally { setRunning(null); }
  }
  async function copyHandoff() {
    if (!baseline || !override) return;
    const packet = ["# DM Lab Prompt Change Request", "", "## Source", `- File: \`${baseline.source.file}\``, `- Function: \`${baseline.source.function}\``, `- Git revision: \`${baseline.source.gitRevision}\``, `- Fixture: \`${baseline.fixture}\``, `- Stage: \`${baseline.stage}\``, "", "## Exact full-request diff", "```diff", unifiedDiff(baseline.request.fullPrompt, override.request.fullPrompt), "```", "", "## Baseline output", "```text", baseline.result.output, "```", "", "## Override output", "```text", override.result.output, "```", "", "## Validation and runtime comparison", `- Baseline: ${baseline.result.validation.valid ? "valid" : "invalid"}; ${baseline.result.durationMs}ms`, `- Override: ${override.result.validation.valid ? "valid" : "invalid"}; ${override.result.durationMs}ms`, "", "## Requested change", "Apply only the prompt diff above. Preserve unrelated behavior and run the applicable DM fixture tests."].join("\n");
    await navigator.clipboard.writeText(packet);
  }

  return <main className="dm-lab-page">
    <section className="dm-lab-header"><p className="dm-lab-eyebrow">Internal · read-only</p><h1>DM Lab</h1><p>Trigger a production baseline, edit a temporary full request, then test the override. Nothing here changes code or campaign state.</p></section>
    <section className="dm-lab-controls"><label>Runtime stage<select value={stage} onChange={(event) => { setStage(event.target.value as Stage); setBaseline(null); setOverride(null); setOverrideText(""); }} disabled={Boolean(baseline)}>{stages.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><div className="dm-lab-actions"><button type="button" onClick={triggerBaseline} disabled={running !== null}>{running === "baseline" ? "Triggering baseline…" : "Trigger baseline"}</button>{baseline ? <button type="button" className="dm-lab-secondary" onClick={testOverride} disabled={running !== null}>{running === "override" ? "Testing override…" : "Test override"}</button> : null}<button type="button" className="dm-lab-secondary" onClick={copyHandoff} disabled={!override}>Copy agent handoff</button></div>{error ? <p className="dm-lab-error">{error}</p> : null}</section>
    {baseline ? <section className="dm-lab-results"><p className="dm-lab-source">{baseline.source.file} · {baseline.source.function} · {baseline.source.gitRevision}</p><article className="dm-lab-diff"><h2>Full request: baseline vs editable override</h2><div className="dm-lab-diff-grid"><pre>{baseline.request.fullPrompt}</pre><textarea aria-label="Editable override full request" value={overrideText} onChange={(event) => { setOverrideText(event.target.value); setOverride(null); }} rows={28} /></div></article>{override ? <><DiffPanel title="Output diff" rows={outputDiff} /><div className="dm-lab-runtime"><RunCard title="Baseline" run={baseline.result} /><RunCard title="Override" run={override.result} /></div></> : <div className="dm-lab-runtime"><RunCard title="Baseline" run={baseline.result} /></div>}</section> : null}
  </main>;
}
function RunCard({ title, run }: { title: string; run: Run }) { return <article><h2>{title}</h2><p>{run.validation.valid ? "Valid" : "Invalid"} · {run.durationMs}ms · {run.model ?? "configured model"}</p><pre>{run.validation.details.join("\n")}</pre></article>; }
function DiffPanel({ title, rows }: { title: string; rows: ReturnType<typeof lineDiff> }) { return <article className="dm-lab-diff"><h2>{title}</h2><div className="dm-lab-diff-grid"><pre>{rows.map((row) => <span className={row.changed ? "changed" : ""} key={`left-${row.index}`}>{row.left ?? ""}{"\n"}</span>)}</pre><pre>{rows.map((row) => <span className={row.changed ? "changed" : ""} key={`right-${row.index}`}>{row.right ?? ""}{"\n"}</span>)}</pre></div></article>; }
