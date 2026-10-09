import { describe, it, expect, vi } from "vitest";
import {
  mapRequest,
  parseResult,
  TimefoldAdapter,
  TIMEFOLD_BASE,
} from "@/solver/timefold";
import { fixture, id } from "./fixtures";
describe("Timefold adapter (mocked HTTP; not a live API test)", () => {
  it("maps required seats, qualifications, constraints and unavailable spans", () => {
    const data = fixture();
    data.shifts[0].min_staff = 2;
    const mapped = mapRequest(data);
    expect(mapped.modelInput.shifts).toHaveLength(2);
    expect(mapped.modelInput.employees[0].skills).toEqual([
      { id: "critical-care" },
    ]);
    expect(
      mapped.modelInput.contracts[0].periodRules?.[0].shiftsWorkedMax,
    ).toBe(1);
    expect(mapped.modelInput.shifts[0].start).toBe("2026-10-12T08:00:00+01:00");
  });
  it("maps actual result employees to source shifts", () => {
    const data = fixture();
    expect(
      parseResult(
        { modelOutput: { shifts: [{ id: `${id(5)}:0`, employee: id(4) }] } },
        data,
      ),
    ).toEqual(data.assignments);
  });
  it("keeps unassigned seats as shortages", () => {
    expect(
      parseResult(
        { modelOutput: { shifts: [{ id: `${id(5)}:0`, employee: null }] } },
        fixture(),
      ),
    ).toEqual([]);
  });
  it("rejects missing and unknown seats", () => {
    expect(() =>
      parseResult({ modelOutput: { shifts: [] } }, fixture()),
    ).toThrow();
    expect(() =>
      parseResult(
        { modelOutput: { shifts: [{ id: "invented", employee: id(4) }] } },
        fixture(),
      ),
    ).toThrow();
  });
  it("uses the official endpoint and server-only authentication header", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ id: "real-job-shape" }, { status: 202 }),
      );
    const adapter = new TimefoldAdapter("test-key", transport);
    expect(await adapter.submit(mapRequest(fixture()))).toBe("real-job-shape");
    expect(transport).toHaveBeenCalledWith(
      `${TIMEFOLD_BASE}/schedules`,
      expect.objectContaining({
        method: "POST",
        headers: {
          "X-API-KEY": "test-key",
          "Content-Type": "application/json",
        },
      }),
    );
  });
  it.each([401, 403, 429, 500])(
    "reports HTTP %s without including response secrets",
    async (status) => {
      const adapter = new TimefoldAdapter(
        "secret",
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response("sensitive remote text", { status })),
      );
      await expect(adapter.submit({})).rejects.not.toThrow("sensitive");
    },
  );
  it("does not submit without credentials", async () => {
    const transport = vi.fn<typeof fetch>();
    await expect(new TimefoldAdapter("", transport).submit({})).rejects.toThrow(
      "not configured",
    );
    expect(transport).not.toHaveBeenCalled();
  });
  it("marks network POST failures uncertain to avoid duplicate runs", async () => {
    const adapter = new TimefoldAdapter(
      "test",
      vi.fn<typeof fetch>().mockRejectedValue(Error("offline")),
    );
    await expect(adapter.submit({})).rejects.toMatchObject({ uncertain: true });
  });
});
