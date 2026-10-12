import type { Snapshot } from "./model";
export function effectiveRule(data: Snapshot, kind: string) {
  const saved = data.rules.find((r) => r.active && r.kind === kind)?.value;
  const configured =
    kind === "max_consecutive_days"
      ? data.policy?.maximum_consecutive_days
      : kind === "min_rest_minutes"
        ? data.policy?.minimum_rest_minutes
        : null;
  const values = [saved, configured].filter(
    (v): v is number => v !== null && v !== undefined,
  );
  const ward = values.length
    ? kind === "max_consecutive_days"
      ? Math.min(...values)
      : Math.max(...values)
    : undefined;
  const hospital =
    kind === "max_consecutive_days"
      ? data.hospital_limits?.maximum_consecutive_days
      : kind === "min_rest_minutes"
        ? data.hospital_limits?.minimum_rest_minutes
        : null;
  if (hospital === null || hospital === undefined) return ward;
  if (ward === undefined) return hospital;
  return kind === "max_consecutive_days"
    ? Math.min(ward, hospital)
    : Math.max(ward, hospital);
}
