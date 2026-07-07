#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────
// FallWatch Companion Server · Mode B
// Ring 5 · watcher-of-watchers · local process visibility
//
// Serves 127.0.0.1:4318 only. Never binds to 0.0.0.0.
// CORS: only sjgant80-hub.github.io + localhost + file://
//
// Endpoints:
//   GET  /health          → { ok, version, os, arch }
//   GET  /scan            → { nodeProcs, orphans, playwright, zombieTemps, staleLocks }
//   GET  /probe?url=…     → { status, ms } (bypasses CORS for estate ping)
//   POST /kill-orphans    → { killed, cleaned }
//
// Implements Simon's OP5 doctrine directly (mesh-ripple/.claude/CLAUDE.md)
// MIT · AI-Native Solutions · 2026
// ─────────────────────────────────────────────────────────────────

import http from 'node:http';
import { exec, execSync } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const execP = promisify(exec);
const PORT = 4318;
const VERSION = 'v1.0.0';
const isWin = process.platform === 'win32';
const HOME = os.homedir();

const ALLOWED_ORIGINS = [
  'https://sjgant80-hub.github.io',
  'http://localhost:8080',
  'http://localhost:4318',
  'http://127.0.0.1:8080',
  'null' // for file://
];

// ── process listing ─────────────────────────────────────────────
async function listNodeProcs() {
  try {
    if (isWin) {
      // wmic is deprecated but still present on Win10/11.
      // Prefer PowerShell CIM query.
      const cmd = `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='node.exe'\\" | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress"`;
      const { stdout } = await execP(cmd, { maxBuffer: 8 * 1024 * 1024 });
      const raw = stdout.trim();
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      return arr.map(p => ({
        pid: p.ProcessId,
        ppid: p.ParentProcessId,
        cmd: p.CommandLine || ''
      }));
    } else {
      const { stdout } = await execP(`ps -eo pid,ppid,command | grep -E 'node|agent\\.mjs' | grep -v grep`);
      return stdout.trim().split('\n').filter(Boolean).map(line => {
        const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
        return m ? { pid: +m[1], ppid: +m[2], cmd: m[3] } : null;
      }).filter(Boolean);
    }
  } catch (e) {
    return [];
  }
}

async function listChromiumProcs() {
  try {
    if (isWin) {
      const { stdout } = await execP(`tasklist /FI "IMAGENAME eq chrome.exe" /FO CSV /NH 2>NUL`);
      const chrome = stdout.trim().split('\n').filter(l => l.includes('chrome.exe')).length;
      const { stdout: chromiumOut } = await execP(`tasklist /FI "IMAGENAME eq chromium.exe" /FO CSV /NH 2>NUL`).catch(() => ({stdout:''}));
      const chromium = chromiumOut.trim().split('\n').filter(l => l.includes('chromium.exe')).length;
      return { count: chrome + chromium, chrome, chromium };
    } else {
      const { stdout } = await execP(`ps -eo command | grep -E 'chromium|chrome|Chromium' | grep -v grep | wc -l`);
      return { count: parseInt(stdout.trim()) || 0 };
    }
  } catch (e) {
    return { count: 0, err: e.message };
  }
}

// ── OP5 hygiene ─────────────────────────────────────────────────
function isAgentServer(cmd) {
  return /agent\.mjs.*--server|onlybrains-mcp|fallcore-mcp|si-didy.*server/i.test(cmd);
}
function isPlaywrightNode(cmd) {
  return /playwright|puppeteer|chromium.*--remote-debugging/i.test(cmd);
}

async function findOrphans(nodeProcs) {
  const pidSet = new Set(nodeProcs.map(p => p.pid));
  const servers = nodeProcs.filter(p => isAgentServer(p.cmd));
  const orphans = servers.filter(p => {
    // If parent is not another node process AND parent is not a live Claude Code
    // then it's likely an orphan MCP child left behind by /exit-less window close.
    return !pidSet.has(p.ppid) && p.ppid !== process.pid;
  });
  return {
    total: servers.length,
    agentServer: orphans.length,
    orphanPids: orphans.map(o => o.pid),
    detail: orphans.map(o => ({ pid: o.pid, ppid: o.ppid, cmd: o.cmd.slice(0, 200) }))
  };
}

function findZombieTempDirs() {
  const bases = isWin
    ? [ process.env.TEMP, process.env.TMP, path.join(HOME, 'AppData', 'Local', 'Temp') ]
    : [ '/tmp', os.tmpdir() ];
  const seen = new Set();
  const found = [];
  const cutoff = Date.now() - 48 * 3600 * 1000; // 48h
  for (const base of bases.filter(Boolean)) {
    if (seen.has(base)) continue;
    seen.add(base);
    try {
      const entries = fs.readdirSync(base, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        if (!/playwright|puppeteer|chrome_|scoped_dir|\.mcp|claude-code/i.test(e.name)) continue;
        try {
          const full = path.join(base, e.name);
          const st = fs.statSync(full);
          if (st.mtimeMs < cutoff) {
            found.push({ path: full, ageHours: Math.round((Date.now() - st.mtimeMs) / 3600000) });
          }
        } catch {}
        if (found.length > 100) break;
      }
    } catch {}
  }
  return { count: found.length, detail: found.slice(0, 20) };
}

function findStaleLocks() {
  const claudeDir = path.join(HOME, '.claude');
  const found = [];
  const cutoff = Date.now() - 24 * 3600 * 1000; // 24h
  function walk(dir, depth = 0) {
    if (depth > 4) return;
    try {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full, depth + 1);
        else if (/\.lock$|\.pid$/.test(e.name)) {
          try {
            const st = fs.statSync(full);
            if (st.mtimeMs < cutoff) {
              found.push({ path: full, ageHours: Math.round((Date.now() - st.mtimeMs) / 3600000) });
            }
          } catch {}
        }
        if (found.length > 100) return;
      }
    } catch {}
  }
  if (fs.existsSync(claudeDir)) walk(claudeDir);
  return { count: found.length, detail: found.slice(0, 20) };
}

// ── kill orphans ────────────────────────────────────────────────
async function killOrphans() {
  const nodeProcs = await listNodeProcs();
  const orph = await findOrphans(nodeProcs);
  let killed = 0;
  for (const pid of orph.orphanPids) {
    try {
      if (isWin) execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
      else process.kill(pid, 'SIGTERM');
      killed++;
    } catch {}
  }
  const locks = findStaleLocks();
  let cleaned = 0;
  for (const l of locks.detail) {
    try { fs.unlinkSync(l.path); cleaned++; } catch {}
  }
  const temps = findZombieTempDirs();
  for (const t of temps.detail) {
    try { fs.rmSync(t.path, { recursive: true, force: true }); cleaned++; } catch {}
  }
  return { killed, cleaned };
}

// ── URL probe (bypasses CORS for estate ping) ───────────────────
async function probe(url) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
    // Some GH Pages don't answer HEAD — fall back to GET
    if (res.status === 405 || res.status === 501) {
      const res2 = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(8000) });
      return { status: res2.status, ms: Date.now() - t0 };
    }
    return { status: res.status, ms: Date.now() - t0 };
  } catch (e) {
    return { status: 0, ms: Date.now() - t0, err: e.message };
  }
}

// ── HTTP server ─────────────────────────────────────────────────
function setCors(res, origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', allow);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
}

function json(res, obj, status = 200) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  setCors(res, req.headers.origin);
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/health') {
      return json(res, { ok: true, version: VERSION, os: process.platform, arch: process.arch, node: process.version });
    }
    if (url.pathname === '/scan') {
      const nodeProcs = await listNodeProcs();
      const orphans = await findOrphans(nodeProcs);
      const playwright = await listChromiumProcs();
      const zombieTemps = findZombieTempDirs();
      const staleLocks = findStaleLocks();
      return json(res, {
        ts: Date.now(),
        nodeProcs: { count: nodeProcs.length, servers: orphans.total },
        orphans,
        playwright,
        zombieTemps,
        staleLocks,
        improvised: 0
      });
    }
    if (url.pathname === '/probe') {
      const target = url.searchParams.get('url');
      if (!target || !/^https?:\/\//.test(target)) return json(res, { err: 'bad url' }, 400);
      return json(res, await probe(target));
    }
    if (url.pathname === '/kill-orphans' && req.method === 'POST') {
      return json(res, await killOrphans());
    }
    if (url.pathname === '/') {
      res.setHeader('Content-Type', 'text/html');
      return res.end(`<h1>FallWatch Companion ${VERSION}</h1><p>Endpoints: /health · /scan · /probe?url= · POST /kill-orphans</p><p>Open <a href="https://sjgant80-hub.github.io/fallwatch/">fallwatch</a> to use.</p>`);
    }
    json(res, { err: 'not found' }, 404);
  } catch (e) {
    json(res, { err: e.message }, 500);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`◐ FallWatch companion ${VERSION} · listening on http://127.0.0.1:${PORT}`);
  console.log(`  Bound to 127.0.0.1 only. Open https://sjgant80-hub.github.io/fallwatch/ to use.`);
  console.log(`  OS: ${process.platform} ${process.arch} · Node: ${process.version}`);
});
