import { beforeEach, describe, it, expect, vi } from "vitest";
import { fixture, id } from "./fixtures";
import type { SolverAdapter } from "@/solver/timefold";
import { SolverError } from "@/solver/timefold";
const mock = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  updates: [] as Record<string, unknown>[],
  snapshot: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  serviceDb: () => ({ rpc: mock.rpc, from: mock.from }),
}));
vi.mock("@/services/rosters", () => ({ snapshot: mock.snapshot }));
import { processOne } from "@/services/worker";
const adapter = () =>
  ({
    submit: vi.fn().mockResolvedValue("test-run"),
    status: vi.fn().mockResolvedValue("SOLVING_COMPLETED"),
    result: vi
      .fn()
      .mockResolvedValue({
        modelOutput: { shifts: [{ id: `${id(5)}:0`, employee: id(4) }] },
      }),
    cancel: vi.fn(),
  }) satisfies SolverAdapter;
function job(state = "pending") {
  return {
    id: id(20),
    roster_id: id(2),
    state,
    external_id: state === "solving" ? "test-run" : null,
    snapshot: fixture(),
    created_at: new Date().toISOString(),
    attempts: 1,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mock.updates = [];
  mock.rpc.mockImplementation(async (name: string) => ({
    data: name === "claim_job" ? job() : null,
    error: null,
  }));
  mock.from.mockImplementation(() => ({
    update: (values: Record<string, unknown>) => {
      mock.updates.push(values);
      return { eq: () => ({ error: null, neq: () => ({ error: null }) }) };
    },
  }));
  mock.snapshot.mockResolvedValue(fixture());
});
describe("durable worker state transitions (mocked storage and HTTP)", () => {
  it("persists submitting state before external submission and saves the identifier", async () => {
    const solver = adapter();
    solver.submit.mockImplementation(async () => {
      expect(mock.updates.at(-1)?.state).toBe("submitting");
      return "test-run";
    });
    expect(await processOne(solver, id(2))).toMatchObject({ state: "solving" });
    expect(mock.updates.at(-1)).toMatchObject({
      state: "solving",
      external_id: "test-run",
    });
    expect(mock.rpc).toHaveBeenCalledWith("claim_job", { p_roster: id(2) });
  });
  it("does not report completion while solving remains active", async () => {
    mock.rpc.mockResolvedValue({ data: job("solving"), error: null });
    const solver = adapter();
    solver.status.mockResolvedValue("SOLVING_ACTIVE");
    expect(await processOne(solver)).toMatchObject({ state: "solving" });
    expect(solver.result).not.toHaveBeenCalled();
  });
  it("validates actual result assignments before persistence", async () => {
    mock.rpc.mockImplementation(async (name) => ({
      data: name === "claim_job" ? job("solving") : null,
      error: null,
    }));
    expect(await processOne(adapter())).toMatchObject({
      state: "completed",
      valid: true,
    });
    expect(mock.rpc).toHaveBeenCalledWith(
      "save_candidate",
      expect.objectContaining({
        p_validation: expect.objectContaining({ valid: true }),
        p_assignments: fixture().assignments,
      }),
    );
  });
  it("marks lost submission acknowledgements as unknown without repeating POST", async () => {
    const solver = adapter();
    solver.submit.mockRejectedValue(
      new SolverError("Lost acknowledgement", false, true),
    );
    expect(await processOne(solver)).toMatchObject({ state: "error" });
    expect(solver.submit).toHaveBeenCalledTimes(1);
    expect(mock.updates.at(-1)).toMatchObject({ state: "submission_unknown" });
  });
  it("rejects changed input revisions rather than saving a stale candidate", async () => {
    mock.rpc.mockResolvedValue({ data: job("solving"), error: null });
    mock.snapshot.mockResolvedValue({ ...fixture(), revision: 2 });
    const solver = adapter();
    expect(await processOne(solver)).toMatchObject({ state: "error" });
    expect(solver.result).not.toHaveBeenCalled();
    expect(mock.updates.some((x) => x.state === "failed")).toBe(true);
  });
  it("records failed terminal solver states", async () => {
    mock.rpc.mockResolvedValue({ data: job("solving"), error: null });
    const solver = adapter();
    solver.status.mockResolvedValue("SOLVING_FAILED");
    expect(await processOne(solver)).toMatchObject({ state: "error" });
    expect(mock.updates.some((x) => x.state === "failed")).toBe(true);
  });
  it("keeps partial infeasible results as invalid candidates", async () => {
    mock.rpc.mockImplementation(async (name) => ({
      data: name === "claim_job" ? job("solving") : null,
      error: null,
    }));
    const solver = adapter();
    solver.result.mockResolvedValue({
      modelOutput: { shifts: [{ id: `${id(5)}:0`, employee: null }] },
    });
    expect(await processOne(solver)).toMatchObject({
      state: "completed",
      valid: false,
    });
  });
});
