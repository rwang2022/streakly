// The canonical, branded URL for links people will actually see/share
// (room invites, etc.) — deliberately hardcoded rather than derived from
// window.location.origin. The app itself is still reachable at whatever
// domain someone happens to visit (old streakly-rosy.vercel.app link,
// the new custom domain, ...), but anything meant to be copy/pasted or
// texted to another person should always point at the one branded
// address, regardless of which domain the sender happened to be on.
export const SITE_URL = "https://streakly.rwang.dev";
