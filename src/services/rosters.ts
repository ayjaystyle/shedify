import { serviceDb } from "@/lib/db";
import { AppError } from "@/lib/http";
import { snapshotSchema, type Assignment } from "@/domain/model";
import { validateRoster } from "@/domain/validate";
export async function snapshot(id: string) {
  const { data, error } = await serviceDb().rpc("roster_snapshot", {
    p_roster: id,
  });
  if (error || !data) throw new AppError("Cannot load scheduling data.", 404);
  return snapshotSchema.parse(data);
}
export async function publish(id: string, actor: string) {
  const data = await snapshot(id);
  const validation = validateRoster(data);
  if (!validation.valid)
    throw new AppError(
      `Publication blocked: ${validation.violations
        .map((x) => x.message)
        .slice(0, 3)
        .join(" ")}`,
      409,
    );
  const { error } = await serviceDb().rpc("publish_roster", {
    p_roster: id,
    p_actor: actor,
    p_expected: data.revision,
    p_validation: validation,
  });
  if (error)
    throw new AppError(
      "Publication failed. Data may have changed or this period is already published.",
      409,
    );
  return validation;
}
export async function edit(
  id: string,
  actor: string,
  assignments: Assignment[],
) {
  const data = await snapshot(id);
  const validation = validateRoster(data, assignments);
  const { error } = await serviceDb().rpc("edit_assignments", {
    p_roster: id,
    p_actor: actor,
    p_expected: data.revision,
    p_assignments: assignments,
  });
  if (error)
    throw new AppError(
      "Edit failed. Reload the roster and check its status.",
      409,
    );
  const current = await snapshot(id);
  await serviceDb()
    .from("validations")
    .insert({
      hospital_id: current.hospital_id,
      roster_id: id,
      revision: current.revision,
      valid: validation.valid,
      result: validation,
    });
  return validation;
}
