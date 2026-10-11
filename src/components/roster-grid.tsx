"use client";
import type { Snapshot } from "@/domain/model";
import { localDay } from "@/domain/model";
import { addDays } from "@/domain/nursing-policy";
type Rank = {
  id?: unknown;
  name?: unknown;
  abbreviation?: unknown;
  seniority?: unknown;
};
export function RosterGrid({
  snapshot,
  ranks,
}: {
  snapshot: Snapshot;
  ranks: Rank[];
}) {
  const days = Array.from(
    {
      length: Math.min(
        28,
        1 +
          Math.round(
            (Date.parse(snapshot.roster.end_date) -
              Date.parse(snapshot.roster.start_date)) /
              86400000,
          ),
      ),
    },
    (_, i) => addDays(snapshot.roster.start_date, i),
  );
  const rank = (id: string | null) => ranks.find((r) => r.id === id);
  const nurses = [...snapshot.staff]
    .filter((n) => n.category !== "attendant")
    .sort(
      (a, b) =>
        Number(rank(b.rank_id)?.seniority || 0) -
          Number(rank(a.rank_id)?.seniority || 0) ||
        a.full_name.localeCompare(b.full_name),
    );
  const code = (id: string, day: string) => {
    const shifts = snapshot.assignments
      .filter((a) => a.staff_id === id)
      .flatMap((a) =>
        snapshot.shifts.filter(
          (s) =>
            s.id === a.shift_id &&
            localDay(s.start_at, snapshot.timezone) === day,
        ),
      );
    if (shifts.length)
      return shifts
        .map(
          (s) =>
            ({ morning: "M", afternoon: "A", night: "N", unspecified: "?" })[
              s.shift_type || "unspecified"
            ],
        )
        .join("/");
    return snapshot.availability.some(
      (a) =>
        a.staff_id === id &&
        localDay(a.start_at, snapshot.timezone) <= day &&
        localDay(
          new Date(Date.parse(a.end_at) - 1).toISOString(),
          snapshot.timezone,
        ) >= day,
    )
      ? "L"
      : "O";
  };
  const rows = [
    ["Nurse", "Rank", ...days, "Remarks"],
    ...nurses.map((n) => [
      n.full_name,
      String(rank(n.rank_id)?.abbreviation || rank(n.rank_id)?.name || ""),
      ...days.map((d) => code(n.id, d)),
      n.active && n.eligible ? "" : "Inactive/ineligible",
    ]),
  ];
  const download = () => {
    const cell = (s: string) =>
      '"' + (/^[=+@-]/.test(s) ? "'" + s : s).replaceAll('"', '""') + '"';
    const url = URL.createObjectURL(
      new Blob([rows.map((r) => r.map(cell).join(",")).join("\r\n")], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `shedify-${snapshot.roster.start_date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section className="card my-5">
      <div className="flex gap-3 justify-between">
        <h3>Four-week roster</h3>
        <button className="secondary" onClick={download}>
          Export CSV
        </button>
        <button className="secondary" onClick={() => window.print()}>
          Print
        </button>
      </div>
      <p className="muted">
        M Morning · A Afternoon · N Night · O no shift starts · L
        leave/unavailable · ? needs classification. Overnight work may continue
        into an O day.{" "}
        {snapshot.roster.status === "published"
          ? "Published"
          : "Candidate — requires validation and publication"}
        .
      </p>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              {rows[0].map((v, i) => (
                <th key={i}>
                  {v}
                  {days.includes(v) &&
                  snapshot.holidays?.some((h) => h.day === v)
                    ? " ★"
                    : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(1).map((r, i) => (
              <tr key={nurses[i].id}>
                {r.map((v, j) => (
                  <td key={j}>{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">
        ★ public holiday: administrative review required. Rank order follows the
        configured seniority numbers.
      </p>
    </section>
  );
}
