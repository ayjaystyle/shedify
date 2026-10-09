"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  Building2,
  CalendarDays,
  Users,
  Settings2,
  ClipboardList,
  ArrowUpRight,
  Plus,
  ShieldCheck,
  Clock3,
  Menu,
  LogOut,
} from "lucide-react";
import type { Snapshot, Assignment, Validation } from "@/domain/model";
type Row = Record<string, unknown> & { id?: string };
type Field = {
  key: string;
  label: string;
  type?: string;
  options?: [string, string][];
  source?: string;
  optional?: boolean;
  default?: string;
};
const ward: Field = { key: "ward_id", label: "Ward", source: "wards" };
const staff: Field = { key: "staff_id", label: "Nurse", source: "staff" };
const catalog: Record<string, { title: string; fields: Field[] }> = {
  wards: { title: "Ward", fields: [{ key: "name", label: "Ward name" }] },
  staff: {
    title: "Nurse",
    fields: [
      { key: "full_name", label: "Full name" },
      ward,
      { key: "rank_id", label: "Rank", source: "ranks", optional: true },
      { key: "active", label: "Active", type: "checkbox" },
      { key: "eligible", label: "Eligible for scheduling", type: "checkbox" },
    ],
  },
  ranks: {
    title: "Nursing rank",
    fields: [{ key: "name", label: "Rank name" }],
  },
  qualifications: {
    title: "Qualification",
    fields: [{ key: "name", label: "Qualification name" }],
  },
  staff_qualifications: {
    title: "Staff qualification",
    fields: [
      staff,
      {
        key: "qualification_id",
        label: "Qualification",
        source: "qualifications",
      },
    ],
  },
  shift_templates: {
    title: "Shift template",
    fields: [
      { key: "name", label: "Shift name" },
      ward,
      { key: "start_time", label: "Start time", type: "time" },
      { key: "end_time", label: "End time", type: "time" },
      {
        key: "min_staff",
        label: "Minimum staff",
        type: "number",
        default: "1",
      },
      {
        key: "max_staff",
        label: "Maximum staff",
        type: "number",
        default: "1",
      },
      {
        key: "required_skills",
        label: "Required qualification IDs or rank:ID (comma separated)",
        type: "array",
        optional: true,
      },
    ],
  },
  shifts: {
    title: "Dated shift",
    fields: [
      { key: "name", label: "Shift name" },
      ward,
      {
        key: "start_at",
        label: "Start (ISO date/time including UTC offset)",
        default: "2026-10-12T07:00:00+01:00",
      },
      {
        key: "end_at",
        label: "End (ISO date/time including UTC offset)",
        default: "2026-10-12T19:00:00+01:00",
      },
      {
        key: "min_staff",
        label: "Minimum staff",
        type: "number",
        default: "1",
      },
      {
        key: "max_staff",
        label: "Maximum staff",
        type: "number",
        default: "1",
      },
      {
        key: "required_skills",
        label: "Required qualification IDs or rank:ID (comma separated)",
        type: "array",
        optional: true,
      },
    ],
  },
  rules: {
    title: "Scheduling rule",
    fields: [
      ward,
      {
        key: "kind",
        label: "Rule",
        options: [
          ["one_shift_per_day", "One shift per scheduling day"],
          ["max_consecutive_days", "Maximum consecutive days"],
          ["min_rest_minutes", "Minimum rest (minutes)"],
          ["fair_shifts", "Fair shift allocation"],
          ["fair_workload", "Balanced workload"],
        ],
      },
      {
        key: "value",
        label: "Value (use 1 for toggles)",
        type: "number",
        default: "1",
      },
      { key: "active", label: "Active", type: "checkbox" },
    ],
  },
  availability: {
    title: "Mandatory unavailability",
    fields: [
      staff,
      { key: "start_at", label: "Start (ISO with offset)" },
      { key: "end_at", label: "End (ISO with offset)" },
    ],
  },
  preferences: {
    title: "Preference",
    fields: [
      staff,
      { key: "start_at", label: "Start (ISO with offset)" },
      { key: "end_at", label: "End (ISO with offset)" },
      { key: "preferred", label: "Prefer working this time", type: "checkbox" },
    ],
  },
  staff_accounts: {
    title: "Staff account link",
    fields: [staff, { key: "user_id", label: "Registered account UUID" }],
  },
  memberships: {
    title: "Hospital membership",
    fields: [
      { key: "user_id", label: "Registered account UUID" },
      {
        key: "role",
        label: "Role",
        options: [
          ["nurse", "Nurse"],
          ["ward_admin", "Ward administrator"],
          ["hospital_admin", "Hospital administrator"],
        ],
      },
    ],
  },
  ward_admins: {
    title: "Ward administrator assignment",
    fields: [
      ward,
      { key: "user_id", label: "Ward administrator account UUID" },
    ],
  },
  roster: {
    title: "Roster period",
    fields: [
      ward,
      { key: "start_date", label: "First day", type: "date" },
      { key: "end_date", label: "Last day", type: "date" },
    ],
  },
  materialize: {
    title: "Create shifts from a template",
    fields: [
      {
        key: "template_id",
        label: "Shift template",
        source: "shift_templates",
      },
      { key: "start_date", label: "First day", type: "date" },
      { key: "end_date", label: "Last day", type: "date" },
    ],
  },
  duty_requests: {
    title: "Duty-change request",
    fields: [
      { key: "roster_id", label: "Published roster", source: "rosters" },
      { key: "shift_id", label: "Assigned shift", source: "shifts" },
      staff,
      { key: "requested_change", label: "Requested change" },
      { key: "reason", label: "Reason" },
    ],
  },
  hospitals: {
    title: "Hospital settings",
    fields: [
      { key: "name", label: "Hospital name" },
      { key: "timezone", label: "IANA time zone", default: "Europe/London" },
      { key: "contact", label: "Contact", optional: true },
      { key: "location", label: "Location", optional: true },
    ],
  },
};
const navigation = [
  ["Overview", Activity],
  ["Wards", Building2],
  ["Nurses", Users],
  ["Shifts", Clock3],
  ["Rules", Settings2],
  ["Rosters", CalendarDays],
  ["Requests", ClipboardList],
  ["Settings", Settings2],
] as const;
async function call(url: string, body?: unknown) {
  const res = await fetch(
    url,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  const data = await res.json();
  if (!res.ok) throw Error(data.error || "Operation failed.");
  return data;
}
const name = (row: Row) =>
  String(
    row.name ||
      row.full_name ||
      (row.start_date ? `${row.start_date} – ${row.end_date}` : row.id) ||
      "",
  );
export default function Dashboard({
  connected,
  signedIn,
}: {
  connected: boolean;
  signedIn: boolean;
}) {
  const [section, setSection] = useState("Overview");
  const [hospitals, setHospitals] = useState<Row[]>([]);
  const [hospital, setHospital] = useState("");
  const [data, setData] = useState<Record<string, Row[]>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [role, setRole] = useState("");
  const [userId, setUserId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<string | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    snapshot: Snapshot;
    validation: Validation;
    jobs: Row[];
  } | null>(null);
  const [mobile, setMobile] = useState(false);
  const load = useCallback(async () => {
    if (!signedIn) return;
    setLoading(true);
    try {
      const result = await call("/api/workspace");
      setHospitals(result.hospitals);
      setUserId(result.userId);
      const chosen = hospital || result.hospitals[0]?.id || "";
      if (chosen) {
        if (!hospital) setHospital(chosen);
        const work = await call(`/api/workspace?hospital=${chosen}`);
        setData(work.data);
        setCounts(work.counts);
        setRole(work.role);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to load hospital.");
    } finally {
      setLoading(false);
    }
  }, [hospital, signedIn]);
  useEffect(() => {
    void load();
  }, [load]);
  const openRoster = useCallback(async (id: string) => {
    setSelected(id);
    try {
      const result = await call(`/api/rosters/${id}`);
      setDetail(result.snapshot ? result : null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to load roster.");
    }
  }, []);
  useEffect(() => {
    if (
      !selected ||
      !detail?.jobs.some((j) =>
        ["pending", "submitting", "solving"].includes(String(j.state)),
      )
    )
      return;
    const timer = setInterval(() => void openRoster(selected), 15000);
    return () => clearInterval(timer);
  }, [selected, detail, openRoster]);
  const admin = role === "hospital_admin";
  const current = hospitals.find((h) => h.id === hospital);
  const timezone = String(current?.timezone || "Europe/London");
  const begin = (entity: string, row: Row | null = null) => {
    setEditing(row);
    setForm(entity);
    setMessage("");
  };
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form) return;
    const raw = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = {};
    for (const field of (form === "onboard" ? catalog.hospitals : catalog[form])
      .fields) {
      const value = raw.get(field.key);
      payload[field.key] =
        field.type === "checkbox"
          ? value === "on"
          : field.type === "number"
            ? Number(value)
            : field.type === "array"
              ? String(value || "")
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean)
              : value || null;
    }
    setLoading(true);
    try {
      const action =
        form === "onboard"
          ? "onboard"
          : form === "roster"
            ? "roster"
            : form === "materialize"
              ? "materialize"
              : editing
                ? "update"
                : "create";
      const result = await call("/api/workspace", {
        action,
        ...(hospital ? { hospital_id: hospital } : {}),
        ...(action === "create" || action === "update" ? { entity: form } : {}),
        ...(editing?.id ? { id: editing.id } : {}),
        data: payload,
      });
      setForm(null);
      if (form === "onboard") setHospital(result.id);
      await load();
      setMessage("Saved successfully.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setLoading(false);
    }
  }
  async function rosterAction(action: string, assignments?: Assignment[]) {
    if (!selected) return;
    setLoading(true);
    try {
      const result = await call(`/api/rosters/${selected}`, {
        action,
        ...(assignments ? { assignments } : {}),
      });
      setMessage(
        action === "validate"
          ? result.valid
            ? "All mandatory checks passed."
            : "Validation failed. Review the reported issues."
          : action === "publish"
            ? "Roster published."
            : action === "generate"
              ? "Timefold job queued."
              : "Operation completed.",
      );
      await openRoster(selected);
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Roster operation failed.");
    } finally {
      setLoading(false);
    }
  }
  const renderTable = (entity: string, columns: string[], editable = false) => {
    const rows = data[entity] || [];
    return (
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c}>{c.replaceAll("_", " ")}</th>
              ))}
              {editable && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={String(row.id || i)}>
                {columns.map((c) => (
                  <td key={c}>
                    {typeof row[c] === "boolean"
                      ? row[c]
                        ? "Yes"
                        : "No"
                      : c.endsWith("_id")
                        ? name(
                            (
                              data[
                                c === "ward_id"
                                  ? "wards"
                                  : c === "staff_id"
                                    ? "staff"
                                    : c === "rank_id"
                                      ? "ranks"
                                      : c === "qualification_id"
                                        ? "qualifications"
                                        : c === "shift_id"
                                          ? "shifts"
                                          : c === "roster_id"
                                            ? "rosters"
                                            : "memberships"
                              ] || []
                            ).find((x) => x.id === row[c]) || { name: row[c] },
                          )
                        : Array.isArray(row[c])
                          ? (row[c] as string[]).join(", ")
                          : String(row[c] ?? "—")}
                  </td>
                ))}
                {editable && (
                  <td>
                    <button
                      className="text-emerald-800 underline text-sm"
                      onClick={() => begin(entity, row)}
                    >
                      Edit
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <div className="py-12 text-center muted">
            No {entity.replaceAll("_", " ")} yet.{" "}
            {admin ? "Create a record to get started." : ""}
          </div>
        )}
        {(counts[entity] || 0) > rows.length && (
          <p className="muted py-3">
            Showing the first {rows.length} of {counts[entity]} records.
          </p>
        )}
      </div>
    );
  };
  const toolbar = (title: string, entities: string[]) => (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
      <h2>{title}</h2>
      <div className="flex flex-wrap gap-2">
        {entities.map((entity) => (
          <button
            key={entity}
            className="primary flex gap-2 items-center text-sm"
            onClick={() => begin(entity)}
          >
            <Plus size={15} />
            {catalog[entity].title}
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <div className="min-h-screen flex">
      <aside
        className={`${mobile ? "block" : "hidden"} md:block w-60 shrink-0 border-r border-[#dfe7e2] bg-[#fbfcfb] p-6 fixed md:sticky top-0 h-screen z-20`}
      >
        <a href="/" className="text-3xl font-bold tracking-tight">
          shedify<span className="text-[#197b63]">.</span>
        </a>
        <p className="text-[10px] tracking-[.14em] uppercase text-[#7a8c85] mt-2">
          Nursing roster management
        </p>
        <div className="mt-9 border-y border-[#e0e8e2] py-4">
          <p className="text-xs muted mb-2">Your hospital</p>
          {hospitals.length ? (
            <select
              aria-label="Select hospital"
              value={hospital}
              onChange={(e) => {
                setHospital(e.target.value);
                setSelected(null);
                setDetail(null);
              }}
            >
              {hospitals.map((h) => (
                <option key={h.id} value={h.id}>
                  {String(h.name)}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm">Hospital setup</p>
          )}
        </div>
        <nav className="mt-7 space-y-2">
          {navigation
            .filter(
              ([label]) =>
                role !== "nurse" ||
                ["Overview", "Rosters", "Requests"].includes(label),
            )
            .map(([label, Icon]) => (
              <button
                key={label}
                onClick={() => {
                  setSection(label);
                  setMobile(false);
                }}
                className={`flex items-center gap-3 w-full text-left px-3 py-3 rounded-lg text-sm ${section === label ? "bg-[#e8f1eb] text-[#22634e] font-semibold" : "text-[#687b72] hover:bg-[#f0f4f1]"}`}
              >
                <Icon size={18} />
                {label}
                {section === label && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-700" />
                )}
              </button>
            ))}
        </nav>
        <div className="absolute bottom-7 left-6 right-6 border-t border-[#e0e8e2] pt-5">
          <div className="flex items-center gap-2 text-xs muted">
            <ShieldCheck size={16} />
            Tenant isolated workspace
          </div>
          {signedIn && (
            <button
              className="flex items-center gap-2 mt-4 text-sm"
              onClick={async () => {
                await call("/api/auth", { mode: "logout" });
                location.href = "/auth";
              }}
            >
              <LogOut size={16} />
              Sign out
            </button>
          )}
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <header className="h-20 px-6 lg:px-10 border-b border-[#e0e7e2] bg-white flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              aria-label="Toggle navigation"
              className="md:hidden"
              onClick={() => setMobile(!mobile)}
            >
              <Menu />
            </button>
            <span className="muted">
              Workspace <span className="mx-2 text-[#b3c0b9]">/</span>{" "}
              <span className="text-[#213c31]">{section}</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="badge">
              {signedIn
                ? role.replaceAll("_", " ") || "New account"
                : "Setup required"}
            </span>
            {!signedIn && (
              <a href="/auth" className="text-sm font-semibold">
                Sign in <ArrowUpRight className="inline" size={14} />
              </a>
            )}
          </div>
        </header>
        <div className="p-6 lg:p-10 max-w-7xl mx-auto">
          <div className="flex flex-wrap justify-between gap-4 items-start mb-8">
            <div>
              <p className="uppercase text-[11px] tracking-[.15em] text-[#6c8477] mb-3">
                {current ? String(current.name) : "Welcome to Shedify"}
              </p>
              <h1>
                {section === "Overview"
                  ? "A clearer plan for every shift."
                  : section}
              </h1>
              <p className="muted mt-2">
                {section === "Overview"
                  ? "Coordinate your nursing team, review coverage, and publish with confidence."
                  : "Manage your hospital’s nursing roster information."}
              </p>
            </div>
            {signedIn && (
              <button
                className="primary flex items-center gap-2"
                onClick={() => begin("onboard")}
              >
                <Plus size={17} />
                New hospital
              </button>
            )}
          </div>
          {!connected && (
            <section className="card border-l-4 border-l-[#d39a45] mb-7">
              <h2>Connect your services to start scheduling</h2>
              <p className="muted mt-3">
                The application requires a Supabase project for authentication
                and persistent data. Configure the environment variables and
                apply the database migrations, then sign in to create your
                hospital.
              </p>
              <p className="muted mt-3">
                Roster generation uses the hosted Timefold API. No schedules are
                generated until the server credentials are configured.
              </p>
              <a
                className="inline-flex items-center gap-2 text-emerald-800 font-semibold mt-4"
                href="https://github.com/ayjaystyle/shedify/tree/develop/shedify-greenfield/docs"
              >
                Open setup guide <ArrowUpRight size={15} />
              </a>
            </section>
          )}
          {connected && !signedIn && (
            <section className="card mb-7">
              <h2>Sign in to your workspace</h2>
              <p className="muted mt-2">
                Register a personal account, then create a hospital or ask your
                administrator to add your membership.
              </p>
              <a
                href="/auth"
                className="inline-block mt-4 text-emerald-800 font-semibold"
              >
                Sign in or register →
              </a>
            </section>
          )}
          {signedIn && !hospitals.length && !loading && (
            <section className="card mb-7">
              <h2>Create your first hospital</h2>
              <p className="muted mt-2">
                You will become the administrator of the hospital you create.
                Registration alone grants no access to existing hospitals.
              </p>
              <button className="primary mt-4" onClick={() => begin("onboard")}>
                Set up hospital
              </button>
            </section>
          )}
          {message && (
            <div
              role="status"
              className="card mb-6 text-sm flex justify-between gap-4"
            >
              <span>{message}</span>
              <button
                aria-label="Dismiss notification"
                onClick={() => setMessage("")}
              >
                ×
              </button>
            </div>
          )}
          {loading && (
            <p role="status" className="muted mb-4">
              Working…
            </p>
          )}
          {section === "Overview" && (
            <>
              <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-7">
                {[
                  ["Wards", counts.wards || 0, Building2],
                  ["Nurses in view", counts.staff || 0, Users],
                  ["Dated shifts", counts.shifts || 0, Clock3],
                  ["Roster periods", counts.rosters || 0, CalendarDays],
                ].map(([label, count, Icon]) => {
                  const I = Icon as typeof Activity;
                  return (
                    <div className="card" key={String(label)}>
                      <div className="flex justify-between items-center">
                        <p className="muted">{String(label)}</p>
                        <I size={19} className="text-[#699080]" />
                      </div>
                      <p className="text-4xl font-semibold tracking-tight mt-5">
                        {connected && signedIn ? Number(count) : "—"}
                      </p>
                      <p className="muted text-xs mt-3">
                        {connected && signedIn
                          ? "From your permitted hospital records"
                          : "Connect your hospital to begin"}
                      </p>
                    </div>
                  );
                })}
              </div>
              <div className="grid lg:grid-cols-[1.6fr_1fr] gap-6">
                <section className="card">
                  <div className="flex justify-between mb-6">
                    <h2>
                      {role === "nurse"
                        ? "Your published assignments"
                        : "Recent rosters"}
                    </h2>
                    <button
                      className="text-sm text-emerald-800"
                      onClick={() => setSection("Rosters")}
                    >
                      View all →
                    </button>
                  </div>
                  {role === "nurse"
                    ? renderTable("assignments", ["shift_id", "roster_id"])
                    : renderTable("rosters", [
                        "start_date",
                        "end_date",
                        "status",
                      ])}
                </section>
                <section className="card">
                  <div className="flex gap-2 items-center">
                    <ShieldCheck size={20} className="text-emerald-700" />
                    <h2>Before you publish</h2>
                  </div>
                  <ol className="mt-6 space-y-5">
                    {[
                      "Configure staff, qualifications and shifts",
                      "Generate a candidate with Timefold",
                      "Review independent validation",
                      "Publish a valid roster",
                    ].map((label, i) => (
                      <li key={label} className="flex gap-3 text-sm">
                        <span className="rounded-full bg-[#edf3ed] text-emerald-800 h-6 w-6 grid place-items-center shrink-0 text-xs">
                          {i + 1}
                        </span>
                        {label}
                      </li>
                    ))}
                  </ol>
                  <p className="muted text-xs mt-6">
                    Publication rechecks mandatory rules and rejects changed
                    scheduling data.
                  </p>
                </section>
              </div>
            </>
          )}
          {section === "Wards" && (
            <section className="card">
              {toolbar("Hospital wards", admin ? ["wards", "ward_admins"] : [])}
              {renderTable("wards", ["name", "active"], admin)}
              {admin && (
                <div className="mt-8">
                  {renderTable("ward_admins", ["ward_id", "user_id"])}
                </div>
              )}
            </section>
          )}
          {section === "Nurses" && (
            <>
              <section className="card mb-5">
                {toolbar(
                  "Nursing team",
                  admin || role === "ward_admin" ? ["staff"] : [],
                )}
                {renderTable(
                  "staff",
                  ["full_name", "ward_id", "active", "eligible"],
                  admin || role === "ward_admin",
                )}
              </section>
              {admin && (
                <section className="card">
                  {toolbar("Ranks & qualifications", [
                    "ranks",
                    "qualifications",
                    "staff_qualifications",
                  ])}
                  {renderTable("ranks", ["name", "id"])}
                  {renderTable("qualifications", ["name", "id"])}
                  {renderTable("staff_qualifications", [
                    "staff_id",
                    "qualification_id",
                  ])}
                </section>
              )}
            </>
          )}
          {section === "Shifts" && (
            <>
              <section className="card mb-5">
                {toolbar(
                  "Shift templates",
                  admin ? ["shift_templates", "materialize"] : [],
                )}
                <p className="muted mb-4">
                  Times use the hospital time zone: {timezone}. Overnight
                  templates finish the next day.
                </p>
                {renderTable(
                  "shift_templates",
                  ["name", "start_time", "end_time", "min_staff", "max_staff"],
                  admin,
                )}
              </section>
              <section className="card">
                {toolbar("Dated shifts", admin ? ["shifts"] : [])}
                {renderTable(
                  "shifts",
                  ["name", "start_at", "end_at", "min_staff", "max_staff"],
                  admin,
                )}
              </section>
            </>
          )}
          {section === "Rules" && (
            <>
              <section className="card mb-5">
                {toolbar("Scheduling constraints", admin ? ["rules"] : [])}
                <p className="muted mb-4">
                  Staffing, qualification, ward, overlap and unavailability
                  checks are always mandatory. Fairness rules are preferences.
                </p>
                {renderTable(
                  "rules",
                  ["ward_id", "kind", "value", "active"],
                  admin,
                )}
              </section>
              <section className="card mb-5">
                {toolbar("Unavailability", admin ? ["availability"] : [])}
                {renderTable("availability", [
                  "staff_id",
                  "start_at",
                  "end_at",
                ])}
              </section>
              <section className="card">
                {toolbar("Preferences", admin ? ["preferences"] : [])}
                {renderTable("preferences", [
                  "staff_id",
                  "start_at",
                  "end_at",
                  "preferred",
                ])}
              </section>
            </>
          )}
          {section === "Rosters" && (
            <>
              <section className="card">
                {toolbar("Roster periods", admin ? ["roster"] : [])}
                {renderTable("rosters", [
                  "ward_id",
                  "start_date",
                  "end_date",
                  "status",
                ])}
                <div className="flex flex-wrap gap-2 mt-5">
                  {(data.rosters || []).map((r) => (
                    <button
                      key={r.id}
                      className="badge"
                      onClick={() => void openRoster(r.id!)}
                    >
                      Review {String(r.start_date)} →
                    </button>
                  ))}
                </div>
                {role === "nurse" && (
                  <div className="mt-6">
                    {renderTable("assignments", ["shift_id", "roster_id"])}
                  </div>
                )}
              </section>
              {detail && (
                <section className="card mt-6">
                  <div className="flex justify-between items-center mb-5">
                    <h2>Roster review · {detail.snapshot.roster.start_date}</h2>
                    <span className="badge">
                      {detail.snapshot.roster.status.replaceAll("_", " ")}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-5">
                    {admin && detail.snapshot.roster.status !== "published" && (
                      <>
                        {[
                          "generate",
                          "process",
                          "validate",
                          "publish",
                          "cancel",
                        ].map((action) => (
                          <button
                            key={action}
                            className="primary text-sm capitalize"
                            disabled={
                              loading ||
                              (action === "publish" && !detail.validation.valid)
                            }
                            onClick={() => void rosterAction(action)}
                          >
                            {action === "process"
                              ? "Check Timefold job"
                              : action === "generate"
                                ? "Generate with Timefold"
                                : action}
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                  {detail.jobs.map((job) => (
                    <p key={job.id} className="muted mb-2">
                      Job: {String(job.state)} {String(job.error || "")}
                    </p>
                  ))}
                  <p
                    className={`text-sm font-semibold mb-4 ${detail.validation.valid ? "text-emerald-800" : "text-amber-800"}`}
                  >
                    {detail.validation.valid
                      ? "Mandatory checks passed"
                      : "Roster requires attention"}
                  </p>
                  {detail.validation.violations.map((v, i) => (
                    <div className="error mb-2 text-sm" key={i}>
                      {v.message}
                    </div>
                  ))}
                  <div className="overflow-x-auto">
                    <table>
                      <thead>
                        <tr>
                          <th>Shift</th>
                          <th>Starts</th>
                          <th>Assigned nurses</th>
                          <th>Coverage</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.snapshot.shifts.map((shift) => {
                          const assignments =
                            detail.snapshot.assignments.filter(
                              (a) => a.shift_id === shift.id,
                            );
                          return (
                            <tr key={shift.id}>
                              <td>{shift.name}</td>
                              <td>
                                {new Date(shift.start_at).toLocaleString(
                                  "en-GB",
                                  { timeZone: timezone },
                                )}
                              </td>
                              <td>
                                {assignments
                                  .map(
                                    (a) =>
                                      detail.snapshot.staff.find(
                                        (s) => s.id === a.staff_id,
                                      )?.full_name,
                                  )
                                  .join(", ") || "Unassigned"}
                                {admin &&
                                  !["published", "generating"].includes(
                                    detail.snapshot.roster.status,
                                  ) && (
                                    <select
                                      aria-label={`Add nurse to ${shift.name}`}
                                      value=""
                                      onChange={(e) => {
                                        if (e.target.value)
                                          void rosterAction("edit", [
                                            ...detail.snapshot.assignments,
                                            {
                                              shift_id: shift.id,
                                              staff_id: e.target.value,
                                            },
                                          ]);
                                      }}
                                    >
                                      <option value="">Add nurse…</option>
                                      {detail.snapshot.staff
                                        .filter(
                                          (s) =>
                                            s.active &&
                                            s.eligible &&
                                            !assignments.some(
                                              (a) => a.staff_id === s.id,
                                            ),
                                        )
                                        .map((s) => (
                                          <option key={s.id} value={s.id}>
                                            {s.full_name}
                                          </option>
                                        ))}
                                    </select>
                                  )}
                                {admin &&
                                  !["published", "generating"].includes(
                                    detail.snapshot.roster.status,
                                  ) &&
                                  assignments.map((a) => (
                                    <button
                                      className="block underline text-xs mt-2"
                                      key={a.staff_id}
                                      onClick={() =>
                                        void rosterAction(
                                          "edit",
                                          detail.snapshot.assignments.filter(
                                            (x) =>
                                              !(
                                                x.shift_id === a.shift_id &&
                                                x.staff_id === a.staff_id
                                              ),
                                          ),
                                        )
                                      }
                                    >
                                      Remove{" "}
                                      {
                                        detail.snapshot.staff.find(
                                          (s) => s.id === a.staff_id,
                                        )?.full_name
                                      }
                                    </button>
                                  ))}
                              </td>
                              <td>
                                {assignments.length} / {shift.min_staff} minimum
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}
          {section === "Requests" && (
            <section className="card">
              {toolbar(
                "Duty-change requests",
                role === "nurse" ? ["duty_requests"] : [],
              )}
              <p className="muted mb-4">
                Request approval records the administrator’s decision. It does
                not change a published roster.
              </p>
              {renderTable("duty_requests", [
                "staff_id",
                "shift_id",
                "requested_change",
                "reason",
                "status",
              ])}
              {role !== "nurse" &&
                (data.duty_requests || [])
                  .filter((r) => r.status === "pending")
                  .map((r) => (
                    <div className="flex gap-2 mt-4" key={r.id}>
                      <span className="muted">
                        {String(r.requested_change)}
                      </span>
                      {["approved", "rejected"].map((status) => (
                        <button
                          className="badge"
                          key={status}
                          onClick={async () => {
                            try {
                              await call("/api/workspace", {
                                action: "review",
                                hospital_id: hospital,
                                id: r.id,
                                data: { status },
                              });
                              await load();
                            } catch (e) {
                              setMessage(
                                e instanceof Error
                                  ? e.message
                                  : "Review failed.",
                              );
                            }
                          }}
                        >
                          {status === "approved" ? "Approve" : "Reject"}
                        </button>
                      ))}
                    </div>
                  ))}
            </section>
          )}
          {section === "Settings" && admin && (
            <>
              <section className="card mb-5">
                {toolbar("Hospital administration", [
                  "memberships",
                  "staff_accounts",
                ])}
                <p className="muted mb-4">
                  Your account UUID: {userId}. Add a hospital membership before
                  linking a staff account.
                </p>
                <button
                  className="badge mb-4"
                  onClick={() => begin("hospitals", current || null)}
                >
                  Edit hospital settings
                </button>
                {renderTable("memberships", ["user_id", "role"])}
                {renderTable("staff_accounts", ["staff_id", "user_id"])}
                {(data.staff_accounts || []).map((link) => (
                  <button
                    key={String(link.staff_id)}
                    className="underline text-sm block mt-3"
                    onClick={async () => {
                      try {
                        await call("/api/workspace", {
                          action: "delete",
                          entity: "staff_accounts",
                          hospital_id: hospital,
                          data: { staff_id: link.staff_id },
                        });
                        await load();
                      } catch (e) {
                        setMessage(
                          e instanceof Error ? e.message : "Unlink failed.",
                        );
                      }
                    }}
                  >
                    Unlink {String(link.user_id)}
                  </button>
                ))}
              </section>
            </>
          )}
        </div>
      </main>
      {form && (
        <div
          className="fixed inset-0 z-30 bg-[#152c25]/40 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="form-title"
        >
          <section className="card w-full max-w-lg max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between">
              <h2 id="form-title">
                {editing ? "Edit " : form === "onboard" ? "Create " : "Add "}
                {form === "onboard" ? "hospital" : catalog[form].title}
              </h2>
              <button onClick={() => setForm(null)} aria-label="Close form">
                ×
              </button>
            </div>
            <form onSubmit={submit}>
              {(form === "onboard"
                ? catalog.hospitals
                : catalog[form]
              ).fields.map((field) => (
                <div key={field.key}>
                  <label htmlFor={field.key}>{field.label}</label>
                  {field.source || field.options ? (
                    <select
                      id={field.key}
                      name={field.key}
                      required={!field.optional}
                      defaultValue={String(editing?.[field.key] || "")}
                    >
                      <option value="">Select…</option>
                      {(
                        field.options ||
                        (data[field.source!] || []).map((r) => [r.id!, name(r)])
                      ).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={field.key}
                      name={field.key}
                      type={
                        field.type === "array" ? "text" : field.type || "text"
                      }
                      required={!field.optional && field.type !== "checkbox"}
                      defaultChecked={
                        field.type === "checkbox"
                          ? editing
                            ? !!editing[field.key]
                            : true
                          : undefined
                      }
                      defaultValue={
                        field.type === "checkbox"
                          ? undefined
                          : Array.isArray(editing?.[field.key])
                            ? (editing![field.key] as string[]).join(",")
                            : String(
                                editing?.[field.key] ?? field.default ?? "",
                              )
                      }
                    />
                  )}
                </div>
              ))}
              {message && (
                <p role="alert" className="error mt-4">
                  {message}
                </p>
              )}
              <div className="flex justify-end gap-4 mt-6">
                <button type="button" onClick={() => setForm(null)}>
                  Cancel
                </button>
                <button className="primary" disabled={loading}>
                  Save
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
