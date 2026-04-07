# Discord adapter for SurfAgent

Experimental SurfAgent MCP adapter for Discord.

## Current scope
- health check against the SurfAgent daemon
- open Discord in the managed browser
- route-aware page state detection
- visible structured message extraction
- visible channel extraction
- visible thread/forum row extraction

## Notes
- selector strategy is role/ARIA/id-first, not hashed-class-first
- current SurfAgent profile may not be logged into Discord, so login detection is treated as a first-class state
- this pass is read-first, not mutation-first

## Planned next scope
- richer server/thread navigation primitives
- forum-post and member extraction
- stronger SPA wait/recovery logic
- receipts/persistence once the live logged-in surface is proven stable
