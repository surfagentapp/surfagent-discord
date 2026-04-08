import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const DAEMON_URL = process.env.SURFAGENT_DAEMON_URL ?? "http://127.0.0.1:7201";
const TOKEN_PATH = join(homedir(), ".surfagent", "daemon-token.txt");
const SITE_URL_RE = new RegExp(String.raw`https?://(?:canary\.|ptb\.)?discord\.com/`, "i");
const BASE_URL = "https://discord.com";
const DEFAULT_PATH = "/channels/@me";

let cachedToken: string | null | undefined;

async function readDaemonError(path: string, res: Response): Promise<never> {
  const text = await res.text();
  if (res.status === 401) {
    throw new Error(
      `${path} failed (HTTP 401): Unauthorized. Check SURFAGENT_AUTH_TOKEN or ~/.surfagent/daemon-token.txt.`,
    );
  }
  throw new Error(`${path} failed (HTTP ${res.status}): ${text}`);
}

function getAuthToken(): string | null {
  if (cachedToken !== undefined) return cachedToken;
  const envToken = process.env.SURFAGENT_AUTH_TOKEN?.trim();
  if (envToken) return (cachedToken = envToken);
  try {
    const raw = readFileSync(TOKEN_PATH, "utf-8").trim();
    if (raw) return (cachedToken = raw);
  } catch {}
  cachedToken = null;
  return cachedToken;
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const token = getAuthToken();
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function daemonRequest<T>(path: string, init: RequestInit, timeoutMs = 15_000): Promise<T> {
  const res = await fetch(`${DAEMON_URL}${path}`, {
    ...init,
    headers: { ...headers(), ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) await readDaemonError(path, res);
  return (await res.json()) as T;
}

export interface TabInfo {
  id: string;
  title: string;
  url: string;
  active?: boolean;
}

export async function daemonHealth() {
  return daemonRequest<{ ok?: boolean; version?: string; error?: string }>("/health", { method: "GET" }, 10_000);
}

export async function listTabs(): Promise<TabInfo[]> {
  const data = await daemonRequest<{ ok: boolean; tabs?: TabInfo[]; error?: string }>("/browser/tabs", { method: "GET" }, 10_000);
  if (!data.ok) throw new Error(data.error ?? "Could not list tabs.");
  return data.tabs ?? [];
}

export async function navigateTab(url: string, tabId?: string): Promise<TabInfo> {
  const data = await daemonRequest<{ ok: boolean; tab?: TabInfo; error?: string }>(
    "/browser/navigate",
    { method: "POST", body: JSON.stringify(tabId ? { url, tabId } : { url }) },
    30_000,
  );
  if (!data.ok || !data.tab) throw new Error(data.error ?? "Navigate failed.");
  return data.tab;
}

export async function evaluate<T = unknown>(expression: string, tabId?: string): Promise<T> {
  const data = await daemonRequest<{ ok: boolean; result?: T; error?: string }>(
    "/browser/evaluate",
    { method: "POST", body: JSON.stringify(tabId ? { expression, tabId } : { expression }) },
    20_000,
  );
  if (!data.ok) throw new Error(data.error ?? "Evaluate failed.");
  return data.result as T;
}

export async function findSiteTab(): Promise<TabInfo | null> {
  const tabs = await listTabs();
  return tabs.find((tab) => SITE_URL_RE.test(tab.url)) ?? null;
}

export async function ensureSiteTab(path = DEFAULT_PATH): Promise<TabInfo> {
  const targetUrl = /^https?:\/\//i.test(path)
    ? path
    : `${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const existing = await findSiteTab();
  if (existing) {
    await navigateTab(targetUrl, existing.id);
    return { ...existing, url: targetUrl };
  }
  return navigateTab(targetUrl);
}
