# BetterMe Product PRD

## Product Positioning

BetterMe is a privacy-first Chrome extension for self-control around user-defined high-dopamine websites.

Core positioning:

> Convince the AI before you continue, and it remembers your excuses.

BetterMe is not a normal porn blocker or productivity blocker. It is a private AI checkpoint that adds deliberate friction before the user continues to a blocked domain or exact URL.

## Target User

Initial target users:

- People who already understand browser extensions and BYOK AI tools.
- Users willing to provide their own LLM API key.
- Users who want private self-control friction without creating a cloud account.

Not the first target:

- Parents controlling children.
- Enterprise device management.
- Mobile-first users.
- Users who expect a fully managed AI subscription from day one.

## Product Tiers

### Free

Free is not a crippled blocker. It must be useful enough to let users build trust.

Free includes:

- Unlimited blocked sites.
- Domain blocking.
- Exact URL blocking through an advanced UI path.
- Block page.
- Basic Cooldown.
- Settings.
- AI Check UI present but locked.

Free does not include:

- Usable AI Check.
- API key input.
- Pattern Memory.
- Advanced Strictness settings.

### Lifetime BYOK

Lifetime License unlocks the complete local feature set.

Lifetime includes:

- AI Check.
- User-provided LLM API key.
- Pattern Memory.
- Advanced Strictness.
- All blocker features.

Lifetime does not include:

- Hosted AI from BetterMe.
- Monthly AI check allowance.
- Account-based sync.
- Subscription entitlement.

Device limit:

- Future license endpoint should support 3 devices per license by default.
- MVP uses local mock unlock only.

### Future Cloud Subscription

Future paid cloud version may include:

- Login.
- Stripe subscription.
- Monthly AI checks.
- Top-up AI checks.
- Hosted LLM gateway.
- AI Track ledger.
- Account recovery.
- Cross-device sync.

This is out of scope for MVP.

## MVP Scope

MVP must implement:

- Chrome-only Manifest V3 extension.
- React + TypeScript UI.
- Add blocked domain.
- Add exact URL through advanced UI.
- DNR redirect to block page.
- Leave Site / Close Tab.
- Basic Cooldown, default 5 minutes.
- Locked AI Check UI in Free.
- Local lifetime mock unlock.
- API key configuration after unlock.
- Local API key encryption.
- OpenAI, DeepSeek, Kimi provider selection.
- OpenAI-compatible Chat Completions requests.
- Structured AI decision validation.
- Temporary unlock on ALLOW.
- DELAY timer with continuation in the same track.
- BLOCK until local next day 00:00.
- Track summary and Pattern Memory.
- Export/delete local data.

## Out of Scope

- Mobile app.
- Accountability partner.
- Community.
- Complex analytics dashboard.
- Cross-browser release.
- Full legal automation.
- Real payment.
- Real license endpoint.
- Hosted AI backend.
- Reading local files as memory.
- Full browser history analysis.
- Page content reading.
- NSFW URL display in MVP.

## Core User Flows

### Onboarding

1. User installs BetterMe.
2. User sees product explanation.
3. User adds first blocked site.
4. User chooses Strictness.
5. User learns that AI Check is locked unless Lifetime is unlocked.

### Add Current Site

1. User clicks extension action.
2. BetterMe detects current tab URL.
3. UI asks:
   - Add entire domain and subdomains.
   - Advanced: block exact current URL only.
4. BetterMe saves target and updates DNR rules.

### Blocked Visit

1. User navigates to blocked target.
2. DNR redirects main frame to BetterMe block page.
3. Block page shows target and actions.
4. Right side shows AI Check chatbot area.

### Free User AI Check

1. User opens blocked target.
2. AI Check UI is visible but locked.
3. User can use Leave Site or Basic Cooldown.
4. User sees Lifetime unlock call-to-action.

### Lifetime BYOK AI Check

1. User unlocks lifetime mock.
2. User selects provider and model.
3. User enters API key.
4. BetterMe encrypts the API key locally.
5. On blocked page, AI opening message is inserted locally.
6. User replies.
7. Background service worker calls the selected LLM provider.
8. AI returns structured decision.
9. BetterMe enforces the decision locally.

## Product Tone

The AI should be:

- Non-shaming.
- Direct.
- Calm.
- Focused on deliberate vs impulsive decisions.
- Resistant to repeated excuses.

The AI should not:

- Generate explicit sexual content.
- Moralize.
- Insult or shame the user.
- Pretend to be impossible to bypass.

