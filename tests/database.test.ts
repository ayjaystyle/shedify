import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { id } from "./fixtures";
let pg: PGlite;
const admin = id(101),
  nurse = id(102),
  outsider = id(103),
  wardAdmin = id(104);
let hospital: string,
  otherHospital: string,
  ward: string,
  otherWard: string,
  staff: string,
  shift: string,
  roster: string;
async function asUser<T>(user: string, fn: () => Promise<T>) {
  await pg.exec(
    `set role authenticated; select set_config('request.jwt.claim.sub','${user}',false);`,
  );
  try {
    return await fn();
  } finally {
    await pg.exec("reset role");
  }
}
beforeAll(async () => {
  pg = new PGlite({ extensions: { btree_gist } });
  await pg.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;`,
  );
  for (const file of readdirSync("supabase/migrations").sort())
    await pg.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  await pg.exec(readFileSync("supabase/live-privileges.sql", "utf8"));
  await pg.query("insert into auth.users values($1),($2),($3),($4)", [
    admin,
    nurse,
    outsider,
    wardAdmin,
  ]);
  hospital = (
    await asUser(admin, () =>
      pg.query<{ id: string }>(
        "select public.onboard_hospital('Fictional Hospital','Europe/London') id",
      ),
    )
  ).rows[0].id;
  otherHospital = (
    await asUser(outsider, () =>
      pg.query<{ id: string }>(
        "select public.onboard_hospital('Other Fictional Hospital','Europe/London') id",
      ),
    )
  ).rows[0].id;
  ward = (
    await pg.query<{ id: string }>(
      "insert into wards(hospital_id,name) values($1,$2) returning id",
      [hospital, "Critical Care"],
    )
  ).rows[0].id;
  otherWard = (
    await pg.query<{ id: string }>(
      "insert into wards(hospital_id,name) values($1,$2) returning id",
      [hospital, "Surgery"],
    )
  ).rows[0].id;
  staff = (
    await pg.query<{ id: string }>(
      "insert into staff(hospital_id,ward_id,full_name) values($1,$2,$3) returning id",
      [hospital, ward, "Fictional nurse"],
    )
  ).rows[0].id;
  await pg.query(
    "insert into memberships values($1,$2,'nurse'),($1,$3,'ward_admin')",
    [hospital, nurse, wardAdmin],
  );
  await pg.query("insert into staff_accounts values($1,$2,$3)", [
    hospital,
    staff,
    nurse,
  ]);
  await pg.query("insert into ward_admins values($1,$2,$3)", [
    hospital,
    ward,
    wardAdmin,
  ]);
  shift = (
    await pg.query<{ id: string }>(
      "insert into shifts(hospital_id,ward_id,name,start_at,end_at,min_staff,max_staff) values($1,$2,'Day','2026-10-12T07:00:00Z','2026-10-12T19:00:00Z',1,1) returning id",
      [hospital, ward],
    )
  ).rows[0].id;
  roster = (
    await pg.query<{ id: string }>(
      "select create_roster($1,$2,'2026-10-12','2026-10-18',$3) id",
      [hospital, ward, admin],
    )
  ).rows[0].id;
  await pg.query("insert into assignments values($1,$2,$3,$4)", [
    hospital,
    roster,
    shift,
    staff,
  ]);
  await pg.query("update rosters set status='generated' where id=$1", [roster]);
  await pg.query(
    "insert into jobs(hospital_id,roster_id,state,external_id) values($1,$2,'completed','mocked-database-test-run')",
    [hospital, roster],
  );
}, 60000);
afterAll(async () => {
  await pg?.close();
});
describe("PostgreSQL migrations and RLS (PGlite, emulated Supabase Auth)", () => {
  it("denies anonymous execution of privileged functions", async () => {
    const result = await pg.query<{ count: number }>(
      "select count(*)::int as count from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and has_function_privilege('anon',p.oid,'execute')",
    );
    expect(result.rows[0].count).toBe(0);
  });
  it("isolates hospitals", async () => {
    const result = await asUser(admin, () =>
      pg.query<{ id: string }>("select id from hospitals"),
    );
    expect(result.rows.map((x) => x.id)).toEqual([hospital]);
    const outsiderResult = await asUser(outsider, () =>
      pg.query<{ id: string }>("select id from hospitals"),
    );
    expect(outsiderResult.rows.map((x) => x.id)).toEqual([otherHospital]);
  });
  it("limits ward administrators to assigned wards", async () => {
    const result = await asUser(wardAdmin, () =>
      pg.query<{ id: string }>("select id from wards"),
    );
    expect(result.rows.map((x) => x.id)).toEqual([ward]);
  });
  it("rejects a ward administrator moving staff into another ward", async () => {
    await expect(
      asUser(wardAdmin, () =>
        pg.query("update staff set ward_id=$1 where id=$2", [otherWard, staff]),
      ),
    ).rejects.toThrow();
  });
  it("hides candidate assignments from nurses", async () => {
    expect(
      (await asUser(nurse, () => pg.query("select * from assignments"))).rows,
    ).toHaveLength(0);
    expect(
      (await asUser(nurse, () => pg.query("select * from rosters"))).rows,
    ).toHaveLength(0);
  });
  it("blocks public self-promotion", async () => {
    await expect(
      asUser(nurse, () =>
        pg.query("insert into memberships values($1,$2,'hospital_admin')", [
          otherHospital,
          nurse,
        ]),
      ),
    ).rejects.toThrow();
  });
  it("blocks client lifecycle writes and publication RPC access", async () => {
    await expect(
      asUser(nurse, () =>
        pg.query("update rosters set status='published' where id=$1", [roster]),
      ),
    ).rejects.toThrow();
    await expect(
      asUser(admin, () =>
        pg.query("select publish_roster($1,$2,0,'{}'::jsonb)", [roster, admin]),
      ),
    ).rejects.toThrow();
  });
  it("rejects cross-tenant foreign keys", async () => {
    await expect(
      pg.query(
        "insert into staff(hospital_id,ward_id,full_name) values($1,$2,$3)",
        [otherHospital, ward, "Invalid"],
      ),
    ).rejects.toThrow();
  });
  it("enforces one-to-one account linking and preserves staff on unlink", async () => {
    await expect(
      pg.query("insert into staff_accounts values($1,$2,$3)", [
        hospital,
        staff,
        outsider,
      ]),
    ).rejects.toThrow();
    await pg.query("delete from staff_accounts where staff_id=$1", [staff]);
    expect(
      (await pg.query("select id from staff where id=$1", [staff])).rows,
    ).toHaveLength(1);
    await pg.query("insert into staff_accounts values($1,$2,$3)", [
      hospital,
      staff,
      nurse,
    ]);
  });
  it("rejects stale and invalid publication results", async () => {
    const snap = (
      await pg.query<{ s: { revision: number } }>(
        "select roster_snapshot($1) s",
        [roster],
      )
    ).rows[0].s;
    await expect(
      pg.query(
        'select publish_roster($1,$2,$3,\'{"valid":false,"violations":[{}]}\'::jsonb)',
        [roster, admin, snap.revision],
      ),
    ).rejects.toThrow();
    await expect(
      pg.query(
        'select publish_roster($1,$2,$3,\'{"valid":true,"violations":[]}\'::jsonb)',
        [roster, admin, snap.revision - 1],
      ),
    ).rejects.toThrow();
  });
  it("publishes transactionally and gives nurses only their assignments", async () => {
    const snap = (
      await pg.query<{ s: { revision: number } }>(
        "select roster_snapshot($1) s",
        [roster],
      )
    ).rows[0].s;
    await pg.query(
      'select publish_roster($1,$2,$3,\'{"valid":true,"violations":[]}\'::jsonb)',
      [roster, admin, snap.revision],
    );
    expect(
      (await asUser(nurse, () => pg.query("select * from assignments"))).rows,
    ).toHaveLength(1);
    expect(
      (
        await pg.query("select * from publications where roster_id=$1", [
          roster,
        ])
      ).rows,
    ).toHaveLength(1);
  });
  it("prevents conflicting published periods", async () => {
    const r2 = (
      await pg.query<{ id: string }>(
        "select create_roster($1,$2,'2026-10-12','2026-10-18',$3) id",
        [hospital, ward, admin],
      )
    ).rows[0].id;
    await pg.query("update rosters set status='generated' where id=$1", [r2]);
    await pg.query(
      "insert into jobs(hospital_id,roster_id,state,external_id) values($1,$2,'completed','mocked-conflict-test-run')",
      [hospital, r2],
    );
    const snap = (
      await pg.query<{ s: { revision: number } }>(
        "select roster_snapshot($1) s",
        [r2],
      )
    ).rows[0].s;
    await expect(
      pg.query(
        'select publish_roster($1,$2,$3,\'{"valid":true,"violations":[]}\'::jsonb)',
        [r2, admin, snap.revision],
      ),
    ).rejects.toThrow();
  });
  it("keeps published dated shifts immutable", async () => {
    await expect(
      asUser(admin, () =>
        pg.query(
          "update shifts set end_at='2026-10-12T20:00:00Z' where id=$1",
          [shift],
        ),
      ),
    ).rejects.toThrow();
  });
  it("prevents adding uncovered shifts to an already published period", async () => {
    await expect(
      asUser(admin, () =>
        pg.query(
          "insert into shifts(hospital_id,ward_id,name,start_at,end_at,min_staff,max_staff) values($1,$2,'Late shift','2026-10-13T07:00:00Z','2026-10-13T19:00:00Z',1,1)",
          [hospital, ward],
        ),
      ),
    ).rejects.toThrow("immutable");
  });
  it("lets administrators change existing roles but preserves a last administrator", async () => {
    await asUser(admin, () =>
      pg.query("select set_membership_role($1,$2,'nurse')", [
        hospital,
        wardAdmin,
      ]),
    );
    expect(
      (await asUser(wardAdmin, () => pg.query("select * from ward_admins")))
        .rows,
    ).toHaveLength(1);
    expect(
      (await asUser(wardAdmin, () => pg.query("select * from staff"))).rows,
    ).toHaveLength(0);
    await asUser(admin, () =>
      pg.query("select set_membership_role($1,$2,'ward_admin')", [
        hospital,
        wardAdmin,
      ]),
    );
    await expect(
      asUser(admin, () =>
        pg.query("select set_membership_role($1,$2,'nurse')", [
          hospital,
          admin,
        ]),
      ),
    ).rejects.toThrow("at least one");
  });
  it("approves a duty request without changing the assignment", async () => {
    const request = (
      await asUser(nurse, () =>
        pg.query<{ id: string }>(
          "insert into duty_requests(hospital_id,roster_id,shift_id,staff_id,requested_change,reason) values($1,$2,$3,$4,$5,$6) returning id",
          [
            hospital,
            roster,
            shift,
            staff,
            "Different shift",
            "Fictional reason",
          ],
        ),
      )
    ).rows[0].id;
    await pg.query("select review_duty_request($1,$2,'approved')", [
      request,
      wardAdmin,
    ]);
    expect(
      (
        await pg.query<{ status: string }>(
          "select status from duty_requests where id=$1",
          [request],
        )
      ).rows[0].status,
    ).toBe("approved");
    expect(
      (await pg.query("select * from assignments where roster_id=$1", [roster]))
        .rows,
    ).toHaveLength(1);
  });
  it("creates overnight shifts in the hospital time zone", async () => {
    const template = (
      await pg.query<{ id: string }>(
        "insert into shift_templates(hospital_id,ward_id,name,start_time,end_time,min_staff,max_staff) values($1,$2,'Night','19:00','07:00',1,1) returning id",
        [hospital, ward],
      )
    ).rows[0].id;
    await asUser(admin, () =>
      pg.query("select materialize_shifts($1,'2026-10-19','2026-10-19')", [
        template,
      ]),
    );
    const result = await pg.query<{ hours: number }>(
      "select extract(epoch from(end_at-start_at))/3600 hours from shifts where template_id=$1",
      [template],
    );
    expect(Number(result.rows[0].hours)).toBe(12);
  });
  it("rejects ambiguous template times at the daylight-saving boundary", async () => {
    const template = (
      await pg.query<{ id: string }>(
        "insert into shift_templates(hospital_id,ward_id,name,start_time,end_time,min_staff,max_staff) values($1,$2,'Ambiguous','01:30','07:00',1,1) returning id",
        [hospital, ward],
      )
    ).rows[0].id;
    await expect(
      asUser(admin, () =>
        pg.query("select materialize_shifts($1,'2026-10-25','2026-10-25')", [
          template,
        ]),
      ),
    ).rejects.toThrow("Ambiguous");
  });
  it("loads fictional two-ward sample data without inventing a roster result", async () => {
    await pg.exec(
      readFileSync("supabase/demo.sql", "utf8").replace(
        "REPLACE_WITH_YOUR_HOSPITAL_UUID",
        hospital,
      ),
    );
    expect(
      (
        await pg.query(
          "select * from wards where hospital_id=$1 and name like $2",
          [hospital, "Fictional Demo %"],
        )
      ).rows,
    ).toHaveLength(2);
    expect(
      (
        await pg.query(
          "select * from staff where hospital_id=$1 and full_name like $2",
          [hospital, "Fictional Nurse %"],
        )
      ).rows,
    ).toHaveLength(8);
    expect(
      (
        await pg.query(
          "select * from shift_templates where hospital_id=$1 and min_staff=50",
          [hospital],
        )
      ).rows,
    ).toHaveLength(2);
  });
});
