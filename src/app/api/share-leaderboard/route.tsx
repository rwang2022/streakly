import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextRequest } from "next/server";

// Renders the whole leaderboard (not just one row) as a single shareable
// PNG — a "look at the group standings" card rather than a "look at me"
// card. POST rather than GET/query-params since a room's row list doesn't
// fit comfortably in a URL. Same self-contained approach as
// /api/share-card: no Supabase calls here, just rendering data the caller
// already has.
export const dynamic = "force-dynamic";

interface ShareRow {
  rank: number;
  name: string;
  score: number;
  status: "champion" | "busted" | "slacking" | "normal";
  isMe?: boolean;
}

function assetDataUri(filename: string, mime: string): string {
  const bytes = readFileSync(join(process.cwd(), "public", filename));
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

const ICON = assetDataUri("icons/icon-512.png", "image/png");

const GOLD = "#f5b942";
const RED = "#ff453a";
const MOSS_TEXT = "#7e9a5f";
const WIDTH = 1080;
const ROW_HEIGHT = 118;
const HEADER_HEIGHT = 210;
const FOOTER_HEIGHT = 110;
const MAX_ROWS = 12;

function medalColor(rank: number) {
  if (rank === 1) return GOLD;
  if (rank === 2) return "#c9c9cf";
  if (rank === 3) return "#c98a4a";
  return "#98989d";
}

function RowView({ row }: { row: ShareRow }) {
  const isChampion = row.status === "champion";
  const isBusted = row.status === "busted";
  const isSlacking = row.status === "slacking";
  const textColor = isBusted
    ? RED
    : isSlacking
    ? "#8f8a6e"
    : "#f5f5f7";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        height: ROW_HEIGHT,
        paddingLeft: 44,
        paddingRight: 44,
        borderBottom: "1px solid #232323",
        background: isChampion ? "rgba(245,185,66,0.08)" : "transparent",
      }}
    >
      <div
        style={{
          display: "flex",
          width: 56,
          fontSize: 32,
          fontWeight: 800,
          color: medalColor(row.rank),
        }}
      >
        {row.rank}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 64,
          height: 64,
          borderRadius: 64,
          marginRight: 22,
          background: isChampion
            ? `linear-gradient(135deg, #ffd166, #f6a623)`
            : isBusted
            ? "linear-gradient(135deg, #e8938c, #c94a3f)"
            : isSlacking
            ? "linear-gradient(135deg, #a8a596, #7c7862)"
            : "linear-gradient(135deg, #ff9f0a, #ff453a)",
          color: "#fff",
          fontSize: 26,
          fontWeight: 700,
        }}
      >
        {row.name.charAt(0).toUpperCase() || "?"}
      </div>
      <div
        style={{
          display: "flex",
          flex: 1,
          fontSize: 32,
          fontWeight: 600,
          color: textColor,
          textDecoration: isBusted || isSlacking ? "line-through" : "none",
        }}
      >
        {row.name}
        {row.isMe ? (
          <span style={{ display: "flex", marginLeft: 10, fontSize: 22, color: "#98989d" }}>
            (you)
          </span>
        ) : null}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 36,
          fontWeight: 800,
          color: isChampion ? GOLD : isBusted ? RED : isSlacking ? MOSS_TEXT : "#f5f5f7",
        }}
      >
        {row.score}
      </div>
    </div>
  );
}

export async function POST(request: NextRequest) {
  let body: { title?: string; rows?: ShareRow[] };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const title = body.title ?? "Leaderboard";
  const allRows = Array.isArray(body.rows) ? body.rows : [];
  const rows = allRows.slice(0, MAX_ROWS);
  const overflow = allRows.length - rows.length;

  const height =
    HEADER_HEIGHT + rows.length * ROW_HEIGHT + (overflow > 0 ? 70 : 0) + FOOTER_HEIGHT;

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: "#000000",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            paddingTop: 56,
            paddingBottom: 30,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ICON} alt="" width={36} height={36} style={{ borderRadius: 9 }} />
            <span style={{ fontSize: 24, fontWeight: 700, color: "#f5f5f7" }}>
              Streakly
            </span>
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 18,
              fontSize: 44,
              fontWeight: 800,
              color: "#f5f5f7",
            }}
          >
            {title}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
          {rows.map((row) => (
            <RowView key={row.rank} row={row} />
          ))}
        </div>

        {overflow > 0 && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              paddingTop: 22,
              fontSize: 24,
              color: "#98989d",
            }}
          >
            +{overflow} more
          </div>
        )}

        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "flex-end",
            justifyContent: "center",
            paddingBottom: 40,
            fontSize: 20,
            color: "#98989d",
            letterSpacing: 1,
          }}
        >
          streakly.rwang.dev
        </div>
      </div>
    ),
    { width: WIDTH, height }
  );
}
