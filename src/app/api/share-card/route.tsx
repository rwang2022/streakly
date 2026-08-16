import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextRequest } from "next/server";

// Renders a shareable 1080x1080 PNG version of a leaderboard row — the
// champion card, a tombstone, a "disgraced" cheater card, or a plain rank
// card — so people can post their rank (or roast a friend's) outside the
// app. Driven entirely by query params rather than re-querying Supabase:
// the leaderboard page already has all this text computed per-row, so
// this route just renders it, which keeps it simple and fast.
//
// Images are read from disk and inlined as base64 data URIs rather than
// fetched over HTTP — satori/resvg (what ImageResponse uses under the
// hood) handles PNG data URIs reliably, whereas a self-fetch over the
// network is slower and depends on the deployed domain being reachable
// from the server, which isn't guaranteed in every environment.
export const dynamic = "force-dynamic";

function assetDataUri(filename: string, mime: string): string {
  const bytes = readFileSync(join(process.cwd(), "public", filename));
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

const WREATH = assetDataUri("laurel-wreath.png", "image/png");
const CROWN = assetDataUri("crown.png", "image/png");
const ICON = assetDataUri("icons/icon-512.png", "image/png");

const GOLD = "#f5b942";
const MOSS = "#5c7a3f";
const RED = "#ff453a";
const BG = "#000000";

function Brand() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={ICON} alt="" width={36} height={36} style={{ borderRadius: 9 }} />
      <span style={{ fontSize: 24, fontWeight: 700, color: "#f5f5f7" }}>
        Streakly
      </span>
    </div>
  );
}

function Footer() {
  return (
    <div
      style={{
        display: "flex",
        fontSize: 20,
        color: "#98989d",
        letterSpacing: 1,
      }}
    >
      streakly.rwang.dev
    </div>
  );
}

function Avatar({
  initial,
  size,
  gradientFrom,
  gradientTo,
}: {
  initial: string;
  size: number;
  gradientFrom: string;
  gradientTo: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: size,
        background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`,
        color: "#fff",
        fontSize: size * 0.42,
        fontWeight: 700,
      }}
    >
      {initial}
    </div>
  );
}

function MossDot({
  x,
  y,
  size,
  color,
}: {
  x: number;
  y: number;
  size: number;
  color: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        position: "absolute",
        left: x,
        top: y,
        width: size,
        height: size * 0.7,
        borderRadius: 999,
        background: color,
        opacity: 0.85,
        transform: "rotate(-8deg)",
      }}
    />
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const variant = searchParams.get("variant") ?? "normal";
  const name = searchParams.get("name") ?? "Someone";
  const rank = searchParams.get("rank") ?? "";
  const score = searchParams.get("score") ?? "0";
  const subtitle = searchParams.get("subtitle") ?? "";
  const badgeLabel = searchParams.get("badgeLabel") ?? "";
  const initial = name.charAt(0).toUpperCase() || "?";
  const decaying = searchParams.get("decaying") === "1";

  let content: React.ReactNode;

  if (variant === "champion") {
    content = (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "100%",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={CROWN} alt="" width={140} height={105} />
        <div
          style={{
            display: "flex",
            marginTop: 4,
            background: `linear-gradient(90deg, ${GOLD}, #f6a623)`,
            borderRadius: 999,
            padding: "10px 28px",
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: 4,
            color: "#1d1d1f",
          }}
        >
          CHAMPION
        </div>
        <div
          style={{
            display: "flex",
            position: "relative",
            marginTop: 44,
            alignItems: "center",
            justifyContent: "center",
            width: 340,
            height: 300,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={WREATH}
            alt=""
            width={340}
            height={296}
            style={{ position: "absolute" }}
          />
          <Avatar initial={initial} size={190} gradientFrom="#ffd166" gradientTo="#f6a623" />
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 40,
            fontSize: 64,
            fontWeight: 800,
            color: "#f5f5f7",
          }}
        >
          {name}
        </div>
        <div style={{ display: "flex", marginTop: 10, fontSize: 28, color: GOLD }}>
          {subtitle}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 36,
            fontSize: 120,
            fontWeight: 800,
            color: GOLD,
            lineHeight: 1,
          }}
        >
          {score}
        </div>
        <div style={{ display: "flex", fontSize: 22, color: "#c98a12", letterSpacing: 3 }}>
          SCORE
        </div>
      </div>
    );
  } else if (variant === "tombstone") {
    content = (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "100%",
        }}
      >
        <div style={{ display: "flex", fontSize: 26, color: "#98989d" }}>
          #{rank}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            width: 14,
            height: 60,
            borderRadius: 4,
            background: "#8a8776",
          }}
        />
        <div
          style={{
            display: "flex",
            marginTop: -37,
            width: 60,
            height: 14,
            borderRadius: 4,
            background: "#8a8776",
          }}
        />
        <div
          style={{
            display: "flex",
            position: "relative",
            flexDirection: "column",
            alignItems: "center",
            marginTop: 16,
            width: 560,
            paddingTop: 70,
            paddingBottom: 56,
            borderTopLeftRadius: 280,
            borderTopRightRadius: 280,
            borderBottomLeftRadius: 24,
            borderBottomRightRadius: 24,
            background: "linear-gradient(135deg, #cbc9bf, #a8a596)",
            border: "5px solid #787564",
          }}
        >
          <MossDot x={20} y={340} size={54} color={MOSS} />
          <MossDot x={470} y={90} size={46} color="#4a6633" />
          <MossDot x={40} y={120} size={38} color="#6f8f4d" />
          <MossDot x={490} y={310} size={42} color={MOSS} />
          <div
            style={{
              display: "flex",
              fontSize: 32,
              fontWeight: 700,
              letterSpacing: 8,
              color: "#55523f",
            }}
          >
            R.I.P.
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 18,
              width: 160,
              height: 2,
              background: "#787564",
            }}
          />
          <div
            style={{
              display: "flex",
              marginTop: 26,
              fontSize: 44,
              fontWeight: 700,
              color: "#4a4838",
              textDecoration: "line-through",
            }}
          >
            {name}
          </div>
          <div style={{ display: "flex", marginTop: 12, fontSize: 24, color: "#6b6957" }}>
            {subtitle}
          </div>
          <div style={{ display: "flex", marginTop: 20, fontSize: 30, fontWeight: 700, color: "#4a4838" }}>
            {score} pts
          </div>
        </div>
      </div>
    );
  } else if (variant === "disgraced") {
    content = (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "100%",
        }}
      >
        <div
          style={{
            display: "flex",
            background: RED,
            borderRadius: 999,
            padding: "10px 28px",
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: 4,
            color: "#fff",
          }}
        >
          DISGRACED
        </div>
        <div
          style={{
            display: "flex",
            position: "relative",
            marginTop: 44,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Avatar initial={initial} size={200} gradientFrom="#e8938c" gradientTo="#c94a3f" />
          <div
            style={{
              display: "flex",
              position: "absolute",
              width: 220,
              height: 8,
              borderRadius: 4,
              background: RED,
              transform: "rotate(45deg)",
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 40,
            fontSize: 56,
            fontWeight: 800,
            color: RED,
            textDecoration: "line-through",
          }}
        >
          {name}
        </div>
        <div style={{ display: "flex", marginTop: 12, fontSize: 26, fontWeight: 600, color: RED }}>
          {subtitle}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 32,
            fontSize: 100,
            fontWeight: 800,
            color: RED,
            textDecoration: "line-through",
            lineHeight: 1,
          }}
        >
          {score}
        </div>
        <div style={{ display: "flex", fontSize: 20, color: "#c94a3f", letterSpacing: 3 }}>
          SCORE
        </div>
      </div>
    );
  } else {
    content = (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "100%",
        }}
      >
        <div style={{ display: "flex", fontSize: 30, color: "#98989d" }}>
          RANK #{rank}
        </div>
        <div style={{ display: "flex", position: "relative", marginTop: 30 }}>
          <Avatar
            initial={initial}
            size={190}
            gradientFrom={decaying ? "#c9c6b3" : "#ff9f0a"}
            gradientTo={decaying ? "#8f8a6e" : "#ff453a"}
          />
          {decaying && (
            <>
              <MossDot x={-6} y={140} size={40} color={MOSS} />
              <MossDot x={150} y={-4} size={34} color="#4a6633" />
            </>
          )}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 40,
            fontSize: 60,
            fontWeight: 800,
            color: decaying ? "#98989d" : "#f5f5f7",
            textDecoration: decaying ? "line-through" : "none",
          }}
        >
          {name}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 10,
            fontSize: 26,
            color: decaying ? "#ff9f0a" : "#98989d",
          }}
        >
          {subtitle}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 34,
            fontSize: 100,
            fontWeight: 800,
            color: "#f5f5f7",
            lineHeight: 1,
          }}
        >
          {score}
        </div>
        <div style={{ display: "flex", fontSize: 20, color: "#98989d", letterSpacing: 3 }}>
          SCORE
        </div>
        {badgeLabel && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 20,
              background: "#2c2c2e",
              borderRadius: 999,
              padding: "8px 20px",
              fontSize: 22,
              color: "#98989d",
            }}
          >
            <span>{badgeLabel}</span>
          </div>
        )}
      </div>
    );
  }

  const bgTint =
    variant === "champion"
      ? "rgba(245,185,66,0.16)"
      : variant === "tombstone"
      ? "rgba(92,122,63,0.14)"
      : variant === "disgraced"
      ? "rgba(255,69,58,0.16)"
      : "rgba(255,159,10,0.08)";

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: "56px 0 44px",
          background: `radial-gradient(ellipse at 50% 30%, ${bgTint}, ${BG} 70%)`,
        }}
      >
        <Brand />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            flex: 1,
            justifyContent: "center",
          }}
        >
          {content}
        </div>
        <Footer />
      </div>
    ),
    { width: 1080, height: 1080 }
  );
}
