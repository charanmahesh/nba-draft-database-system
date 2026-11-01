import { getSession } from "@/lib/auth/guard";
import { EmptyState } from "@/components/ui";
import { GamesPage } from "@/components/workspace/games";
export default async function Page(){const session=await getSession();if(!session||!["admin","analyst","team_manager"].includes(session.role))return <div className="p-10"><EmptyState title="Access denied" description="Your role cannot access this workspace."/></div>;return <GamesPage/>;}
