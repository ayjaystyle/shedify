import { configured, sessionDb } from "@/lib/db";
import Dashboard from "@/components/dashboard";
import InvitationRedirect from "@/components/invitation-redirect";
export const dynamic = "force-dynamic";
export default async function Home() {
  const connected = configured();
  const user = connected
    ? (await (await sessionDb()).auth.getUser()).data.user
    : null;
  return <><InvitationRedirect /><Dashboard connected={connected} signedIn={!!user} /></>;
}
