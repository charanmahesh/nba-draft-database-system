import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/guard";
import { AppShell } from "@/components/layout/app-shell";
export default async function WorkspaceLayout({children}:{children:React.ReactNode}) { const session=await getSession();if(!session)redirect("/login");return <AppShell session={session}>{children}</AppShell>; }
