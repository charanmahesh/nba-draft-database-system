import { z } from "zod";
export const k = z.coerce.number().int().min(1).max(100).default(5);
export const querySchema = z.object({q:z.string().trim().min(1).max(500), k}).strict();
export const reportSearchSchema = querySchema.extend({position:z.enum(["PG","SG","SF","PF","C"]).optional(), maxInjurySeverity:z.enum(["minor","moderate","severe"]).optional()}).strict();
export const neighboursSchema = z.object({k}).strict();
