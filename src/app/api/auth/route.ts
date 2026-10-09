import { NextResponse } from "next/server";
import { z } from "zod";
import { sessionDb } from "@/lib/db";
import { AppError, failure, guardOrigin } from "@/lib/http";
export async function POST(request: Request) {
  try {
    guardOrigin(request);
    const body = z
      .object({
        mode: z.enum(["login", "register", "recover", "logout", "password"]),
        email: z.email().optional(),
        password: z.string().min(12).max(128).optional(),
      })
      .parse(await request.json());
    const db = await sessionDb();
    const redirect = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`;
    let error;
    switch (body.mode) {
      case "logout":
        ({ error } = await db.auth.signOut());
        break;
      case "password":
        if (!(await db.auth.getUser()).data.user)
          throw new AppError("Sign in first.", 401);
        ({ error } = await db.auth.updateUser({ password: body.password }));
        break;
      case "recover":
        if (!body.email) throw new AppError("Email is required.");
        ({ error } = await db.auth.resetPasswordForEmail(body.email, {
          redirectTo: `${redirect}?next=/auth/reset`,
        }));
        break;
      case "register":
        if (!body.email || !body.password)
          throw new AppError("Email and password are required.");
        ({ error } = await db.auth.signUp({
          email: body.email,
          password: body.password,
          options: { emailRedirectTo: redirect },
        }));
        break;
      case "login":
        if (!body.email || !body.password)
          throw new AppError("Email and password are required.");
        ({ error } = await db.auth.signInWithPassword({
          email: body.email,
          password: body.password,
        }));
    }
    if (error)
      throw new AppError(
        "Authentication failed. Check your details or email confirmation.",
        401,
      );
    return NextResponse.json({
      message: "Check your email for the next step.",
    });
  } catch (error) {
    return failure(error);
  }
}
