"use client";

import { useEffect, useState } from "react";
import { NewAdventureForm } from "../new-adventure/new-adventure-form";
import { trackAnalytics } from "@/lib/analytics";

type OnboardingFormProps = {
  initialInviteToken?: string;
  userEmail?: string;
  userId?: string;
};

type OnboardingStage = "welcome" | "referral" | "adventure";
type ReferralSource = "Reddit" | "X" | "Instagram" | "TikTok" | "Other";

const referralSources: Array<{ label: ReferralSource; icon: string }> = [
  { label: "Reddit", icon: "reddit" },
  { label: "X", icon: "x" },
  { label: "Instagram", icon: "instagram" },
  { label: "TikTok", icon: "tiktok" },
  { label: "Other", icon: "other" }
];

function ReferralIcon({ icon }: { icon: string }) {
  if (icon === "x") return <span aria-hidden="true" className="referral-icon referral-icon-x">𝕏</span>;
  if (icon === "other") return <span aria-hidden="true" className="referral-icon referral-icon-other">✦</span>;

  return (
    <svg aria-hidden="true" className={`referral-icon referral-icon-${icon}`} viewBox="0 0 24 24">
      {icon === "reddit" ? <><circle cx="12" cy="12" r="8" /><circle cx="9.2" cy="12" r="1" fill="currentColor" /><circle cx="14.8" cy="12" r="1" fill="currentColor" /><path d="M8.5 15c2.2 1.7 4.8 1.7 7 0M14.5 7.2l1.1-2.2 2 .6" /></> : null}
      {icon === "instagram" ? <><rect x="4" y="4" width="16" height="16" rx="4" /><circle cx="12" cy="12" r="3.5" /><circle cx="17.2" cy="6.8" r=".9" fill="currentColor" /></> : null}
      {icon === "tiktok" ? <><path d="M14 4v9.2a3.7 3.7 0 1 1-3-3.6M14 4c1 2.1 2.5 3.2 4.7 3.4" /></> : null}
    </svg>
  );
}

export function OnboardingForm(props: OnboardingFormProps) {
  const [stage, setStage] = useState<OnboardingStage>("welcome");

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setStage("referral"), 2_000);
    return () => window.clearTimeout(timeoutId);
  }, []);

  if (stage === "adventure") {
    return <NewAdventureForm {...props} onboarding />;
  }

  return (
    <main className="onboarding-intro" aria-label="Onboarding">
      {stage === "welcome" ? (
        <h1 className="onboarding-welcome">Welcome, traveller.</h1>
      ) : (
        <section className="onboarding-referral" aria-labelledby="referral-heading">
          <h1 id="referral-heading">Where did you hear about AI Taverns?</h1>
          <div className="onboarding-referral-options">
            {referralSources.map(({ label, icon }) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  trackAnalytics({
                    name: "Onboarding Referral Source Selected",
                    properties: { referralSource: label }
                  });
                  setStage("adventure");
                }}
              >
                <ReferralIcon icon={icon} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
