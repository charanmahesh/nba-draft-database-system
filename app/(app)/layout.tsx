import { redirect } from "next/navigation";
import { getSession, type Session } from "@/lib/auth/guard";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/ui";
export default async function WorkspaceLayout({children}:{children:React.ReactNode}) {
  let session:Session|null;
  try { session=await getSession(); }
  catch { return <main className="mx-auto max-w-4xl px-6 py-10" role="alert"><EmptyState title="Workspace unavailable" description="Could not load your session. Please try again."/></main>; }
  if(!session)redirect("/login");
  return <AppShell session={session}>{children}</AppShell>;
}
