import { z } from "zod";
export const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).refine((value) => new TextEncoder().encode(value).length <= 72),
}).strict();
export const teamIdSchema = z.string().regex(/^[1-9]\d*$/).refine((value) => value.length < 19 || (value.length === 19 && value <= "9223372036854775807"));
