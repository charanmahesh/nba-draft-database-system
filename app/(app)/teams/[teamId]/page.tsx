import { getSession } from "@/lib/auth/guard";
import { EmptyState } from "@/components/ui";
import { TeamsPage } from "@/components/workspace/teams";
export default async function Page({params}:{params:Promise<{teamId:string}>}){const {teamId}=await params;const session=await getSession();if(!session||(session.role!=="admin"&&(session.role!=="team_manager"||session.team_id!==teamId)))return <div className="p-10"><EmptyState title="Access denied" description="Your role cannot manage this team."/></div>;return <TeamsPage initialTeamId={teamId}/>;}
