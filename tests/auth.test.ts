import { beforeEach, expect, it, vi } from "vitest";
const session = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ sessionDb: session }));
import { POST } from "@/app/api/auth/route";
const request = (body: object, origin = "https://shedify.vercel.app") => new Request("https://shedify.vercel.app/api/auth", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => { vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://shedify.vercel.app"); session.mockReset(); });
it("blocks public signup before reaching Supabase", async () => {
  const r = await POST(request({ mode: "register", email: "dev@example.com", password: "a-long-test-password" }));
  expect(r.status).toBe(403);
  expect((await r.json()).error).toContain("Public registration is closed");
  expect(session).not.toHaveBeenCalled();
});
it("rejects cross-origin authentication attempts", async () => {
  expect((await POST(request({ mode: "login", email: "dev@example.com", password: "a-long-test-password" }, "https://other.example"))).status).toBe(403);
  expect(session).not.toHaveBeenCalled();
});
it("rejects a missing new password before updating a user", async () => {
  const updateUser = vi.fn();
  session.mockResolvedValue({ auth: { updateUser } });
  expect((await POST(request({ mode: "password" }))).status).toBe(400);
  expect(updateUser).not.toHaveBeenCalled();
});
