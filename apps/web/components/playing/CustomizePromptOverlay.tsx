"use client";

import { useEffect, useMemo, useState } from "react";
import {
  defaultGlobalRulesPrompt,
  narratorJobPrompt,
  type CampaignPromptOverrides,
} from "@ai-dnd/dm";
import { X } from "lucide-react";

type PromptJob = "npc_dialogue" | "combat" | "scene_director" | "clarification" | "out_of_character" | "global_rules";

const tabs: Array<{ id: "introduction" | PromptJob; label: string; description?: string }> = [
  { id: "introduction", label: "Introduction" },
  { id: "npc_dialogue", label: "NPC Dialogue", description: "Used when players directly talk, negotiate, persuade, threaten, or otherwise socially engage an NPC." },
  { id: "combat", label: "Combat", description: "Used for tactical encounters, visible combat consequences, and battlefield narration." },
  { id: "scene_director", label: "Scene Director", description: "Used for exploration, consequences, clues, travel, scene transitions, and normal play outside combat." },
  { id: "clarification", label: "Clarification", description: "Used only when the narrator needs one missing detail before it can safely resolve an action." },
  { id: "out_of_character", label: "Out of Character", description: "Used for table talk, rules questions, continuity questions, and correction requests outside the fiction." },
  { id: "global_rules", label: "Global Rules", description: "These are the instructions shared by every narrator job in this campaign. Overriding this prompt replaces the default shared rules for NPC Dialogue, Combat, Scene Director, Clarification, and Out of Character." }
];

function defaultPrompt(job: PromptJob) {
  return job === "global_rules"
    ? defaultGlobalRulesPrompt()
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
      {active === "introduction" ? <div className="customize-prompt-content customize-prompt-introduction"><p className="eyebrow">Campaign narrator</p><h2 id="customize-prompt-title">A little explanation,</h2><p>Hi! Here&apos;s a little explanation of why I created this tab from <em>yours truly</em>, the developer of <strong className="prompt-explanation-gold">AI Taverns</strong></p><p>I&apos;m sure If you&apos;ve come here I&apos;m sure you&apos;ve found my prompt creation a little lacking and I&apos;m aware! Which is exactly why I created this tab so you can <strong className="prompt-explanation-gold">customize the AI to your liking</strong> <em>(and probably do a better job than me)</em></p><p>Before that though, I&apos;d like to help you by explaining a little further how this whole system works, because it works <em>a little different than what you might expect.</em></p><p>Actually, before any narration text is created, your player input is sent to a tiny model that I call the <strong className="prompt-explanation-token">&quot;Router&quot;</strong>. The router takes your input and the previous turns and decides what <strong className="prompt-explanation-token">&quot;Job&quot;</strong> is best suited to use. I did this so that the main narrator model won&apos;t be given a massive mish-mash of different instructions and get confused and I found that the output was way better this way.</p><p>It also makes customizing much more interesting as you can cater your instructions to <strong>specific scenarios</strong> without worrying about contradictions with others. Moreover, you can even choose and customize what model you want to use per job! There&apos;s really a lot of ways to go about this so <em>feel free to go crazy.</em></p><p>If you want to see what job a certain response uses, just take a look beside the <strong className="prompt-explanation-token">&quot;Dungeon Master&quot;</strong> text in the main game chat</p><p><strong className="prompt-explanation-gold">Most importantly though, have fun!</strong> I found that this process of tweaking and testing your own prompt and rules is whats most fun about this whole <strong>AI D&amp;D</strong> thing so I hope you find it as great as I found it</p></div> : <div className="customize-prompt-content"><p className="eyebrow">Campaign narrator</p><h2 id="customize-prompt-title">{activeTab?.label}</h2><p>{activeTab?.description}</p><label className="customize-prompt-toggle"><input type="checkbox" checked={overridden} disabled={loading || saving} onChange={(event) => { if (event.target.checked) setOverrides((value) => ({ ...value, [activeJob!]: draft || defaultPrompt(activeJob!) })); else void reset(); }} /> Override Default Prompt</label><textarea aria-label={`${activeTab?.label} prompt`} value={shownPrompt} readOnly={!overridden} disabled={loading} className={!overridden ? "customize-prompt-readonly" : ""} onChange={(event) => setDraft(event.target.value)} rows={20} />{error ? <p role="alert" className="npc-cards-status">{error}</p> : null}<div className="customize-prompt-actions">{overridden ? <><button type="button" onClick={() => void save()} disabled={saving || !draft.trim()}>Save changes</button><button type="button" onClick={() => void reset()} disabled={saving}>Reset to default</button></> : <span>Using default prompt</span>}</div></div>}
    </div>
  </section>;
}
