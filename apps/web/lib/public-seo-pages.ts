export type PublicSeoPage = {
  path: string;
  title: string;
  description: string;
  eyebrow: string;
  h1: string;
  lede: string;
  ctaLabel: string;
  sections: Array<{
    title: string;
    body: string;
  }>;
  highlights: string[];
};

export const publicSeoPages: PublicSeoPage[] = [
  {
    path: "/about",
    title: "About AI Taverns",
    description:
      "AI Taverns is an AI dungeon master for solo and multiplayer D&D-style tabletop adventures with campaign memory, dice rolls, and consequences.",
    eyebrow: "About AI Taverns",
    h1: "A tavern table that waits for your next turn.",
    lede:
      "AI Taverns is built for players who want the feel of a tabletop campaign without waiting for a group chat to align. Sit down, describe what your character does, and play a D&D-style adventure with an AI dungeon master that remembers the story.",
    ctaLabel: "Start an adventure",
    sections: [
      {
        title: "What AI Taverns Is",
        body:
          "AI Taverns is a text-based fantasy tabletop RPG experience. It gives you an AI DM, a persistent campaign, character context, dice-driven uncertainty, and a world that reacts to what you try."
      },
      {
        title: "Why It Exists",
        body:
          "The best D&D nights are hard to schedule. AI Taverns is for the empty-chair moments: when your party cannot meet, when you want to test a character, or when you want a campaign that is ready right now."
      },
      {
        title: "How It Should Feel",
        body:
          "The goal is not wish fulfillment. A good adventure has risk, limits, and consequence. AI Taverns should remember what mattered, call for rolls when the stakes demand it, and let the world push back."
      }
    ],
    highlights: [
      "AI dungeon master",
      "Solo D&D-style adventures",
      "Campaign memory",
      "Dice rolls and consequences"
    ]
  },
  {
    path: "/ai-dungeon-master",
    title: "AI Dungeon Master for D&D-Style Adventures",
    description:
      "Play with an AI dungeon master that remembers your campaign, asks for dice rolls, tracks consequences, and keeps a D&D-style adventure moving.",
    eyebrow: "AI Dungeon Master",
    h1: "An AI dungeon master that remembers more than your last prompt.",
    lede:
      "AI Taverns gives you an AI DM for text-based D&D-style play. It runs scenes, answers actions, asks for rolls, tracks consequences, and keeps the campaign moving when you are ready to play.",
    ctaLabel: "Play with the AI DM",
    sections: [
      {
        title: "A DM With Memory",
        body:
          "A tabletop session works because the world remembers. AI Taverns is designed around campaign continuity, so choices, allies, enemies, and unresolved stakes can keep mattering after the moment passes."
      },
      {
        title: "Dice When The Stakes Matter",
        body:
          "Not every action should succeed because it sounds cool. The AI dungeon master can call for rolls, frame risk, and turn uncertain choices into moments that feel closer to tabletop play."
      },
      {
        title: "Consequences Over Wish Fulfillment",
        body:
          "AI Taverns is meant to challenge bad plans, reward clever ones, and keep the fiction grounded. The best AI DM is not just agreeable; it is fair, reactive, and willing to say no."
      }
    ],
    highlights: ["AI DM", "Campaign continuity", "Dice checks", "World state"]
  },
  {
    path: "/solo-dnd",
    title: "Solo D&D-Style Adventures Online",
    description:
      "Play solo D&D-style adventures online with AI Taverns, a text-based AI dungeon master for campaign play between tabletop sessions.",
    eyebrow: "Solo D&D-Style Play",
    h1: "Play a solo D&D-style campaign when the table is empty.",
    lede:
      "AI Taverns is for the night when you want to play but the party cannot meet. Create a character, enter the world, and let an AI dungeon master run a solo tabletop adventure around your choices.",
    ctaLabel: "Play solo",
    sections: [
      {
        title: "No Schedule Required",
        body:
          "Solo tabletop play should be easy to start. AI Taverns lets you jump into a campaign without preparing a module, recruiting a party, or waiting for everyone to be free."
      },
      {
        title: "A Campaign, Not A One-Off Prompt",
        body:
          "The experience is built around ongoing adventures. Your character can make choices, face consequences, and return to a story that has already started to take shape."
      },
      {
        title: "For Between-Session Play",
        body:
          "AI Taverns is not trying to replace a great table with friends. It gives tabletop players a way to keep adventuring when the real session is still days away."
      }
    ],
    highlights: [
      "Solo tabletop RPG",
      "D&D-style campaign",
      "Play online",
      "No party required"
    ]
  },
  {
    path: "/tabletop-rpg-ai",
    title: "Tabletop RPG AI for Text-Based Campaigns",
    description:
      "Explore AI Taverns, a tabletop RPG AI for text-based fantasy campaigns with an AI dungeon master, character context, rolls, and consequences.",
    eyebrow: "Tabletop RPG AI",
    h1: "Tabletop RPG AI should feel like a world, not a chatbot.",
    lede:
      "AI Taverns uses AI to run text-based fantasy tabletop adventures where character choices, dice rolls, memory, and consequences all matter.",
    ctaLabel: "Enter the tavern",
    sections: [
      {
        title: "Built Around Play",
        body:
          "A tabletop RPG AI has to do more than continue a story. It needs to frame scenes, understand character intent, introduce pressure, and keep the adventure moving turn by turn."
      },
      {
        title: "Reactive Fantasy Worlds",
        body:
          "AI Taverns is aimed at campaign play where NPCs, places, threats, and decisions can carry forward. The world should respond to player action instead of resetting every exchange."
      },
      {
        title: "AI As The Table Helper",
        body:
          "The promise of tabletop RPG AI is availability. It can make solo play smoother, help players experiment with characters, and keep fantasy adventures accessible whenever the mood strikes."
      }
    ],
    highlights: [
      "Text-based RPG",
      "Fantasy campaign AI",
      "Interactive storytelling",
      "Tabletop adventure"
    ]
  }
];

export const publicSeoPageByPath = Object.fromEntries(
  publicSeoPages.map((page) => [page.path, page])
) as Record<string, PublicSeoPage>;
