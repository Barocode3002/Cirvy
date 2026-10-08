# CIRVY — Master Project Context (v4)

Paste this entire document as your first message to any AI coding tool.
Section 12 is a HANDOFF SUMMARY from a previous session that ran out of
credits — read it carefully, it tells you what's actually been done
vs. only planned, and corrects some technical details.

Status tags: [LIVE] = confirmed working, [IN PROGRESS] = a prompt ran
for this but isn't fully verified — audit before assuming done,
[PLANNED] = decided but not built, [UNKNOWN — VERIFY FIRST] = a prompt
was written for this but it's unconfirmed whether it ever actually ran
before credits ran out.

## 1. What Cirvy Is

Cirvy is a private, friends-only social media app. No algorithmic
feed, no public visibility, no engagement-driven design. Content
(posts, bio) visible ONLY to accepted friends. Anyone can see a user's
name/avatar/username, nothing else unless they're an accepted friend.
This is the entire product philosophy — protect it in every decision.

## 2. Tech Stack

- React + Vite (NOT Next.js, plain SPA) · Tailwind CSS · Supabase
  (Postgres + Auth + RLS + Realtime) · React Router · Vercel hosting
- `vercel.json` has the SPA rewrite rule [LIVE] — no more 404-on-reload
- ONLY Supabase client source: `src/lib/supabase.js` — never duplicate

## 3. Brand Design System [LIVE — this is the CURRENT final palette]

Typography: 'Syne' (400–800) for headings/nav/labels, 'DM Sans'
(300–500) for body/UI, 'DM Serif Display' italic used sparingly.

Light mode: Canvas `#F0FAF9` · Card `#FFFFFF` · Border `#E0F7F4` ·
Primary Teal `#00AFA0` · Secondary Sky `#38C4E8` · Text main `#0A0A0A` ·
Text sub (neutral, NOT accent-tinted) `#5B6B6A`

Dark mode: Canvas `#070D0C` (also seen as `#0B0C0D` in CSS vars — both
acceptable, check which is actually in the CSS file before assuming) ·
Card `#0D1A19` · Border `#142422` · Primary Teal (brightened) `#3FCDC0`
(also seen as `#4FA98C`) · Secondary Sky `#38C4E8` · Text main `#FFFFFF`
· Text sub (neutral) `#9A9CA1` or `#8FA6A3`

**Hard rule**: never assign the accent color to muted/secondary text or
borders everywhere — caused real visual bugs twice already (whole UI
looked "tinted" instead of neutral-with-accent-highlights). Keep
text-sub/muted-foreground neutral gray, accent reserved for
interactive/active elements only.

Radius: intentionally varied — small controls ~10-14px, cards ~16-20px,
large feature cards ~24px, oversized elements up to ~40px, fully round
for pills/avatars/buttons.

**Logo**: graphic icon removed. Text-only "Cirvy" wordmark (Syne
bold/extrabold), with a gradient text-color treatment (white fading to
teal) per the latest mockup reference. `CirvyLogo.jsx` kept as a
component wrapper for future real-logo swap-in.

**CSS cleanup done** [LIVE]: removed fake-watermark styles, decorative
shield-ring pulse animation, unused old color tokens (`vault-*`,
`slate-*`, `ink-900`), and the hidden-scrollbar override.

## 4. Database Schema (Supabase Postgres)

```sql
-- [LIVE]
profiles (id, username, display_name, avatar_url, bio, onboarded, created_at)
friendships (id, requester_id, addressee_id, status['pending'|'accepted'|'rejected'], created_at)
posts (id, author_id, content, image_url, video_url, is_archived, created_at)
likes (id, post_id, user_id, created_at)
comments (id, post_id, user_id, content, created_at)
user_keys (user_id, public_key, created_at)
messages (id, sender_id, receiver_id, ciphertext, iv, is_read, created_at,
          message_type, mime_type)  -- NOTE: message_type/mime_type exist
          -- already in the live query code (seen handling 'voice' type)
          -- even though voice messages were documented as [PLANNED] —
          -- verify actual DB columns and how far this got before
          -- assuming it needs to be built from scratch.
login_attempts (email, failed_count, locked_until)
poll_options (id, post_id, option_text, position)
poll_votes (id, poll_option_id, user_id, created_at)

-- [PLANNED/UNKNOWN — verify]
post_tags, saved_posts, notifications
```

`are_friends(user_a, user_b)` — friendship check, used in RLS + app logic.

Login rate limiter [LIVE]: `check_login_lock(email)`,
`record_login_attempt(email, success)` — two-tier lockout (5 fails→15min,
7 fails→1hr, highest threshold checked first in SQL CASE).

RLS [LIVE, recently audited]: `posts` has owner UPDATE (for
`is_archived`) and DELETE policies — these were missing before and
silently broke hide/delete; fixed. **A broader RLS audit (checking
every table for the same missing-UPDATE/DELETE-policy bug) was
prompted but status is [UNKNOWN — VERIFY FIRST]** — check if it ran.

## 5. E2EE Crypto Library — `src/lib/e2ee.js` [LIVE, API CORRECTED]

The actual current function signatures (confirmed from live code, NOT
the originally-drafted version from an earlier session):
- `ensureUserKeys(userId)` → returns the user's private CryptoKey
  (generates + stores in IndexedDB if it doesn't exist yet, otherwise
  retrieves the existing one — handles both cases internally)
- `getSharedKey(userId, privateKey, theirPublicKeyBase64)` → derives
  the AES-GCM shared key via ECDH
- `decryptMessage(sharedKey, ciphertext, iv)` → returns plaintext
- `encryptMessage(...)` exists too — confirm its exact signature before
  calling it; don't assume it matches `decryptMessage`'s pattern
  without checking.

Do not reintroduce or assume the OLDER signature
(`generateAndStoreKeyPair(userId)`, `encryptMessage(myUserId,
theirPublicKeyBase64, plaintext)`) from an earlier prototype — that's
superseded.

## 6. Ghost Mode [LIVE]

Real feature: enabling it suppresses the user's presence broadcast so
they don't appear online to friends. Must stay genuinely functional.
(An earlier fake version + fake watermark/panic-lock were removed —
don't reintroduce anything like them.)

## 7. Navigation & Pages

Sidebar/nav: Home, Search, Notifications, Chats/Messages, Friends,
Create — main group; Settings + Profile at bottom via a "More" entry
[IN PROGRESS — verify Settings-as-full-page-not-modal migration].

Pages confirmed to exist with real logic: LoginPage, SignupPage,
OnboardingPage, FeedPage, ProfilePage, FriendRequestsPage, SearchPage,
ChatPage, **MessagesListPage** (confirmed fully implemented — real
Supabase queries for conversation list, realtime subscription with
polling fallback, E2EE decryption of previews, search/filter — this
is NOT a placeholder, it's functional. A follow-up task to pixel-match
its JSX to a specific mockup was issued — status [UNKNOWN — VERIFY
FIRST], check if the JSX was restyled or if it's still the "card list
with search bar" version).

Known recent bug [UNKNOWN — VERIFY FIRST]: a duplicated header was
reported on FeedPage (old navbar with AR/gear icons stacked above the
correct Cirvy-wordmark+bell+chat header) — a fix was prompted, verify
it landed. Bottom tab bar should be icon-only (Home, Search, Create,
Chat, Profile — NOT "Activity"), active state shows a small dot, no
text labels — verify this matches current code.

## 8. Known Issues (consolidated, check actual state before redoing work)

Confirmed fixed at some point: 404-on-reload, mobile gallery picker,
"Trust Score"→"Mutual Friends", login rate limiting, OTP email
verification, missing posts UPDATE/DELETE RLS, posts/polls not
rendering in feed (video_url + poll_options/poll_votes added).

[UNKNOWN — VERIFY FIRST, prompts were written but execution status
unclear due to a credits cutoff]:
- Full visual UI rebuild matching the design-kit reference files
  (typography/layout, not just colors) across all pages
- Exact mobile-mockup match for Feed/Profile/Chat/Onboarding/Explore
  (with the constraint: no fake stories feature, Explore stays
  friends-only data in a grid layout)
- Duplicate header fix + icon-only bottom tab bar
- Full chat feature wiring (though MessagesListPage itself is
  confirmed real — ChatPage.jsx's own state is less certain, verify)
- MessagesListPage JSX pixel-match to the Messages mockup (flat list,
  no card borders, E2EE pill badge next to name, no search bar visible,
  encryption banner at top)
- A security/dependency/refactor audit (Pass 1 findings + Pass 2 fixes)
  — unclear if Pass 1 even ran

[Still genuinely PLANNED, not started]: profile page sectioned tabs
(Posts/Polls/Tagged), archive/save UI polish, mentions/hashtags/
friend-tagging, performance/networking pass.

## 9. Auth Flow [LIVE]

Google OAuth always available. Apple OAuth button only on
iOS/iPadOS/macOS (`src/lib/platform.js` → `isApplePlatform()`) —
server-side needs a paid Apple Developer account + a client-secret JWT
that expires every 6 months. Facebook removed, don't re-add.

## 10. Roadmap

E2EE 1-to-1 chat is substantially further along than earlier roadmap
notes suggested — see sections 5 and 7. Voice messages may have
partial groundwork (`message_type`/`mime_type` columns) — verify
before assuming it's unstarted. Still not started: group E2EE chat,
replies, location sharing, document attachments, audio/video calls,
screen share. True anti-screenshot protection isn't realistic on web.

## 11. How To Work With Me

Cybersecurity student, not primarily a developer — explain briefly.
Be direct. Audit before writing code — this doc has many [UNKNOWN —
VERIFY FIRST] items specifically because a previous session ran out of
credits mid-task; check `git diff`/`git status` and the actual current
file contents FIRST, don't assume this doc's status tags are still
accurate without checking, and don't redo work that's already done.
Batch edits, keep commentary short (a line per file).

## 12. Session Handoff Summary (read this first, practically)

A long prior session produced a sequence of prompts (informally labeled
A through L) covering: bug fixes, nav restructure, profile redesign,
mentions/tags, performance, typography/de-AI-ification, full UI
rebuild matching reference mockups, logo replacement, header/navbar
fix, chat implementation, MessagesListPage pixel-matching, and a
security/refactor audit. Credits ran out partway through this sequence
and it's genuinely unclear which of the later ones (roughly G onward)
were actually executed vs. only drafted as prompts.

**What's CONFIRMED real** (seen directly in live code pasted by the
user in this session): MessagesListPage.jsx is fully functional with
real realtime/encryption logic (not a stub), and the E2EE crypto
library's function signatures are as documented in section 5 above
(different from an earlier draft version).

**What to do first in a new session**: run a quick audit (file
listing + `git log`/`git diff` if available, or just open the key
files: FeedPage.jsx header area, the bottom nav component, ChatPage.jsx,
MessagesListPage.jsx's current JSX, index.css's color variables) and
report back what's actually in place before writing any new code. Then
resume only the parts confirmed incomplete, in whatever order makes
sense — don't blindly re-run every prompt from A-L.