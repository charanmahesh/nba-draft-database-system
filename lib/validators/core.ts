import { z } from "zod";
import { teamIdSchema as id } from "./auth";
const date = z.iso.date();
const score = z.number().min(0).max(1000).default(0);
export const performanceSchema = z.object({ game_id: id, player_id: id, team_id: id, minutes: z.number().min(0).max(70), points: score, rebounds: score, assists: score, blocks: score, steals: score }).strict();
export const measurementSchema = z.object({ player_id: id, measurement_type: z.enum(["height_cm", "weight_kg", "wingspan_cm", "standing_reach_cm", "vertical_leap_cm", "bench_press_reps", "lane_agility_seconds", "three_quarter_sprint_seconds", "shuttle_run_seconds"]), combine_year: z.number().int().min(1900).max(2200), measured_on: date.nullable().optional(), value: z.number(), unit: z.string().trim().min(1).max(30) }).strict();
export const injurySchema = z.object({ player_id: id, injury_date: date, description: z.string().trim().min(1).max(5000), severity: z.enum(["minor", "moderate", "severe"]) }).strict();
export const pageSchema = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) }).strict();
