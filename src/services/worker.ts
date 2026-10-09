import { z } from "zod";
import { serviceDb } from "@/lib/db";
import { snapshotSchema } from "@/domain/model";
import { validateRoster } from "@/domain/validate";
import {
  mapRequest,
  parseResult,
  SolverError,
  TimefoldAdapter,
  type SolverAdapter,
} from "@/solver/timefold";
import { snapshot } from "./rosters";
const jobSchema = z.object({
  id: z.uuid(),
  roster_id: z.uuid(),
  state: z.enum(["pending", "solving"]),
  external_id: z.string().nullable(),
  snapshot: z.unknown().nullable(),
  created_at: z.string(),
  attempts: z.number(),
});
export async function processOne(
  adapter: SolverAdapter = new TimefoldAdapter(),
  rosterId: string | null = null,
) {
  const db = serviceDb();
  const { data: raw, error } = await db.rpc("claim_job", {
    p_roster: rosterId,
  });
  if (error) throw new Error("Job claim failed.");
  if (!raw) return { processed: false };
  const job = jobSchema.parse(raw);
  const update = async (values: Record<string, unknown>) => {
    const { error } = await db.from("jobs").update(values).eq("id", job.id);
    if (error) throw new Error("Job state persistence failed.");
  };
  try {
    if (Date.now() - Date.parse(job.created_at) > 3600000)
      throw new SolverError(
        "Scheduling timed out. Review or cancel the run in Timefold.",
      );
    if (job.state === "pending") {
      const data = await snapshot(job.roster_id);
      const input = mapRequest(data);
      await update({ state: "submitting", input, snapshot: data });
      const id = await adapter.submit(input);
      await update({
        state: "solving",
        external_id: id,
        lease_until: null,
        next_poll_at: new Date(Date.now() + 15000).toISOString(),
      });
      return { processed: true, state: "solving" };
    }
    if (!job.external_id)
      throw new SolverError("Scheduling job has no Timefold identifier.");
    const status = await adapter.status(job.external_id);
    if (
      ["DATASET_INVALID", "SOLVING_FAILED", "SOLVING_INCOMPLETE"].includes(
        status,
      )
    )
      throw new SolverError(
        `Timefold ended with ${status}. No roster was published.`,
      );
    if (status !== "SOLVING_COMPLETED") {
      if (
        ![
          "DATASET_CREATED",
          "DATASET_VALIDATED",
          "DATASET_COMPUTED",
          "SOLVING_SCHEDULED",
          "SOLVING_STARTED",
          "SOLVING_ACTIVE",
        ].includes(status)
      )
        throw new SolverError("Unknown Timefold lifecycle status.");
      await update({
        lease_until: null,
        next_poll_at: new Date(Date.now() + 30000).toISOString(),
      });
      return { processed: true, state: "solving" };
    }
    const inputData = snapshotSchema.parse(job.snapshot);
    const current = await snapshot(job.roster_id);
    if (inputData.revision !== current.revision)
      throw new SolverError(
        "Scheduling data changed during solving. Generate again.",
      );
    const assignments = parseResult(
      await adapter.result(job.external_id),
      current,
    );
    const validation = validateRoster(current, assignments);
    const { error } = await db.rpc("save_candidate", {
      p_job: job.id,
      p_expected: current.revision,
      p_assignments: assignments,
      p_validation: validation,
    });
    if (error)
      throw new SolverError(
        "Candidate could not be saved. Data may have changed.",
      );
    return { processed: true, state: "completed", valid: validation.valid };
  } catch (error) {
    const message =
      error instanceof SolverError
        ? error.message
        : "Scheduling response could not be safely processed.";
    if (error instanceof SolverError && error.uncertain)
      await update({
        state: "submission_unknown",
        error: message,
        lease_until: null,
      });
    else if (
      error instanceof SolverError &&
      error.retryable &&
      job.attempts < 5
    )
      await update({
        state: job.state,
        error: message,
        lease_until: null,
        next_poll_at: new Date(Date.now() + 60000).toISOString(),
      });
    else {
      await update({ state: "failed", error: message, lease_until: null });
      await db
        .from("rosters")
        .update({ status: "draft" })
        .eq("id", job.roster_id)
        .neq("status", "published");
    }
    return { processed: true, state: "error", message };
  }
}
