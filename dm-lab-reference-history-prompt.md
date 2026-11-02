# DM Lab: Reference-History Replay Prompt

Use this to test the streaming-safe history shape before changing normal gameplay.

1. In DM Lab, paste the complete captured `Prompt Sent` into **Baseline prompt from Debug** and click **Load baseline prompt**.
2. Click **Trigger baseline** once.
3. In **Editable override full request**, replace everything beginning with `# 2. ASSISTANT` through the end of that assistant block, plus the following `# 3. USER` heading, with the block below.

Do not change the system prompt. Keep all of the existing campaign history, selected context chunks, guidance, character sheet, and current turn input after this replacement block.

```text
# 2. USER
Most recent resolved narration — reference only.

This narration has already happened. Do not repeat, quote, restage, or continue its wording. Respond only to the current turn input below.

"One minute's enough for us to pass," you say, your voice cutting through the wind. It is a statement of fact, not a plea, but <npc>Warden Halvard</npc> does not blink. He keeps his hand raised, palm flat against the air, blocking the archway.

"The rule is light, not minutes," the warden replies, his tone dry as dust. "Lanterns are lit. Portcullis drops." He glances at the sky, where the last sliver of violet sun has vanished behind the ridge, then down at the cart's wheel. His eyes linger on the fresh, dark scar of the iron band. "That patch looks warm. Cold stone will shock it before you clear the arch."

<npc>Orin Thal</npc> shifts nervously beside the mule, gripping the reins until his knuckles turn white. "It held the climb, Warden! Just let us through—my boss'll have my hide if I camp on the ridge with this load!"

Halvard ignores the panic, his gaze fixed on you now. "Convoy priority goes to grain, yes. But not to broken wheels in the rain. If that band snaps under the portcullis, you block the gate for everyone coming up behind you. And no one gets through tonight." He takes a half-step back toward the winch mechanism, his hand hovering near the release lever. "Turn back to the lower shelter or make your case quick. The light is gone."

The wind picks up, carrying the first heavy drop of rain that splatters against your cheek. The mule stamps, impatient.

What do you say to the warden?

Compressed chronological campaign history:
```

After `Compressed chronological campaign history:`, retain all the original content that followed that same heading in the captured `# 3. USER` message.

The finished override must have exactly two numbered messages:

```text
# 1. SYSTEM
<the complete original system prompt>

# 2. USER
<the reference block above, followed by the original compressed history and remainder of the current user packet>
```

There must be no `# 2. ASSISTANT` message. Choose **Qwen 3.5 Plus**, select **Normal turn — NPC dialogue**, then click **Test override**.
