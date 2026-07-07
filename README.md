# ◐ FallWatch

**Ring 5 · watcher-of-watchers.** Sovereign hygiene monitor for the AI-Native Solutions estate.

Live: <https://sjgant80-hub.github.io/fallwatch/>

---

## What it is

FallWatch is the estate's audit surface — the thin instrument that watches everything else. Ring 5 in the seed cosmology is `◐ · mirror · verify` — the layer that checks *world ≠ word*. Before FallWatch, this ring was implicit doctrine (Simon's OP1–OP5 rules lived only in `mesh-ripple/.claude/CLAUDE.md`). FallWatch makes the doctrine **sovereign, portable, and clickable**.

It watches three things:

| Surface | What it names | How it names it |
|---|---|---|
| **Session hygiene** | Browser workers, IDB usage, cache size, WebRTC peers, WebLLM state · optionally local process count, orphan MCP children, zombie temp dirs, stale locks | Mode A (browser only) · Mode B (local companion server) |
| **Estate watch** | Every tool in the FallHarbor manifest · Pages live status · last-audit age | Fetches manifest, pings each URL, red/green |
| **Chain audit** | FallSignature-signed events · prevHash → docHash walk | Reads IndexedDB and localStorage, verifies unbroken |
| **Diagnostics** | OP1–OP5 pass/fail | Each rule with a plain-English explanation |

---

## Two modes

### Mode A · Browser only (default)

Just open <https://sjgant80-hub.github.io/fallwatch/>. It scans:

- Service worker registrations
- IndexedDB usage estimate (via `navigator.storage.estimate`)
- CacheStorage bucket count and names
- localStorage keys / bytes
- WebLLM model caches (matches `webllm|mlc|llama|qwen|hf-hub`)
- Estate URL liveness (via `fetch` no-cors — opaque = up)
- IndexedDB audit-event scan (any store matching `audit|event|chain|log|signed`)

**Limits:** browsers can't see local processes. That's what Mode B is for.

### Mode B · Local companion (opt-in)

Download `companion-server.mjs` and run:

```bash
node companion-server.mjs
# ◐ FallWatch companion v1.0.0 · listening on http://127.0.0.1:4318
```

FallWatch auto-detects it. The badge flips from **Mode A · Browser** → **Mode B · Companion**. You now get:

- **`node.exe` process count** (the raw view)
- **`agent.mjs --server` orphans** — MCP children whose parent Claude Code exited without `/exit`
- **Playwright / Chromium process count** — the noob-count leak Thomas warned about
- **Zombie temp dirs** — `%TEMP%\playwright*`, `chrome_*`, `.mcp*`, `claude-code*` older than 48h
- **Stale `.claude/*.lock`** — locks older than 24h under `~/.claude/`
- **Real HEAD probes** — companion bypasses CORS to give exact HTTP status codes for estate URLs
- **`POST /kill-orphans`** — one-click cleanup that only touches named orphans + stale locks + old temps

The companion binds `127.0.0.1` only. Never `0.0.0.0`. CORS is locked to `sjgant80-hub.github.io` + `localhost` + `file://`. Nothing goes over the network.

---

## OP5 doctrine · cross-reference

FallWatch implements the five operational rules from Simon's 2026-06-02 forensic (`mesh-ripple/.claude/CLAUDE.md`):

- **OP1 · ENV-FIRST DEBUG** — companion checks (a) same processes, (b) same MCP, (c) same files on disk
- **OP2 · NAME-BEFORE-KILL** — every process flagged is named in one sentence before you can kill it
- **OP3 · IMPROVISATION = STOP-THE-LINE** — companion scans for duplicate improvised verb scripts in scratchpad
- **OP4 · 30-MIN TIME-BOX** — doctrine reminder; the operator timer lives in FallHarmony cockpit
- **OP5 · SESSION HYGIENE** — the whole point: orphan MCP children, zombie temps, stale locks

The **si-didy `session_audit` verb** in `agent.mjs` implements the same scan server-side. FallWatch is the **UI** for that scan — plus everything a browser can see that agents can't.

---

## Quick start

```
# 1. Open in browser (Mode A):
https://sjgant80-hub.github.io/fallwatch/

# 2. For local process visibility (Mode B), also:
curl -O https://raw.githubusercontent.com/sjgant80-hub/fallwatch/main/companion-server.mjs
node companion-server.mjs
```

Refresh the page. Badge should flip to **Mode B · Companion**.

---

## Where it sits in the seed

```
R0 ●   ground · intake         (fallharbor · directory)
R1 〜  signal · parse          (fall-kit cascade)
R2 ┃   gate · validate         (fall-vetter · fall-prompt-gate)
R3 ♡   heart · UX              (fallmirror · shadowcompass)
R4 △   voice · render          (fallpost · fallcarousel)
R5 ◐   mirror · verify         ◄── FallWatch lives here
R6 ◯   watcher · audit         (fallsignature · fallharmony cockpit)
```

Ring 5 was thin. Now it isn't.

---

## Sovereignty

- Single HTML file. Works from `file://`.
- Zero SaaS. Zero telemetry. Nothing leaves your machine.
- Companion is local-only (`127.0.0.1`). CORS locked.
- MIT. Fork it. Configure it. Ship your own.

---

## License

MIT · AI-Native Solutions · <https://sjgant80-hub.github.io/fallharbor/>
