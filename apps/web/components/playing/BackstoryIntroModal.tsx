"use client";

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
            {backstory.split(/\n{2,}/).map((paragraph, index) => (
              <p key={`${index}-${paragraph.slice(0, 18)}`}>{paragraph}</p>
            ))}
          </div>
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
