import { z } from "zod";
import { teamIdSchema } from "./auth";
export const playerListSchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  position: z.enum(["PG", "SG", "SF", "PF", "C"]).optional(),
  team: teamIdSchema.optional(),
  season: z.coerce.number().int().min(1900).max(2200).optional(),
  minGames: z.coerce.number().int().min(0).max(10000).default(0),
  name: z.string().trim().min(1).max(100).optional(),
  sort: z.enum(["name", "points", "games"]).default("name"),
}).strict();
export type PlayerListInput = z.infer<typeof playerListSchema>;
