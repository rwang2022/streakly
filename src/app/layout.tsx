import type { Metadata, Viewport } from "next";
import { RegisterSW } from "@/components/RegisterSW";
import "./globals.css";

export const metadata: Metadata = {
  title: "Streakly",
  description: "Consistency-first fitness accountability with friends.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Streakly",
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#f5f5f7",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

// Runs before first paint so the saved (or system) theme applies with zero
// flash of the wrong colors. Also enables CSS transitions only after the
// initial theme is set, so later manual toggles fade smoothly instead of
// the very first page load visibly animating in.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("streakly-theme");
    var isDark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    var root = document.documentElement;
    if (isDark) root.classList.add("dark");
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", isDark ? "#000000" : "#f5f5f7");
    requestAnimationFrame(function () {
      root.classList.add("theme-transition-ready");
    });
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="antialiased">
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
