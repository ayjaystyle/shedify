import { expect, it, vi } from "vitest";
import { acceptInvitation, invitationTokens } from "@/lib/invitation";
const fragment = "#type=invite&access_token=test-access&refresh_token=test-refresh";
it("accepts a verified invitation session without creating or confirming users", async () => {
  const auth = { setSession: vi.fn().mockResolvedValue({ error: null }), getUser: vi.fn().mockResolvedValue({ data: { user: { email_confirmed_at: "2026-10-10" } }, error: null }) };
  await acceptInvitation(auth, fragment);
  expect(auth.setSession).toHaveBeenCalledWith({ access_token: "test-access", refresh_token: "test-refresh" });
  expect(auth.getUser).toHaveBeenCalled();
});
it("rejects missing credentials and unrelated fragment types before authentication", async () => {
  const auth = { setSession: vi.fn(), getUser: vi.fn() };
  for (const value of ["", "#type=invite&access_token=x", fragment.replace("invite", "signup")]) {
    expect(invitationTokens(value)).toBeNull();
    await expect(acceptInvitation(auth, value)).rejects.toThrow("missing or invalid");
  }
  expect(auth.setSession).not.toHaveBeenCalled();
});
it("requires server-verified email confirmation", async () => {
  const auth = { setSession: vi.fn().mockResolvedValue({ error: null }), getUser: vi.fn().mockResolvedValue({ data: { user: {} }, error: null }) };
  await expect(acceptInvitation(auth, fragment)).rejects.toThrow("Email verification is required");
});
it("does not disclose provider errors or tokens", async () => {
  const auth = { setSession: vi.fn().mockResolvedValue({ error: "private provider details" }), getUser: vi.fn() };
  await expect(acceptInvitation(auth, fragment)).rejects.toThrow("expired or is invalid");
  expect(auth.getUser).not.toHaveBeenCalled();
});
