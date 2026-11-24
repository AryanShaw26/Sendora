# design.md — UI/Visual Specification

> **Audience:** the AI coding agent implementing the frontend (Phase 8/9 of `implementation_guide.md`).
> **Source of truth for visuals.** Functional behaviour, API contracts, and data shapes remain in `PRD.md`. Where this file adds pages/routes beyond the PRD, §13 lists the exact changes — treat them as approved additions.
> **Direction:** a clean, dense, **Gmail-inspired** web-mail experience in **white + shades of red**. Inspired by Gmail's layout and interaction patterns only — do **not** use Google/Gmail logos, names or trademarked assets. The brand name used in the UI is **Sendora** with an original envelope mark (§2.4).

---

## 1. Design Principles

1. **Familiar mail-client feel:** top bar with pill search, left sidebar with a prominent Compose button, a dense list as the main surface, a floating compose window bottom-right, dark snackbar toasts bottom-left.
2. **White canvas, red accents:** surfaces are white/near-white; red is used for brand, primary actions, active states and emphasis — never as large flat backgrounds except the landing hero/CTA and auth side panel.
3. **Calm and dense:** compact rows (≈44 px), small type (13–14 px), generous whitespace around the list, soft 1 px borders instead of heavy shadows.
4. **Every state designed:** loading (skeleton), empty, error, success, disabled, focus.
5. **Accessible:** WCAG AA contrast, visible focus rings, keyboard operable, `prefers-reduced-motion` respected.

---

## 2. Foundations

### 2.1 Color tokens

**Brand reds (Gmail-like scale)**
| Token | Hex | Use |
|---|---|---|
| `red-50` | `#FDF2F2` | Subtle section backgrounds, hover tint |
| `red-100` | `#FCE8E6` | Selected/active nav item, Compose button bg, chips |
| `red-200` | `#F9D0CC` | Borders on red chips, focus halo |
| `red-300` | `#F4A9A2` | Disabled red, decorative |
| `red-400` | `#EE7B72` | Illustration accents, progress track fill (secondary) |
| `red-500` | `#EA4335` | Brand mark, links hover, progress fill |
| `red-600` | `#D93025` | **Primary buttons**, active tab underline |
| `red-700` | `#C5221F` | Primary button hover, compose window header |
| `red-800` | `#A50E0E` | Text on red-100 (active nav, Compose label), pressed state |
| `red-900` | `#7F0A0A` | Landing hero gradient end, footer accents |

**Neutrals**
| Token | Hex | Use |
|---|---|---|
| `white` | `#FFFFFF` | Cards, list surface, header |
| `surface` | `#F6F8FC` | App background behind list card, search bar bg |
| `surface-hover` | `#F2F6FC` | Row hover |
| `border` | `#E8EAED` | Dividers, input borders |
| `border-strong` | `#DADCE0` | Input hover border |
| `text-primary` | `#202124` | Body text, unread/bold text |
| `text-secondary` | `#5F6368` | Secondary text, icons |
| `text-disabled` | `#9AA0A6` | Disabled |
| `snackbar` | `#323232` | Toast background |

**Status colors (semantic, used only in badges/icons)**
| Status | Background | Text | Icon |
|---|---|---|---|
| `scheduled` | `#FEF7E0` (amber-50) | `#B06000` | clock |
| `processing` ("Sending") | `#FCE8E6` | `#A50E0E` | spinner (animated) |
| `sent` | `#E6F4EA` | `#137333` | check-circle |
| `failed` | `#C5221F` | `#FFFFFF` | alert-circle |

### 2.2 Typography
- **UI text:** `Roboto`, fallback `system-ui, sans-serif` (load 400/500/700 from Google Fonts).
- **Display/headings (landing, auth, empty states):** `Poppins` 500/600/700, fallback `Roboto`.
- Scale: `12` caption, `13` list/table text, `14` body/inputs, `16` section titles, `20` page titles, `28/36` landing h2, `44–56` landing h1 (responsive `clamp`).
- Line height 1.4–1.5 for body, 1.15 for display. Letter-spacing −0.01em on display sizes.

### 2.3 Shape, spacing, elevation, motion
- **Radius:** inputs/buttons 8 px (`rounded-lg`), cards 16 px (`rounded-2xl`), pills (`rounded-full`) for search, Compose button, chips, badges; nav active item `rounded-r-full`.
- **Spacing:** 4 px base grid (Tailwind default). Page gutter 16 px mobile, 24 px desktop.
- **Elevation:** `shadow-sm` for cards (`0 1px 2px rgba(60,64,67,.15)`), `shadow-md` for dropdowns/compose (`0 4px 12px rgba(60,64,67,.2)`), compose window `0 8px 24px rgba(60,64,67,.3)`.
- **Motion:** 150 ms ease-out for hover/focus; 200 ms slide-up for compose window; skeleton shimmer 1.2 s; spinner rotate. Wrap in `@media (prefers-reduced-motion: reduce)` → no animation.
- **Focus ring:** `outline: 2px solid #F4A9A2; outline-offset: 2px` (red-300) on every interactive element; never remove outlines.

### 2.4 Logo / brand mark
Original inline SVG: a rounded envelope outline whose flap is formed by a red-600 "V" with red-400 and red-800 accent triangles on the corners (distinct from any Gmail "M" mark). Wordmark "Sendora" in Poppins 600, `ink`, with the last syllable "ora" in `red-600` ("Send" in `ink`). Provide `<Logo size="sm|md|lg" />` component and a favicon (red envelope).

### 2.5 Iconography
Use `lucide-react` (add as dependency), 20 px default, 1.75 stroke, `text-secondary`; active/primary icons use red-800/red-600. Google "G" in the sign-in button uses the standard multicolor G mark per Google's sign-in branding guidelines (inline SVG).

### 2.6 Tailwind theme extension (put in `tailwind.config.ts`)
```ts
theme: {
  extend: {
    colors: {
      red: { 50:'#FDF2F2',100:'#FCE8E6',200:'#F9D0CC',300:'#F4A9A2',400:'#EE7B72',500:'#EA4335',600:'#D93025',700:'#C5221F',800:'#A50E0E',900:'#7F0A0A' },
      surface: { DEFAULT:'#F6F8FC', hover:'#F2F6FC' },
      line: { DEFAULT:'#E8EAED', strong:'#DADCE0' },
      ink: { DEFAULT:'#202124', soft:'#5F6368', faint:'#9AA0A6' },
    },
    fontFamily: {
      sans: ['Roboto','system-ui','sans-serif'],
      display: ['Poppins','Roboto','sans-serif'],
    },
    boxShadow: {
      card: '0 1px 2px rgba(60,64,67,.15), 0 1px 3px 1px rgba(60,64,67,.08)',
      float: '0 4px 12px rgba(60,64,67,.2)',
      compose: '0 8px 24px rgba(60,64,67,.3)',
    },
    keyframes: {
      shimmer: { '100%': { transform: 'translateX(100%)' } },
      slideUp: { from: { transform: 'translateY(24px)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } },
    },
    animation: { slideUp: 'slideUp .2s ease-out' },
  },
}
```
Load fonts in `index.html` via Google Fonts `<link>` (Roboto 400;500;700 and Poppins 500;600;700).

---

## 3. Routes & Page Inventory

| Route | Page | Access |
|---|---|---|
| `/` | Landing page | Public (logged-in users see "Open dashboard" instead of "Sign in") |
| `/login` | Sign in | Public (redirect to dashboard if authenticated) |
| `/register` | Create account | Public (same redirect rule) |
| `/dashboard` | Redirects to `/dashboard/scheduled` **preserving the query string** (e.g. `?slack=connected`) | Protected |
| `/dashboard/scheduled` | Scheduled Emails | Protected |
| `/dashboard/sent` | Sent Emails | Protected |
| `/dashboard/campaigns` | Campaigns overview | Protected |
| `/dashboard/search?q=` | Search results (Elasticsearch) | Protected |
| `/dashboard/settings` | Integrations & system (Slack, senders, queue dashboard) | Protected |
| `*` | 404 page | Public |

> The backend's OAuth callback redirects to `${FRONTEND_URL}/dashboard`, which is why `/dashboard` must exist and forward correctly.

---

## 4. Landing Page (`/`)

**Goal:** explain the product and push visitors to sign up. Light, airy, red accents.

### 4.1 Sections (top to bottom)
1. **Sticky navbar** (white, 64 px, bottom border appears on scroll): Logo left; links `Features`, `How it works`, `Reliability` (smooth-scroll anchors); right: `Sign in` (text button) + `Get started` (primary red pill). Mobile: hamburger → slide-down menu.
2. **Hero** (background: white with soft radial gradient `red-50` → white; optional subtle red-100 blobs):
   - Left: badge pill (`red-100` bg, `red-800` text) "Reliable email scheduling at scale"; **H1** "Schedule emails that arrive *exactly* on time." (the word *exactly* in red-600 with a thin red-200 underline stroke); subtext (18 px, `ink-soft`): "Upload your leads, set a start time, delay and hourly limit — Sendora handles queues, rate limits and restarts so nothing is lost or sent twice."; CTAs: `Get started with Google` (primary, Google G icon) and `See how it works` (outlined). Small caption under CTAs: "Sign in with your Google account — no password to manage."
   - Right: a **CSS/SVG product mockup** of the dashboard (mini sidebar, a few list rows with status badges, a floating compose window) inside a browser-frame card with `shadow-compose`, slightly rotated (−2°) on desktop; static, no screenshots required.
3. **Features grid** (id `features`; 3×2 on desktop, 1 col mobile) — cards: white, `border-line`, `rounded-2xl`, hover lifts + red-200 border; each with a red-100 circular icon (red-700 icon):
   1. *Precise scheduling* — "Every email is a persistent delayed job that fires at its exact scheduled time."
   2. *Survives restarts* — "Stop the server and start it again — future emails still send once, on time."
   3. *Smart rate limiting* — "Hourly caps per sender. Over the limit? Emails roll into the next window — never dropped."
   4. *Multiple senders* — "Spread sends across senders with a minimum delay between messages to mimic real provider throttling."
   5. *Slack alerts* — "Get a live Slack message the moment a sender hits its hourly limit."
   6. *Searchable history* — "Find any scheduled or sent email instantly with full-text search."
4. **How it works** (id `how-it-works`; 3 numbered steps in a row on desktop, stacked on mobile; numbers in red-600 circles; connecting dashed red-200 line): `1 Upload leads` → `2 Set timing & limits` → `3 Relax while it sends`.
5. **Reliability strip** (id `reliability`; red-50 background): four factual tiles — "BullMQ + Redis persistent queue", "Idempotent sends — no duplicates", "Redis-backed rate limits across workers", "Live queue dashboard". No invented statistics or testimonials.
6. **Final CTA band:** full-width gradient `red-700 → red-900`, white H2 "Ready to schedule your first campaign?", white pill button (red-700 text) `Get started with Google`.
7. **Footer** (white, border-top): logo, short tagline, links (Features, How it works, Sign in), "© {year} Sendora". Small note: "Built as a demo project."

### 4.2 Behaviour
- `Get started` → `/register`; `Sign in` → `/login`. If already authenticated, both become `Open dashboard` → `/dashboard`.
- Anchor links smooth-scroll with 72 px offset for the sticky nav. Sections fade-up on scroll (IntersectionObserver, disabled for reduced motion).

---

## 5. Auth Pages (`/login`, `/register`)

One shared `AuthPage` component with `mode: 'login' | 'register'`.

**Layout (desktop):** two columns, full height.
- **Left (form, white):** top-left Logo (links to `/`); vertically centered card (max-width 400 px): H1 (Poppins 600, 28 px), subtext, **`Continue with Google`** button (full width, white bg, `border-line-strong`, Google G, `ink` text, hover `surface-hover`, loading spinner when clicked), a thin divider with "secure sign-in", fine print, and a link to switch mode.
  - Login: H1 "Welcome back"; subtext "Sign in to manage your scheduled emails."; switch: "New here? **Create an account**" → `/register`.
  - Register: H1 "Create your account"; subtext "Get started in seconds with your Google account."; a 3-item checklist with red-600 check icons ("Schedule thousands of emails", "Never lose a send after a restart", "Slack alerts on rate limits"); switch: "Already have an account? **Sign in**" → `/login`.
  - Fine print: "By continuing you agree to the Terms and Privacy Policy" (non-linked text is acceptable for a demo).
- **Right (brand panel, hidden below `lg`):** gradient `red-600 → red-800`, white text, large faint envelope pattern/shapes in `red-500` at low opacity, a short quote-less value statement ("Schedule. Send. Relax.") and the dashboard mockup card from the landing page (reused component `ProductMockup`).

**Mobile:** single column, brand panel omitted, red-50 → white top gradient behind the logo.

**Behaviour & honesty note:** authentication is **Google OAuth only** (PRD §8). "Register" and "Login" both start the same OAuth flow (`window.location.href = ${API}/auth/google`); an account is created automatically on first sign-in. Do **not** add password or email fields. If the URL has `?error=…`, show an inline red-50 alert above the button with a friendly message.

---

## 6. App Shell (`/dashboard/*`)

### 6.1 Structure
```
┌──────────────────────────────────────────────────────────────────────────┐
│ ☰  [Logo]     (  🔍 Search emails…                       )   [Name/Email ▾ Avatar] │  64px header, white
├───────────────┬──────────────────────────────────────────────────────────┤
│ [✏ Compose]   │  ┌────────────────────────────────────────────────────┐ │
│               │  │ Page title            [toolbar: refresh, per-page]  │ │
│ ▸ Scheduled 12│  │ ───────────────────────────────────────────────────  │ │
│   Sent        │  │ Email | Subject | Scheduled time | Status            │ │
│   Campaigns   │  │ rows …                                               │ │
│   Settings    │  │ pagination                                           │ │
│               │  └────────────────────────────────────────────────────┘ │
│ ─────────     │                              ┌──────────────────────┐   │
│ Queue ↗       │                              │ New Email  _ ⤢ ✕     │   │ floating compose
│ Slack ● On    │                              └──────────────────────┘   │
└───────────────┴──────────────────────────────────────────────────────────┘
background: surface (#F6F8FC); main content is a white rounded-2xl card.
```

### 6.2 Header (white, 64 px, no bottom shadow; `border-b border-line`)
- **Left:** hamburger icon button (toggles sidebar: collapse to 72 px icon rail on desktop, drawer on mobile) + `Logo`.
- **Center:** search pill (max-width 720 px): bg `surface`, `rounded-full`, 48 px tall, search icon left, placeholder "Search emails by recipient, subject or content". On focus: bg white + `shadow-float`. `Enter` → `/dashboard/search?q=…`; clear (✕) button when non-empty. On mobile the search collapses to an icon that expands full-width.
- **Right:** user block — avatar (36 px circle; fallback = initials on red-100/red-800) with, on `≥lg`, **name (14 px, 500) and email (12 px, ink-soft)** stacked to its left (required by assignment). Click opens a dropdown (`shadow-float`, `rounded-2xl`, 320 px): large avatar, name, email, divider, `Sign out` item (icon + text). Closes on outside click / `Esc`.

### 6.3 Sidebar (256 px expanded / 72 px collapsed; bg `surface`, no border)
- **Compose button:** pill, 56 px tall, bg `red-100`, text/icon `red-800`, pencil icon + "Compose" (icon-only when collapsed), `shadow-card`, hover `shadow-float` + bg `red-200`. Opens the compose window (§7).
- **Nav items** (48 px tall, `rounded-r-full`, icon + label + optional count): `Scheduled` (clock icon, count badge = total scheduled/processing), `Sent` (send icon, count = total sent/failed), `Campaigns` (layers icon), `Settings` (settings icon).
  - Default: `ink-soft`, hover `bg-surface-hover` (slightly darker `#E8EDF5`).
  - **Active:** bg `red-100`, text/icon `red-800`, font-weight 700.
  - Counts come from `GET /api/emails?status=…&limit=1` (`total`), cached by react-query and refreshed with the lists.
- **Footer area:** `Queue dashboard ↗` link (opens `${API}/admin/queues` in new tab) and a small Slack status chip ("Slack connected" green dot / "Slack not connected" gray dot → links to Settings).

### 6.4 Main area
White card (`rounded-2xl`, `shadow-card`, min-height fills viewport), margin 0 16 16 0 on desktop; full-bleed on mobile. Page header row: title (Poppins 500, 20 px), optional subtitle, toolbar (refresh icon button with spin while fetching, "Rows per page" select for 10/20/50).

---

## 7. Compose Window (floating, Gmail-style)

**Trigger:** sidebar Compose button. **Position:** fixed bottom-right (`right: 24px; bottom: 0`), width 560 px, max-height `80vh`, `rounded-t-2xl`, `shadow-compose`, `animate-slideUp`, z-index above content. **Mobile (`<768px`):** full-screen sheet.

### 7.1 Anatomy
1. **Header bar** (40 px, bg `red-700`, white text "New Email"): buttons minimize (collapses to header only, stays docked), maximize (expands to centered 80%-width modal with backdrop), close (✕; if the form is dirty, confirm "Discard draft?").
2. **Recipients row** — label "To": the lead uploader. Empty state: dashed `red-200` drop zone, text "Drop a CSV or TXT file of leads, or **browse**". After parsing: a chip (`red-100` bg, `red-800` text, mail icon) **"{N} valid email addresses detected"**, plus a muted line "{M} invalid or duplicate skipped" when applicable, and a small "Replace" / ✕ to remove. Parsing errors show a red-50 inline alert. Accepted: `.csv`, `.txt`.
3. **Subject row:** borderless input with bottom `border-line`, placeholder "Subject".
4. **Body:** borderless auto-growing textarea (min 8 rows), placeholder "Write your message…". A minimal non-functional formatting toolbar is **not** shown (do not render fake controls).
5. **Schedule settings strip** (bg `red-50`, `border-t border-line`, padding 12–16): three compact labeled fields in a row (stack on mobile): `Start time` (`datetime-local`), `Delay between emails (sec)` (number), `Hourly limit` (number). Helper text beneath (12 px, ink-soft): "First email at {time} · last at ≈ {time}" computed live from count × delay; show a warning chip (amber) if hourly limit implies the campaign spans multiple hours.
6. **Footer** (white, 64 px): primary **`Schedule`** button (red-600, white text, pill-shaped left part with clock icon; disabled until subject, body, ≥1 valid email and valid settings); `Discard` icon button (trash) on the right.

### 7.2 Behaviour
- Defaults: start = now + 2 min (rounded to minute), delay 5, hourly limit 100.
- Inline validation messages under fields (12 px, `red-700`) mirroring server limits (PRD §10.1).
- Submitting: button shows spinner + "Scheduling…", fields disabled. Success → snackbar "Scheduled {N} emails" with action `View` (→ Scheduled), window closes, queries invalidated. Failure → snackbar with API error message; window stays open with data preserved.
- Draft is kept in memory while minimized; cleared on success/discard.

---

## 8. Dashboard Pages

### 8.1 Scheduled Emails (`/dashboard/scheduled`)
- **Table columns:** `Email` (recipient, 500 weight) · `Subject` · `Scheduled time` (e.g. "Nov 24, 3:05 PM", tooltip with full ISO/timezone) · `Status` (badge) . Optional muted `Sender` text under the email on `≥xl`.
- Header row: sticky, `surface` bg, 12 px uppercase-less labels `ink-soft`, 40 px; data rows 48 px, `border-b border-line`, hover `bg-surface-hover` with a subtle inset left red-400 2 px bar and `shadow` like Gmail's raised row.
- Rows deferred by rate limit show an extra small chip next to the time: `Rescheduled (rate limit)` (amber) when `deferredCount > 0`.
- **Loading:** 8 skeleton rows with shimmer. **Empty:** centered illustration (inline SVG: envelope with clock in red-200/red-500), H3 "No scheduled emails", text "Emails you schedule will show up here.", primary button `Compose new email`. **Error:** red-50 alert card with message + `Try again`.
- Pagination footer: "1–20 of 134" text, prev/next icon buttons. Auto-refresh every 10 s (subtle spinner in toolbar refresh icon).

### 8.2 Sent Emails (`/dashboard/sent`)
- **Columns:** `Email` · `Subject` · `Sent time` · `Status` (`sent` green / `failed` solid red badge). Failed rows show the `errorMessage` as a tooltip on the badge.
- Row click opens the **Email detail drawer** (§8.5).
- Empty state: illustration (paper plane), "No sent emails yet", "Sent emails will appear here once your schedule starts running."

### 8.3 Campaigns (`/dashboard/campaigns`)
- List of campaign cards (white, `border-line`, `rounded-2xl`, 16–20 px padding), newest first, from `GET /api/campaigns`:
  - Title = subject; meta line "Created {date} · {total} emails · {delay}s delay · {hourlyLimit}/hr".
  - **Progress bar** (8 px, `rounded-full`, track `red-100`, fill `red-500`) showing sent ÷ total; legend with counts for Scheduled / Sending / Sent / Failed using the status colors.
  - Actions: `View scheduled` / `View sent` text buttons → respective pages with `?campaignId=…`.
- Empty: "No campaigns yet" + Compose CTA. Loading: 3 card skeletons.

### 8.4 Search (`/dashboard/search?q=`)
- Title "Results for “{q}”"; filter chips `All · Scheduled · Sent · Failed` (selected chip = `red-100` bg, `red-800` text, red-200 border).
- Same table as Scheduled/Sent with a `Status` column and both time columns collapsed into one "Time" column. Matched terms highlighted with `bg-red-100` `<mark>` in recipient/subject (client-side highlight of `q` tokens).
- Empty: "No results for “{q}”" with tips. If the API returns 503 (Elasticsearch down): friendly error card "Search is temporarily unavailable."

### 8.5 Email detail drawer (right side, 420 px, `shadow-float`, slide-in)
Shows recipient, subject, status badge, sender email, scheduled/sent times, attempts, deferred count, error message (if any), and a `View in Ethereal` link when `previewUrl` exists (opens in new tab). Close with ✕/`Esc`/backdrop. (Data comes from the list item; no extra endpoint needed.)

### 8.6 Settings (`/dashboard/settings`)
Stacked cards:
1. **Slack alerts:** shows state; if disconnected → text "Get notified in Slack when a sender hits its hourly limit." + `Connect Slack` (primary red, Slack-agnostic hashtag icon). If connected → team/channel chip, `Send test message` (outlined) and `Disconnect` (text, red-700, confirm dialog). Success/failure → snackbar.
2. **Senders:** read-only list from `GET /api/senders` (avatar-initial circles, email, "Active" chip).
3. **Queue dashboard:** description + `Open dashboard ↗` button → `${API}/admin/queues`.
4. **Account:** avatar, name, email, `Sign out` button.

### 8.7 404 page
Centered: large "404" in Poppins 700 `red-100` with an envelope illustration, H2 "Page not found", button `Go to dashboard` (or `Go home` if logged out).

---

## 9. Component Specs (reusable, in `components/ui`)

| Component | Spec |
|---|---|
| `Button` | Variants: `primary` (bg red-600, hover red-700, active red-800, white text), `tonal` (bg red-100, text red-800, hover red-200), `outline` (white, border-line-strong, ink text, hover surface-hover), `ghost` (transparent, ink-soft, hover surface-hover), `danger-text` (red-700 text). Sizes `sm` (32), `md` (40), `lg` (48). `rounded-full` for `lg` CTAs and Compose, `rounded-lg` otherwise. Props: `loading`, `leftIcon`, `fullWidth`. Disabled: 50% opacity, `cursor-not-allowed`. |
| `IconButton` | 40 px circle, ghost style, `aria-label` required. |
| `Input` / `Textarea` | 40 px, `rounded-lg`, border `line-strong`, focus border red-600 + 2 px red-200 ring, error state border red-700 + helper in red-700. Label above (12 px, 500, ink-soft). |
| `Badge` / `StatusBadge` | Pill, 12 px/500, padding 2×10, icon + label, colors per §2.1. |
| `Chip` | Pill, `red-100` bg, `red-800` text, optional leading icon and close button. |
| `Table` | Semantic `<table>`; sticky header; row hover; responsive: below `md` render rows as stacked cards (email bold, subject, time + badge). |
| `Skeleton` | `bg-line` blocks with shimmer overlay. |
| `EmptyState` | Props `illustration`, `title`, `description`, `action`. Illustrations are inline SVGs in red-100/200/500 + neutral grays. |
| `Modal` / `Drawer` / `Dropdown` | Backdrop `rgba(32,33,36,.5)`; focus trap; `Esc` closes; `shadow-float`. |
| `Snackbar` (react-hot-toast styling) | Bottom-left, bg `#323232`, white text 14 px, `rounded-lg`, optional action text in `red-300`; success/error icons (check in `#81C995`, alert in `red-300`). 4 s duration. |
| `Avatar` | Image with initials fallback (red-100 bg, red-800 text), sizes 24/32/36/56. |
| `FileDropzone` | Dashed red-200 border, hover/drag-over bg red-50, keyboard accessible (button + hidden input). |
| `Logo`, `ProductMockup` | Per §2.4 and §4.1. |
| `ProgressBar` | Per §8.3. |

---

## 10. Responsive Behaviour

| Breakpoint | Behaviour |
|---|---|
| `<640px` (mobile) | Sidebar becomes an overlay drawer (hamburger); search collapses to icon; header user block shows avatar only; tables → card list; compose = full-screen sheet; landing hero stacks (mockup below text); auth is single column. |
| `640–1023px` | Sidebar collapsed to 72 px icon rail by default; tables remain tabular with `Subject` truncated; name/email hidden (visible in dropdown). |
| `≥1024px` | Full layout; sidebar 256 px (collapsible); name + email visible in header; auth split layout. |
| `≥1280px` | Show sender sub-line in tables; main card max-width 1400 px centered if viewport is huge. |

Minimum supported width: 360 px. No horizontal page scroll; wide content scrolls inside its own container.

---

## 11. Accessibility & Quality Checklist
- Text contrast ≥ 4.5:1 (e.g. `red-800` on `red-100` ✔, white on `red-600` ✔, `ink-soft` on white ✔). Do not use `red-300/400` for text on white.
- All icon-only buttons have `aria-label`; tables have `<caption class="sr-only">`; status is conveyed by icon **and** text, not color alone.
- Modal/drawer/compose manage focus (trap, restore) and close on `Esc`.
- Live regions: snackbars use `role="status"`; form errors `aria-describedby`.
- Respect `prefers-reduced-motion`.
- Dates formatted with `date-fns` in the user's local timezone; tooltips show full date with timezone.
- Keep one icon style, one radius system, one spacing scale — no one-off values.

---

## 12. Copy Deck (use verbatim where given)
- App name: **Sendora**
- Tagline: "Schedule emails that arrive exactly on time."
- Primary CTA: "Get started with Google" · Secondary: "See how it works"
- Empty (scheduled): "No scheduled emails" / "Emails you schedule will show up here."
- Empty (sent): "No sent emails yet" / "Sent emails will appear here once your schedule starts running."
- Success: "Scheduled {N} emails" · Slack: "Slack connected" / "Slack disconnected" / "Test message sent"
- Errors: "Something went wrong. Please try again." (fallback), API message preferred when available.
- Confirmations: "Discard this draft?" · "Disconnect Slack? You'll stop receiving rate-limit alerts."

---

## 13. Required Changes to PRD / Implementation Guide (approved by this design)
1. **Routes:** replace the PRD §12 route list with §3 above. `/dashboard` redirects to `/dashboard/scheduled` preserving the query string; tabs are now sidebar items instead of in-page tabs (the Scheduled/Sent sections still satisfy PRD F2/F4/F5).
2. **Compose** is the floating window of §7 (satisfies PRD F3; all fields and the detected-count requirement remain).
3. **Extra pages** (Landing, Register, Campaigns, Search, Settings, 404) use **existing** backend endpoints only (`/api/campaigns`, `/api/emails/search`, `/api/senders`, `/api/slack/*`, `/admin/queues`). **No backend changes needed.** `GET /api/emails` already supports `campaignId`.
4. **New frontend deps:** `lucide-react` (icons). Fonts via Google Fonts `<link>`.
5. **Register vs Login:** both use Google OAuth (PRD §8); no password-based registration is implemented.
6. **Implementation guide Phase 8/9:** build UI primitives from §9 first, then layout (§6), then pages in this order: Auth → Shell → Scheduled/Sent → Compose → Settings (Slack) → Campaigns → Search → Landing → 404. Apply tokens from §2.6 before writing any component.
7. In `report.md` list each page/component from §3 and §9 with a status (Done/Partial/Not done) and note any visual deviation.
