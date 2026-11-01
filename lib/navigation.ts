import type { Role } from "./api-client";
const all:Role[]=["admin","scout","analyst","team_manager"];
export const navigation: {label:string;href:string;roles:Role[];mark:string}[] = [
  {label:"Dashboard",href:"/dashboard",roles:all,mark:"01"},
  {label:"Players",href:"/players",roles:all,mark:"02"},
  {label:"Games",href:"/games",roles:["admin","analyst","team_manager"],mark:"03"},
  {label:"Search",href:"/search",roles:all,mark:"04"},
  {label:"Team Match",href:"/team-match-board",roles:["admin","team_manager"],mark:"05"},
  {label:"Reports",href:"/reports",roles:all,mark:"06"},
  {label:"News",href:"/news",roles:all,mark:"07"},
  {label:"Teams",href:"/teams",roles:["admin","analyst","team_manager"],mark:"08"},
];
export function homeForRole(role:Role) { return role==="scout"||role==="analyst"?"/players":"/dashboard"; }
