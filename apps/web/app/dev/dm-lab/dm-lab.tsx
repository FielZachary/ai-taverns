"use client";

import { useEffect, useMemo, useState } from "react";

type Stage = "opening_brief_planner" | "opening_planner" | "opening_narrator" | "router" | "scene_director" | "investigation" | "npc_dialogue" | "combat" | "clarification";
type Packet = { version: 1; source: { campaignId: string; stage: Stage; gitRevision: string; sourceFile: string; sourceFunction: string; turnId?: string }; request: { instructions: string; message: string } };
type Run = { output: string; durationMs: number; model: string | null; validation: { valid: boolean; details: string[] } };
type LabResponse = { source: { file: string; function: string; gitRevision: string; campaignId: string; turnId?: string }; fixture: string; stage: Stage; action: "baseline" | "override"; request: Packet["request"] & { fullPrompt: string }; result: Run };
type CampaignOption = { id: string; title: string; preview: string | null; mode: "single_player" | "multiplayer" };
const instructionsHeading = "SYSTEM INSTRUCTIONS\n";
const requestDivider = "\n\nUSER / FIXTURE MESSAGE\n";
const stages: Array<{ value: Stage; label: string }> = [
  { value: "opening_brief_planner", label: "Eldermere — Opening brief planner" }, { value: "opening_planner", label: "Eldermere — Foundation planner" }, { value: "opening_narrator", label: "Eldermere — Opening narrator" }, { value: "router", label: "Normal turn — Router" }, { value: "scene_director", label: "Normal turn — Scene director" }, { value: "npc_dialogue", label: "Normal turn — NPC dialogue" }, { value: "investigation", label: "Normal turn — Investigation" }, { value: "combat", label: "Normal turn — Combat" }, { value: "clarification", label: "Normal turn — Clarification" }
];

function lineDiff(before: string, after: string) { const left = before.split("\n"); const right = after.split("\n"); return Array.from({ length: Math.max(left.length, right.length) }, (_, index) => ({ index, left: left[index], right: right[index], changed: left[index] !== right[index] })); }
function unifiedDiff(before: string, after: string) { return lineDiff(before, after).flatMap(({ left, right, changed }) => !changed ? (left === undefined ? [] : [` ${left}`]) : [...(left === undefined ? [] : [`-${left}`]), ...(right === undefined ? [] : [`+${right}`])]).join("\n"); }
function parseEditableRequest(value: string) {
  if (!value.startsWith(instructionsHeading)) throw new Error("Keep the SYSTEM INSTRUCTIONS heading at the top of the override request.");
  const divider = value.indexOf(requestDivider); if (divider < 0) throw new Error("Keep the USER / FIXTURE MESSAGE heading in the override request.");
  const instructions = value.slice(instructionsHeading.length, divider).trim(); const message = value.slice(divider + requestDivider.length).trim();
  if (!instructions || !message) throw new Error("The override needs both instructions and fixture context.");
  return { instructions, message };
}
function parsePacket(value: string): Packet {
  const parsed = JSON.parse(value) as Packet;
  if (parsed.version !== 1 || !parsed.source?.campaignId || !parsed.source?.stage || !parsed.source?.gitRevision || !parsed.source?.sourceFile || !parsed.source?.sourceFunction || !parsed.request?.instructions || !parsed.request?.message) throw new Error("Invalid replay packet. Use the exact JSON format from the extraction agent.");
  return parsed;
}

export function DmLab() {
  const [campaignId, setCampaignId] = useState(""); const [stage, setStage] = useState<Stage>("opening_narrator");
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]); const [campaignLoadError, setCampaignLoadError] = useState("");
  const [packetText, setPacketText] = useState(""); const [packet, setPacket] = useState<Packet | null>(null);
  const [baseline, setBaseline] = useState<LabResponse | null>(null); const [overrideText, setOverrideText] = useState(""); const [override, setOverride] = useState<LabResponse | null>(null);
  const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [running, setRunning] = useState<"baseline" | "override" | null>(null);
  const outputDiff = useMemo(() => baseline && override ? lineDiff(baseline.result.output, override.result.output) : [], [baseline, override]);
  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/internal/dm-lab/compare", { cache: "no-store" });
        const payload = (await response.json()) as { campaigns?: CampaignOption[] };
        if (!response.ok) throw new Error("Campaigns could not be loaded.");
        setCampaigns(payload.campaigns ?? []);
      } catch (caught) { setCampaignLoadError(caught instanceof Error ? caught.message : "Campaigns could not be loaded."); }
    })();
  }, []);
  const extractionInstruction = [
    "Prepare a read-only DM Lab replay packet.", "", `Campaign ID: \`${campaignId || "PASTE_LOCAL_CAMPAIGN_ID"}\``, `Stage: \`${stage}\``, "",
    "Read only local campaign data and the current local source code. Do not modify code, database data, campaign events, messages, prompts, or files.",
    "Build the exact request currently sent to this AI stage. Use the real character sheet, backstory, Eldermere start, planner output, selected context, history, and player action as appropriate. Do not invent, summarize, or omit context.",
    "Return JSON only, with no Markdown, in exactly this format:", "```json", JSON.stringify({ version: 1, source: { campaignId: campaignId || "local-campaign-id", stage, gitRevision: "current-local-git-revision", sourceFile: "path/to/current-prompt-source.ts", sourceFunction: "promptBuilderFunction", ...(stage.startsWith("opening_") ? {} : { turnId: "source-turn-id" }) }, request: { instructions: "exact built system instructions", message: "exact built user/fixture message" } }, null, 2), "```"
  ].join("\n");
  async function copyExtractionInstruction() { await navigator.clipboard.writeText(extractionInstruction); setNotice("Extraction instruction copied. Give it to an agent, then paste its JSON response below."); }
  function loadPacket() { try { const loaded = parsePacket(packetText); setPacket(loaded); setCampaignId(loaded.source.campaignId); setStage(loaded.source.stage); setBaseline(null); setOverride(null); setOverrideText(""); setError(""); setNotice("Replay packet loaded. Trigger the baseline when ready."); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not read replay packet."); } }
  async function call(action: "baseline" | "override", overrides?: { instructions: string; message: string }) {
    if (!packet) throw new Error("Paste and load a replay packet first.");
    const response = await fetch("/api/internal/dm-lab/compare", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, packet, ...(overrides ? { overrideInstructions: overrides.instructions, overrideMessage: overrides.message } : {}) }) });
    const payload = (await response.json()) as LabResponse | { error?: { message?: string } }; if (!response.ok) throw new Error("error" in payload ? payload.error?.message : "DM Lab run failed."); return payload as LabResponse;
  }
  async function triggerBaseline() { setRunning("baseline"); setError(""); setOverride(null); try { const response = await call("baseline"); setBaseline(response); setOverrideText(response.request.fullPrompt); } catch (caught) { setError(caught instanceof Error ? caught.message : "Baseline run failed."); } finally { setRunning(null); } }
  async function testOverride() { if (!baseline) return; setRunning("override"); setError(""); try { setOverride(await call("override", parseEditableRequest(overrideText))); } catch (caught) { setError(caught instanceof Error ? caught.message : "Override run failed."); } finally { setRunning(null); } }
  async function copyHandoff() { if (!baseline || !override) return; const packet = ["# DM Lab Prompt Change Request", "", "## Source", `- File: \`${baseline.source.file}\``, `- Function: \`${baseline.source.function}\``, `- Git revision: \`${baseline.source.gitRevision}\``, `- Campaign: \`${baseline.source.campaignId}\``, ...(baseline.source.turnId ? [`- Turn: \`${baseline.source.turnId}\``] : []), `- Stage: \`${baseline.stage}\``, "", "## Exact full-request diff", "```diff", unifiedDiff(baseline.request.fullPrompt, override.request.fullPrompt), "```", "", "## Baseline output", "```text", baseline.result.output, "```", "", "## Override output", "```text", override.result.output, "```", "", "## Requested change", "Apply only the prompt diff above. Preserve unrelated behavior and run the applicable replay packet again."].join("\n"); await navigator.clipboard.writeText(packet); setNotice("Agent handoff copied."); }

  return <main className="dm-lab-page"><section className="dm-lab-header"><p className="dm-lab-eyebrow">Internal · read-only replay</p><h1>DM Lab</h1><p>Import an agent-extracted local replay packet. The Lab never reads or changes campaign data itself.</p></section><section className="dm-lab-controls"><label>Recent local campaign<select value={campaignId} onChange={(event) => setCampaignId(event.target.value)}><option value="">Select one of your 10 most recent campaigns</option>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.title} · {campaign.preview ?? campaign.mode} · {campaign.id}</option>)}</select></label><label>Or enter local campaign ID<input value={campaignId} onChange={(event) => setCampaignId(event.target.value)} placeholder="Local campaign UUID or ID" /></label>{campaignLoadError ? <p className="dm-lab-error">{campaignLoadError}</p> : null}<label>Runtime stage<select value={stage} onChange={(event) => setStage(event.target.value as Stage)}>{stages.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><div className="dm-lab-actions"><button type="button" onClick={copyExtractionInstruction} disabled={!campaignId.trim()}>Copy extraction instruction for agent</button></div><label>Replay packet from agent<textarea value={packetText} onChange={(event) => setPacketText(event.target.value)} placeholder="Paste the agent's JSON-only replay packet here." rows={14} /></label><div className="dm-lab-actions"><button type="button" onClick={loadPacket}>Load replay packet</button>{packet ? <button type="button" className="dm-lab-secondary" onClick={triggerBaseline} disabled={running !== null}>{running === "baseline" ? "Triggering baseline…" : "Trigger baseline"}</button> : null}{baseline ? <button type="button" className="dm-lab-secondary" onClick={testOverride} disabled={running !== null}>{running === "override" ? "Testing override…" : "Test override"}</button> : null}<button type="button" className="dm-lab-secondary" onClick={copyHandoff} disabled={!override}>Copy agent handoff</button></div>{notice ? <p className="dm-lab-notice">{notice}</p> : null}{error ? <p className="dm-lab-error">{error}</p> : null}</section>{baseline ? <section className="dm-lab-results"><p className="dm-lab-source">Campaign {baseline.source.campaignId} · {baseline.source.file} · {baseline.source.function} · {baseline.source.gitRevision}</p><article className="dm-lab-diff"><h2>Full request: baseline vs editable override</h2><div className="dm-lab-diff-grid"><pre>{baseline.request.fullPrompt}</pre><textarea aria-label="Editable override full request" value={overrideText} onChange={(event) => { setOverrideText(event.target.value); setOverride(null); }} rows={28} /></div></article>{override ? <><DiffPanel title="Output diff" rows={outputDiff} /><div className="dm-lab-runtime"><RunCard title="Baseline" run={baseline.result} /><RunCard title="Override" run={override.result} /></div></> : <div className="dm-lab-runtime"><RunCard title="Baseline" run={baseline.result} /></div>}</section> : null}</main>;
}
function RunCard({ title, run }: { title: string; run: Run }) { return <article><h2>{title}</h2><p>{run.validation.valid ? "Valid" : "Invalid"} · {run.durationMs}ms · {run.model ?? "configured model"}</p><pre>{run.validation.details.join("\n")}</pre></article>; }
function DiffPanel({ title, rows }: { title: string; rows: ReturnType<typeof lineDiff> }) { return <article className="dm-lab-diff"><h2>{title}</h2><div className="dm-lab-diff-grid"><pre>{rows.map((row) => <span className={row.changed ? "changed" : ""} key={`left-${row.index}`}>{row.left ?? ""}{"\n"}</span>)}</pre><pre>{rows.map((row) => <span className={row.changed ? "changed" : ""} key={`right-${row.index}`}>{row.right ?? ""}{"\n"}</span>)}</pre></div></article>; }
