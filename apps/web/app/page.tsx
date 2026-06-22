import Link from "next/link";

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
          src="/landing/tavern-dragon.jpg"
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
            A fantasy tavern where every rumor becomes a campaign.
          </h1>
          <div className="landing-actions" aria-label="Start playing">
            <Link className="landing-button landing-button-primary" href="/play">
              Play online free
            </Link>
            <Link className="landing-button landing-button-secondary" href="/login">
              Save your story
            </Link>
          </div>
        </div>

        <span className="landing-scroll-cue">SCROLL</span>
      </section>

      <section className="landing-section" aria-labelledby="gameplay-title">
        <p className="landing-section-label">GAMEPLAY</p>
        <h2 id="gameplay-title">No railroad. No waiting room. Just the next choice.</h2>
        <p>
          Start with a scene, speak in your own voice, and let the AI dungeon master
          answer with consequences, characters, and trouble worth leaning into.
        </p>

        <div className="landing-steps" aria-label="How AI Taverns works">
          <article>
            <span>1</span>
            <h3>Choose the spark</h3>
            <p>Begin from a tavern rumor, a custom idea, or a campaign already in motion.</p>
          </article>
          <article>
            <span>2</span>
            <h3>Take the action</h3>
            <p>Say what you do, ask what you notice, or push the scene somewhere strange.</p>
          </article>
          <article>
            <span>3</span>
            <h3>Keep the tale</h3>
            <p>Return to your adventures and build a living campaign one turn at a time.</p>
          </article>
        </div>
      </section>

      <section className="landing-section landing-scenarios" aria-labelledby="scenario-title">
        <h2 id="scenario-title">Try a table rumor</h2>
        <div className="landing-scenario-grid">
          {scenarios.map((scenario) => (
            <article key={scenario.title}>
              <h3>{scenario.title}</h3>
              <p className="landing-author">By {scenario.author}</p>
              <p>{scenario.description}</p>
            </article>
          ))}
        </div>
        <Link className="landing-button landing-button-primary" href="/play">
          Enter the tavern
        </Link>
      </section>
    </main>
  );
}
