type InvitationAuth = {
  setSession(tokens: { access_token: string; refresh_token: string }): Promise<{ error: unknown }>;
  getUser(): Promise<{ data: { user: { email_confirmed_at?: string | null } | null }; error: unknown }>;
};
export function invitationTokens(fragment: string) {
  const values = new URLSearchParams(fragment.replace(/^#/, ""));
  if (!["invite", "recovery"].includes(values.get("type") || "")) return null;
  const access_token = values.get("access_token");
  const refresh_token = values.get("refresh_token");
  return access_token && refresh_token ? { access_token, refresh_token } : null;
}
export async function acceptInvitation(auth: InvitationAuth, fragment: string) {
  const tokens = invitationTokens(fragment);
  if (!tokens) throw new Error("This invitation is missing or invalid. Ask the account administrator for a new link.");
  const session = await auth.setSession(tokens);
  if (session.error) throw new Error("This invitation has expired or is invalid. Ask for a new link.");
  const verified = await auth.getUser();
  if (verified.error || !verified.data.user?.email_confirmed_at)
    throw new Error("Email verification is required before setting a password.");
}
