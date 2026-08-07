"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function normalize(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 20);
}

export default function OnboardingPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (username.length < 3) {
      setError("Username needs to be at least 3 characters.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/login");
      return;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ username })
      .eq("id", user.id);

    setLoading(false);

    if (updateError) {
      if (updateError.code === "23505") {
        setError("That username is taken. Try another.");
      } else {
        setError("Something went wrong. Try again.");
      }
      return;
    }

    router.replace("/dashboard");
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">
          Pick a username
        </h1>
        <p className="mt-2 text-sm text-muted">
          This is how friends will find and add you. Choose something
          recognizable.
        </p>

        <div className="mt-8 flex items-center rounded-2xl border border-border bg-surface px-4 py-3.5 focus-within:border-accent">
          <span className="text-muted">@</span>
          <input
            autoFocus
            value={username}
            onChange={(e) => setUsername(normalize(e.target.value))}
            placeholder="username"
            className="ml-1 w-full bg-transparent outline-none placeholder:text-muted"
          />
        </div>

        {error && <p className="mt-3 text-sm text-accent">{error}</p>}

        <button
          type="submit"
          disabled={loading || username.length < 3}
          className="mt-6 w-full rounded-2xl bg-foreground px-5 py-3.5 font-medium text-background transition active:scale-[0.98] disabled:opacity-40"
        >
          {loading ? "Saving…" : "Continue"}
        </button>
      </form>
    </main>
  );
}
