import { GET as getMatches } from "@/app/api/team-match/route";
export async function GET(request:Request, context:{params:Promise<{teamId:string}>}) {
  const url=new URL(request.url);
  url.searchParams.set("teamId",(await context.params).teamId);
  return getMatches(new Request(url, {headers:request.headers}));
}
