import { ensureSiteTab, evaluate } from "./connection.js";

    export async function openSite(path?: string) {
      return ensureSiteTab(path || '/channels/@me');
    }

    export async function getSiteState(tabId?: string) {
      const raw = await evaluate<string>(String.raw`(() => {
        const url = location.href;
        const path = location.pathname + location.hash;
        const title = document.title || null;
        const mainPresent = !!document.querySelector('main, [role="main"]');
        const selectedGuild = document.querySelector('[aria-label*="Servers"] [aria-selected="true"]')?.getAttribute('aria-label') || null;
const selectedChannel = document.querySelector('[role="link"][aria-current="page"], [data-list-item-id*="channels___"] [aria-selected="true"]')?.textContent?.trim() || null;
        return JSON.stringify({
          ok: true,
          site: 'Discord',
          url,
          path,
          title,
          mainPresent,
          selectedGuild,
        selectedChannel,
        });
      })();`, tabId);
      return parseJsonResult(raw);
    }

    export async function extractVisible(limit = 10, tabId?: string) {
      const raw = await evaluate<string>(String.raw`(() => {
        const diagnostics = {
          url: location.href,
          path: location.pathname + location.hash,
          title: document.title || null,
          mainPresent: !!document.querySelector('main, [role="main"]'),
        };
        const rows = [...document.querySelectorAll('[id^="chat-messages-"], [class*="messageListItem"]')]
  .map((el, index) => ({
    index,
    text: (el.innerText || el.textContent || '').trim(),
  }))
  .filter((item) => item.text)
  .slice(0, limit);
return { ok: true, count: rows.length, items: rows, diagnostics };
      })();`, tabId);
      return parseJsonResult(raw);
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
