import fs from "node:fs";
import crypto from "node:crypto";
const raw = fs.readFileSync("docs/timefold-openapi.json");
const spec = JSON.parse(raw);
const pick = {
  ModelRequestEmployeeScheduleEmployeeScheduleConfigOverrides: ["modelInput"],
  EmployeeSchedule: ["contracts", "employees", "shifts", "globalRules"],
  Contract: [
    "id",
    "periodRules",
    "consecutiveDaysWorkedRules",
    "minutesBetweenShiftsRules",
  ],
  Employee: [
    "id",
    "contracts",
    "skills",
    "unavailableTimeSpans",
    "preferredTimeSpans",
    "unpreferredTimeSpans",
  ],
  Shift: [
    "id",
    "start",
    "end",
    "requiredSkills",
    "requiredSkillsMatchKind",
    "employee",
    "pinned",
  ],
  GlobalRules: ["balanceShiftCountRules", "balanceTimeWorkedRules"],
  PeriodRule: ["id", "period", "shiftsWorkedMax", "satisfiability"],
  ConsecutiveDaysWorkedRule: ["id", "maximum", "satisfiability"],
  MinutesBetweenShiftsRule: [
    "id",
    "minimumMinutesBetweenShifts",
    "satisfiability",
  ],
};
const schemas = {};
function strip(value) {
  if (Array.isArray(value)) return value.map(strip);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            !["description", "externalDocs", "example", "deprecated"].includes(
              key,
            ),
        )
        .map(([key, v]) => [key, strip(v)]),
    );
  return value;
}
function include(name) {
  if (schemas[name]) return;
  const schema = structuredClone(spec.components.schemas[name]);
  if (!schema) throw Error(`Missing schema: ${name}`);
  if (pick[name])
    schema.properties = Object.fromEntries(
      pick[name].map((key) => [key, schema.properties[key]]),
    );
  schemas[name] = strip(schema);
  for (const [, ref] of JSON.stringify(schema).matchAll(
    /#\/components\/schemas\/([^"\s]+)/g,
  ))
    include(ref);
}
include("ModelRequestEmployeeScheduleEmployeeScheduleConfigOverrides");
fs.writeFileSync(
  "docs/timefold-contract.json",
  JSON.stringify(
    {
      source: "https://app.timefold.ai/openapis/employee-scheduling/v1",
      retrieved: "2026-10-09",
      apiVersion: spec.info.version,
      sha256: crypto.createHash("sha256").update(raw).digest("hex"),
      security: spec.components.securitySchemes,
      components: { schemas },
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Recorded ${Object.keys(schemas).length} official schema definitions for mapped fields.`,
);
