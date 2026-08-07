"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Check, Plus, DoorOpen, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { generateInviteCode } from "@/lib/inviteCode";
import { BottomNav } from "@/components/BottomNav";
import type { Room } from "@/lib/types";

export default function RoomsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [myId, setMyId] = useState<string | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [newRoomName, setNewRoomName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function loadRooms(uid: string) {
    const { data: memberships } = await supabase
      .from("room_memberships")
      .select("room_id")
      .eq("user_id", uid);
    const roomIds = (memberships ?? []).map((m) => m.room_id);
    if (roomIds.length === 0) {
      setRooms([]);
      return;
    }
    const [{ data: roomRows }, { data: allMemberships }] = await Promise.all([
      supabase.from("rooms").select("*").in("id", roomIds),
      supabase.from("room_memberships").select("room_id").in("room_id", roomIds),
    ]);
    const counts = new Map<string, number>();
    for (const m of allMemberships ?? []) {
      counts.set(m.room_id, (counts.get(m.room_id) ?? 0) + 1);
    }
    setRooms(
      ((roomRows ?? []) as Room[])
        .map((r) => ({ ...r, memberCount: counts.get(r.id) ?? 0 }))
        .sort((a, b) => a.name.localeCompare(b.name))
    );
  }

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setMyId(user.id);
      await loadRooms(user.id);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createRoom(e: React.FormEvent) {
    e.preventDefault();
    if (!myId || newRoomName.trim().length < 2) return;
    setError(null);
    setCreating(true);

    let attempt = 0;
    let lastError: { code?: string } | null = null;
    while (attempt < 5) {
      const code = generateInviteCode();
      const { data, error: insertError } = await supabase
        .from("rooms")
        .insert({ name: newRoomName.trim(), invite_code: code, created_by: myId })
        .select()
        .single();

      if (!insertError && data) {
        await supabase
          .from("room_memberships")
          .insert({ room_id: data.id, user_id: myId });
        setNewRoomName("");
        await loadRooms(myId);
        setCreating(false);
        return;
      }
      lastError = insertError;
      if (insertError?.code !== "23505") break; // not a duplicate-code collision
      attempt++;
    }

    setCreating(false);
    setError(
      lastError ? "Couldn't create the room. Try again." : "Something went wrong."
    );
  }

  async function joinRoom(e: React.FormEvent) {
    e.preventDefault();
    if (!myId || joinCode.trim().length < 4) return;
    setError(null);
    setJoining(true);

    const code = joinCode.trim().toUpperCase();
    const { data: room } = await supabase
      .from("rooms")
      .select("*")
      .eq("invite_code", code)
      .single();

    if (!room) {
      setError("No room found for that code.");
      setJoining(false);
      return;
    }

    await supabase
      .from("room_memberships")
      .upsert({ room_id: room.id, user_id: myId });
    setJoinCode("");
    await loadRooms(myId);
    setJoining(false);
  }

  function copyLink(room: Room) {
    const link = `${window.location.origin}/join/${room.invite_code}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedId(room.id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  }

  return (
    <main className="min-h-dvh px-6 pb-28 pt-10">
      <div className="mx-auto max-w-md">
        <Link
          href="/leaderboard"
          className="inline-flex items-center gap-1 text-sm text-muted"
        >
          <ArrowLeft size={16} /> Back to leaderboard
        </Link>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Rooms</h1>
        <p className="mt-1 text-sm text-muted">
          A room shares a leaderboard with everyone in it — no need to friend
          each other one by one.
        </p>

        <div className="mt-6 space-y-2">
          {!loading && rooms.length === 0 && (
            <p className="text-sm text-muted">
              You haven&apos;t joined any rooms yet.
            </p>
          )}
          {rooms.map((room) => (
            <div
              key={room.id}
              className="rounded-2xl border border-border bg-surface px-4 py-3.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users size={16} className="text-muted" />
                  <p className="font-medium">{room.name}</p>
                </div>
                <span className="text-xs text-muted">
                  {room.memberCount} member{room.memberCount === 1 ? "" : "s"}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2">
                <span className="font-mono text-sm tracking-widest">
                  {room.invite_code}
                </span>
                <button
                  onClick={() => copyLink(room)}
                  className="flex items-center gap-1 text-xs font-medium text-accent"
                >
                  {copiedId === room.id ? (
                    <>
                      <Check size={14} /> Copied
                    </>
                  ) : (
                    <>
                      <Copy size={14} /> Copy invite link
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={createRoom} className="mt-8">
          <h2 className="text-sm font-medium text-muted">Create a room</h2>
          <div className="mt-2 flex gap-2">
            <input
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              placeholder="Roommates, College Friends…"
              className="w-full rounded-2xl border border-border bg-surface px-4 py-3 outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={creating || newRoomName.trim().length < 2}
              className="flex shrink-0 items-center gap-1 rounded-2xl bg-foreground px-4 py-3 text-sm font-medium text-background disabled:opacity-40"
            >
              <Plus size={16} /> Create
            </button>
          </div>
        </form>

        <form onSubmit={joinRoom} className="mt-6">
          <h2 className="text-sm font-medium text-muted">Join with a code</h2>
          <div className="mt-2 flex gap-2">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="ABC123X"
              className="w-full rounded-2xl border border-border bg-surface px-4 py-3 font-mono tracking-widest outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={joining || joinCode.trim().length < 4}
              className="flex shrink-0 items-center gap-1 rounded-2xl bg-foreground px-4 py-3 text-sm font-medium text-background disabled:opacity-40"
            >
              <DoorOpen size={16} /> Join
            </button>
          </div>
        </form>

        {error && <p className="mt-4 text-sm text-accent">{error}</p>}
      </div>
      <BottomNav />
    </main>
  );
}
