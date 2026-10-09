import { describe, it, expect } from "vitest";
import { validateRoster } from "@/domain/validate";
import { zonedIso } from "@/domain/time";
import { fixture, id } from "./fixtures";
describe("independent roster validator", () => {
  it("accepts a fully covered eligible roster", () =>
    expect(validateRoster(fixture()).valid).toBe(true));
  it("rejects staffing shortages", () => {
    const data = fixture();
    data.assignments = [];
    expect(validateRoster(data).violations.map((x) => x.rule)).toContain(
      "minimum_staffing",
    );
  });
  it("rejects excessive staffing", () => {
    const data = fixture();
    data.staff.push({ ...data.staff[0], id: id(6) });
    data.assignments.push({ staff_id: id(6), shift_id: id(5) });
    expect(validateRoster(data).violations.map((x) => x.rule)).toContain(
      "maximum_staffing",
    );
  });
  it.each(["skills", "ward", "inactive", "ineligible"])(
    "rejects %s violations",
    (kind) => {
      const data = fixture();
      if (kind === "skills") data.staff[0].skills = [];
      if (kind === "ward") data.staff[0].ward_id = id(99);
      if (kind === "inactive") data.staff[0].active = false;
      if (kind === "ineligible") data.staff[0].eligible = false;
      expect(validateRoster(data).valid).toBe(false);
    },
  );
  it("rejects a duplicate and unknown assignment", () => {
    const data = fixture();
    data.assignments.push(data.assignments[0], {
      staff_id: id(99),
      shift_id: id(5),
    });
    expect(validateRoster(data).violations.map((x) => x.rule)).toContain(
      "data_integrity",
    );
  });
  it("rejects mandatory unavailability", () => {
    const data = fixture();
    data.availability = [
      {
        staff_id: id(4),
        start_at: "2026-10-12T10:00:00Z",
        end_at: "2026-10-12T12:00:00Z",
      },
    ];
    expect(validateRoster(data).violations.map((x) => x.rule)).toContain(
      "unavailability",
    );
  });
  it("checks overlaps against assignments outside the candidate period", () => {
    const data = fixture();
    data.history = [
      {
        staff_id: id(4),
        shift_id: id(10),
        shift: {
          ...data.shifts[0],
          id: id(10),
          start_at: "2026-10-11T21:00:00Z",
          end_at: "2026-10-12T09:00:00Z",
        },
      },
    ];
    expect(validateRoster(data).violations.map((x) => x.rule)).toContain(
      "overlap",
    );
  });
  it("checks rest across the period boundary", () => {
    const data = fixture();
    data.history = [
      {
        staff_id: id(4),
        shift_id: id(10),
        shift: {
          ...data.shifts[0],
          id: id(10),
          start_at: "2026-10-11T10:00:00Z",
          end_at: "2026-10-11T23:00:00Z",
        },
      },
    ];
    expect(validateRoster(data).violations.map((x) => x.rule)).toContain(
      "min_rest_minutes",
    );
  });
  it("checks consecutive working days across the period boundary", () => {
    const data = fixture();
    data.rules.find((x) => x.kind === "max_consecutive_days")!.value = 2;
    data.history = [10, 11].map((n) => ({
      staff_id: id(4),
      shift_id: id(n),
      shift: {
        ...data.shifts[0],
        id: id(n),
        start_at: `2026-10-${n}T07:00:00Z`,
        end_at: `2026-10-${n}T19:00:00Z`,
      },
    }));
    expect(validateRoster(data).violations.map((x) => x.rule)).toContain(
      "max_consecutive_days",
    );
  });
  it("groups one shift per day in hospital time, across UTC midnight", () => {
    const data = fixture();
    data.shifts[0].start_at = "2026-10-12T00:05:00Z";
    data.shifts[0].end_at = "2026-10-12T01:00:00Z";
    data.shifts.push({
      ...data.shifts[0],
      id: id(10),
      start_at: "2026-10-11T23:15:00Z",
      end_at: "2026-10-11T23:45:00Z",
    });
    data.assignments.push({ staff_id: id(4), shift_id: id(10) });
    expect(validateRoster(data).violations.map((x) => x.rule)).toContain(
      "one_shift_per_day",
    );
  });
  it("allows touching unavailability boundaries", () => {
    const data = fixture();
    data.availability = [
      {
        staff_id: id(4),
        start_at: "2026-10-12T19:00:00Z",
        end_at: "2026-10-12T22:00:00Z",
      },
    ];
    expect(validateRoster(data).valid).toBe(true);
  });
  it("does not publish an empty period", () => {
    const data = fixture();
    data.shifts = [];
    data.assignments = [];
    expect(validateRoster(data).valid).toBe(false);
  });
  it("preserves the instant and offset across daylight saving", () => {
    expect(zonedIso("2026-10-25T00:30:00Z", "Europe/London")).toBe(
      "2026-10-25T01:30:00+01:00",
    );
    expect(zonedIso("2026-10-25T01:30:00Z", "Europe/London")).toBe(
      "2026-10-25T01:30:00+00:00",
    );
  });
});
