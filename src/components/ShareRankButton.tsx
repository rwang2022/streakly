"use client";

import { useState } from "react";
import { Loader2, Share2 } from "lucide-react";

export interface ShareCardProps {
  variant: "champion" | "tombstone" | "disgraced" | "normal";
  name: string;
  rank: number;
  score: number;
  subtitle: string;
  badgeLabel?: string;
  decaying?: boolean;
}

// Icon-only share button that renders a leaderboard row as a PNG (via
// /api/share-card) and hands it off through the Web Share API so it can be
// dropped straight into Messages/Instagram/etc. Falls back to a plain
// download on desktop browsers that don't support sharing files.
//
// Rendered inside rows that are sometimes wrapped in a whole-card <Link>
// (see leaderboard/page.tsx) — stopPropagation/preventDefault keep a tap
// here from also triggering the row's navigation.
export function ShareRankButton(props: ShareCardProps) {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  function buildUrl() {
    const params = new URLSearchParams({
      variant: props.variant,
      name: props.name,
      rank: String(props.rank),
      score: String(props.score),
      subtitle: props.subtitle,
    });
    if (props.badgeLabel) params.set("badgeLabel", props.badgeLabel);
    if (props.decaying) params.set("decaying", "1");
    return `/api/share-card?${params.toString()}`;
  }

  async function handleShare(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (state === "loading") return;
    setState("loading");
    try {
      const res = await fetch(buildUrl());
      if (!res.ok) throw new Error("card render failed");
      const blob = await res.blob();
      const filename = `streakly-${props.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")}.png`;
      const file = new File([blob], filename, { type: "image/png" });

      if (
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({
          files: [file],
          title: "Streakly",
          text: `${props.name} — rank #${props.rank} on Streakly`,
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
      // AbortError just means the person closed the native share sheet —
      // not a real failure, so don't flash an error state for it.
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
      aria-label="Share this card"
      disabled={state === "loading"}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted transition active:scale-90 disabled:opacity-60"
    >
      {state === "loading" ? (
        <Loader2 size={15} className="animate-spin" />
      ) : (
        <Share2 size={15} />
      )}
    </button>
  );
}
