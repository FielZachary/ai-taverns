import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aiTavernsProductPersonality,
  gameRulesAndDesignDefaults,
  hardRuntimeContract
} from "./dm-prompt-layers.js";

describe("DM prompt spell saving throw guidance", () => {
  it("instructs the DM to roll NPC saves before requesting player damage", () => {
    assert.match(
      hardRuntimeContract,
      /roll those NPC\/enemy saving throws immediately as the DM/
    );
    assert.match(hardRuntimeContract, /report each target's exact d20 total/);
    assert.match(
      hardRuntimeContract,
      /Do not put NPC\/enemy saving throws in `roll_requests`/
    );
    assert.match(hardRuntimeContract, /Roll <damage dice> for <spell> damage/);
    assert.match(hardRuntimeContract, /Lightning Bolt is a save-for-half line spell/);
    assert.match(hardRuntimeContract, /before requesting its 8d6 damage/);
    assert.match(hardRuntimeContract, /A Lightning Bolt damage `roll_requests` entry is invalid/);
    assert.match(hardRuntimeContract, /reports each affected target's save total and success\/failure/);
    assert.match(hardRuntimeContract, /Never write only 'Roll 8d6 for Lightning Bolt damage'/);
  });

  it("exempts pending spell damage from normal narration length and vividness pressure", () => {
    assert.match(aiTavernsProductPersonality, /unless the turn must stop for unresolved dice/);
    assert.match(
      aiTavernsProductPersonality,
      /spell saving throws followed by pending damage/
    );
    assert.match(hardRuntimeContract, /exempt from the normal minimum word count/);
    assert.match(hardRuntimeContract, /vivid narration guidance/);
  });

  it("includes a mechanical Fireball example with saves and one damage request", () => {
    assert.match(gameRulesAndDesignDefaults, /KAKA casts Fireball/);
    assert.match(gameRulesAndDesignDefaults, /Elara Thornwood rolls 9 and fails/);
    assert.match(gameRulesAndDesignDefaults, /The first ash guard rolls 17 and succeeds/);
    assert.match(gameRulesAndDesignDefaults, /"dice": "8d6"/);
    assert.match(gameRulesAndDesignDefaults, /"label": "Fireball damage"/);
  });

  it("requires mechanics state updates for tracked combat HP and conditions", () => {
    assert.match(hardRuntimeContract, /Always include top-level `mechanics_state_update`/);
    assert.match(hardRuntimeContract, /every affected tracked actor/);
    assert.match(hardRuntimeContract, /even if they remain above 0 HP/);
    assert.match(hardRuntimeContract, /`currentHp` above 0/);
    assert.match(hardRuntimeContract, /mechanical checklist first/);
    assert.match(hardRuntimeContract, /HP totals, and conditions/);
    assert.match(hardRuntimeContract, /Only mark an actor defeated, unconscious, dead, wounded, healed/);
    assert.match(hardRuntimeContract, /do not transfer an outcome from one actor to another/);
  });

  it("instructs the DM to start and advance initiative during combat", () => {
    assert.match(hardRuntimeContract, /When hostilities start/);
    assert.match(hardRuntimeContract, /surprise or the drop/);
    assert.match(hardRuntimeContract, /ask the acting player to roll initiative/);
    assert.match(hardRuntimeContract, /include the same initiative roll in `roll_requests`/);
    assert.match(hardRuntimeContract, /resolve the opening action first/);
    assert.match(hardRuntimeContract, /After that opening action is resolved, ask for initiative/);
    assert.match(hardRuntimeContract, /include `mechanics_state_update\.combat`/);
    assert.match(hardRuntimeContract, /provisional `initiativeOrder` as an array of actor-key strings/);
    assert.match(hardRuntimeContract, /`turnOwner` to the acting player/);
    assert.match(hardRuntimeContract, /advance `turnOwner` to the next actor/);
    assert.match(hardRuntimeContract, /Combat-capable enemies should act on their turns/);
    assert.match(hardRuntimeContract, /do not currently own the turn are only stated intent/);
    assert.match(hardRuntimeContract, /not actions already in motion/);
    assert.match(hardRuntimeContract, /following immediately/);
    assert.match(hardRuntimeContract, /resolve the current turn owner's valid action first/);
    assert.match(hardRuntimeContract, /preserve other player submissions only as pending intent/);
    assert.match(hardRuntimeContract, /If the next actor is an enemy, resolve that enemy turn/);
    assert.match(hardRuntimeContract, /resolve that NPC turn immediately/);
    assert.match(hardRuntimeContract, /Do not end a response with `next_input_needed: "player_actions"`/);
    assert.match(hardRuntimeContract, /turnOwner` set to an `npc:\*` actor/);
    assert.match(hardRuntimeContract, /NPC actor key or NPC character name/);
    assert.match(hardRuntimeContract, /never let a submitted player attack, spell, or movement interrupt/);
    assert.match(hardRuntimeContract, /do not use null for `turnOwner`/);
    assert.match(hardRuntimeContract, /roll the NPC attack as the DM/);
    assert.match(hardRuntimeContract, /attack roll: <total> vs AC <target AC> - hit\/miss/);
    assert.match(hardRuntimeContract, /damage roll: <dice expression> = <total>/);
    assert.match(hardRuntimeContract, /Do not say a player weapon attack hits, lands, connects/);
    assert.match(hardRuntimeContract, /The words 'attack roll', 'vs AC', and 'damage roll'/);
    assert.match(hardRuntimeContract, /Never end an NPC weapon or spell attack with only a wind-up/);
    assert.match(hardRuntimeContract, /When the final active enemy is defeated/);
    assert.match(hardRuntimeContract, /set `mechanics_state_update\.combat\.active` to false/);
    assert.match(hardRuntimeContract, /Do not say a specific combatant is up next after combat has ended/);
  });

  it("requires triggered readied actions to resolve through their proper mechanics", () => {
    assert.match(hardRuntimeContract, /held or readied action trigger occurs/);
    assert.match(hardRuntimeContract, /resolve every triggered readied player action/);
    assert.match(hardRuntimeContract, /first enemy entering a doorway or appearing in range/);
    assert.match(hardRuntimeContract, /Apply automatic effects such as Magic Missile/);
    assert.match(hardRuntimeContract, /request required attack\/damage rolls for weapon attacks/);
    assert.match(hardRuntimeContract, /never narrate a readied weapon attack as a hit/);
    assert.match(hardRuntimeContract, /Magic Missile automatically hits/);
    assert.match(hardRuntimeContract, /request 3d4 \+ 3 damage/);
    assert.match(hardRuntimeContract, /before narrating injury, defeat, unconsciousness, death/);
  });

  it("requires recorded save outcomes to control submitted spell damage", () => {
    assert.match(hardRuntimeContract, /save-for-half area or line spells/);
    assert.match(hardRuntimeContract, /Fireball or Lightning Bolt/);
    assert.match(hardRuntimeContract, /use those recorded save outcomes exactly/);
    assert.match(hardRuntimeContract, /half damage rounded down/);
    assert.match(hardRuntimeContract, /exact tracked target HP and conditions/);
    assert.match(hardRuntimeContract, /do not narrate defeat unless the resulting HP is 0/);
  });
});
