# CIRVY — Master Project Context (v2)

Paste this entire document as your first message to any AI coding tool
(Claude, Antigravity, Cursor, OpenCode, etc.) so it understands the
project instantly without you re-explaining from scratch.

Status tags used below: [LIVE] = confirmed working in the app,
[IN PROGRESS] = a prompt was run for this but not fully verified —
audit the actual code before assuming it's done, [PLANNED] = decided
but not yet built.

## 1. What Cirvy Is

Cirvy is a private, friends-only social media app. The core idea: no
algorithmic feed, no public visibility, no engagement-driven design.
Content (posts, bio) is visible ONLY to accepted friends. Anyone can
see a user's name/avatar/username, but nothing else unless they're an
accepted friend.

This is the entire product philosophy — every feature decision should
protect this privacy model, not work around it.

## 2. Tech Stack

- Frontend: React + Vite (NOT Next.js — no SSR, this is a plain SPA)
- Styling: Tailwind CSS, custom utility classes (`glass`, `field`,
  `scale-tap`) defined in `index.css` / `App.css`
- Backend: Supabase (Postgres + Auth + Row Level Security + Realtime)
- Routing: React Router
- Hosting: Vercel — [LIVE] `vercel.json` has a SPA rewrite rule
  (`"rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]`)
  so reloading any route no longer 404s
- The ONLY Supabase client source is `src/lib/supabase.js` — never
  create alternate client files (this has caused real bugs before;
  a stray `lib/supabase/` folder with `client.js`/`server.js` was
  removed for this reason — don't recreate it)

## 3. Brand Design System

Light mode:
- Background "Digital Air": #F5F7F8 (also seen as #F6F8F7)
- Border "Morning Mist": #D1E0E3 (also #E4E8E6)
- Primary "Quiet Slate": #4A7A8C
- Text "Deep Ink": #2E3B42 (also #3E5A66)

Dark mode:
- Background "Deep Dusk": #10181C
- Border: #1B262B
- Primary accent: #CFE3E9
- Text: #E4EFF2

These colors are final — do not introduce any other palette (older
concept files like `cirvy_brand_identity.html` use an unrelated
teal/sky palette from an abandoned public-social-app direction; ignore
their colors if ever referenced again).

Typography [IN PROGRESS]: migrating from Outfit to 'Syne' (weights
400-800, for headings/nav brand text/section labels) + 'DM Sans'
(weights 300-500, for body/UI text). Verify which is actually applied
before assuming the migration finished — a credits/quota interruption
happened mid-task once already.

Rounded cards (12-16px radius, intentionally varied by hierarchy —
not uniform everywhere), generous whitespace, calm/muted palette —
never harsh or neon. Fully rounded pill buttons for primary actions.
UI copy should read plain and specific, not cheerful/generic —
decorative emoji in microcopy (buttons, toasts, empty states) should
be avoided in favor of lucide-react icons where a visual is needed.

Logo: a flowing "C" icon in a blue-to-green gradient, paired with the
"CIRVY" wordmark (`CirvyLogo.jsx`, variants: 'icon' | 'full').

## 4. Database Schema (Supabase Postgres)

```sql
-- [LIVE]
profiles (id, username, display_name, avatar_url, bio, onboarded, created_at)
friendships (id, requester_id, addressee_id, status['pending'|'accepted'|'rejected'], created_at)
posts (id, author_id, content, image_url, is_archived, created_at)
likes (id, post_id, user_id, created_at)
comments (id, post_id, user_id, content, created_at)
user_keys (user_id, public_key, created_at)  -- E2EE, Phase 1 in progress
messages (id, sender_id, receiver_id, ciphertext, iv, is_read, created_at)  -- E2EE, ciphertext only
login_attempts (email, failed_count, locked_until)  -- rate limiter, see section 8

-- [PLANNED/IN PROGRESS — verify before assuming present]
polls / poll_votes           -- poll post type
post_tags (post_id, tagged_user_id, created_at)  -- friend-tagging + "Tagged" profile tab
saved_posts (user_id, post_id, created_at)       -- bookmark/save feature
notifications (...)          -- for the Notifications nav tab
```

Helper function `are_friends(user_a, user_b)` returns boolean — used
throughout RLS policies and app logic to check friendship status.

Helper functions for the login rate limiter [LIVE]:
`check_login_lock(email)` returns the lock expiry timestamp (or null),
`record_login_attempt(email, success)` increments/resets the failure
counter and sets a two-tier lockout (5 fails → 15 min, 7 fails → 1
hour — thresholds must be checked highest-first in the SQL CASE).

RLS is the REAL privacy enforcement, not the frontend. Example: the
`profiles` table allows `select` on the full row for everyone (RLS
can't restrict by column), so the frontend is responsible for only
requesting the `bio` column when the viewer is a confirmed friend.
Any new table should follow the same friends-only RLS pattern as
`posts` unless there's a clear reason not to (e.g. `user_keys` public
keys are intentionally public-readable).

## 5. Contexts (React)

- `AuthContext.jsx` — `useAuth()` hook: `signIn`, `signUp`, `signOut`, current user
- `UIContext.jsx` — `useUI()` hook: `t()` for i18n (en/ar dictionary
  pattern), `showToast()`, `dark` mode state, `toggleTheme()`,
  `toggleLang()`
- Presence [LIVE via Supabase Realtime Presence]: powers the sidebar's
  "Circle Presence / Online Friends" panel — only shows friends who
  are actually online right now, not a static list.

## 6. Ghost Mode — READ THIS BEFORE TOUCHING IT

An EARLIER version of Ghost Mode (plus an "Anti-Screenshot Watermark"
and "Panic Lock") was purely cosmetic UI with zero backend enforcement
and was removed for being misleading.

The CURRENT Ghost Mode is a different, legitimately real feature:
when a user enables it, their presence broadcast is suppressed, so
they do NOT appear as "online" to friends even while actively using
the app. This must stay genuinely functional (tied to the real
presence system) — do not turn it back into a decorative toggle.

## 7. Navigation Structure [LIVE]

Sidebar, top to bottom:
- Main nav group: Home, Search, Notifications, "Chats (Coming soon)"
  (chat feature not launched yet, label reflects that), Friends, Create
- "Circle Presence / Online Friends" panel (right side or below main
  nav) — online friends only, respects Ghost Mode
- Bottom of sidebar (separate from main nav, Instagram-style):
  Settings, Profile

Removed: the old standalone "My Friends" list panel and the standalone
dark-mode toggle in the sidebar — dark mode now lives inside Settings.

Settings [IN PROGRESS]: converting from a modal (`SettingsModal.jsx`)
into a full page, sectioned like Instagram's settings (e.g. "Your
account", "How you use Cirvy", "Who can see your content"). Should
also move under a "More" menu entry rather than being a top-level nav
item, per Instagram's pattern — verify current state before assuming
this migration is complete.

Post creation [LIVE]: has its own dedicated route/page (not inline in
the feed), reachable via the "Create" nav item. Composer supports
Image, Video, and Poll post types (verify poll rendering actually
shows up in the feed — this was a known bug, see section 8).

## 8. Known Issues / Recent Fixes

Fixed:
- ~~404 on route reload~~ → fixed via `vercel.json` rewrite (see section 2)
- ~~Mobile image upload was camera-only~~ → gallery picker now allowed
- ~~"Trust Score" stat~~ → replaced with "Mutual Friends" count
- ~~Login had no rate limiting~~ → two-tier lockout live (section 4)
- ~~Signup had no email verification~~ → OTP-based verification is
  now the flow (email template uses `{{ .Token }}`, a 6-digit code,
  not the default confirmation link — this required custom SMTP,
  currently configured via Gmail SMTP on the sender account)

Still open / to verify:
- Regular posts and poll posts were reported not showing in the feed
  at all — root cause not yet confirmed fixed, check the feed
  query/join logic and PostCard's poll-type branching
- Create Post page's avatar sometimes pulled from Google OAuth
  metadata instead of `profiles.avatar_url` when the user didn't sign
  in with Google — check this is fixed
- General "looks AI-generated" pass (uniform radius/shadows, generic
  copy, excessive centering) — in progress via typography/de-AI task,
  verify how much actually landed
- Profile page: sectioned tabs (Posts / Polls / Tagged) — planned,
  verify if built
- Archive (not delete) and Save/bookmark for posts — planned, verify
  if built
- Mentions (@username), hashtags (#tag, visual-only for now), and
  friend-tagging on posts — planned, verify if built
- Performance/networking pass (pagination, select-specific-columns,
  image lazy-loading/compression, realtime subscription cleanup,
  avoiding full-feed refetch on every like/comment) — planned, verify
  if built

## 9. Auth Flow Details [LIVE]

- Google OAuth: available always.
- Apple OAuth: UI button only rendered when `isApplePlatform()`
  (in `src/lib/platform.js`) detects iOS/iPadOS/macOS — never shown on
  Android/Windows. Enabling the Apple provider server-side requires a
  paid Apple Developer account and a client-secret JWT regenerated
  every 6 months (do not forget this — it silently breaks Apple login
  when it expires).
- Facebook OAuth: removed entirely, do not re-add.

## 10. Roadmap (context only — don't build unless explicitly asked)

- E2EE 1-to-1 chat: Phase 1 in progress. Uses native Web Crypto API
  (ECDH P-256 + AES-GCM), private keys stored only in the user's
  IndexedDB, never uploaded. Public keys live in `user_keys`. The
  `ChatPage.jsx` route exists but currently shows a "coming soon"
  placeholder while this is built.
- Future phases (not started): group E2EE chat, voice messages,
  replies/reply-privately, location sharing, document attachments,
  audio/video calls (WebRTC + signaling + TURN server), screen share.
  True anti-screenshot protection is not realistically achievable on
  the web — would require a native app.

## 11. How To Work With Me

- I'm a cybersecurity student, not primarily a developer — I can read
  and reason about code, but I want things explained briefly, not
  lectured at length.
- Be direct and efficient — don't over-explain things I already
  understand from this document.
- If you're an AI coding agent: audit relevant existing files before
  writing new code (many features above are [IN PROGRESS] — check
  what's actually implemented, don't trust the status tag blindly if
  it's been a while), batch related changes together, keep running
  commentary short (a line or two per file, not paragraphs), and
  don't restart a task from scratch if a previous agent session was
  interrupted mid-way (check `git diff`/`git status` first).