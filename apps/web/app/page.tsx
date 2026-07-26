import Link from "next/link";

const pillars = [
  {
    label: "The Table",
    title: "An AI dungeon master that answers in consequences",
    description:
      "Speak in your own voice. The world responds with characters, complications, and trouble worth leaning into."
  },
  {
    label: "The Campaign",
    title: "Stories that remember what you did",
    description:
      "Every session builds on the last. Your choices persist, your allies age, and your debts come due."
  },
  {
    label: "The Company",
    title: "Play alone or gather a party",
    description:
      "Run a solo tale by candlelight or invite friends to the same table and let the rumor grow between you."
  }
];

const scenarios = [
  {
    title: "Moonlit Parley",
    author: "The Barmaid",
    description:
      "A masked envoy has booked the dragon alcove, and every toast in the room sounds like a coded threat."
  },
  {
    title: "The Cellar Below",
    author: "Old Rusk",
    description:
      "Something under the ale barrels is answering questions in voices it has no right to know."
  },
  {
    title: "Crown of Ash",
    author: "The Hearth",
    description:
      "A royal heir arrives soaked in rain, carrying a broken crown and a story that keeps changing."
  }
];

export default function HomePage() {
  return (
    <main className="landing-page">
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
            <Link href="/play">Play</Link>
            <Link href="/login">Sign in</Link>
          </nav>
        </header>

        <div className="landing-hero-copy">
          <p className="landing-kicker">AI-powered tabletop adventures</p>
          <h1 id="landing-title">
            A dungeon master that <span>actually</span> remembers.
          </h1>
          <p className="landing-lede">
            Sit down, speak, and let an AI dungeon master carry your story into
            the dark. No rulebooks. No waiting room. Just the next choice.
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

      <section className="landing-section" aria-labelledby="gameplay-title">
        <p className="landing-section-label">Gameplay</p>
        <h2 id="gameplay-title">No railroad. No waiting room. Just the next choice.</h2>
        <p className="landing-section-lede">
          Start with a scene, speak in your own voice, and let the AI dungeon
          master answer with consequences, characters, and trouble worth leaning
          into.
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
        <p className="landing-section-label">Table Rumors</p>
        <h2 id="scenario-title">Three doors are already open.</h2>
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

      <section className="landing-final" aria-labelledby="final-title">
        <h2 id="final-title">The fire is lit. The chair is empty.</h2>
        <Link className="landing-button landing-button-primary" href="/play">
          Enter the tavern
        </Link>
      </section>

      <footer className="landing-footer">
        <span>AI Taverns</span>
        <span>An AI dungeon master at a table that remembers.</span>
      </footer>
    </main>
  );
}
