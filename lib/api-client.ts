export type Role = "admin" | "scout" | "analyst" | "team_manager";
export type Position = "PG" | "SG" | "SF" | "PF" | "C";
export type Severity = "minor" | "moderate" | "severe";
export type Id = string;
export type Numeric = string | number;
export interface Session { person_id:Id; name:string; email:string; role:Role; team_id:Id|null }
export interface Player { player_id:Id; f_name:string; l_name:string; position:Position|null; height_cm:Numeric|null; weight_kg:Numeric|null; games:number; avg_points:Numeric|null }
export interface SeasonAverage { season:number; games:number; minutes:Numeric|null; points:Numeric|null; rebounds:Numeric|null; assists:Numeric|null; steals:Numeric|null; blocks:Numeric|null }
export interface PlayerDetail { player_id:Id; f_name:string; l_name:string; position:Position|null; secondary_position:Position|null; dob:string|null; height_cm:Numeric|null; weight_kg:Numeric|null; season_averages:SeasonAverage[]; measurements:Measurement[]; injuries:Injury[]; reports:Report[]; news:Article[]; [key:string]:unknown }
export interface Team { team_id:Id; team_name:string; city:string }
export interface Game { game_id:Id; game_date:string; season:number; home_team_id:Id; away_team_id:Id; home_team:string; away_team:string }
export interface Performance { performance_id:Id; game_id:Id; player_id:Id; team_id:Id; minutes:Numeric; points:number; rebounds:number; assists:number; blocks:number; steals:number }
export interface Measurement { measurement_id:Id; player_id:Id; measurement_type:string; combine_year:number; measured_on:string|null; value:Numeric; unit:string }
export interface Injury { injury_id:Id; player_id:Id; injury_date:string; description:string; severity:Severity }
export interface Need { need_id:Id; team_id:Id; position:Position; priority:number; description:string|null; is_filled:boolean }
export interface Roster { roster_id:Id; team_id:Id; season:number; is_historical:boolean; players:{player_id:Id;f_name:string;l_name:string}[] }
export interface Membership { roster_id:Id; player_id:Id; season:number }
export interface Report { report_id:Id; player_id:Id; scout_id:Id; report_date:string; summary:string; embedding_status:"indexed"|"pending" }
export interface Article { article_id:Id; title:string; publish_date:string; summary:string; url:string|null; embedding_status?:"indexed"|"pending" }
export interface Match { player_id:Id; [key:string]:unknown }
export interface SemanticReport { report_id:Id; player_id:Id; scout_id:Id; summary:string; similarity:number; f_name?:string; l_name?:string; position?:Position|null }
export interface SimilarPlayer { player_id:Id; f_name:string; l_name:string; position:Position|null; similarity:number }
export interface KeywordReport { report_id:Id; player_id:Id; scout_id:Id; summary:string; rank:number; headline:string }
export interface Person { person_id:Id; f_name:string; l_name:string; email:string; role:Role }
export type PersonInput = {f_name:string;l_name:string;email:string;password:string} & ({role:"admin";subtype:{role:"admin"}}|{role:"scout";subtype:{role:"scout";experience?:number}}|{role:"analyst";subtype:{role:"analyst";specialization?:string}}|{role:"team_manager";subtype:{role:"team_manager";team_id:Id}});
export type Page = {page?:number;limit?:number};
export type PlayerFilters = Page & {position?:Position;team?:Id;season?:number;minGames?:number;name?:string;sort?:"name"|"points"|"games"};
export type PerformanceInput = {game_id:Id;player_id:Id;team_id:Id;minutes:number;points?:number;rebounds?:number;assists?:number;blocks?:number;steals?:number};
export type MeasurementInput = {player_id:Id;measurement_type:"height_cm"|"weight_kg"|"wingspan_cm"|"standing_reach_cm"|"vertical_leap_cm"|"bench_press_reps"|"lane_agility_seconds"|"three_quarter_sprint_seconds"|"shuttle_run_seconds";combine_year:number;measured_on?:string|null;value:number;unit:string};
export type InjuryInput = {player_id:Id;injury_date:string;description:string;severity:Severity};
export type ReportInput = {player_id:Id;scout_id?:Id;report_date?:string;summary:string};
export type NewsInput = {title:string;publish_date:string;summary:string;url?:string|null};
export class ApiError extends Error { constructor(message:string,public readonly status:number){super(message);this.name="ApiError";} }
type Envelope<T> = {ok:true;data:T}|{ok:false;error:string};
async function request<T>(path:string, options:RequestInit={}):Promise<T> { const response=await fetch(path,{...options,credentials:"same-origin",headers:{...(options.body?{"Content-Type":"application/json"}:{}),...options.headers}}); const body=await response.json().catch(()=>null) as Envelope<T>|null; if(!response.ok||!body?.ok)throw new ApiError(body && !body.ok?body.error:"Request failed",response.status); return body.data; }
function query(values:object={}) { const p=new URLSearchParams(); for(const [key,value] of Object.entries(values))if(value!==undefined&&value!==null&&value!=="")p.set(key,String(value));const s=p.toString();return s?`?${s}`:""; }
function send<T>(path:string,method:string,body?:unknown){return request<T>(path,{method,...(body===undefined?{}:{body:JSON.stringify(body)})});}
const id=(value:Id)=>encodeURIComponent(value);
export const api = {
  login:(email:string,password:string)=>send<Session>("/api/auth/login","POST",{email,password}), logout:()=>send<null>("/api/auth/logout","POST"), me:()=>request<Session>("/api/auth/me"),
  health:()=>request<{database:string;vectorEnabled:boolean}>("/api/health"), embedding:()=>request<{model:string;dimensions:number;expectedDimensions:number}>("/api/embedding"),
  players:(filters:PlayerFilters={})=>request<{items:Player[];total:number;page:number;limit:number}>(`/api/players${query(filters)}`), player:(playerId:Id)=>request<PlayerDetail>(`/api/players/${id(playerId)}`),
  teams:(page:Page={})=>request<Team[]>(`/api/teams${query(page)}`), createTeam:(v:Omit<Team,"team_id">)=>send<Team>("/api/teams","POST",v), updateTeam:(teamId:Id,v:Partial<Omit<Team,"team_id">>)=>send<Team>(`/api/teams/${id(teamId)}`,"PATCH",v), createPerson:(v:PersonInput)=>send<Person>("/api/persons","POST",v),
  games:(page:Page={})=>request<Game[]>(`/api/games${query(page)}`), performances:(page:Page={})=>request<Performance[]>(`/api/performances${query(page)}`), createPerformance:(v:PerformanceInput)=>send<Performance>("/api/performances","POST",v),
  measurements:(page:Page={})=>request<Measurement[]>(`/api/measurements${query(page)}`), createMeasurement:(v:MeasurementInput)=>send<Measurement>("/api/measurements","POST",v), injuries:(page:Page={})=>request<Injury[]>(`/api/injuries${query(page)}`), createInjury:(v:InjuryInput)=>send<Injury>("/api/injuries","POST",v),
  needs:(teamId:Id)=>request<Need[]>(`/api/teams/${id(teamId)}/needs`), createNeed:(teamId:Id,v:{position:Position;priority:number;description?:string})=>send<Need>(`/api/teams/${id(teamId)}/needs`,"POST",v), rosters:(teamId:Id)=>request<Roster[]>(`/api/teams/${id(teamId)}/roster`), addRosterPlayer:(teamId:Id,rosterId:Id,playerId:Id)=>send<Membership>(`/api/teams/${id(teamId)}/roster`,"POST",{roster_id:rosterId,player_id:playerId}), removeRosterPlayer:(teamId:Id,rosterId:Id,playerId:Id)=>send<Membership>(`/api/teams/${id(teamId)}/roster/${id(playerId)}${query({rosterId})}`,"DELETE"), teamMatch:(teamId:Id)=>request<Match[]>(`/api/team-match${query({teamId})}`), teamMatches:(teamId:Id)=>request<Match[]>(`/api/teams/${id(teamId)}/matches`),
  reports:(page:Page={})=>request<Report[]>(`/api/reports${query(page)}`), report:(reportId:Id)=>request<Report>(`/api/reports/${id(reportId)}`), createReport:(v:ReportInput)=>send<Report>("/api/reports","POST",v), updateReport:(reportId:Id,summary:string)=>send<Report>(`/api/reports/${id(reportId)}`,"PATCH",{summary}), deleteReport:(reportId:Id)=>send<Report>(`/api/reports/${id(reportId)}`,"DELETE"),
  news:(page:Page={})=>request<Article[]>(`/api/news${query(page)}`), article:(articleId:Id)=>request<Article>(`/api/news/${id(articleId)}`), createArticle:(v:NewsInput)=>send<Article>("/api/news","POST",v), updateArticle:(articleId:Id,v:Partial<NewsInput>)=>send<Article>(`/api/news/${id(articleId)}`,"PATCH",v), deleteArticle:(articleId:Id)=>send<Article>(`/api/news/${id(articleId)}`,"DELETE"),
  searchReports:(v:{q:string;k?:number;position?:Position;maxInjurySeverity?:Severity})=>request<SemanticReport[]>(`/api/search/reports${query(v)}`), searchKeyword:(q:string,k?:number)=>request<KeywordReport[]>(`/api/search/keyword${query({q,k})}`), similarReports:(reportId:Id,k?:number)=>request<SemanticReport[]>(`/api/reports/${id(reportId)}/similar${query({k})}`), similarPlayers:(playerId:Id,k?:number)=>request<SimilarPlayer[]>(`/api/players/${id(playerId)}/similar${query({k})}`), playerNews:(playerId:Id,k?:number)=>request<{mentions:Article[];related:(Article&{similarity:number})[]}>(`/api/players/${id(playerId)}/news${query({k})}`),
};

export type DashboardReport={report_id:Id;player_id:Id;player_name:string;report_date:string;summary:string;embedding_status:"indexed"|"pending"};
export type DashboardNeed={need_id:Id;position:Position;priority:number;description:string|null;team_name?:string};
export type DashboardData =
 | {role:"admin";counts:{players:number;teams:number;reports:number;open_needs:number};recent_reports:DashboardReport[];open_needs:DashboardNeed[]}
 | {role:"scout";report_count:number;pending_count:number;reports:DashboardReport[]}
 | {role:"analyst";top_performers:{player_id:Id;player_name:string;games:number;points:number}[];efficiency_leaders:{player_id:Id;player_name:string;games:number;efficiency:number}[]}
 | {role:"team_manager";team_id:Id;team_name:string;open_needs:DashboardNeed[];roster:{roster_id:Id;season:number;size:number}|null;matches:{player_id:Id;f_name:string;l_name:string;position:Position;match_score:number;need_priority:number}[]};
export const getDashboard=()=>request<DashboardData>("/api/dashboard");
