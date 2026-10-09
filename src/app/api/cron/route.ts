import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { processOne } from "@/services/worker";
import { failure } from "@/lib/http";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization") || "";
  const valid =
    expected &&
    expected.length >= 32 &&
    Buffer.byteLength(supplied) === Buffer.byteLength(`Bearer ${expected}`) &&
    timingSafeEqual(Buffer.from(supplied), Buffer.from(`Bearer ${expected}`));
  if (!valid)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await processOne());
  } catch (error) {
    return failure(error);
  }
}
