import { NextResponse } from "next/server";
import { sessionDb } from "@/lib/db";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    const { error } = await (
      await sessionDb()
    ).auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(
        new URL(
          url.searchParams.get("next") === "/auth/reset" ? "/auth/reset" : "/",
          url.origin,
        ),
      );
  }
  return NextResponse.redirect(new URL("/auth", url.origin));
}
