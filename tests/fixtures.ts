import type { Snapshot } from "@/domain/model";
export const id = (n: number) =>
  `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
export function fixture(): Snapshot {
  return {
    hospital_id: id(1),
    timezone: "Europe/London",
    revision: 1,
    roster: {
      id: id(2),
      ward_id: id(3),
      start_date: "2026-10-12",
      end_date: "2026-10-18",
      status: "generated",
    },
    staff: [
      {
        id: id(4),
        hospital_id: id(1),
        ward_id: id(3),
        full_name: "Fictional nurse",
        rank_id: null,
        active: true,
        eligible: true,
        skills: ["critical-care"],
      },
    ],
    shifts: [
      {
        id: id(5),
        hospital_id: id(1),
        ward_id: id(3),
        name: "Day",
        start_at: "2026-10-12T07:00:00Z",
        end_at: "2026-10-12T19:00:00Z",
        min_staff: 1,
        max_staff: 1,
        required_skills: ["critical-care"],
      },
    ],
    rules: [
      { kind: "one_shift_per_day", value: 1, active: true },
      { kind: "min_rest_minutes", value: 660, active: true },
      { kind: "max_consecutive_days", value: 5, active: true },
    ],
    availability: [],
    preferences: [],
    assignments: [{ shift_id: id(5), staff_id: id(4) }],
    history: [],
  };
}
