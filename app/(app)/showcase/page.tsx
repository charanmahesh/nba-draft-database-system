import { getSession } from "@/lib/auth/guard";
import { EmptyState } from "@/components/ui";
import { Showcase } from "@/components/showcase/showcase";
export default async function Page(){const session=await getSession();if(!session||!["admin","analyst"].includes(session.role))return <div className="p-10"><EmptyState title="Access denied" description="Only administrators and analysts can run database examples."/></div>;return <Showcase/>;}
