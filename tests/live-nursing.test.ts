// Explicit opt-in only. Uses authorized fictional QA accounts, never real ward data.
import { it, expect } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFile, writeFile } from "node:fs/promises";
import { nursingFixture } from "./nursing-fixture";
import { snapshot } from "@/services/rosters";
import { validateRoster } from "@/domain/validate";
it.skipIf(process.env.RUN_LIVE_INFEASIBLE !== "1")(
  "rejects publication of an actual Timefold staffing shortage",
  async () => {
    const f = JSON.parse(await readFile("work/live-verification.json", "utf8")),
      a = f.accounts.find((a: { role: string }) => a.role === "admin"),
      app = process.env.NEXT_PUBLIC_APP_URL!;
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );
    const r = await fetch(app + "/api/auth", {
      method: "POST",
      headers: { origin: app, "content-type": "application/json" },
      body: JSON.stringify({
        mode: "login",
        email: a.email,
        password: a.password,
      }),
    });
    expect(r.status).toBe(200);
    const cookie = r.headers
      .getSetCookie()
      .map((s) => s.split(";")[0])
      .join("; ");
    const api = async (path: string, body: unknown, status = 200) => {
      const r = await fetch(app + path, {
        method: "POST",
        headers: { origin: app, cookie, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await r.json();
      expect(r.status, JSON.stringify(result)).toBe(status);
      return result;
    };
    let roster: string;
    try {
      roster = JSON.parse(
        await readFile("work/live-shortage.json", "utf8"),
      ).roster;
    } catch {
      const ward = await db
        .from("wards")
        .insert({
          hospital_id: f.hospital,
          name: `Fictional shortage QA ${Date.now()}`,
        })
        .select("id")
        .single();
      expect(ward.error).toBeNull();
      const staff = await db
        .from("staff")
        .insert(
          Array.from({ length: 4 }, (_, i) => ({
            hospital_id: f.hospital,
            ward_id: ward.data!.id,
            full_name: `Fictional shortage nurse ${i + 1}`,
          })),
        );
      expect(staff.error).toBeNull();
      const shifts = await db
        .from("shifts")
        .insert({
          hospital_id: f.hospital,
          ward_id: ward.data!.id,
          name: "Five required, four eligible",
          shift_type: "morning",
          times_confirmed: true,
          start_at: "2026-12-14T07:30:00+01:00",
          end_at: "2026-12-14T15:00:00+01:00",
          min_staff: 5,
          max_staff: 5,
        });
      expect(shifts.error).toBeNull();
      roster = (
        await api("/api/workspace", {
          action: "roster",
          hospital_id: f.hospital,
          data: {
            ward_id: ward.data!.id,
            start_date: "2026-12-14",
            end_date: "2026-12-14",
          },
        })
      ).id;
      await writeFile("work/live-shortage.json", JSON.stringify({ roster }), {
        mode: 0o600,
      });
    }
    const existing = await db.from("jobs").select("id").eq("roster_id", roster);
    if (!existing.data?.length)
      await api(`/api/rosters/${roster}`, { action: "generate" });
    let external: string | null = null;
    const until = Date.now() + 10 * 60000;
    while (Date.now() < until) {
      await api(`/api/rosters/${roster}`, { action: "process" });
      const { data: job, error } = await db
        .from("jobs")
        .select("state,external_id,error")
        .eq("roster_id", roster)
        .single();
      expect(error).toBeNull();
      if (job!.state === "completed") {
        external = job!.external_id;
        break;
      }
      if (["failed", "submission_unknown", "cancelled"].includes(job!.state))
        throw Error(`Real shortage test failed: ${job!.error}`);
      await new Promise((r) => setTimeout(r, 5000));
    }
    expect(external).toBeTruthy();
    const validation = await api(`/api/rosters/${roster}`, {
      action: "validate",
    });
    expect(validation.valid).toBe(false);
    expect(
      validation.violations.some(
        (v: { rule: string }) => v.rule === "minimum_staffing",
      ),
    ).toBe(true);
    await api(`/api/rosters/${roster}`, { action: "approve" }, 409);
    await api(`/api/rosters/${roster}`, { action: "publish" }, 409);
    await writeFile(
      "work/live-shortage-result.json",
      JSON.stringify({
        result: "PASS",
        roster,
        realTimefold: external,
        validation,
        approvalBlocked: true,
        publicationBlocked: true,
      }),
      { mode: 0o600 },
    );
  },
  900000,
);
it.skipIf(process.env.RUN_LIVE_NURSING !== "1")(
  "verifies live ward controls and real four-week Timefold generation",
  async () => {
    const f = JSON.parse(await readFile("work/live-verification.json", "utf8"));
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!,
      key = process.env.SUPABASE_SERVICE_ROLE_KEY!,
      app = process.env.NEXT_PUBLIC_APP_URL!;
    expect(url).toBe(f.projectUrl);
    const db = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const sessions: Record<string, string> = {},
      clients: Record<string, SupabaseClient> = {};
    for (const role of ["admin", "ward_admin", "nurse"]) {
      const a = f.accounts.find((a: { role: string }) => a.role === role);
      const r = await fetch(app + "/api/auth", {
        method: "POST",
        headers: { origin: app, "content-type": "application/json" },
        body: JSON.stringify({
          mode: "login",
          email: a.email,
          password: a.password,
        }),
      });
      expect(r.status, `${role} login`).toBe(200);
      sessions[role] = r.headers
        .getSetCookie()
        .map((s) => s.split(";")[0])
        .join("; ");
      const client = createClient(
        url,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      const login = await client.auth.signInWithPassword({
        email: a.email,
        password: a.password,
      });
      expect(login.error).toBeNull();
      clients[role] = client;
    }
    const api = async (
      role: string,
      path: string,
      body?: unknown,
      status = 200,
    ) => {
      const r = await fetch(app + path, {
        method: body ? "POST" : "GET",
        headers: {
          origin: app,
          cookie: sessions[role],
          "content-type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const value = await r.json();
      expect(r.status, `${path}: ${value.error || ""}`).toBe(status);
      return value;
    };
    const required = async <T>(
      query: PromiseLike<{ data: T; error: unknown }>,
    ) => {
      const r = await query;
      expect(r.error).toBeNull();
      return r.data!;
    };
    let state: {
      ward: string;
      rank: string;
      roster: string;
      staff: string[];
      nightJob?: string;
      published?: boolean;
    };
    try {
      state = JSON.parse(await readFile("work/live-nursing.json", "utf8"));
    } catch {
      const d = nursingFixture(),
        tag = Date.now();
      const ward = await required(
        db
          .from("wards")
          .insert({
            hospital_id: f.hospital,
            name: `Fictional Nursing QA ${tag}`,
          })
          .select("id")
          .single(),
      );
      const rank = await required(
        db
          .from("ranks")
          .insert({
            hospital_id: f.hospital,
            name: `Fictional QA Senior ${tag}`,
            abbreviation: "QA",
            seniority: 1,
          })
          .select("id")
          .single(),
      );
      const nurses = await required(
        db
          .from("staff")
          .insert(
            d.staff.map((n) => ({
              hospital_id: f.hospital,
              ward_id: ward.id,
              full_name: n.full_name,
              rank_id: rank.id,
            })),
          )
          .select("id"),
      );
      const account = f.accounts.find(
        (a: { role: string }) => a.role === "ward_admin",
      );
      await required(
        db.from("ward_admins").insert({
          hospital_id: f.hospital,
          ward_id: ward.id,
          user_id: account.id,
        }),
      );
      await required(
        clients.admin.from("ward_policies").insert({
          hospital_id: f.hospital,
          ward_id: ward.id,
          enabled: true,
          senior_rank_ids: [rank.id],
          effective_from: d.roster.start_date,
          safety_reference:
            "FICTIONAL QA ONLY — no operational occupational-health authorization",
          max_night_minutes: 720,
          institutional_approved: true,
        }),
      );
      await required(
        db.from("rules").insert(
          [
            { kind: "one_shift_per_day", value: 1 },
            { kind: "min_rest_minutes", value: 660 },
            { kind: "max_consecutive_days", value: 7 },
          ].map((r) => ({ ...r, hospital_id: f.hospital, ward_id: ward.id })),
        ),
      );
      const { id } = await api("ward_admin", "/api/workspace", {
        action: "roster",
        hospital_id: f.hospital,
        data: {
          ward_id: ward.id,
          start_date: d.roster.start_date,
          end_date: d.roster.end_date,
        },
      });
      await required(
        db.from("shifts").insert(
          d.shifts.map((s) => {
            const { id: _id, ...rest } = s;
            void _id;
            return { ...rest, hospital_id: f.hospital, ward_id: ward.id };
          }),
        ),
      );
      await required(
        clients.ward_admin.from("night_teams").insert(
          d.night_teams!.map((n) => ({
            hospital_id: f.hospital,
            roster_id: id,
            staff_id: nurses[d.staff.findIndex((s) => s.id === n.staff_id)].id,
            week_start: n.week_start,
          })),
        ),
      );
      state = {
        ward: ward.id,
        rank: rank.id,
        roster: id,
        staff: nurses.map((n) => n.id),
      };
      await writeFile("work/live-nursing.json", JSON.stringify(state), {
        mode: 0o600,
      });
    }
    const record = (entity: string, data: unknown) => ({
      action: "create",
      entity,
      hospital_id: f.hospital,
      data,
    });
    const blocked = await clients.ward_admin
      .from("ward_policies")
      .update({ institutional_approved: false })
      .eq("ward_id", state.ward);
    // Ward can revoke approval, but cannot grant institutional authority. Restore only via the authorized QA Hospital Administrator.
    expect(blocked.error).toBeNull();
    const approve = await clients.ward_admin
      .from("ward_policies")
      .update({ institutional_approved: true })
      .eq("ward_id", state.ward);
    expect(approve.error).not.toBeNull();
    await required(
      clients.admin
        .from("ward_policies")
        .update({ institutional_approved: true })
        .eq("ward_id", state.ward),
    );
    await api(
      "nurse",
      "/api/workspace",
      record("shift_templates", {
        name: "Unauthorized",
        ward_id: state.ward,
        start_time: "07:30",
        end_time: "15:00",
        min_staff: 1,
        max_staff: 1,
      }),
      403,
    );
    await api(
      "ward_admin",
      "/api/workspace",
      record("shift_templates", {
        name: "Scoped QA time test",
        ward_id: state.ward,
        start_time: "07:30",
        end_time: "15:00",
        shift_type: "morning",
        times_confirmed: true,
        min_staff: 3,
        max_staff: null,
        weekday_min: 3,
        weekday_max: null,
        weekend_min: 2,
        weekend_max: null,
      }),
    );
    const foreign = await clients.nurse
      .from("night_teams")
      .select("*")
      .eq("roster_id", state.roster);
    expect(foreign.data).toEqual([]);
    const current = await required(
      db.from("rosters").select("status").eq("id", state.roster).single(),
    );
    if (current.status !== "published") {
      const jobs = await required(
        db.from("jobs").select("id,state").eq("roster_id", state.roster),
      );
      if (!jobs.length)
        await api("ward_admin", `/api/rosters/${state.roster}`, {
          action: "generate",
        });
      const until = Date.now() + 10 * 60_000;
      let last = "";
      while (Date.now() < until) {
        await api("ward_admin", `/api/rosters/${state.roster}`, {
          action: "process",
        });
        const job = await required(
          db
            .from("jobs")
            .select("state,external_id,error")
            .eq("roster_id", state.roster)
            .order("created_at", { ascending: false })
            .limit(1)
            .single(),
        );
        if (last !== job.state) {
          console.log(
            JSON.stringify({
              state: job.state,
              externalJob: job.external_id,
              error: job.error,
            }),
          );
          last = job.state;
        }
        if (job.state === "completed") {
          state.nightJob = job.external_id;
          break;
        }
        if (["failed", "submission_unknown", "cancelled"].includes(job.state))
          throw new Error(`Real scheduling run ${job.state}: ${job.error}`);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
      expect(state.nightJob).toBeTruthy();
      const data = await snapshot(state.roster),
        validation = validateRoster(data);
      await writeFile(
        "work/live-nursing-result.json",
        JSON.stringify({
          roster: state.roster,
          job: state.nightJob,
          assignments: data.assignments.length,
          validation,
        }),
        { mode: 0o600 },
      );
      console.log(
        JSON.stringify({
          roster: state.roster,
          realTimefold: state.nightJob,
          assignments: data.assignments.length,
          valid: validation.valid,
          violations: validation.violations.slice(0, 10),
        }),
      );
      expect(validation.violations).toEqual([]);
      await api("ward_admin", `/api/rosters/${state.roster}`, {
        action: "approve",
      });
      await api(
        "ward_admin",
        `/api/rosters/${state.roster}`,
        { action: "publish" },
        403,
      );
      await api("admin", `/api/rosters/${state.roster}`, { action: "publish" });
      state.published = true;
      await writeFile("work/live-nursing.json", JSON.stringify(state), {
        mode: 0o600,
      });
    }
    const obligations = await required(
      db
        .from("rotation_obligations")
        .select("*")
        .eq("source_roster_id", state.roster),
    );
    expect(obligations).toHaveLength(8);
    console.log(
      JSON.stringify({
        result: "PASS",
        realTimefold: state.nightJob,
        roster: state.roster,
        published: true,
        obligations: obligations.length,
        wardAndNurseIsolation: true,
      }),
    );
  },
  900000,
);
