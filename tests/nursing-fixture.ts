import { fixture, id } from "./fixtures";
import { addDays } from "@/domain/nursing-policy";
export function nursingFixture() {
  const d = fixture();
  d.timezone = "Africa/Lagos";
  d.roster.end_date = addDays(d.roster.start_date, 27);
  d.rules = [];
  d.policy = {
    senior_rank_ids: [id(500)],
    no_weekend_rank_ids: [],
    head_staff_id: null,
    effective_from: d.roster.start_date,
    safety_reference: "Fictional approved QA policy",
    max_night_minutes: 720,
    institutional_approved: true,
  };
  d.staff = Array.from({ length: 20 }, (_, n) => ({
    ...d.staff[0],
    id: id(100 + n),
    rank_id: id(500),
    full_name: `Fictional nurse ${n}`,
    skills: [],
    morning_enabled: true,
    afternoon_enabled: true,
    night_enabled: true,
  }));
  d.shifts = [];
  d.assignments = [];
  d.night_teams = [];
  d.obligations = [];
  const patterns = [
    [0, 1, 2, 3],
    [3, 4, 5, 6],
    [0, 2, 4, 6],
    [1, 2, 4, 5],
  ];
  for (let w = 0; w < 4; w++) {
    const monday = addDays(d.roster.start_date, w * 7),
      team = [w * 2, w * 2 + 1];
    team.forEach((n) =>
      d.night_teams!.push({ staff_id: id(100 + n), week_start: monday }),
    );
    const afternoonTeam =
      w >= 2 ? [w * 2 - 4, w * 2 - 3, 12, 13] : [12, 13, 14, 15];
    const afternoonPatterns =
      w >= 2
        ? [
            [0, 1, 2, 3],
            [0, 1, 2, 3],
            [3, 4, 5, 6],
            [3, 4, 5, 6],
          ]
        : [
            [0, 1, 2, 3],
            [3, 4, 5, 6],
            [0, 1, 4, 5],
            [0, 2, 4, 6],
          ];
    const ordinary = d.staff
      .map((n, i) => ({
        n,
        i,
        days: afternoonTeam.includes(i)
          ? afternoonPatterns[afternoonTeam.indexOf(i)]
          : w === 2 && i === 15
            ? [1, 2, 4, 5]
            : patterns[i % patterns.length],
      }))
      .filter(
        (x) =>
          !team.includes(x.i) &&
          !(w >= 1 && [w * 2 - 2, w * 2 - 1].includes(x.i)),
      );
    for (let day = 0; day < 7; day++) {
      const date = addDays(monday, day),
        weekend = day >= 5;
      const morning = id(1000 + w * 21 + day * 3),
        afternoon = id(1001 + w * 21 + day * 3),
        night = id(1002 + w * 21 + day * 3);
      for (const [type, sid, start, end] of [
        ["morning", morning, "07:30", "15:00"],
        ["afternoon", afternoon, "15:00", "20:00"],
        ["night", night, "20:00", "08:00"],
      ] as const)
        d.shifts.push({
          id: sid,
          hospital_id: d.hospital_id,
          ward_id: d.roster.ward_id,
          name: type,
          shift_type: type,
          times_confirmed: true,
          start_at: `${date}T${start}:00+01:00`,
          end_at: `${type === "night" ? addDays(date, 1) : date}T${end}:00+01:00`,
          min_staff: type === "morning" ? (weekend ? 2 : 3) : 2,
          max_staff:
            type === "morning"
              ? null
              : type === "afternoon"
                ? weekend
                  ? 3
                  : 4
                : 4,
          required_skills: [],
        });
      team.forEach((n) =>
        d.assignments.push({ staff_id: id(100 + n), shift_id: night }),
      );
      const working = ordinary.filter((x) => x.days.includes(day));
      const afternoonIds = new Set(
        working.filter((x) => afternoonTeam.includes(x.i)).map((x) => x.i),
      );
      working.forEach((x) =>
        d.assignments.push({
          staff_id: x.n.id,
          shift_id: afternoonIds.has(x.i) ? afternoon : morning,
        }),
      );
    }
  }
  return d;
}
