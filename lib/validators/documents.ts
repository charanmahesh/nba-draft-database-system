import { z } from "zod";
import { teamIdSchema as id } from "./auth";
const text = z.string().trim().min(1).max(10000);
export const reportCreate = z.object({ player_id:id, scout_id:id.optional(), report_date:z.iso.date().optional(), summary:text }).strict();
export const reportEdit = z.object({ summary:text }).strict();
export const newsCreate = z.object({ title:text, publish_date:z.iso.date(), summary:text, url:z.url().nullable().optional() }).strict();
export const newsEdit = z.object({ title:text.optional(), publish_date:z.iso.date().optional(), summary:text.optional(), url:z.url().nullable().optional() }).strict().refine(v => Object.keys(v).length > 0);
