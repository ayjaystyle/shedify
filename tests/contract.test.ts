import Ajv from "ajv";
import addFormats from "ajv-formats";
import { it, expect } from "vitest";
import contract from "../docs/timefold-contract.json";
import { mapRequest } from "@/solver/timefold";
import { fixture } from "./fixtures";
it("constructs a request matching the recorded official OpenAPI field schemas", () => {
  const ajv = new Ajv({ strict: false });
  addFormats(ajv);
  const validate = ajv.compile({
    components: contract.components,
    $ref: "#/components/schemas/ModelRequestEmployeeScheduleEmployeeScheduleConfigOverrides",
  });
  expect(validate(mapRequest(fixture())), JSON.stringify(validate.errors)).toBe(
    true,
  );
});
