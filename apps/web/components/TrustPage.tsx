import Link from "next/link";
import type { TrustPage as TrustPageContent } from "@/lib/trust-pages";

type TrustPageProps = {
  page: TrustPageContent;
};

export function TrustPage({ page }: TrustPageProps) {
  return (
    <main className="seo-page">
      <header className="landing-nav seo-nav" aria-label="Primary navigation">
        <Link className="landing-brand" href="/">
          AI Taverns
        </Link>
        <nav>
          <Link href="/about">About</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/play">Play</Link>
        </nav>
      </header>

      <section className="seo-hero" aria-labelledby="trust-page-title">
        <p className="landing-section-label">{page.eyebrow}</p>
        <h1 id="trust-page-title">{page.h1}</h1>
        <p>{page.lede}</p>
      </section>

      <section className="seo-content trust-content" aria-label={`${page.eyebrow} details`}>
        <div className="seo-section-list">
          {page.sections.map((section) => (
            <article key={section.title}>
              <h2>{section.title}</h2>
              <p>{section.body}</p>
            </article>
          ))}
        </div>

        {page.links ? (
          <aside className="seo-highlights trust-links" aria-label="Official links">
            <h2>Official Links</h2>
            <ul>
              {page.links.map((link) => (
                <li key={link.href}>
                  <a href={link.href} rel="me noopener noreferrer" target="_blank">
                    <strong>{link.label}</strong>
                    <span>{link.description}</span>
                  </a>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}
      </section>
    </main>
  );
}
