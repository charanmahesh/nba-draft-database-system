import type { Match } from "@/lib/api-client";
export function ScoreBreakdown({match}:{match:Match}) {
  const parts=[{label:"Position & priority",value:Number(match.position_score),color:"bg-burgundy"},{label:"Performance",value:Number(match.stats_score),color:"bg-burgundy-soft"},{label:"Measurements",value:Number(match.measurement_bonus),color:"bg-cream-deep"}];
  const total=parts.reduce((sum,p)=>sum+p.value,0);
  return <div aria-label="Score breakdown"><div aria-hidden="true" className="flex h-2 overflow-hidden rounded-full bg-ink/10">{parts.map(p=><span key={p.label} className={p.color} style={{width:`${total>0?p.value/total*100:0}%`}}/>)}</div><dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink/65">{parts.map(p=><div key={p.label} className="flex gap-1"><dt>{p.label}:</dt><dd className="font-medium text-ink">{p.value.toFixed(1)}</dd></div>)}</dl></div>;
}
