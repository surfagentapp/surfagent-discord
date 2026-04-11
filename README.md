# surfagent-discord

Discord adapter for [SurfAgent](https://surfagent.app).

This adapter gives AI agents Discord-native state and extraction tools so they can understand what surface they are on before trying to do anything clever.

## What this adapter is for

Use `surfagent-discord` when you need Discord-specific workflows like:
- opening Discord in the managed browser
- detecting whether the surface is logged in, gated, or blocked
- identifying route-aware page state
- extracting visible messages
- extracting visible channels
- extracting visible thread or forum rows
- opening a thread by title and summarising it with proof
- sending a Discord message only when the visible composer and post-send proof are both there

## Why this exists

Discord is a hostile surface for generic browser automation.

It has:
- dynamic SPA routing
- login and verification gates
- hCaptcha and account-state blockers
- unstable internal structure that punishes naive selector guessing

So this adapter focuses on state detection first, because on Discord the first mistake is usually pretending you are on the page you think you are on.

## Default operating mode

Discord should be treated as a **visual-first hybrid** surface.

That means:
- use Discord-native state and extraction tools first
- escalate to screenshots or visible surface checks quickly when route, gate, or composer state is ambiguous
- avoid pretending a selector hit is better proof than the visible guild, channel, or thread surface

The screen often settles ambiguity faster than clever extraction, but raw clicking is still the fallback, not the plan.

## Current scope

- health check against the SurfAgent daemon
- open Discord in the managed browser
- route-aware page state detection
- explicit login, register, and hCaptcha gate detection
- visible structured message extraction
- visible channel extraction
- visible thread and forum row extraction
- deterministic check-state task with proof artifacts
- deterministic open-channel-by-title task with verification
- deterministic open-channel-and-summarize task for compact read workflows
- deterministic open-thread-and-summarize task for thread/forum read workflows
- proof-heavy channel send task with draft and post-send verification

## Current position

This adapter is still read-first, but it now has one narrow write path.

That means it is built to:
- detect where Discord actually is
- tell you whether the profile is usable
- extract meaningful visible state
- allow one proof-heavy channel send flow where draft state and post-send proof are both required

It is still not pretending to be a full mutation-heavy Discord operator, because that would be a nice way to generate fake confidence and stupid bugs.

What changed now is the first useful task-runner layer:
- `discord_check_state_task`
- `discord_open_channel_by_title_task`
- `discord_open_channel_and_summarize_task`
- `discord_open_thread_and_summarize_task`
- `discord_open_channel_and_send_message_task`

Those bundle state inspection, proof capture, verification, and compact Discord summarisation or sending so agents stop reinventing the same probing loop every run.

## How to use it

Run this adapter alongside the base SurfAgent MCP.

```json
{
  "mcpServers": {
    "surfagent": {
      "command": "npx",
      "args": ["-y", "surfagent-mcp"]
    },
    "surfagent-discord": {
      "command": "npx",
      "args": ["-y", "surfagent-discord"]
    }
  }
}
```

If you are new to SurfAgent, start here first:
- <https://github.com/surfagentapp/surfagent-docs/blob/main/docs/start-here.md>
- <https://github.com/surfagentapp/surfagent-docs/blob/main/docs/mcp-server.md>
- <https://github.com/surfagentapp/surfagent-docs/blob/main/docs/skills-and-adapters.md>

## When to use this vs skills vs raw MCP

- use `surfagent-mcp` for raw browser control
- use `surfagent-skills` for proof rules and operating discipline
- use `surfagent-discord` when you need Discord-specific state detection and extraction

## Planned next scope

- richer server navigation primitives
- forum-post and member extraction
- thread and DM aware send/reply flows once the first channel send path proves itself live
- stronger SPA wait and recovery logic
- receipts and persistence once the logged-in surface is stable enough to trust
- message/reply task runners beyond the first channel send path once a stable logged-in write surface is proven
- richer persistence checks once live logged-in write surfaces are stable enough to trust

## Notes

- selector strategy is role, ARIA, and id first, not hashed-class first
- the current SurfAgent profile may not be logged into Discord
- login detection is a first-class outcome, not an error to hand-wave away

## Related repos

- [surfagent](https://github.com/surfagentapp/surfagent)
- [surfagent-mcp](https://github.com/surfagentapp/surfagent/tree/main/surfagent-mcp)
- [surfagent-docs](https://github.com/surfagentapp/surfagent-docs)
- [surfagent-skills](https://github.com/surfagentapp/surfagent-skills)

## Status

Experimental.

## License

MIT
