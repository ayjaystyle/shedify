import { configured, sessionDb } from "@/lib/db";
import Dashboard from "@/components/dashboard";
export const dynamic = "force-dynamic";
export default async function Home() {
  const connected = configured();
  const user = connected
    ? (await (await sessionDb()).auth.getUser()).data.user
    : null;
  return <Dashboard connected={connected} signedIn={!!user} />;
}
