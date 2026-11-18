"use client";

import { useEffect, useMemo, useState } from "react";
import { narratorJobPrompt, type CampaignPromptOverrides } from "@ai-dnd/dm";
import { X } from "lucide-react";

type PromptJob = "npc_dialogue" | "combat" | "scene_director" | "clarification" | "out_of_character" | "global_rules";

const tabs: Array<{ id: "introduction" | PromptJob; label: string; description?: string }> = [
  { id: "introduction", label: "Introduction" },
  { id: "npc_dialogue", label: "NPC Dialogue", description: "Used when players directly talk, negotiate, persuade, threaten, or otherwise socially engage an NPC." },
  { id: "combat", label: "Combat", description: "Used for tactical encounters, visible combat consequences, and battlefield narration." },
  { id: "scene_director", label: "Scene Director", description: "Used for exploration, consequences, clues, travel, scene transitions, and normal play outside combat." },
  { id: "clarification", label: "Clarification", description: "Used only when the narrator needs one missing detail before it can safely resolve an action." },
  { id: "out_of_character", label: "Out of Character", description: "Used for table talk, rules questions, continuity questions, and correction requests outside the fiction." },
  { id: "global_rules", label: "Global Rules", description: "Added to every customizable narrator job in this campaign." }
];

function defaultPrompt(job: PromptJob) {
  return job === "global_rules"
    ? "Add campaign-wide narrator guidance here. These rules are appended to every narrator job when overridden."
    : narratorJobPrompt(job, "single_player");
}

export function CustomizePromptOverlay({
  roomId,
  sessionId,
  onClose
}: { roomId: string; sessionId: string; onClose: () => void }) {
  const [active, setActive] = useState<(typeof tabs)[number]["id"]>("introduction");
  const [overrides, setOverrides] = useState<CampaignPromptOverrides>({});
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const activeJob = active === "introduction" ? null : active;
  const activeTab = useMemo(() => tabs.find((tab) => tab.id === active), [active]);
  const overridden = activeJob ? Boolean(overrides[activeJob]) : false;
  const shownPrompt = activeJob ? (overridden ? draft : defaultPrompt(activeJob)) : "";

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch(`/api/room/prompt-overrides?roomId=${encodeURIComponent(roomId)}&sessionId=${encodeURIComponent(sessionId)}`);
        if (!response.ok) throw new Error("Could not load prompt settings.");
        const data = await response.json() as { overrides: CampaignPromptOverrides };
        setOverrides(data.overrides);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not load prompt settings.");
      } finally { setLoading(false); }
    })();
  }, [roomId, sessionId]);

  useEffect(() => {
    if (activeJob) setDraft(overrides[activeJob] ?? defaultPrompt(activeJob));
    setError("");
  }, [activeJob, overrides]);

  async function save() {
    if (!activeJob) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/room/prompt-overrides", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId, sessionId, job: activeJob, prompt: draft }) });
      if (!response.ok) throw new Error("Could not save this prompt.");
      const data = await response.json() as { overrides: CampaignPromptOverrides };
      setOverrides(data.overrides);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save this prompt."); }
    finally { setSaving(false); }
  }

  async function reset() {
    if (!activeJob) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/room/prompt-overrides", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId, sessionId, job: activeJob }) });
      if (!response.ok) throw new Error("Could not reset this prompt.");
      const data = await response.json() as { overrides: CampaignPromptOverrides };
      setOverrides(data.overrides);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not reset this prompt."); }
    finally { setSaving(false); }
  }

  return <section className="character-sheet-overlay" role="dialog" aria-modal="true" aria-labelledby="customize-prompt-title">
    <div className="character-sheet-overlay-panel customize-prompt-panel">
      <div className="player-resources-tabs" role="tablist" aria-label="Customize prompt tabs">
        {tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={active === tab.id} className="player-resource-tab" onClick={() => setActive(tab.id)}>{tab.label}</button>)}
        <button className="player-resources-close" type="button" aria-label="Close customize prompt" onClick={onClose}><X size={18} /></button>
      </div>
      {active === "introduction" ? <div className="customize-prompt-content"><p className="eyebrow">Campaign narrator</p><h2 id="customize-prompt-title">Customize Prompt</h2><p>Customize how the narrator handles each kind of turn in this campaign. Enable an override to replace the selected job&apos;s default creative instructions. Campaign context, player input, and platform safeguards remain server-owned.</p><p>Changes are saved per campaign and take effect on the next matching narrator turn.</p></div> : <div className="customize-prompt-content"><p className="eyebrow">Campaign narrator</p><h2 id="customize-prompt-title">{activeTab?.label}</h2><p>{activeTab?.description}</p><label className="customize-prompt-toggle"><input type="checkbox" checked={overridden} disabled={loading || saving} onChange={(event) => { if (event.target.checked) setOverrides((value) => ({ ...value, [activeJob!]: draft || defaultPrompt(activeJob!) })); else void reset(); }} /> Override Default Prompt</label><textarea aria-label={`${activeTab?.label} prompt`} value={shownPrompt} readOnly={!overridden} disabled={loading} className={!overridden ? "customize-prompt-readonly" : ""} onChange={(event) => setDraft(event.target.value)} rows={20} />{error ? <p role="alert" className="npc-cards-status">{error}</p> : null}<div className="customize-prompt-actions">{overridden ? <><button type="button" onClick={() => void save()} disabled={saving || !draft.trim()}>Save changes</button><button type="button" onClick={() => void reset()} disabled={saving}>Reset to default</button></> : <span>Using default prompt</span>}</div></div>}
    </div>
  </section>;
}
