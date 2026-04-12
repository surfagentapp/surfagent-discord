import { tmpdir } from "node:os";
import { join } from "node:path";
import { screenshot } from "./connection.js";
import { extractChannels, extractThreads, extractVisibleMessages, fillComposerDraft, getComposerState, getSiteState, openChannelByTitle, openSite, openThreadByTitle, sendCurrentMessage } from "./site.js";
import { createTaskRunnerRuntime, type ScreenshotArtifact, type TaskRunBase, type TaskStep } from "./task-runner-runtime.js";

export type DiscordTaskKind = "check-state" | "open-channel-by-title" | "open-channel-and-summarize" | "open-thread-and-summarize" | "open-channel-and-send-message";

export type DiscordTaskRun = TaskRunBase & {
  adapter: "discord";
  task: DiscordTaskKind;
  steps: TaskStep[];
  artifacts: ScreenshotArtifact[];
  outcome?: unknown;
  error?: { code: string; message: string; retryable?: boolean };
};

export type CheckStateOptions = {
  path?: string;
};

export type OpenChannelByTitleOptions = {
  title: string;
  exact?: boolean;
  path?: string;
  limit?: number;
};

export type OpenChannelAndSummarizeOptions = {
  title: string;
  exact?: boolean;
  path?: string;
  channelLimit?: number;
  messageLimit?: number;
};

export type OpenThreadAndSummarizeOptions = {
  title: string;
  exact?: boolean;
  path?: string;
  threadLimit?: number;
  messageLimit?: number;
};

export type OpenChannelAndSendMessageOptions = {
  title: string;
  text: string;
  exact?: boolean;
  path?: string;
  channelLimit?: number;
};

const RUN_ROOT = process.env.SURFAGENT_RUN_DIR || join(tmpdir(), "surfagent-discord-runs");

const runtime = createTaskRunnerRuntime({
  rootDir: RUN_ROOT,
  screenshot,
});

async function overwriteRunManifest(run: DiscordTaskRun): Promise<string> {
  return runtime.writeRunManifest(run);
}

async function captureRunScreenshot(run: DiscordTaskRun, tabId: string | undefined, label: string): Promise<ScreenshotArtifact | null> {
  return runtime.captureScreenshot(run, tabId, label);
}

async function withStep<T>(run: DiscordTaskRun, name: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await runtime.withStep(run, name, fn);
  } catch (error) {
    run.ok = false;
    run.error = {
      code: inferErrorCode(error),
      message: error instanceof Error ? error.message : String(error),
      retryable: true,
    };
    await overwriteRunManifest(run);
    throw error;
  }
}

function inferErrorCode(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (/login|captcha|register|verification|verify by phone|confirm your identity/i.test(text)) return "auth_blocked";
  if (/composer/i.test(text)) return "composer_not_ready";
  if (/send/i.test(text)) return "send_failed";
  if (/thread/i.test(text)) return "thread_not_found";
  if (/channel/i.test(text)) return "channel_not_found";
  if (/surface|route|state/i.test(text)) return "surface_not_ready";
  return "task_failed";
}

function createRun(task: DiscordTaskKind): DiscordTaskRun {
  return {
    ok: true,
    adapter: "discord",
    task,
    runId: runtime.makeRunId(task),
    steps: [],
    artifacts: [],
  };
}

function classifyState(state: Record<string, unknown>) {
  if (state.authGate && state.authGate !== "none") {
    return {
      ready: false,
      mode: "blocked",
      reason: `Discord is blocked by authGate=${String(state.authGate)}`,
      nextBestAction: "Stop and surface the login/captcha/register blocker honestly.",
    };
  }

  if (state.routeKind === "channel" && state.messagePanePresent) {
    return {
      ready: true,
      mode: "channel-ready",
      reason: "Discord channel surface is visible.",
      nextBestAction: "Use extraction tools or a channel-specific task.",
    };
  }

  if (state.routeKind === "guild" || state.channelRailPresent) {
    return {
      ready: true,
      mode: "guild-shell",
      reason: "Discord guild shell is visible, but a concrete channel may not be selected yet.",
      nextBestAction: "Open or verify the intended channel before claiming chat readiness.",
    };
  }

  if (state.routeKind === "friends") {
    return {
      ready: true,
      mode: "friends",
      reason: "Discord friends/home surface is visible.",
      nextBestAction: "Open the intended guild or channel before extracting messages.",
    };
  }

  return {
    ready: false,
    mode: "ambiguous",
    reason: "Discord surface is loaded, but route and visible panes do not yet prove a usable target.",
    nextBestAction: "Inspect visible state or take a screenshot before acting.",
  };
}

export async function runCheckStateTask(options: CheckStateOptions = {}): Promise<DiscordTaskRun> {
  const run = createRun("check-state");

  const opened = await withStep(run, "open-site", async () => {
    const tab = await openSite(options.path);
    await captureRunScreenshot(run, tab.id, "discord-open");
    return tab;
  });

  const state = await withStep(run, "inspect-state", async () => {
    const result = await getSiteState(opened.id);
    await captureRunScreenshot(run, opened.id, "discord-state");
    return result;
  });

  run.outcome = {
    opened,
    state,
    assessment: classifyState(state as Record<string, unknown>),
  };
  await overwriteRunManifest(run);
  return run;
}

async function openAndVerifyChannel(run: DiscordTaskRun, options: OpenChannelByTitleOptions) {
  const opened = await withStep(run, "open-site", async () => {
    const tab = await openSite(options.path);
    await captureRunScreenshot(run, tab.id, "discord-open-channel-start");
    return tab;
  });

  const preflight = await withStep(run, "preflight-state", async () => {
    const state = await getSiteState(opened.id);
    await captureRunScreenshot(run, opened.id, "discord-preflight");
    if (state.authGate && state.authGate !== "none") {
      throw new Error(`Discord is blocked by authGate=${String(state.authGate)}.`);
    }
    return state;
  });

  const match = await withStep(run, "find-channel", async () => {
    const before = await extractChannels(options.limit ?? 50, opened.id) as { items?: Array<Record<string, unknown>> };
    const rows = Array.isArray(before.items) ? before.items : [];
    const needle = options.title.trim().toLowerCase();
    const found = rows.find((item) => {
      const name = String(item.name ?? "").trim().toLowerCase();
      return options.exact ? name === needle : name.includes(needle);
    }) ?? null;
    if (!found?.href) {
      throw new Error(`Could not find a visible Discord channel matching \"${options.title}\".`);
    }
    return { channels: before, match: found };
  });

  const navigated = await withStep(run, "open-matched-channel", async () => {
    const result = await openChannelByTitle(options.title, { exact: options.exact, path: options.path, tabId: opened.id, limit: options.limit ?? 50 });
    await captureRunScreenshot(run, opened.id, "discord-channel-opened");
    return result;
  });

  const verified = await withStep(run, "verify-channel", async () => {
    const state = await getSiteState(opened.id);
    const selected = String(state.selectedChannel ?? "").trim().toLowerCase();
    const needle = options.title.trim().toLowerCase();
    const ok = options.exact ? selected === needle : selected.includes(needle);
    if (!ok) {
      throw new Error(`Discord channel verification failed. Selected channel was \"${String(state.selectedChannel ?? "unknown")}\".`);
    }
    await captureRunScreenshot(run, opened.id, "discord-channel-verified");
    return state;
  });

  return { opened, preflight, match, navigated, verified };
}

function summariseMessages(payload: { items?: Array<Record<string, unknown>>; diagnostics?: Record<string, unknown> }, requestedTitle: string, kind: "channel" | "thread" = "channel") {
  const items = Array.isArray(payload.items) ? payload.items : [];
  const authors = new Map<string, number>();
  const snippets: string[] = [];
  const topics = new Map<string, number>();

  for (const item of items) {
    const author = String(item.author ?? "").trim();
    if (author) authors.set(author, (authors.get(author) ?? 0) + 1);

    const content = String(item.content ?? item.rawText ?? "").replace(/\s+/g, " ").trim();
    if (content) snippets.push(`${author || "Unknown"}: ${content}`.slice(0, 220));

    for (const token of content.toLowerCase().match(/[a-z][a-z0-9_-]{3,}/g) ?? []) {
      if (["that","with","this","have","from","your","they","were","what","when","there","about","would","could","should","discord","channel"].includes(token)) continue;
      topics.set(token, (topics.get(token) ?? 0) + 1);
    }
  }

  const topAuthors = [...authors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([author, count]) => ({ author, count }));
  const topTopics = [...topics.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([term, count]) => ({ term, count }));
  const latestSnippets = snippets.slice(0, 5);

  const targetName = String(payload.diagnostics?.selectedChannel ?? requestedTitle);
  return {
    [kind]: targetName,
    messageCount: items.length,
    topAuthors,
    topTopics,
    latestSnippets,
    brief: items.length
      ? `Opened ${targetName} ${kind} and extracted ${items.length} visible messages. Main voices: ${topAuthors.map((entry) => `${entry.author} (${entry.count})`).join(", ") || "unclear"}.`
      : `Opened ${requestedTitle} ${kind}, but there were no visible messages to summarise yet.`,
  };
}

export async function runOpenChannelByTitleTask(options: OpenChannelByTitleOptions): Promise<DiscordTaskRun> {
  if (!options.title?.trim()) throw new Error("title is required for open-channel-by-title.");

  const run = createRun("open-channel-by-title");
  const channelFlow = await openAndVerifyChannel(run, options);

  run.outcome = {
    opened: channelFlow.opened,
    preflight: channelFlow.preflight,
    matchedChannel: channelFlow.match.match,
    navigated: channelFlow.navigated,
    verified: channelFlow.verified,
  };
  await overwriteRunManifest(run);
  return run;
}

export async function runOpenChannelAndSummarizeTask(options: OpenChannelAndSummarizeOptions): Promise<DiscordTaskRun> {
  if (!options.title?.trim()) throw new Error("title is required for open-channel-and-summarize.");

  const run = createRun("open-channel-and-summarize");
  const channelFlow = await openAndVerifyChannel(run, {
    title: options.title,
    exact: options.exact,
    path: options.path,
    limit: options.channelLimit,
  });

  const extracted = await withStep(run, "extract-visible-messages", async () => {
    const result = await extractVisibleMessages(options.messageLimit ?? 20, channelFlow.opened.id) as { items?: Array<Record<string, unknown>>; diagnostics?: Record<string, unknown> };
    await captureRunScreenshot(run, channelFlow.opened.id, "discord-summary-source");
    return result;
  });

  const summary = await withStep(run, "summarize-channel", async () => summariseMessages(extracted, options.title, "channel"));

  run.outcome = {
    opened: channelFlow.opened,
    preflight: channelFlow.preflight,
    matchedChannel: channelFlow.match.match,
    navigated: channelFlow.navigated,
    verified: channelFlow.verified,
    extracted,
    summary,
  };
  await overwriteRunManifest(run);
  return run;
}

export async function runOpenThreadAndSummarizeTask(options: OpenThreadAndSummarizeOptions): Promise<DiscordTaskRun> {
  if (!options.title?.trim()) throw new Error("title is required for open-thread-and-summarize.");

  const run = createRun("open-thread-and-summarize");

  const opened = await withStep(run, "open-site", async () => {
    const tab = await openSite(options.path);
    await captureRunScreenshot(run, tab.id, "discord-open-thread-start");
    return tab;
  });

  const preflight = await withStep(run, "preflight-state", async () => {
    const state = await getSiteState(opened.id);
    await captureRunScreenshot(run, opened.id, "discord-thread-preflight");
    if (state.authGate && state.authGate !== "none") {
      throw new Error(`Discord is blocked by authGate=${String(state.authGate)}.`);
    }
    return state;
  });

  const match = await withStep(run, "find-thread", async () => {
    const before = await extractThreads(options.threadLimit ?? 50, opened.id) as { items?: Array<Record<string, unknown>> };
    const rows = Array.isArray(before.items) ? before.items : [];
    const needle = options.title.trim().toLowerCase();
    const found = rows.find((item) => {
      const name = String(item.title ?? "").trim().toLowerCase();
      return options.exact ? name === needle : name.includes(needle);
    }) ?? null;
    if (!found?.href) {
      throw new Error(`Could not find a visible Discord thread matching \"${options.title}\".`);
    }
    return { threads: before, match: found };
  });

  const navigated = await withStep(run, "open-matched-thread", async () => {
    const result = await openThreadByTitle(options.title, { exact: options.exact, path: options.path, tabId: opened.id, limit: options.threadLimit ?? 50 });
    await captureRunScreenshot(run, opened.id, "discord-thread-opened");
    return result;
  });

  const verified = await withStep(run, "verify-thread", async () => {
    const state = await getSiteState(opened.id);
    if (!state.messagePanePresent) {
      throw new Error(`Discord thread verification failed. Message pane was not visible after opening \"${options.title}\".`);
    }
    await captureRunScreenshot(run, opened.id, "discord-thread-verified");
    return state;
  });

  const extracted = await withStep(run, "extract-thread-messages", async () => {
    const result = await extractVisibleMessages(options.messageLimit ?? 20, opened.id) as { items?: Array<Record<string, unknown>>; diagnostics?: Record<string, unknown> };
    await captureRunScreenshot(run, opened.id, "discord-thread-summary-source");
    return result;
  });

  const summary = await withStep(run, "summarize-thread", async () => summariseMessages(extracted, options.title, "thread"));

  run.outcome = {
    opened,
    preflight,
    matchedThread: match.match,
    navigated,
    verified,
    extracted,
    summary,
  };
  await overwriteRunManifest(run);
  return run;
}

export async function runOpenChannelAndSendMessageTask(options: OpenChannelAndSendMessageOptions): Promise<DiscordTaskRun> {
  if (!options.title?.trim()) throw new Error("title is required for open-channel-and-send-message.");
  if (!options.text?.trim()) throw new Error("text is required for open-channel-and-send-message.");

  const run = createRun("open-channel-and-send-message");
  const channelFlow = await openAndVerifyChannel(run, {
    title: options.title,
    exact: options.exact,
    path: options.path,
    limit: options.channelLimit,
  });

  const draft = await withStep(run, "fill-draft", async () => {
    const result = await fillComposerDraft({ text: options.text }, channelFlow.opened.id) as { ok?: boolean; error?: string } & Record<string, unknown>;
    await captureRunScreenshot(run, channelFlow.opened.id, "discord-send-draft");
    if (!result?.ok) throw new Error(result?.error || "Failed to fill Discord composer draft.");
    return result;
  });

  const composer = await withStep(run, "verify-composer", async () => {
    const result = await getComposerState(channelFlow.opened.id) as Record<string, unknown>;
    if (!result?.composerPresent) throw new Error("Discord composer not present after draft fill.");
    if (String(result?.composerText ?? "").trim() !== options.text.trim()) {
      throw new Error("Discord composer text does not match intended send text.");
    }
    return result;
  });

  const sent = await withStep(run, "send-message", async () => {
    const result = await sendCurrentMessage(channelFlow.opened.id) as { ok?: boolean; error?: string; composerCleared?: boolean; sendConfirmedByVisibleEcho?: boolean } & Record<string, unknown>;
    await captureRunScreenshot(run, channelFlow.opened.id, "discord-send-result");
    if (!result?.ok) throw new Error(result?.error || "Discord send action failed.");
    if (!result.composerCleared && !result.sendConfirmedByVisibleEcho) {
      throw new Error("Discord send proof insufficient. Composer did not clear and no visible echo was detected.");
    }
    return result;
  });

  run.outcome = {
    opened: channelFlow.opened,
    preflight: channelFlow.preflight,
    matchedChannel: channelFlow.match.match,
    navigated: channelFlow.navigated,
    verified: channelFlow.verified,
    draft,
    composer,
    sent,
  };
  await overwriteRunManifest(run);
  return run;
}
