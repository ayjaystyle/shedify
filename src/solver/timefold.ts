import { z } from "zod";
import { type Assignment, type Snapshot } from "@/domain/model";
import { zonedIso } from "@/domain/time";
import {
  addDays,
  weekStart,
  validateNursingPolicy,
} from "@/domain/nursing-policy";
import { effectiveRule } from "@/domain/rules";
export function staffingSeats(data: Snapshot, s: Snapshot["shifts"][number]) {
  const team = (data.night_teams || [])
    .filter(
      (n) =>
        n.week_start ===
        weekStart(zonedIso(s.start_at, data.timezone).slice(0, 10)),
    )
    .map((n) => n.staff_id)
    .sort();
  if (data.policy && s.shift_type === "night")
    return Math.max(s.min_staff, team.length);
  if (data.policy && s.shift_type === "morning")
    return (
      s.max_staff ??
      data.staff.filter(
        (n) => n.active && n.eligible && n.category !== "attendant",
      ).length
    );
  return s.min_staff;
}
export const TIMEFOLD_BASE =
  "https://app.timefold.ai/api/models/employee-scheduling/v1";
export interface SolverAdapter {
  submit(input: unknown): Promise<string>;
  status(id: string): Promise<string>;
  result(id: string): Promise<unknown>;
  cancel(id: string): Promise<void>;
}
export class SolverError extends Error {
  constructor(
    message: string,
    public retryable = false,
    public uncertain = false,
  ) {
    super(message);
  }
}
export class TimefoldAdapter implements SolverAdapter {
  constructor(
    private key = process.env.TIMEFOLD_API_KEY,
    private transport: typeof fetch = fetch,
  ) {}
  private async request(path: string, method = "GET", body?: unknown) {
    if (!this.key) throw new SolverError("TIMEFOLD_API_KEY is not configured.");
    let response: Response;
    try {
      response = await this.transport(`${TIMEFOLD_BASE}${path}`, {
        method,
        headers: { "X-API-KEY": this.key, "Content-Type": "application/json" },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(20000),
        cache: "no-store",
      });
    } catch {
      throw new SolverError(
        "Timefold could not be reached. Submission may require reconciliation.",
        method === "GET",
        method === "POST",
      );
    }
    if (!response.ok)
      throw new SolverError(
        response.status === 401 || response.status === 403
          ? "Timefold access was denied. Check the server key and API access."
          : response.status === 429
            ? "Timefold rate limit reached."
            : `Timefold returned HTTP ${response.status}.`,
        response.status === 429 || response.status >= 500,
        method === "POST" && response.status >= 500,
      );
    try {
      return await response.json();
    } catch {
      throw new SolverError(
        "Timefold returned an invalid JSON response.",
        false,
        method === "POST",
      );
    }
  }
  async submit(input: unknown) {
    const data = await this.request("/schedules", "POST", input);
    const parsed = z.object({ id: z.string().min(1) }).safeParse(data);
    if (!parsed.success)
      throw new SolverError(
        "Timefold did not return a job identifier.",
        false,
        true,
      );
    return parsed.data.id;
  }
  async status(id: string) {
    return z
      .object({ solverStatus: z.string() })
      .parse(
        await this.request(`/schedules/${encodeURIComponent(id)}/metadata`),
      ).solverStatus;
  }
  result(id: string) {
    return this.request(`/schedules/${encodeURIComponent(id)}`);
  }
  async cancel(id: string) {
    await this.request(`/schedules/${encodeURIComponent(id)}`, "DELETE");
  }
}
export function mapRequest(data: Snapshot) {
  const rule = (kind: string) => effectiveRule(data, kind);
  const time = (instant: string) => zonedIso(instant, data.timezone);
  const eligible = data.staff.filter(
    (s) =>
      s.active &&
      s.eligible &&
      s.category !== "attendant" &&
      s.ward_id === data.roster.ward_id,
  );
  if (!eligible.length || !data.shifts.length)
    throw new SolverError("Eligible staff and dated shifts are required.");
  if (data.policy) {
    const setup = validateNursingPolicy(data, []).violations.filter((v) =>
      [
        "night_safety_review",
        "night_duration",
        "shift_times",
        "shift_type",
        "senior_configuration",
        "rotation_permission_conflict",
        "night_frequency",
        "four_week_period",
        "night_team_size",
        "night_team_senior",
        "night_team_eligibility",
        "night_team_unavailability",
      ].includes(v.rule),
    );
    if (setup.length)
      throw new SolverError(
        setup
          .slice(0, 3)
          .map((v) => v.message)
          .join(" "),
      );
    const maximum = rule("max_consecutive_days");
    if (maximum !== undefined && maximum < 7)
      throw new SolverError(
        `The seven-night block conflicts with the mandatory maximum of ${maximum} consecutive days. Hospital oversight must resolve this safety-policy conflict; no rule is overridden automatically.`,
      );
  }
  const contract = {
    id: "ward-contract",
    ...(data.policy
      ? {
          multiDayShiftSequencePatternRules: [
            {
              id: "no-afternoon-to-morning",
              satisfiability: "PROHIBITED",
              pattern: [
                { type: "ON", includeShiftTags: ["afternoon"] },
                { type: "ON", includeShiftTags: ["morning"] },
              ],
            },
          ],
        }
      : {}),
    ...(rule("one_shift_per_day") || data.policy
      ? {
          periodRules: [
            {
              id: "one-per-day",
              period: "DAY",
              shiftsWorkedMax: 1,
              satisfiability: "REQUIRED",
            },
          ],
        }
      : {}),
    ...(rule("max_consecutive_days")
      ? {
          consecutiveDaysWorkedRules: [
            {
              id: "consecutive-days",
              maximum: rule("max_consecutive_days"),
              satisfiability: "REQUIRED",
            },
          ],
        }
      : {}),
    ...(rule("min_rest_minutes") !== undefined
      ? {
          minutesBetweenShiftsRules: [
            {
              id: "rest",
              minimumMinutesBetweenShifts: rule("min_rest_minutes"),
              satisfiability: "REQUIRED",
            },
          ],
        }
      : {}),
  };
  const contracts = [
    {
      ...contract,
      ...(data.policy
        ? {
            periodRules: [
              ...(contract.periodRules || []),
              {
                id: "ordinary-week",
                period: "WEEK",
                daysWorkedMax: 4,
                includeShiftTags: ["ordinary-duty"],
                satisfiability: "REQUIRED",
                shiftsWorkedMax: undefined,
              },
              {
                id: "ordinary-week-target",
                period: "WEEK",
                daysWorkedMin: 4,
                daysWorkedMax: 4,
                includeShiftTags: ["ordinary-duty"],
                satisfiability: "PREFERRED",
                shiftsWorkedMax: undefined,
              },
            ],
          }
        : {}),
    },
  ];
  const employees = eligible.map((s) => ({
    id: s.id,
    contracts: ["ward-contract"],
    skills: [
      ...s.skills,
      ...(s.rank_id ? [`rank:${s.rank_id}`] : []),
      ...(s.rank_id && data.policy?.senior_rank_ids.includes(s.rank_id)
        ? ["shedify:senior"]
        : []),
    ].map((id) => ({ id })),
    unavailableTimeSpans: [
      ...data.availability
        .filter((x) => x.staff_id === s.id)
        .map((x) => ({ start: time(x.start_at), end: time(x.end_at) })),
      ...(data.policy
        ? [
            ...(data.obligations || []).map((o) => ({
              staff_id: o.staff_id,
              week_start: o.night_start,
            })),
            ...(data.night_teams || []),
          ]
            .filter((o) => o.staff_id === s.id)
            .flatMap((o) => {
              const last = [...data.shifts, ...data.history.map((h) => h.shift)]
                .filter(
                  (shift) =>
                    shift.shift_type === "night" &&
                    time(shift.start_at).slice(0, 10) ===
                      addDays(o.week_start, 6),
                )
                .sort((a, b) => Date.parse(b.end_at) - Date.parse(a.end_at))[0];
              return last
                ? [
                    {
                      start: time(last.end_at),
                      end: time(
                        new Date(
                          Date.parse(last.end_at) + 7 * 86400000,
                        ).toISOString(),
                      ),
                    },
                  ]
                : [];
            })
        : []),
    ],
    preferredTimeSpans: data.preferences
      .filter((x) => x.staff_id === s.id && x.preferred)
      .flatMap((x) =>
        !x.shift_type || x.shift_type === "all"
          ? [{ start: time(x.start_at), end: time(x.end_at) }]
          : data.shifts
              .filter(
                (shift) =>
                  shift.shift_type === x.shift_type &&
                  Date.parse(shift.start_at) >= Date.parse(x.start_at) &&
                  Date.parse(shift.start_at) < Date.parse(x.end_at),
              )
              .map((shift) => ({
                start: time(shift.start_at),
                end: time(shift.end_at),
              })),
      ),
    unpreferredTimeSpans: data.preferences
      .filter((x) => x.staff_id === s.id && !x.preferred)
      .flatMap((x) =>
        !x.shift_type || x.shift_type === "all"
          ? [{ start: time(x.start_at), end: time(x.end_at) }]
          : data.shifts
              .filter(
                (shift) =>
                  shift.shift_type === x.shift_type &&
                  Date.parse(shift.start_at) >= Date.parse(x.start_at) &&
                  Date.parse(shift.start_at) < Date.parse(x.end_at),
              )
              .map((shift) => ({
                start: time(shift.start_at),
                end: time(shift.end_at),
              })),
      ),
  }));
  // Each shift instance is expanded into required staffing seats. No optional seats are silently invented.
  const shifts = data.shifts.flatMap((s) => {
    const day = time(s.start_at).slice(0, 10),
      week = weekStart(day);
    const team = (data.night_teams || [])
      .filter((n) => n.week_start === week)
      .map((n) => n.staff_id)
      .sort();
    const head = data.staff.find((n) => n.id === data.policy?.head_staff_id);
    const compulsoryHead =
      head &&
      s.shift_type === "morning" &&
      [1, 5].includes(new Date(day + "T00:00:00Z").getUTCDay()) &&
      !data.holidays?.some((h) => h.day === day) &&
      !data.availability.some(
        (a) =>
          a.staff_id === head.id &&
          Date.parse(a.start_at) < Date.parse(s.end_at) &&
          Date.parse(a.end_at) > Date.parse(s.start_at),
      );
    const seniorSeat =
      compulsoryHead &&
      (!head.rank_id || !data.policy?.senior_rank_ids.includes(head.rank_id))
        ? 1
        : 0;
    const commitments = [
      ...(data.obligations || []).map((o) => ({
        staff_id: o.staff_id,
        week_start: o.night_start,
      })),
      ...(data.night_teams || []),
    ];
    const prohibited = eligible
      .filter((n) => {
        if (
          s.shift_type &&
          s.shift_type !== "unspecified" &&
          n[`${s.shift_type}_enabled`] === false
        )
          return true;
        if (!data.policy) return false;
        const weekend = new Date(day + "T00:00:00Z").getUTCDay() % 6 === 0;
        const restricted =
          n.no_weekends ||
          n.id === data.policy.head_staff_id ||
          (n.rank_id && data.policy.no_weekend_rank_ids.includes(n.rank_id));
        if (restricted && weekend) return true;
        if (
          (n.id === data.policy.head_staff_id ||
            (n.rank_id &&
              data.policy.no_weekend_rank_ids.includes(n.rank_id))) &&
          s.shift_type !== "morning"
        )
          return true;
        if (team.includes(n.id) && s.shift_type !== "night") return true;
        if (s.shift_type === "night" && !team.includes(n.id)) return true;
        if (
          commitments.some(
            (o) =>
              o.staff_id === n.id &&
              (week === addDays(o.week_start, 7) ||
                (week === addDays(o.week_start, 14) &&
                  s.shift_type !== "afternoon")),
          )
        )
          return true;
        if (
          data.availability.some(
            (a) =>
              a.staff_id === n.id &&
              a.leave_type === "annual" &&
              day >= time(a.end_at).slice(0, 10) &&
              week === weekStart(time(a.end_at).slice(0, 10)) &&
              s.shift_type !== "morning",
          )
        )
          return true;
        return false;
      })
      .map((n) => n.id);
    return Array.from({ length: staffingSeats(data, s) }, (_, i) => ({
      id: `${s.id}:${i}`,
      start: time(s.start_at),
      end: time(s.end_at),
      requiredSkills: [
        ...s.required_skills,
        ...(data.policy && i === seniorSeat && s.shift_type !== "night"
          ? ["shedify:senior"]
          : []),
      ],
      requiredSkillsMatchKind: "MATCH_ALL",
      prohibitedEmployees: prohibited,
      tags: [
        s.shift_type || "unspecified",
        s.shift_type === "night" ? "night-duty" : "ordinary-duty",
      ],
      priority:
        data.policy && s.shift_type === "morning" && i >= s.min_staff
          ? "5"
          : "1",
      ...(data.policy && s.shift_type === "night" && team[i]
        ? { employee: team[i], pinned: true }
        : compulsoryHead && i === 0
          ? { employee: head.id, pinned: true }
          : {}),
    }));
  });
  const employeeIds = new Set(employees.map((e) => e.id));
  const history = data.history
    .filter((x) => employeeIds.has(x.staff_id))
    .map((x, i) => ({
      id: `history:${i}`,
      start: time(x.shift.start_at),
      end: time(x.shift.end_at),
      employee: x.staff_id,
      pinned: true,
      tags: [
        x.shift.shift_type || "unspecified",
        x.shift.shift_type === "night" ? "night-duty" : "ordinary-duty",
      ],
    }));
  return {
    modelInput: {
      contracts,
      employees,
      shifts: [...history, ...shifts],
      globalRules: {
        unassignedShiftRule: {
          id: "staffing-priority",
          priorityWeights: [
            { priority: "1", weight: 100, assignment: "MANDATORY" },
            { priority: "5", weight: 1, assignment: "OPTIONAL" },
          ],
        },
        ...(rule("fair_shifts")
          ? { balanceShiftCountRules: [{ id: "fair-shifts" }] }
          : {}),
        ...(rule("fair_workload")
          ? { balanceTimeWorkedRules: [{ id: "fair-workload" }] }
          : {}),
      },
    },
  };
}
export function parseResult(raw: unknown, data: Snapshot): Assignment[] {
  const parsed = z
    .object({
      modelOutput: z.object({
        shifts: z.array(
          z.object({
            id: z.string(),
            employee: z.string().nullable().optional(),
          }),
        ),
      }),
    })
    .parse(raw);
  const expected = new Map<string, string>(
    data.shifts.flatMap((s) =>
      Array.from(
        { length: staffingSeats(data, s) },
        (_, i) => [`${s.id}:${i}`, s.id] as const,
      ),
    ),
  );
  const allowedStaff = new Set(
    data.staff
      .filter(
        (s) => s.active && s.eligible && s.ward_id === data.roster.ward_id,
      )
      .map((s) => s.id),
  );
  const seen = new Set<string>();
  const assignments: Assignment[] = [];
  for (const shift of parsed.modelOutput.shifts) {
    if (shift.id.startsWith("history:")) continue;
    if (!expected.has(shift.id) || seen.has(shift.id))
      throw new SolverError(
        "Timefold returned an unknown or duplicate staffing seat.",
      );
    seen.add(shift.id);
    if (!shift.employee) continue;
    if (!allowedStaff.has(shift.employee))
      throw new SolverError(
        "Timefold returned an unknown or ineligible employee.",
      );
    assignments.push({
      shift_id: expected.get(shift.id)!,
      staff_id: shift.employee,
    });
  }
  if (seen.size !== expected.size)
    throw new SolverError("Timefold omitted expected staffing seats.");
  return assignments;
}
