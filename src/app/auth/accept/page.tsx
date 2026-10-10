"use client";
import { useEffect, useRef, useState } from "react";
import { invitationTokens } from "@/lib/invitation";
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
        if (!invitationTokens(fragment)) throw new Error("This invitation is missing or invalid. Request a new recovery email.");
        const response = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "invite", fragment }),
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!response.ok) throw new Error("This invitation is invalid or expired. Request a new recovery email.");
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
