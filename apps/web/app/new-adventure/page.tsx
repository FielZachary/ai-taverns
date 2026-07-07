import { redirect } from "next/navigation";
import { NewAdventureForm } from "./new-adventure-form";
import { getOptionalUser } from "@/lib/auth";

export default async function NewAdventurePage() {
  const user = await getOptionalUser();

  if (!user) {
    redirect("/login?next=/new-adventure");
  }

  return <NewAdventureForm />;
}
