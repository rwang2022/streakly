"use client";

import { useEffect, useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";
import { Users, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Room } from "@/lib/types";

type Status = "loading" | "not-found" | "signed-out" | "needs-username" | "ready" | "joined";

export default function JoinRoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = usePromise(params);
  const router = useRouter();
  const [status, setStatus] = useState<Status>("loading");
  const [room, setRoom] = useState<Room | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const normalized = decodeURIComponent(code).toUpperCase();

      const { data: roomRow } = await supabase
        .from("rooms")
        .select("*")
        .eq("invite_code", normalized)
        .single();

      if (!roomRow) {
        setStatus("not-found");
        return;
      }
      setRoom(roomRow as Room);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setStatus("signed-out");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .single();

      setStatus(profile?.username ? "ready" : "needs-username");
    })();
  }, [code]);

  async function signIn() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/join/${code}` },
    });
  }

  async function join() {
    if (!room) return;
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("room_memberships")
      .upsert({ room_id: room.id, user_id: user.id });
    setStatus("joined");
    setTimeout(() => router.push(`/leaderboard?room=${room.id}`), 900);
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <div className="w-full max-w-sm">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-white shadow-lg shadow-accent/20">
          <Users size={26} />
        </div>

        {status === "loading" && <p className="text-muted">Loading invite…</p>}

        {status === "not-found" && (
          <>
            <h1 className="text-xl font-semibold">Invite not found</h1>
            <p className="mt-2 text-sm text-muted">
              This room code doesn&apos;t look right. Double-check the link
              with whoever sent it.
            </p>
          </>
        )}

        {room && status === "signed-out" && (
          <>
            <h1 className="text-xl font-semibold">Join &ldquo;{room.name}&rdquo;</h1>
            <p className="mt-2 text-sm text-muted">
              Sign in to join this room&apos;s leaderboard.
            </p>
            <button
              onClick={signIn}
              className="mt-6 w-full rounded-2xl border border-border bg-surface px-5 py-3.5 font-medium shadow-sm"
            >
              Continue with Google
            </button>
          </>
        )}

        {room && status === "needs-username" && (
          <>
            <h1 className="text-xl font-semibold">Almost there</h1>
            <p className="mt-2 text-sm text-muted">
              Finish setting up your profile, then come back to this link to
              join &ldquo;{room.name}&rdquo;.
            </p>
            <button
              onClick={() => router.push("/onboarding")}
              className="mt-6 w-full rounded-2xl bg-foreground px-5 py-3.5 font-medium text-background"
            >
              Set up profile
            </button>
          </>
        )}

        {room && status === "ready" && (
          <>
            <h1 className="text-xl font-semibold">Join &ldquo;{room.name}&rdquo;</h1>
            <p className="mt-2 text-sm text-muted">
              You&apos;ll share a leaderboard with everyone in this room.
            </p>
            <button
              onClick={join}
              className="mt-6 w-full rounded-2xl bg-foreground px-5 py-3.5 font-medium text-background transition active:scale-[0.98]"
            >
              Join room
            </button>
          </>
        )}

        {room && status === "joined" && (
          <>
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-success text-white">
              <Check size={20} />
            </div>
            <h1 className="mt-4 text-xl font-semibold">You&apos;re in</h1>
            <p className="mt-2 text-sm text-muted">Taking you to the leaderboard…</p>
          </>
        )}
      </div>
    </main>
  );
}
