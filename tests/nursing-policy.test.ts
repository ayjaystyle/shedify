import { describe, expect, it } from "vitest";
import { id } from "./fixtures";
import { addDays, weekStart } from "@/domain/nursing-policy";
import { validateRoster } from "@/domain/validate";
import { mapRequest } from "@/solver/timefold";
import { nursingFixture } from "./nursing-fixture";
import { effectiveRule } from "@/domain/rules";

const rules = (d: ReturnType<typeof nursingFixture>) =>
  validateRoster(d).violations.map((v) => v.rule);
describe("mandatory nursing policy", () => {
  it("prevents bypassing mandatory rules by omitting the ward policy", () => {
    const d = nursingFixture();
    d.policy = null;
    expect(rules(d)).toContain("policy_required");
  });
  it("retains stricter hospital and saved ward limits", () => {
    const d = nursingFixture();
    d.rules = [
      { kind: "max_consecutive_days", value: 4, active: true },
      { kind: "min_rest_minutes", value: 660, active: true },
    ];
    d.policy!.maximum_consecutive_days = 7;
    d.policy!.minimum_rest_minutes = 300;
    d.hospital_limits = {
      maximum_consecutive_days: 3,
      minimum_rest_minutes: 720,
    };
    expect(effectiveRule(d, "max_consecutive_days")).toBe(3);
    expect(effectiveRule(d, "min_rest_minutes")).toBe(720);
    expect(() => mapRequest(d)).toThrow("maximum of 3");
    expect(rules(d)).toContain("max_consecutive_days");
  });
  it("enforces Afternoon-to-Morning across a published boundary", () => {
    const d = nursingFixture(),
      m = d.shifts.find((s) => s.shift_type === "morning")!,
      a = d.assignments.find((a) => a.shift_id === m.id)!;
    d.history = [
      {
        staff_id: a.staff_id,
        shift_id: id(999),
        shift: {
          ...m,
          id: id(999),
          shift_type: "afternoon",
          start_at: "2026-10-11T15:00:00+01:00",
          end_at: "2026-10-11T20:00:00+01:00",
        },
      },
    ];
    expect(rules(d)).toContain("afternoon_to_morning");
  });
  it("maps seven full days of rest and compulsory head Morning duty", () => {
    const d = nursingFixture();
    d.policy!.head_staff_id = d.staff[8].id;
    const input = mapRequest(d);
    expect(
      input.modelInput.employees[0].unavailableTimeSpans.some(
        (s) =>
          s.start.startsWith("2026-10-19T08:00") &&
          s.end.startsWith("2026-10-26T08:00"),
      ),
    ).toBe(true);
    expect(
      input.modelInput.shifts.some(
        (s) =>
          s.id.startsWith(d.shifts[0].id) &&
          "employee" in s &&
          s.employee === d.staff[8].id &&
          s.pinned,
      ),
    ).toBe(true);
  });
  it("accepts fixed seven-night teams, four-day ordinary weeks and carryover", () => {
    const d = nursingFixture();
    expect(validateRoster(d).violations).toEqual([]);
  });
  it.each(["morning", "afternoon", "night"] as const)(
    "enforces %s permission",
    (type) => {
      const d = nursingFixture(),
        s = d.shifts.find((s) => s.shift_type === type)!,
        a = d.assignments.find((a) => a.shift_id === s.id)!;
      d.staff.find((n) => n.id === a.staff_id)![`${type}_enabled`] = false;
      expect(rules(d)).toContain("permitted_shifts");
    },
  );
  it("rejects Night-only rotation conflict, all-disabled nurses and attendants", () => {
    const d = nursingFixture();
    d.staff[0].afternoon_enabled = false;
    d.staff[0].morning_enabled = false;
    expect(rules(d)).toContain("rotation_permission_conflict");
    d.staff[8].morning_enabled = false;
    d.staff[8].afternoon_enabled = false;
    d.staff[8].night_enabled = false;
    expect(rules(d)).toContain("permitted_shifts");
    d.staff[0].category = "attendant";
    expect(rules(d)).toContain("staff_category");
  });
  it("rejects midweek Night substitution and missing senior coverage", () => {
    const d = nursingFixture(),
      a = d.assignments.find((a) => a.staff_id === d.staff[0].id)!;
    a.staff_id = d.staff[9].id;
    expect(rules(d)).toContain("fixed_night_team");
    d.policy!.senior_rank_ids = [id(999)];
    expect(rules(d)).toContain("senior_coverage");
  });
  it("blocks unapproved or overlong Night shifts and unresolved actual times", () => {
    const d = nursingFixture();
    d.policy!.institutional_approved = false;
    expect(rules(d)).toContain("night_safety_review");
    d.policy!.max_night_minutes = 600;
    expect(rules(d)).toContain("night_duration");
    d.shifts[0].times_confirmed = false;
    expect(rules(d)).toContain("shift_times");
  });
  it("enforces Off then Afternoon obligations including the next roster", () => {
    const d = nursingFixture();
    d.obligations = [
      {
        staff_id: d.staff[8].id,
        night_start: addDays(d.roster.start_date, -7),
        off_start: d.roster.start_date,
        afternoon_start: addDays(d.roster.start_date, 7),
      },
    ];
    expect(rules(d)).toContain("post_night_off");
    expect(rules(d)).toContain("post_night_afternoon");
  });
  it("rejects incorrect ordinary weekly totals and repeated Night blocks", () => {
    const d = nursingFixture();
    d.assignments = d.assignments.filter((a) => a.staff_id !== d.staff[8].id);
    expect(rules(d)).toContain("weekly_four_days");
    d.night_teams!.push({
      staff_id: d.staff[0].id,
      week_start: addDays(d.roster.start_date, 7),
    });
    expect(rules(d)).toContain("night_frequency");
  });
  it("checks ACNO configuration, head mandatory dates and leave return", () => {
    const d = nursingFixture();
    d.policy!.no_weekend_rank_ids = [id(500)];
    expect(rules(d)).toContain("no_weekends");
    d.policy!.head_staff_id = d.staff[0].id;
    expect(rules(d)).toContain("head_mandatory_days");
    d.availability = [
      {
        staff_id: d.staff[12].id,
        start_at: "2026-10-05T00:00:00+01:00",
        end_at: "2026-10-12T00:00:00+01:00",
        leave_type: "annual",
      },
    ];
    expect(rules(d)).toContain("leave_return_morning");
  });
  it("pins the weekly team and prohibits disabled shifts in real API fields", () => {
    const d = nursingFixture(),
      input = mapRequest(d);
    const night = d.shifts.find((s) => s.shift_type === "night")!;
    expect(
      input.modelInput.shifts
        .filter((s) => s.id.startsWith(night.id))
        .map((s) => ("employee" in s ? s.employee : null)),
    ).toEqual([d.staff[0].id, d.staff[1].id]);
    expect(
      input.modelInput.shifts.some(
        (s) =>
          "requiredSkills" in s && s.requiredSkills?.includes("shedify:senior"),
      ),
    ).toBe(true);
  });
  it("requires Monday and 28 days and validates null maxima as unlimited", () => {
    const d = nursingFixture();
    d.roster.start_date = addDays(d.roster.start_date, 1);
    expect(rules(d)).toContain("four_week_period");
    expect(weekStart("2026-10-18")).toBe("2026-10-12");
    expect(rules(nursingFixture())).not.toContain("maximum_staffing");
  });
});
