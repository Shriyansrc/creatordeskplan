import { z } from "zod";
import { editOperationSchema as aiEditOperationSchema } from "@/lib/ai/contracts";

export const pushInSchema = z.object({
  type: z.literal("pushIn"),
  start: z.number().min(0).max(86400),
  duration: z.number().positive().max(86400),
  from: z.number().min(1).max(3),
  to: z.number().min(1).max(3),
});
export const editOperationSchema = z.union([aiEditOperationSchema, pushInSchema]);
export type EditOperation = z.infer<typeof editOperationSchema>;
export type { Platform } from "@/lib/ai/contracts";
export type Ratio = "9:16" | "1:1" | "4:5" | "16:9";
