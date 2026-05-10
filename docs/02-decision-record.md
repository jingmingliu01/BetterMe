# BetterMe Decision Record

This document fixes product and technical decisions already made. Treat this as the source of truth unless a future decision record supersedes it.

## Product Tier Decisions

| Topic | Decision |
| --- | --- |
| Free blocked sites | Unlimited blocked sites. |
| Free AI Check | AI Check UI exists but is locked. |
| Lifetime License | Unlocks full local functionality: AI Check, Pattern Memory, advanced Strictness, and BYOK provider setup. |
| Lifetime AI cost | User pays their own LLM provider through their own API key. |
| MVP login | No BetterMe login. |
| MVP subscription | No subscription system. |
| MVP license | Local mock unlock only. |
| Future license endpoint | Supports 3 devices per license by default. |

## Browser and Platform Decisions

| Topic | Decision |
| --- | --- |
| Browser | Chrome only for MVP. |
| Extension platform | Manifest V3. |
| UI | React + TypeScript. |
| Blocking mechanism | DNR redirect to extension block page. |
| Blur overlay | Not MVP. Future optional enhancement. |
| Cloud backend | Not used for MVP AI calls. |
| Extension backend | Background service worker running locally in the user's browser. |

## Blocking Decisions

| Topic | Decision |
| --- | --- |
| Domain block | Blocks the domain and all subdomains. |
| Exact URL block | MVP supports exact URL only. No path wildcard in MVP. |
| Add current page default | Add entire domain and subdomains. |
| Add exact URL | Hidden behind an advanced/expand UI. |
| Basic Cooldown | Default 5 minutes. |
| ALLOW duration | LLM may decide, but backend policy clamps by strictness cap. Defaults: Monk 5m, Strict 10m, Balanced 15m, Gentle 30m. |
| DELAY behavior | Timer runs, then user may continue the same track. |
| BLOCK behavior | Block current target until local next day 00:00. |
| Temporary unlock | Stored locally with expiry. |

## AI Check Decisions

| Topic | Decision |
| --- | --- |
| Opening message | Local fixed assistant message, no LLM call. It is included in future LLM context. |
| Example opening | `You're trying to open {displayTarget}. What are you here to do, and why now?` |
| Max assistant turns | 5 assistant turns. |
| Max duration | 10 minutes. |
| Final decisions | `ALLOW`, `DELAY`, `ASK_MORE`, `BLOCK`. |
| Structured output | Required and validated. |
| Failed provider call | AI panel unavailable; block page remains usable. |
| Invalid JSON | Retry once, then show invalid response state. |

## LLM Provider Decisions

| Topic | Decision |
| --- | --- |
| Providers | OpenAI, DeepSeek, Kimi. |
| Anthropic | Not MVP. |
| API format | OpenAI-compatible Chat Completions. |
| SDK | Prefer hand-written fetch client for MVP. |
| Model UI | Provider dropdown + model dropdown after API key setup. |
| API key | User-provided, encrypted locally. |

## Privacy Decisions

| Topic | Decision |
| --- | --- |
| Full browser history | Do not read. |
| Page content | Do not read in MVP. |
| Blocked target storage | Store domain or exact URL, not full browsing history. |
| API key storage | Do not store plaintext in `chrome.storage.local`. |
| API key transport | Sent directly from extension background to selected LLM provider. Not sent to BetterMe. |
| Data controls | Export/delete local data. |

## NSFW Preset Decisions

| Topic | Decision |
| --- | --- |
| NSFW preset | Supported as a candidate blocklist category. |
| URL visibility | Hide concrete URLs in MVP. |
| Default state | Off by default. |
| User action | User must explicitly enable. |
| Crawler | Do not implement crawler in MVP. |
| Store policy stance | Avoid any UI that lists, promotes, or routes users to adult sites. |

