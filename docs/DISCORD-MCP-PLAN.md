# Discord MCP Plan

## Repo role
`surfagent-discord` is the source-of-truth repo for the Discord site adapter. The main `surfagent` repo should only carry the bundled shipping copy.

## What I researched

### Product/runtime context
- SurfAgent already has the adapter packaging/runtime path working in the main app.
- Discord already has a scaffolded repo with health/open/state/visible extraction tools.
- The current SurfAgent Chrome profile is **not logged into Discord**. Navigating to `https://discord.com/channels/@me` currently redirects to `https://discord.com/login?redirect_to=%2Fchannels%2F%40me`.

### DOM/selector findings
- Discord is a React app, so hashed class names are brittle and should not be treated as primary selectors.
- BetterDiscord DOM guidance reinforces that point: prefer stable roots and semantic attributes over generated class names.
- Discord exposes meaningful accessibility/ARIA labels broadly enough that role/ARIA-first selectors are the right strategy.
- Stable-enough anchors to prefer:
  - `#app-mount`
  - `main`, `[role="main"]`
  - `[aria-label]`
  - channel/message IDs like `[id^="chat-messages-"]`
  - nav/list/dialog role patterns

### Immediate constraint
Because the current browser profile is logged out, I can verify:
- route detection
- login-state detection
- tool wiring
- graceful empty-state handling
- smoke/build

I **cannot honestly claim** full Discord channel/thread extraction proof until a logged-in Discord session exists in SurfAgent.

## Build goals for this pass

### Phase 1, do now
1. Upgrade `discord_get_state`
   - detect route kind: `login`, `channel`, `friends`, `invite`, `settings`, `unknown`
   - expose login-required state
   - expose whether server rail, channel rail, chat pane, thread pane, member list, and composer are present
2. Upgrade message extraction
   - structured message rows, not raw text blobs only
   - include message id, author, timestamp text, content, reply/snippet hints, mention count, attachment/media hints
3. Add channel extraction
   - visible channels from the current guild/sidebar
   - include selected state and unread/mention hints where possible
4. Add thread extraction
   - visible thread rows from the thread/forum sidebar when present
5. Make outputs diagnostic-heavy
   - current URL/title
   - route kind
   - login state
   - counts for extracted entities
6. Keep this pass read-first
   - no posting, replying, or mutation tools yet

### Phase 2, only after logged-in live proof
1. `discord_open_server`
2. `discord_open_thread`
3. richer structured message extraction for embeds/attachments/reactions
4. member extraction
5. forum-post extraction
6. recovery/wait logic for SPA navigation and lazy-rendered panes

## Tool surface target for this pass
- keep:
  - `discord_health_check`
  - `discord_open`
  - `discord_get_state`
  - `discord_open_channel`
  - `discord_extract_visible_messages`
- add:
  - `discord_extract_channels`
  - `discord_extract_threads`

## Execution plan
1. Refactor Discord page-state/extraction logic into stronger helper expressions.
2. Implement route/login detection and structured extraction.
3. Update smoke coverage.
4. Run `npm run smoke`.
5. Do one live check against the real SurfAgent browser to verify login-route handling works as expected.
6. Commit/push `surfagent-discord`.
7. Sync bundled adapter into main `surfagent` repo if the tool surface changed.

## Success criteria for this pass
- repo contains a real plan doc and real implementation, not just scaffold text
- Discord adapter exposes route-aware state
- channel/thread/message extraction tools exist and build cleanly
- smoke passes
- live check confirms login-route detection on the current logged-out profile
- repo is pushed

## Honest non-goals for this pass
- full logged-in Discord automation proof
- mutation tools
- forum/community deep workflows
- autonomous Discord agents
