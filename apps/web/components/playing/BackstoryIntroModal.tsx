"use client";

import {
  formatBackstoryParagraphs,
  glossaryEntriesForBackstory
} from "./backstory-intro";

type BackstoryIntroModalProps = {
  backstory: string;
  countdown: number;
  onContinue: () => void;
};

export function BackstoryIntroModal({
  backstory,
  countdown,
  onContinue
}: BackstoryIntroModalProps) {
  const canContinue = countdown <= 0;
  const paragraphs = formatBackstoryParagraphs(backstory);
  const glossaryEntries = glossaryEntriesForBackstory(backstory);

  return (
    <div className="backstory-intro-backdrop" role="presentation">
      <section
        aria-labelledby="backstory-intro-title"
        aria-modal="true"
        className="backstory-intro-modal"
        role="dialog"
      >
        <div className="backstory-intro-scroll">
          <p className="eyebrow">Campaign Memory</p>
          <h2 id="backstory-intro-title">Your Backstory</h2>
          <div className="backstory-intro-copy">
            {paragraphs.map((paragraph, index) => (
              <p key={`${index}-${paragraph.slice(0, 18)}`}>{paragraph}</p>
            ))}
          </div>
          {glossaryEntries.length > 0 ? (
            <section className="backstory-glossary">
              <h3>World Terms</h3>
              <div className="backstory-glossary-list">
                {glossaryEntries.map((entry) => (
                  <article key={entry.term}>
                    <h4>{entry.term}</h4>
                    <p>{entry.definition}</p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </div>
        <button
          className="backstory-intro-continue"
          disabled={!canContinue}
          onClick={onContinue}
          type="button"
        >
          {canContinue ? "Continue" : `Continue (${countdown})`}
        </button>
      </section>
    </div>
  );
}
