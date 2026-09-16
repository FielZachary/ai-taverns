import { NewAdventureForm } from "../new-adventure/new-adventure-form";

type OnboardingFormProps = {
  initialInviteToken?: string;
  userEmail?: string;
  userId?: string;
};

export function OnboardingForm(props: OnboardingFormProps) {
  return <NewAdventureForm {...props} onboarding />;
}
