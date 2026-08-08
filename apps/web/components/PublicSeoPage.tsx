import Link from "next/link";
import type { PublicSeoPage } from "@/lib/public-seo-pages";

type PublicSeoPageProps = {
  page: PublicSeoPage;
};

export function PublicSeoPage({ page }: PublicSeoPageProps) {
  return (
    <main className="seo-page">
      <header className="landing-nav seo-nav" aria-label="Primary navigation">
        <Link className="landing-brand" href="/">
          AI Taverns
        </Link>
        <nav>
          <Link href="/about">About</Link>
          <Link href="/ai-dungeon-master">AI DM</Link>
          <Link href="/play">Play</Link>
        </nav>
      </header>

      <section className="seo-hero" aria-labelledby="seo-page-title">
        <p className="landing-section-label">{page.eyebrow}</p>
        <h1 id="seo-page-title">{page.h1}</h1>
        <p>{page.lede}</p>
        <div className="landing-actions">
          <Link className="landing-button landing-button-primary" href="/play">
            {page.ctaLabel}
          </Link>
          <Link className="landing-button landing-button-secondary" href="/">
            Back to home
          </Link>
        </div>
      </section>

      <section className="seo-content" aria-label={`${page.eyebrow} details`}>
        <div className="seo-section-list">
          {page.sections.map((section) => (
            <article key={section.title}>
              <h2>{section.title}</h2>
              <p>{section.body}</p>
            </article>
          ))}
        </div>

        <aside className="seo-highlights" aria-label="Key topics">
          <h2>Key Topics</h2>
          <ul>
            {page.highlights.map((highlight) => (
              <li key={highlight}>{highlight}</li>
            ))}
          </ul>
        </aside>
      </section>

      <section className="landing-final seo-final" aria-labelledby="seo-final-title">
        <h2 id="seo-final-title">The next turn is waiting.</h2>
        <Link className="landing-button landing-button-primary" href="/play">
          Enter the tavern
        </Link>
      </section>
    </main>
  );
}
