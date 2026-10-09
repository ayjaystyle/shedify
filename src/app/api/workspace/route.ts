import { NextResponse } from "next/server";
import { z } from "zod";
import { actor, hospitalAccess } from "@/lib/access";
import { AppError, failure, guardOrigin } from "@/lib/http";
import { serviceDb } from "@/lib/db";
const text = z.string().trim().min(1).max(160);
const uuid = z.uuid();
const span = {
  staff_id: uuid,
  start_at: z.iso.datetime({ offset: true }),
  end_at: z.iso.datetime({ offset: true }),
};
const schemas = {
  wards: z.object({ name: text, active: z.boolean().default(true) }).strict(),
  staff: z
    .object({
      full_name: text,
      ward_id: uuid,
      rank_id: uuid.nullable().default(null),
      active: z.boolean().default(true),
      eligible: z.boolean().default(true),
      contact: z.string().max(200).nullable().optional(),
    })
    .strict(),
  ranks: z.object({ name: text }).strict(),
  qualifications: z.object({ name: text }).strict(),
  shift_templates: z
    .object({
      name: text,
      ward_id: uuid,
      start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
      end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
      min_staff: z.number().int().min(1).max(100),
      max_staff: z.number().int().min(1).max(100),
      required_skills: z.array(z.string().min(1).max(100)).max(30).default([]),
    })
    .strict(),
  shifts: z
    .object({
      name: text,
      ward_id: uuid,
      template_id: uuid.nullable().optional(),
      start_at: z.iso.datetime({ offset: true }),
      end_at: z.iso.datetime({ offset: true }),
      min_staff: z.number().int().min(1).max(100),
      max_staff: z.number().int().min(1).max(100),
      required_skills: z.array(z.string().min(1).max(100)).max(30).default([]),
    })
    .strict(),
  rules: z
    .object({
      ward_id: uuid,
      kind: z.enum([
        "one_shift_per_day",
        "max_consecutive_days",
        "min_rest_minutes",
        "fair_shifts",
        "fair_workload",
      ]),
      value: z.number().int().nonnegative().max(2880),
      active: z.boolean().default(true),
    })
    .strict(),
  availability: z.object(span).strict(),
  preferences: z.object({ ...span, preferred: z.boolean() }).strict(),
  staff_accounts: z.object({ staff_id: uuid, user_id: uuid }).strict(),
  staff_qualifications: z
    .object({ staff_id: uuid, qualification_id: uuid })
    .strict(),
  memberships: z
    .object({
      user_id: uuid,
      role: z.enum(["hospital_admin", "ward_admin", "nurse"]),
    })
    .strict(),
  ward_admins: z.object({ ward_id: uuid, user_id: uuid }).strict(),
  duty_requests: z
    .object({
      roster_id: uuid,
      shift_id: uuid,
      staff_id: uuid,
      requested_change: z.string().trim().min(1).max(1000),
      reason: z.string().trim().min(1).max(2000),
    })
    .strict(),
  hospitals: z
    .object({
      name: text,
      timezone: z.string().min(1).max(80),
      contact: z.string().max(200).nullable().optional(),
      location: z.string().max(200).nullable().optional(),
    })
    .strict(),
};
export async function GET(request: Request) {
  try {
    const { db, user } = await actor();
    const hospitalId = new URL(request.url).searchParams.get("hospital");
    if (!hospitalId) {
      const { data: hospitals, error } = await db.from("hospitals").select("*");
      if (error) throw error;
      return NextResponse.json({ hospitals, userId: user.id });
    }
    uuid.parse(hospitalId);
    const { role } = await hospitalAccess(hospitalId);
    const names = [
      "wards",
      "staff",
      "ranks",
      "qualifications",
      "staff_qualifications",
      "staff_accounts",
      "shift_templates",
      "shifts",
      "rules",
      "availability",
      "preferences",
      "rosters",
      "assignments",
      "duty_requests",
      "memberships",
      "ward_admins",
    ];
    const results = await Promise.all(
      names.map(async (name) => {
        const { data, error, count } = await db
          .from(name)
          .select("*", { count: "exact" })
          .eq("hospital_id", hospitalId)
          .limit(500);
        if (error) throw error;
        return [name, data, count] as const;
      }),
    );
    return NextResponse.json({
      role,
      userId: user.id,
      data: Object.fromEntries(results.map(([name, data]) => [name, data])),
      counts: Object.fromEntries(
        results.map(([name, , count]) => [name, count]),
      ),
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    guardOrigin(request);
    const body = z
      .object({
        action: z.enum([
          "onboard",
          "create",
          "update",
          "delete",
          "roster",
          "review",
          "materialize",
        ]),
        hospital_id: uuid.optional(),
        entity: z
          .enum(
            Object.keys(schemas) as [
              keyof typeof schemas,
              ...(keyof typeof schemas)[],
            ],
          )
          .optional(),
        id: uuid.optional(),
        data: z.record(z.string(), z.unknown()),
      })
      .strict()
      .parse(await request.json());
    const { db, user } = await actor();
    if (body.action === "onboard") {
      const data = z
        .object({ name: text, timezone: z.string() })
        .parse(body.data);
      try {
        new Intl.DateTimeFormat("en", { timeZone: data.timezone });
      } catch {
        throw new AppError("Choose a valid IANA time zone.");
      }
      const { data: id, error } = await db.rpc("onboard_hospital", {
        p_name: data.name,
        p_timezone: data.timezone,
      });
      if (error)
        throw new AppError(
          "Hospital setup failed. Check migrations and input.",
        );
      return NextResponse.json({ id });
    }
    if (!body.hospital_id) throw new AppError("Select a hospital.");
    const access = await hospitalAccess(body.hospital_id);
    if (body.action === "roster") {
      await hospitalAccess(body.hospital_id, true);
      const data = z
        .object({
          ward_id: uuid,
          start_date: z.iso.date(),
          end_date: z.iso.date(),
        })
        .parse(body.data);
      const { data: id, error } = await serviceDb().rpc("create_roster", {
        p_hospital: body.hospital_id,
        p_ward: data.ward_id,
        p_start: data.start_date,
        p_end: data.end_date,
        p_actor: user.id,
      });
      if (error)
        throw new AppError(
          "Roster creation failed. Check the period and ward.",
        );
      return NextResponse.json({ id });
    }
    if (body.action === "review") {
      if (!body.id) throw new AppError("Select a request.");
      const data = z
        .object({ status: z.enum(["approved", "rejected"]) })
        .parse(body.data);
      const { data: existing } = await db
        .from("duty_requests")
        .select("id")
        .eq("id", body.id)
        .eq("hospital_id", body.hospital_id)
        .single();
      if (!existing) throw new AppError("Request not found.", 404);
      const { error } = await serviceDb().rpc("review_duty_request", {
        p_request: body.id,
        p_actor: user.id,
        p_status: data.status,
      });
      if (error)
        throw new AppError(
          "Request cannot be reviewed with your current permissions.",
          403,
        );
      return NextResponse.json({ success: true });
    }
    if (body.action === "materialize") {
      await hospitalAccess(body.hospital_id, true);
      const data = z
        .object({
          template_id: uuid,
          start_date: z.iso.date(),
          end_date: z.iso.date(),
        })
        .parse(body.data);
      const { error } = await db.rpc("materialize_shifts", {
        p_template: data.template_id,
        p_start: data.start_date,
        p_end: data.end_date,
      });
      if (error)
        throw new AppError(
          "Shift creation failed. Check dates and daylight-saving transitions.",
        );
      return NextResponse.json({ success: true });
    }
    if (!body.entity) throw new AppError("Select a record type.");
    const entity = body.entity;
    const wardStaff = entity === "staff" && access.role === "ward_admin";
    const nurseRequest = entity === "duty_requests" && body.action === "create";
    if (access.role !== "hospital_admin" && !wardStaff && !nurseRequest)
      throw new AppError("You cannot change this record type.", 403);
    if (body.action === "delete") {
      if (
        ![
          "staff_accounts",
          "staff_qualifications",
          "ward_admins",
          "availability",
          "preferences",
          "rules",
        ].includes(entity)
      )
        throw new AppError(
          "Deactivate records to preserve scheduling history.",
        );
      let query = db.from(entity).delete().eq("hospital_id", body.hospital_id);
      if (entity === "staff_accounts") {
        query = query.eq("staff_id", uuid.parse(body.data.staff_id));
      } else if (entity === "staff_qualifications") {
        query = query
          .eq("staff_id", uuid.parse(body.data.staff_id))
          .eq("qualification_id", uuid.parse(body.data.qualification_id));
      } else if (entity === "ward_admins") {
        query = query
          .eq("ward_id", uuid.parse(body.data.ward_id))
          .eq("user_id", uuid.parse(body.data.user_id));
      } else {
        if (!body.id) throw new AppError("Record identifier is required.");
        query = query.eq("id", body.id);
      }
      const { error } = await query;
      if (error) throw new AppError("Removal failed.");
      return NextResponse.json({ success: true });
    }
    const data = schemas[entity].parse(body.data);
    if (entity === "memberships") {
      const member = schemas.memberships.parse(body.data);
      const { error } = await db.rpc("set_membership_role", {
        p_hospital: body.hospital_id,
        p_user: member.user_id,
        p_role: member.role,
      });
      if (error)
        throw new AppError(
          "Membership change failed. Use a registered account and keep at least one hospital administrator.",
          409,
        );
      return NextResponse.json({ success: true });
    }
    if (
      "end_at" in data &&
      "start_at" in data &&
      Date.parse(data.end_at) <= Date.parse(data.start_at)
    )
      throw new AppError("End must be later than start.");
    if (
      "min_staff" in data &&
      "max_staff" in data &&
      Number(data.max_staff) < Number(data.min_staff)
    )
      throw new AppError("Maximum staffing must be at least the minimum.");
    if ("timezone" in data) {
      try {
        new Intl.DateTimeFormat("en", { timeZone: String(data.timezone) });
      } catch {
        throw new AppError("Choose a valid IANA time zone.");
      }
    }
    if (body.action === "update") {
      if (
        !body.id ||
        [
          "memberships",
          "staff_accounts",
          "staff_qualifications",
          "ward_admins",
          "duty_requests",
        ].includes(entity)
      )
        throw new AppError("This record cannot be updated here.");
      let query = db.from(entity).update(data);
      query =
        entity === "hospitals"
          ? query.eq("id", body.hospital_id)
          : query.eq("hospital_id", body.hospital_id).eq("id", body.id);
      const { error, data: updated } = await query.select("id").single();
      if (error || !updated)
        throw new AppError(
          "Update failed. Check permission, uniqueness and published roster restrictions.",
          409,
        );
      return NextResponse.json({ success: true });
    }
    if (entity === "hospitals") throw new AppError("Use hospital onboarding.");
    const { error } = await db
      .from(entity)
      .insert({ ...data, hospital_id: body.hospital_id });
    if (error)
      throw new AppError(
        "Save failed. Check permissions, duplicate records and linked identifiers.",
        409,
      );
    return NextResponse.json({ success: true });
  } catch (error) {
    return failure(error);
  }
}
