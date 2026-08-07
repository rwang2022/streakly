"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, UserPlus, Check, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BottomNav } from "@/components/BottomNav";
import type { Friendship, Profile } from "@/lib/types";

type Enriched = Friendship & { other: Profile };

export default function FriendsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [myId, setMyId] = useState<string | null>(null);
  const [friendships, setFriendships] = useState<Enriched[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function loadFriendships(uid: string) {
    const { data } = await supabase
      .from("friendships")
      .select("*")
      .or(`requester_id.eq.${uid},addressee_id.eq.${uid}`);

    const rows = data ?? [];
    const otherIds = Array.from(
      new Set(
        rows.map((f) => (f.requester_id === uid ? f.addressee_id : f.requester_id))
      )
    );

    if (otherIds.length === 0) {
      setFriendships([]);
      return;
    }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("*")
      .in("id", otherIds);

    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p as Profile]));
    setFriendships(
      rows
        .map((f) => ({
          ...(f as Friendship),
          other: profileMap.get(
            f.requester_id === uid ? f.addressee_id : f.requester_id
          )!,
        }))
        .filter((f) => f.other)
    );
  }

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setMyId(user.id);
      await loadFriendships(user.id);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!myId || query.trim().length < 2) return;
    const handle = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .ilike("username", `%${query.trim()}%`)
        .neq("id", myId)
        .not("username", "is", null)
        .limit(10);
      setResults((data ?? []) as Profile[]);
    }, 250);
    return () => clearTimeout(handle);
  }, [query, myId, supabase]);

  const visibleResults = query.trim().length < 2 ? [] : results;

  const accepted = friendships.filter((f) => f.status === "accepted");
  const incoming = friendships.filter(
    (f) => f.status === "pending" && f.addressee_id === myId
  );
  const outgoingIds = new Set(
    friendships
      .filter((f) => f.status === "pending" && f.requester_id === myId)
      .map((f) => f.other.id)
  );
  const friendIds = new Set(accepted.map((f) => f.other.id));

  async function sendRequest(targetId: string) {
    if (!myId) return;
    setBusyId(targetId);
    await supabase
      .from("friendships")
      .insert({ requester_id: myId, addressee_id: targetId, status: "pending" });
    await loadFriendships(myId);
    setBusyId(null);
  }

  async function respond(friendshipId: string, status: "accepted" | "declined") {
    if (!myId) return;
    setBusyId(friendshipId);
    await supabase
      .from("friendships")
      .update({ status, responded_at: new Date().toISOString() })
      .eq("id", friendshipId);
    await loadFriendships(myId);
    setBusyId(null);
  }

  return (
    <main className="min-h-dvh px-6 pb-28 pt-10">
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight">Friends</h1>

        <div className="mt-6 flex items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3">
          <Search size={18} className="text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by username"
            className="w-full bg-transparent outline-none placeholder:text-muted"
          />
        </div>

        {visibleResults.length > 0 && (
          <div className="mt-3 space-y-2">
            {visibleResults.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3"
              >
                <div>
                  <p className="font-medium">@{p.username}</p>
                  {p.display_name && (
                    <p className="text-xs text-muted">{p.display_name}</p>
                  )}
                </div>
                {friendIds.has(p.id) ? (
                  <span className="text-xs text-muted">Friends</span>
                ) : outgoingIds.has(p.id) ? (
                  <span className="text-xs text-muted">Requested</span>
                ) : (
                  <button
                    onClick={() => sendRequest(p.id)}
                    disabled={busyId === p.id}
                    className="flex items-center gap-1 rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background"
                  >
                    <UserPlus size={14} /> Add
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {incoming.length > 0 && (
          <section className="mt-8">
            <h2 className="text-sm font-medium text-muted">Requests</h2>
            <div className="mt-3 space-y-2">
              {incoming.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3"
                >
                  <p className="font-medium">@{f.other.username}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => respond(f.id, "accepted")}
                      disabled={busyId === f.id}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-success text-white"
                    >
                      <Check size={16} />
                    </button>
                    <button
                      onClick={() => respond(f.id, "declined")}
                      disabled={busyId === f.id}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-muted"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mt-8">
          <h2 className="text-sm font-medium text-muted">
            Your friends {accepted.length > 0 && `(${accepted.length})`}
          </h2>
          <div className="mt-3 space-y-2">
            {!loading && accepted.length === 0 && (
              <p className="text-sm text-muted">
                No friends yet — search a username above to add someone.
              </p>
            )}
            {accepted.map((f) => (
              <div
                key={f.id}
                className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-sm font-semibold">
                  {f.other.username?.charAt(0).toUpperCase()}
                </div>
                <p className="font-medium">@{f.other.username}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
      <BottomNav />
    </main>
  );
}
