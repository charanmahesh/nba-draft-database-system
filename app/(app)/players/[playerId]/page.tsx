import { PlayerDetailView } from "@/components/players/player-detail";
export default async function Page({params}:{params:Promise<{playerId:string}>}){return <PlayerDetailView playerId={(await params).playerId}/>;}
