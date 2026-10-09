import { sessionDb } from "./db";
import { AppError } from "./http";
export async function actor() {
  const db = await sessionDb();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) throw new AppError("Sign in to continue.", 401);
  return { db, user: data.user };
}
export async function hospitalAccess(hospitalId: string, admin = false) {
  const { db, user } = await actor();
  const { data } = await db
    .from("memberships")
    .select("role")
    .eq("hospital_id", hospitalId)
    .eq("user_id", user.id)
    .single();
  if (!data || (admin && data.role !== "hospital_admin"))
    throw new AppError("You do not have permission for this hospital.", 403);
  return {
    db,
    user,
    role: data.role as "hospital_admin" | "ward_admin" | "nurse",
  };
}
export async function rosterAccess(id: string, admin = false) {
  const { db, user } = await actor();
  const { data } = await db.from("rosters").select("*").eq("id", id).single();
  if (!data) throw new AppError("Roster not found.", 404);
  await hospitalAccess(data.hospital_id, admin);
  return { db, user, roster: data };
}
