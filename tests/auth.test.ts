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
it("establishes invitation sessions through the server cookie client", async () => {
  const auth = { setSession: vi.fn().mockResolvedValue({ error: null }), getUser: vi.fn().mockResolvedValue({ data: { user: { email_confirmed_at: "2026-10-10" } }, error: null }) };
  session.mockResolvedValue({ auth });
  const response = await POST(request({ mode: "invite", fragment: "#type=invite&access_token=access&refresh_token=refresh" }));
  expect(response.status).toBe(200);
  expect(auth.setSession).toHaveBeenCalledWith({ access_token: "access", refresh_token: "refresh" });
  expect(auth.getUser).toHaveBeenCalled();
});
it("rejects unverified invitation users and cross-origin session transfers", async () => {
  const auth = { setSession: vi.fn().mockResolvedValue({ error: null }), getUser: vi.fn().mockResolvedValue({ data: { user: {} }, error: null }) };
  session.mockResolvedValue({ auth });
  expect((await POST(request({ mode: "invite", fragment: "#type=invite&access_token=access&refresh_token=refresh" }))).status).toBe(401);
  auth.setSession.mockClear();
  expect((await POST(request({ mode: "invite", fragment: "#type=invite&access_token=access&refresh_token=refresh" }, "https://other.example"))).status).toBe(403);
  expect(auth.setSession).not.toHaveBeenCalled();
});
