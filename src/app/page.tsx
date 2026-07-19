import { redirect } from "next/navigation";
import { getSessionUser, homeFor } from "@/lib/auth";

export default async function Home() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  redirect(homeFor(user.role));
}
