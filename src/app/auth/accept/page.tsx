"use client";
import { createBrowserClient } from "@supabase/ssr";
import { useEffect, useRef, useState } from "react";
import { acceptInvitation } from "@/lib/invitation";
export default function AcceptInvitation() {
  const started = useRef(false);
  const [message, setMessage] = useState("Verifying your invitation…");
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const fragment = window.location.hash;
    window.history.replaceState(null, "", "/auth/accept");
    async function accept() {
      try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
        if (!url || !key) throw new Error("Authentication configuration is unavailable.");
        const db = createBrowserClient(url, key, { auth: { detectSessionInUrl: false } });
        await acceptInvitation(db.auth, fragment);
        window.location.replace("/auth/reset");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Unable to verify this invitation.");
      }
    }
    void accept();
  }, []);
  return <main className="max-w-md mx-auto px-6 py-20"><section className="card">
    <h1>Accept your invitation</h1>
    <p role="status" className="muted mt-4">{message}</p>
    <a className="underline block mt-6" href="/auth">Return to sign in</a>
  </section></main>;
}
