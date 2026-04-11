import { ensureSiteTab, evaluate } from "./connection.js";

export async function openSite(path?: string) {
  return ensureSiteTab(path || "/channels/@me");
}

export async function getSiteState(tabId?: string) {
  const raw = await evaluate<string>(buildStateExpression(), tabId);
  return parseJsonResult(raw);
}

export async function extractVisibleMessages(limit = 10, tabId?: string) {
  const raw = await evaluate<string>(buildMessageExtractionExpression(limit), tabId);
  return parseJsonResult(raw);
}

export async function extractChannels(limit = 25, tabId?: string) {
  const raw = await evaluate<string>(buildChannelExtractionExpression(limit), tabId);
  return parseJsonResult(raw);
}

export async function extractThreads(limit = 25, tabId?: string) {
  const raw = await evaluate<string>(buildThreadExtractionExpression(limit), tabId);
  return parseJsonResult(raw);
}

export async function openChannelByTitle(title: string, options: { exact?: boolean; path?: string; tabId?: string; limit?: number } = {}) {
  const target = title.trim().toLowerCase();
  if (!target) throw new Error("title is required.");
  const tab = options.path ? await openSite(options.path) : null;
  const activeTabId = tab?.id ?? options.tabId;
  const channels = await extractChannels(options.limit ?? 50, activeTabId) as { items?: Array<Record<string, unknown>> };
  const rows = Array.isArray(channels.items) ? channels.items : [];
  const match = rows.find((item) => {
    const name = String(item.name ?? '').trim().toLowerCase();
    return options.exact ? name === target : name.includes(target);
  }) ?? null;
  const href = String(match?.href ?? '').trim();
  if (!href) throw new Error(`Could not find a visible Discord channel matching \"${title}\".`);
  const navigated = await openSite(href);
  const state = await getSiteState(navigated.id);
  return { match, navigated, state };
}

export async function openThreadByTitle(title: string, options: { exact?: boolean; path?: string; tabId?: string; limit?: number } = {}) {
  const target = title.trim().toLowerCase();
  if (!target) throw new Error("title is required.");
  const tab = options.path ? await openSite(options.path) : null;
  const activeTabId = tab?.id ?? options.tabId;
  const threads = await extractThreads(options.limit ?? 50, activeTabId) as { items?: Array<Record<string, unknown>> };
  const rows = Array.isArray(threads.items) ? threads.items : [];
  const match = rows.find((item) => {
    const name = String(item.title ?? '').trim().toLowerCase();
    return options.exact ? name === target : name.includes(target);
  }) ?? null;
  const href = String(match?.href ?? '').trim();
  if (!href) throw new Error(`Could not find a visible Discord thread matching \"${title}\".`);
  const navigated = await openSite(href);
  const state = await getSiteState(navigated.id);
  return { match, navigated, state };
}

export async function getComposerState(tabId?: string) {
  const raw = await evaluate<string>(String.raw`(() => {
    const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
    const visible = (el) => {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    };
    const composer = [...document.querySelectorAll('[role="textbox"], textarea, [contenteditable="true"]')]
      .find((el) => visible(el) && (el.getAttribute('role') === 'textbox' || el.getAttribute('contenteditable') === 'true')) || null;
    const textValue = composer ? clean(composer.textContent || ('value' in composer ? composer.value : '')) : null;
    const placeholder = composer?.getAttribute?.('data-slate-placeholder') || composer?.getAttribute?.('aria-label') || composer?.getAttribute?.('placeholder') || null;
    return JSON.stringify({
      ok: true,
      composerPresent: !!composer,
      composerTag: composer?.tagName || null,
      composerText: textValue,
      composerLength: textValue?.length || 0,
      placeholder,
      canSend: !!composer && !!textValue,
    });
  })();`, tabId);
  return parseJsonResult(raw);
}

export async function fillComposerDraft(input: { text?: string }, tabId?: string) {
  const payload = JSON.stringify(input);
  const raw = await evaluate<string>(String.raw`(() => {
    const input = ${payload};
    const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
    const visible = (el) => {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    };
    const composer = [...document.querySelectorAll('[role="textbox"], textarea, [contenteditable="true"]')]
      .find((el) => visible(el) && (el.getAttribute('role') === 'textbox' || el.getAttribute('contenteditable') === 'true')) || null;
    if (!composer) return JSON.stringify({ ok: false, error: 'Composer not found.' });
    if (typeof input.text !== 'string') return JSON.stringify({ ok: false, error: 'text is required.' });

    const selection = window.getSelection();
    composer.focus();
    if ('value' in composer) {
      composer.value = '';
      composer.dispatchEvent(new Event('input', { bubbles: true }));
      composer.value = input.text;
      composer.dispatchEvent(new InputEvent('input', { bubbles: true, data: input.text, inputType: 'insertText' }));
    } else {
      const range = document.createRange();
      range.selectNodeContents(composer);
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.execCommand?.('selectAll', false);
      document.execCommand?.('delete', false);
      composer.textContent = '';
      composer.appendChild(document.createTextNode(input.text));
      const endRange = document.createRange();
      endRange.selectNodeContents(composer);
      endRange.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(endRange);
      composer.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, data: input.text, inputType: 'insertText' }));
      composer.dispatchEvent(new InputEvent('input', { bubbles: true, data: input.text, inputType: 'insertText' }));
    }
    composer.dispatchEvent(new Event('change', { bubbles: true }));
    composer.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a' }));
    const composerText = clean(composer.textContent || ('value' in composer ? composer.value : ''));
    return JSON.stringify({ ok: true, wrote: true, composerText, length: composerText.length });
  })();`, tabId);
  return parseJsonResult(raw);
}

export async function sendCurrentMessage(tabId?: string) {
  const raw = await evaluate<string>(String.raw`(async () => {
    const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
    const visible = (el) => {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    };
    const composer = [...document.querySelectorAll('[role="textbox"], textarea, [contenteditable="true"]')]
      .find((el) => visible(el) && (el.getAttribute('role') === 'textbox' || el.getAttribute('contenteditable') === 'true')) || null;
    const beforeText = composer ? clean(composer.textContent || ('value' in composer ? composer.value : '')) : null;
    if (!composer || !beforeText) {
      return JSON.stringify({ ok: false, error: 'Composer not ready for send.', beforeText });
    }
    const readLastMessage = () => {
      const rows = [...document.querySelectorAll('[id^="chat-messages-"], [data-list-item-id*="chat-messages"]')]
        .filter((el) => visible(el));
      const last = rows.at(-1);
      return last ? clean(last.textContent || '') : null;
    };
    const beforeLastMessage = readLastMessage();
    composer.focus();
    composer.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', which: 13, keyCode: 13 }));
    composer.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', which: 13, keyCode: 13 }));
    composer.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', which: 13, keyCode: 13 }));
    if (composer.closest('form')) composer.closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 900));
    const afterText = composer ? clean(composer.textContent || ('value' in composer ? composer.value : '')) : null;
    const lastVisibleMessage = readLastMessage();
    return JSON.stringify({
      ok: true,
      attempted: true,
      beforeText,
      afterText,
      composerCleared: !!beforeText && !afterText,
      beforeLastMessage,
      lastVisibleMessage,
      sendConfirmedByVisibleEcho: !!beforeText && !!lastVisibleMessage && lastVisibleMessage !== beforeLastMessage && lastVisibleMessage.includes(beforeText),
    });
  })();`, tabId);
  return parseJsonResult(raw);
}

function buildSharedDiscordHelpers() {
  return String.raw`
    const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
    const text = (el) => clean(el?.innerText || el?.textContent || '');
    const visible = (el) => {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    };
    const uniqueBy = (items, keyFn) => {
      const seen = new Set();
      return items.filter((item) => {
        const key = keyFn(item);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };
    const stripChannelChrome = (value) => clean(value)
      .replace(/\bInvite to Channel\b/gi, '')
      .replace(/\bNEW\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const channelNameFromLabel = (label, fallback) => {
      const normalizedLabel = clean(label);
      const normalizedFallback = stripChannelChrome(fallback);
      const labelMatch = normalizedLabel.match(/^(.*?)\s*\((?:text|announcement|forum|voice|stage|media) channel\)$/i);
      if (labelMatch?.[1]) return clean(labelMatch[1]);
      const fallbackMatch = normalizedFallback.match(/^(?:Text|Announcements|Forum|Voice|Stage|Media|Rules)\s+(.+)$/i);
      if (fallbackMatch?.[1]) return clean(fallbackMatch[1]);
      return normalizedFallback || normalizedLabel || null;
    };
    const channelDisplayText = (node, anchor) => {
      const label = clean(anchor?.getAttribute('aria-label') || node?.getAttribute('aria-label') || '');
      return channelNameFromLabel(label, text(anchor) || text(node) || '');
    };
    const path = location.pathname + location.hash;
    const pathParts = location.pathname.split('/').filter(Boolean);
    const guildId = pathParts[1] && /^\d+$/.test(pathParts[1]) ? pathParts[1] : null;
    const channelId = pathParts[2] && /^\d+$/.test(pathParts[2]) ? pathParts[2] : null;
    const routeKind = (() => {
      if (/^\/login/.test(location.pathname)) return 'login';
      if (/^\/register/.test(location.pathname)) return 'register';
      if (/^\/channels\/[@a-zA-Z0-9_-]+\/\d+/.test(location.pathname)) return 'channel';
      if (location.pathname === '/channels/@me') return 'friends';
      if (/^\/channels\/\d+$/.test(location.pathname)) return 'guild';
      if (/^\/invite\//.test(location.pathname)) return 'invite';
      if (/^\/settings/.test(location.pathname)) return 'settings';
      return 'unknown';
    })();
    const pageText = document.body?.innerText || '';
    const loginRequired = routeKind === 'login' || /welcome back!|log in with qr code|need an account\?|or sign in with passkey/i.test(pageText);
    const registerRequired = routeKind === 'register' || /create an account/i.test(pageText);
    const captchaFrames = [...document.querySelectorAll('iframe')].filter((el) => /captcha/i.test(el.title || el.src || '') && visible(el));
    const captchaRequired = captchaFrames.length > 0 || /wait! are you human|please confirm you're not a robot|hcaptcha|verify you are human|cloudflare/i.test(pageText);
    const authGate = captchaRequired ? 'captcha' : loginRequired ? 'login' : registerRequired ? 'register' : 'none';
    const selectedGuild = text(document.querySelector('nav[aria-label] [aria-current="page"], nav[aria-label] [aria-selected="true"]')) || null;
    const selectedChannelNode = document.querySelector('[data-list-item-id^="channels___"][aria-selected="true"], [data-list-item-id^="channels___"] a[aria-current="page"], a[href*="/channels/"][aria-current="page"]');
    const selectedChannelAnchor = selectedChannelNode?.matches?.('a[href*="/channels/"]') ? selectedChannelNode : selectedChannelNode?.querySelector?.('a[href*="/channels/"]') || null;
    const selectedChannel = channelDisplayText(selectedChannelNode, selectedChannelAnchor) || null;
    const headings = [...document.querySelectorAll('h1, h2, h3, [role="heading"]')].map((el) => text(el)).filter(Boolean).slice(0, 10);
    const authErrors = uniqueBy(
      [...document.querySelectorAll('[role="alert"], [aria-live], [class*="error"]')]
        .map((el) => text(el))
        .filter(Boolean)
        .filter((value) => /invalid|already registered|error|incorrect|wrong password|login or password/i.test(value)),
      (value) => value.toLowerCase(),
    ).slice(0, 10);
    const diagnostics = () => ({
      url: location.href,
      path,
      title: document.title || null,
      routeKind,
      authGate,
      loginRequired,
      registerRequired,
      captchaRequired,
      captchaFrameCount: captchaFrames.length,
      guildId,
      channelId,
      headings,
      authErrors,
      appMountPresent: !!document.getElementById('app-mount'),
      mainPresent: !!document.querySelector('main, [role="main"]'),
      serverRailPresent: !!document.querySelector('nav[aria-label], [aria-label*="Servers"]'),
      channelRailPresent: !!document.querySelector('[data-list-item-id^="channels___"], nav a[href*="/channels/"]'),
      messagePanePresent: !!document.querySelector('[id^="chat-messages-"], [data-list-id="chat-messages"]'),
      memberListPresent: !!document.querySelector('[aria-label*="Members"], [aria-label*="Member List"]'),
      threadPanePresent: [...document.querySelectorAll('[aria-label], [role="heading"], h2, h3')].some((el) => /thread/i.test(text(el))),
      composerPresent: !!document.querySelector('[role="textbox"], textarea, div[contenteditable="true"]'),
      selectedGuild,
      selectedChannel,
    });
  `;
}

function buildStateExpression() {
  return String.raw`(() => {
    ${buildSharedDiscordHelpers()}
    return JSON.stringify({
      ok: true,
      site: 'Discord',
      ...diagnostics(),
    });
  })();`;
}

function buildMessageExtractionExpression(limit: number) {
  return String.raw`(() => {
    ${buildSharedDiscordHelpers()}
    const rows = uniqueBy(
      [...document.querySelectorAll('[id^="chat-messages-"]')]
        .filter((el) => visible(el))
        .map((el, index) => {
          const idAttr = el.getAttribute('id') || '';
          const messageId = idAttr.match(/chat-messages-(\d{8,})/)?.[1] || null;
          const author = text(el.querySelector('[id^="message-username-"], h3 span, h2 span')) || null;
          const timestampIso = el.querySelector('time')?.getAttribute('datetime') || null;
          const timestampText = text(el.querySelector('time')) || null;
          const contentParts = [...el.querySelectorAll('[id^="message-content-"], [class*="messageContent"]')]
            .map((node) => text(node))
            .filter(Boolean);
          const content = contentParts.join('\n').trim() || null;
          const replySnippet = text(el.querySelector('[id^="message-reply-context-"], [class*="repliedMessage"]')) || null;
          const mentionCount = [...el.querySelectorAll('[class*="mention"], [role="link"]')]
            .map((node) => text(node))
            .filter((value) => /^[@#]/.test(value)).length;
          const attachmentCount = el.querySelectorAll('img[src], video, audio, a[href][download]').length;
          const reactionCount = el.querySelectorAll('[aria-label*="reaction"], [class*="reaction"]').length;
          return {
            index,
            messageId,
            author,
            timestampIso,
            timestampText,
            content,
            replySnippet,
            mentionCount,
            attachmentCount,
            reactionCount,
            rawText: text(el) || null,
          };
        })
        .filter((item) => item.messageId || item.content || item.author),
      (item) => item.messageId || [item.author || '', item.timestampIso || item.timestampText || '', item.content || item.rawText || ''].join(':'),
    ).slice(0, ${Math.max(1, Math.min(limit, 100))});
    return JSON.stringify({ ok: true, count: rows.length, items: rows, diagnostics: diagnostics() });
  })();`;
}

function buildChannelExtractionExpression(limit: number) {
  return String.raw`(() => {
    ${buildSharedDiscordHelpers()}
    const rows = uniqueBy(
      [...document.querySelectorAll('[data-list-item-id^="channels___"], nav a[href*="/channels/"]')]
        .map((node, index) => {
          const anchor = node.matches('a[href*="/channels/"]') ? node : node.querySelector('a[href*="/channels/"]');
          if (!anchor || !visible(anchor)) return null;
          const href = anchor.getAttribute('href') || '';
          const match = href.match(/\/channels\/([^/]+)\/(\d+)/);
          if (!match) return null;
          const label = clean(anchor.getAttribute('aria-label') || node.getAttribute('aria-label') || '');
          const name = channelDisplayText(node, anchor);
          if (!name) return null;
          const containerText = stripChannelChrome(text(node) || '');
          return {
            index,
            name,
            href: new URL(href, location.origin).toString(),
            guildId: match[1],
            channelId: match[2],
            selected: anchor.getAttribute('aria-current') === 'page' || anchor.getAttribute('aria-selected') === 'true' || node.getAttribute('aria-selected') === 'true' || href === location.pathname,
            unreadHint: /unread|new|mention/i.test((label || '') + ' ' + (containerText || '')),
            label: label || null,
          };
        })
        .filter(Boolean),
      (item) => item.href,
    ).slice(0, ${Math.max(1, Math.min(limit, 100))});
    return JSON.stringify({ ok: true, count: rows.length, items: rows, diagnostics: diagnostics() });
  })();`;
}

function buildThreadExtractionExpression(limit: number) {
  return String.raw`(() => {
    ${buildSharedDiscordHelpers()}
    const rows = uniqueBy(
      [...document.querySelectorAll('a[href*="/channels/"], [data-list-item-id*="thread"], [aria-label*="Thread"] a[href*="/channels/"]')]
        .map((node, index) => {
          const anchor = node.matches('a[href*="/channels/"]') ? node : node.querySelector('a[href*="/channels/"]');
          if (!anchor || !visible(anchor)) return null;
          const href = anchor.getAttribute('href') || '';
          const match = href.match(/\/channels\/([^/]+)\/(\d+)/);
          if (!match) return null;
          const container = node.closest('[data-list-item-id], [role="listitem"], li, div') || node;
          const label = clean(anchor.getAttribute('aria-label') || container.getAttribute('aria-label') || '');
          const body = stripChannelChrome(text(container) || text(anchor) || '');
          if (!/thread|forum|post/i.test((label || '') + ' ' + (body || ''))) return null;
          return {
            index,
            title: channelNameFromLabel(label, text(anchor) || body || '') || null,
            href: new URL(href, location.origin).toString(),
            guildId: match[1],
            channelId: match[2],
            selected: anchor.getAttribute('aria-current') === 'page' || anchor.getAttribute('aria-selected') === 'true',
            label: label || null,
            rawText: body || null,
          };
        })
        .filter(Boolean),
      (item) => item.href,
    ).slice(0, ${Math.max(1, Math.min(limit, 100))});
    return JSON.stringify({ ok: true, count: rows.length, items: rows, diagnostics: diagnostics() });
  })();`;
}

function parseJsonResult(raw: unknown) {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return { raw };
    }
  }
  return raw;
}
