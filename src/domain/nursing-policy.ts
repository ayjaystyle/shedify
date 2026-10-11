import {
  dayIndex,
  localDay,
  type Assignment,
  type Snapshot,
  type Violation,
} from "./model";
import { localMidnight } from "./time";
export const addDays = (day: string, n: number) =>
  new Date((dayIndex(day) + n) * 86400000).toISOString().slice(0, 10);
export const weekStart = (day: string) =>
  addDays(day, -((new Date(day + "T00:00:00Z").getUTCDay() + 6) % 7));
export function validateNursingPolicy(
  data: Snapshot,
  assignments: Assignment[],
) {
  const violations: Violation[] = [],
    warnings: string[] = [];
  const fail = (
    rule: string,
    message: string,
    staffIds: string[] = [],
    shiftIds: string[] = [],
  ) => violations.push({ rule, message, staffIds, shiftIds });
  const policy = data.policy;
  const rows = assignments.flatMap((a) => {
    const s = data.shifts.find((s) => s.id === a.shift_id),
      n = data.staff.find((n) => n.id === a.staff_id);
    return s && n
      ? [
          {
            shift: s,
            nurse: n,
            day: localDay(s.start_at, data.timezone),
            candidate: true,
          },
        ]
      : [];
  });
  const history = data.history.flatMap((a) => {
    const n = data.staff.find((n) => n.id === a.staff_id);
    return n
      ? [
          {
            shift: a.shift,
            nurse: n,
            day: localDay(a.shift.start_at, data.timezone),
            candidate: false,
          },
        ]
      : [];
  });
  for (const r of rows) {
    const type = r.shift.shift_type;
    if (type && type !== "unspecified" && r.nurse[`${type}_enabled`] === false)
      fail(
        "permitted_shifts",
        `${r.nurse.full_name}: ${type} is disabled on ${r.day}.`,
        [r.nurse.id],
        [r.shift.id],
      );
    if (r.nurse.category === "attendant")
      fail(
        "staff_category",
        `${r.nurse.full_name} is an attendant and cannot fill a nursing seat.`,
        [r.nurse.id],
        [r.shift.id],
      );
  }
  for (const s of data.shifts)
    if (s.times_confirmed === false && !policy)
      fail(
        "shift_times",
        `${s.name}: actual shift times require confirmation before publication.`,
        [],
        [s.id],
      );
  if (!policy) return { violations, warnings };
  if (
    weekStart(data.roster.start_date) !== data.roster.start_date ||
    dayIndex(data.roster.end_date) - dayIndex(data.roster.start_date) !== 27
  )
    fail("four_week_period", "Use 28 consecutive days, Monday through Sunday.");
  if (!policy.senior_rank_ids.length)
    fail(
      "senior_configuration",
      "Select the qualifying senior ranks; rank names are not inferred.",
    );
  for (const s of data.shifts) {
    const day = localDay(s.start_at, data.timezone),
      team = rows.filter((r) => r.shift.id === s.id);
    if (!s.shift_type || s.shift_type === "unspecified")
      fail(
        "shift_type",
        `${s.name} on ${day}: select Morning, Afternoon or Night.`,
        [],
        [s.id],
      );
    if (!s.times_confirmed)
      fail(
        "shift_times",
        `${s.name} on ${day}: actual shift times require confirmation.`,
        [],
        [s.id],
      );
    if (
      !team.some(
        (r) =>
          r.nurse.category !== "attendant" &&
          r.nurse.active &&
          r.nurse.eligible &&
          r.nurse.rank_id &&
          policy.senior_rank_ids.includes(r.nurse.rank_id),
      )
    )
      fail(
        "senior_coverage",
        `${s.name} on ${day}: assign at least one nurse from the configured senior ranks.`,
        [],
        [s.id],
      );
    if (
      s.shift_type === "night" &&
      (!policy.institutional_approved ||
        !policy.safety_reference ||
        !policy.max_night_minutes)
    )
      fail(
        "night_safety_review",
        `${s.name} on ${day}: institutional Night-duty approval, reference and duration limit are required.`,
        [],
        [s.id],
      );
    if (
      s.shift_type === "night" &&
      policy.max_night_minutes &&
      (Date.parse(s.end_at) - Date.parse(s.start_at)) / 60000 >
        policy.max_night_minutes
    )
      fail(
        "night_duration",
        `${s.name} on ${day}: duration exceeds the approved Night limit.`,
        [],
        [s.id],
      );
  }
  const all = [...history, ...rows];
  for (const r of rows)
    if (
      all.filter((a) => a.nurse.id === r.nurse.id && a.day === r.day).length > 1
    )
      fail(
        "one_shift_per_day",
        `${r.nurse.full_name}: only one shift may start on ${r.day}.`,
        [r.nurse.id],
        [r.shift.id],
      );
  for (const a of all.filter((r) => r.shift.shift_type === "afternoon"))
    for (const b of rows.filter(
      (r) =>
        r.nurse.id === a.nurse.id &&
        r.shift.shift_type === "morning" &&
        r.day === addDays(a.day, 1),
    ))
      fail(
        "afternoon_to_morning",
        `${b.nurse.full_name}: ${a.day} Afternoon cannot precede ${b.day} Morning.`,
        [b.nurse.id],
        [a.shift.id, b.shift.id],
      );
  for (const r of rows) {
    const weekend = new Date(r.day + "T00:00:00Z").getUTCDay() % 6 === 0;
    const restricted =
      r.nurse.no_weekends ||
      (r.nurse.rank_id &&
        policy.no_weekend_rank_ids.includes(r.nurse.rank_id)) ||
      policy.head_staff_id === r.nurse.id;
    if (restricted && weekend)
      fail(
        "no_weekends",
        `${r.nurse.full_name}: weekend work is prohibited on ${r.day}.`,
        [r.nurse.id],
        [r.shift.id],
      );
    if (
      (policy.head_staff_id === r.nurse.id ||
        (r.nurse.rank_id &&
          policy.no_weekend_rank_ids.includes(r.nurse.rank_id))) &&
      r.shift.shift_type !== "morning"
    )
      fail(
        "designated_morning_only",
        `${r.nurse.full_name}: designated Morning-only restriction on ${r.day}.`,
        [r.nurse.id],
        [r.shift.id],
      );
  }
  const plans = data.night_teams || [];
  const obligations = [
    ...(data.obligations || []).map((o) => ({
      staff_id: o.staff_id,
      night_start: o.night_start,
    })),
    ...plans.map((n) => ({ staff_id: n.staff_id, night_start: n.week_start })),
  ];
  for (let i = 0; i < 4; i++) {
    const monday = addDays(data.roster.start_date, i * 7);
    const nights = data.shifts.filter(
      (s) =>
        s.shift_type === "night" &&
        weekStart(localDay(s.start_at, data.timezone)) === monday,
    );
    const planned = [
      ...new Set(
        plans.filter((n) => n.week_start === monday).map((n) => n.staff_id),
      ),
    ];
    if (
      nights.length !== 7 ||
      new Set(nights.map((s) => localDay(s.start_at, data.timezone))).size !== 7
    )
      fail(
        "fixed_night_team",
        `Week ${monday}: create exactly seven dated Night shifts.`,
      );
    if (planned.length < 2 || planned.length > 4)
      fail(
        "night_team_size",
        `Week ${monday}: select a fixed Night team of 2–4 nurses.`,
      );
    if (
      !planned.some((id) =>
        data.staff.some(
          (n) =>
            n.id === id &&
            n.rank_id &&
            policy.senior_rank_ids.includes(n.rank_id),
        ),
      )
    )
      fail(
        "night_team_senior",
        `Week ${monday}: the fixed Night team must include a configured senior nurse.`,
        planned,
      );
    for (const s of nights) {
      const actual = rows
        .filter((r) => r.shift.id === s.id)
        .map((r) => r.nurse.id)
        .sort();
      if (JSON.stringify(actual) !== JSON.stringify([...planned].sort()))
        fail(
          "fixed_night_team",
          `${s.name} on ${localDay(s.start_at, data.timezone)}: use exactly the approved weekly Night team.`,
          planned,
          [s.id],
        );
    }
    for (const n of data.staff.filter(
      (n) => n.active && n.eligible && n.category !== "attendant",
    )) {
      const worked = rows.filter(
        (r) => r.nurse.id === n.id && weekStart(r.day) === monday,
      );
      const ownObligations = obligations.filter((o) => o.staff_id === n.id);
      const off = ownObligations.some(
        (o) => addDays(o.night_start, 7) === monday,
      );
      const afternoon = ownObligations.some(
        (o) => addDays(o.night_start, 14) === monday,
      );
      if (off && worked.length)
        fail(
          "post_night_off",
          `${n.full_name}: the full week ${monday} must remain Off.`,
          [n.id],
          worked.map((r) => r.shift.id),
        );
      if (afternoon && n.afternoon_enabled === false)
        fail(
          "rotation_permission_conflict",
          `${n.full_name}: mandatory Afternoon week ${monday} conflicts with Afternoon disabled.`,
          [n.id],
        );
      if (afternoon && worked.some((r) => r.shift.shift_type !== "afternoon"))
        fail(
          "post_night_afternoon",
          `${n.full_name}: only Afternoon duty is allowed in week ${monday}.`,
          [n.id],
          worked.map((r) => r.shift.id),
        );
      const fullyAbsent = Array.from({ length: 7 }, (_, d) =>
        addDays(monday, d),
      ).filter((day) =>
        data.availability.some(
          (a) =>
            a.staff_id === n.id &&
            Date.parse(a.start_at) <=
              Date.parse(localMidnight(day, data.timezone)) &&
            Date.parse(a.end_at) >=
              Date.parse(localMidnight(addDays(day, 1), data.timezone)),
        ),
      );
      // Leave is not work. Partial-day absence is still checked against actual shifts by the base validator.
      if (
        !off &&
        !planned.includes(n.id) &&
        new Set(worked.map((r) => r.day)).size !==
          Math.min(4, 7 - fullyAbsent.length)
      )
        fail(
          "weekly_four_days",
          `${n.full_name}: week ${monday} requires four working days and three Off days.`,
          [n.id],
          worked.map((r) => r.shift.id),
        );
      if (n.id === policy.head_staff_id && !off)
        for (const d of [monday, addDays(monday, 4)])
          if (
            !data.holidays?.some((h) => h.day === d) &&
            !fullyAbsent.includes(d) &&
            !worked.some((r) => r.day === d && r.shift.shift_type === "morning")
          )
            fail(
              "head_mandatory_days",
              `${n.full_name}: Morning duty is required on ${d}.`,
              [n.id],
            );
    }
  }
  for (const p of plans) {
    const n = data.staff.find((n) => n.id === p.staff_id);
    if (n && n.afternoon_enabled === false)
      fail(
        "rotation_permission_conflict",
        `${n.full_name}: Night duty creates a compulsory Afternoon week but Afternoon is disabled.`,
        [n.id],
      );
    if (
      !n ||
      !n.active ||
      !n.eligible ||
      n.category === "attendant" ||
      n.night_enabled === false
    )
      fail(
        "night_team_eligibility",
        `${n?.full_name || p.staff_id}: Night team member is not an eligible Night nurse.`,
        [p.staff_id],
      );
    const nights = data.shifts.filter(
      (s) =>
        s.shift_type === "night" &&
        weekStart(localDay(s.start_at, data.timezone)) === p.week_start,
    );
    if (
      nights.some((s) =>
        data.availability.some(
          (a) =>
            a.staff_id === p.staff_id &&
            Date.parse(a.start_at) < Date.parse(s.end_at) &&
            Date.parse(a.end_at) > Date.parse(s.start_at),
        ),
      )
    )
      fail(
        "night_team_unavailability",
        `${n?.full_name || p.staff_id}: mandatory absence conflicts with the connected seven-night block ${p.week_start}.`,
        [p.staff_id],
      );
    if (
      obligations.some(
        (o) =>
          o.staff_id === p.staff_id &&
          o.night_start !== p.week_start &&
          Math.abs(dayIndex(o.night_start) - dayIndex(p.week_start)) < 28,
      )
    )
      fail(
        "night_frequency",
        `${n?.full_name || p.staff_id}: another Night block occurs within four weeks.`,
        [p.staff_id],
      );
  }
  for (const o of obligations) {
    const finalNight = all
      .filter(
        (r) =>
          r.nurse.id === o.staff_id &&
          r.shift.shift_type === "night" &&
          r.day === addDays(o.night_start, 6),
      )
      .at(-1);
    if (!finalNight) continue;
    const until = Date.parse(finalNight.shift.end_at) + 7 * 86400000;
    for (const r of rows.filter(
      (r) =>
        r.nurse.id === o.staff_id &&
        r.day > addDays(o.night_start, 6) &&
        Date.parse(r.shift.start_at) < until,
    ))
      fail(
        "post_night_full_rest",
        `${r.nurse.full_name}: seven full days of rest are required after the last Night ends.`,
        [r.nurse.id],
        [r.shift.id],
      );
  }
  for (const a of data.availability.filter((a) => a.leave_type === "annual")) {
    const firstDay = localDay(a.end_at, data.timezone);
    const firstDuty = all
      .filter((r) => r.nurse.id === a.staff_id && r.day >= firstDay)
      .sort((a, b) => a.day.localeCompare(b.day))[0];
    const returnWeek = weekStart(firstDuty?.day || firstDay);
    const returning = rows.filter(
      (r) =>
        r.nurse.id === a.staff_id &&
        r.day >= firstDay &&
        weekStart(r.day) === returnWeek,
    );
    for (const r of returning.filter((r) => r.shift.shift_type !== "morning"))
      fail(
        "leave_return_morning",
        `${r.nurse.full_name}: return from annual leave requires Morning in week ${returnWeek}.`,
        [a.staff_id],
        [r.shift.id],
      );
  }
  for (const s of data.shifts.filter(
    (s) =>
      s.shift_type === "morning" &&
      new Date(localDay(s.start_at, data.timezone) + "T00:00:00Z").getUTCDay() %
        6 !==
        0,
  )) {
    const day = localDay(s.start_at, data.timezone),
      morning = rows.filter((r) => r.shift.id === s.id).length;
    const afternoon = rows.filter(
      (r) => r.day === day && r.shift.shift_type === "afternoon",
    ).length;
    if (afternoon > morning)
      warnings.push(
        `${day}: Afternoon has ${afternoon} nurses and Morning ${morning}; review the weekday Morning priority.`,
      );
  }
  for (const h of data.holidays || [])
    warnings.push(
      `${h.day}: ${h.name} requires administrative holiday review; no automatic holiday assignments.`,
    );
  return { violations, warnings };
}
