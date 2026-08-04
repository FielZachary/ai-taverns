export type SpellLevelLabel = "Cantrip" | "1st level" | "2nd level" | "3rd level";

export type SpellRuleProfile = {
  name: string;
  srdName?: string;
  levelLabel?: SpellLevelLabel | string;
  description: string[];
  higherLevel: string[];
  rolls: string;
  school: string;
  duration: string;
  castingTime: string;
  range: string;
  components: string[];
  material?: string;
  ritual: boolean;
  concentration: boolean;
  classes?: string[];
  sourceUrl?: string;
};

const srdSpellDetails: Record<string, SpellRuleProfile> = {
  "Acid Splash": {
    "name": "Acid Splash",
    "levelLabel": "Cantrip",
    "description": [
      "You hurl a bubble of acid. Choose one creature within range, or choose two creatures within range that are within 5 feet of each other. A target must succeed on a dexterity saving throw or take 1d6 acid damage.",
      "This spell's damage increases by 1d6 when you reach 5th level (2d6), 11th level (3d6), and 17th level (4d6)."
    ],
    "higherLevel": [],
    "rolls": "1d6 acid damage at character level 1 | DEX saving throw; success: none",
    "school": "Conjuration",
    "duration": "Instantaneous",
    "castingTime": "1 action",
    "range": "60 feet",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Sorcerer",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/acid-splash"
  },
  "Aid": {
    "name": "Aid",
    "levelLabel": "2nd level",
    "description": [
      "Your spell bolsters your allies with toughness and resolve. Choose up to three creatures within range. Each target's hit point maximum and current hit points increase by 5 for the duration."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 3rd level or higher, a target's hit points increase by an additional 5 for each slot level above 2nd."
    ],
    "rolls": "5 healing at spell slot level 2",
    "school": "Abjuration",
    "duration": "8 hours",
    "castingTime": "1 action",
    "range": "30 feet",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Cleric",
      "Paladin"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/aid",
    "material": "A tiny strip of white cloth."
  },
  "Alarm": {
    "name": "Alarm",
    "levelLabel": "1st level",
    "description": [
      "You set an alarm against unwanted intrusion. Choose a door, a window, or an area within range that is no larger than a 20-foot cube. Until the spell ends, an alarm alerts you whenever a Tiny or larger creature touches or enters the warded area. When you cast the spell, you can designate creatures that won't set off the alarm. You also choose whether the alarm is mental or audible.",
      "A mental alarm alerts you with a ping in your mind if you are within 1 mile of the warded area. This ping awakens you if you are sleeping.",
      "An audible alarm produces the sound of a hand bell for 10 seconds within 60 feet."
    ],
    "higherLevel": [],
    "rolls": "20-foot cube",
    "school": "Abjuration",
    "duration": "8 hours",
    "castingTime": "1 minute",
    "range": "30 feet",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": true,
    "concentration": false,
    "classes": [
      "Ranger",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/alarm",
    "material": "A tiny bell and a piece of fine silver wire."
  },
  "Alter Self": {
    "name": "Alter Self",
    "levelLabel": "2nd level",
    "description": [
      "You assume a different form. When you cast the spell, choose one of the following options, the effects of which last for the duration of the spell. While the spell lasts, you can end one option as an action to gain the benefits of a different one.",
      "***Aquatic Adaptation.*** You adapt your body to an aquatic environment, sprouting gills and growing webbing between your fingers. You can breathe underwater and gain a swimming speed equal to your walking speed.",
      "***Change Appearance.*** You transform your appearance. You decide what you look like, including your height, weight, facial features, sound of your voice, hair length, coloration, and distinguishing characteristics, if any. You can make yourself appear as a member of another race, though none of your statistics change. You also can't appear as a creature of a different size than you, and your basic shape stays the same; if you're bipedal, you can't use this spell to become quadrupedal, for instance. At any time for the duration of the spell, you can use your action to change your appearance in this way again.",
      "***Natural Weapons.*** You grow claws, fangs, spines, horns, or a different natural weapon of your choice. Your unarmed strikes deal 1d6 bludgeoning, piercing, or slashing damage, as appropriate to the natural weapon you chose, and you are proficient with your unarmed strikes. Finally, the natural weapon is magic and you have a +1 bonus to the attack and damage rolls you make using it."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Transmutation",
    "duration": "Up to 1 hour",
    "castingTime": "1 action",
    "range": "Self",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Sorcerer",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/alter-self"
  },
  "Animal Friendship": {
    "name": "Animal Friendship",
    "levelLabel": "1st level",
    "description": [
      "This spell lets you convince a beast that you mean it no harm. Choose a beast that you can see within range. It must see and hear you. If the beast's Intelligence is 4 or higher, the spell fails. Otherwise, the beast must succeed on a wisdom saving throw or be charmed by you for the spell's duration. If you or one of your companions harms the target, the spells ends."
    ],
    "higherLevel": [],
    "rolls": "WIS saving throw; success: none",
    "school": "Enchantment",
    "duration": "24 hours",
    "castingTime": "1 action",
    "range": "30 feet",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Bard",
      "Druid",
      "Ranger"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/animal-friendship",
    "material": "A morsel of food."
  },
  "Animal Messenger": {
    "name": "Animal Messenger",
    "levelLabel": "2nd level",
    "description": [
      "By means of this spell, you use an animal to deliver a message. Choose a Tiny beast you can see within range, such as a squirrel, a blue jay, or a bat. You specify a location, which you must have visited, and a recipient who matches a general description, such as \"a man or woman dressed in the uniform of the town guard\" or \"a red-haired dwarf wearing a pointed hat.\" You also speak a message of up to twenty-five words. The target beast travels for the duration of the spell toward the specified location, covering about 50 miles per 24 hours for a flying messenger, or 25 miles for other animals.",
      "When the messenger arrives, it delivers your message to the creature that you described, replicating the sound of your voice. The messenger speaks only to a creature matching the description you gave. If the messenger doesn't reach its destination before the spell ends, the message is lost, and the beast makes its way back to where you cast this spell."
    ],
    "higherLevel": [
      "If you cast this spell using a spell slot of 3nd level or higher, the duration of the spell increases by 48 hours for each slot level above 2nd."
    ],
    "rolls": "Resolve using the rules text.",
    "school": "Enchantment",
    "duration": "24 hours",
    "castingTime": "1 action",
    "range": "30 feet",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": true,
    "concentration": false,
    "classes": [
      "Bard",
      "Druid",
      "Ranger"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/animal-messenger",
    "material": "A morsel of food."
  },
  "Animate Dead": {
    "name": "Animate Dead",
    "levelLabel": "3rd level",
    "description": [
      "This spell creates an undead servant. Choose a pile of bones or a corpse of a Medium or Small humanoid within range. Your spell imbues the target with a foul mimicry of life, raising it as an undead creature. The target becomes a skeleton if you chose bones or a zombie if you chose a corpse (the GM has the creature's game statistics).",
      "On each of your turns, you can use a bonus action to mentally command any creature you made with this spell if the creature is within 60 feet of you (if you control multiple creatures, you can command any or all of them at the same time, issuing the same command to each one). You decide what action the creature will take and where it will move during its next turn, or you can issue a general command, such as to guard a particular chamber or corridor. If you issue no commands, the creature only defends itself against hostile creatures. Once given an order, the creature continues to follow it until its task is complete.",
      "The creature is under your control for 24 hours, after which it stops obeying any command you've given it. To maintain control of the creature for another 24 hours, you must cast this spell on the creature again before the current 24-hour period ends. This use of the spell reasserts your control over up to four creatures you have animated with this spell, rather than animating a new one."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 4th level or higher, you animate or reassert control over two additional undead creatures for each slot level above 3rd. Each of the creatures must come from a different corpse or pile of bones."
    ],
    "rolls": "Resolve using the rules text.",
    "school": "Necromancy",
    "duration": "Instantaneous",
    "castingTime": "1 minute",
    "range": "10 feet",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Cleric",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/animate-dead",
    "material": "A drop of blood, a piece of flesh, and a pinch of bone dust."
  },
  "Arcane Lock": {
    "name": "Arcane Lock",
    "levelLabel": "2nd level",
    "description": [
      "You touch a closed door, window, gate, chest, or other entryway, and it becomes locked for the duration. You and the creatures you designate when you cast this spell can open the object normally. You can also set a password that, when spoken within 5 feet of the object, suppresses this spell for 1 minute. Otherwise, it is impassable until it is broken or the spell is dispelled or suppressed. Casting knock on the object suppresses arcane lock for 10 minutes.",
      "While affected by this spell, the object is more difficult to break or force open; the DC to break it or pick any locks on it increases by 10."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Abjuration",
    "duration": "Until dispelled",
    "castingTime": "1 action",
    "range": "Touch",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/arcane-lock",
    "material": "Gold dust worth at least 25gp, which the spell consumes."
  },
  "Augury": {
    "name": "Augury",
    "levelLabel": "2nd level",
    "description": [
      "By casting gem-inlaid sticks, rolling dragon bones, laying out ornate cards, or employing some other divining tool, you receive an omen from an otherworldly entity about the results of a specific course of action that you plan to take within the next 30 minutes. The GM chooses from the following possible omens:",
      "- Weal, for good results",
      "- Woe, for bad results",
      "- Weal and woe, for both good and bad results",
      "- Nothing, for results that aren't especially good or bad",
      "The spell doesn't take into account any possible circumstances that might change the outcome, such as the casting of additional spells or the loss or gain of a companion.",
      "If you cast the spell two or more times before completing your next long rest, there is a cumulative 25 percent chance for each casting after the first that you get a random reading. The GM makes this roll in secret."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Divination",
    "duration": "Instantaneous",
    "castingTime": "1 minute",
    "range": "Self",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": true,
    "concentration": false,
    "classes": [
      "Cleric"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/augury",
    "material": "Specially marked sticks, bones, or similar tokens worth at least 25gp."
  },
  "Bane": {
    "name": "Bane",
    "levelLabel": "1st level",
    "description": [
      "Up to three creatures of your choice that you can see within range must make charisma saving throws. Whenever a target that fails this saving throw makes an attack roll or a saving throw before the spell ends, the target must roll a d4 and subtract the number rolled from the attack roll or saving throw."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 2nd level or higher, you can target one additional creature for each slot level above 1st."
    ],
    "rolls": "CHA saving throw; success: none",
    "school": "Enchantment",
    "duration": "Up to 1 minute",
    "castingTime": "1 action",
    "range": "30 feet",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Bard",
      "Cleric"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/bane",
    "material": "A drop of blood."
  },
  "Barkskin": {
    "name": "Barkskin",
    "levelLabel": "2nd level",
    "description": [
      "You touch a willing creature. Until the spell ends, the target's skin has a rough, bark-like appearance, and the target's AC can't be less than 16, regardless of what kind of armor it is wearing."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Transmutation",
    "duration": "Up to 1 hour",
    "castingTime": "1 action",
    "range": "Touch",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Druid",
      "Ranger"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/barkskin",
    "material": "A handful of oak bark."
  },
  "Beacon of Hope": {
    "name": "Beacon of Hope",
    "levelLabel": "3rd level",
    "description": [
      "This spell bestows hope and vitality. Choose any number of creatures within range. For the duration, each target has advantage on wisdom saving throws and death saving throws, and regains the maximum number of hit points possible from any healing."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Abjuration",
    "duration": "Up to 1 minute",
    "castingTime": "1 action",
    "range": "30 feet",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Cleric"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/beacon-of-hope"
  },
  "Bestow Curse": {
    "name": "Bestow Curse",
    "levelLabel": "3rd level",
    "description": [
      "You touch a creature, and that creature must succeed on a wisdom saving throw or become cursed for the duration of the spell. When you cast this spell, choose the nature of the curse from the following options:",
      "- Choose one ability score. While cursed, the target has disadvantage on ability checks and saving throws made with that ability score.",
      "- While cursed, the target has disadvantage on attack rolls against you.",
      "- While cursed, the target must make a wisdom saving throw at the start of each of its turns. If it fails, it wastes its action that turn doing nothing.",
      "- While the target is cursed, your attacks and spells deal an extra 1d8 necrotic damage to the target.",
      "A remove curse spell ends this effect. At the GM's option, you may choose an alternative curse effect, but it should be no more powerful than those described above. The GM has final say on such a curse's effect."
    ],
    "higherLevel": [
      "If you cast this spell using a spell slot of 4th level or higher, the duration is concentration, up to 10 minutes. If you use a spell slot of 5th level or higher, the duration is 8 hours. If you use a spell slot of 7th level or higher, the duration is 24 hours. If you use a 9th level spell slot, the spell lasts until it is dispelled. Using a spell slot of 5th level or higher grants a duration that doesn't require concentration."
    ],
    "rolls": "WIS saving throw; success: none",
    "school": "Necromancy",
    "duration": "Up to 1 minute",
    "castingTime": "1 action",
    "range": "Touch",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Bard",
      "Cleric",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/bestow-curse"
  },
  "Bless": {
    "name": "Bless",
    "levelLabel": "1st level",
    "description": [
      "You bless up to three creatures of your choice within range. Whenever a target makes an attack roll or a saving throw before the spell ends, the target can roll a d4 and add the number rolled to the attack roll or saving throw."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 2nd level or higher, you can target one additional creature for each slot level above 1st."
    ],
    "rolls": "Resolve using the rules text.",
    "school": "Enchantment",
    "duration": "Up to 1 minute",
    "castingTime": "1 action",
    "range": "30 feet",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Cleric",
      "Paladin"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/bless",
    "material": "A sprinkling of holy water."
  },
  "Blindness/Deafness": {
    "name": "Blindness/Deafness",
    "levelLabel": "2nd level",
    "description": [
      "You can blind or deafen a foe. Choose one creature that you can see within range to make a constitution saving throw. If it fails, the target is either blinded or deafened (your choice) for the duration. At the end of each of its turns, the target can make a constitution saving throw. On a success, the spell ends."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 3rd level or higher, you can target one additional creature for each slot level above 2nd."
    ],
    "rolls": "CON saving throw; success: none",
    "school": "Necromancy",
    "duration": "1 minute",
    "castingTime": "1 action",
    "range": "30 feet",
    "components": [
      "V"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Bard",
      "Cleric",
      "Sorcerer",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/blindness-deafness"
  },
  "Blink": {
    "name": "Blink",
    "levelLabel": "3rd level",
    "description": [
      "Roll a d20 at the end of each of your turns for the duration of the spell. On a roll of 11 or higher, you vanish from your current plane of existence and appear in the Ethereal Plane (the spell fails and the casting is wasted if you were already on that plane). At the start of your next turn, and when the spell ends if you are on the Ethereal Plane, you return to an unoccupied space of your choice that you can see within 10 feet of the space you vanished from. If no unoccupied space is available within that range, you appear in the nearest unoccupied space (chosen at random if more than one space is equally near). You can dismiss this spell as an action.",
      "While on the Ethereal Plane, you can see and hear the plane you originated from, which is cast in shades of gray, and you can't see anything there more than 60 feet away. You can only affect and be affected by other creatures on the Ethereal Plane. Creatures that aren't there can't perceive you or interact with you, unless they have the ability to do so."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Transmutation",
    "duration": "1 minute",
    "castingTime": "1 action",
    "range": "Self",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Sorcerer",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/blink"
  },
  "Blur": {
    "name": "Blur",
    "levelLabel": "2nd level",
    "description": [
      "Your body becomes blurred, shifting and wavering to all who can see you. For the duration, any creature has disadvantage on attack rolls against you. An attacker is immune to this effect if it doesn't rely on sight, as with blindsight, or can see through illusions, as with truesight."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Illusion",
    "duration": "Up to 1 minute",
    "castingTime": "1 action",
    "range": "Self",
    "components": [
      "V"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Sorcerer",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/blur"
  },
  "Branding Smite": {
    "name": "Branding Smite",
    "levelLabel": "2nd level",
    "description": [
      "The next time you hit a creature with a weapon attack before this spell ends, the weapon gleams with astral radiance as you strike. The attack deals an extra 2d6 radiant damage to the target, which becomes visible if it's invisible, and the target sheds dim light in a 5-foot radius and can't become invisible until the spell ends."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 3rd level or higher, the extra damage increases by 1d6 for each slot level above 2nd."
    ],
    "rolls": "2d6 radiant damage at spell slot level 2",
    "school": "Evocation",
    "duration": "Up to 1 minute",
    "castingTime": "1 bonus action",
    "range": "Self",
    "components": [
      "V"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Paladin"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/branding-smite"
  },
  "Burning Hands": {
    "name": "Burning Hands",
    "levelLabel": "1st level",
    "description": [
      "As you hold your hands with thumbs touching and fingers spread, a thin sheet of flames shoots forth from your outstretched fingertips. Each creature in a 15-foot cone must make a dexterity saving throw. A creature takes 3d6 fire damage on a failed save, or half as much damage on a successful one.",
      "The fire ignites any flammable objects in the area that aren't being worn or carried."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 2nd level or higher, the damage increases by 1d6 for each slot level above 1st."
    ],
    "rolls": "3d6 fire damage at spell slot level 1 | DEX saving throw; success: half | 15-foot cone",
    "school": "Evocation",
    "duration": "Instantaneous",
    "castingTime": "1 action",
    "range": "Self",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Sorcerer",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/burning-hands"
  },
  "Call Lightning": {
    "name": "Call Lightning",
    "levelLabel": "3rd level",
    "description": [
      "A storm cloud appears in the shape of a cylinder that is 10 feet tall with a 60-foot radius, centered on a point you can see 100 feet directly above you. The spell fails if you can't see a point in the air where the storm cloud could appear (for example, if you are in a room that can't accommodate the cloud).",
      "When you cast the spell, choose a point you can see within range. A bolt of lightning flashes down from the cloud to that point. Each creature within 5 feet of that point must make a dexterity saving throw. A creature takes 3d10 lightning damage on a failed save, or half as much damage on a successful one. On each of your turns until the spell ends, you can use your action to call down lightning in this way again, targeting the same point or a different one.",
      "If you are outdoors in stormy conditions when you cast this spell, the spell gives you control over the existing storm instead of creating a new one. Under such conditions, the spell's damage increases by 1d10."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 4th or higher level, the damage increases by 1d10 for each slot level above 3rd."
    ],
    "rolls": "3d10 lightning damage at spell slot level 3 | 5-foot sphere",
    "school": "Conjuration",
    "duration": "Up to 10 minutes",
    "castingTime": "1 action",
    "range": "120 feet",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Druid"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/call-lightning"
  },
  "Calm Emotions": {
    "name": "Calm Emotions",
    "levelLabel": "2nd level",
    "description": [
      "You attempt to suppress strong emotions in a group of people. Each humanoid in a 20-foot-radius sphere centered on a point you choose within range must make a charisma saving throw; a creature can choose to fail this saving throw if it wishes. If a creature fails its saving throw, choose one of the following two effects. You can suppress any effect causing a target to be charmed or frightened. When this spell ends, any suppressed effect resumes, provided that its duration has not expired in the meantime.",
      "Alternatively, you can make a target indifferent about creatures of your choice that it is hostile toward. This indifference ends if the target is attacked or harmed by a spell or if it witnesses any of its friends being harmed. When the spell ends, the creature becomes hostile again, unless the GM rules otherwise."
    ],
    "higherLevel": [],
    "rolls": "CHA saving throw; success: none | 20-foot sphere",
    "school": "Enchantment",
    "duration": "Up to 1 minute",
    "castingTime": "1 action",
    "range": "60 feet",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Bard",
      "Cleric"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/calm-emotions"
  },
  "Charm Person": {
    "name": "Charm Person",
    "levelLabel": "1st level",
    "description": [
      "You attempt to charm a humanoid you can see within range. It must make a wisdom saving throw, and does so with advantage if you or your companions are fighting it. If it fails the saving throw, it is charmed by you until the spell ends or until you or your companions do anything harmful to it. The charmed creature regards you as a friendly acquaintance. When the spell ends, the creature knows it was charmed by you."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 2nd level or higher, you can target one additional creature for each slot level above 1st. The creatures must be within 30 feet of each other when you target them."
    ],
    "rolls": "WIS saving throw; success: none",
    "school": "Enchantment",
    "duration": "1 hour",
    "castingTime": "1 action",
    "range": "30 feet",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Bard",
      "Druid",
      "Sorcerer",
      "Warlock",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/charm-person"
  },
  "Chill Touch": {
    "name": "Chill Touch",
    "levelLabel": "Cantrip",
    "description": [
      "You create a ghostly, skeletal hand in the space of a creature within range. Make a ranged spell attack against the creature to assail it with the chill of the grave. On a hit, the target takes 1d8 necrotic damage, and it can't regain hit points until the start of your next turn. Until then, the hand clings to the target.",
      "If you hit an undead target, it also has disadvantage on attack rolls against you until the end of your next turn.",
      "This spell's damage increases by 1d8 when you reach 5th level (2d8), 11th level (3d8), and 17th level (4d8)."
    ],
    "higherLevel": [],
    "rolls": "1d8 necrotic damage at character level 1 | Ranged spell attack",
    "school": "Necromancy",
    "duration": "1 round",
    "castingTime": "1 action",
    "range": "120 feet",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Sorcerer",
      "Warlock",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/chill-touch"
  },
  "Clairvoyance": {
    "name": "Clairvoyance",
    "levelLabel": "3rd level",
    "description": [
      "You create an invisible sensor within range in a location familiar to you (a place you have visited or seen before) or in an obvious location that is unfamiliar to you (such as behind a door, around a corner, or in a grove of trees). The sensor remains in place for the duration, and it can't be attacked or otherwise interacted with.",
      "When you cast the spell, you choose seeing or hearing. You can use the chosen sense through the sensor as if you were in its space. As your action, you can switch between seeing and hearing.",
      "A creature that can see the sensor (such as a creature benefiting from see invisibility or truesight) sees a luminous, intangible orb about the size of your fist."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Divination",
    "duration": "Up to 10 minutes",
    "castingTime": "10 minutes",
    "range": "1 mile",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Bard",
      "Cleric",
      "Sorcerer",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/clairvoyance",
    "material": "A focus worth at least 100gp, either a jeweled horn for hearing or a glass eye for seeing."
  },
  "Color Spray": {
    "name": "Color Spray",
    "levelLabel": "1st level",
    "description": [
      "A dazzling array of flashing, colored light springs from your hand. Roll 6d10; the total is how many hit points of creatures this spell can effect. Creatures in a 15-foot cone originating from you are affected in ascending order of their current hit points (ignoring unconscious creatures and creatures that can't see).",
      "Starting with the creature that has the lowest current hit points, each creature affected by this spell is blinded until the spell ends. Subtract each creature's hit points from the total before moving on to the creature with the next lowest hit points. A creature's hit points must be equal to or less than the remaining total for that creature to be affected."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 2nd level or higher, roll an additional 2d10 for each slot level above 1st."
    ],
    "rolls": "15-foot cone",
    "school": "Illusion",
    "duration": "1 round",
    "castingTime": "1 action",
    "range": "Self",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Sorcerer",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/color-spray",
    "material": "A pinch of powder or sand that is colored red, yellow, and blue."
  },
  "Command": {
    "name": "Command",
    "levelLabel": "1st level",
    "description": [
      "You speak a one-word command to a creature you can see within range. The target must succeed on a wisdom saving throw or follow the command on its next turn. The spell has no effect if the target is undead, if it doesn't understand your language, or if your command is directly harmful to it.",
      "Some typical commands and their effects follow. You might issue a command other than one described here. If you do so, the GM determines how the target behaves. If the target can't follow your command, the spell ends.",
      "***Approach.*** The target moves toward you by the shortest and most direct route, ending its turn if it moves within 5 feet of you.",
      "***Drop.*** The target drops whatever it is holding and then ends its turn.",
      "***Flee.*** The target spends its turn moving away from you by the fastest available means.",
      "***Grovel.*** The target falls prone and then ends its turn.",
      "***Halt.*** The target doesn't move and takes no actions. A flying creature stays aloft, provided that it is able to do so. If it must move to stay aloft, it flies the minimum distance needed to remain in the air."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 2nd level or higher, you can affect one additional creature for each slot level above 1st. The creatures must be within 30 feet of each other when you target them."
    ],
    "rolls": "WIS saving throw; success: none",
    "school": "Enchantment",
    "duration": "1 round",
    "castingTime": "1 action",
    "range": "60 feet",
    "components": [
      "V"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Cleric",
      "Paladin"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/command"
  },
  "Comprehend Languages": {
    "name": "Comprehend Languages",
    "levelLabel": "1st level",
    "description": [
      "For the duration, you understand the literal meaning of any spoken language that you hear. You also understand any written language that you see, but you must be touching the surface on which the words are written. It takes about 1 minute to read one page of text.",
      "This spell doesn't decode secret messages in a text or a glyph, such as an arcane sigil, that isn't part of a written language."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Divination",
    "duration": "1 hour",
    "castingTime": "1 action",
    "range": "Self",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": true,
    "concentration": false,
    "classes": [
      "Bard",
      "Sorcerer",
      "Warlock",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/comprehend-languages",
    "material": "A pinch of soot and salt."
  },
  "Conjure Animals": {
    "name": "Conjure Animals",
    "levelLabel": "3rd level",
    "description": [
      "You summon fey spirits that take the form of beasts and appear in unoccupied spaces that you can see within range. Choose one of the following options for what appears:",
      "- One beast of challenge rating 2 or lower",
      "- Two beasts of challenge rating 1 or lower",
      "- Four beasts of challenge rating 1/2 or lower",
      "- Eight beasts of challenge rating 1/4 or lower",
      "- Each beast is also considered fey, and it disappears when it drops to 0 hit points or when the spell ends.",
      "The summoned creatures are friendly to you and your companions. Roll initiative for the summoned creatures as a group, which has its own turns. They obey any verbal commands that you issue to them (no action required by you). If you don't issue any commands to them, they defend themselves from hostile creatures, but otherwise take no actions.",
      "The GM has the creatures' statistics."
    ],
    "higherLevel": [
      "When you cast this spell using certain higher-level spell slots, you choose one of the summoning options above, and more creatures appear: twice as many with a 5th-level slot, three times as many with a 7th-level."
    ],
    "rolls": "Resolve using the rules text.",
    "school": "Conjuration",
    "duration": "Up to 1 hour",
    "castingTime": "1 action",
    "range": "60 feet",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Druid",
      "Ranger"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/conjure-animals"
  },
  "Continual Flame": {
    "name": "Continual Flame",
    "levelLabel": "2nd level",
    "description": [
      "A flame, equivalent in brightness to a torch, springs forth from an object that you touch. The effect looks like a regular flame, but it creates no heat and doesn't use oxygen. A continual flame can be covered or hidden but not smothered or quenched."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Evocation",
    "duration": "Until dispelled",
    "castingTime": "1 action",
    "range": "Touch",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Cleric",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/continual-flame",
    "material": "Ruby dust worth 50 gp, which the spell consumes."
  },
  "Counterspell": {
    "name": "Counterspell",
    "levelLabel": "3rd level",
    "description": [
      "You attempt to interrupt a creature in the process of casting a spell. If the creature is casting a spell of 3rd level or lower, its spell fails and has no effect. If it is casting a spell of 4th level or higher, make an ability check using your spellcasting ability. The DC equals 10 + the spell's level. On a success, the creature's spell fails and has no effect."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 4th level or higher, the interrupted spell has no effect if its level is less than or equal to the level of the spell slot you used."
    ],
    "rolls": "Resolve using the rules text.",
    "school": "Abjuration",
    "duration": "Instantaneous",
    "castingTime": "1 reaction",
    "range": "60 feet",
    "components": [
      "S"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Sorcerer",
      "Warlock",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/counterspell"
  },
  "Create Food and Water": {
    "name": "Create Food and Water",
    "levelLabel": "3rd level",
    "description": [
      "You create 45 pounds of food and 30 gallons of water on the ground or in containers within range, enough to sustain up to fifteen humanoids or five steeds for 24 hours. The food is bland but nourishing, and spoils if uneaten after 24 hours. The water is clean and doesn't go bad."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Conjuration",
    "duration": "Instantaneous",
    "castingTime": "1 action",
    "range": "30 feet",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Cleric",
      "Druid",
      "Paladin"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/create-food-and-water"
  },
  "Create or Destroy Water": {
    "name": "Create or Destroy Water",
    "levelLabel": "1st level",
    "description": [
      "You either create or destroy water.",
      "***Create Water.*** You create up to 10 gallons of clean water within range in an open container. Alternatively, the water falls as rain in a 30-foot cube within range.",
      "***Destroy Water.*** You destroy up to 10 gallons of water in an open container within range. Alternatively, you destroy fog in a 30-foot cube within range."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 2nd level or higher, you create or destroy 10 additional gallons of water, or the size of the cube increases by 5 feet, for each slot level above 1st."
    ],
    "rolls": "30-foot cube",
    "school": "Transmutation",
    "duration": "Instantaneous",
    "castingTime": "1 action",
    "range": "30 feet",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Cleric",
      "Druid"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/create-or-destroy-water",
    "material": "A drop of water if creating water, or a few grains of sand if destroying it."
  },
  "Cure Wounds": {
    "name": "Cure Wounds",
    "levelLabel": "1st level",
    "description": [
      "A creature you touch regains a number of hit points equal to 1d8 + your spellcasting ability modifier. This spell has no effect on undead or constructs."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 2nd level or higher, the healing increases by 1d8 for each slot level above 1st."
    ],
    "rolls": "1d8 + MOD healing at spell slot level 1",
    "school": "Evocation",
    "duration": "Instantaneous",
    "castingTime": "1 action",
    "range": "Touch",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Bard",
      "Cleric",
      "Druid",
      "Paladin",
      "Ranger"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/cure-wounds"
  },
  "Dancing Lights": {
    "name": "Dancing Lights",
    "levelLabel": "Cantrip",
    "description": [
      "You create up to four torch-sized lights within range, making them appear as torches, lanterns, or glowing orbs that hover in the air for the duration. You can also combine the four lights into one glowing vaguely humanoid form of Medium size. Whichever form you choose, each light sheds dim light in a 10-foot radius.",
      "As a bonus action on your turn, you can move the lights up to 60 feet to a new spot within range. A light must be within 20 feet of another light created by this spell, and a light winks out if it exceeds the spell's range."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Evocation",
    "duration": "Up to 1 minute",
    "castingTime": "1 action",
    "range": "120 feet",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Bard",
      "Sorcerer",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/dancing-lights",
    "material": "A bit of phosphorus or wychwood, or a glowworm."
  },
  "Darkness": {
    "name": "Darkness",
    "levelLabel": "2nd level",
    "description": [
      "Magical darkness spreads from a point you choose within range to fill a 15-foot-radius sphere for the duration. The darkness spreads around corners. A creature with darkvision can't see through this darkness, and nonmagical light can't illuminate it.",
      "If the point you choose is on an object you are holding or one that isn't being worn or carried, the darkness emanates from the object and moves with it. Completely covering the source of the darkness with an opaque object, such as a bowl or a helm, blocks the darkness.",
      "If any of this spell's area overlaps with an area of light created by a spell of 2nd level or lower, the spell that created the light is dispelled."
    ],
    "higherLevel": [],
    "rolls": "15-foot sphere",
    "school": "Evocation",
    "duration": "Up to 10 minutes",
    "castingTime": "1 action",
    "range": "60 feet",
    "components": [
      "V",
      "M"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Sorcerer",
      "Warlock",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/darkness",
    "material": "Bat fur and a drop of pitch or piece of coal."
  },
  "Darkvision": {
    "name": "Darkvision",
    "levelLabel": "2nd level",
    "description": [
      "You touch a willing creature to grant it the ability to see in the dark. For the duration, that creature has darkvision out to a range of 60 feet."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Transmutation",
    "duration": "8 hours",
    "castingTime": "1 action",
    "range": "Touch",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Druid",
      "Ranger",
      "Sorcerer",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/darkvision",
    "material": "Either a pinch of dried carrot or an agate."
  },
  "Daylight": {
    "name": "Daylight",
    "levelLabel": "3rd level",
    "description": [
      "A 60-foot-radius sphere of light spreads out from a point you choose within range. The sphere is bright light and sheds dim light for an additional 60 feet.",
      "If you chose a point on an object you are holding or one that isn't being worn or carried, the light shines from the object and moves with it. Completely covering the affected object with an opaque object, such as a bowl or a helm, blocks the light.",
      "If any of this spell's area overlaps with an area of darkness created by a spell of 3rd level or lower, the spell that created the darkness is dispelled."
    ],
    "higherLevel": [],
    "rolls": "60-foot sphere",
    "school": "Evocation",
    "duration": "1 hour",
    "castingTime": "1 action",
    "range": "60 feet",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Cleric",
      "Druid",
      "Paladin",
      "Ranger",
      "Sorcerer"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/daylight"
  },
  "Detect Evil and Good": {
    "name": "Detect Evil and Good",
    "levelLabel": "1st level",
    "description": [
      "For the duration, you know if there is an aberration, celestial, elemental, fey, fiend, or undead within 30 feet of you, as well as where the creature is located. Similarly, you know if there is a place or object within 30 feet of you that has been magically consecrated or desecrated.",
      "The spell can penetrate most barriers, but it is blocked by 1 foot of stone, 1 inch of common metal, a thin sheet of lead, or 3 feet of wood or dirt."
    ],
    "higherLevel": [],
    "rolls": "30-foot sphere",
    "school": "Divination",
    "duration": "Up to 10 minutes",
    "castingTime": "1 action",
    "range": "Self",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Cleric",
      "Paladin"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/detect-evil-and-good"
  },
  "Detect Magic": {
    "name": "Detect Magic",
    "levelLabel": "1st level",
    "description": [
      "For the duration, you sense the presence of magic within 30 feet of you. If you sense magic in this way, you can use your action to see a faint aura around any visible creature or object in the area that bears magic, and you learn its school of magic, if any.",
      "The spell can penetrate most barriers, but it is blocked by 1 foot of stone, 1 inch of common metal, a thin sheet of lead, or 3 feet of wood or dirt."
    ],
    "higherLevel": [],
    "rolls": "30-foot sphere",
    "school": "Divination",
    "duration": "Up to 10 minutes",
    "castingTime": "1 action",
    "range": "Self",
    "components": [
      "V",
      "S"
    ],
    "ritual": true,
    "concentration": true,
    "classes": [
      "Bard",
      "Cleric",
      "Druid",
      "Paladin",
      "Ranger",
      "Sorcerer",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/detect-magic"
  },
  "Detect Poison and Disease": {
    "name": "Detect Poison and Disease",
    "levelLabel": "1st level",
    "description": [
      "For the duration, you can sense the presence and location of poisons, poisonous creatures, and diseases within 30 feet of you. You also identify the kind of poison, poisonous creature, or disease in each case.",
      "The spell can penetrate most barriers, but it is blocked by 1 foot of stone, 1 inch of common metal, a thin sheet of lead, or 3 feet of wood or dirt."
    ],
    "higherLevel": [],
    "rolls": "30-foot sphere",
    "school": "Divination",
    "duration": "Up to 10 minutes",
    "castingTime": "1 action",
    "range": "Self",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": true,
    "concentration": true,
    "classes": [
      "Cleric",
      "Druid",
      "Paladin",
      "Ranger"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/detect-poison-and-disease",
    "material": "A yew leaf."
  },
  "Detect Thoughts": {
    "name": "Detect Thoughts",
    "levelLabel": "2nd level",
    "description": [
      "For the duration, you can read the thoughts of certain creatures. When you cast the spell and as your action on each turn until the spell ends, you can focus your mind on any one creature that you can see within 30 feet of you. If the creature you choose has an Intelligence of 3 or lower or doesn't speak any language, the creature is unaffected.",
      "You initially learn the surface thoughts of the creature - what is most on its mind in that moment. As an action, you can either shift your attention to another creature's thoughts or attempt to probe deeper into the same creature's mind. If you probe deeper, the target must make a Wisdom saving throw. If it fails, you gain insight into its reasoning (if any), its emotional state, and something that looms large in its mind (such as something it worries over, loves, or hates). If it succeeds, the spell ends. Either way, the target knows that you are probing into its mind, and unless you shift your attention to another creature's thoughts, the creature can use its action on its turn to make an Intelligence check contested by your Intelligence check; if it succeeds, the spell ends.",
      "Questions verbally directed at the target creature naturally shape the course of its thoughts, so this spell is particularly effective as part of an interrogation.",
      "You can also use this spell to detect the presence of thinking creatures you can't see. When you cast the spell or as your action during the duration, you can search for thoughts within 30 feet of you. The spell can penetrate barriers, but 2 feet of rock, 2 inches of any metal other than lead, or a thin sheet of lead blocks you. You can't detect a creature with an Intelligence of 3 or lower or one that doesn't speak any language.",
      "Once you detect the presence of a creature in this way, you can read its thoughts for the rest of the duration as described above, even if you can't see it, but it must still be within range."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Divination",
    "duration": "Up to 1 minute",
    "castingTime": "1 action",
    "range": "Self",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Bard",
      "Sorcerer",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/detect-thoughts",
    "material": "A copper coin."
  },
  "Disguise Self": {
    "name": "Disguise Self",
    "levelLabel": "1st level",
    "description": [
      "You make yourself--including your clothing, armor, weapons, and other belongings on your person--look different until the spell ends or until you use your action to dismiss it. You can seem 1 foot shorter or taller and can appear thin, fat, or in between. You can't change your body type, so you must adopt a form that has the same basic arrangement of limbs. Otherwise, the extent of the illusion is up to you.",
      "The changes wrought by this spell fail to hold up to physical inspection. For example, if you use this spell to add a hat to your outfit, objects pass through the hat, and anyone who touches it would feel nothing or would feel your head and hair. If you use this spell to appear thinner than you are, the hand of someone who reaches out to touch you would bump into you while it was seemingly still in midair.",
      "To discern that you are disguised, a creature can use its action to inspect your appearance and must succeed on an Intelligence (Investigation) check against your spell save DC."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Illusion",
    "duration": "1 hour",
    "castingTime": "1 action",
    "range": "Self",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Bard",
      "Sorcerer",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/disguise-self"
  },
  "Dispel Magic": {
    "name": "Dispel Magic",
    "levelLabel": "3rd level",
    "description": [
      "Choose one creature, object, or magical effect within range. Any spell of 3rd level or lower on the target ends. For each spell of 4th level or higher on the target, make an ability check using your spellcasting ability. The DC equals 10 + the spell's level. On a successful check, the spell ends."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 4th level or higher, you automatically end the effects of a spell on the target if the spell's level is equal to or less than the level of the spell slot you used."
    ],
    "rolls": "Resolve using the rules text.",
    "school": "Abjuration",
    "duration": "Instantaneous",
    "castingTime": "1 action",
    "range": "120 feet",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Bard",
      "Cleric",
      "Druid",
      "Paladin",
      "Sorcerer",
      "Warlock",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/dispel-magic"
  },
  "Divine Favor": {
    "name": "Divine Favor",
    "levelLabel": "1st level",
    "description": [
      "Your prayer empowers you with divine radiance. Until the spell ends, your weapon attacks deal an extra 1d4 radiant damage on a hit."
    ],
    "higherLevel": [],
    "rolls": "1d4 radiant damage at spell slot level 1",
    "school": "Evocation",
    "duration": "Up to 1 minute",
    "castingTime": "1 bonus action",
    "range": "Self",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Paladin"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/divine-favor"
  },
  "Druidcraft": {
    "name": "Druidcraft",
    "levelLabel": "Cantrip",
    "description": [
      "Whispering to the spirits of nature, you create one of the following effects within 'range':",
      "- You create a tiny, harmless sensory effect that predicts what the weather will be at your location for the next 24 hours. The effect might manifest as a golden orb for clear skies, a cloud for rain, falling snowflakes for snow, and so on. This effect persists for 1 round.",
      "- You instantly make a flower bloom, a seed pod open, or a leaf bud bloom.",
      "- You create an instantaneous, harmless sensory effect, such as falling leaves, a puff of wind, the sound of a small animal, or the faint order of skunk. The effect must fit in a 5-foot cube.",
      "- You instantly light or snuff out a candle, a torch, or a small campfire."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Transmutation",
    "duration": "Instantaneous",
    "castingTime": "1 action",
    "range": "30 feet",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Druid"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/druidcraft"
  },
  "Eldritch Blast": {
    "name": "Eldritch Blast",
    "levelLabel": "Cantrip",
    "description": [
      "A beam of crackling energy streaks toward a creature within range. Make a ranged spell attack against the target. On a hit, the target takes 1d10 force damage. The spell creates more than one beam when you reach higher levels: two beams at 5th level, three beams at 11th level, and four beams at 17th level. You can direct the beams at the same target or at different ones. Make a separate attack roll for each beam."
    ],
    "higherLevel": [],
    "rolls": "1d10 force damage at character level 1 | Ranged spell attack",
    "school": "Evocation",
    "duration": "Instantaneous",
    "castingTime": "1 action",
    "range": "120 feet",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Warlock"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/eldritch-blast"
  },
  "Enhance Ability": {
    "name": "Enhance Ability",
    "levelLabel": "2nd level",
    "description": [
      "You touch a creature and bestow upon it a magical enhancement. Choose one of the following effects; the target gains that effect until the spell ends.",
      "***Bear's Endurance.*** The target has advantage on constitution checks. It also gains 2d6 temporary hit points, which are lost when the spell ends.",
      "***Bull's Strength.*** The target has advantage on strength checks, and his or her carrying capacity doubles.",
      "***Cat's Grace.*** The target has advantage on dexterity checks. It also doesn't take damage from falling 20 feet or less if it isn't incapacitated.",
      "***Eagle's Splendor.*** The target has advantage on Charisma checks.",
      "***Fox's Cunning.*** The target has advantage on intelligence checks.",
      "***Owl's Wisdom.*** The target has advantage on wisdom checks."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 3rd level or higher, you can target one additional creature for each slot level above 2nd."
    ],
    "rolls": "Resolve using the rules text.",
    "school": "Transmutation",
    "duration": "Up to 1 hour",
    "castingTime": "1 action",
    "range": "Touch",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Bard",
      "Cleric",
      "Druid",
      "Sorcerer"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/enhance-ability",
    "material": "Fur or a feather from a beast."
  },
  "Enlarge/Reduce": {
    "name": "Enlarge/Reduce",
    "levelLabel": "2nd level",
    "description": [
      "You cause a creature or an object you can see within range to grow larger or smaller for the duration. Choose either a creature or an object that is neither worn nor carried. If the target is unwilling, it can make a Constitution saving throw. On a success, the spell has no effect.",
      "If the target is a creature, everything it is wearing and carrying changes size with it. Any item dropped by an affected creature returns to normal size at once.",
      "***Enlarge.*** The target's size doubles in all dimensions, and its weight is multiplied by eight. This growth increases its size by one category-from Medium to Large, for example. If there isn't enough room for the target to double its size, the creature or object attains the maximum possible size in the space available. Until the spell ends, the target also has advantage on Strength checks and Strength saving throws. The target's weapons also grow to match its new size. While these weapons are enlarged, the target's attacks with them deal 1d4 extra damage.",
      "***Reduce.*** The target's size is halved in all dimensions, and its weight is reduced to one-eighth of normal. This reduction decreases its size by one category-from Medium to Small, for example. Until the spell ends, the target also has disadvantage on Strength checks and Strength saving throws. The target's weapons also shrink to match its new size. While these weapons are reduced, the target's attacks with them deal 1d4 less damage (this can't reduce the damage below 1)."
    ],
    "higherLevel": [],
    "rolls": "CON saving throw; success: none",
    "school": "Transmutation",
    "duration": "Up to 1 minute",
    "castingTime": "1 action",
    "range": "30 feet",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Sorcerer",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/enlarge-reduce",
    "material": "A pinch iron powder."
  },
  "Entangle": {
    "name": "Entangle",
    "levelLabel": "1st level",
    "description": [
      "Grasping weeds and vines sprout from the ground in a 20-foot square starting form a point within range. For the duration, these plants turn the ground in the area into difficult terrain.",
      "A creature in the area when you cast the spell must succeed on a strength saving throw or be restrained by the entangling plants until the spell ends. A creature restrained by the plants can use its action to make a Strength check against your spell save DC. On a success, it frees itself.",
      "When the spell ends, the conjured plants wilt away."
    ],
    "higherLevel": [],
    "rolls": "STR saving throw; success: none | 20-foot cube",
    "school": "Conjuration",
    "duration": "Up to 1 minute",
    "castingTime": "1 action",
    "range": "90 feet",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Druid"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/entangle"
  },
  "Enthrall": {
    "name": "Enthrall",
    "levelLabel": "2nd level",
    "description": [
      "You weave a distracting string of words, causing creatures of your choice that you can see within range and that can hear you to make a wisdom saving throw. Any creature that can't be charmed succeeds on this saving throw automatically, and if you or your companions are fighting a creature, it has advantage on the save. On a failed save, the target has disadvantage on Wisdom (Perception) checks made to perceive any creature other than you until the spell ends or until the target can no longer hear you. The spell ends if you are incapacitated or can no longer speak."
    ],
    "higherLevel": [],
    "rolls": "WIS saving throw; success: none",
    "school": "Enchantment",
    "duration": "1 minute",
    "castingTime": "1 action",
    "range": "60 feet",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Bard",
      "Warlock"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/enthrall"
  },
  "Expeditious Retreat": {
    "name": "Expeditious Retreat",
    "levelLabel": "1st level",
    "description": [
      "This spell allows you to move at an incredible pace. When you cast this spell, and then as a bonus action on each of your turns until the spell ends, you can take the Dash action."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Transmutation",
    "duration": "Up to 10 minutes",
    "castingTime": "1 bonus action",
    "range": "Self",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Sorcerer",
      "Warlock",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/expeditious-retreat"
  },
  "Faerie Fire": {
    "name": "Faerie Fire",
    "levelLabel": "1st level",
    "description": [
      "Each object in a 20-foot cube within range is outlined in blue, green, or violet light (your choice). Any creature in the area when the spell is cast is also outlined in light if it fails a dexterity saving throw. For the duration, objects and affected creatures shed dim light in a 10-foot radius.",
      "Any attack roll against an affected creature or object has advantage if the attacker can see it, and the affected creature or object can't benefit from being invisible."
    ],
    "higherLevel": [],
    "rolls": "DEX saving throw; success: none | 20-foot cube",
    "school": "Evocation",
    "duration": "Up to 1 minute",
    "castingTime": "1 action",
    "range": "60 feet",
    "components": [
      "V"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Druid"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/faerie-fire"
  },
  "False Life": {
    "name": "False Life",
    "levelLabel": "1st level",
    "description": [
      "Bolstering yourself with a necromantic facsimile of life, you gain 1d4 + 4 temporary hit points for the duration."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 2nd level or higher, you gain 5 additional temporary hit points for each slot level above 1st."
    ],
    "rolls": "1d4 + 4 healing at spell slot level 1",
    "school": "Necromancy",
    "duration": "1 hour",
    "castingTime": "1 action",
    "range": "Self",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Sorcerer",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/false-life",
    "material": "A small amount of alcohol or distilled spirits."
  },
  "Fear": {
    "name": "Fear",
    "levelLabel": "3rd level",
    "description": [
      "You project a phantasmal image of a creature's worst fears. Each creature in a 30-foot cone must succeed on a wisdom saving throw or drop whatever it is holding and become frightened for the duration.",
      "While frightened by this spell, a creature must take the Dash action and move away from you by the safest available route on each of its turns, unless there is nowhere to move. If the creature ends its turn in a location where it doesn't have line of sight to you, the creature can make a wisdom saving throw. On a successful save, the spell ends for that creature."
    ],
    "higherLevel": [],
    "rolls": "WIS saving throw; success: none | 30-foot cone",
    "school": "Illusion",
    "duration": "Up to 1 minute",
    "castingTime": "1 action",
    "range": "Self",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Bard",
      "Sorcerer",
      "Warlock",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/fear",
    "material": "A white feather or the heart of a hen."
  },
  "Feather Fall": {
    "name": "Feather Fall",
    "levelLabel": "1st level",
    "description": [
      "Choose up to five falling creatures within range. A falling creature's rate of descent slows to 60 feet per round until the spell ends. If the creature lands before the spell ends, it takes no falling damage and can land on its feet, and the spell ends for that creature."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Transmutation",
    "duration": "1 minute",
    "castingTime": "1 reaction",
    "range": "60 feet",
    "components": [
      "V",
      "M"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Bard",
      "Sorcerer",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/feather-fall",
    "material": "A small feather or a piece of down."
  },
  "Find Familiar": {
    "name": "Find Familiar",
    "levelLabel": "1st level",
    "description": [
      "You gain the service of a familiar, a spirit that takes an animal form you choose: bat, cat, crab, frog (toad), hawk, lizard, octopus, owl, poisonous snake, fish (quipper), rat, raven, sea horse, spider, or weasel. Appearing in an unoccupied space within range, the familiar has the statistics of the chosen form, though it is a celestial, fey, or fiend (your choice) instead of a beast.",
      "Your familiar acts independently of you, but it always obeys your commands. In combat, it rolls its own initiative and acts on its own turn. A familiar can't attack, but it can take other actions as normal.",
      "When the familiar drops to 0 hit points, it disappears, leaving behind no physical form. It reappears after you cast this spell again.",
      "While your familiar is within 100 feet of you, you can communicate with it telepathically. Additionally, as an action, you can see through your familiar's eyes and hear what it hears until the start of your next turn, gaining the benefits of any special senses that the familiar has. During this time, you are deaf and blind with regard to your own senses.",
      "As an action, you can temporarily dismiss your familiar. It disappears into a pocket dimension where it awaits your summons. Alternatively, you can dismiss it forever. As an action while it is temporarily dismissed, you can cause it to reappear in any unoccupied space within 30 feet of you.",
      "You can't have more than one familiar at a time. If you cast this spell while you already have a familiar, you instead cause it to adopt a new form. Choose one of the forms from the above list. Your familiar transforms into the chosen creature.",
      "Finally, when you cast a spell with a range of touch, your familiar can deliver the spell as if it had cast the spell. Your familiar must be within 100 feet of you, and it must use its reaction to deliver the spell when you cast it. If the spell requires an attack roll, you use your action modifier for the roll."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Conjuration",
    "duration": "Instantaneous",
    "castingTime": "1 hour",
    "range": "10 feet",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": true,
    "concentration": false,
    "classes": [
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/find-familiar",
    "material": "10gp worth of charcoal, incense, and herbs that must be consumed by fire in a brass brazier."
  },
  "Find Steed": {
    "name": "Find Steed",
    "levelLabel": "2nd level",
    "description": [
      "You summon a spirit that assumes the form of an unusually intelligent, strong, and loyal steed, creating a long-lasting bond with it. Appearing in an unoccupied space within range, the steed takes on a form that you choose, such as a warhorse, a pony, a camel, an elk, or a mastiff. (Your GM might allow other animals to be summoned as steeds.) The steed has the statistics of the chosen form, though it is a celestial, fey, or fiend (your choice) instead of its normal type. Additionally, if your steed has an Intelligence of 5 or less, its Intelligence becomes 6, and it gains the ability to understand one language of your choice that you speak.",
      "Your steed serves you as a mount, both in combat and out, and you have an instinctive bond with it that allows you to fight as a seamless unit. While mounted on your steed, you can make any spell you cast that targets only you also target your steed.",
      "When the steed drops to 0 hit points, it disappears, leaving behind no physical form. You can also dismiss your steed at any time as an action, causing it to disappear. In either case, casting this spell again summons the same steed, restored to its hit point maximum.",
      "While your steed is within 1 mile of you, you can communicate with it telepathically.",
      "You can't have more than one steed bonded by this spell at a time. As an action, you can release the steed from its bond at any time, causing it to disappear."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Conjuration",
    "duration": "Instantaneous",
    "castingTime": "10 minutes",
    "range": "30 feet",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Paladin"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/find-steed"
  },
  "Find Traps": {
    "name": "Find Traps",
    "levelLabel": "2nd level",
    "description": [
      "You sense the presence of any trap within range that is within line of sight. A trap, for the purpose of this spell, includes anything that would inflict a sudden or unexpected effect you consider harmful or undesirable, which was specifically intended as such by its creator. Thus, the spell would sense an area affected by the alarm spell, a glyph of warding, or a mechanical pit trap, but it would not reveal a natural weakness in the floor, an unstable ceiling, or a hidden sinkhole.",
      "This spell merely reveals that a trap is present. You don't learn the location of each trap, but you do learn the general nature of the danger posed by a trap you sense."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Divination",
    "duration": "Instantaneous",
    "castingTime": "1 action",
    "range": "120 feet",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Cleric",
      "Druid",
      "Ranger"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/find-traps"
  },
  "Fire Bolt": {
    "name": "Fire Bolt",
    "levelLabel": "Cantrip",
    "description": [
      "You hurl a mote of fire at a creature or object within range. Make a ranged spell attack against the target. On a hit, the target takes 1d10 fire damage. A flammable object hit by this spell ignites if it isn't being worn or carried.",
      "This spell's damage increases by 1d10 when you reach 5th level (2d10), 11th level (3d10), and 17th level (4d10)."
    ],
    "higherLevel": [],
    "rolls": "1d10 fire damage at character level 1 | Ranged spell attack",
    "school": "Evocation",
    "duration": "Instantaneous",
    "castingTime": "1 action",
    "range": "120 feet",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Sorcerer",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/fire-bolt"
  },
  "Fireball": {
    "name": "Fireball",
    "levelLabel": "3rd level",
    "description": [
      "A bright streak flashes from your pointing finger to a point you choose within range and then blossoms with a low roar into an explosion of flame. Each creature in a 20-foot-radius sphere centered on that point must make a dexterity saving throw. A target takes 8d6 fire damage on a failed save, or half as much damage on a successful one.",
      "The fire spreads around corners. It ignites flammable objects in the area that aren't being worn or carried."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 4th level or higher, the damage increases by 1d6 for each slot level above 3rd."
    ],
    "rolls": "8d6 fire damage at spell slot level 3 | DEX saving throw; success: half | 20-foot sphere",
    "school": "Evocation",
    "duration": "Instantaneous",
    "castingTime": "1 action",
    "range": "150 feet",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Sorcerer",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/fireball",
    "material": "A tiny ball of bat guano and sulfur."
  },
  "Flame Blade": {
    "name": "Flame Blade",
    "levelLabel": "2nd level",
    "description": [
      "You evoke a fiery blade in your free hand. The blade is similar in size and shape to a scimitar, and it lasts for the duration. If you let go of the blade, it disappears, but you can evoke the blade again as a bonus action.",
      "You can use your action to make a melee spell attack with the fiery blade. On a hit, the target takes 3d6 fire damage.",
      "The flaming blade sheds bright light in a 10-foot radius and dim light for an additional 10 feet."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 4th level or higher, the damage increases by 1d6 for every two slot levels above 2nd."
    ],
    "rolls": "3d6 fire damage at spell slot level 2",
    "school": "Evocation",
    "duration": "Up to 10 minutes",
    "castingTime": "1 bonus action",
    "range": "Self",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Druid"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/flame-blade",
    "material": "Leaf of sumac."
  },
  "Flaming Sphere": {
    "name": "Flaming Sphere",
    "levelLabel": "2nd level",
    "description": [
      "A 5-foot-diameter sphere of fire appears in an unoccupied space of your choice within range and lasts for the duration. Any creature that ends its turn within 5 feet of the sphere must make a dexterity saving throw. The creature takes 2d6 fire damage on a failed save, or half as much damage on a successful one.",
      "As a bonus action, you can move the sphere up to 30 feet. If you ram the sphere into a creature, that creature must make the saving throw against the sphere's damage, and the sphere stops moving this turn.",
      "When you move the sphere, you can direct it over barriers up to 5 feet tall and jump it across pits up to 10 feet wide. The sphere ignites flammable objects not being worn or carried, and it sheds bright light in a 20-foot radius and dim light for an additional 20 feet."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 3rd level or higher, the damage increases by 1d6 for each slot level above 2nd."
    ],
    "rolls": "2d6 fire damage at spell slot level 2",
    "school": "Conjuration",
    "duration": "Up to 1 minute",
    "castingTime": "1 action",
    "range": "60 feet",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Druid",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/flaming-sphere",
    "material": "A bit of tallow, a pinch of brimstone, and a dusting of powdered iron."
  },
  "Fly": {
    "name": "Fly",
    "levelLabel": "3rd level",
    "description": [
      "You touch a willing creature. The target gains a flying speed of 60 feet for the duration. When the spell ends, the target falls if it is still aloft, unless it can stop the fall."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 4th level or higher, you can target one additional creature for each slot level above 3rd."
    ],
    "rolls": "Resolve using the rules text.",
    "school": "Transmutation",
    "duration": "Up to 10 minutes",
    "castingTime": "1 action",
    "range": "Touch",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Sorcerer",
      "Warlock",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/fly",
    "material": "A wing feather from any bird."
  },
  "Fog Cloud": {
    "name": "Fog Cloud",
    "levelLabel": "1st level",
    "description": [
      "You create a 20-foot-radius sphere of fog centered on a point within range. The sphere spreads around corners, and its area is heavily obscured. It lasts for the duration or until a wind of moderate or greater speed (at least 10 miles per hour) disperses it."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 2nd level or higher, the radius of the fog increases by 20 feet for each slot level above 1st."
    ],
    "rolls": "20-foot sphere",
    "school": "Conjuration",
    "duration": "Up to 1 hour",
    "castingTime": "1 action",
    "range": "120 feet",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Druid",
      "Ranger",
      "Sorcerer",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/fog-cloud"
  },
  "Gaseous Form": {
    "name": "Gaseous Form",
    "levelLabel": "3rd level",
    "description": [
      "You transform a willing creature you touch, along with everything it's wearing and carrying, into a misty cloud for the duration. The spell ends if the creature drops to 0 hit points. An incorporeal creature isn't affected.",
      "While in this form, the target's only method of movement is a flying speed of 10 feet. The target can enter and occupy the space of another creature. The target has resistance to nonmagical damage, and it has advantage on Strength, Dexterity, and constitution saving throws. The target can pass through small holes, narrow openings, and even mere cracks, though it treats liquids as though they were solid surfaces. The target can't fall and remains hovering in the air even when stunned or otherwise incapacitated.",
      "While in the form of a misty cloud, the target can't talk or manipulate objects, and any objects it was carrying or holding can't be dropped, used, or otherwise interacted with. The target can't attack or cast spells."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Transmutation",
    "duration": "Up to 1 hour",
    "castingTime": "1 action",
    "range": "Touch",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Sorcerer",
      "Warlock",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/gaseous-form",
    "material": "A bit of gauze and a wisp of smoke."
  },
  "Gentle Repose": {
    "name": "Gentle Repose",
    "levelLabel": "2nd level",
    "description": [
      "You touch a corpse or other remains. For the duration, the target is protected from decay and can't become undead.",
      "The spell also effectively extends the time limit on raising the target from the dead, since days spent under the influence of this spell don't count against the time limit of spells such as raise dead."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Necromancy",
    "duration": "10 days",
    "castingTime": "1 action",
    "range": "Touch",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": true,
    "concentration": false,
    "classes": [
      "Cleric",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/gentle-repose",
    "material": "A pinch of salt and one copper piece placed on each of the corpse's eyes, which must remain there for the duration."
  },
  "Glyph of Warding": {
    "name": "Glyph of Warding",
    "levelLabel": "3rd level",
    "description": [
      "When you cast this spell, you inscribe a glyph that harms other creatures, either upon a surface (such as a table or a section of floor or wall) or within an object that can be closed (such as a book, a scroll, or a treasure chest) to conceal the glyph. If you choose a surface, the glyph can cover an area of the surface no larger than 10 feet in diameter. If you choose an object, that object must remain in its place; if the object is moved more than 10 feet from where you cast this spell, the glyph is broken, and the spell ends without being triggered.",
      "The glyph is nearly invisible and requires a successful Intelligence (Investigation) check against your spell save DC to be found.",
      "You decide what triggers the glyph when you cast the spell. For glyphs inscribed on a surface, the most typical triggers include touching or standing on the glyph, removing another object covering the glyph, approaching within a certain distance of the glyph, or manipulating the object on which the glyph is inscribed. For glyphs inscribed within an object, the most common triggers include opening that object, approaching within a certain distance of the object, or seeing or reading the glyph. Once a glyph is triggered, this spell ends.",
      "You can further refine the trigger so the spell activates only under certain circumstances or according to physical characteristics (such as height or weight), creature kind (for example, the ward could be set to affect aberrations or drow), or alignment. You can also set conditions for creatures that don't trigger the glyph, such as those who say a certain password.",
      "When you inscribe the glyph, choose *explosive runes* or a *spell glyph*.",
      "***Explosive Runes.*** When triggered, the glyph erupts with magical energy in a 20-foot-radius sphere centered on the glyph. The sphere spreads around corners. Each creature in the area must make a Dexterity saving throw. A creature takes 5d8 acid, cold, fire, lightning, or thunder damage on a failed saving throw (your choice when you create the glyph), or half as much damage on a successful one.",
      "***Spell Glyph.*** You can store a prepared spell of 3rd level or lower in the glyph by casting it as part of creating the glyph. The spell must target a single creature or an area. The spell being stored has no immediate effect when cast in this way. When the glyph is triggered, the stored spell is cast. If the spell has a target, it targets the creature that triggered the glyph. If the spell affects an area, the area is centered on that creature. If the spell summons hostile creatures or creates harmful objects or traps, they appear as close as possible to the intruder and attack it. If the spell requires concentration, it lasts until the end of its full duration."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 4th level or higher, the damage of an explosive runes glyph increases by 1d8 for each slot level above 3rd. If you create a spell glyph, you can store any spell of up to the same level as the slot you use for the glyph of warding."
    ],
    "rolls": "Resolve using the rules text.",
    "school": "Abjuration",
    "duration": "Until dispelled",
    "castingTime": "1 hour",
    "range": "Touch",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Bard",
      "Cleric",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/glyph-of-warding",
    "material": "Incense and powdered diamond worth at least 200 gp, which the spell consumes."
  },
  "Goodberry": {
    "name": "Goodberry",
    "levelLabel": "1st level",
    "description": [
      "Up to ten berries appear in your hand and are infused with magic for the duration. A creature can use its action to eat one berry. Eating a berry restores 1 hit point, and the berry provides enough nourishment to sustain a creature for a day.",
      "The berries lose their potency if they have not been consumed within 24 hours of the casting of this spell."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Transmutation",
    "duration": "Instantaneous",
    "castingTime": "1 action",
    "range": "Touch",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Druid",
      "Ranger"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/goodberry",
    "material": "A sprig of mistletoe."
  },
  "Grease": {
    "name": "Grease",
    "levelLabel": "1st level",
    "description": [
      "Slick grease covers the ground in a 10-foot square centered on a point within range and turns it into difficult terrain for the duration.",
      "When the grease appears, each creature standing in its area must succeed on a dexterity saving throw or fall prone. A creature that enters the area or ends its turn there must also succeed on a dexterity saving throw or fall prone."
    ],
    "higherLevel": [],
    "rolls": "DEX saving throw; success: none | 10-foot cube",
    "school": "Conjuration",
    "duration": "1 minute",
    "castingTime": "1 action",
    "range": "60 feet",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/grease",
    "material": "A bit of pork rind or butter."
  },
  "Guidance": {
    "name": "Guidance",
    "levelLabel": "Cantrip",
    "description": [
      "You touch one willing creature. Once before the spell ends, the target can roll a d4 and add the number rolled to one ability check of its choice. It can roll the die before or after making the ability check. The spell then ends."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Divination",
    "duration": "Up to 1 minute",
    "castingTime": "1 action",
    "range": "Touch",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Cleric",
      "Druid"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/guidance"
  },
  "Guiding Bolt": {
    "name": "Guiding Bolt",
    "levelLabel": "1st level",
    "description": [
      "A flash of light streaks toward a creature of your choice within range. Make a ranged spell attack against the target. On a hit, the target takes 4d6 radiant damage, and the next attack roll made against this target before the end of your next turn has advantage, thanks to the mystical dim light glittering on the target until then."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 2nd level or higher, the damage increases by 1d6 for each slot level above 1st."
    ],
    "rolls": "4d6 radiant damage at spell slot level 1 | Ranged spell attack",
    "school": "Evocation",
    "duration": "1 round",
    "castingTime": "1 action",
    "range": "120 feet",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Cleric"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/guiding-bolt"
  },
  "Gust of Wind": {
    "name": "Gust of Wind",
    "levelLabel": "2nd level",
    "description": [
      "A line of strong wind 60 feet long and 10 feet wide blasts from you in a direction you choose for the spell's duration. Each creature that starts its turn in the line must succeed on a strength saving throw or be pushed 15 feet away from you in a direction following the line.",
      "Any creature in the line must spend 2 feet of movement for every 1 foot it moves when moving closer to you.",
      "The gust disperses gas or vapor, and it extinguishes candles, torches, and similar unprotected flames in the area. It causes protected flames, such as those of lanterns, to dance wildly and has a 50 percent chance to extinguish them.",
      "As a bonus action on each of your turns before the spell ends, you can change the direction in which the line blasts from you."
    ],
    "higherLevel": [],
    "rolls": "STR saving throw; success: none | 60-foot line",
    "school": "Evocation",
    "duration": "Up to 1 minute",
    "castingTime": "1 action",
    "range": "Self",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Druid",
      "Sorcerer",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/gust-of-wind",
    "material": "A legume seed."
  },
  "Haste": {
    "name": "Haste",
    "levelLabel": "3rd level",
    "description": [
      "Choose a willing creature that you can see within range. Until the spell ends, the target's speed is doubled, it gains a +2 bonus to AC, it has advantage on dexterity saving throws, and it gains an additional action on each of its turns. That action can be used only to take the Attack (one weapon attack only), Dash, Disengage, Hide, or Use an Object action.",
      "When the spell ends, the target can't move or take actions until after its next turn, as a wave of lethargy sweeps over it."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Transmutation",
    "duration": "Up to 1 minute",
    "castingTime": "1 action",
    "range": "30 feet",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Sorcerer",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/haste",
    "material": "A shaving of licorice root."
  },
  "Healing Word": {
    "name": "Healing Word",
    "levelLabel": "1st level",
    "description": [
      "A creature of your choice that you can see within range regains hit points equal to 1d4 + your spellcasting ability modifier. This spell has no effect on undead or constructs."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 2nd level or higher, the healing increases by 1d4 for each slot level above 1st."
    ],
    "rolls": "1d4 + MOD healing at spell slot level 1",
    "school": "Evocation",
    "duration": "Instantaneous",
    "castingTime": "1 bonus action",
    "range": "60 feet",
    "components": [
      "V"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Bard",
      "Cleric",
      "Druid"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/healing-word"
  },
  "Heat Metal": {
    "name": "Heat Metal",
    "levelLabel": "2nd level",
    "description": [
      "Choose a manufactured metal object, such as a metal weapon or a suit of heavy or medium metal armor, that you can see within range. You cause the object to glow red-hot. Any creature in physical contact with the object takes 2d8 fire damage when you cast the spell. Until the spell ends, you can use a bonus action on each of your subsequent turns to cause this damage again.",
      "If a creature is holding or wearing the object and takes the damage from it, the creature must succeed on a constitution saving throw or drop the object if it can. If it doesn't drop the object, it has disadvantage on attack rolls and ability checks until the start of your next turn."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 3rd level or higher, the damage increases by 1d8 for each slot level above 2nd."
    ],
    "rolls": "2d8 fire damage at spell slot level 2 | CON saving throw; success: other",
    "school": "Transmutation",
    "duration": "Up to 1 minute",
    "castingTime": "1 action",
    "range": "60 feet",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Bard",
      "Druid"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/heat-metal",
    "material": "A piece of iron and a flame."
  },
  "Hellish Rebuke": {
    "name": "Hellish Rebuke",
    "levelLabel": "1st level",
    "description": [
      "You point your finger, and the creature that damaged you is momentarily surrounded by hellish flames. The creature must make a dexterity saving throw. It takes 2d10 fire damage on a failed save, or half as much damage on a successful one."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 2nd level or higher, the damage increases by 1d10 for each slot level above 1st."
    ],
    "rolls": "2d10 fire damage at spell slot level 1 | DEX saving throw; success: half",
    "school": "Evocation",
    "duration": "Instantaneous",
    "castingTime": "1 reaction",
    "range": "60 feet",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Warlock"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/hellish-rebuke"
  },
  "Heroism": {
    "name": "Heroism",
    "levelLabel": "1st level",
    "description": [
      "A willing creature you touch is imbued with bravery. Until the spell ends, the creature is immune to being frightened and gains temporary hit points equal to your spellcasting ability modifier at the start of each of its turns. When the spell ends, the target loses any remaining temporary hit points from this spell."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Enchantment",
    "duration": "Up to 1 minute",
    "castingTime": "1 action",
    "range": "Touch",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Bard",
      "Paladin"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/heroism"
  },
  "Hold Person": {
    "name": "Hold Person",
    "levelLabel": "2nd level",
    "description": [
      "Choose a humanoid that you can see within range. The target must succeed on a wisdom saving throw or be paralyzed for the duration. At the end of each of its turns, the target can make another wisdom saving throw. On a success, the spell ends on the target."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 3rd level or higher, you can target one additional humanoid for each slot level above 2nd. The humanoids must be within 30 feet of each other when you target them."
    ],
    "rolls": "WIS saving throw; success: none",
    "school": "Enchantment",
    "duration": "Up to 1 minute",
    "castingTime": "1 action",
    "range": "60 feet",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Bard",
      "Cleric",
      "Druid",
      "Sorcerer",
      "Warlock",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/hold-person",
    "material": "A small, straight piece of iron."
  },
  "Hunter's Mark": {
    "name": "Hunter's Mark",
    "levelLabel": "1st level",
    "description": [
      "You choose a creature you can see within range and mystically mark it as your quarry. Until the spell ends, you deal an extra 1d6 damage to the target whenever you hit it with a weapon attack, and you have advantage on any Wisdom (Perception) or Wisdom (Survival) check you make to find it. If the target drops to 0 hit points before this spell ends, you can use a bonus action on a subsequent turn of yours to mark a new creature."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 3rd or 4th level, you can maintain your concentration on the spell for up to 8 hours. When you use a spell slot of 5th level or higher, you can maintain your concentration on the spell for up to 24 hours."
    ],
    "rolls": "Resolve using the rules text.",
    "school": "Divination",
    "duration": "Up to 1 hour",
    "castingTime": "1 bonus action",
    "range": "90 feet",
    "components": [
      "V"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Ranger"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/hunters-mark"
  },
  "Hypnotic Pattern": {
    "name": "Hypnotic Pattern",
    "levelLabel": "3rd level",
    "description": [
      "You create a twisting pattern of colors that weaves through the air inside a 30-foot cube within range. The pattern appears for a moment and vanishes. Each creature in the area who sees the pattern must make a wisdom saving throw. On a failed save, the creature becomes charmed for the duration. While charmed by this spell, the creature is incapacitated and has a speed of 0.",
      "The spell ends for an affected creature if it takes any damage or if someone else uses an action to shake the creature out of its stupor."
    ],
    "higherLevel": [],
    "rolls": "WIS saving throw; success: none",
    "school": "Illusion",
    "duration": "Up to 1 minute",
    "castingTime": "1 action",
    "range": "120 feet",
    "components": [
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Bard",
      "Sorcerer",
      "Warlock",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/hypnotic-pattern",
    "material": "A glowing stick of incense or a crystal vial filled with phosphorescent material."
  },
  "Identify": {
    "name": "Identify",
    "levelLabel": "1st level",
    "description": [
      "You choose one object that you must touch throughout the casting of the spell. If it is a magic item or some other magic-imbued object, you learn its properties and how to use them, whether it requires attunement to use, and how many charges it has, if any. You learn whether any spells are affecting the item and what they are. If the item was created by a spell, you learn which spell created it.",
      "If you instead touch a creature throughout the casting, you learn what spells, if any, are currently affecting it."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Divination",
    "duration": "Instantaneous",
    "castingTime": "1 minute",
    "range": "Touch",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": true,
    "concentration": false,
    "classes": [
      "Bard",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/identify",
    "material": "A pearl worth at least 100gp and an owl feather."
  },
  "Illusory Script": {
    "name": "Illusory Script",
    "levelLabel": "1st level",
    "description": [
      "You write on parchment, paper, or some other suitable writing material and imbue it with a potent illusion that lasts for the duration.",
      "To you and any creatures you designate when you cast the spell, the writing appears normal, written in your hand, and conveys whatever meaning you intended when you wrote the text. To all others, the writing appears as if it were written in an unknown or magical script that is unintelligible. Alternatively, you can cause the writing to appear to be an entirely different message, written in a different hand and language, though the language must be one you know.",
      "Should the spell be dispelled, the original script and the illusion both disappear.",
      "A creature with truesight can read the hidden message."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Illusion",
    "duration": "10 days",
    "castingTime": "1 minute",
    "range": "Touch",
    "components": [
      "S",
      "M"
    ],
    "ritual": true,
    "concentration": false,
    "classes": [
      "Bard",
      "Warlock",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/illusory-script",
    "material": "A lead-based ink worth at least 10gp, which this spell consumes."
  },
  "Inflict Wounds": {
    "name": "Inflict Wounds",
    "levelLabel": "1st level",
    "description": [
      "Make a melee spell attack against a creature you can reach. On a hit, the target takes 3d10 necrotic damage."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 2nd level or higher, the damage increases by 1d10 for each slot level above 1st."
    ],
    "rolls": "3d10 necrotic damage at spell slot level 1 | Melee spell attack",
    "school": "Necromancy",
    "duration": "Instantaneous",
    "castingTime": "1 action",
    "range": "Touch",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Cleric"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/inflict-wounds"
  },
  "Invisibility": {
    "name": "Invisibility",
    "levelLabel": "2nd level",
    "description": [
      "A creature you touch becomes invisible until the spell ends. Anything the target is wearing or carrying is invisible as long as it is on the target's person. The spell ends for a target that attacks or casts a spell."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 3rd level or higher, you can target one additional creature for each slot level above 2nd."
    ],
    "rolls": "Resolve using the rules text.",
    "school": "Illusion",
    "duration": "Up to 1 hour",
    "castingTime": "1 action",
    "range": "Touch",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Bard",
      "Sorcerer",
      "Warlock",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/invisibility",
    "material": "An eyelash encased in gum arabic."
  },
  "Jump": {
    "name": "Jump",
    "levelLabel": "1st level",
    "description": [
      "You touch a creature. The creature's jump distance is tripled until the spell ends."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Transmutation",
    "duration": "1 minute",
    "castingTime": "1 action",
    "range": "Touch",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Druid",
      "Ranger",
      "Sorcerer",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/jump",
    "material": "A grasshopper's hind leg."
  },
  "Knock": {
    "name": "Knock",
    "levelLabel": "2nd level",
    "description": [
      "Choose an object that you can see within range. The object can be a door, a box, a chest, a set of manacles, a padlock, or another object that contains a mundane or magical means that prevents access.",
      "A target that is held shut by a mundane lock or that is stuck or barred becomes unlocked, unstuck, or unbarred. If the object has multiple locks, only one of them is unlocked.",
      "If you choose a target that is held shut with arcane lock, that spell is suppressed for 10 minutes, during which time the target can be opened and shut normally.",
      "When you cast the spell, a loud knock, audible from as far away as 300 feet, emanates from the target object."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Transmutation",
    "duration": "Instantaneous",
    "castingTime": "1 action",
    "range": "60 feet",
    "components": [
      "V"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Bard",
      "Sorcerer",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/knock"
  },
  "Leomund's Tiny Hut": {
    "name": "Leomund's Tiny Hut",
    "levelLabel": "3rd level",
    "description": [
      "A 10-foot-radius immobile dome of force springs into existence around and above you and remains stationary for the duration. The spell ends if you leave its area.",
      "Nine creatures of Medium size or smaller can fit inside the dome with you. The spell fails if its area includes a larger creature or more than nine creatures. Creatures and objects within the dome when you cast this spell can move through it freely. All other creatures and objects are barred from passing through it. Spells and other magical effects can't extend through the dome or be cast through it. The atmosphere inside the space is comfortable and dry, regardless of the weather outside.",
      "Until the spell ends, you can command the interior to become dimly lit or dark. The dome is opaque from the outside, of any color you choose, but it is transparent from the inside."
    ],
    "higherLevel": [],
    "rolls": "10-foot sphere",
    "school": "Evocation",
    "duration": "8 hours",
    "castingTime": "1 minute",
    "range": "Self",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": true,
    "concentration": false,
    "classes": [
      "Bard",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/tiny-hut",
    "srdName": "Tiny Hut",
    "material": "A small crystal bead."
  },
  "Lesser Restoration": {
    "name": "Lesser Restoration",
    "levelLabel": "2nd level",
    "description": [
      "You touch a creature and can end either one disease or one condition afflicting it. The condition can be blinded, deafened, paralyzed, or poisoned."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Abjuration",
    "duration": "Instantaneous",
    "castingTime": "1 action",
    "range": "Touch",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Bard",
      "Cleric",
      "Druid",
      "Paladin",
      "Ranger"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/lesser-restoration"
  },
  "Levitate": {
    "name": "Levitate",
    "levelLabel": "2nd level",
    "description": [
      "One creature or object of your choice that you can see within range rises vertically, up to 20 feet, and remains suspended there for the duration. The spell can levitate a target that weighs up to 500 pounds. An unwilling creature that succeeds on a constitution saving throw is unaffected.",
      "The target can move only by pushing or pulling against a fixed object or surface within reach (such as a wall or a ceiling), which allows it to move as if it were climbing. You can change the target's altitude by up to 20 feet in either direction on your turn. If you are the target, you can move up or down as part of your move. Otherwise, you can use your action to move the target, which must remain within the spell's range.",
      "When the spell ends, the target floats gently to the ground if it is still aloft."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Transmutation",
    "duration": "Up to 10 minutes",
    "castingTime": "1 action",
    "range": "60 feet",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Sorcerer",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/levitate",
    "material": "Either a small leather loop or a piece of golden wire bent into a cup shape with a long shank on one end."
  },
  "Light": {
    "name": "Light",
    "levelLabel": "Cantrip",
    "description": [
      "You touch one object that is no larger than 10 feet in any dimension. Until the spell ends, the object sheds bright light in a 20-foot radius and dim light for an additional 20 feet. The light can be colored as you like. Completely covering the object with something opaque blocks the light. The spell ends if you cast it again or dismiss it as an action.",
      "If you target an object held or worn by a hostile creature, that creature must succeed on a dexterity saving throw to avoid the spell."
    ],
    "higherLevel": [],
    "rolls": "DEX saving throw; success: none",
    "school": "Evocation",
    "duration": "1 hour",
    "castingTime": "1 action",
    "range": "Touch",
    "components": [
      "V",
      "M"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Bard",
      "Cleric",
      "Sorcerer",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/light",
    "material": "A firefly or phosphorescent moss."
  },
  "Lightning Bolt": {
    "name": "Lightning Bolt",
    "levelLabel": "3rd level",
    "description": [
      "A stroke of lightning forming a line 100 feet long and 5 feet wide blasts out from you in a direction you choose. Each creature in the line must make a dexterity saving throw. A creature takes 8d6 lightning damage on a failed save, or half as much damage on a successful one.",
      "The lightning ignites flammable objects in the area that aren't being worn or carried."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 4th level or higher, the damage increases by 1d6 for each slot level above 3rd."
    ],
    "rolls": "8d6 lightning damage at spell slot level 3 | DEX saving throw; success: half | 100-foot line",
    "school": "Evocation",
    "duration": "Instantaneous",
    "castingTime": "1 action",
    "range": "Self",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Sorcerer",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/lightning-bolt",
    "material": "A bit of fur and a rod of amber, crystal, or glass."
  },
  "Locate Animals or Plants": {
    "name": "Locate Animals or Plants",
    "levelLabel": "2nd level",
    "description": [
      "Describe or name a specific kind of beast or plant. Concentrating on the voice of nature in your surroundings, you learn the direction and distance to the closest creature or plant of that kind within 5 miles, if any are present."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Divination",
    "duration": "Instantaneous",
    "castingTime": "1 action",
    "range": "Self",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": true,
    "concentration": false,
    "classes": [
      "Bard",
      "Druid",
      "Ranger"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/locate-animals-or-plants",
    "material": "A bit of fur from a bloodhound."
  },
  "Locate Object": {
    "name": "Locate Object",
    "levelLabel": "2nd level",
    "description": [
      "Describe or name an object that is familiar to you. You sense the direction to the object's location, as long as that object is within 1,000 feet of you. If the object is in motion, you know the direction of its movement.",
      "The spell can locate a specific object known to you, as long as you have seen it up close--within 30 feet--at least once. Alternatively, the spell can locate the nearest object of a particular kind, such as a certain kind of apparel, jewelry, furniture, tool, or weapon.",
      "This spell can't locate an object if any thickness of lead, even a thin sheet, blocks a direct path between you and the object."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Divination",
    "duration": "Up to 10 minutes",
    "castingTime": "1 action",
    "range": "Self",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Bard",
      "Cleric",
      "Druid",
      "Paladin",
      "Ranger",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/locate-object",
    "material": "A forked twig."
  },
  "Longstrider": {
    "name": "Longstrider",
    "levelLabel": "1st level",
    "description": [
      "You touch a creature. The target's speed increases by 10 feet until the spell ends."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 2nd level or higher, you can target one additional creature for each spell slot above 1st."
    ],
    "rolls": "Resolve using the rules text.",
    "school": "Transmutation",
    "duration": "1 hour",
    "castingTime": "1 action",
    "range": "Touch",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Bard",
      "Druid",
      "Ranger",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/longstrider",
    "material": "A pinch of dirt."
  },
  "Mage Armor": {
    "name": "Mage Armor",
    "levelLabel": "1st level",
    "description": [
      "You touch a willing creature who isn't wearing armor, and a protective magical force surrounds it until the spell ends. The target's base AC becomes 13 + its Dexterity modifier. The spell ends if the target dons armor or if you dismiss the spell as an action."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Abjuration",
    "duration": "8 hours",
    "castingTime": "1 action",
    "range": "Touch",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Sorcerer",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/mage-armor",
    "material": "A piece of cured leather."
  },
  "Mage Hand": {
    "name": "Mage Hand",
    "levelLabel": "Cantrip",
    "description": [
      "A spectral, floating hand appears at a point you choose within range. The hand lasts for the duration or until you dismiss it as an action. The hand vanishes if it is ever more than 30 feet away from you or if you cast this spell again.",
      "You can use your action to control the hand. You can use the hand to manipulate an object, open an unlocked door or container, stow or retrieve an item from an open container, or pour the contents out of a vial. You can move the hand up to 30 feet each time you use it.",
      "The hand can't attack, activate magic items, or carry more than 10 pounds."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Conjuration",
    "duration": "1 minute",
    "castingTime": "1 action",
    "range": "30 feet",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Bard",
      "Sorcerer",
      "Warlock",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/mage-hand"
  },
  "Magic Circle": {
    "name": "Magic Circle",
    "levelLabel": "3rd level",
    "description": [
      "You create a 10-foot radius, 20-foot-tall cylinder of magical energy centered on a point on the ground that you can see within range. Glowing runes appear whenever the cylinder intersects with the floor or other surface.",
      "Choose one or more of the following types of creatures: celestials, elementals, fey, fiends, or undead. The circle affects a creature of the chosen type in the following ways:",
      "- The creature can't willingly enter the cylinder by nonmagical means. If the creature tries to use teleportation or interplanar travel to do so, it must first succeed on a charisma saving throw.",
      "- The creature has disadvantage on attack rolls against targets within the cylinder.",
      "- Targets within the cylinder can't be charmed, frightened, or possessed by the creature.",
      "When you cast this spell, you can elect to cause its magic to operate in the reverse direction, preventing a creature of the specified type from leaving the cylinder and protecting targets outside it."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 4th level or higher, the duration increases by 1 hour for each slot level above 3rd."
    ],
    "rolls": "CHA saving throw; success: other | 10-foot cylinder",
    "school": "Abjuration",
    "duration": "1 hour",
    "castingTime": "1 minute",
    "range": "10 feet",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Cleric",
      "Paladin",
      "Warlock",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/magic-circle",
    "material": "Holy water or powdered silver and iron worth at least 100 gp, which the spell consumes."
  },
  "Magic Missile": {
    "name": "Magic Missile",
    "levelLabel": "1st level",
    "description": [
      "You create three glowing darts of magical force. Each dart hits a creature of your choice that you can see within range. A dart deals 1d4 + 1 force damage to its target. The darts all strike simultaneously, and you can direct them to hit one creature or several."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 2nd level or higher, the spell creates one more dart for each slot level above 1st."
    ],
    "rolls": "3d4 + 3 force damage at spell slot level 1",
    "school": "Evocation",
    "duration": "Instantaneous",
    "castingTime": "1 action",
    "range": "120 feet",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Sorcerer",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/magic-missile"
  },
  "Magic Mouth": {
    "name": "Magic Mouth",
    "levelLabel": "2nd level",
    "description": [
      "You plant a message to an object in the range of the spell. The message is verbalized when the trigger conditions are met. Choose an object that you see, and that is not worn or carried by another creature. Then say the message, which should not exceed 25 words but listening can take up to 10 minutes. Finally, establish the circumstances that trigger the spell to deliver your message.",
      "When these conditions are satisfied, a magical mouth appears on the object and it articulates the message imitating your voice, the same tone used during implantation of the message. If the selected object has a mouth or something that approaches such as the mouth of a statue, the magic mouth come alive at this point, giving the illusion that the words come from the mouth of the object.",
      "When you cast this spell, you may decide that the spell ends when the message is delivered or it can persist and repeat the message whenever circumstances occur.",
      "The triggering circumstance can be as general or as detailed as you like, though it must be based on visual or audible conditions that occur within 30 feet of the object. For example, you could instruct the mouth to speak when any creature moves within 30 feet of the object or when a silver bell rings within 30 feet of it."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Illusion",
    "duration": "Until dispelled",
    "castingTime": "1 minute",
    "range": "30 feet",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": true,
    "concentration": false,
    "classes": [
      "Bard",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/magic-mouth",
    "material": "A honeycomb and jade dust of at least 10 inches, the spell consumes."
  },
  "Magic Weapon": {
    "name": "Magic Weapon",
    "levelLabel": "2nd level",
    "description": [
      "You touch a nonmagical weapon. Until the spell ends, that weapon becomes a magic weapon with a +1 bonus to attack rolls and damage rolls."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 4th level or higher, the bonus increases to +2. When you use a spell slot of 6th level or higher, the bonus increases to +3."
    ],
    "rolls": "Resolve using the rules text.",
    "school": "Transmutation",
    "duration": "Up to 1 hour",
    "castingTime": "1 bonus action",
    "range": "Touch",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Paladin",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/magic-weapon"
  },
  "Major Image": {
    "name": "Major Image",
    "levelLabel": "3rd level",
    "description": [
      "You create the image of an object, a creature, or some other visible phenomenon that is no larger than a 20-foot cube. The image appears at a spot that you can see within range and lasts for the duration. It seems completely real, including sounds, smells, and temperature appropriate to the thing depicted. You can't create sufficient heat or cold to cause damage, a sound loud enough to deal thunder damage or deafen a creature, or a smell that might sicken a creature (like a troglodyte's stench).",
      "As long as you are within range of the illusion, you can use your action to cause the image to move to any other spot within range. As the image changes location, you can alter its appearance so that its movements appear natural for the image. For example, if you create an image of a creature and move it, you can alter the image so that it appears to be walking. Similarly, you can cause the illusion to make different sounds at different times, even making it carry on a conversation, for example.",
      "Physical interaction with the image reveals it to be an illusion, because things can pass through it. A creature that uses its action to examine the image can determine that it is an illusion with a successful Intelligence (Investigation) check against your spell save DC. If a creature discerns the illusion for what it is, the creature can see through the image, and its other sensory qualities become faint to the creature."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 6th level or higher, the spell lasts until dispelled, without requiring your concentration."
    ],
    "rolls": "Resolve using the rules text.",
    "school": "Illusion",
    "duration": "Up to 10 minutes",
    "castingTime": "1 action",
    "range": "120 feet",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Bard",
      "Sorcerer",
      "Warlock",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/major-image",
    "material": "A bit of fleece."
  },
  "Mass Healing Word": {
    "name": "Mass Healing Word",
    "levelLabel": "3rd level",
    "description": [
      "As you call out words of restoration, up to six creatures of your choice that you can see within range regain hit points equal to 1d4 + your spellcasting ability modifier. This spell has no effect on undead or constructs."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 4th level or higher, the healing increases by 1d4 for each slot level above 3rd."
    ],
    "rolls": "1d4 + MOD healing at spell slot level 3",
    "school": "Evocation",
    "duration": "Instantaneous",
    "castingTime": "1 bonus action",
    "range": "60 feet",
    "components": [
      "V"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Cleric"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/mass-healing-word"
  },
  "Meld into Stone": {
    "name": "Meld into Stone",
    "levelLabel": "3rd level",
    "description": [
      "You step into a stone object or surface large enough to fully contain your body, melding yourself and all the equipment you carry with the stone for the duration. Using your movement, you step into the stone at a point you can touch. Nothing of your presence remains visible or otherwise detectable by nonmagical senses.",
      "While merged with the stone, you can't see what occurs outside it, and any Wisdom (Perception) checks you make to hear sounds outside it are made with disadvantage. You remain aware of the passage of time and can cast spells on yourself while merged in the stone. You can use your movement to leave the stone where you entered it, which ends the spell. You otherwise can't move.",
      "Minor physical damage to the stone doesn't harm you, but its partial destruction or a change in its shape (to the extent that you no longer fit within it) expels you and deals 6d6 bludgeoning damage to you. The stone's complete destruction (or transmutation into a different substance) expels you and deals 50 bludgeoning damage to you. If expelled, you fall prone in an unoccupied space closest to where you first entered."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Transmutation",
    "duration": "8 hours",
    "castingTime": "1 action",
    "range": "Touch",
    "components": [
      "V",
      "S"
    ],
    "ritual": true,
    "concentration": false,
    "classes": [
      "Cleric"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/meld-into-stone",
    "srdName": "Meld Into Stone"
  },
  "Melf's Acid Arrow": {
    "name": "Melf's Acid Arrow",
    "levelLabel": "2nd level",
    "description": [
      "A shimmering green arrow streaks toward a target within range and bursts in a spray of acid. Make a ranged spell attack against the target. On a hit, the target takes 4d4 acid damage immediately and 2d4 acid damage at the end of its next turn. On a miss, the arrow splashes the target with acid for half as much of the initial damage and no damage at the end of its next turn."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 3rd level or higher, the damage (both initial and later) increases by 1d4 for each slot level above 2nd."
    ],
    "rolls": "4d4 acid damage at spell slot level 2 | Ranged spell attack",
    "school": "Evocation",
    "duration": "Instantaneous",
    "castingTime": "1 action",
    "range": "90 feet",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/acid-arrow",
    "srdName": "Acid Arrow",
    "material": "Powdered rhubarb leaf and an adder's stomach."
  },
  "Mending": {
    "name": "Mending",
    "levelLabel": "Cantrip",
    "description": [
      "This spell repairs a single break or tear in an object you touch, such as a broken key, a torn cloak, or a leaking wineskin. As long as the break or tear is no longer than 1 foot in any dimension, you mend it, leaving no trace of the former damage.",
      "This spell can physically repair a magic item or construct, but the spell can't restore magic to such an object."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Transmutation",
    "duration": "Instantaneous",
    "castingTime": "1 minute",
    "range": "Touch",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Cleric",
      "Bard",
      "Druid",
      "Sorcerer",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/mending",
    "material": "Two lodestones."
  },
  "Message": {
    "name": "Message",
    "levelLabel": "Cantrip",
    "description": [
      "You point your finger toward a creature within range and whisper a message. The target (and only the target) hears the message and can reply in a whisper that only you can hear.",
      "You can cast this spell through solid objects if you are familiar with the target and know it is beyond the barrier. Magical silence, 1 foot of stone, 1 inch of common metal, a thin sheet of lead, or 3 feet of wood blocks the spell. The spell doesn't have to follow a straight line and can travel freely around corners or through openings."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Transmutation",
    "duration": "1 round",
    "castingTime": "1 action",
    "range": "120 feet",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Bard",
      "Sorcerer",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/message",
    "material": "A short piece of copper wire."
  },
  "Minor Illusion": {
    "name": "Minor Illusion",
    "levelLabel": "Cantrip",
    "description": [
      "You create a sound or an image of an object within range that lasts for the duration. The illusion also ends if you dismiss it as an action or cast this spell again.",
      "If you create a sound, its volume can range from a whisper to a scream. It can be your voice, someone else's voice, a lion's roar, a beating of drums, or any other sound you choose. The sound continues unabated throughout the duration, or you can make discrete sounds at different times before the spell ends.",
      "If you create an image of an object--such as a chair, muddy footprints, or a small chest--it must be no larger than a 5-foot cube. The image can't create sound, light, smell, or any other sensory effect. Physical interaction with the image reveals it to be an illusion, because things can pass through it.",
      "If a creature uses its action to examine the sound or image, the creature can determine that it is an illusion with a successful Intelligence (Investigation) check against your spell save DC. If a creature discerns the illusion for what it is, the illusion becomes faint to the creature."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Illusion",
    "duration": "1 minute",
    "castingTime": "1 action",
    "range": "30 feet",
    "components": [
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Bard",
      "Sorcerer",
      "Warlock",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/minor-illusion",
    "material": "A bit of fleece."
  },
  "Mirror Image": {
    "name": "Mirror Image",
    "levelLabel": "2nd level",
    "description": [
      "Three illusory duplicates of yourself appear in your space. Until the spell ends, the duplicates move with you and mimic your actions, shifting position so it's impossible to track which image is real. You can use your action to dismiss the illusory duplicates.",
      "Each time a creature targets you with an attack during the spell's duration, roll a d20 to determine whether the attack instead targets one of your duplicates.",
      "If you have three duplicates, you must roll a 6 or higher to change the attack's target to a duplicate. With two duplicates, you must roll an 8 or higher. With one duplicate, you must roll an 11 or higher.",
      "A duplicate's AC equals 10 + your Dexterity modifier. If an attack hits a duplicate, the duplicate is destroyed. A duplicate can be destroyed only by an attack that hits it. It ignores all other damage and effects. The spell ends when all three duplicates are destroyed.",
      "A creature is unaffected by this spell if it can't see, if it relies on senses other than sight, such as blindsight, or if it can perceive illusions as false, as with truesight."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Illusion",
    "duration": "1 minute",
    "castingTime": "1 action",
    "range": "Self",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Sorcerer",
      "Warlock",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/mirror-image"
  },
  "Misty Step": {
    "name": "Misty Step",
    "levelLabel": "2nd level",
    "description": [
      "Briefly surrounded by silvery mist, you teleport up to 30 feet to an unoccupied space that you can see."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Conjuration",
    "duration": "Instantaneous",
    "castingTime": "1 bonus action",
    "range": "Self",
    "components": [
      "V"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Sorcerer",
      "Warlock",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/misty-step"
  },
  "Moonbeam": {
    "name": "Moonbeam",
    "levelLabel": "2nd level",
    "description": [
      "A silvery beam of pale light shines down in a 5-foot radius, 40-foot-high cylinder centered on a point within range. Until the spell ends, dim light fills the cylinder.",
      "When a creature enters the spell's area for the first time on a turn or starts its turn there, it is engulfed in ghostly flames that cause searing pain, and it must make a constitution saving throw. It takes 2d10 radiant damage on a failed save, or half as much damage on a successful one.",
      "A shapechanger makes its saving throw with disadvantage. If it fails, it also instantly reverts to its original form and can't assume a different form until it leaves the spell's light.",
      "On each of your turns after you cast this spell, you can use an action to move the beam 60 feet in any direction."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 3rd level or higher, the damage increases by 1dl0 for each slot level above 2nd."
    ],
    "rolls": "2d10 radiant damage at spell slot level 2 | CON saving throw; success: half | 5-foot cylinder",
    "school": "Evocation",
    "duration": "Up to 1 minute",
    "castingTime": "1 action",
    "range": "120 feet",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Druid"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/moonbeam",
    "material": "Several seeds of any moonseed plant and a piece of opalescent feldspar."
  },
  "Nondetection": {
    "name": "Nondetection",
    "levelLabel": "3rd level",
    "description": [
      "For the duration, you hide a target that you touch from divination magic. The target can be a willing creature or a place or an object no larger than 10 feet in any dimension. The target can't be targeted by any divination magic or perceived through magical scrying sensors."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Abjuration",
    "duration": "8 hours",
    "castingTime": "1 action",
    "range": "Touch",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Bard",
      "Ranger",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/nondetection",
    "material": "A pinch of diamond dust worth 25 gp sprinkled over the target, which the spell consumes."
  },
  "Nystul's Magic Aura": {
    "name": "Nystul's Magic Aura",
    "levelLabel": "2nd level",
    "description": [
      "You place an illusion on a creature or an object you touch so that divination spells reveal false information about it. The target can be a willing creature or an object that isn't being carried or worn by another creature.",
      "When you cast the spell, choose one or both of the following effects. The effect lasts for the duration. If you cast this spell on the same creature or object every day for 30 days, placing the same effect on it each time, the illusion lasts until it is dispelled.",
      "***False Aura.*** You change the way the target appears to spells and magical effects, such as detect magic, that detect magical auras. You can make a nonmagical object appear magical, a magical object appear nonmagical, or change the object's magical aura so that it appears to belong to a specific school of magic that you choose. When you use this effect on an object, you can make the false magic apparent to any creature that handles the item.",
      "***Mask.*** You change the way the target appears to spells and magical effects that detect creature types, such as a paladin's Divine Sense or the trigger of a symbol spell. You choose a creature type and other spells and magical effects treat the target as if it were a creature of that type or of that alignment."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Illusion",
    "duration": "24 hours",
    "castingTime": "1 action",
    "range": "Touch",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/arcanists-magic-aura",
    "srdName": "Arcanist's Magic Aura",
    "material": "A small square of silk."
  },
  "Pass without Trace": {
    "name": "Pass without Trace",
    "levelLabel": "2nd level",
    "description": [
      "A veil of shadows and silence radiates from you, masking you and your companions from detection. For the duration, each creature you choose within 30 feet of you (including you) has a +10 bonus to Dexterity (Stealth) checks and can't be tracked except by magical means. A creature that receives this bonus leaves behind no tracks or other traces of its passage."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Abjuration",
    "duration": "Up to 1 hour",
    "castingTime": "1 action",
    "range": "Self",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Druid",
      "Ranger"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/pass-without-trace",
    "srdName": "Pass Without Trace",
    "material": "Ashes from a burned leaf of mistletoe and a sprig of spruce."
  },
  "Phantom Steed": {
    "name": "Phantom Steed",
    "levelLabel": "3rd level",
    "description": [
      "A Large quasi-real, horselike creature appears on the ground in an unoccupied space of your choice within range. You decide the creature's appearance, but it is equipped with a saddle, bit, and bridle. Any of the equipment created by the spell vanishes in a puff of smoke if it is carried more than 10 feet away from the steed.",
      "For the duration, you or a creature you choose can ride the steed. The creature uses the statistics for a riding horse, except it has a speed of 100 feet and can travel 10 miles in an hour, or 13 miles at a fast pace. When the spell ends, the steed gradually fades, giving the rider 1 minute to dismount. The spell ends if you use an action to dismiss it or if the steed takes any damage."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Illusion",
    "duration": "1 hour",
    "castingTime": "1 minute",
    "range": "30 feet",
    "components": [
      "V",
      "S"
    ],
    "ritual": true,
    "concentration": false,
    "classes": [
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/phantom-steed"
  },
  "Plant Growth": {
    "name": "Plant Growth",
    "levelLabel": "3rd level",
    "description": [
      "This spell channels vitality into plants within a specific area. There are two possible uses for the spell, granting either immediate or long-term benefits.",
      "If you cast this spell using 1 action, choose a point within range. All normal plants in a 100-foot radius centered on that point become thick and overgrown. A creature moving through the area must spend 4 feet of movement for every 1 foot it moves.",
      "You can exclude one or more areas of any size within the spell's area from being affected.",
      "If you cast this spell over 8 hours, you enrich the land. All plants in a half-mile radius centered on a point within range become enriched for 1 year. The plants yield twice the normal amount of food when harvested."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Transmutation",
    "duration": "Instantaneous",
    "castingTime": "1 action",
    "range": "150 feet",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Bard",
      "Druid",
      "Ranger"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/plant-growth"
  },
  "Poison Spray": {
    "name": "Poison Spray",
    "levelLabel": "Cantrip",
    "description": [
      "You extend your hand toward a creature you can see within range and project a puff of noxious gas from your palm. The creature must succeed on a constitution saving throw or take 1d12 poison damage.",
      "This spell's damage increases by 1d12 when you reach 5th level (2d12), 11th level (3d12), and 17th level (4d12)."
    ],
    "higherLevel": [],
    "rolls": "1d12 poison damage at character level 1 | CON saving throw; success: none",
    "school": "Conjuration",
    "duration": "Instantaneous",
    "castingTime": "1 action",
    "range": "10 feet",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Sorcerer",
      "Warlock",
      "Wizard",
      "Druid"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/poison-spray"
  },
  "Prayer of Healing": {
    "name": "Prayer of Healing",
    "levelLabel": "2nd level",
    "description": [
      "Up to six creatures of your choice that you can see within range each regain hit points equal to 2d8 + your spellcasting ability modifier. This spell has no effect on undead or constructs."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 3rd level or higher, the healing increases by 1d8 for each slot level above 2nd."
    ],
    "rolls": "2d8 + MOD healing at spell slot level 2",
    "school": "Evocation",
    "duration": "Instantaneous",
    "castingTime": "10 minutes",
    "range": "30 feet",
    "components": [
      "V"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Cleric"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/prayer-of-healing"
  },
  "Prestidigitation": {
    "name": "Prestidigitation",
    "levelLabel": "Cantrip",
    "description": [
      "This spell is a minor magical trick that novice spellcasters use for practice. You create one of the following magical effects within 'range':",
      "You create an instantaneous, harmless sensory effect, such as a shower of sparks, a puff of wind, faint musical notes, or an odd odor.",
      "You instantaneously light or snuff out a candle, a torch, or a small campfire.",
      "You instantaneously clean or soil an object no larger than 1 cubic foot.",
      "You chill, warm, or flavor up to 1 cubic foot of nonliving material for 1 hour.",
      "You make a color, a small mark, or a symbol appear on an object or a surface for 1 hour.",
      "You create a nonmagical trinket or an illusory image that can fit in your hand and that lasts until the end of your next turn.",
      "If you cast this spell multiple times, you can have up to three of its non-instantaneous effects active at a time, and you can dismiss such an effect as an action."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Transmutation",
    "duration": "1 hour",
    "castingTime": "1 action",
    "range": "10 feet",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Bard",
      "Sorcerer",
      "Warlock",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/prestidigitation"
  },
  "Produce Flame": {
    "name": "Produce Flame",
    "levelLabel": "Cantrip",
    "description": [
      "A flickering flame appears in your hand. The flame remains there for the duration and harms neither you nor your equipment. The flame sheds bright light in a 10-foot radius and dim light for an additional 10 feet. The spell ends if you dismiss it as an action or if you cast it again.",
      "You can also attack with the flame, although doing so ends the spell. When you cast this spell, or as an action on a later turn, you can hurl the flame at a creature within 30 feet of you. Make a ranged spell attack. On a hit, the target takes 1d8 fire damage.",
      "This spell's damage increases by 1d8 when you reach 5th level (2d8), 11th level (3d8), and 17th level (4d8)."
    ],
    "higherLevel": [],
    "rolls": "1d8 fire damage at character level 1 | Ranged spell attack",
    "school": "Conjuration",
    "duration": "10 minutes",
    "castingTime": "1 action",
    "range": "Self",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Druid"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/produce-flame"
  },
  "Protection from Energy": {
    "name": "Protection from Energy",
    "levelLabel": "3rd level",
    "description": [
      "For the duration, the willing creature you touch has resistance to one damage type of your choice: acid, cold, fire, lightning, or thunder."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Abjuration",
    "duration": "Up to 1 hour",
    "castingTime": "1 action",
    "range": "Touch",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Cleric",
      "Druid",
      "Ranger",
      "Sorcerer",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/protection-from-energy",
    "srdName": "Protection From Energy"
  },
  "Protection from Evil and Good": {
    "name": "Protection from Evil and Good",
    "levelLabel": "1st level",
    "description": [
      "Until the spell ends, one willing creature you touch is protected against certain types of creatures: aberrations, celestials, elementals, fey, fiends, and undead.",
      "The protection grants several benefits. Creatures of those types have disadvantage on attack rolls against the target. The target also can't be charmed, frightened, or possessed by them. If the target is already charmed, frightened, or possessed by such a creature, the target has advantage on any new saving throw against the relevant effect."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Abjuration",
    "duration": "Up to 10 minutes",
    "castingTime": "1 action",
    "range": "Touch",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Cleric",
      "Paladin",
      "Warlock",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/protection-from-evil-and-good",
    "material": "Holy water or powdered silver and iron, which the spell consumes."
  },
  "Protection from Poison": {
    "name": "Protection from Poison",
    "levelLabel": "2nd level",
    "description": [
      "You touch a creature. If it is poisoned, you neutralize the poison. If more than one poison afflicts the target, you neutralize one poison that you know is present, or you neutralize one at random.",
      "For the duration, the target has advantage on saving throws against being poisoned, and it has resistance to poison damage."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Abjuration",
    "duration": "1 hour",
    "castingTime": "1 action",
    "range": "Touch",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Cleric",
      "Druid",
      "Paladin",
      "Ranger"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/protection-from-poison"
  },
  "Purify Food and Drink": {
    "name": "Purify Food and Drink",
    "levelLabel": "1st level",
    "description": [
      "All nonmagical food and drink within a 5-foot radius sphere centered on a point of your choice within range is purified and rendered free of poison and disease."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Transmutation",
    "duration": "Instantaneous",
    "castingTime": "1 action",
    "range": "10 feet",
    "components": [
      "V",
      "S"
    ],
    "ritual": true,
    "concentration": false,
    "classes": [
      "Cleric",
      "Druid",
      "Paladin"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/purify-food-and-drink"
  },
  "Ray of Enfeeblement": {
    "name": "Ray of Enfeeblement",
    "levelLabel": "2nd level",
    "description": [
      "A black beam of enervating energy springs from your finger toward a creature within range. Make a ranged spell attack against the target. On a hit, the target deals only half damage with weapon attacks that use Strength until the spell ends.",
      "At the end of each of the target's turns, it can make a constitution saving throw against the spell. On a success, the spell ends."
    ],
    "higherLevel": [],
    "rolls": "CON saving throw; success: none | Ranged spell attack",
    "school": "Necromancy",
    "duration": "Up to 1 minute",
    "castingTime": "1 action",
    "range": "60 feet",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Warlock",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/ray-of-enfeeblement"
  },
  "Ray of Frost": {
    "name": "Ray of Frost",
    "levelLabel": "Cantrip",
    "description": [
      "A frigid beam of blue-white light streaks toward a creature within range. Make a ranged spell attack against the target. On a hit, it takes 1d8 cold damage, and its speed is reduced by 10 feet until the start of your next turn.",
      "The spell's damage increases by 1d8 when you reach 5th level (2d8), 11th level (3d8), and 17th level (4d8)."
    ],
    "higherLevel": [],
    "rolls": "1d8 cold damage at character level 1 | Ranged spell attack",
    "school": "Evocation",
    "duration": "Instantaneous",
    "castingTime": "1 action",
    "range": "60 feet",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Sorcerer",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/ray-of-frost"
  },
  "Remove Curse": {
    "name": "Remove Curse",
    "levelLabel": "3rd level",
    "description": [
      "At your touch, all curses affecting one creature or object end. If the object is a cursed magic item, its curse remains, but the spell breaks its owner's attunement to the object so it can be removed or discarded."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Abjuration",
    "duration": "Instantaneous",
    "castingTime": "1 action",
    "range": "Touch",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Cleric",
      "Paladin",
      "Warlock",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/remove-curse"
  },
  "Resistance": {
    "name": "Resistance",
    "levelLabel": "Cantrip",
    "description": [
      "You touch one willing creature. Once before the spell ends, the target can roll a d4 and add the number rolled to one saving throw of its choice. It can roll the die before or after making the saving throw. The spell then ends."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Abjuration",
    "duration": "Up to 1 minute",
    "castingTime": "1 action",
    "range": "Touch",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Cleric",
      "Druid"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/resistance",
    "material": "A miniature cloak."
  },
  "Revivify": {
    "name": "Revivify",
    "levelLabel": "3rd level",
    "description": [
      "You touch a creature that has died within the last minute. That creature returns to life with 1 hit point. This spell can't return to life a creature that has died of old age, nor can it restore any missing body parts."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Conjuration",
    "duration": "Instantaneous",
    "castingTime": "1 action",
    "range": "Touch",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Cleric",
      "Paladin"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/revivify",
    "material": "Diamonds worth 300gp, which the spell consumes."
  },
  "Rope Trick": {
    "name": "Rope Trick",
    "levelLabel": "2nd level",
    "description": [
      "You touch a length of rope that is up to 60 feet long. One end of the rope then rises into the air until the whole rope hangs perpendicular to the ground. At the upper end of the rope, an invisible entrance opens to an extradimensional space that lasts until the spell ends.",
      "The extradimensional space can be reached by climbing to the top of the rope. The space can hold as many as eight Medium or smaller creatures. The rope can be pulled into the space, making the rope disappear from view outside the space.",
      "Attacks and spells can't cross through the entrance into or out of the extradimensional space, but those inside can see out of it as if through a 3-foot-by-5-foot window centered on the rope.",
      "Anything inside the extradimensional space drops out when the spell ends."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Transmutation",
    "duration": "1 hour",
    "castingTime": "1 action",
    "range": "Touch",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/rope-trick",
    "material": "Powdered corn extract and a twisted loop of parchment."
  },
  "Sacred Flame": {
    "name": "Sacred Flame",
    "levelLabel": "Cantrip",
    "description": [
      "Flame-like radiance descends on a creature that you can see within range. The target must succeed on a dexterity saving throw or take 1d8 radiant damage. The target gains no benefit from cover for this saving throw.",
      "The spell's damage increases by 1d8 when you reach 5th level (2d8), 11th level (3d8), and 17th level (4d8)."
    ],
    "higherLevel": [],
    "rolls": "1d8 radiant damage at character level 1 | DEX saving throw; success: none",
    "school": "Evocation",
    "duration": "Instantaneous",
    "castingTime": "1 action",
    "range": "60 feet",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Cleric"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/sacred-flame"
  },
  "Sanctuary": {
    "name": "Sanctuary",
    "levelLabel": "1st level",
    "description": [
      "You ward a creature within range against attack. Until the spell ends, any creature who targets the warded creature with an attack or a harmful spell must first make a wisdom saving throw. On a failed save, the creature must choose a new target or lose the attack or spell. This spell doesn't protect the warded creature from area effects, such as the explosion of a fireball.",
      "If the warded creature makes an attack or casts a spell that affects an enemy creature, this spell ends."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Abjuration",
    "duration": "1 minute",
    "castingTime": "1 bonus action",
    "range": "30 feet",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Cleric"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/sanctuary",
    "material": "A small silver mirror."
  },
  "Scorching Ray": {
    "name": "Scorching Ray",
    "levelLabel": "2nd level",
    "description": [
      "You create three rays of fire and hurl them at targets within range. You can hurl them at one target or several.",
      "Make a ranged spell attack for each ray. On a hit, the target takes 2d6 fire damage."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 3rd level or higher, you create one additional ray for each slot level above 2nd."
    ],
    "rolls": "2d6 fire damage at spell slot level 2",
    "school": "Evocation",
    "duration": "Instantaneous",
    "castingTime": "1 action",
    "range": "120 feet",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Sorcerer",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/scorching-ray"
  },
  "See Invisibility": {
    "name": "See Invisibility",
    "levelLabel": "2nd level",
    "description": [
      "For the duration of the spell, you see invisible creatures and objects as if they were visible, and you can see through Ethereal. The ethereal objects and creatures appear ghostly translucent."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Divination",
    "duration": "1 hour",
    "castingTime": "1 action",
    "range": "Self",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Bard",
      "Sorcerer",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/see-invisibility",
    "material": "A dash of talc and a small amount of silver powder."
  },
  "Sending": {
    "name": "Sending",
    "levelLabel": "3rd level",
    "description": [
      "You send a short message of twenty-five words or less to a creature with which you are familiar. The creature hears the message in its mind, recognizes you as the sender if it knows you, and can answer in a like manner immediately. The spell enables creatures with Intelligence scores of at least 1 to understand the meaning of your message.",
      "You can send the message across any distance and even to other planes of existence, but if the target is on a different plane than you, there is a 5 percent chance that the message doesn't arrive."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Evocation",
    "duration": "1 round",
    "castingTime": "1 action",
    "range": "Unlimited",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Bard",
      "Cleric",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/sending",
    "material": "A short piece of fine copper wire."
  },
  "Shatter": {
    "name": "Shatter",
    "levelLabel": "2nd level",
    "description": [
      "A sudden loud ringing noise, painfully intense, erupts from a point of your choice within range. Each creature in a 10-foot-radius sphere centered on that point must make a Constitution saving throw. A creature takes 3d8 thunder damage on a failed save, or half as much damage on a successful one. A creature made of inorganic material such as stone, crystal, or metal has disadvantage on this saving throw.",
      "A non-magical item that is not worn or carried also suffers damage if it is in the area of the spell."
    ],
    "higherLevel": [
      "When you cast this spell using a 3 or higher level spell slot, the damage of the spell increases by 1d8 for each level of higher spell slot 2."
    ],
    "rolls": "3d8 thunder damage at spell slot level 2 | CON saving throw; success: half | 10-foot sphere",
    "school": "Evocation",
    "duration": "Instantaneous",
    "castingTime": "1 action",
    "range": "60 feet",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Bard",
      "Sorcerer",
      "Warlock",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/shatter",
    "material": "A burst of mica."
  },
  "Shield": {
    "name": "Shield",
    "levelLabel": "1st level",
    "description": [
      "An invisible barrier of magical force appears and protects you. Until the start of your next turn, you have a +5 bonus to AC, including against the triggering attack, and you take no damage from magic missile."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Abjuration",
    "duration": "1 round",
    "castingTime": "1 reaction",
    "range": "Self",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Sorcerer",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/shield"
  },
  "Shield of Faith": {
    "name": "Shield of Faith",
    "levelLabel": "1st level",
    "description": [
      "A shimmering field appears and surrounds a creature of your choice within range, granting it a +2 bonus to AC for the duration."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Abjuration",
    "duration": "Up to 10 minutes",
    "castingTime": "1 bonus action",
    "range": "60 feet",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Cleric",
      "Paladin"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/shield-of-faith",
    "material": "A small parchment with a bit of holy text written on it."
  },
  "Shillelagh": {
    "name": "Shillelagh",
    "levelLabel": "Cantrip",
    "description": [
      "The wood of a club or a quarterstaff you are holding is imbued with nature's power. For the duration, you can use your spellcasting ability instead of Strength for the attack and damage rolls of melee attacks using that weapon, and the weapon's damage die becomes a d8. The weapon also becomes magical, if it isn't already. The spell ends if you cast it again or if you let go of the weapon."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Transmutation",
    "duration": "1 minute",
    "castingTime": "1 bonus action",
    "range": "Touch",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Druid"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/shillelagh",
    "material": "Mistletoe, a shamrock leaf, and a club or quarterstaff."
  },
  "Shocking Grasp": {
    "name": "Shocking Grasp",
    "levelLabel": "Cantrip",
    "description": [
      "Lightning springs from your hand to deliver a shock to a creature you try to touch. Make a melee spell attack against the target. You have advantage on the attack roll if the target is wearing armor made of metal. On a hit, the target takes 1d8 lightning damage, and it can't take reactions until the start of its next turn.",
      "The spell's damage increases by 1d8 when you reach 5th level (2d8), 11th level (3d8), and 17th level (4d8)."
    ],
    "higherLevel": [],
    "rolls": "1d8 lightning damage at character level 1 | Melee spell attack",
    "school": "Evocation",
    "duration": "Instantaneous",
    "castingTime": "1 action",
    "range": "Touch",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Sorcerer",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/shocking-grasp"
  },
  "Silence": {
    "name": "Silence",
    "levelLabel": "2nd level",
    "description": [
      "For the duration, no sound can be created within or pass through a 20-foot-radius sphere centered on a point you choose within range. Any creature or object entirely inside the sphere is immune to thunder damage, and creatures are deafened while entirely inside it.",
      "Casting a spell that includes a verbal component is impossible there."
    ],
    "higherLevel": [],
    "rolls": "20-foot sphere",
    "school": "Illusion",
    "duration": "Up to 10 minutes",
    "castingTime": "1 action",
    "range": "120 feet",
    "components": [
      "V",
      "S"
    ],
    "ritual": true,
    "concentration": true,
    "classes": [
      "Bard",
      "Cleric",
      "Ranger"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/silence"
  },
  "Silent Image": {
    "name": "Silent Image",
    "levelLabel": "1st level",
    "description": [
      "You create the image of an object, a creature, or some other visible phenomenon that is no larger than a 15-foot cube. The image appears at a spot within range and lasts for the duration. The image is purely visual; it isn't accompanied by sound, smell, or other sensory effects.",
      "You can use your action to cause the image to move to any spot within range. As the image changes location, you can alter its appearance so that its movements appear natural for the image. For example, if you create an image of a creature and move it, you can alter the image so that it appears to be walking.",
      "Physical interaction with the image reveals it to be an illusion, because things can pass through it. A creature that uses its action to examine the image can determine that it is an illusion with a successful Intelligence (Investigation) check against your spell save DC. If a creature discerns the illusion for what it is, the creature can see through the image."
    ],
    "higherLevel": [],
    "rolls": "15-foot cube",
    "school": "Illusion",
    "duration": "Up to 10 minutes",
    "castingTime": "1 action",
    "range": "60 feet",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Bard",
      "Sorcerer",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/silent-image",
    "material": "A bit of fleece."
  },
  "Sleep": {
    "name": "Sleep",
    "levelLabel": "1st level",
    "description": [
      "This spell sends creatures into a magical slumber. Roll 5d8; the total is how many hit points of creatures this spell can affect. Creatures within 20 feet of a point you choose within range are affected in ascending order of their current hit points (ignoring unconscious creatures).",
      "Starting with the creature that has the lowest current hit points, each creature affected by this spell falls unconscious until the spell ends, the sleeper takes damage, or someone uses an action to shake or slap the sleeper awake. Subtract each creature's hit points from the total before moving on to the creature with the next lowest hit points. A creature's hit points must be equal to or less than the remaining total for that creature to be affected.",
      "Undead and creatures immune to being charmed aren't affected by this spell."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 2nd level or higher, roll an additional 2d8 for each slot level above 1st."
    ],
    "rolls": "20-foot sphere",
    "school": "Enchantment",
    "duration": "1 minute",
    "castingTime": "1 action",
    "range": "90 feet",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Bard",
      "Sorcerer",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/sleep",
    "material": "A pinch of fine sand, rose petals, or a cricket."
  },
  "Sleet Storm": {
    "name": "Sleet Storm",
    "levelLabel": "3rd level",
    "description": [
      "Until the spell ends, freezing rain and sleet fall in a 20-foot-tall cylinder with a 40-foot radius centered on a point you choose within range. The area is heavily obscured, and exposed flames in the area are doused.",
      "The ground in the area is covered with slick ice, making it difficult terrain. When a creature enters the spell's area for the first time on a turn or starts its turn there, it must make a dexterity saving throw. On a failed save, it falls prone.",
      "If a creature is concentrating in the spell's area, the creature must make a successful constitution saving throw against your spell save DC or lose concentration."
    ],
    "higherLevel": [],
    "rolls": "40-foot cylinder",
    "school": "Conjuration",
    "duration": "Up to 1 minute",
    "castingTime": "1 action",
    "range": "150 feet",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Druid",
      "Sorcerer",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/sleet-storm",
    "material": "A pinch of dust and a few drops of water."
  },
  "Slow": {
    "name": "Slow",
    "levelLabel": "3rd level",
    "description": [
      "You alter time around up to six creatures of your choice in a 40-foot cube within range. Each target must succeed on a wisdom saving throw or be affected by this spell for the duration.",
      "An affected target's speed is halved, it takes a -2 penalty to AC and dexterity saving throws, and it can't use reactions. On its turn, it can use either an action or a bonus action, not both. Regardless of the creature's abilities or magic items, it can't make more than one melee or ranged attack during its turn.",
      "If the creature attempts to cast a spell with a casting time of 1 action, roll a d20. On an 11 or higher, the spell doesn't take effect until the creature's next turn, and the creature must use its action on that turn to complete the spell. If it can't, the spell is wasted.",
      "A creature affected by this spell makes another wisdom saving throw at the end of its turn. On a successful save, the effect ends for it."
    ],
    "higherLevel": [],
    "rolls": "WIS saving throw; success: none | 40-foot cube",
    "school": "Transmutation",
    "duration": "Up to 1 minute",
    "castingTime": "1 action",
    "range": "120 feet",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Sorcerer",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/slow",
    "material": "A drop of molasses."
  },
  "Spare the Dying": {
    "name": "Spare the Dying",
    "levelLabel": "Cantrip",
    "description": [
      "You touch a living creature that has 0 hit points. The creature becomes stable. This spell has no effect on undead or constructs."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Necromancy",
    "duration": "Instantaneous",
    "castingTime": "1 action",
    "range": "Touch",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Cleric"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/spare-the-dying"
  },
  "Speak with Animals": {
    "name": "Speak with Animals",
    "levelLabel": "1st level",
    "description": [
      "You gain the ability to comprehend and verbally communicate with beasts for the duration. The knowledge and awareness of many beasts is limited by their intelligence, but at a minimum, beasts can give you information about nearby locations and monsters, including whatever they can perceive or have perceived within the past day. You might be able to persuade a beast to perform a small favor for you, at the GM's discretion."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Divination",
    "duration": "10 minutes",
    "castingTime": "1 action",
    "range": "Self",
    "components": [
      "V",
      "S"
    ],
    "ritual": true,
    "concentration": false,
    "classes": [
      "Bard",
      "Druid",
      "Ranger"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/speak-with-animals"
  },
  "Speak with Dead": {
    "name": "Speak with Dead",
    "levelLabel": "3rd level",
    "description": [
      "You grant the semblance of life and intelligence to a corpse of your choice within range, allowing it to answer the questions you pose. The corpse must still have a mouth and can't be undead. The spell fails if the corpse was the target of this spell within the last 10 days.",
      "Until the spell ends, you can ask the corpse up to five questions. The corpse knows only what it knew in life, including the languages it knew. Answers are usually brief, cryptic, or repetitive, and the corpse is under no compulsion to offer a truthful answer if you are hostile to it or it recognizes you as an enemy. This spell doesn't return the creature's soul to its body, only its animating spirit. Thus, the corpse can't learn new information, doesn't comprehend anything that has happened since it died, and can't speculate about future events."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Necromancy",
    "duration": "10 minutes",
    "castingTime": "1 action",
    "range": "10 feet",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Bard",
      "Cleric"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/speak-with-dead",
    "material": "Burning incense."
  },
  "Speak with Plants": {
    "name": "Speak with Plants",
    "levelLabel": "3rd level",
    "description": [
      "You imbue plants within 30 feet of you with limited sentience and animation, giving them the ability to communicate with you and follow your simple commands. You can question plants about events in the spell's area within the past day, gaining information about creatures that have passed, weather, and other circumstances.",
      "You can also turn difficult terrain caused by plant growth (such as thickets and undergrowth) into ordinary terrain that lasts for the duration. Or you can turn ordinary terrain where plants are present into difficult terrain that lasts for the duration, causing vines and branches to hinder pursuers, for example.",
      "Plants might be able to perform other tasks on your behalf, at the GM's discretion. The spell doesn't enable plants to uproot themselves and move about, but they can freely move branches, tendrils, and stalks.",
      "If a plant creature is in the area, you can communicate with it as if you shared a common language, but you gain no magical ability to influence it.",
      "This spell can cause the plants created by the entangle spell to release a restrained creature."
    ],
    "higherLevel": [],
    "rolls": "30-foot sphere",
    "school": "Transmutation",
    "duration": "10 minutes",
    "castingTime": "1 action",
    "range": "Self",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Bard",
      "Druid",
      "Ranger"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/speak-with-plants"
  },
  "Spider Climb": {
    "name": "Spider Climb",
    "levelLabel": "2nd level",
    "description": [
      "Until the spell ends, one willing creature you touch gains the ability to move up, down, and across vertical surfaces and upside down along ceilings, while leaving its hands free. The target also gains a climbing speed equal to its walking speed."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Transmutation",
    "duration": "Up to 1 hour",
    "castingTime": "1 action",
    "range": "Touch",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Sorcerer",
      "Warlock",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/spider-climb",
    "material": "A drop of bitumen and a spider."
  },
  "Spike Growth": {
    "name": "Spike Growth",
    "levelLabel": "2nd level",
    "description": [
      "The ground in a 20-foot radius centered on a point within range twists and sprouts hard spikes and thorns. The area becomes difficult terrain for the duration. When a creature moves into or within the area, it takes 2d4 piercing damage for every 5 feet it travels.",
      "The transformation of the ground is camouflaged to look natural. Any creature that can't see the area at the time the spell is cast can make a Wisdom (Perception) check against your spell save DC to recognize the terrain as hazardous before entering it."
    ],
    "higherLevel": [],
    "rolls": "20-foot cylinder",
    "school": "Transmutation",
    "duration": "Up to 10 minutes",
    "castingTime": "1 action",
    "range": "150 feet",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Druid",
      "Ranger"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/spike-growth",
    "material": "Seven sharp thorns or seven small twigs, each sharpened to a point."
  },
  "Spirit Guardians": {
    "name": "Spirit Guardians",
    "levelLabel": "3rd level",
    "description": [
      "You call forth spirits to protect you. They flit around you to a distance of 15 feet for the duration. If you are good or neutral, their spectral form appears angelic or fey (your choice). If you are evil, they appear fiendish.",
      "When you cast this spell, you can designate any number of creatures you can see to be unaffected by it. An affected creature's speed is halved in the area, and when the creature enters the area for the first time on a turn or starts its turn there, it must make a wisdom saving throw. On a failed save, the creature takes 3d8 radiant damage (if you are good or neutral) or 3d8 necrotic damage (if you are evil). On a successful save, the creature takes half as much damage."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 4th level or higher, the damage increases by 1d8 for each slot level above 3rd."
    ],
    "rolls": "Resolve using the rules text.",
    "school": "Conjuration",
    "duration": "Up to 10 minutes",
    "castingTime": "1 action",
    "range": "Self",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Cleric"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/spirit-guardians",
    "material": "A holy symbol."
  },
  "Spiritual Weapon": {
    "name": "Spiritual Weapon",
    "levelLabel": "2nd level",
    "description": [
      "You create a floating, spectral weapon within range that lasts for the duration or until you cast this spell again. When you cast the spell, you can make a melee spell attack against a creature within 5 feet of the weapon. On a hit, the target takes force damage equal to 1d8 + your spellcasting ability modifier.",
      "As a bonus action on your turn, you can move the weapon up to 20 feet and repeat the attack against a creature within 5 feet of it.",
      "The weapon can take whatever form you choose. Clerics of deities who are associated with a particular weapon (as St. Cuthbert is known for his mace and Thor for his hammer) make this spell's effect resemble that weapon."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 3rd level or higher, the damage increases by 1d8 for every two slot levels above the 2nd."
    ],
    "rolls": "1d8 + MOD force damage at spell slot level 2 | Melee spell attack",
    "school": "Evocation",
    "duration": "1 minute",
    "castingTime": "1 bonus action",
    "range": "60 feet",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Cleric"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/spiritual-weapon"
  },
  "Stinking Cloud": {
    "name": "Stinking Cloud",
    "levelLabel": "3rd level",
    "description": [
      "You create a 20-foot-radius sphere of yellow, nauseating gas centered on a point within range. The cloud spreads around corners, and its area is heavily obscured. The cloud lingers in the air for the duration.",
      "Each creature that is completely within the cloud at the start of its turn must make a constitution saving throw against poison. On a failed save, the creature spends its action that turn retching and reeling. Creatures that don't need to breathe or are immune to poison automatically succeed on this saving throw.",
      "A moderate wind (at least 10 miles per hour) disperses the cloud after 4 rounds. A strong wind (at least 20 miles per hour) disperses it after 1 round."
    ],
    "higherLevel": [],
    "rolls": "CON saving throw; success: none | 20-foot sphere",
    "school": "Conjuration",
    "duration": "Up to 1 minute",
    "castingTime": "1 action",
    "range": "90 feet",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Bard",
      "Sorcerer",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/stinking-cloud",
    "material": "A rotten egg or several skunk cabbage leaves."
  },
  "Suggestion": {
    "name": "Suggestion",
    "levelLabel": "2nd level",
    "description": [
      "You suggest a course of activity (limited to a sentence or two) and magically influence a creature you can see within range that can hear and understand you. Creatures that can't be charmed are immune to this effect. The suggestion must be worded in such a manner as to make the course of action sound reasonable. Asking the creature to stab itself, throw itself onto a spear, immolate itself, or do some other obviously harmful act ends the spell.",
      "The target must make a wisdom saving throw. On a failed save, it pursues the course of action you described to the best of its ability. The suggested course of action can continue for the entire duration. If the suggested activity can be completed in a shorter time, the spell ends when the subject finishes what it was asked to do.",
      "You can also specify conditions that will trigger a special activity during the duration. For example, you might suggest that a knight give her warhorse to the first beggar she meets. If the condition isn't met before the spell expires, the activity isn't performed.",
      "If you or any of your companions damage the target, the spell ends."
    ],
    "higherLevel": [],
    "rolls": "WIS saving throw; success: none",
    "school": "Enchantment",
    "duration": "Up to 8 hours",
    "castingTime": "1 action",
    "range": "30 feet",
    "components": [
      "V",
      "M"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Bard",
      "Sorcerer",
      "Warlock",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/suggestion",
    "material": "A snake's tongue and either a bit of honeycomb or a drop of sweet oil."
  },
  "Tasha's Hideous Laughter": {
    "name": "Tasha's Hideous Laughter",
    "levelLabel": "1st level",
    "description": [
      "A creature of your choice that you can see within range perceives everything as hilariously funny and falls into fits of laughter if this spell affects it. The target must succeed on a wisdom saving throw or fall prone, becoming incapacitated and unable to stand up for the duration. A creature with an Intelligence score of 4 or less isn't affected.",
      "At the end of each of its turns, and each time it takes damage, the target can make another wisdom saving throw. The target had advantage on the saving throw if it's triggered by damage. On a success, the spell ends."
    ],
    "higherLevel": [],
    "rolls": "WIS saving throw; success: none",
    "school": "Enchantment",
    "duration": "Up to 1 minute",
    "castingTime": "1 action",
    "range": "30 feet",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Bard",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/hideous-laughter",
    "srdName": "Hideous Laughter",
    "material": "Tiny tarts and a feather that is waved in the air."
  },
  "Tenser's Floating Disk": {
    "name": "Tenser's Floating Disk",
    "levelLabel": "1st level",
    "description": [
      "This spell creates a circular, horizontal plane of force, 3 feet in diameter and 1 inch thick, that floats 3 feet above the ground in an unoccupied space of your choice that you can see within range. The disk remains for the duration, and can hold up to 500 pounds. If more weight is placed on it, the spell ends, and everything on the disk falls to the ground.",
      "The disk is immobile while you are within 20 feet of it. If you move more than 20 feet away from it, the disk follows you so that it remains within 20 feet of you. If can move across uneven terrain, up or down stairs, slopes and the like, but it can't cross an elevation change of 10 feet or more. For example, the disk can't move across a 10-foot-deep pit, nor could it leave such a pit if it was created at the bottom.",
      "If you move more than 100 feet away from the disk (typically because it can't move around an obstacle to follow you), the spell ends."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Conjuration",
    "duration": "1 hour",
    "castingTime": "1 action",
    "range": "30 feet",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": true,
    "concentration": false,
    "classes": [
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/floating-disk",
    "srdName": "Floating Disk",
    "material": "A drop of mercury."
  },
  "Thaumaturgy": {
    "name": "Thaumaturgy",
    "levelLabel": "Cantrip",
    "description": [
      "You manifest a minor wonder, a sign of supernatural power, within range. You create one of the following magical effects within range.",
      "- Your voice booms up to three times as loud as normal for 1 minute.",
      "- You cause flames to flicker, brighten, dim, or change color for 1 minute.",
      "- You cause harmless tremors in the ground for 1 minute.",
      "- You create an instantaneous sound that originates from a point of your choice within range, such as a rumble of thunder, the cry of a raven, or ominous whispers.",
      "- You instantaneously cause an unlocked door or window to fly open or slam shut.",
      "- You alter the appearance of your eyes for 1 minute.",
      "If you cast this spell multiple times, you can have up to three of its 1-minute effects active at a time, and you can dismiss such an effect as an action."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Transmutation",
    "duration": "1 minute",
    "castingTime": "1 action",
    "range": "30 feet",
    "components": [
      "V"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Cleric"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/thaumaturgy"
  },
  "Thunderwave": {
    "name": "Thunderwave",
    "levelLabel": "1st level",
    "description": [
      "A wave of thunderous force sweeps out from you. Each creature in a 15-foot cube originating from you must make a constitution saving throw. On a failed save, a creature takes 2d8 thunder damage and is pushed 10 feet away from you. On a successful save, the creature takes half as much damage and isn't pushed.",
      "In addition, unsecured objects that are completely within the area of effect are automatically pushed 10 feet away from you by the spell's effect, and the spell emits a thunderous boom audible out to 300 feet."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 2nd level or higher, the damage increases by 1d8 for each slot level above 1st."
    ],
    "rolls": "2d8 thunder damage at spell slot level 1 | CON saving throw; success: half | 15-foot cube",
    "school": "Evocation",
    "duration": "Instantaneous",
    "castingTime": "1 action",
    "range": "Self",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Bard",
      "Druid",
      "Sorcerer",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/thunderwave"
  },
  "Tongues": {
    "name": "Tongues",
    "levelLabel": "3rd level",
    "description": [
      "This spell grants the creature you touch the ability to understand any spoken language it hears. Moreover, when the target speaks, any creature that knows at least one language and can hear the target understands what it says."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Divination",
    "duration": "1 hour",
    "castingTime": "1 action",
    "range": "Touch",
    "components": [
      "V",
      "M"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Bard",
      "Cleric",
      "Sorcerer",
      "Warlock",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/tongues",
    "material": "A small clay model of a ziggurat."
  },
  "True Strike": {
    "name": "True Strike",
    "levelLabel": "Cantrip",
    "description": [
      "You extend your hand and point a finger at a target in range. Your magic grants you a brief insight into the target's defenses. On your next turn, you gain advantage on your first attack roll against the target, provided that this spell hasn't ended."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Divination",
    "duration": "Up to 1 round",
    "castingTime": "1 action",
    "range": "30 feet",
    "components": [
      "S"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Bard",
      "Sorcerer",
      "Warlock",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/true-strike"
  },
  "Unseen Servant": {
    "name": "Unseen Servant",
    "levelLabel": "1st level",
    "description": [
      "This spell creates an invisible, mindless, shapeless force that performs simple tasks at your command until the spell ends. The servant springs into existence in an unoccupied space on the ground within range. It has AC 10, 1 hit point, and a Strength of 2, and it can't attack. If it drops to 0 hit points, the spell ends.",
      "Once on each of your turns as a bonus action, you can mentally command the servant to move up to 15 feet and interact with an object. The servant can perform simple tasks that a human servant could do, such as fetching things, cleaning, mending, folding clothes, lighting fires, serving food, and pouring wine. Once you give the command, the servant performs the task to the best of its ability until it completes the task, then waits for your next command.",
      "If you command the servant to perform a task that would move it more than 60 feet away from you, the spell ends."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Conjuration",
    "duration": "1 hour",
    "castingTime": "1 action",
    "range": "60 feet",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": true,
    "concentration": false,
    "classes": [
      "Bard",
      "Warlock",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/unseen-servant",
    "material": "A piece of string and a bit of wood."
  },
  "Vampiric Touch": {
    "name": "Vampiric Touch",
    "levelLabel": "3rd level",
    "description": [
      "The touch of your shadow-wreathed hand can siphon life force from others to heal your wounds. Make a melee spell attack against a creature within your reach. On a hit, the target takes 3d6 necrotic damage, and you regain hit points equal to half the amount of necrotic damage dealt. Until the spell ends, you can make the attack again on each of your turns as an action."
    ],
    "higherLevel": [
      "When you cast this spell using a spell slot of 4th level or higher, the damage increases by 1d6 for each slot level above 3rd."
    ],
    "rolls": "3d6 necrotic damage at spell slot level 3 | Melee spell attack",
    "school": "Necromancy",
    "duration": "Up to 1 minute",
    "castingTime": "1 action",
    "range": "Self",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Warlock",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/vampiric-touch"
  },
  "Vicious Mockery": {
    "name": "Vicious Mockery",
    "levelLabel": "Cantrip",
    "description": [
      "You unleash a string of insults laced with subtle enchantments at a creature you can see within range. If the target can hear you (though it need not understand you), it must succeed on a wisdom saving throw or take 1d4 psychic damage and have disadvantage on the next attack roll it makes before the end of its next turn.",
      "This spell's damage increases by 1d4 when you reach 5th level (2d4), 11th level (3d4), and 17th level (4d4)."
    ],
    "higherLevel": [],
    "rolls": "1d4 psychic damage at character level 1 | WIS saving throw; success: none",
    "school": "Enchantment",
    "duration": "Instantaneous",
    "castingTime": "1 action",
    "range": "60 feet",
    "components": [
      "V"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Bard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/vicious-mockery"
  },
  "Warding Bond": {
    "name": "Warding Bond",
    "levelLabel": "2nd level",
    "description": [
      "This spell wards a willing creature you touch and creates a mystic connection between you and the target until the spell ends. While the target is within 60 feet of you, it gains a +1 bonus to AC and saving throws, and it has resistance to all damage. Also, each time it takes damage, you take the same amount of damage.",
      "The spell ends if you drop to 0 hit points or if you and the target become separated by more than 60 feet.",
      "It also ends if the spell is cast again on either of the connected creatures. You can also dismiss the spell as an action."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Abjuration",
    "duration": "1 hour",
    "castingTime": "1 action",
    "range": "Touch",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Cleric"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/warding-bond",
    "material": "A pair of platinum rings worth at least 50gp each, which you and the target must wear for the duration."
  },
  "Water Breathing": {
    "name": "Water Breathing",
    "levelLabel": "3rd level",
    "description": [
      "This spell gives a maximum of ten willing creatures within range and you can see, the ability to breathe underwater until the end of its term. Affected creatures also retain their normal breathing pattern."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Transmutation",
    "duration": "24 hours",
    "castingTime": "1 action",
    "range": "30 feet",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": true,
    "concentration": false,
    "classes": [
      "Druid",
      "Ranger",
      "Sorcerer",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/water-breathing",
    "material": "A short piece of reed or straw."
  },
  "Water Walk": {
    "name": "Water Walk",
    "levelLabel": "3rd level",
    "description": [
      "This spell grants the ability to move across any liquid surface--such as water, acid, mud, snow, quicksand, or lava--as if it were harmless solid ground (creatures crossing molten lava can still take damage from the heat). Up to ten willing creatures you can see within range gain this ability for the duration.",
      "If you target a creature submerged in a liquid, the spell carries the target to the surface of the liquid at a rate of 60 feet per round."
    ],
    "higherLevel": [],
    "rolls": "Resolve using the rules text.",
    "school": "Transmutation",
    "duration": "1 hour",
    "castingTime": "1 action",
    "range": "30 feet",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": true,
    "concentration": false,
    "classes": [
      "Cleric",
      "Druid",
      "Ranger",
      "Sorcerer"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/water-walk",
    "material": "A piece of cork."
  },
  "Web": {
    "name": "Web",
    "levelLabel": "2nd level",
    "description": [
      "You conjure a mass of thick, sticky webbing at a point of your choice within range. The webs fill a 20-foot cube from that point for the duration. The webs are difficult terrain and lightly obscure their area.",
      "If the webs aren't anchored between two solid masses (such as walls or trees) or layered across a floor, wall, or ceiling, the conjured web collapses on itself, and the spell ends at the start of your next turn. Webs layered over a flat surface have a depth of 5 feet.",
      "Each creature that starts its turn in the webs or that enters them during its turn must make a dexterity saving throw. On a failed save, the creature is restrained as long as it remains in the webs or until it breaks free.",
      "A creature restrained by the webs can use its action to make a Strength check against your spell save DC. If it succeeds, it is no longer restrained.",
      "The webs are flammable. Any 5-foot cube of webs exposed to fire burns away in 1 round, dealing 2d4 fire damage to any creature that starts its turn in the fire."
    ],
    "higherLevel": [],
    "rolls": "20-foot cube",
    "school": "Conjuration",
    "duration": "Up to 1 hour",
    "castingTime": "1 action",
    "range": "60 feet",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Sorcerer",
      "Wizard"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/web",
    "material": "A bit of spiderweb."
  },
  "Wind Wall": {
    "name": "Wind Wall",
    "levelLabel": "3rd level",
    "description": [
      "A wall of strong wind rises from the ground at a point you choose within range. You can make the wall up to 50 feet long, 15 feet high, and 1 foot thick. You can shape the wall in any way you choose so long as it makes one continuous path along the ground. The wall lasts for the duration.",
      "When the wall appears, each creature within its area must make a strength saving throw. A creature takes 3d8 bludgeoning damage on a failed save, or half as much damage on a successful one.",
      "The strong wind keeps fog, smoke, and other gases at bay. Small or smaller flying creatures or objects can't pass through the wall. Loose, lightweight materials brought into the wall fly upward. Arrows, bolts, and other ordinary projectiles launched at targets behind the wall are deflected upward and automatically miss. (Boulders hurled by giants or siege engines, and similar projectiles, are unaffected.) Creatures in gaseous form can't pass through it."
    ],
    "higherLevel": [],
    "rolls": "3d8 bludgeoning damage at spell slot level 3 | STR saving throw; success: half | 50-foot line",
    "school": "Evocation",
    "duration": "Up to 1 minute",
    "castingTime": "1 action",
    "range": "120 feet",
    "components": [
      "V",
      "S",
      "M"
    ],
    "ritual": false,
    "concentration": true,
    "classes": [
      "Druid",
      "Ranger"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/wind-wall",
    "material": "A tiny fan and a feather of exotic origin."
  },
  "Zone of Truth": {
    "name": "Zone of Truth",
    "levelLabel": "2nd level",
    "description": [
      "You create a magical zone that guards against deception in a 15-foot-radius sphere centered on a point of your choice within range. Until the spell ends, a creature that enters the spell's area for the first time on a turn or starts its turn there must make a Charisma saving throw. On a failed save, a creature can't speak a deliberate lie while in the radius. You know whether each creature succeeds or fails on its saving throw.",
      "An affected creature is aware of the spell and can thus avoid answering questions to which it would normally respond with a lie. Such a creature can remain evasive in its answers as long as it remains within the boundaries of the truth."
    ],
    "higherLevel": [],
    "rolls": "15-foot sphere",
    "school": "Enchantment",
    "duration": "10 minutes",
    "castingTime": "1 action",
    "range": "60 feet",
    "components": [
      "V",
      "S"
    ],
    "ritual": false,
    "concentration": false,
    "classes": [
      "Bard",
      "Cleric",
      "Paladin"
    ],
    "sourceUrl": "https://www.dnd5eapi.co/api/2014/spells/zone-of-truth"
  }
};

export function spellRuleDetailsFor(spell: string): SpellRuleProfile | undefined {
  return srdSpellDetails[spell.trim()];
}

export function hasSrdSpellRuleDetails(spell: string): boolean {
  return Boolean(spellRuleDetailsFor(spell));
}
