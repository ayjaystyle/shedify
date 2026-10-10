"use client";
import { useEffect } from "react";
export default function InvitationRedirect() {
  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if (["invite", "recovery"].includes(fragment.get("type") || "") || fragment.has("error_code"))
      window.location.replace(`/auth/accept${window.location.hash}`);
  }, []);
  return null;
}
