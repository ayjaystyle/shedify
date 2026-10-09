"use client";
import { useState } from "react";
export default function Auth() {
  const [mode, setMode] = useState("login");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, mode }),
      });
      const result = await res.json();
      if (!res.ok) throw Error(result.error);
      if (mode === "login") location.href = "/";
      else setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="max-w-md mx-auto px-6 py-20">
      <a href="/" className="font-bold text-2xl">
        shedify<span className="text-emerald-700">.</span>
      </a>
      <section className="card mt-8">
        <h1>
          {mode === "login"
            ? "Welcome back"
            : "Recover your account"}
        </h1>
        <p className="muted mt-2">
          Secure access to your hospital nursing rosters.
        </p>
        <p className="muted mt-4">
          Access is limited to authorized development accounts. Ask the
          administrator for access. Public registration is currently closed.
        </p>
        {mode === "recover" && (
          <p className="muted mt-4">
            Development recovery emails can only be sent to addresses permitted
            by Supabase’s built-in mail service. Contact the administrator if
            your address is not eligible.
          </p>
        )}
        <form onSubmit={submit}>
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
          />
          {mode !== "recover" && (
            <>
              <label htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                minLength={12}
                required
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
              />
            </>
          )}
          <button className="primary mt-6 w-full" disabled={busy}>
            {busy
              ? "Please wait…"
              : mode === "login"
                ? "Sign in"
                : "Send recovery email"}
          </button>
        </form>
        {message && (
          <p role="status" className="muted mt-4">
            {message}
          </p>
        )}
        <div className="flex gap-4 text-sm mt-6">
          {["login", "recover"]
            .filter((x) => x !== mode)
            .map((x) => (
              <button
                key={x}
                onClick={() => {
                  setMode(x);
                  setMessage("");
                }}
                className="underline"
              >
                {x === "login"
                  ? "Sign in"
                  : "Forgot password?"}
              </button>
            ))}
        </div>
      </section>
    </main>
  );
}
