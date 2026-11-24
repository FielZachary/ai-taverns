"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  defaultGlobalRulesPrompt,
  jobPrompt,
  type CampaignPromptOverrides,
} from "@ai-dnd/dm";
import type { AiModelId, CampaignModelOverrides } from "@ai-dnd/contracts";
import { X } from "lucide-react";

type PromptJob = "npc_dialogue" | "combat" | "scene_director" | "clarification" | "out_of_character" | "global_rules";
type NarratorJob = Exclude<PromptJob, "global_rules">;

const defaultNarratorModel: AiModelId = "qwen-3-7-plus";
const narratorModelOptions: Array<{ id: AiModelId; label: string }> = [
  { id: "qwen-3-7-plus", label: "Qwen 3.7 Plus (default)" },
  { id: "qwen-3-5-plus", label: "Qwen 3.5 Plus" },
  { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash" }
];

const tabs: Array<{ id: "introduction" | PromptJob; label: string; description?: string }> = [
  { id: "introduction", label: "Introduction" },
  { id: "npc_dialogue", label: "NPC Dialogue", description: "Used when players directly talk, negotiate, persuade, threaten, or otherwise socially engage an NPC. This override affects NPC Dialogue only." },
  { id: "combat", label: "Combat", description: "Used for tactical encounters, visible combat consequences, and battlefield narration. This override affects Combat only." },
  { id: "scene_director", label: "Scene Director", description: "Used for exploration, consequences, clues, travel, scene transitions, and normal play outside combat. This override affects Scene Director only." },
  { id: "clarification", label: "Clarification", description: "Used only when the narrator needs one missing detail before it can safely resolve an action. This override affects Clarification only." },
  { id: "out_of_character", label: "Out of Character", description: "Used for table talk, rules questions, continuity questions, and correction requests outside the fiction. This override affects Out of Character only." },
  { id: "global_rules", label: "Global Rules", description: "These are the instructions shared by every narrator job in this campaign. Overriding this prompt replaces the default shared rules for NPC Dialogue, Combat, Scene Director, Clarification, and Out of Character." }
];

function defaultPrompt(job: PromptJob) {
  return job === "global_rules"
    ? defaultGlobalRulesPrompt()
    : jobPrompt(job, "single_player", { includeShared: false });
}

export function CustomizePromptOverlay({
  roomId,
  sessionId,
  onClose
}: { roomId: string; sessionId: string; onClose: () => void }) {
  const [active, setActive] = useState<(typeof tabs)[number]["id"]>("introduction");
  const [overrides, setOverrides] = useState<CampaignPromptOverrides>({});
  const [modelOverrides, setModelOverrides] = useState<CampaignModelOverrides>({});
  const [draft, setDraft] = useState("");
  const [modelDraft, setModelDraft] = useState<AiModelId>(defaultNarratorModel);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<"idle" | "saved">("idle");
  const [error, setError] = useState("");
  const saveFeedbackTimeout = useRef<number | undefined>(undefined);
  const activeJob = active === "introduction" ? null : active;
  const activeTab = useMemo(() => tabs.find((tab) => tab.id === active), [active]);
  const overridden = activeJob ? Boolean(overrides[activeJob]) : false;
  const activeNarratorJob = activeJob === "global_rules" ? null : activeJob as NarratorJob | null;
  const hasConfiguredModel = Boolean(activeNarratorJob && modelOverrides[activeNarratorJob]);
  const shownPrompt = activeJob ? (overridden ? draft : defaultPrompt(activeJob)) : "";
  const hasUnsavedChanges = Boolean(activeJob && (
    (overridden && draft !== (overrides[activeJob] ?? defaultPrompt(activeJob))) ||
    (activeNarratorJob && modelDraft !== (modelOverrides[activeNarratorJob] ?? defaultNarratorModel))
  ));

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch(`/api/room/prompt-overrides?roomId=${encodeURIComponent(roomId)}&sessionId=${encodeURIComponent(sessionId)}`);
        if (!response.ok) throw new Error("Could not load prompt settings.");
        const data = await response.json() as { overrides: CampaignPromptOverrides; modelOverrides?: CampaignModelOverrides };
        setOverrides(data.overrides);
        setModelOverrides(data.modelOverrides ?? {});
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not load prompt settings.");
      } finally { setLoading(false); }
    })();
  }, [roomId, sessionId]);

  useEffect(() => {
    if (activeJob) setDraft(overrides[activeJob] ?? defaultPrompt(activeJob));
    if (activeNarratorJob) setModelDraft(modelOverrides[activeNarratorJob] ?? defaultNarratorModel);
    setError("");
  }, [activeJob, activeNarratorJob, overrides, modelOverrides]);

  useEffect(() => {
    setSaveFeedback("idle");
  }, [activeJob]);

  useEffect(() => () => {
    if (saveFeedbackTimeout.current) window.clearTimeout(saveFeedbackTimeout.current);
  }, []);

  function showSavedFeedback() {
    if (saveFeedbackTimeout.current) window.clearTimeout(saveFeedbackTimeout.current);
    setSaveFeedback("saved");
    saveFeedbackTimeout.current = window.setTimeout(() => setSaveFeedback("idle"), 2500);
  }

  async function save() {
    if (!activeJob) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/room/prompt-overrides", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId, sessionId, job: activeJob, prompt: overridden ? draft : null, ...(activeNarratorJob ? { model: modelDraft === defaultNarratorModel ? null : modelDraft } : {}) }) });
      if (!response.ok) throw new Error("Could not save this prompt.");
      const data = await response.json() as { overrides: CampaignPromptOverrides; modelOverrides?: CampaignModelOverrides };
      setOverrides(data.overrides);
      setModelOverrides(data.modelOverrides ?? {});
      showSavedFeedback();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save this prompt."); }
    finally { setSaving(false); }
  }

  async function reset() {
    if (!activeJob) return;
    setSaving(true); setError(""); setSaveFeedback("idle");
    try {
      const response = await fetch("/api/room/prompt-overrides", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId, sessionId, job: activeJob }) });
      if (!response.ok) throw new Error("Could not reset this prompt.");
      const data = await response.json() as { overrides: CampaignPromptOverrides; modelOverrides?: CampaignModelOverrides };
      setOverrides(data.overrides);
      setModelOverrides(data.modelOverrides ?? {});
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not reset this prompt."); }
    finally { setSaving(false); }
  }

  return <section className="character-sheet-overlay" role="dialog" aria-modal="true" aria-labelledby="customize-prompt-title">
    <div className="character-sheet-overlay-panel customize-prompt-panel">
      <div className="player-resources-tabs" role="tablist" aria-label="Customize prompt tabs">
        {tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={active === tab.id} className="player-resource-tab" onClick={() => setActive(tab.id)}>{tab.label}</button>)}
        <button className="player-resources-close" type="button" aria-label="Close customize prompt" onClick={onClose}><X size={18} /></button>
      </div>
      {active === "introduction" ? <div className="customize-prompt-content customize-prompt-introduction"><p className="eyebrow">Campaign narrator</p><h2 id="customize-prompt-title">A little explanation,</h2><p>Hi! Here&apos;s a little explanation of why I created this tab from yours truly, the developer of <strong className="prompt-explanation-gold">AI Taverns</strong></p><p>I&apos;m sure If you&apos;ve come here I&apos;m sure you&apos;ve found my prompt creation a little lacking and I&apos;m aware! Which is exactly why I created this tab so you can customize the AI to your liking (and probably do a better job than me)</p><p>Before that though, I&apos;d like to help you by explaining a little further how this whole system works, because it works a little different than what you might expect.</p><p>Actually, before any narration text is created, your player input is sent to a tiny model that I call the <span className="prompt-explanation-token">&quot;Router&quot;</span>. The router takes your input and the previous turns and decides what <span className="prompt-explanation-token">&quot;Job&quot;</span> is best suited to use. I did this so that the main narrator model won&apos;t be given a massive mish-mash of different instructions and get confused and I found that the output was way better this way.</p><p>It also makes customizing much more interesting as you can cater your instructions to specific scenarios without worrying about contradictions with others. Moreover, you can even choose and customize what model you want to use per job! There&apos;s really a lot of ways to go about this so feel free to go crazy.</p><p>If you want to see what job a certain response uses, just take a look beside the <span className="prompt-explanation-token">&quot;Dungeon Master&quot;</span> text in the main game chat</p><p>Most importantly though, have fun! I found that this process of tweaking and testing your own prompt and rules is whats most fun about this whole AI D&amp;D thing so I hope you find it as great as I found it</p></div> : <div className="customize-prompt-content"><p className="eyebrow">Campaign narrator</p><h2 id="customize-prompt-title">{activeTab?.label}</h2><p>{activeTab?.description}</p><label className="customize-prompt-toggle"><input type="checkbox" checked={overridden} disabled={loading || saving} onChange={(event) => { if (event.target.checked) setOverrides((value) => ({ ...value, [activeJob!]: draft || defaultPrompt(activeJob!) })); else void reset(); }} /> Override Default Prompt</label>{activeNarratorJob ? <label className="customize-prompt-model">{activeTab?.label} AI model<select aria-label={`${activeTab?.label} AI model`} value={modelDraft} disabled={loading || saving} onChange={(event) => { setModelDraft(event.target.value as AiModelId); setSaveFeedback("idle"); }}>{narratorModelOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label> : null}<textarea aria-label={`${activeTab?.label} prompt`} value={shownPrompt} readOnly={!overridden} disabled={loading} className={!overridden ? "customize-prompt-readonly" : ""} onChange={(event) => { setDraft(event.target.value); setSaveFeedback("idle"); }} rows={20} />{error ? <p role="alert" className="npc-cards-status">{error}</p> : null}<div className="customize-prompt-actions">{overridden || hasConfiguredModel || hasUnsavedChanges ? <><button className="customize-prompt-save" type="button" onClick={() => void save()} disabled={saving || !hasUnsavedChanges}>{saving ? <><span className="customize-prompt-save-spinner" aria-hidden="true" />Saving…</> : saveFeedback === "saved" ? "Saved ✓" : "Save changes"}</button>{overridden ? <button type="button" onClick={() => void reset()} disabled={saving}>Reset prompt</button> : null}<span className={`customize-prompt-save-status${saveFeedback === "saved" ? " is-saved" : ""}`} role="status" aria-live="polite">{saving ? "Saving changes…" : saveFeedback === "saved" ? "Changes saved." : hasUnsavedChanges ? "Unsaved changes" : "All changes saved"}</span></> : <span>Using defaults</span>}</div></div>}
    </div>
  </section>;
}
