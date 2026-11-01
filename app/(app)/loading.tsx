import { Skeleton } from "@/components/ui";
export default function Loading(){return <div className="mx-auto max-w-7xl space-y-5 px-6 py-10" role="status" aria-label="Loading page"><Skeleton className="h-4 w-36"/><Skeleton className="h-12 w-64"/><Skeleton className="h-48 w-full"/></div>;}
