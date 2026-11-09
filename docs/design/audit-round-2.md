# Tachi · Impeccable Audit + Critique · Round 2

⚠️ DEGRADED: single-context (no sub-agent tool is exposed to this auditor, so Assessment A and Assessment B ran in one context; the state matrix ran before the visual review, so some anchoring is possible).

- **Date:** 2026-11-09 · **Build under test:** production server `http://localhost:4100` (`dist/assets/index-DJdfxJf6.js` + 9 route/shared chunks), full 16-step demo state.
- **Method:** same as round 1 — `docs/impeccable/audit.md` (5 × 0–4 = /20) and `docs/impeccable/critique.md` (Nielsen /40, cognitive load, emotional journey, personas).
- **Evidence collected this round:**
  - static detector, 7 CLI URL scans, the round-1 35-state matrix (`docs/design/tools/verify-design.cjs`), run twice: once on the settled state and once **while another process replayed the demo** (that run exposed mid-flow defects);
  - a new **40-state extension** plus keyboard flows (help sheet, dialogs, menus, panels, side room, Director at 1024/1280, 200 % text, WCAG 1.4.12 text-spacing, 320×256 family, CLS, reduced-motion animation audit);
  - **axe-core 4.10.2** over 21 states;
  - per-route performance at local speed and slow 4G;
  - element screenshots for the critique;
  - **runtime validation of every CSS/DOM fix below** (product code untouched).
- **Scratch tools (copy them into `docs/design/tools/` to keep them; see H-02):**
  - `…/scratchpad/r2/verify-r2.cjs` (40 states + behaviour);
  - `…/scratchpad/r2/patch-validate.cjs` (runtime patch set, then detector);
  - `…/scratchpad/r2/axe-run.cjs` (axe; needs `…/scratchpad/r2/axe/package/axe.min.js`);
  - `…/scratchpad/r2/perf.cjs`.

  The full scratchpad prefix is `/tmp/claude-0/-home-user/843dcc6b-8a43-5bd6-a62f-d1e12218a988/scratchpad/r2/`.

---

## 1. Audit Health Score

| # | Dimension | R1 | **R2** | Key finding |
|---|-----------|----|--------|-------------|
| 1 | Accessibility | 2 | **3** | AA is now met almost everywhere: axe finds 0 A/AA violations in 20 of 21 states, every overlay traps focus, closes on Escape and returns focus, and text scales with the browser preference. **Three real failures remain:** (a) the memory sheet's 공개 범위 radiogroup is **collapsed to 2 px**, so the control is invisible, its focus is invisible, and axe flags `target-size` (A2-01); (b) the artifact panel's poll list dims waiting participants with `opacity:.55`, giving **4.3:1 and 2.1:1** text, visible only while scheduling is live (B2-02); (c) `Dialog.tsx` re-runs its focus effect on every parent re-render, so focus jumps back to the autofocus field. The Director's reset dialog does this once per second during a run (B2-03). Also: Escape from the desktop side panel drops focus to `<body>` (B2-04), graph edges are 1.41:1 (1.4.11, A2-05), and the narrow room list has no `main` or `h1` (B2-06). |
| 2 | Performance | 3 | **4** | Route code-splitting (10 JS chunks); brotli or gzip plus `immutable` on `/assets`; `max-age=86400` on demo photos. JS over the wire per route: 104 KB landing, 129 KB senior, 137 KB family, 150 KB Director. FCP ≈ 80 ms locally; LCP 1.2–2.4 s on a slow-4G profile. **CLS 0.0001 / 0.0015 / 0.0007** with images delayed by 1.5 s. Only transform and opacity are animated, and nothing drops frames. Residual (not score-blocking): user uploads are stored and served at full size (A2-14). |
| 3 | Theming | 3 | **4** | Full semantic token layer, with 0 `var(--color-*)` outside `tokens.css`. The only hex literals are the two documented QR `#fff` backgrounds. rem type scale plus an explicit senior scale. Dark mode passes every contrast check in every state. `theme-color` follows the theme, the Director is achromatic, and there are no undefined tokens. Residual polish: about 30 raw px spacing literals, `var(--text-title, 20px)`-style fallbacks, and Avatar's inline px font size (A2-18, B2-13). |
| 4 | Responsive Design | 3 | **3** | Phones at 320/390, the short-screen senior layout, 320×256, landscape and touch targets are all solid. **Regressions and misses:**<br>• the family header **collapses at 900–1180 px with a panel open**: the title is 0 px at 920 and "우…" at 1024, and the 초대 / 어머니 소식 labels wrap one syllable per line;<br>• **side-room headers on phones** read "일정 조율 · 어…" and the "가족방으로" pill wraps to 3 lines. This is the Director's third phone;<br>• the senior placeholder is clipped (by 3 px at 390, visible in the Director; badly at 320 and at 200 % text);<br>• the family composer placeholder wraps and clips at ≤ 340 px;<br>• at 200 % text, album tiles clip their titles and the family title truncates;<br>• the Director graph strip at 1024 px is an illegible tangle (50 overlapping label pairs). |
| 5 | Implementation Integrity | 2 | **3** | Static: 0. CLI: 0 on 7 URLs. 35-state matrix on the settled state: **0 findings, 0 hard failures**. But a live replay gives **6 findings and 4 hard failures** (`pulsing-dot` on the typing indicator; `low-contrast` on the poll list). The 40-state extension gives **20 findings in 8 states** (popover and menu `text-occlusion` ×7, `cramped-padding` ×8 at 200 % text, `flat-type-hierarchy` ×3 with the help sheet open, `icon-tile-stack` ×1, scroll-clipped `text-occlusion` overhang ×1 (false positive)). **All of them go to 0 with the validated patch set.** Hand-found drift: the collapsed Segmented in one container, a second modal implementation (`Dialog.tsx`) beside `useModal`, a stale instruction plus six filled pills on the answered schedule card, a disabled-and-checked button pattern on partially decided cards, duplicate "1박 2일", double sr-only `h2`s, and a stray `undefined/` screenshot directory at the repo root. |
| **Total** | | **13** | **17/20** | **Good**: address Accessibility, Responsive and Integrity. The validated fix list in §8 projects **20/20**. |

---

## 2. Implementation Integrity Verdict: **PASS on concept, near-PASS on finish**

Round 2 kept the round-1 system intact:
- graphite on white with hairline elevation;
- 56 px senior controls;
- privacy by default;
- shape-coded graph nodes;
- the ChatGPT-shaped family room with a live gathering document.

It also cleared the verified round-1 defects:
- one accessible Segmented with no nested cards and an inset ring;
- one modal hook for the senior sheets, the family sheet and the help sheet;
- a heading outline with one `h1` per surface;
- rem type that honours the user's text-size preference;
- an achromatic Director;
- the decided memory card reduced to one sentence plus one switch.

The finish is not perfect yet, and two of the remaining defects are severe:
- **A shared component regressed in one container.** `.seg { overflow:hidden }` makes the Segmented a flex item with `min-height:auto = 0`. Inside the scrolling `.sa-sheet-body` it collapses to its 2 px border. That is the only place the senior can change a memory's visibility from the album. Neither the detector nor the round-1 matrix sees it; axe's `target-size` and a height probe do (`segH: 2`, buttons 56 px).
- **Mid-flow states were never in the matrix.** The scheduling beat is when every phone in the Director is showing it, and it carries an AA contrast failure and a detector finding that vanish once the poll closes.

Everything else is isolated and cheap. Every CSS/DOM item in §8 was applied at runtime and re-detected: all affected states come back **CLEAN** (§4.5).

---

## 3. Executive Summary

- **Audit Health Score: 17/20 (Good)**, up from 13. **Design Health (Nielsen): 30/40 (Good)**, up from 29.
- **Detector totals:**

  | Run | Result |
  |---|---|
  | static | 0 |
  | CLI | 0 on 7 URLs |
  | 35-state matrix, settled state | 0 findings, 0 hard failures |
  | 35-state matrix during a live replay | 6 findings, 4 hard failures |
  | 40-state extension | 20 findings in 8 states, then **0 after the validated patches** |
  | axe-core | 3 violations (2 states), 1 prohibited-ARIA "incomplete" |

- **Round-1 status:** **50 of 54 items fixed**, 4 partial (A-01 regressed in one container; A-17, B-01, B-11), 0 not fixed.
- **New fix list:** 3 × P1, 18 × P2, 12 × P3, plus 2 housekeeping items.
- **Top issues:**
  1. **A2-01 (P1):** the memory-sheet visibility radiogroup is collapsed to 2 px, so the senior's privacy control is invisible in the album.
  2. **B2-02 (P1):** poll participants at 4.3:1 and 2.1:1 in the artifact panel during scheduling.
  3. **B2-01 (P1):** the family header collapses at 900–1180 px with a panel open, and side-room headers are broken on phones, including the Director's third phone.
  4. **B2-03 / B2-04 (P2):** focus jumps inside dialogs on every re-render, and focus is lost after Escape in the desktop panel.
  5. **A2-04 / B2-05 / A2-12 (P2–P3):** detector findings from the absolutely positioned popovers and the pulsing typing dots.
- **Order:** C first (2 tiny base rules). Then A and B in parallel. There is one A→B dependency: **A2-11 → B2-07** (the `labelMode` prop on MemoryGraph). Then rebuild, restart, and run §9.

---

## 4. Detector Findings

### 4.1 Static: `npx -y impeccable@4.8.1 detect --json web/src`
`[]`, exit 0. The round-1 `side-tab` is gone.

### 4.2 CLI URL scans (first paint), `IMPECCABLE_BROWSER=…/chrome-nosandbox.sh`

| URL | Result |
|---|---|
| `/senior?as=mom&embed=1` | `[]` exit 0 |
| `/senior?as=mom&embed=1&theme=dark` | `[]` exit 0 |
| `/family?as=jieun&embed=1` | `[]` exit 0 |
| `/family?as=jieun` | `[]` exit 0 |
| `/family?as=jieun&embed=1&theme=dark` | `[]` exit 0 |
| `/demo?key=demo42` | `[]` exit 0 |
| `/` | `[]` exit 0 |

### 4.3 Round-1 35-state matrix (`verify-design.cjs`)

| Run | Detector | Hard failures | Notes |
|---|---|---|---|
| Settled full-run state (03:4x) | **0** | **0** | All `behaviour` checks true: `seniorSheet` {focusMovedIn, tabTrapped, escapeCloses, focusReturned}, `familySheet`, `samplePopEscape`, `moreMenuEscape`, `textPreference.scales` (40 px), `speakLineRhythm.ok` (gaps 31 = line-height). Thread heights: 77 px at 320×256 (needs ≥ 72), 211 px at 844×390 (needs ≥ 200). Coarse targets: only `textarea.cp-ta 170×39`. |
| **During another process's live replay (04:1x)** | **6** | **4** | `senior-chat-light` and `family-desktop-artifact`: `pulsing-dot` on `.ml-typing i` (Tachi typing). `family-embed-artifact` and `family-desktop-artifact`: `low-contrast` 4.3:1 (`span.ap-poll-p > span.caption`) and 2.1:1 (`span.ap-poll-st.faint` "대기"), plus my contrast probe's 2 hard failures per state. **This is the scheduling beat: these defects are demo-visible and disappear after the poll closes.** |

`family-list-390` and `family-zoom200` report `h1=0`: the narrow room list has no `h1`, and axe confirms it plus a missing `main` (B2-06).

### 4.4 Round-2 extension: 40 new states (`verify-r2.cjs`), before fixes

| State | Findings | Verdict |
|---|---|---|
| `senior-help`, `senior-help-dark`, `senior-help-320x256` | `flat-type-hierarchy` (advisory): body 17 → h3 20 → h2 24, largest step 1.20 | **Real.** The sheet title (24 px) is too close to card titles (20 px) when the screen `h1` is sr-only. Fix A2-06. |
| `senior-samples` | `text-occlusion`: newest Tachi line 89 % covered by `div.cp-pop` | **By rule.** The detector exempts only `position:fixed/sticky` layers, never ARIA roles (`page_checks.rs` `is_pinned_overlay`). Fix A2-04. |
| `family-390-more` | `text-occlusion` ×6: report card text 38–69 % covered by `div.fam-more-menu` | **By rule.** Same mechanism. Fix B2-05. |
| `senior-text200-chat` | `cramped-padding` ×4: user bubble has 15–16 px beside 40 px text | **Real.** px padding does not scale with text. Fix A2-07. |
| `family-text200-embed` | `cramped-padding` ×2 (`.badge.cd-badge-ink`); `icon-tile-stack` (back button "above" h1); plus a **hard failure**: title truncated ("우리 …") | **Real.** Fixes C2-01, C2-02, B2-01. |
| `family-text200-desktop` | `cramped-padding` ×2 (`.badge.cd-badge-ink`, fixed by C2-01); `text-occlusion`: "h1 overhangs article.cd by 14 px" | The badge findings are **real**. The overhang is a **false positive**: the card is scrolled under the header and clipped by `.ml`'s overflow, and the rect test ignores scroll clipping. It disappears with B2-01. |
| `family-1024-artifact` | **Hard failure:** title truncated to 50 px; labels wrap one syllable per line | **Real (P1).** Fix B2-01. |
| 31 other states (sheet and help dark, landscape sheet, privacy at 320, text-spacing, family 320×256, landscape, all dark panels, memory detail at 390/1440, invite and new room at 390, persona menu, side room, Director 1280/1024/dark/side/QR/reset-confirm/390, landing dark and 320×256) | 0 | Clean |

**Totals before fixes: 20 findings in 8 states, plus 2 hard failures** (`family-text200-embed` and `family-1024-artifact` title truncation). The typing indicator's `pulsing-dot` showed up only in the replay runs (§4.3); fixed by A2-12. Also measured but not detector rules: clipped placeholders (senior 191 > 188 px at 390, 191 > 118 at 320; family wraps at 320), 4 album titles clipped at 200 %, side-room title 353 > 158 px at 390, header title `clientWidth` 0 at 920 with a panel open.

### 4.5 Fix validation (runtime patch, then detector), `patch-validate.cjs`

I applied the CSS and DOM equivalents of the following, then re-measured and re-detected:
- A2-01, A2-02, A2-03, A2-04, A2-05, A2-06, A2-07, A2-08;
- B2-01 (container query, kicker, 2-line clamp, nowrap buttons, side-room label class), B2-05;
- C2-01, C2-02.

```
senior-sheet det=0 seg=58px · senior-help det=0 · senior-samples det=0 · senior-chat det=0 ph 126/196
senior-320 det=0 ph 126/254 thread 303 · senior-320x256 det=0 thread 77 · senior-landscape det=0 thread 211
senior-text200-chat det=0 ph 251/324 · senior-text200-album det=0 · senior-album-320 det=0
family-text200-embed det=0 title 2 lines, no truncation · family-text200-desktop det=0
family-920-artifact det=0 title 96px fits · family-1024-artifact det=0 title 200px · family-1440 det=0
family-390-side det=0 "일정 조율" kicker + 2-line name (169×52, fits) · family-320-side det=0 (136×52, fits)
family-embed det=0 · family-320 det=0 ph 101/138 · family-390-more det=0 · family-desktop-more det=0
Director strip at 1024 with labelMode 'focus' (CSS emulation): 50 → 0 overlapping label pairs
```

Header buttons measure 44 px high in every state, and nothing scrolls horizontally. The only placeholder still clipped is at 320×256 (input 62 px wide); I accept that residual, because the field has an accessible name and the hint is repeated in the help sheet.

### 4.6 axe-core 4.10.2 (wcag2a/aa, 21a/aa, 22aa, best-practice), 21 states

| State | Violations |
|---|---|
| `senior-sheet` | `target-size` (serious) ×1: the collapsed radiogroup (see A2-01). Still present after `scrollIntoView`, so it is not a scroll artifact. |
| `family-list` (390, non-embedded) | `landmark-one-main`, `page-has-heading-one` (B2-06) |
| `demo-graph` | incomplete `aria-prohibited-attr`: `<div class="dc-recall" aria-label="회상 근거">`. The same pattern sits in `Sidebar.tsx` `.fam-unread` and in the Director's "건너뜀" span (B2-09). |
| 18 others | 0 |

The `color-contrast` "incomplete" results on senior pages are axe declining to judge text over images and scroll layers. My computed-style contrast probe covers them: **0 failures** in the settled state, in both themes.

### 4.7 Keyboard and behaviour (`verify-r2.cjs behaviour`)

| Flow | Result |
|---|---|
| Help sheet | Focus goes to "알겠어요", Tab and Shift+Tab trapped, Escape closes, focus returns to `[도움말]` ✓ |
| Invite dialog (desktop) | Focus goes to the search field, trapped, Escape closes, focus returns to `[초대]` ✓ |
| **Dialog re-render** | Focus on a contact's `button.btn`; resizing 1000 → 800 px (FamilyApp re-renders) moves focus to `input.fam-search-input`. **Bug** (B2-03). |
| Memory detail (mom panel) | Focus moves in, Escape closes, focus returns to the tile, panel stays open ✓ |
| **Desktop artifact panel** | Focus stays on the card (fine for a non-modal panel) and the panel is reached in 7 Tabs. **But Escape from inside the panel leaves focus on `body`** (B2-04). |
| Narrow artifact sheet | `role=dialog`, trapped, Escape, focus returns to `.cd-art-head` ✓ |
| Persona menu | Focus on the pressed row, Escape returns focus to the trigger ✓ |
| More menu | Focus moves in, still open after the mouse leaves, Escape returns focus to the trigger ✓ |
| MomPanel tabs | ArrowRight moves to 건강 and selects it, one tabbable tab ✓ |
| Segmented (privacy "daily") | Roving tabindex, ArrowRight checks and focuses the next option, inset ring visible, **restored to 나만 보기** ✓ |
| Reduced motion | No travelling animations in the family sheet or senior help sheet, 0 smooth `scrollTo` calls ✓ |
| Text preference 32 px | senior body 40 px, family 32 px, landing 32 px ✓ |

---

## 5. Measurements

### 5.1 Contrast
- **Text:** 0 failures across 75 settled states in both themes (probe plus detector). Placeholders use `--text-3`: light 5.10:1, dark 6.38:1.
- **Mid-flow failure:** `.ap-poll-p { opacity:.55 }` gives participant names #777 on #f9f9f9 = **4.3:1** and "대기" #adadad on #f9f9f9 = **2.1:1** (B2-02).
- **Non-text (1.4.11):**
  - pass: field boundaries via `--border-field` (#8f8f8f: 3.23:1 light, 4.98:1 dark); the selected Segmented fill; the focus ring (2 px ink plus 2 px gap);
  - **fail: graph edges** `--border-strong`, about 1.41:1 on white and about 1.6:1 on dark. They carry the relationships in the senior album, the memory card and the Director proof (A2-05);
  - `.hs-dot-none` at `opacity:.6` is about 2.3:1 (A2-05, P3 part).

### 5.2 Touch targets
- **Senior:** every control ≥ 56 px, chips 48 px; coarse audit clean (chat, help, album, sheet).
- **Family coarse (390):**
  - clean: room list, landing, help, more menu;
  - residual: `textarea.cp-ta` 39 px tall inside a 49 px row (P3); inline `.ap-field` inputs 38 px (P3); the add-task `btn-icon` squeezed to 38×44 by flex (P3, B2-12).
  - Checkboxes sit in 44 px label hit boxes ✓.
- **Director:** fine-pointer console. Its 28–36 px controls pass 2.5.8 by spacing.

### 5.3 Keyboard and focus
See §4.7. Further issues:
- the Director step buttons call `e.currentTarget.blur()` after a click, so pressing Enter on a step drops focus to `body`;
- the global handler treats Space on any focused button as "next step";
- "R" is a single-character shortcut with no off switch (2.1.4, Level A). It only opens a confirm dialog (B2-10).

### 5.4 Motion
- The reduced-motion design is intact: no transform animations run under `reduce`, spinners stop, and `fam-slide` is a fade.
- Typing dots pulse infinitely (allowed under `no-preference`, but flagged by the detector; A2-12).

### 5.5 Reflow, zoom, text size and text spacing
- **320 px, 320×256, 568×320, 844×390, 640×450:** no horizontal overflow anywhere.
- **Text-spacing (1.4.12, injected):** senior chat and family embed have no clipping and 0 findings.
- **200 % text:**
  - the senior chat reflows (thread 472 px);
  - the family title truncates and the album tiles clip (fixed by B2-01 and A2-08);
  - placeholders clip (A2-02);
  - the badge and bubble padding are cramped (C2-01, A2-07).
- **Header at 900–1180 px with a panel open:** collapses (B2-01).

### 5.6 Performance

| Route | Requests | JS (br) | CSS | FCP local | LCP local | LCP slow-4G |
|---|---|---|---|---|---|---|
| `/` | 9 | 104 KB | 4 KB | 80 ms | 416 ms | 1 344 ms |
| `/senior` | 12 | 129 KB | 11 KB | 76 ms | 384 ms | 1 236 ms |
| `/family` | 14 | 137 KB | 13 KB | 80 ms | 476 ms | 1 872 ms |
| `/demo` | 39 | 150 KB | 17 KB | 80 ms | 480 ms | 2 396 ms |

- **Bundle:** `index` 310 KB raw / 97 KB gz is framework, router and socket; the route chunks are 1.7–13.5 KB gz.
- **Headers:** `/assets/*` gets `Content-Encoding: br` and `Cache-Control: public, max-age=31536000, immutable`; `/demo-photos` gets `max-age=86400`; HTML gets `no-cache`.
- **CLS** (images delayed 1.5 s): senior 0.0001, family 0.0015 (textarea auto-grow), family desktop 0.0007.
- **Uploads** are `private, no-store` (a deliberate privacy choice; keep it) and are **not downscaled**: a 12 MP phone photo would be re-downloaded at full size on every view (A2-14, P3).

### 5.7 Other verified facts
- Server state was reset and replayed twice by another process during this audit (04:09 and 04:16). I did not reset anything. The privacy "daily" toggle was restored to 나만 보기 and verified.
- A stray **`/home/user/tachi/undefined/`** holds 4 screenshots (`dir-1024.png`, …). It was written by a scratch script with an undefined output directory (H-01).

---

## 6. Round-1 Item Status (54 items)

**Fixed: 50 · Partially: 4 · Not fixed: 0**

| ID | Status | Evidence |
|---|---|---|
| C-01 | Fixed | `::placeholder { color: var(--text-3) }` in base.css; no `low-contrast` on dark first paint. |
| C-02 | Fixed | `--border-field` in tokens.css; `.input` uses it; `.cp-row` and `.fam-search` too. |
| C-03 | Fixed | rem scale plus `--senior-*` tokens; with the 32 px preference, senior body is 40 px and family 32 px. |
| C-04 | Fixed | `grep "var(--color-"` outside tokens.css finds nothing. |
| C-05 | Fixed | coarse floor in base.css; `coarseTargets_*` lists no `.btn`, `.chip` or `.btn-icon`. |
| C-06 | Fixed | `text-wrap: balance` on h1–h4; no `unbalanced-heading`. |
| C-07 | Fixed | base hover rules sit in `(hover: hover)`. |
| C-08 | Fixed | media-gated `theme-color` metas plus `applyTheme()`. |
| C-09 | Fixed | `web/dist` is absent. (New stray directory: H-01.) |
| A-01 | **Partial (regression)** | One `Segmented` radiogroup, inset ring, arrow keys, detector-clean. But it **collapses to 2 px in `.sa-sheet-body`** (A2-01). |
| A-02 | Fixed | `useModal`; `seniorSheet` and help-sheet flows pass. |
| A-03 | Fixed | 320×256 thread 77 px with no occlusion; landscape 211 px. |
| A-04 | Fixed | `speakLineRhythm.ok` (31 = 31). |
| A-05 | Fixed | Facts wrap with no clipping; decided card shows one caption plus one radiogroup and 0 disabled buttons; `1984년 봄`. |
| A-06 | Fixed | One `h1` per senior tab; health `headingLevel`; no `skipped-heading`. |
| A-07 | Fixed | No `em-dash-overuse`. One `'—'` remains as the Director's model fallback (B2-12). |
| A-08 | Fixed | `.cp-family .cp-row` border is `--border-field`, with a `:focus-within` ring. |
| A-09 | Fixed | Trip speak button; reason printed once. |
| A-10 | Fixed | `seniorSmall` 0 everywhere; graph `large`. |
| A-11 | Fixed | `samplePopEscape`; first thumbnail focused; `pointerdown`. (Occlusion is a new item: A2-04.) |
| A-12 | Fixed | Decorative row avatars. |
| A-13 | Fixed | Fixed photo boxes; CLS ≤ 0.0015. |
| A-14 | Fixed | The confirmed-date artifact card shows only "기획서 열기". |
| A-15 | Fixed | 0 smooth-scroll calls under `reduce`. |
| A-16 | Fixed | `.cd-art-head` min 44 px; coarse rules. |
| A-17 | **Partial** | Palette and type are done. About 20 px spacing literals remain in A CSS, plus Avatar's inline px font size (A2-18). |
| A-18 | Fixed | axe: 0 violations in A-owned states. ItineraryCard tabs use roving arrows (no Home/End: A2-18). |
| A-19 | Fixed | "자동 안내" / "기본 응답". |
| A-20 | Fixed | Visible "예시" label on a 56 px button. |
| A-21 | Fixed (code) | ≤ 4 slots plus "다른 시간 더 보기" when unanswered. Not observable in the settled (answered) state. |
| A-22 | Fixed | Help sheet replaces the gear; focus flow passes. |
| A-23 | Fixed | Dead selectors gone; all `:hover` rules guarded. |
| A-24 | Fixed | Static `[]`. |
| A-25 | Fixed | `toasts === 1` on senior; senior-sized toasts above the composer. |
| A-26 | Fixed | Alternatives are chips; nothing clipped. |
| B-01 | **Partial** | "우리 가족" fits at 320, 360 and 390 px. **New truncation at 900–1180 px with a panel open, and in side rooms on phones** (B2-01). |
| B-02 | Fixed | `PanelSheet` dialog using `useModal`. |
| B-03 | Fixed | `headingLevel={3}`. |
| B-04 | Fixed | Achromatic; stats in the label; `.dc-keyerr`; graph moves below the phones when columns would shrink them. (Strip legibility is a new item: B2-07.) |
| B-05 | Fixed | Persona `aria-pressed` rows; more menu has no `mouseleave`; Escape returns focus to the trigger. |
| B-06 | Fixed | Coarse floor; `.ap-check-hit`; `.fam-search` border. (Residual P3 in B2-12.) |
| B-07 | Fixed | 10 JS chunks; `/senior` loads no Director chunk. |
| B-08 | Fixed | One toast region. |
| B-09 | Fixed | "연결이 잠시 끊겼어요." + 다시 연결 + 다른 가족으로 들어가기. |
| B-10 | Fixed | Director `h1`. |
| B-11 | **Partial** | Tokens in place. `var(--text-title, 20px)` fallbacks and Director px spacing literals remain (B2-13). |
| B-12 | Fixed | `fam-slide` fades under `reduce`. |
| B-13 | Fixed | `.fam-contacts-empty`; badge de-duplicated. |
| B-14 | Fixed | Three example asks in 더 보기. |
| B-15 | Fixed | Roving tabs plus arrows, Home and End. |
| B-16 | Fixed | `applyTheme()` in the Director. |
| B-17 | Fixed | All `:hover` rules guarded. |
| S-01 | Fixed | br/gzip plus `immutable`; photos `86400`; HTML `no-cache`. |
| S-02 | Fixed | No "—" in user-facing server strings. |

---

## 7. Critique (Nielsen, cognitive load, emotional journey, personas)

### 7.1 Design Health Score

| # | Heuristic | R1 | **R2** | Key issue |
|---|-----------|----|--------|-----------|
| 1 | Visibility of System Status | 3 | **3** | Typing, connection status, action spinners, one outcome sentence per decided card, a live "누가 방금 수정", and poll counts. **But** the answered schedule card still says "가능한 시간을 모두 골라 주세요" over six filled pills (the last thing on the senior's screen in the demo). On partially decided cards (itinerary), the chosen action is a greyed, disabled button with a check. |
| 2 | Match System / Real World | 3 | **3** | Warm 해요체 throughout. Family still sees "기본 응답" under almost every Tachi message, "모델 · 데모 브레인", "기억 그래프 · 노드 36 · 관계 43" and "기술 정보 보기". The senior tab is "설정" but the screen is "가족에게 보여주기". |
| 3 | User Control and Freedom | 3 | **3** | Escape and focus return everywhere, revisable visibility, stop for speak and mic. **But** the album-sheet visibility control is collapsed (A2-01), a schedule answer cannot be revised, and deleted tasks have no undo. |
| 4 | Consistency and Standards | 3 | **3** | One Segmented, one modal hook for sheets. But `Dialog.tsx` is a second focus-trap implementation with different behaviour; "어머니 / 어머님" mix in family chrome; disabled-checked buttons beside outcome sentences; a "1박 2일" badge repeats the title. |
| 5 | Error Prevention | 3 | **3** | The stale scheduling CTA is gone; privacy by default; previewed privacy. "모두 어려워요" sends an irreversible empty answer in one tap, right next to "보내기"; task × deletes instantly. |
| 6 | Recognition Rather Than Recall | 3 | **3** | Labelled senior controls, help sheet, chips, example asks. On phones, the family header shows **icon-only** 초대 (user-plus) and 어머니 소식 (heart-handshake), and the second is not recognisable as "mom's news", the family's main entry point. |
| 7 | Flexibility and Efficiency | 3 | **3** | Text, voice, chips, Enter-to-send, Director keys. Family has no accelerators; fine by design. |
| 8 | Aesthetic and Minimalist Design | 3 | **3** | Much calmer: speak buttons outside the text, contained photos, a compact health card, one decision line. Remaining weight: six black 56 px pills on the answered card; provenance lines under every family Tachi message; a duplicate badge; the illegible graph strip at 1024. |
| 9 | Error Recovery | 3 | **3** | Senior and family reconnect copy is excellent, and photo and mic errors are specific. Card-action failures still say only "다시 시도해 주세요", without what failed. |
| 10 | Help and Documentation | 2 | **3** | The senior help sheet is exactly right. Family example asks exist but are buried in "더 보기" under the participant list; new rooms have no example asks in their empty state. |
| **Total** | | **29** | **30/40** | **Good** |

### 7.2 Design specificity verdict
- **LLM assessment.** The product is still unmistakably authored: photos first, the senior spoken to rather than administered, privacy as reassurance, and a graph that is legible as shapes. Round 2 fixed the round-1 emotional peak: names wrap, there is one sentence ("가족도 볼 수 있어요"), and one switch. The remaining interchangeable moments are the family phone header (four icon-only buttons, the generic chat shape) and the answered schedule card (a form receipt).
- **Deterministic scan.** Clean on everything the round-1 DoD measured (settled). The detector caught what review alone would miss: the popover and menu occlusion, the 200 % padding, the help-sheet ladder, and the mid-flow pulse and contrast. It also produced one false positive (a scroll-clipped headline overhang). It missed the collapsed Segmented and the header collapse; axe and geometry probes caught those.
- **Visual overlays:** none user-visible. The detector was injected headlessly with `autoScan:false`; there is no `[Human]` tab.

### 7.3 Overall impression
Calm and trustworthy, and noticeably more finished than round 1. The single biggest opportunity: **finish the edges of the flows the demo shows.** That means the scheduling beat (poll contrast, side-room header, answered card) and the memory sheet's privacy control. These are the moments the audience and 순자 actually see.

### 7.4 What's working
1. **Overlays are now one behaviour.** Every sheet moves focus in, traps it, closes on Escape and returns focus; the senior help sheet uses the same pattern.
2. **Text scaling is real.** A senior who sets 200 % text gets 40 px body copy, and the layouts mostly reflow instead of clipping.
3. **The memory card peak** now reads as a moment: full names, "1984년 봄", one sentence, one switch.

### 7.5 Priority issues
- **[P1] Memory-sheet privacy control collapsed** (A2-01).
  - *Why:* the senior cannot see or change who sees a memory from her album; keyboard focus lands on an invisible element.
  - *Fix:* `flex-shrink: 0`.
  - *Command:* `harden`.
- **[P1] The scheduling beat breaks on screen** (B2-01, B2-02, A2-09).
  - *Why:* in the Director's third phone, the header is truncated and the "가족방으로" pill wraps to 3 lines; the artifact panel's waiting list fails AA; the answered card keeps asking.
  - *Fix:* the header container rules, solid poll text, and an answered-state summary.
  - *Command:* `polish`.
- **[P1] Header collapse at tablet and small-laptop widths** (B2-01).
  - *Why:* 1024 px with the panel open shows "우…" and stacked syllables.
  - *Command:* `polish`.
- **[P2] Focus stability in dialogs and panels** (B2-03, B2-04).
  - *Why:* focus jumps to the autofocus field whenever the parent re-renders (once per second in the Director during a run); Escape in the desktop panel loses focus.
  - *Command:* `harden`.
- **[P2] Family phone header is icon-only** (B2-08).
  - *Why:* "어머니 소식" is the family's main entry point and a heart-handshake glyph doesn't say it.
  - *Command:* `clarify`.

### 7.6 Cognitive load
The checklist has **0 failures**:
- Senior chat shows 9 controls in two groups: the composer has 4 input modes (photo, sample, voice, text; send stays disabled until there is text), and the tabs are separate.
- The senior schedule card shows ≤ 4 slots before "더 보기".
- The family composer has 3 actions.
- The Director rail is long, but it is an operator tool with chunked sections.

### 7.7 Emotional journey
- **Peak:** fixed and strong (memory card, then share, then the family reacts).
- **End:** the 21:00 report is warm. (Small slip: yesterday's report still labels mood "오늘 기분", A2-16.)
- **Valleys:**
  - the answered schedule card at the end of the senior flow: six heavy pills, the instruction still asking, and no word on who received it;
  - the minjun side-chat header in the Director;
  - waiting for Tachi, softened by "타치가 생각하고 있어요".
- **Reassurance gap:** "보냈어요 · 6개 선택" doesn't say it went to the family's scheduling (A2-09).

### 7.8 Persona red flags
- **순자 (78, presbyopia, first app):**
  - the album sheet's 공개 범위 control is a grey hairline;
  - at 320 px the input hint reads "타치에게 말ㅎ";
  - the read-aloud glyph is a pale 18 px icon inside its 56 px target;
  - graph edges are almost invisible (1.41:1);
  - "점을 눌러 끌어 보세요" still asks her to drag 14–18 px nodes;
  - at 200 % text, album titles are cut after two lines.
- **Sam (screen reader / keyboard):**
  - focus jumps inside the invite, memory-detail and Director dialogs whenever data arrives;
  - Escape in the desktop side panel drops focus to the page top;
  - the narrow room list has no `main` and no `h1`;
  - `aria-label` on a plain `span` makes the unread count announce as a bare number;
  - the family thread has two consecutive sr-only `h2`s ("대화", "대화 내용").
- **Casey (family, phone):**
  - a side-room header reads "일정 조율 · 어…" and the 가족방으로 pill wraps to three lines;
  - the heart-handshake icon is ambiguous;
  - at 320 px the composer hint wraps into a clipped second line;
  - "더 보기" hides the example asks.
- **Mina (iPad landscape, 1024 px):** opening the plan panel turns the room title into "우…" and the header labels into syllable stacks.

### 7.9 Minor observations
- `ActionBar` declares a `senior` prop that no caller passes (the `.ml-senior .ml-retry` CSS covers it).
- `aria-hidden={false}` on the typing row.
- `.ap-poll-st` uses a `Check` with `aria-label` inside a `span`.
- The Director recall path shows raw `TAKEN_AT`.
- Modal entry points: senior sheets use `useModal`, family dialogs use their own `Dialog`; unify them (B2-03).

### 7.10 Questions to consider
- Could the answered schedule card collapse to a single line ("일요일 점심 외 2개를 보냈어요")?
- Does the family phone need four header actions, or could 초대 move into 더 보기?
- Should Tachi's typing state be a spinner, consistent with every other "working" state, instead of three pulsing dots?

---

## 8. Fix List (grouped by file ownership)

**Conventions:**
- Keep the achromatic palette and system fonts.
- Use tokens only, never new hex values.
- Run `npm run typecheck` after each group.
- At the end, run `npm run build`; the orchestrator restarts `:4100` before verification (§9).

**Order and dependencies:**
1. **C** first.
2. **A** and **B** in parallel, with one dependency: **A2-11 → B2-07** (`labelMode`).
3. Housekeeping last.

### Group C: `web/src/styles/**`, `web/index.html`

**C2-01 [P2] Responsive and Integrity, detector `cramped-padding` at 200 % text: badge padding in em**
- **File:** `web/src/styles/base.css`.
- **Change:** in `.badge`, replace `padding: 1px var(--space-6);` with `padding: 0.125em 0.5em;`.
- **Verify:**
  - `verify-r2.cjs 'family-text200'` has no `cramped-padding`;
  - at the default size `.badge` computes `1.5px 6px` (visually unchanged).

**C2-02 [P2] Integrity, detector `icon-tile-stack` at 200 % text: icon buttons without a phantom border**
- **File:** `base.css`.
- **Change:** in `.btn-icon`, add `border: 0;`. The 1 px transparent border inherited from `.btn` counts as a "tile" and also draws a hover border on ghost icon buttons.
- **Verify:**
  - `family-text200-embed` reports 0 findings once B2-01 is in (validated);
  - `.btn-icon` computed `border-top-width` is `0px`;
  - sizes are unchanged (`box-sizing: border-box`, fixed width and min-height).

### Group A: `web/src/components/**` + `web/src/pages/senior/**`

**A2-01 [P1] Accessibility 2.4.7 / 2.5.8, Integrity: the memory-sheet radiogroup collapses to 2 px**
- **Files:** `components/common/common.css`, `pages/senior/senior.css`.
- **Change:**
  1. In `common.css`, add `flex-shrink: 0;` to the `.seg { … }` rule. `overflow:hidden` makes its flex `min-height:auto` resolve to 0.
  2. In `senior.css`, add `.sa-sheet-body > * { flex-shrink: 0; }`.
- **Verify:**
  - `document.querySelector('.sa-sheet .seg').getBoundingClientRect().height === 58` at 390×844, 390×664 and 1440×900 (today: 2);
  - `axe-run.cjs` `senior-sheet` reports 0 violations;
  - the screenshot shows 가족 공개 / 나만 보기 above "타치에게 이 이야기 다시 듣기".
  - Add a regression probe to `verify-r2.cjs`: every `[role=radiogroup]` must have `height ≥ 40`.

**A2-02 [P2] Responsive (1.4.4 / 1.4.10): senior input hint clipped (390 by 3 px, visible in the Director; 320; 200 % text)**
- **Files:** `pages/senior/SeniorChat.tsx`, `components/chat/Composer.tsx`, `components/chat/Composer.css`.
- **Change:**
  1. In `SeniorChat.tsx`, `placeholder="말씀해 보세요"`. In `Composer.tsx`, the senior fallback `'타치에게 말해 보세요'` becomes `'말씀해 보세요'` (the listening text `'듣고 있어요…'` stays).
  2. In `Composer.css`:
     - in `.cp-input`, `padding: 0 var(--space-20)` becomes `padding: 0 var(--space-16)`;
     - add:
       ```css
       .cp-senior { container-type: inline-size; }
       @media (min-height: 481px) {
         @container (max-width: 15em) {
           .cp-senior .cp-row { flex-wrap: wrap; }
           .cp-senior .cp-input { order: -1; flex: 1 1 100%; }
           .cp-senior .cp-send { margin-left: auto; }
         }
       }
       ```
     The `em` resolves against `.cp-senior` (20 px, so 300 px of content box, or 600 px at 200 % text). The `min-height` guard keeps the short-screen single row.
- **Verify** (canvas-measure placeholder width against content width; validated):

  | State | Placeholder / available |
  |---|---|
  | `senior-chat` | 126/196 |
  | `senior-320` | 126/254 (input on its own row, thread 303 px) |
  | `senior-text200-chat` | 251/324 |
  | `senior-320x256` | thread 77 px (unchanged; 62 px input accepted) |
  | `senior-landscape` | thread 211 px |

  In the Director screenshot the senior hint is not clipped.

**A2-03 [P2] Responsive: family composer hint wraps and clips at ≤ 340 px**
- **File:** `components/chat/Composer.css`.
- **Change:**
  ```css
  .cp-family { container-type: inline-size; }
  @container (max-width: 340px) { .cp-family .btn-icon[aria-controls="cp-samples"] { display: none; } }
  ```
  Sample photos remain available on wider screens; the photo button stays.
- **Verify** (validated): `family-320` placeholder 101/138; `family-920-artifact` 101/110; textarea has 1 line, no clipping.

**A2-04 [P2] Integrity, detector `text-occlusion` (`div.cp-pop`): pin the sample-photo popover**
- **Files:** `components/chat/Composer.tsx`, `Composer.css`.
- **Change:**
  1. `const [popStyle, setPopStyle] = useState<React.CSSProperties | undefined>();`
  2. Add:
     ```tsx
     useLayoutEffect(() => {
       if (!popOpen) return;
       const place = () => { const r = popRef.current?.getBoundingClientRect(); if (r) setPopStyle({ left: r.left, right: window.innerWidth - r.right, bottom: window.innerHeight - r.top + 8 }); };
       place(); window.addEventListener('resize', place);
       return () => window.removeEventListener('resize', place);
     }, [popOpen]);
     ```
     `popRef` is already `.cp-photo-row` (senior) or `.cp-row` (family).
  3. Pass `style={popStyle}` on `.cp-pop`.
  4. In CSS, `.cp-pop` changes `position: absolute; bottom: calc(100% + 8px); left: 0; right: 0;` to `position: fixed;` (keep z-index and visuals).
- **Verify:**
  - `senior-samples` reports 0 findings (validated);
  - the popover sits 8 px above the photo row at 390 and 1440;
  - Escape and focus behaviour are unchanged (`samplePopEscape`).

**A2-05 [P2] Accessibility 1.4.11: graph edges and the "기록 없음" dot**
- **Files:** `components/graph/MemoryGraph.css`, `components/health/HealthSummaryView.css`.
- **Change:**
  - `.mg-edge { stroke: var(--border-field); }` (was `--border-strong`; 3.23:1 white, 3.07:1 mist, 4.98:1 / 5.54:1 dark);
  - keep `.mg-edge-on` / `.mg-edge-hi` darker as they are;
  - `.hs-dot-none { border: 1px dashed var(--text-3); }`, deleting `opacity: .6`.
- **Verify:** computed `stroke` is `rgb(143, 143, 143)` in both themes; the contrast probe (edge against `.mg` background) gives ≥ 3:1; detector stays clean.

**A2-06 [P2] Integrity `flat-type-hierarchy` (help sheet open): sheet titles at the heading step**
- **File:** `pages/senior/senior.css`.
- **Change:** `.sa-sheet-t { font-size: var(--senior-heading); }` (was `--senior-title`). The ladder becomes 17 → 20 → 28.
- **Verify:** `senior-help`, `senior-help-dark` and `senior-help-320x256` report 0 findings (validated); the memory sheet title wraps cleanly (screenshot).

**A2-07 [P2] Responsive and Integrity, detector `cramped-padding` at 200 % text: bubble padding scales**
- **File:** `components/chat/MessageList.css`.
- **Change:** `.ml-bubble { padding: max(var(--space-8), .4em) max(var(--space-16), .6em); }`. This is identical at 16 and 20 px; at 40 px it becomes 16/24.
- **Verify:** `senior-text200-chat` reports 0 findings (validated); the default screenshots are pixel-identical in bubble size.

**A2-08 [P2] Responsive 1.4.4: album titles at 200 % text**
- **File:** `pages/senior/senior.css`.
- **Change:** `.sa-grid { grid-template-columns: repeat(auto-fill, minmax(min(100%, 7em), 1fr)); }`. That is 2 columns at 320 and 390 by default, 1 column at 200 % text.
- **Verify:**
  - `senior-text200-album` has no clipped `.mt-title` (`scrollHeight <= clientHeight + 2`);
  - `senior-album` and `senior-album-320` still have 2 columns (validated).

**A2-09 [P2] H1 / H8 / emotional journey: the answered schedule card stops asking**
- **Files:** `components/cards/GatheringCards.tsx` (`ScheduleRequestCard`), `cards.css`.
- **Change:**
  1. Render `<p className="cd-meta">가능한 시간을 모두 골라 주세요</p>` and the `.cd-slots` block **only when `!answered`**.
  2. When `answered`, render:
     ```tsx
     {chosen.length > 0 && <ul className="cd-chosen" aria-label="보낸 시간">{p.slots.filter(s => chosen.includes(s.id)).map(s => <li key={s.id}><Check size={14} aria-hidden />{s.label}</li>)}</ul>}
     <p className="cd-cap" role="status"><Check size={13} aria-hidden /> {chosen.length === 0 ? '이번엔 모두 어렵다고 전했어요' : `가족 일정 조율에 보냈어요 · ${chosen.length}개`}</p>
     ```
  3. CSS:
     ```css
     .cd-chosen { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-4); font-size: var(--text-caption); }
     .cd-chosen li { display: flex; align-items: center; gap: var(--space-6); }
     .senior .cd-chosen { font-size: var(--senior-body); }
     ```
- **Verify:**
  - an answered card (senior thread, minjun side room) contains 0 `button`s and no "가능한 시간을" text;
  - the senior card height drops from about 480 px to ≤ 300 px (screenshot);
  - the unanswered card is unchanged (≤ 4 chips plus 더 보기).

**A2-10 [P2] H1 / H4 / H9: partial decisions become sentences; failures name the action**
- **File:** `components/chat/ActionBar.tsx`.
- **Change:**
  1. After the all-done branch: `const doneActs = actions.filter(a => a.done); const pending = actions.filter(a => !a.done);`. Render `doneActs.map(a => <p key={a.id} className="ml-result" role="status"><Check size={16} aria-hidden />{RESULT[a.id] ?? `${a.label} 완료`}</p>)`, then buttons for `pending` only. **Never render a disabled button with a check.**
  2. Failure copy: `const failedAct = actions.find(a => !a.done && phase[a.id] === 'failed');` and `{failedAct && <p className="ml-retry" role="alert">‘{failedAct.label}’을 보내지 못했어요. 다시 눌러 주세요.</p>}`.
  3. Remove the unused `senior` prop.
- **Verify:**
  - the senior itinerary card shows "✓ 가족과 함께 가기로 했어요" plus one "가족에게 보내기" button;
  - across the 35 states, `document.querySelectorAll('.ml-actions button:disabled svg.lucide-check').length === 0`.

**A2-11 [P2] (dependency of B2-07) MemoryGraph `labelMode`**
- **File:** `components/graph/MemoryGraph.tsx`.
- **Change:**
  1. Add prop `labelMode?: 'all' | 'focus'` (default `'all'`).
  2. In the node label IIFE, after `if (compact && isMem) …`, add `if (labelMode === 'focus' && !isMem && !hi && hover !== n.id) return <title>{n.name}</title>;`. In focus mode only memory nodes, highlighted (fresh) nodes and the hovered node carry labels.
- **Verify:** with B2-07, overlapping `.mg-label` bounding-box pairs in `demo-1024-graph` go from 50 to 0 (validated by CSS emulation).

**A2-12 [P3] Integrity `pulsing-dot` (live typing): one "working" indicator**
- **Files:** `components/chat/MessageList.tsx`, `MessageList.css`.
- **Change:**
  - replace `<i /><i /><i />` in `.ml-typing` with `<Loader2 size={senior ? 18 : 14} className="ml-spin" aria-hidden />` (import from lucide);
  - delete the `.ml-typing i` rules;
  - remove `aria-hidden={false}` from the typing row.
  - The spinner already stops under reduced motion (`.ml-spin { animation: none }`).
- **Verify:** during a Director step (Tachi typing), the detector reports no `pulsing-dot` on `/senior` or `/family`.

**A2-13 [P3] Senior graph touch (2.5.8) and copy**
- **Files:** `MemoryGraph.tsx`, `pages/senior/MemoryAlbum.tsx`.
- **Change:**
  - when `interactive && large`, render `<circle r={16} className="mg-hit" />` as the first child of each node `<g>`, with CSS `.mg-hit { fill: transparent; }`;
  - in MemoryAlbum, the copy becomes "점을 누르면 이름이 크게 보여요. 끌어서 옮길 수도 있어요.".
- **Verify:** each node's hit box is ≥ 32×32 (`getBBox`); there is no visual change.

**A2-14 [P3] Performance: downscale photos before upload**
- **File:** `components/chat/Composer.tsx` (`onFile`).
- **Change:** before `tachi.sendPhoto`, if `f.type` is `image/jpeg|png|webp` and it is larger than 600 KB:
  ```ts
  const bmp = await createImageBitmap(f);
  const s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/jpeg', 0.85));
  // send blob ?? f
  ```
  Wrap it in try/catch and fall back to the original file.
- **Verify:** uploading a 4000×3000 test JPEG posts ≤ 600 KB; the demo photos (110 KB) go through untouched.

**A2-15 [P3] H4: recall card offers the full story**
- **File:** `cards/MemoryCards.tsx` (`RecallCard`).
- **Change:** keep the 2-line excerpt. When `m.story.length > 110`, append `<details className="cd-disc"><summary>이야기 보기</summary><blockquote className="cd-story">“{m.story}”</blockquote></details>`, the same pattern as MemoryCard.
- **Verify:** the full story is reachable in the senior and family recall cards.

**A2-16 [P3] Copy and minimalism nits (A files)**
- **Changes:**
  1. `TripCards.tsx`: render the duration badge only when `!p.title.includes(p.durationLabel)`.
  2. `MiscCards.tsx` `ReportCard`: label `오늘 기분` becomes `기분`.
  3. `MemoryCards.tsx` `ShareCard`: `어머님이 공유한 추억` becomes `어머니가 공유한 추억` (family chrome uses "어머니").
  4. `MessageList.tsx` `ModelLine`: render it inside the `.ml-name` row after the time (`· 기본 응답`) instead of as a separate line under the content. Keep it when `!head`.
- **Verify:** strings are present or absent as described; the family thread is about one line shorter per Tachi message.

**A2-17 [P3] Senior read-aloud glyph legibility**
- **File:** `components/common/common.css`.
- **Change:** `.senior .speak-btn svg { width: 24px; height: 24px; } .senior .speak-btn { color: var(--text); }`.
- **Verify:** the glyph is 24 px and ink-coloured; the button is still 56×56; `speakLineRhythm.ok` is still true.

**A2-18 [P3] Token hygiene (A files)**
- **Change:**
  - replace on-scale px literals with tokens: `2px` → `--space-2`, `4px` → `--space-4`, `6px` → `--space-6`, `12px` → `--space-12`;
  - snap off-scale values: `.senior .cd { padding: 18px }` → `var(--space-16)`; `.ml-senior .ml-chips .chip { padding: 0 18px }` → `0 var(--space-16)`; `.cd-travel` `gap: 5px` → `var(--space-6)`; `.ml-new` `padding: 0 14px` → `0 var(--space-12)`; `.sa-help svg` `margin-top: 5px` → `var(--space-4)`;
  - ItineraryCard tabs: add Home and End.
- **Verify:** `grep -rnoE "(padding|margin|gap)(-[a-z]+)?: *[^;]*\b([2-9]|[1-9][0-9])px" web/src/components web/src/pages/senior --include=*.css | grep -v "var(--"` lists only the documented negative optical margins (`.ml-tools`, `.senior .cd .speak-btn`).

### Group B: `web/src/pages/family/**`, `web/src/pages/demo/**`, `web/src/pages/Landing.tsx`, `web/src/App.tsx`

**B2-01 [P1] Responsive / H8: the family header never collapses (900–1180 px with a panel open; side rooms on phones; 200 % text)**
- **Files:** `pages/family/FamilyApp.tsx`, `FamilyApp.css`.
- **Change (TSX):**
  ```tsx
  const SIDE_PREFIX = '일정 조율 · ';
  const fullTitle = room?.title ?? '대화방';
  const kicker = room?.type === 'side' && fullTitle.startsWith(SIDE_PREFIX) ? '일정 조율' : null;
  const name = kicker ? fullTitle.slice(SIDE_PREFIX.length) : fullTitle;
  …
  <h1 className="fam-head-title" title={fullTitle}>{kicker && <span className="fam-head-kicker">{kicker}</span>}<span className="fam-head-name">{name}</span></h1>
  ```
  On the side-room button, add `aria-label="가족방으로"` and change its `<span>가족방으로</span>` to `<span className="fam-head-label">가족방으로</span>`.
- **Change (CSS):**
  1. Replace the `.fam-head-title` rule with:
     ```css
     .fam-head-title { display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; font-size: var(--text-title); line-height: 1.3; font-weight: var(--weight-semibold); }
     ```
     This deletes `white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:0 1 auto`.
  2. Add:
     ```css
     .fam-head-kicker { font-size: var(--text-micro); font-weight: var(--weight-medium); color: var(--text-2); line-height: 1.3; }
     .fam-head-name { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; overflow-wrap: anywhere; }
     .fam-main { container: fammain / inline-size; }
     .fam-head-btn { white-space: nowrap; flex: none; }
     @container fammain (max-width: 639px) { .fam-head-label, .fam-stack { display: none; } }
     ```
  3. Change `.fam-spacer` to `flex: 0 0 0`, or delete the element.
  4. Delete `@media (max-width: 599px) { .fam-stack { display: none; } }`, and delete `.fam-head-label { display: none; }` from the 899 px block. The container rule replaces both.
- **Verify** (validated):

  | State | Expected |
  |---|---|
  | `family-920-artifact` | title 96 px, no truncation |
  | `family-1024-artifact` | 200 px |
  | `family-1440` | labels visible |
  | `family-390-side` | kicker plus 2-line name 169×52, `scrollHeight <= clientHeight` |
  | `family-320-side` | 136×52 |
  | `family-text200-embed` | "우리 / 가족", 0 findings with C2-02 |

  In every state `.fam-head-btn` is 44 px tall and no label wraps. Extend the harness `titleTruncated` check to `.fam-head-name` with `scrollHeight > clientHeight + 1 || scrollWidth > clientWidth + 1`.

**B2-02 [P1] Accessibility 1.4.3, detector `low-contrast` (mid-flow): poll participants at full contrast**
- **Files:** `pages/family/ArtifactPanel.tsx`, `ArtifactPanel.css`.
- **Change:**
  - delete `opacity: .55` from `.ap-poll-p` and delete the `.ap-poll-p.is-in { opacity: 1; }` rule;
  - in the TSX, `<Avatar user={u} size={28} hollow={!ok} />`; the waiting status becomes `<span className="ap-poll-st muted">대기</span>` (`--text-2`);
  - replace `<Check … aria-label="응답함" />` with `<Check size={12} strokeWidth={2} aria-hidden /><span className="sr-only">응답함</span>`.
- **Verify:**
  - during the scheduling beat (any Director run between `schedule` and `closePoll`, or a seeded open poll), `family-embed-artifact` and `family-desktop-artifact` report 0 detector findings and 0 contrast failures;
  - statically: `.ap-poll-p` computed `opacity` is `1`.

**B2-03 [P2] Accessibility 2.4.3: one modal implementation (focus no longer jumps on re-render)**
- **File:** `pages/family/Dialog.tsx`.
- **Change:**
  - delete the custom `useEffect` (it depends on `onClose`, a fresh arrow on every parent render);
  - `import { useModal } from '../../components/common/useModal';` and call `useModal(ref, onClose);`;
  - keep the markup (`role="dialog" aria-modal tabIndex={-1}`), and add `aria-hidden` to the scrim `div`.
- **Verify:**
  - `verify-r2.cjs behaviour` gives `dialogRerender.stable === true` (focus stays on the contact's 초대 button across the 1000 → 800 px resize);
  - `inviteDialog` and `memoryDetail` checks still pass;
  - during a Director run, the reset dialog keeps focus on 취소 for 5 s.

**B2-04 [P2] Accessibility 2.4.3: desktop side panel returns focus on close**
- **File:** `FamilyApp.tsx`.
- **Change:**
  1. `const panelOpener = useRef<HTMLElement | null>(null);`
  2. Wrap every open: `const openPanel = (p: Panel) => { panelOpener.current = document.activeElement as HTMLElement; setPanel(p); };`. Use it in `togglePanel`, `onOpenArtifact` and similar.
  3. `const closePanel = () => { const inside = !!document.activeElement?.closest('.fam-panel, .fam-sheet'); setPanel(null); if (inside) requestAnimationFrame(() => panelOpener.current?.focus({ preventScroll: true })); };`
  4. Use `closePanel` in the Escape effect, the panel close button, and the toggle-off path. `PanelSheet` keeps `useModal`.
- **Verify:** `verify-r2.cjs behaviour` gives `desktopPanel.focusAfterEscape === 'button.cd-art-head'` (today `body`).

**B2-05 [P2] Integrity, detector `text-occlusion` (`div.fam-more-menu`): pin the 더 보기 menu**
- **Files:** `FamilyApp.tsx`, `FamilyApp.css`.
- **Change:**
  1. In the "더 보기" effect, on open compute `const r = moreBtn.current!.getBoundingClientRect(); setMenuPos({ top: r.bottom + 4, right: window.innerWidth - r.right });`, add a `resize` listener that closes the menu, and render `style={menuPos ?? undefined}` on `.fam-more-menu`.
  2. CSS: `.fam-more-menu { position: fixed; max-height: calc(100dvh - 64px); overflow-y: auto; }`. It overrides `.fam-menu`'s absolute; keep `right`.
  3. Optional, for consistency: the same treatment for `#fam-persona-menu` in `Sidebar.tsx`.
- **Verify:** `family-390-more` and `family-desktop-more` report 0 findings (validated); the menu sits under the button at 390, 1024 with a panel open, and 1440; `moreMenu` behaviour still passes.

**B2-06 [P2] Accessibility (axe `landmark-one-main`, `page-has-heading-one`): narrow room list**
- **File:** `pages/family/Sidebar.tsx`.
- **Change:** `const Root = full ? 'main' : 'aside';`, render `<Root className=… aria-label="대화방 목록">`, and add `{full && <h1 className="sr-only">대화방 목록</h1>}` as its first child.
- **Verify:**
  - `axe-run.cjs` `family-list` reports 0 violations;
  - `verify-design.cjs` `family-list-390` and `family-zoom200` report `h1=1`;
  - desktop still has one `main` (the chat) and an `aside` sidebar.

**B2-07 [P2] Responsive / H8: Director graph strip legible at < 1100 px** (needs A2-11)
- **Files:** `pages/demo/DirectorConsole.tsx`, `DirectorConsole.css`.
- **Change:**
  - pass `labelMode={graphBelow ? 'focus' : 'all'}` to `<MemoryGraph>` in `graphSection`;
  - CSS: in `.dc-graph.is-below .dc-graph-box`, `grid-template-columns: minmax(0, 3fr) minmax(0, 2fr)`.
- **Verify:** in `demo-1024-graph` and `demo-1024-graph-dark`, overlapping visible `.dc-graph .mg-label` bounding-box pairs = 0 (50 today; validated by emulation). The 1280 and 1440 three-column layouts are unchanged.

**B2-08 [P2] H6 Recognition: the phone header says what its icons do**
- **Files:** `FamilyApp.tsx`, `FamilyApp.css`.
- **Change:**
  1. After each `.fam-head-label`, add `<span className="fam-head-short" aria-hidden>…</span>` with: 초대 → `초대`; 어머니 소식 → `어머니`; side room → `가족방`.
  2. The "더 보기" trigger becomes `className="btn btn-ghost fam-head-btn"` with `<MoreHorizontal …/><span className="fam-head-short" aria-hidden>더 보기</span>` (keep `aria-label`).
  3. CSS:
     ```css
     .fam-head-short { display: none; }
     @container fammain (max-width: 639px) {
       .fam-head-short { display: block; font-size: var(--text-micro); line-height: 1.2; color: var(--text-2); }
       .fam-head-btn { flex-direction: column; gap: var(--space-2); padding: 0 var(--space-4); min-width: 44px; }
     }
     ```
- **Verify:**
  - at 390 and 320 (embedded and narrow): each header button is ≤ 48 px wide and 44 px tall, with the micro label visible;
  - B2-01's title checks still pass (side-room name ≤ 2 lines);
  - the accessible names are unchanged.

**B2-09 [P3] Accessibility 4.1.2: no `aria-label` on generic elements**
- **Files:** `DirectorConsole.tsx`, `Sidebar.tsx`.
- **Change:**
  - `<div className="dc-recall" aria-label="회상 근거">` becomes `<section className="dc-recall" aria-label="회상 근거">`;
  - `.fam-unread`: `<span className="fam-unread"><span aria-hidden>{n}</span><span className="sr-only">읽지 않은 메시지 {n}개</span></span>`;
  - Director skipped step: `<span aria-hidden>–</span><span className="sr-only">건너뜀</span>`.
- **Verify:** `axe-run.cjs` `demo-graph` has an empty incomplete `aria-prohibited-attr` list.

**B2-10 [P3] Accessibility 2.1.4 / 2.4.3: Director keyboard model**
- **File:** `DirectorConsole.tsx`.
- **Change:**
  1. Global handler: return early if `t?.closest('button, a, [role=switch]')` and the key is `' '`; the reset shortcut becomes `e.key === 'R' && e.shiftKey`; update the `.dc-keys` text to `Shift+R 처음부터 재생`.
  2. Step button: `onClick={e => { runStep(i); if (e.detail > 0) e.currentTarget.blur(); }}`. This blurs only after mouse clicks.
- **Verify:**
  - Tab to step 1, press Enter: focus stays on that button;
  - pressing Space on "자동 진행" toggles only auto-run;
  - plain `r` does nothing.

**B2-11 [P3] H2: Director recall path in words**
- **File:** `DirectorConsole.tsx`.
- **Change:** map `recall.path.edges[i].type` through `{ TAKEN_AT: '장소', APPEARS_IN: '등장', IN_ERA: '시기', ABOUT: '관련', EVOKES: '떠올림', MENTIONS: '언급', FAMILY_OF: '가족' }`, falling back to the raw value. The Cypher block stays technical.
- **Verify:** "TAKEN_AT" is absent from `.dc-chips`.

**B2-12 [P3] Family copy and small hygiene**
- **Files:** `MomPanel.tsx`, `FamilyApp.tsx`, `ArtifactPanel.css`, `DirectorConsole.tsx`.
- **Change:**
  1. Graph heading `· 노드 {n} · 관계 {m}` becomes `· 연결 {edges.length}개`.
  2. MomPanel sentences "어머님이 …" become "어머니가 …" / "어머니께서 …" (consistent with the "어머니 소식" chrome).
  3. Delete FamilyApp's `<h2 className="sr-only">대화</h2>`; MessageList already renders "대화 내용".
  4. `.ap-addtask .btn-icon { flex: none; }`, so the button stays 44 px under coarse pointer.
  5. Director model fallback `'—'` becomes `'확인 중'`.
- **Verify:**
  - the grep strings are absent;
  - axe stays clean;
  - `coarse_artifact390` has no `button.btn-icon 38x44`.

**B2-13 [P3] Token hygiene (B files)**
- **Change:**
  - drop every `var(--token, fallback)` fallback in `FamilyApp.css`, `Dialog.css`, `ArtifactPanel.css`, `Landing.css` and `DirectorConsole.css`; the tokens exist;
  - replace px spacing literals with tokens: `.dc-stage padding: 24px` → `var(--space-24)`; `.dc-toggles top: 12px; right: 16px` → `var(--space-12)` / `var(--space-16)`; `.dc-frames margin-top: 20px` → `var(--space-20)`; `.dc-step padding: 5px …` → `var(--space-6) …`; `.ap-select padding: 2px` → `var(--space-2)`.
- **Verify:** `grep -rn "var(--[a-z-]*, " web/src/pages` returns nothing; the spacing grep (A2-18) is clean for B files.

### Group S: server
No server change is required for 20/20. (A2-14 does photo downscaling client-side. Do not change `/uploads` `no-store`; it protects photos that become private.)

### Housekeeping (orchestrator)
- **H-01:** delete the stray `/home/user/tachi/undefined/` (4 PNGs from a scratch script with an unset output directory).
- **H-02:** copy `verify-r2.cjs`, `patch-validate.cjs`, `axe-run.cjs` and `axe/package/axe.min.js` from `/tmp/claude-0/-home-user/843dcc6b-8a43-5bd6-a62f-d1e12218a988/scratchpad/r2/` into `docs/design/tools/` (adjust the `AXE` path). Add two probes to `verify-r2.cjs`:
  - every visible `[role=radiogroup]` must be ≥ 40 px tall;
  - `.fam-head-name` must not be clipped (see B2-01).

  Run states and behaviour separately: each takes about 8 minutes.

---

## 9. Definition of Done and How to Re-verify (round 3)

1. `npm run typecheck` and `npm run build` pass, and the orchestrator restarts `:4100`.
2. Static scan prints `[]` (exit 0):
   ```bash
   npx -y impeccable@4.8.1 detect --json web/src
   ```
3. CLI scans print `[]` on the same 7 URLs as in §4.2.
4. The round-1 matrix exits 0 **on a settled state**:
   ```bash
   cd <scratch> && npx -y impeccable@4.8.1 live-server --background
   NODE_PATH=$(npm root -g) node docs/design/tools/verify-design.cjs
   ```
5. The round-2 extension reports 0 detector findings and 0 hard failures in all 40 states (`node verify-r2.cjs .`). Behaviour (`node verify-r2.cjs behaviour`) must show every flow in §4.7 passing, including:
   - `dialogRerender.stable: true`;
   - `desktopPanel.focusAfterEscape` = the opener;
   - radiogroups ≥ 40 px.
6. axe reports 0 violations and no `aria-prohibited-attr` incomplete (`node axe-run.cjs`).
7. **Mid-flow pass.** The orchestrator's call, because it needs a Director run: start auto-run in `/demo?key=demo42`. After the `schedule` step (poll open) and during any Tachi typing, run `node verify-design.cjs 'artifact|senior-chat'`. It must report 0 findings: this covers B2-02 and A2-12.
8. Manual keyboard pass, as in round 1, plus:
   - in the Director, Tab to a step and press Enter: focus stays on it;
   - open the memory sheet, Tab to 공개 범위: the ring is visible on a 56 px segment.

**Expected scores after the full list:**

| Score | R1 | R2 | After §8 |
|---|---|---|---|
| Audit | 13/20 | 17/20 | **20/20** (A 4 · P 4 · T 4 · R 4 · I 4) |
| Nielsen | 29/40 | 30/40 | **≈ 35/40** |

The Nielsen projection comes from:
- H1 +1 (A2-09, A2-10);
- H4 +1 (B2-03, A2-10, A2-16, B2-12);
- H6 +1 (B2-08);
- H8 +1 (A2-09, A2-16, B2-07);
- H9 +1 (A2-10 failure copy).

H2, H3, H5, H7 and H10 need the optional items below.

### 9.1 Optional critique improvements (not needed for 20/20)
- **H3 (revise a schedule answer):**
  - `ScheduleRequestCard` gets a "다시 고르기" link while the poll is open;
  - the server must accept a second `pick_slots` from the same user before close (S + A).
- **H5:**
  - "모두 어려워요" asks once inline ("정말 모두 어려우세요?" with 네 / 아니요) before sending (A);
  - ArtifactPanel task × shows a 5 s "되돌리기" toast instead of deleting instantly (B; the server needs a restore action).
- **H2:**
  - the senior tab label "설정" becomes "공개 범위" (A, `SeniorApp.tsx`);
  - family hides `기술 정보 보기` unless `?debug=1` (A, `RecallCard`).
- **H10:**
  - show the three example asks as tappable chips in the empty state of a new room and under the first Tachi greeting (B `FamilyApp`, A `MessageList` `emptyHint`), not only in 더 보기.

---

## 10. Questions for the User (relay)
1. **Senior input hint:** change "타치에게 말해 보세요" to "말씀해 보세요" so it fits 320 px and 200 % text (A2-02)? *Options: shorten / keep the name and accept wrapping at 200 %.*
2. **Family phone header:** add micro labels under the header icons (초대 · 어머니 · 더 보기) (B2-08)? *Options: add labels / move 초대 into 더 보기 and label only 어머니 / keep icon-only.*
3. **Typing indicator:** replace the three pulsing dots with the spinner used by every other "working" state (A2-12)? *Options: spinner / keep dots and accept a transient detector finding.*

## 11. Run Notes
- **Target slugs:** `/senior`, `/family`, `/demo`, `/`. No `.impeccable/critique/ignore.md`. Snapshot not persisted (writes are restricted to `docs/design/`). Trend: 29 → 30 (Nielsen), 13 → 17 (audit).
- **Live server:** the detector `live-server` was started from the scratchpad (`--background`, pid 8784) and is stopped with `--keep-inject`. `web/index.html` was never touched. No product code was modified.
- **Server state:** another process reset and replayed the demo twice during this audit (about 04:09 and 04:16). Settled-state numbers come from runs before and after the replays. Mid-flow findings are from the run that overlapped a replay. The privacy "daily" probe was toggled and restored (verified 나만 보기).
