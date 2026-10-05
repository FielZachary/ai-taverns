import { redirect } from "next/navigation";
import { getOptionalUser } from "@/lib/auth";
import { DmLab } from "./dm-lab";

export default async function DmLabPage() {
  const enabled =
    process.env.NODE_ENV !== "production" || process.env.DM_LAB_ENABLED === "true";
  const user = await getOptionalUser();

  if (!enabled) {
    redirect("/play");
  }
  if (!user) {
    redirect("/login?next=%2Fdev%2Fdm-lab");
  }

  return <DmLab />;
}
