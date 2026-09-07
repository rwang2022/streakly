"use client";

import { useEffect, useState } from "react";
import { Dumbbell, Check, Copy, ChevronDown } from "lucide-react";

type State =
  | { status: "loading" }
  | { status: "disconnected"; url: string }
  | {
      status: "connected";
      url: string;
      lastUsedAt: string | null;
      // Present only right after connecting/regenerating this session —
      // the raw token is never re-fetchable.
      token: string | null;
    };

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const days = Math.round(hr / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function IntegrationSettings() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/integrations/token");
      if (!res.ok) {
        setState({ status: "disconnected", url: "" });
        return;
      }
      const data = await res.json();
      setState(
        data.connected
          ? {
              status: "connected",
              url: data.url,
              lastUsedAt: data.lastUsedAt,
              token: null,
            }
          : { status: "disconnected", url: data.url }
      );
    })();
  }, []);

  async function connect() {
    setBusy(true);
    setTestResult(null);
    const res = await fetch("/api/integrations/token", { method: "POST" });
    setBusy(false);
    if (!res.ok) return;
    const { token, url } = await res.json();
    setState({ status: "connected", url, lastUsedAt: null, token });
    setShowSetup(true);
    setConfirmOff(false);
  }

  async function disconnect() {
    setBusy(true);
    await fetch("/api/integrations/token", { method: "DELETE" });
    setBusy(false);
    setConfirmOff(false);
    setShowSetup(false);
    setTestResult(null);
    setState({
      status: "disconnected",
      url: state.status === "loading" ? "" : state.url,
    });
  }

  async function testConnection(token: string, url: string) {
    setTestResult("Testing…");
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      setTestResult(
        res.ok && data?.ok
          ? `Working — connected as ${data.connectedAs}.`
          : `Failed (HTTP ${res.status}).`
      );
    } catch {
      setTestResult("Failed — couldn't reach the endpoint.");
    }
  }

  function copy(text: string, key: string) {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(key);
        setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
      },
      () => {}
    );
  }

  if (state.status === "loading") return null;

  const token = state.status === "connected" ? state.token : null;

  return (
    <div className="mt-6 rounded-2xl border border-border bg-surface px-4 py-4">
      <div className="flex items-start gap-3">
        <Dumbbell size={18} className="mt-0.5 shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Strong / Apple Health</p>
          <p className="text-xs text-muted">
            {state.status === "connected"
              ? state.lastUsedAt
                ? `Connected · last workout synced ${relativeTime(
                    state.lastUsedAt
                  )}`
                : "Connected · no workouts synced yet"
              : "Auto-log a Gym activity when a Strong workout finishes."}
          </p>
        </div>
      </div>

      {state.status === "disconnected" && (
        <button
          onClick={connect}
          disabled={busy}
          className="mt-3 w-full rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-background transition active:scale-[0.98] disabled:opacity-60"
        >
          {busy ? "Connecting…" : "Connect"}
        </button>
      )}

      {state.status === "connected" && (
        <>
          {token && (
            <div className="mt-3 rounded-xl border border-accent/30 bg-accent/5 p-3">
              <p className="text-xs font-medium text-accent">
                Copy your token now — it won&apos;t be shown again.
              </p>

              <Field
                label="Endpoint URL"
                value={state.url}
                copied={copied === "url"}
                onCopy={() => copy(state.url, "url")}
              />
              <Field
                label="Token"
                value={token}
                mono
                copied={copied === "token"}
                onCopy={() => copy(token, "token")}
              />

              <button
                onClick={() => testConnection(token, state.url)}
                className="mt-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium"
              >
                Test connection
              </button>
              {testResult && (
                <p className="mt-1.5 text-xs text-muted">{testResult}</p>
              )}
            </div>
          )}

          <button
            onClick={() => setShowSetup((s) => !s)}
            className="mt-3 flex w-full items-center justify-between rounded-xl border border-border bg-surface px-3 py-2.5 text-sm font-medium"
          >
            iOS setup guide
            <ChevronDown
              size={16}
              className={`transition-transform ${showSetup ? "rotate-180" : ""}`}
            />
          </button>

          {showSetup && <SetupGuide url={state.url} hasToken={Boolean(token)} />}

          <div className="mt-3 flex gap-2">
            <button
              onClick={connect}
              disabled={busy}
              className="flex-1 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-medium disabled:opacity-60"
            >
              Regenerate token
            </button>
            {!confirmOff ? (
              <button
                onClick={() => setConfirmOff(true)}
                className="flex-1 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-medium text-accent"
              >
                Disconnect
              </button>
            ) : (
              <button
                onClick={disconnect}
                disabled={busy}
                className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy ? "…" : "Confirm"}
              </button>
            )}
          </div>
          {confirmOff && (
            <p className="mt-2 text-xs text-muted">
              Disconnecting revokes the token — your Shortcut will stop
              syncing until you reconnect and update it.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="mt-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
        {label}
      </p>
      <div className="mt-1 flex items-start gap-2">
        <code
          className={`min-w-0 flex-1 break-all rounded-lg bg-surface-2 px-2.5 py-1.5 text-[11px] ${
            mono ? "font-mono" : ""
          }`}
        >
          {value}
        </code>
        <button
          onClick={onCopy}
          aria-label={`Copy ${label}`}
          className="shrink-0 rounded-lg border border-border bg-surface p-1.5"
        >
          {copied ? (
            <Check size={14} className="text-success" />
          ) : (
            <Copy size={14} className="text-muted" />
          )}
        </button>
      </div>
    </div>
  );
}

function SetupGuide({ url, hasToken }: { url: string; hasToken: boolean }) {
  const body = `{"startedAt": "[Start Date]", "durationMinutes": [Duration ÷ 60], "note": "Strong"}`;
  return (
    <div className="mt-2 space-y-2 rounded-xl border border-border bg-surface-2/40 p-3 text-xs text-muted">
      <p>
        One-time setup in the <strong>Shortcuts</strong> app. Every time you
        finish a workout and leave Strong, the latest Apple Health workout is
        posted here; repeats of the same workout are ignored.
      </p>
      <ol className="list-decimal space-y-1.5 pl-4">
        <li>
          <strong>Automation</strong> tab → <strong>+</strong> → <strong>App</strong>{" "}
          → pick <strong>Strong</strong>, <strong>Is Closed</strong>,{" "}
          <strong>Run Immediately</strong>.
        </li>
        <li>
          Add <strong>Find Health Samples</strong>: <em>Workouts</em>, sort by{" "}
          <em>End Date</em>, <em>Latest First</em>, <em>Limit 1</em>.
        </li>
        <li>
          Add <strong>If</strong> → <em>Health Samples has any value</em>. Put
          the rest inside it.
        </li>
        <li>
          <strong>Get Details of Health Samples</strong> → <em>Start Date</em>.
          Add another for <em>Duration</em>.
        </li>
        <li>
          Add a <strong>Text</strong> action with this body (insert the{" "}
          <em>Start Date</em> variable; for duration add a{" "}
          <strong>Calculate</strong> <em>Duration ÷ 60</em> and insert it, or
          just delete the <code>durationMinutes</code> field):
          <code className="mt-1 block break-all rounded-lg bg-surface px-2.5 py-1.5 font-mono text-[11px] text-foreground">
            {body}
          </code>
        </li>
        <li>
          Add <strong>Get Contents of URL</strong>:
          <div className="mt-1 space-y-1">
            <div className="break-all rounded-lg bg-surface px-2.5 py-1.5">
              URL <code className="font-mono text-foreground">{url}</code>
            </div>
            <div className="rounded-lg bg-surface px-2.5 py-1.5">
              Method <code className="font-mono text-foreground">POST</code>
            </div>
            <div className="break-all rounded-lg bg-surface px-2.5 py-1.5">
              Header <code className="font-mono text-foreground">Authorization</code>{" "}
              ={" "}
              <code className="font-mono text-foreground">
                Bearer {hasToken ? "<paste your token>" : "<your token>"}
              </code>
            </div>
            <div className="rounded-lg bg-surface px-2.5 py-1.5">
              Request Body <code className="font-mono text-foreground">File</code>{" "}
              → the Text from step 5
            </div>
          </div>
        </li>
      </ol>
      {!hasToken && (
        <p>
          Lost your token? Tap <strong>Regenerate token</strong> above and update
          the header in your Shortcut.
        </p>
      )}
      <p>On iOS 16 or earlier the automation asks before each run.</p>
    </div>
  );
}
