import Link from "next/link";
import { EmptyState } from "@/components/ui";
export default function NotFound(){return <div className="mx-auto max-w-4xl px-6 py-10"><EmptyState title="Page not found" description="The requested workspace page is unavailable."><Link className="text-burgundy underline" href="/dashboard">Return to dashboard</Link></EmptyState></div>;}
