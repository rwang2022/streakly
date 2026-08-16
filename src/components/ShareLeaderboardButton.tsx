"use client";

import { useState } from "react";
import { Loader2, Share2 } from "lucide-react";

export interface ShareLeaderboardRow {
  rank: number;
  name: string;
  score: number;
  status: "champion" | "busted" | "slacking" | "normal";
  isMe?: boolean;
}

interface Props {
  title: string;
  rows: ShareLeaderboardRow[];
}

// Renders the full standings (via POST /api/share-leaderboard) as one PNG
// and shares it — the "brag about the group" counterpart to the per-row
// ShareRankButton. Same share-then-download-fallback pattern.
export function ShareLeaderboardButton({ title, rows }: Props) {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  async function handleShare() {
    if (state === "loading") return;
    setState("loading");
    try {
      const res = await fetch("/api/share-leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, rows }),
      });
      if (!res.ok) throw new Error("card render failed");
      const blob = await res.blob();
      const filename = `streakly-${title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")}-leaderboard.png`;
      const file = new File([blob], filename, { type: "image/png" });

      if (
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({
          files: [file],
          title: "Streakly",
          text: `${title} leaderboard on Streakly`,
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
      setState("idle");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setState("idle");
        return;
      }
      setState("error");
      setTimeout(() => setState("idle"), 1500);
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      disabled={state === "loading"}
      aria-label="Share leaderboard"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-muted transition active:scale-90 disabled:opacity-60"
    >
      {state === "loading" ? (
        <Loader2 size={16} className="animate-spin" />
      ) : (
        <Share2 size={16} />
      )}
    </button>
  );
}
