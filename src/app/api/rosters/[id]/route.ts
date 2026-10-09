import { NextResponse } from "next/server";
import { z } from "zod";
import { rosterAccess } from "@/lib/access";
import { serviceDb } from "@/lib/db";
import { AppError, failure, guardOrigin } from "@/lib/http";
import { assignmentSchema } from "@/domain/model";
import { validateRoster } from "@/domain/validate";
import { snapshot, publish, edit } from "@/services/rosters";
import { processOne } from "@/services/worker";
import { TimefoldAdapter } from "@/solver/timefold";
type Context = { params: Promise<{ id: string }> };
export const maxDuration = 60;
export async function GET(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    z.uuid().parse(id);
    const { db, roster } = await rosterAccess(id);
    const { data: membership } = await db
      .from("memberships")
      .select("role")
      .eq("hospital_id", roster.hospital_id)
      .eq("user_id", (await db.auth.getUser()).data.user!.id)
      .single();
    if (membership?.role === "nurse") {
      const { data, error } = await db
        .from("assignments")
        .select("*,shifts(*)")
        .eq("roster_id", id);
      if (error) throw error;
      return NextResponse.json({ roster, assignments: data });
    }
    const data = await snapshot(id);
    const { data: jobs } = await db
      .from("jobs")
      .select("id,state,external_id,error,created_at")
      .eq("roster_id", id)
      .order("created_at", { ascending: false });
    return NextResponse.json({
      snapshot: { ...data, history: [] },
      validation: validateRoster(data),
      jobs,
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    guardOrigin(request);
    const { id } = await context.params;
    z.uuid().parse(id);
    const { user } = await rosterAccess(id, true);
    const body = z
      .object({
        action: z.enum([
          "generate",
          "validate",
          "publish",
          "edit",
          "process",
          "cancel",
        ]),
        assignments: z.array(assignmentSchema).max(20000).optional(),
      })
      .parse(await request.json());
    const db = serviceDb();
    switch (body.action) {
      case "generate":
        if (!process.env.TIMEFOLD_API_KEY)
          throw new AppError(
            "Configure TIMEFOLD_API_KEY before generating.",
            503,
          );
        {
          const { data, error } = await db.rpc("enqueue_roster", {
            p_roster: id,
            p_actor: user.id,
          });
          if (error)
            throw new AppError(
              "Cannot queue this roster. Check for an active job or published period.",
              409,
            );
          return NextResponse.json({ jobId: data });
        }
      case "validate":
        return NextResponse.json(validateRoster(await snapshot(id)));
      case "publish":
        return NextResponse.json(await publish(id, user.id));
      case "edit":
        if (!body.assignments) throw new AppError("Assignments are required.");
        return NextResponse.json(await edit(id, user.id, body.assignments));
      case "process":
        return NextResponse.json(await processOne(new TimefoldAdapter(), id));
      case "cancel": {
        const { data: job } = await db
          .from("jobs")
          .select("*")
          .eq("roster_id", id)
          .in("state", ["pending", "solving"])
          .is("lease_until", null)
          .single();
        if (!job)
          throw new AppError(
            "No cancellable job found. Wait for the active worker to finish.",
            409,
          );
        const { data: reserved, error } = await db
          .from("jobs")
          .update({ state: "cancelled" })
          .eq("id", job.id)
          .eq("state", job.state)
          .is("lease_until", null)
          .select("id")
          .single();
        if (error || !reserved)
          throw new AppError("The job changed. Reload and retry.", 409);
        await db.from("rosters").update({ status: "draft" }).eq("id", id);
        if (job.external_id)
          await new TimefoldAdapter().cancel(job.external_id);
        return NextResponse.json({ cancelled: true });
      }
    }
  } catch (error) {
    return failure(error);
  }
}
