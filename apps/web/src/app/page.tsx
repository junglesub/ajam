import { redirect } from "next/navigation";

import { getSession } from "@/server/session";

export default async function HomePage() {
  const session = await getSession();

  redirect(session ? "/timesheet" : "/login");
}
