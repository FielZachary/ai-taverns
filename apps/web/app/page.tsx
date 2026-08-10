import Link from "next/link";
import { publicSeoPages } from "@/lib/public-seo-pages";
import { siteIdentity } from "@/lib/site-identity";
import { trustPages } from "@/lib/trust-pages";

const siteJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://aitaverns.com/#organization",
      name: siteIdentity.name,
      url: siteIdentity.url,
      logo: siteIdentity.logo,
      description: siteIdentity.description,
      sameAs: siteIdentity.sameAs,
      subjectOf: siteIdentity.subjectOf.map((url) => ({
        "@type": "WebPage",
        url
      }))
    },
    {
      "@type": "WebSite",
      "@id": "https://aitaverns.com/#website",
      url: "https://aitaverns.com/",
      name: "AI Taverns",
      alternateName: ["AI Taverns", "AITaverns"],
      publisher: {
        "@id": "https://aitaverns.com/#organization"
      },
      description:
        "AI Taverns is an AI dungeon master for solo and multiplayer D&D-style tabletop adventures.",
      inLanguage: "en-US",
      keywords:
        "AI Taverns, AI dungeon master, AI DM, D&D AI, solo D&D, tabletop RPG AI"
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://aitaverns.com/#app",
      name: "AI Taverns",
      applicationCategory: "GameApplication",
      operatingSystem: "Web",
      url: "https://aitaverns.com/",
      publisher: {
        "@id": "https://aitaverns.com/#organization"
      },
      description:
        "Play D&D-style tabletop adventures with an AI dungeon master that remembers your campaign, asks for rolls, and tracks consequences.",
      genre: "Tabletop role-playing game",
      isAccessibleForFree: true,
      keywords:
        "AI Taverns, AI dungeon master, AI DM, D&D-style adventures, solo tabletop RPG, multiplayer tabletop RPG",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD"
      }
    }
  ]
};

const pillars = [
  {
    label: "The Table",
    title: "A DM that challenges bad ideas",
    description:
      "Try anything, but not everything works. AI Taverns weighs the world, the stakes, and your character before answering."
  },
  {
    label: "The Campaign",
    title: "A story with memory and consequences",
    description:
      "Choices stick. Allies remember. Enemies adapt. The campaign moves forward because the world is keeping score."
  },
  {
    label: "The Company",
    title: "Solo now, party later",
    description:
      "Play a full D&D-style campaign on your own, then bring friends in when the table gets crowded."
  }
];

const scenarios = [
  {
    title: "5e Rules, Ready",
    author: "The Rules",
    description:
      "Ability checks, saves, attacks, and consequences stay close to familiar D&D rhythm without making you manage the whole table."
  },
  {
    title: "Your D&D Fix",
    author: "The Empty Chair",
    description:
      "When the group chat stalls or the next session slips, AI Taverns keeps a campaign moving whenever you are ready to play."
  },
  {
    title: "No Party Required",
    author: "The Table",
    description:
      "Get the feel of a real adventure between party nights, with a DM that tracks the scene, remembers the stakes, and calls for rolls."
  }
];

export default function HomePage() {
  return (
    <main className="landing-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd) }}
      />
      <section className="landing-hero" aria-labelledby="landing-title">
        <img
          className="landing-background"
          src="/landing/burial-rite-hero.jpg"
          alt=""
          aria-hidden="true"
        />
        <div className="landing-scrim" />

        <header className="landing-nav" aria-label="Primary navigation">
          <Link className="landing-brand" href="/">
            AI Taverns
          </Link>
          <nav>
            <Link href="/about">About</Link>
            <Link href="/ai-dungeon-master">AI DM</Link>
            <Link href="/contact">Contact</Link>
            <Link href="/play">Play</Link>
            <Link href="/login">Sign in</Link>
          </nav>
        </header>

        <div className="landing-hero-copy">
          <p className="landing-kicker">Text-based tabletop adventures</p>
          <h1 id="landing-title">
            AI Taverns is a dungeon master that <span>actually</span> remembers.
          </h1>
          <p className="landing-lede">
            Sit down, play, and let AI Taverns direct a masterfully orchestrated
            campaign for you to play in. No fuss. No friction. Just some pure
            D&amp;D.
          </p>
          <div className="landing-actions" aria-label="Start playing">
            <Link className="landing-button landing-button-primary" href="/play">
              Play online free
            </Link>
            <Link className="landing-button landing-button-secondary" href="/login">
              Save your story
            </Link>
          </div>
        </div>

        <span className="landing-scroll-cue" aria-hidden="true">
          Scroll
        </span>
      </section>

      <section className="landing-section landing-gameplay" aria-labelledby="gameplay-title">
        <p className="landing-section-label">Gameplay</p>
        <h2 id="gameplay-title">
          No getting pushed around. AI Taverns knows when to say no.
        </h2>
        <p className="landing-section-lede">
          AI Taverns is built for real play, not wish fulfillment. Say what you
          do, and the world answers with stakes, limits, consequences, and
          openings worth chasing.
        </p>

        <div className="landing-pillars" aria-label="What AI Taverns offers">
          {pillars.map((pillar) => (
            <article key={pillar.title}>
              <p className="landing-pillar-label">{pillar.label}</p>
              <h3>{pillar.title}</h3>
              <p>{pillar.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section landing-scenarios" aria-labelledby="scenario-title">
        <p className="landing-section-label">Rules & 5e</p>
        <h2 id="scenario-title">
          Get your D&D fix when your real party is not available.
        </h2>
        <div className="landing-scenario-grid">
          {scenarios.map((scenario) => (
            <article key={scenario.title}>
              <h3>{scenario.title}</h3>
              <p className="landing-author">By {scenario.author}</p>
              <p>{scenario.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section landing-resources" aria-labelledby="resources-title">
        <p className="landing-section-label">Guides</p>
        <h2 id="resources-title">Learn what AI Taverns is built to run.</h2>
        <p className="landing-section-lede">
          Explore how AI Taverns approaches AI dungeon mastering, solo D&amp;D-style
          play, and text-based tabletop RPG campaigns.
        </p>
        <div className="landing-resource-grid">
          {publicSeoPages.map((page) => (
            <Link key={page.path} href={page.path}>
              <span>{page.eyebrow}</span>
              <strong>{page.title}</strong>
              <small>{page.description}</small>
            </Link>
          ))}
        </div>
      </section>

      <section className="landing-final" aria-labelledby="final-title">
        <h2 id="final-title">The fire is lit. The chair is empty.</h2>
        <Link className="landing-button landing-button-primary" href="/play">
          Enter the tavern
        </Link>
      </section>

      <footer className="landing-footer">
        <span>AI Taverns</span>
        <nav aria-label="Public pages">
          {[...publicSeoPages, ...trustPages].map((page) => (
            <Link key={page.path} href={page.path}>
              {page.eyebrow}
            </Link>
          ))}
        </nav>
      </footer>
    </main>
  );
}
