import { z } from "zod";
export const staffSchema = z.object({
  id: z.uuid(),
  hospital_id: z.uuid(),
  ward_id: z.uuid(),
  full_name: z.string(),
  rank_id: z.uuid().nullable(),
  active: z.boolean(),
  eligible: z.boolean(),
  skills: z.array(z.string()),
  morning_enabled: z.boolean().optional(),
  afternoon_enabled: z.boolean().optional(),
  night_enabled: z.boolean().optional(),
  no_weekends: z.boolean().optional(),
  category: z.enum(["nurse", "attendant"]).optional(),
});
export const shiftSchema = z.object({
  id: z.uuid(),
  hospital_id: z.uuid(),
  ward_id: z.uuid(),
  name: z.string(),
  start_at: z.iso.datetime({ offset: true }),
  end_at: z.iso.datetime({ offset: true }),
  min_staff: z.number().int().positive(),
  max_staff: z.number().int().positive().nullable(),
  shift_type: z
    .enum(["morning", "afternoon", "night", "unspecified"])
    .optional(),
  times_confirmed: z.boolean().optional(),
  required_skills: z.array(z.string()),
});
export const assignmentSchema = z.object({
  shift_id: z.uuid(),
  staff_id: z.uuid(),
});
export const ruleSchema = z.object({
  kind: z.enum([
    "one_shift_per_day",
    "max_consecutive_days",
    "min_rest_minutes",
    "fair_shifts",
    "fair_workload",
  ]),
  value: z.number().int().nonnegative(),
  active: z.boolean(),
});
export const spanSchema = z.object({
  staff_id: z.uuid(),
  start_at: z.iso.datetime({ offset: true }),
  end_at: z.iso.datetime({ offset: true }),
  leave_type: z.enum(["unavailable", "annual", "sick", "other"]).optional(),
});
export const nursingPolicySchema = z.object({
  senior_rank_ids: z.array(z.uuid()),
  no_weekend_rank_ids: z.array(z.uuid()),
  head_staff_id: z.uuid().nullable(),
  effective_from: z.iso.date(),
  safety_reference: z.string().nullable(),
  max_night_minutes: z.number().int().positive().nullable(),
  institutional_approved: z.boolean(),
  minimum_rest_minutes: z.number().int().nullable().optional(),
  maximum_consecutive_days: z.number().int().nullable().optional(),
});
export const snapshotSchema = z.object({
  hospital_id: z.uuid(),
  timezone: z.string(),
  revision: z.number().int().nonnegative(),
  roster: z.object({
    id: z.uuid(),
    ward_id: z.uuid(),
    start_date: z.iso.date(),
    end_date: z.iso.date(),
    status: z.string(),
  }),
  staff: z.array(staffSchema),
  shifts: z.array(shiftSchema),
  rules: z.array(ruleSchema),
  availability: z.array(spanSchema),
  preferences: z.array(
    spanSchema.extend({
      preferred: z.boolean(),
      shift_type: z.enum(["all", "morning", "afternoon", "night"]).optional(),
    }),
  ),
  assignments: z.array(assignmentSchema),
  history: z.array(assignmentSchema.extend({ shift: shiftSchema })),
  policy: nursingPolicySchema.nullable().optional(),
  hospital_limits: z
    .object({
      maximum_consecutive_days: z.number().int().nullable(),
      minimum_rest_minutes: z.number().int().nullable(),
    })
    .optional(),
  night_teams: z
    .array(z.object({ staff_id: z.uuid(), week_start: z.iso.date() }))
    .optional(),
  obligations: z
    .array(
      z.object({
        staff_id: z.uuid(),
        night_start: z.iso.date(),
        off_start: z.iso.date(),
        afternoon_start: z.iso.date(),
      }),
    )
    .optional(),
  holidays: z
    .array(z.object({ day: z.iso.date(), name: z.string() }))
    .optional(),
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export type Assignment = z.infer<typeof assignmentSchema>;
export type Shift = z.infer<typeof shiftSchema>;
export type Violation = {
  rule: string;
  message: string;
  staffIds: string[];
  shiftIds: string[];
};
export type Validation = {
  valid: boolean;
  passedRules: string[];
  violations: Violation[];
  warnings?: string[];
};
export function localDay(instant: string, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instant));
}
export function dayIndex(day: string) {
  return Date.parse(`${day}T00:00:00Z`) / 86400000;
}
