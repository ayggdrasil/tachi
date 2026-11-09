# Tachi · Impeccable Audit + Critique · Round 1

⚠️ DEGRADED: single-context (no sub-agent tool is exposed to this auditor, so Assessment A and Assessment B ran in one context; the detector also ran *before* the design review, so some anchoring is possible).

- **Date:** 2026-11-09 · **Build under test:** production server `http://localhost:4100` (`dist/assets/index-CM2WA-2Y.js`), state = full demo run with every card type
- **Method:** `docs/impeccable/audit.md` (5 dimensions, /20) and `docs/impeccable/critique.md` (Nielsen, /40), plus `polish.md` / `harden.md` for the fixes
- **Detector:** `impeccable@4.8.1`. I ran the static scan, CLI URL scans of 9 URLs, and **the same engine injected into 38 live UI states** (album, privacy, sheets, panels, dialogs, Director graph, 320 px, 320×256, landscape). The CLI only sees the first paint, so most findings showed up only in the injected runs.
- **Measurements:** Playwright/Chromium screenshots at 390×844, 1440×900, 320×640, 320×256, 844×390 and 640×450, in light and dark. Contrast was computed from computed styles with alpha and opacity compositing. Touch targets were measured with fine and coarse pointers. I also ran a keyboard Tab walk, focus-ring clipping checks, reduced-motion checks, and a text-size-preference test (CDP `Page.setFontSizes`).
- **Re-runnable proof:** `docs/design/tools/verify-design.cjs` reproduces every number below and exits 0 only when the goal is met (see §9).
- **Fix validation:** I applied the core fixes as runtime CSS/DOM patches in the browser (product code untouched) and re-ran the detector. **All 16 affected states came back CLEAN** (see §4.4).

---

## 1. Audit Health Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | **2** | Several WCAG AA failures, concentrated on senior surfaces. The memory sheet and the mobile family panel are `aria-modal` sheets with no focus move, no Tab trap and no Escape. Text-field boundaries are 1.26:1 (senior input) and 1.41:1 (family composer), against 1.4.11's 3:1. The dark placeholder is 3.49:1. At 320×256 the senior thread shrinks to 40 px and the newest message is 100 % covered by the composer. The focus ring is clipped on the selected (black) segment of the visibility switch. Text-size preference is ignored because every size is in px. |
| 2 | Performance | **3** | Cheap animations (opacity/transform), no layout thrash, lazy images, system fonts. Gaps: one 440 KB JS bundle (137 KB gz) shared by every route, including the Director. Assets are served uncompressed with `max-age=0` (server). Card photos have no reserved box, so they shift layout on load (MessageList carries a "pin on image load" workaround for this). |
| 3 | Theming | **3** | A full token set, and dark mode flips the raw palette correctly. All text passes AA in both themes. Drift: the Director uses chromatic hard-coded colours (`#2e8b57`, `#c0392b`, orange `rgba(200,120,40,…)`) and undefined tokens (`--accent-soft`, `--text-h2`). There are 25 raw-palette references (`var(--color-*)`) in component CSS. The senior type scale is hard-coded (24× `17px`, plus 18/19/22/26 px). `theme-color` is fixed white. |
| 4 | Responsive Design | **3** | 390 px and 1440 px are solid, with no horizontal overflow anywhere at 320 px. But the family header title truncates to "우리 …" at 390 px (inside the Director demo frame) and disappears at 320 px. The senior layout collapses at short heights (landscape and 200 % zoom). Family controls are 22–40 px tall (artifact title 22 px, panel tabs 33 px, buttons 40 px). Hover states stick after a tap on touch screens. |
| 5 | Implementation Integrity | **2** | The detector found several verified issues: side-tab (static), 8 nested-cards hits from 4 sources, 2 skipped-heading patterns, flat-type-hierarchy in 2 contexts, low-contrast, 2 text-occlusion, and em-dash and unbalanced-heading advisories. Hand-found drift: two divergent segmented controls, duplicate toast live regions, the inline speak button breaking text rhythm, a duplicated trip sentence, truncated family names on the memory card, and a stale `web/dist` build. |
| **Total** | | **13/20** | **Acceptable: significant work needed** (one point short of "Good") |

**Projected after the fix list in §8:** 4 / 4 / 4 / 4 / 4 = **20/20**, with zero detector findings including advisories. Performance 4 also needs S-01 (server compression and caching), which is outside groups A/B/C. Without it, expect 19/20.

---

## 2. Implementation Integrity Verdict: **PASS on concept, FAIL on finish**

The system is **coherent and product-specific**. Graphite ink on white with hairline elevation comes from the refero reference, and the senior adaptation is carried out with conviction:
- 56 px controls and 48 px chips;
- read-aloud buttons;
- private-by-default memories with a "지금 가족이 볼 수 있는 것" preview;
- graph nodes told apart by **shape** rather than hue;
- a ChatGPT-style family room with side chats and a live gathering document.

Nothing here could be reused unchanged by an unrelated product. The achromatic palette and the system fonts are expressed consistently across all three apps, with the Director as the exception.

It fails on finish because the detector and the measurements turn up repeated, verifiable defects in the core flows:
- the segmented control is drawn as a card inside a card, with 8 hits, a clipped focus ring and no radio semantics;
- the heading outline skips levels in every family state;
- the family `<h1>` is the same size as card titles (flat hierarchy) *and* truncates in the demo frame;
- the dark placeholder fails AA;
- the senior chat disappears under the composer at short heights;
- the Director graph's stats overlay covers its legend.

Every one of these is fixable without redesign. §4.4 shows that the patch set takes all 16 affected states to CLEAN.

---

## 3. Executive Summary

- **Audit Health Score: 13/20 (Acceptable).** **Design Health (Nielsen): 29/40 (Good).**
- **Issues in the fix list:**

  | Severity | Count |
  |---|---|
  | P0 | 0 |
  | P1 | 9 |
  | P2 | 27 |
  | P3 | 16 (polish tail; required for zero advisories where noted) |
  | Optional server items | 2 (S-01 P2, S-02 P3) |

- **Top issues:**
  1. Segmented visibility/privacy control. It accounts for 7 of the 8 nested-cards hits, has no radio semantics, and clips its focus ring on the selected segment (A-01).
  2. Family header `<h1>`. It truncates to "우리 …" in the demo phone frame and is the cause of the flat type ladder (B-01).
  3. Modal sheets without focus management: the senior memory sheet and the mobile family panel (A-02, B-02).
  4. The inline 56 px speak button. On every Tachi message it inflates line gaps from 31 px to 42 px (A-04).
  5. The memory card at the emotional peak. Family names are truncated ("박영수, 김지은,…"), and both decision buttons render as checked and disabled, so you can't see which was chosen (A-05).
  6. Contrast. The dark placeholder is 3.49:1 and field borders are 1.26–1.41:1 (C-01, C-02).
- **Recommended next steps:** apply group C first, because it adds tokens used by A and B. Then run A and B in parallel, with two A→B dependencies flagged inline (A-02 `useModal`, A-06 `headingLevel`). Then run `verify-design.cjs` and the CLI scans until both are clean.

---

## 4. Detector Findings

### 4.1 Static scan: `npx -y impeccable@4.8.1 detect --json web/src` (exit 2)

| Rule | Location | Verdict |
|---|---|---|
| `side-tab` (warning) | `web/src/components/cards/cards.css:28`, `.cd-story { border-left: 2px solid var(--border-strong) }` (the blockquote under "이야기 보기" in the memory card) | **Partial false positive in spirit.** It is a neutral 2 px quote rule, not a coloured accent card. It still matches the rule and the fix is free, so it is fixed by **A-24**. |

### 4.2 CLI URL scans (first paint only)

| URL | Findings | Verified |
|---|---|---|
| `/senior?as=mom&embed=1` | `em-dash-overuse` (advisory, 13); `nested-cards` → `div.cd-seg` | **Real.** 11 of the 13 dashes come from the **screen-reader-only** edge list in `MemoryGraph.tsx` ("A — 관계 → B"). The other two are the trip-suggestion text and the schedule card title. The nested card is the visibility segmented control (a bordered, rounded box with 10+ chars, inside `.cd`). It is a control rather than a card, but it is drawn card-like and lacks composite semantics. |
| `/senior?as=mom&embed=1&theme=dark` | above plus `low-contrast`: placeholder "타치에게 말해 보세요" #757575 on #212121 = **3.5:1** | Real: the UA default placeholder, with no `::placeholder` rule in base.css. |
| `/family?as=jieun&embed=1` | `flat-type-hierarchy` (advisory): body 14 / h4 14 / h1 16 / h3 16, largest step 1.14; `skipped-heading`: `<h1> "우리 가족"` → `<h3> "어제의 타치 리포트…"` | Real |
| `/family?as=jieun` (1440) | same, plus sidebar `h2` at 12 px in the ladder | Real |
| `/family?as=jieun&embed=1&theme=dark` | above plus `low-contrast` placeholder "메시지 보내기" 3.5:1 | Real |
| `/family?as=jieun&theme=dark` | same as above | Real |
| `/senior?as=mom` (1440) | above plus `unbalanced-heading` (advisory): `article.cd > h3.cd-title`, last line 26 % | Real (orphaned word in a card title) |
| `/demo?key=demo42` | none at first paint | See 4.3: the graph-panel state has 2 findings |
| `/` | none | Clean |

### 4.3 Injected scans of states the CLI cannot reach (`verify-design.cjs`, baseline = 32 findings)

| State | Findings |
|---|---|
| Senior **privacy** tab (light and dark) | `nested-cards` ×5 (`section.sa-priv > div.sa-seg`); `flat-type-hierarchy` (body 17 / h3 20 / h2 24, step 1.20) |
| Senior **album** and **memory sheet** | `em-dash-overuse` (43, all from the graph's sr-only edge list) |
| Senior **320×256** (200 % zoom, landscape-class) | `text-occlusion`: newest Tachi message "11월 15일(일)…" **100 % covered by `div.cp.cp-senior`**; thread height 40 px |
| Senior landscape 844×390 | `unbalanced-heading`, `nested-cards`; thread only 118 px |
| Family narrow → 어머니 소식 → 추억 | `nested-cards` → `div.mp-graph-box` inside `.fam-sheet`; `em-dash-overuse` (30) |
| Family → 어머니 소식 → 건강 (narrow and desktop) | `skipped-heading`: `<h2> "어머니 소식"` → `<h4> "혈압"` |
| Family 320 px | `unbalanced-heading` ×2 (`h3.cd-title`); the header `<h1>` is fully truncated (measured) |
| Director → 기억 그래프 (light and dark) | `nested-cards` → `div.dc-recall` inside `.dc-graph-box` |
| Director (auto-revealed graph, no recall yet) | `text-occlusion`: legend item "키워드" covered by the absolutely positioned `div.dc-graph-stats` |
| Landing (all) and Director rail | Clean |

**False positives:** none of the state findings are false. The two "semantic" cases are the segmented control (nested-cards) and the quote rule (side-tab). Both point at real problems: missing radio semantics with a clipped focus ring, and an off-system accent rule.

### 4.4 Fix validation (runtime patch, then detector)

I injected the CSS and DOM equivalents of A-01, A-03 (CSS part), A-06, A-07, B-01, B-02, B-04 (`.dc-recall`), C-01 and C-06. Results:

```
senior-chat CLEAN · senior-album CLEAN · senior-sheet CLEAN · senior-privacy CLEAN · senior-1440 CLEAN
senior-320x256 CLEAN (thread 94px) · family-embed-dark CLEAN · family-320 CLEAN · family-mom-memory CLEAN
family-mom-health CLEAN · family-artifact CLEAN · family-desktop-dark CLEAN · family-desktop-health CLEAN
family-desktop-artifact CLEAN · family-desktop-invite CLEAN · demo-graph CLEAN
```

The family title at 320/360/390 px was no longer truncated once the narrow header rules from B-01 were added.

---

## 5. Measurements

### 5.1 Contrast (computed, both themes)
- **Text:** 0 failures across 38 states. Key pairs (light / dark):

  | Pair | Light | Dark |
  |---|---|---|
  | `--text` on `--bg` | 19.44 | 13.63 |
  | `--text-2` on bg | 6.58 | 7.77 |
  | `--text-3` on bg | 5.10 | 6.38 |
  | `--text-3` on mist | 4.84 | 7.11 |
  | `--text-3` on user bubble | 4.64 | 5.23 |

  All pass AA.
- **Placeholders:** light #757575 on white is 4.61 (passes). **Dark #757575 on #212121 is 3.49 (fails AA, C-01).**
- **Non-text (1.4.11):** text-field boundaries fail.

  | Field | Border | Light | Dark |
  |---|---|---|---|
  | `.input` / `.cp-input` | `--border` | 1.26 | 1.37 |
  | Family composer `.cp-row` | `--border-strong` | 1.41 | 1.79 |

  Proposed `--border-field: var(--color-hollow)` (#8f8f8f): **3.23** on white, 3.07 on mist, **4.98** on #212121, 5.54 on #171717.
- **Director (dark rail #171717):** `.dc-bad` #c0392b is 3.30 and `.dc-ok` #2e8b57 is 4.22 at 12–13 px. Both fail AA, and both are chromatic (B-04).

### 5.2 Touch targets
- **Senior:** every control is ≥ 56 px and chips are 48 px. This meets PLAN §7.
- **Family, coarse pointer (phone):**

  | Control | Size (px) |
  |---|---|
  | `button.cd-art-head` (artifact title) | 281 × 22 |
  | `.btn` | 40 high |
  | `.btn-icon` (panel and dialog close) | 36 × 36 |
  | `.mp-tab` | 33 high |
  | `.fam-room` | 37 high |
  | `.fam-persona-btn` | 30 high |
  | `.ap-rm` | 28 × 28 |
  | `.ap-check` | 16 × 16 |
  | `.ap-select` | 80 × 22 |

  These pass AA 2.5.8 through the spacing exception, but miss the 44 px phone standard.
- **Director:** a fine-pointer desktop console. 28–36 px is acceptable there (`.dc-switch` 38 × 22 passes by spacing).

### 5.3 Keyboard and focus
- **Ring:** every focus stop shows a ring (2 px gap + 2 px ink). The exceptions are the family composer textarea, whose row border turns ink at 1 px (weak but visible; A-08), and `.cd-seg` buttons, whose ring is **clipped by `overflow:hidden`** and so invisible on the black selected segment.
- **Senior memory sheet:** focus stays on the tile behind the sheet. Tab walks through the other album tiles *behind the scrim* first. Escape does nothing. Focus does not return.
- **Family narrow panel sheet:** focus stays on the header button, and Tab visits the thread and composer behind the scrim first. The sheet is an `<aside>`, not a dialog. Escape does close it (global handler).
- **Composer sample popover and family "더 보기" menu:** Escape does nothing, and "더 보기" closes on `mouseleave`.
- **Persona menu:** has `role="menu"` but arrow keys do nothing and focus stays on the trigger (an ARIA pattern violation).

### 5.4 Motion
- The reduced-motion strategy is good: entrances become fades, pulses go steady, spinners stop.
- `@keyframes fam-slide` (translateY 24 px) is **not** overridden.
- `MessageList` calls `scrollTo({behavior:'smooth'})`, which ignores reduced motion. CSS `scroll-behavior` cannot override an explicit JS option.

### 5.5 Reflow, zoom and text size
- **320 px:** no horizontal overflow on any route. Family header title truncated. Family textarea squeezed to about 90 px with a two-line clipped placeholder.
- **320×256:** senior thread 40 px, with the newest message fully covered.
- **844×390 landscape:** senior thread 118 px.
- **640×450 (desktop at 200 %):** OK.
- **Browser default font 32 px:** `html` = 32 px, but `.senior` stays 20 px and body stays 16 px, because all type is in px. The user's text-size preference is ignored, which matters for a senior product (C-03).

### 5.6 Other verified facts
- **Two toast regions on `/senior`:** `App.tsx` and `SeniorApp.tsx` both render `<Toasts/>`, so every toast is announced twice.
- **Senior page has 0 `<h1>`.**
- **Bundle:** `dist` JS is 439,705 B (136,737 B gz) and CSS is 57,674 B (10,477 B gz). Served without `Content-Encoding`, with `Cache-Control: public, max-age=0`.
- **Demo photos:** 969×774, about 110 KB each, displayed at ≤390 css px (≤780 device px).
- **Stale `web/dist/`:** an older build from 02:28 that is not served (the server serves `/dist`).

---

## 6. Detailed Findings by Severity (each maps to a fix ID in §8)

**P1 (WCAG AA failure or demo-visible defect):**

| ID | Finding |
|---|---|
| A-01 | Segmented control: nested-cards ×7, clipped focus ring (2.4.7), toggle semantics |
| A-02 | Senior memory sheet: no focus management or Escape (2.4.3) |
| A-03 | Senior short-viewport collapse (1.4.10, text-occlusion) |
| A-04 | Inline speak button breaks line rhythm on every Tachi message |
| A-05 | Memory card: truncated family names; ambiguous decided state |
| B-01 | Family `<h1>` truncated in demo frame; flat type ladder |
| B-02 | Family mobile panel sheet is not a modal dialog (2.4.3); nested-cards |
| C-01 | Dark placeholder 3.49:1 (1.4.3) |
| C-02 | Field boundaries 1.26–1.41:1 (1.4.11) |

**P2:**

| Fix IDs | Findings |
|---|---|
| A-06, B-03 | Heading outline |
| A-07, A-09 | Em-dash and duplicate trip text |
| A-08 | Composer boundary and focus |
| A-10 | Senior text below 17 px: graph labels 12–13 px, popover title 13 px, relation label 12 px, tab labels 16 px |
| A-11 | Popover Escape |
| A-12 | Duplicate avatar names |
| A-13 | Image layout shift |
| A-14 | Stale "일정 조율 시작" after the date is confirmed |
| A-15 | Smooth scroll under reduced motion |
| A-16, B-06, C-05 | Family touch targets |
| A-17, B-11, C-04 | Raw palette and hard-coded type and radii |
| A-24 | Side-tab |
| A-25, B-08 | Duplicate toasts |
| B-04 | Director chromatic colours, nested card, legend occlusion |
| B-05 | Menus |
| B-07 | Route splitting |
| B-09 | Family connection-error recovery |
| B-10 | Director `<h1>` |
| C-03 | rem type tokens |
| C-08 | `theme-color` |
| S-01 | Compression and caching (server) |

**P3:** A-18 (ARIA hygiene), A-19 (provenance copy), A-20 (labelled sample button), A-21 (≤4 slot choices for the senior), A-22 (senior help sheet), A-23 (dead CSS and sticky hover), B-12 (fam-slide reduced motion), B-13 (`.fam-none` cascade collision and badge duplication), A-26 (recall alternatives clipped), B-14 (family help examples), B-15 (MomPanel tab keyboard model), B-16 (Director uses the theme helper), B-17 (sticky hover, B files), C-06 (balanced headings), C-07 (sticky hover, base), C-09 (delete `web/dist`), S-02 (server copy dashes).

### Patterns and systemic issues
- **Overlay pattern implemented four ways.** `Dialog.tsx` traps focus correctly; `.sa-sheet`, `.fam-sheet` and `.cp-pop` don't. One shared `useModal` hook removes the class of bug.
- **The segmented control exists twice** (`.cd-seg` in cards, `.sa-seg` in senior) with different focus handling, so only one of them clips its ring.
- **The senior type scale is implicit.** There are 8 distinct sizes (16/17/18/19/20/22/24/26) as px literals. `--senior-caption` exists but is used in 4 places, against 24 `17px` literals.
- **Raw palette names in components** (`var(--color-graphite-ink)` and others) mean the semantic layer is bypassed. In dark mode `--color-pure-white` is #212121, so any component that uses raw names reads misleadingly.
- **Hover-only styling with no `(hover: hover)` guard,** so tap-highlight states stick on phones.

### Positive findings (keep these)
- **Contrast discipline.** `--text-3` was tuned to #6e6e6e to pass AA on white and mist, and Mid Ash is the senior floor. All text passes in both themes.
- **Reduced motion is designed, not killed.** Fades replace travel and pulses settle to a steady state. This is exactly what audit.md asks for.
- **Strong accessible naming.** Every icon button is labelled. Action phases are announced with `aria-busy` and a `role="alert"` retry. The graph is `role="img"` with an sr-only edge list. The thread is `role="log"`.
- **Privacy UX is excellent.** Memories are private by default, there is a "지금은 어머님만 볼 수 있어요" confirmation, and the privacy screen previews exactly what family can see.
- **Senior ergonomics.** 56 px controls, 48 px chips, 20 px body, read-aloud on every Tachi line, voice input, big "사진 보여주기" CTA.
- **The Director** is a genuinely good live-demo tool: step status, dwell, timeout and retry, honest "키 없음" model states, a recall-evidence inspector.

---

## 7. Critique (Nielsen, cognitive load, emotional journey, personas)

### 7.1 Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Typing indicator, connection status, action spinners and retry, live 응답 3/5, "누가 방금 수정", remote-edit flash are all good. **But** a decided memory card shows *both* buttons checked and disabled, so the senior can't see what she chose. The artifact card still offers a primary "일정 조율 시작" after the date is confirmed. |
| 2 | Match System / Real World | 3 | Warm 해요체 copy, "사진 보여주기", "가족 공개 / 나만 보기", relations rendered as "찍은 곳 / 함께한 사람". Jargon still leaks to family: "규칙 응답", "오프라인 응답", "기술 정보 보기", "노드 36 · 관계 43", and `—TAKEN_AT→` on recall hops. "1980년대 1984년 봄" is redundant. |
| 3 | User Control and Freedom | 3 | Panels and dialogs close, there is "가족방으로" and a back button, the visibility switch can revert a share, speak and mic can be stopped. Escape is missing on the senior memory sheet, the sample popover and the "더 보기" menu. A schedule answer can't be revised once sent. |
| 4 | Consistency and Standards | 3 | A cohesive visual system. Divergences: two segmented controls; senior label sizes drift between 17, 18 and 19 px; the trip suggestion is the only senior card without read-aloud; the Director's orange and green break the achromatic rule; "어머니 / 어머님 / 엄마" vary inside the family UI; `role="menu"` is used without menu behaviour. |
| 5 | Error Prevention | 3 | Private-by-default, explicit share consent, server-side privacy, a reset confirm. Gaps: the stale scheduling CTA can start a duplicate poll; tasks are deleted without undo; flipping a category to 가족 공개 takes effect instantly with no confirmation, though it is reversible and previewed. |
| 6 | Recognition Rather Than Recall | 3 | Labelled tabs, quick-reply chips, the "'타치'라고 부르면 타치가 답해요" hint, the privacy preview. The senior sample-photo button is icon-only. Recall depends on the senior remembering a keyword; the album's "다시 듣기" helps. |
| 7 | Flexibility and Efficiency | 3 | Text, voice, chips and card buttons give multiple paths, plus Enter-to-send and the Director's keyboard shortcuts. The family app has no search and no shortcuts, which is fine for its scope. |
| 8 | Aesthetic and Minimalist Design | 3 | Restrained and photo-first. Blemishes: inline 56 px speak icons wreck the rhythm of every Tachi paragraph; the trip reason is printed twice; family names are truncated; six stacked black 56 px pills; solid near-black health bars; the composer border-top plus the rounded box double up the line. |
| 9 | Error Recovery | 3 | The senior connection error has plain copy and 다시 시도; mic, photo-size and new-room errors are specific and friendly. The family boot error is technical ("서버가 켜져 있는지 확인해 주세요") and has **no retry**. The action retry text "다시 시도해 주세요" doesn't say what failed. |
| 10 | Help and Documentation | 2 | Good inline hints (empty states, the privacy explanation, the graph instruction, Director step hints). There is no "how to talk to Tachi" help for the senior and no example asks for family, which are the two moments first-timers need. |
| **Total** | | **29/40** | **Good** |

### 7.2 Design Specificity Verdict
- **LLM assessment.** The senior app is authored for its user: big targets, read-aloud, gentle copy, privacy-first, and memories shown as photos, facts and a shape-coded graph. The family app is deliberately ChatGPT-shaped, as the brief asked. That makes it the most interchangeable surface, but the artifact document, the side-chat scheduling and the mom panel give it product character. The missed opportunity is the **emotional peak**. The memory card truncates the people's names and ends in two greyed-out buttons, so the moment reads as a form receipt.
- **Deterministic scan.** See §4: 1 static finding and 31 findings across injected states. The detector caught what I missed in the privacy tab (nested cards, flat ladder), the Director legend overlap, and the 320×256 occlusion. The 13 senior em-dashes are mostly screen-reader-only text.
- **Visual overlays.** None are user-visible. The detector was injected headlessly with `autoScan:false` and its findings were read programmatically. There is no `[Human]` tab.

### 7.3 Overall impression
Calm, legible and trustworthy. The interface gets out of the way of the photos and the family's words. The **single biggest opportunity** is to finish the senior chat column: move read-aloud out of the text flow, stop truncating names, collapse the decided memory card to one clear state, and make the sheet a real dialog. These four changes alone lift both scores the most.

### 7.4 What's working
1. **Privacy as reassurance.** "지금은 어머님만 볼 수 있어요" after saving, private by default, the preview list. The senior feels safe sharing.
2. **Senior ergonomics without condescension.** 56 px controls and a 20 px body, still in the same graphite language as the family app, with no "senior-mode" cartoonishness.
3. **The family room as a living space.** Share cards, warm bot reactions, the daily report as the peak-end, and the artifact updating live.

### 7.5 Priority issues
- **[P1] The memory card fails the emotional peak.**
  - *Why:* this is the moment the product exists for, and the names of her husband and children read "박영수, 김지은,…" with both decisions greyed out.
  - *Fix:* A-05 (wrap facts, de-duplicate era and year, one decided-state control with a sentence).
  - *Command:* `polish`
- **[P1] The read-aloud button sits inside the text line.**
  - *Why:* line gaps jump from 31 px to 42 px on every Tachi message, which is hard to track for presbyopic readers.
  - *Fix:* A-04.
  - *Command:* `polish`
- **[P1] Overlays without focus management** (senior sheet, family mobile sheet, popovers).
  - *Why:* keyboard and switch users land behind the scrim and cannot Escape.
  - *Fix:* A-02, B-02, A-11, B-05.
  - *Command:* `harden`
- **[P1] Family header in the demo frame reads "우리 …".**
  - *Why:* this is the first thing the audience reads on the right-hand phone.
  - *Fix:* B-01.
  - *Command:* `polish`
- **[P2] No help moment.**
  - *Why:* a 78-year-old's first question is "what can I say?"
  - *Fix:* A-22 senior help sheet, B-14 family example asks.
  - *Command:* `clarify` (Impeccable's UX-copy pass; not one of the four method files in `docs/impeccable`)

### 7.6 Cognitive load
The checklist has **1 failure: minimal choices.**
- The senior chat screen permanently shows 9 actionable controls: photo, samples, mic, input, send, 3 tabs and a header gear that duplicates the 설정 tab.
- The senior schedule card asks for a choice among **6 slots** plus 2 buttons, which is more than 4.
- Single focus, chunking, grouping, one-thing-at-a-time (the interview asks one question per turn) and progressive disclosure ("이야기 보기", "전체 일정 보기") all pass.
- Load is **low to moderate.** A-21 and A-22 bring the senior screen to 8 controls with a help entry point in place of the duplicate gear.

### 7.7 Emotional journey
- **Peak:** memory saved, then shared, then family bots react ("엄마 이 사진 처음 봐요!"). This is strong.
- **End:** the 21:00 report summarises the day warmly. The peak-end rule is satisfied.
- **Valleys:**
  - the truncated names and ambiguous buttons on the memory card, right at the peak;
  - waiting for Tachi, which is softened by "타치가 생각하고 있어요";
  - on the family side, a health answer can sit next to cheerful bot replies (content, server-side).
- **Reassurance at high stakes:** excellent for privacy. It is missing at "who will see my schedule answer?" because the card just says "보냈어요 · 6개 선택".

### 7.8 Persona red flags
- **순자 (project persona: 78, presbyopia, slight tremor, first smartphone app; from PLAN §1/§7):**
  - the speak icons inside sentences make lines jump;
  - graph labels at 12–13 px, relation labels at 12 px, the "예시 사진" title at 13 px and tab labels at 16 px are all below her 17 px floor;
  - the icon-only sample button;
  - her family's names truncated with "…";
  - "점을 눌러 끌어 보세요" asks her to drag tiny SVG nodes;
  - with phone zoom in landscape the conversation disappears under the composer;
  - tab highlights stay grey after a tap;
  - her large-text browser setting is ignored.
- **Sam (screen reader / keyboard):**
  - opening a memory leaves focus on the album tile, Tab walks through the hidden tiles, and Escape does nothing;
  - the persona menu announces "menu" but arrows do nothing;
  - each message reads "타치, 타치" (avatar label plus name);
  - the outline jumps h1 → h3, and h2 → h4 in the health panel;
  - toasts are announced twice on the senior app;
  - focus is invisible on the selected visibility segment.
- **Casey (family member on a phone):**
  - the room title is "우리 …";
  - the artifact card's title button is a 22 px strip;
  - the mom-panel tabs are 33 px;
  - the dark-mode placeholder is hard to read;
  - at 320 px the composer placeholder is clipped onto two lines;
  - "더 보기" vanishes if the thumb slides off it on hybrid devices (it closes on mouseleave).

### 7.9 Minor observations
- Side room rows repeat "일정 조율" as both title prefix and badge.
- The `.fam-none` class is defined twice with different padding (FamilyApp.css vs family.css), so the empty-state spacing changes after any dialog has been opened.
- The `.sa-sheet` grab handle suggests swipe-to-dismiss, but there is no drag.
- Director `.dc-cypher` uses 11 px, which is below the scale.
- `--accent-soft` and `--text-h2` are referenced but never defined.
- The `.cd-spin` reduced-motion rule lives in MemoryGraph.css.
- `.sr-only` is defined twice.

### 7.10 Questions to consider
- What if the memory card ended with a single sentence, "가족도 볼 수 있어요 · 바꾸기", instead of controls?
- Does the senior ever need the graph, or is it the Director's proof? It could live only in the album and the Director.
- What would read-aloud look like if Tachi simply *spoke* new messages when the senior has turned voice on once?

### 7.11 Run notes
- Target slugs: `/senior`, `/family`, `/demo`, `/`. No `.impeccable/critique/ignore.md` exists.
- **Snapshot not persisted.** `critique-storage write` would write into `.impeccable/critique/`, and this round is restricted to `docs/design/`. This is the first run, so there is no trend.
- Live-server (detect.js) was started from the scratchpad, never touched `web/index.html`, and was stopped with `--keep-inject`.
- No product code was modified.
- The server state was replayed by another process around 03:18. Both full harness runs (before and after) produced identical findings.

---

## 8. Prioritised Fix List (grouped by file ownership)

**Order:** C first, because it adds tokens referenced by A and B. Then A and B in parallel. Two cross-group dependencies:
- **A-02 → B-02:** B imports the `useModal` hook.
- **A-06 → B-03:** B uses the `headingLevel` prop.

**Conventions for every item:**
- Keep the achromatic palette and system fonts.
- Use tokens, never new hex values.
- After each group, run `npm run typecheck`.
- At the end, run `npm run build` and the verification in §9. The orchestrator must rebuild and restart `:4100` before re-verifying.

### Group C: `web/src/styles/**`, `web/index.html` (+ `web/src/main.tsx` theme bootstrap, + new `web/src/styles/theme.ts`)

**C-01 [P1] Accessibility 1.4.3, detector `low-contrast`: placeholder colour**
- **Files:** `web/src/styles/base.css`.
- **Change:** add after the `button, input, …` rule:
  ```css
  ::placeholder { color: var(--text-3); opacity: 1; }
  ```
- **Verify:** detector on `/senior?as=mom&embed=1&theme=dark` and `/family?as=jieun&embed=1&theme=dark` reports no `low-contrast`. `getComputedStyle(input,'::placeholder').color` is `rgb(163,163,163)` in dark (6.38:1) and `rgb(110,110,110)` in light (5.10:1).

**C-02 [P1] Accessibility 1.4.11: field-boundary token**
- **Files:** `tokens.css`, `base.css`.
- **Change:**
  1. In `tokens.css` `:root`, add `--border-field: var(--color-hollow);`. Hollow is #8f8f8f in both themes: 3.23:1 on #fff, 4.98:1 on #212121.
  2. In `base.css`, change `.input { border: 1px solid var(--border) }` to `var(--border-field)`.
- **Verify:** `.input` computed `border-top-color` is `rgb(143,143,143)` in light and dark. A-08 and B-06 apply the token to the custom fields.

**C-03 [P2] Accessibility 1.4.4 / Responsive text scaling: rem type tokens and an explicit senior scale**
- **Files:** `tokens.css`.
- **Change:** replace the typography block with:
  ```css
  --text-micro: 0.75rem;   --text-small: 0.8125rem; --text-caption: 0.875rem;
  --text-body: 1rem;       --text-title: 1.25rem;   --text-heading: 1.5rem;  --text-display: 2.5rem;
  --senior-caption: 1.0625rem;  /* 17 meta, secondary */
  --senior-control-text: 1.125rem; /* 18 every senior control label: .btn, chip, segmented, slot, photo button */
  --senior-body: 1.25rem;       /* 20 reading text, inputs */
  --senior-title: 1.5rem;       /* 24 card/sheet/section titles */
  --senior-heading: 1.75rem;    /* 28 screen h1, key values (big date, BP) */
  --senior-wordmark: 1.375rem;  /* 22 header wordmark */
  ```
  Keep `--senior-control: 56px` and `--senior-chip: 48px` in px.
- **In `base.css`:**
  - `.senior .btn` and `.senior .chip` change `font-size: var(--senior-caption)` to `var(--senior-control-text)`;
  - `.senior .caption` stays `--senior-caption`;
  - `h1, h2` stay `--text-heading`.
- **Verify:** with CDP `Page.setFontSizes({fontSizes:{standard:32}})`, `.senior` computes to 40 px (the `textPreference.scales` check in verify-design.cjs). At the default 16 px, screenshots match the current sizes except where A-17 and B-11 change them on purpose.

**C-04 [P2] Theming: semantic aliases (stop using raw palette names in components)**
- **Files:** `tokens.css`, `base.css`.
- **Change:**
  1. Add to `:root`:
     ```css
     --ink: var(--color-graphite-ink);
     --ring-gap: var(--color-pure-white);
     --fill-disabled: var(--color-edge-gray);
     --bubble: var(--color-user-bubble);
     --surface-tooltip: var(--color-ink-press);
     --inverse-bg-hover: var(--color-ink-press);
     --radius-bubble: 18px;
     --radius-device: 36px;
     --radius-device-inner: 24px;
     --target-min: 44px;
     --focus-ring-inset: inset 0 0 0 3px var(--ring-gap), inset 0 0 0 5px var(--ink);
     ```
  2. Change `--focus-ring` to `0 0 0 2px var(--ring-gap), 0 0 0 4px var(--ink);`.
  3. In `base.css`:
     - `::selection` uses `var(--inverse-bg)` / `var(--inverse-text)`;
     - `.btn-primary:hover` uses `var(--inverse-bg-hover)`;
     - `.btn-primary:disabled` uses `var(--fill-disabled)`;
     - `.input:focus` uses `border-color: var(--ink)`.
- **Verify:** `grep -n "var(--color-" web/src/styles/base.css` returns nothing. After A-17 and B-11, `grep -rn "var(--color-" web/src --include=*.css --include=*.tsx | grep -v styles/tokens.css` returns nothing.

**C-05 [P2] Responsive and accessibility 2.5.8: coarse-pointer target floor**
- **Files:** `base.css`.
- **Change:** append:
  ```css
  @media (pointer: coarse) {
    .btn, .chip, .input { min-height: var(--target-min); }
    .btn-icon { min-height: var(--target-min); width: var(--target-min); }
  }
  ```
  `.senior .btn` (0,2,0) still wins with 56 px.
- **Verify:** `coarseTargets_*` in verify-design.cjs lists no `.btn`, `.chip` or `.btn-icon`.

**C-06 [P3, required for zero advisories] Integrity, `unbalanced-heading`**
- **Files:** `base.css`.
- **Change:** add `h1, h2, h3, h4 { text-wrap: balance; }`.
- **Verify:** detector on `/senior?as=mom` (1440) and `/family?as=jieun&embed=1` (320) reports no `unbalanced-heading`.

**C-07 [P3] Responsive: sticky hover on touch**
- **Files:** `base.css`.
- **Change:** wrap `.btn:hover…` and `.chip:hover` in `@media (hover: hover) { … }`.
- **Verify:** in a `hasTouch:true, isMobile:true` context, tap a `.chip`, then confirm its computed background equals `--surface`.

**C-08 [P2] Theming: browser chrome colour follows the theme**
- **Files:** `web/index.html`, new `web/src/styles/theme.ts`, `web/src/main.tsx`.
- **Change:**
  1. In `index.html`, replace the single `theme-color` meta with:
     ```html
     <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
     <meta name="theme-color" content="#212121" media="(prefers-color-scheme: dark)" />
     <meta name="color-scheme" content="light dark" />
     ```
  2. Create `web/src/styles/theme.ts`. It exports `applyTheme(t: 'light' | 'dark')`, which sets `document.documentElement.dataset.theme = t` and, for every `meta[name="theme-color"]`, removes `media` and sets `content` to `t === 'dark' ? '#212121' : '#ffffff'`.
  3. `main.tsx` calls `applyTheme(t)` instead of setting the dataset directly. B-16 uses the same helper.
- **Verify:** on `/senior?as=mom&theme=dark`, `document.querySelector('meta[name=theme-color]').content === '#212121'`.

**C-09 [P3] Integrity: delete the stale build output**
- **Change:** delete `web/dist/` (an unserved 02:28 build). The server serves `/dist`, which `vite build` writes to.
- **Verify:** `test ! -d web/dist`, and `npm run build` still creates `dist/assets/*`.

### Group A: `web/src/components/**` + `web/src/pages/senior/**`

**A-01 [P1] Integrity (nested-cards ×7), accessibility 2.4.7 / 4.1.2: one accessible segmented control**
- **Files:** new `web/src/components/common/Segmented.tsx`; `common.css`; `MemoryCards.tsx` (`VisibilitySwitch`); `pages/senior/MemoryAlbum.tsx` (`MemorySheet`); `pages/senior/PrivacySettings.tsx`; delete the `.cd-seg*` rules (cards.css) and the `.sa-seg*` rules (senior.css).
- **Change:**
  1. Component signature:
     ```tsx
     export function Segmented<T extends string>(props: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string; icon?: React.ReactNode }[]; size?: 'senior' | 'family' })
     ```
  2. It renders `<div role="radiogroup" aria-label={label} className={'seg' + (size === 'senior' ? ' seg-senior' : '')}>`. Each option is a `<button type="button" role="radio" aria-checked={checked} tabIndex={checked ? 0 : -1}>`.
  3. Keyboard: `onKeyDown` ArrowRight/ArrowDown selects the next option, ArrowLeft/ArrowUp the previous (wrapping), Home and End the first and last. Each move calls `onChange` and focuses the new button. Click calls `onChange`.
  4. CSS in `common.css`:
     ```css
     .seg { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); width: 100%; border: 1px solid var(--border-strong); border-radius: var(--radius-lg); overflow: hidden; }
     .seg button { min-height: 40px; display: inline-flex; align-items: center; justify-content: center; gap: var(--space-6); font-size: var(--text-caption); font-weight: var(--weight-medium); color: var(--text-2); border-radius: 0; }
     .seg button[aria-checked="true"] { background: var(--inverse-bg); color: var(--inverse-text); }
     .seg button:focus-visible { box-shadow: var(--focus-ring-inset); }
     .seg-senior button { min-height: var(--senior-control); font-size: var(--senior-control-text); }
     @media (pointer: coarse) { .seg button { min-height: var(--target-min); } }
     @media (hover: hover) { .seg button:hover:not([aria-checked="true"]) { background: var(--hover); } }
     ```
  5. Usage: `VisibilitySwitch` takes a `variant` prop and passes `size`. Options are `[{value:'family',label:'가족 공개',icon:<Users/>},{value:'private',label:'나만 보기',icon:<Lock/>}]`. `PrivacySettings` uses `label={\`${PRIVACY_LABELS[c].label} 공개 범위\`}`.
- **Verify:**
  - Detector on the senior chat and privacy tabs reports no `nested-cards` (validated: the detector exempts `role="radiogroup"` composites).
  - Tab into a group: focus lands on the checked radio, and its inset ring is visible on the black fill (screenshot).
  - ArrowRight switches the value and calls the store.

**A-02 [P1] Accessibility 2.4.3 / 2.1.2: shared modal hook; the senior memory sheet becomes a real dialog**
- **Files:** new `web/src/components/common/useModal.ts`; `pages/senior/MemoryAlbum.tsx`; `pages/senior/senior.css`.
- **Change:**
  1. Hook signature: `export function useModal(ref: React.RefObject<HTMLElement | null>, onClose: () => void)`.
  2. On mount:
     - store `document.activeElement`;
     - focus `ref.current.querySelector('[data-autofocus]')`, falling back to the first focusable (`button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])`, not disabled), falling back to `ref.current`;
     - add a capture-phase `keydown` listener on `window`: Escape → `e.stopPropagation(); onClose()`; Tab and Shift+Tab cycle within `ref.current`.
  3. On unmount: remove the listener and restore focus to the stored element.
  4. In `MemorySheet`:
     - `const ref = useRef<HTMLDivElement>(null); useModal(ref, onClose);`
     - `ref` on `.sa-sheet`;
     - `aria-labelledby="sa-sheet-title"` replaces `aria-label`, and the title `<h2 id="sa-sheet-title">`;
     - add `data-autofocus` to the close button;
     - remove `<span className="sa-grab">` and the `.sa-grab` CSS.
- **Verify:** `behaviour.seniorSheet` in verify-design.cjs is `{focusMovedIn:true, tabTrapped:true, escapeCloses:true, focusReturned:true}`.

**A-03 [P1] Accessibility 1.4.10 / Responsive, detector `text-occlusion`: senior short-viewport layout**
- **Files:** `components/chat/Composer.tsx` (senior branch); `Composer.css`; `pages/senior/senior.css`.
- **Change:**
  1. In the senior branch, inside `.cp-row` before the mic button, add:
     ```tsx
     <button type="button" className="cp-round cp-cam-compact" aria-label="사진 보여주기" disabled={uploading} onClick={() => fileRef.current?.click()}><Camera size={24} /></button>
     ```
  2. In `Composer.css`, add `.cp-cam-compact { display: none; }` and:
     ```css
     @media (max-height: 480px) {
       .cp-senior { padding: var(--space-8) var(--space-16); }
       .cp-senior .cp-photo-row { display: none; }
       .cp-senior .cp-cam-compact { display: inline-flex; }
     }
     ```
  3. In `senior.css`, add:
     ```css
     @media (max-height: 480px) {
       .sa-tab { min-height: var(--senior-chip); flex-direction: row; gap: var(--space-6); }
     }
     ```
- **Verify:**
  - At 320×256: `threadHeight` ≥ 72 and no `text-occlusion` (validated: 94 px with this CSS).
  - At 844×390: thread ≥ 200 (validated: 228 px).
  - The compact camera opens the file picker.

**A-04 [P1] Aesthetic / Integrity: take read-aloud out of the text line**
- **Files:** `components/chat/MessageList.tsx`, `MessageList.css`, `components/cards/cards.css`.
- **Change:**
  1. Delete `{senior && isTachi && <span className="ml-speak">…</span>}` from inside `.ml-text`.
  2. Directly after the `.ml-text` div, render `{senior && isTachi && <div className="ml-tools"><SpeakButton text={m.text} /></div>}`.
  3. CSS: delete `.ml-speak`; add `.ml-senior .ml-tools { display: flex; margin: -4px 0 -10px -14px; }`.
  4. In `cards.css`, add `.senior .cd .speak-btn { margin: -14px -12px -14px 0; flex: none; }` so the 56 px hit area no longer inflates card title rows.
- **Verify:** `behaviour.speakLineRhythm.ok === true` (line-top gaps equal the 31 px line-height; they are 42 px today). The speak button still measures 56×56.

**A-05 [P1] H1 / H8: the memory card's emotional peak**
- **Files:** `components/cards/MemoryCards.tsx` (`MemoryCard`), `cards.css`, `components/chat/MessageList.css`, `pages/senior/MemoryAlbum.tsx` (sheet rows).
- **Change:**
  1. **Date fact:** `const when = m.year ? \`${m.year}년${m.season ? ' ' + m.season : ''}\` : (m.era ?? '');` in both the card and `MemorySheet` (no more "1980년대 1984년 봄").
  2. **Facts wrap:** in `cards.css`, remove `white-space: nowrap; overflow: hidden; text-overflow: ellipsis;` from `.cd-facts dd, .cd-facts dt`.
  3. **Decided state:** when `decided`, render **no** `actionSlot`. Instead, render under the facts:
     - in the senior variant, `<p className="cd-cap">{m.visibility === 'family' ? '가족도 볼 수 있어요' : '지금은 나만 볼 수 있어요'}</p>`;
     - then `<VisibilitySwitch …>` (A-01), shown when `canToggle`.
  4. In `MessageList.css`, add:
     ```css
     .ml-actions .btn { word-break: keep-all; overflow-wrap: normal; }
     .ml-senior .ml-actions-row .btn { padding: 0 var(--space-12); }
     ```
     This stops "간직할게/요"-style breaks inside words.
- **Verify:**
  - In the 390 px senior thread, no `.cd-facts` element has `scrollWidth > clientWidth`;
  - "박영수, 김지은, 박민준" is fully visible;
  - a decided card shows exactly one radiogroup and no disabled buttons.

**A-06 [P2] Integrity `skipped-heading`, accessibility 1.3.1: heading outline**
- **Files:** `MessageList.tsx`, `cards/MiscCards.tsx`, `health/HealthSummaryView.tsx` + `.css`, `pages/senior/SeniorChat.tsx`, `MemoryAlbum.tsx`, `PrivacySettings.tsx`, `senior.css`.
- **Change:**
  1. **MessageList:** the first child inside `.ml` is `<h2 className="sr-only">{senior ? '타치와 나눈 대화' : '대화 내용'}</h2>`.
  2. **HealthCard:** prepend `<h3 className="cd-title">최근 7일 건강 기록</h3>`.
  3. **HealthSummaryView:**
     - new prop `headingLevel?: 3 | 4` (default 4);
     - `const H = headingLevel === 3 ? 'h3' : 'h4'`;
     - every `<h4>` becomes `<H className="hs-h">`;
     - CSS selectors `.hs-head h4`, `.hs-grid .hs-head h4` and `.hs-senior .hs-head h4` become `.hs-h`, `.hs-grid .hs-h` and `.hs-senior .hs-h`.
  4. **SeniorChat:** `<h1 className="sr-only">타치와 대화</h1>` as the first child of `.sa-chat`.
  5. **MemoryAlbum:** "우리 추억" becomes `<h1 className="sa-h sa-h1">`; "기억 그래프" stays `<h2 className="sa-h sa-h2">`.
  6. **PrivacySettings:**
     - "가족에게 보여주기" becomes `<h1 className="sa-h sa-h1">`;
     - category titles `h3.sa-priv-t` become `h2.sa-priv-t`;
     - "지금 가족이 볼 수 있는 것" becomes `<h2 className="sa-priv-t">`.
  7. **CSS:** `.sa-h { font-size: var(--senior-title); }`, `.sa-h1 { font-size: var(--senior-heading); }`. The h1 at 28 px also fixes the privacy `flat-type-hierarchy` (17 → 20 → 28; validated). Health cards are only ever posted to the family room (`server/orchestrator/family.ts:119`), so the h4 health labels never enter the senior chat ladder.
- **Verify:** no `skipped-heading` or `flat-type-hierarchy` in any senior or family state (B-03 completes the health panel), and each senior tab has exactly one `<h1>`.

**A-07 [P2] Integrity `em-dash-overuse` (advisory)**
- **Files:** `graph/MemoryGraph.tsx`, `cards/GatheringCards.tsx`, `cards/MemoryCards.tsx`, `pages/senior/PrivacySettings.tsx`, `common/ModelSwitcher.tsx`, `chat/MessageList.tsx`.
- **Change:**
  1. **MemoryGraph:** the sr-only edge `<li>` becomes `{src} → {tgt} ({rel})`.
  2. **ScheduleRequestCard:** `<h3 className="cd-title">{p.artifactTitle}</h3><p className="cd-meta">가능한 시간을 모두 골라 주세요</p>`.
  3. **RecallCard:** use `REL_SENIOR[h.t] ?? h.t` for **both** variants (removes `—TAKEN_AT→` and the jargon).
  4. **PrivacySettings preview:** `<b>{label}</b>: {description}`.
  5. **ModelSwitcher:** the fallback `'—'` becomes `'확인 중'`.
  6. **MessageList:** remove `'trip_suggestion'` from `TEXT_ABOVE`.
- **Verify:** fewer than 8 "—" in `document.body.textContent` on the senior chat, album and family mom panel; detector reports no `em-dash-overuse`.

**A-08 [P2] Accessibility 1.4.11 / 2.4.7: family composer boundary and focus**
- **Files:** `components/chat/Composer.css`.
- **Change:**
  - `.cp-family .cp-row { border: 1px solid var(--border-field); border-radius: var(--radius-2xl); … }`;
  - `.cp-family .cp-row:focus-within { border-color: var(--ink); box-shadow: var(--focus-ring); }`.
  - `.cp-input` already inherits `.input` (C-02).
- **Verify:** `.cp-row` border is `rgb(143,143,143)`, and focusing the textarea gives the row a `box-shadow` ring.

**A-09 [P2] H8 / H4: trip suggestion said once, readable aloud**
- **Files:** `cards/TripCards.tsx`.
- **Change:** `TripSuggestionCard` reads `variant` from props. In the title row, add `{variant === 'senior' && <SpeakButton text={\`${p.title}. ${p.reason}\`} />}`. A-07 already removed the duplicate text above the card.
- **Verify:** the reason sentence appears once in the senior thread, and the card has a 56 px speak button.

**A-10 [P2] Senior legibility floor (PLAN §7): no senior text below 17 px (SVG labels ≥ 14 px)**
- **Files:** `Composer.css`, `cards.css`, `senior.css`, `graph/MemoryGraph.tsx` + `.css`, `MemoryCards.tsx`, `MemoryAlbum.tsx`.
- **Change:**
  1. `.cp-senior .cp-pop-t { font-size: var(--senior-caption); }`.
  2. `.senior .cd-hop b { font-size: var(--senior-caption); }`.
  3. `.sa-tab { font-size: var(--senior-caption); }` (was 16 px).
  4. **MemoryGraph:** new prop `large?: boolean`.
     - When `large`: `fs = compact ? 14 : 15`, truncate compact labels to 6 characters (`maxChars` 6), and add class `mg-large` on `.mg`.
     - CSS: `.mg-large .mg-label, .mg-large .mg-label-mem { font-size: 15px; } .mg-large.mg-compact .mg-label, .mg-large.mg-compact .mg-label-mem { font-size: 14px; } .senior .mg-legend { font-size: var(--senior-caption); }`.
     - Pass `large` from `MemoryCard` when `variant === 'senior'`, with `height={200}`, and from `MemoryAlbum`.
- **Verify:** the `seniorSmall` count in verify-design.cjs is 0 for non-SVG text, and no `.mg-label` `getBBox()` rectangles intersect in the senior card graph.

**A-11 [P2] Accessibility / H3: composer sample popover**
- **Files:** `components/chat/Composer.tsx`.
- **Change:**
  1. Give the popover `id="cp-samples"` and `role="group"` with `aria-label="예시 사진"` (it is non-modal, so not `dialog`).
  2. Triggers get `aria-controls="cp-samples"`.
  3. On open, focus the first `.cp-thumb`.
  4. `keydown` Escape on the popover or trigger closes it and returns focus to the trigger (`useRef` on the trigger button).
  5. The outside-close listener uses `pointerdown` instead of `mousedown`.
- **Verify:** `behaviour.samplePopEscape === true`, and focus goes to the first thumbnail on open.

**A-12 [P2] Accessibility: no double names in message rows**
- **Files:** `common/Avatar.tsx`, `chat/MessageList.tsx`.
- **Change:** Avatar takes a prop `decorative?: boolean`. When true, it renders `aria-hidden="true"` with no `role`, `aria-label` or `title`. MessageList passes `decorative` to row avatars and the typing avatar. Schedule card avatars keep their labels.
- **Verify:** the accessibility snapshot of a Tachi row reads "타치 오후 7:40 …" once.

**A-13 [P2] Performance / CLS: reserved image boxes**
- **Files:** `cards.css`, `MemoryCards.tsx`, `pages/senior/senior.css`.
- **Change:**
  1. `.cd-photo-in { width: 100%; height: 200px; object-fit: cover; background: var(--bg-chrome); border-radius: var(--radius-lg); }`.
  2. Override with fixed `height` (not `max-height`) for `.cd-photo-mem` (140 px), `.senior .cd-photo-mem` (120 px) and `.cd-photo-recall` (120 px).
  3. `.sa-sheet-img { aspect-ratio: 5 / 4; height: auto; }`.
  4. Add `decoding="async"` to card `<img>`s.
- **Verify:** with image requests aborted (`page.route('**/*.jpg', r => r.abort())`), `.cd-photo-mem` still measures 140 px high (120 px for the senior variant).

**A-14 [P2] H5 Error prevention: hide the stale scheduling action**
- **Files:** `chat/ActionBar.tsx`.
- **Change:**
  1. `const art = useTachi(s => (message.payload?.type === 'artifact' ? s.artifacts[message.payload.artifactId] : undefined));`
  2. Filter: `const actions = (message.actions ?? []).filter(a => !(a.id === 'start_scheduling' && art && art.dateStatus !== 'undecided'));`
  3. Return `null` when the filtered list is empty.
- **Verify:** in the family thread, the artifact card with a confirmed date shows only "기획서 열기".

**A-15 [P2] Accessibility 2.3.3: smooth scroll respects reduced motion**
- **Files:** `chat/MessageList.tsx`.
- **Change:** `const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;`. In `toBottom` and `toCard`, use `behavior: smooth && !reduce ? 'smooth' : 'auto'`.
- **Verify:** with `reducedMotion: 'reduce'`, `Element.prototype.scrollTo` (spied) is never called with `'smooth'`.

**A-16 [P2] Responsive: family-side card targets**
- **Files:** `cards.css`.
- **Change:**
  - `.cd-art-head { min-height: var(--target-min); }` for all pointers;
  - `@media (pointer: coarse) { .cd-tab, .cd-more, .cd-disc summary { min-height: var(--target-min); } }`.
- **Verify:** `coarseTargets_family` has no `.cd-*` entries.

**A-17 [P2] Theming: A files on tokens**
- **Files:** `Composer.css`, `MessageList.css`, `senior.css`, `cards.css`, `MemoryTile.css`, `common.css`, `MemoryGraph.css`, `HealthSummaryView.css`.
- **Change (mechanical replacement):**
  - `var(--color-edge-gray)` → `var(--fill-disabled)`;
  - `var(--color-graphite-ink)` → `var(--ink)`;
  - `var(--color-pure-white)` → `var(--ring-gap)`;
  - `var(--color-user-bubble)` → `var(--bubble)`;
  - `var(--color-ink-press)` → `var(--surface-tooltip)`;
  - `.sa-seg` focus rule → deleted (A-01).
  - **Font sizes:**
    - `17px` → `var(--senior-caption)`;
    - `18px` → `var(--senior-control-text)` for chips, segmented and `.sa-dl` labels, or `var(--senior-caption)` for `.sa-note`;
    - `19px` → `var(--senior-control-text)` for `.cp-photo-btn` and `.cd-slots-s .chip`, or `var(--senior-body)` for `.senior .cd-title`, `.cd-warm`, `.cd-story`, `.cp-err-s`, `.ml-retry-s`, `.senior .cd-err`;
    - `20px` → `var(--senior-body)`, except `.hs-big` → `var(--text-title)`;
    - `22px` → `var(--senior-wordmark)` for `.sa-word`, or `var(--senior-title)` for `.sa-center-t`, `.sa-empty-t`;
    - `24px` → `var(--senior-title)`;
    - `26px` → `.cd-bigdate` gets `var(--text-heading)` plus `.senior .cd-bigdate { font-size: var(--senior-heading) }`, and `.hs-senior .hs-big` gets `var(--senior-heading)`;
    - `32px` `.mt-noimg` → `var(--text-heading)`;
    - `12px` / `13px` → `var(--text-micro)` / `var(--text-small)` (except SVG labels; see A-10).
  - **Radii:**
    - 10 px → `var(--radius-lg)`;
    - 14 px (`.cd-hop`) and 28 px (`.cp-input`) → `var(--radius-pill)`;
    - 16 px → `var(--radius-2xl)`;
    - 18 px → `var(--radius-bubble)`.
  - **Fixed heights to min-height:** `.sa-header { height: 56px }` → `min-height: 56px`; `.cp-senior .cp-input { height: 56px }` → `min-height: 56px`.
  - **Clean-up:** delete the duplicate `.sr-only` in MemoryGraph.css, and move `.cd-spin`'s reduced-motion rule into cards.css.
- **Verify:**
  - `grep -rnE "font-size: *[0-9]+px" web/src/components web/src/pages/senior --include=*.css` returns only `MemoryGraph.css` SVG label lines;
  - `grep -rn "var(--color-" web/src/components web/src/pages/senior` returns nothing;
  - visual diff at 390 px shows only the intended 19→20 and 18→17/18 changes.

**A-24 [P2] Integrity: static `side-tab`**
- **Files:** `cards.css:28`.
- **Change:** `.cd-story { margin: 0; padding: var(--space-10) var(--space-12); background: var(--bg-chrome); border-radius: var(--radius-lg); color: var(--text); line-height: 1.6; font-size: var(--text-body); }` (no `border-left`).
- **Verify:** `npx -y impeccable@4.8.1 detect --json web/src` prints `[]` (exit 0).

**A-25 [P2] Accessibility: one toast region on the senior app, sized for seniors**
- **Files:** `common/common.css` (pairs with B-08).
- **Change:**
  - `.senior .toast { font-size: var(--senior-caption); padding: var(--space-12) var(--space-20); }`;
  - `.senior .toasts { bottom: calc(160px + env(safe-area-inset-bottom)); }` (above the composer).
  - Keep `<Toasts />` in `SeniorApp.tsx`.
- **Verify:** after B-08, `document.querySelectorAll('.toasts').length === 1` on `/senior`, and a toast does not overlap `.cp-senior`.

**A-18 [P3] Accessibility: ARIA hygiene**
- **Files:** `MemoryCards.tsx`, `common/SpeakButton.tsx`, `chat/Composer.tsx`, `cards/TripCards.tsx`, `common/ModelSwitcher.tsx`.
- **Change:**
  1. `.cd-graph` and `.cd-path` divs get `role="group"`.
  2. SpeakButton keeps a constant `aria-label="소리내어 읽기"` with `aria-pressed`. Do the same for the mic: a constant `aria-label="말로 입력하기"`.
  3. ItineraryCard tabs:
     - tabs get `id={\`it-${message.id}-${i}\`}` and `aria-controls={\`itp-${message.id}\`}`;
     - wrap the timeline in `<div role="tabpanel" id={\`itp-${message.id}\`} aria-labelledby=…>`;
     - roving `tabIndex` with ArrowLeft and ArrowRight.
  4. ModelSwitcher drops `role="listbox"`/`role="option"`; rows become buttons with `aria-pressed`.
- **Verify:** an axe-core run on the senior and family states shows 0 violations, if axe is available. Otherwise, manual review against the APG patterns.

**A-19 [P3] H2: plain-language provenance**
- **Files:** `MessageList.tsx` (`ModelLine`).
- **Change:** `'규칙 응답'` → `'자동 안내'`; `'오프라인 응답'` → `'기본 응답'`. Keep `m.model` when present.
- **Verify:** these strings are absent from the family thread.

**A-20 [P3] H6: labelled sample-photo button**
- **Files:** `Composer.tsx`, `Composer.css`.
- **Change:**
  - `.cp-sample-btn` renders `<Images size={20} /><span className="cp-sample-l">예시</span>`;
  - CSS `.cp-sample-btn { flex-direction: column; gap: 0; } .cp-sample-l { font-size: var(--senior-caption); line-height: 1.1; }`.
- **Verify:** the visible text "예시" is present and the button is still 56×56.

**A-21 [P3] Cognitive load: at most 4 slot choices for the senior**
- **Files:** `cards/GatheringCards.tsx` (`ScheduleRequestCard`).
- **Change:** in the senior variant, when unanswered, show the first 4 slots plus any selected ones, then `<button className="cd-link cd-more" aria-expanded={more} onClick={…}>다른 시간 더 보기 (+N)</button>`.
- **Verify:** the senior schedule card shows ≤ 5 chips (4 slots plus "다른 시간 더 보기") before expanding.

**A-22 [P3] H10: senior help sheet (replaces the duplicate header gear)**
- **Files:** `pages/senior/SeniorApp.tsx`, new `pages/senior/HelpSheet.tsx`, `senior.css`.
- **Change:**
  1. Replace the header settings button with `<button className="sa-icon-btn" aria-label="도움말"><CircleHelp size={24} /></button>`.
  2. It opens a `.sa-sheet` dialog (with `useModal`, A-02). Title `<h2 id="sa-help-title">타치 사용법</h2>`.
  3. A `<ul>` of five rows, each a lucide icon (20 px, `aria-hidden`) plus text, with this exact copy:
     1. Camera: "사진 보여주기를 누르고 옛날 사진을 고르세요. 타치가 하나씩 여쭤볼게요."
     2. Mic: "마이크를 누르고 말씀하셔도 돼요."
     3. Search: "‘불국사’처럼 장소나 사람 이름을 말하면 그 추억을 다시 꺼내 드려요."
     4. Lock: "새 추억은 처음엔 ‘나만 보기’예요. ‘가족 공개’로 바꿔야 가족이 볼 수 있어요."
     5. Volume2: "스피커 버튼을 누르면 소리 내어 읽어 드려요."
  4. A `.btn btn-primary sa-wide` "알겠어요" closes the sheet.
- **Verify:** the header button opens the sheet, Escape closes it, and focus returns to the button.

**A-23 [P3] Integrity: dead CSS and sticky hover**
- **Files:** A CSS files.
- **Change:**
  - delete the unused `.cd-story-wrap`, `.cd-clamp` and `.cd-dl-2 > .cd-wide` (check `grep -rn` first);
  - wrap every `:hover` rule in A files in `@media (hover: hover) { … }` (`.sa-tab`, `.sa-icon-btn`, `.cp-round`, `.cp-thumb`, `button.mt`, `.speak-btn`, `.ms-pill`, `.ms-row`, `button.cd-art-head`, `.cd-seg`/`.seg`).
- **Verify:** `grep -c ":hover" <file>` matches the count inside `(hover: hover)` blocks.

**A-26 [P3] Integrity: recall alternatives not clipped**
- **Files:** `MemoryCards.tsx` (`RecallCard`), `cards.css`.
- **Change:** remove `.cd-alt-1` (nowrap/ellipsis). Render the alternatives as `<div className="cd-row">` of `<button className="chip">` (title text).
- **Verify:** no `.cd-alt` descendant has `scrollWidth > clientWidth`.

### Group B: `web/src/pages/family/**`, `web/src/pages/demo/**`, `web/src/pages/Landing.tsx`, `web/src/App.tsx`

**B-01 [P1] Responsive / H8, detector `flat-type-hierarchy`: family header**
- **Files:** `pages/family/FamilyApp.css`, `FamilyApp.tsx`.
- **Change:**
  1. CSS:
     ```css
     .fam-head-title { font-size: var(--text-title); }        /* 20px: ladder 16→20 = 1.25 */
     .fam.is-narrow .fam-stack { display: none; }               /* participants stay in 더 보기 */
     @media (max-width: 359px) { .fam-head { gap: var(--space-4); padding-right: var(--space-4); } .fam.is-narrow .fam-head { padding-left: var(--space-4); } }
     ```
  2. TSX: `<h1 className="fam-head-title" title={room?.title}>`; `.fam-stack` gets `role="group"`.
- **Verify:**
  - `titleTruncated === false` at 320, 360 and 390 px (validated);
  - no `flat-type-hierarchy` in any family state (validated);
  - in a Director screenshot, the right-hand phone header reads "우리 가족".

**B-02 [P1] Accessibility 2.4.3, detector `nested-cards` (`.mp-graph-box`): mobile panel sheet becomes a modal dialog**
- **Files:** `FamilyApp.tsx`. Depends on A-02.
- **Change:**
  1. Replace `<aside className="fam-sheet" aria-label=…>` with `<div className="fam-sheet" role="dialog" aria-modal="true" aria-labelledby="fam-panel-title" ref={sheetRef}>`.
  2. `const sheetRef = useRef<HTMLDivElement>(null)`. The sheet content goes in a child component (or inline `useModal` gated by `panel && narrow`) that calls `useModal(sheetRef, () => setPanel(null))`.
  3. Give `h2.fam-panel-title` an `id="fam-panel-title"`.
  4. Add `data-autofocus` to the panel close button.
  5. The scrim gets `aria-hidden`.
  6. Keep the desktop `<aside className="fam-panel">` non-modal.
- **Verify:** `behaviour.familySheet` is `{role:'dialog', focusMovedIn:true, tabTrapped:true, escapeCloses:true}`, and there is no `nested-cards` in `family-embed-mom-memory` (validated).

**B-03 [P2] Integrity `skipped-heading` (h2 → h4): health panel**
- **Files:** `MomPanel.tsx`. Depends on A-06.
- **Change:** `HealthTab` returns `<HealthSummaryView summary={health} variant="family" headingLevel={3} />`.
- **Verify:** no `skipped-heading` in `family-embed-mom-health` or `family-desktop-health`.

**B-04 [P2] Theming / contrast, detector `nested-cards` + `text-occlusion`: Director cleanup**
- **Files:** `pages/demo/DirectorConsole.css`, `DirectorConsole.tsx`.
- **Change:**
  1. CSS:
     ```css
     .dc-stale { margin: var(--space-6) 0; padding: var(--space-6) var(--space-10); border-radius: var(--radius-lg); background: var(--bg-chrome); border: 1px solid var(--border); }
     .dc-model { gap: var(--space-6); padding: var(--space-4) var(--space-6); border-radius: var(--radius-sm); }
     .dc-model:hover:not(:disabled) { background: var(--hover); }
     .dc-ok { color: var(--text-2); }
     .dc-bad { color: var(--text); font-weight: var(--weight-semibold); }
     .dc-recall { margin-top: var(--space-8); padding: var(--space-8) var(--space-12); border: 0; border-top: 1px solid var(--border); border-radius: 0; display: grid; gap: var(--space-6); font-size: var(--text-small); }
     .dc-chip { padding: 1px var(--space-8); border-radius: var(--radius-pill); background: var(--hover); font-size: var(--text-micro); }
     .dc-chip.is-node { background: var(--inverse-bg); color: var(--inverse-text); }
     .dc-cypher { padding: var(--space-6) var(--space-8); border-radius: var(--radius-sm); background: var(--bg-chrome); border: 1px solid var(--border); font-size: var(--text-micro); }
     .dc-phone { border-radius: var(--radius-device); }  .dc-graph-box { border-radius: var(--radius-device-inner); }
     ```
     - `.dc-step.is-next:hover` uses `var(--inverse-bg-hover)`;
     - `.dc-dot.is-on` uses `var(--ink)`;
     - delete `.dc-graph-stats`.
  2. TSX:
     - delete the absolutely positioned `<div className="dc-graph-stats">`;
     - append its text to the panel label: `기억 그래프 · {engineLabel} · 노드 {nodes.length} · 관계 {edges.length}{fresh.length ? \` · 방금 +${fresh.length}\` : ''}`;
     - replace the key-error inline `style` objects with `className="dc-keyerr"`, add CSS `.dc-keyerr { min-height: 100dvh; display: grid; place-items: center; padding: var(--space-24); text-align: center; } .dc-keyerr h1 { font-size: var(--text-heading); margin-bottom: var(--space-8); }`, and remove `var(--text-h2, 22px)`.
- **Verify:**
  - `grep -nE "#[0-9a-fA-F]{3,8}|rgba?\(" web/src/pages/demo/DirectorConsole.css` returns only `.dc-qr img { background: #fff }` (documented QR exception);
  - `demo-graph`, `demo-graph-dark` and `demo-light` are CLEAN.

**B-05 [P2] Accessibility 4.1.2 / 2.1.1: menus**
- **Files:** `Sidebar.tsx`, `FamilyApp.tsx`.
- **Change:**
  1. **Persona menu:**
     - remove `role="menu"`, `role="none"` and `role="menuitemradio"`;
     - rows become `<button className="fam-menu-item" aria-pressed={u.id === me?.id}>`;
     - the trigger keeps `aria-expanded`, adds `aria-controls="fam-persona-menu"`, and removes `aria-haspopup`;
     - on open, focus the pressed row;
     - Escape closes and calls `triggerRef.current?.focus()`.
  2. **"더 보기" menu:**
     - delete `onMouseLeave`;
     - add the Sidebar's outside-click and Escape effect (with a `pointerdown` listener);
     - `aria-controls="fam-more-menu"`, `id="fam-more-menu"`;
     - on open, focus the first focusable item.
- **Verify:** `behaviour.moreMenuEscape === true`; moving the mouse off the open menu keeps it open; arrow keys are not required (no menu role).

**B-06 [P2] Responsive: family and artifact touch targets**
- **Files:** `FamilyApp.css`, `MomPanel.css`, `ArtifactPanel.css`, `ArtifactPanel.tsx`, `family.css`.
- **Change:**
  1. Coarse-pointer floor:
     ```css
     @media (pointer: coarse) {
       .fam-room, .fam-persona-btn, .fam-menu-item, .fam-banner, .mp-tab, .ap-add, .ap-select { min-height: var(--target-min); }
       .ap-rm { min-height: var(--target-min); width: var(--target-min); }
     }
     ```
  2. ArtifactPanel: wrap each task checkbox in `<label className="ap-check-hit">`; CSS `.ap-check-hit { display: inline-flex; align-items: center; justify-content: center; min-width: 32px; min-height: 32px; } @media (pointer: coarse) { .ap-check-hit { min-width: var(--target-min); min-height: var(--target-min); } } .ap-check { width: 20px; height: 20px; }`.
  3. `.fam-search { border-color: var(--border-field); }` (1.4.11).
- **Verify:** `coarseTargets_familyMom` is empty apart from inline links; the artifact panel at 390 px in a touch context has no target under 44 px.

**B-07 [P2] Performance: route-level code splitting**
- **Files:** `web/src/App.tsx`, new `web/src/App.css`.
- **Change:**
  1. Lazy routes:
     ```tsx
     const Landing = lazy(() => import('./pages/Landing'));
     const SeniorApp = lazy(() => import('./pages/senior/SeniorApp'));
     const FamilyApp = lazy(() => import('./pages/family/FamilyApp'));
     const DirectorConsole = lazy(() => import('./pages/demo/DirectorConsole'));
     ```
  2. `<Suspense fallback={<div className="route-loading" role="status">불러오는 중…</div>}>` around `<Routes>`.
  3. `App.css`: `.route-loading { min-height: 100dvh; display: grid; place-items: center; color: var(--text-2); font-size: var(--text-caption); }`.
- **Verify:** `npm run build` emits ≥ 4 JS chunks, and loading `/senior?as=mom` does not request a chunk containing `DirectorConsole`.

**B-08 [P2] Accessibility: duplicate toast live region**
- **Files:** `App.tsx`.
- **Change:** `const { pathname } = useLocation();`, then render `{pathname !== '/senior' && <Toasts />}`. SeniorApp renders its own inside `.senior` (A-25).
- **Verify:** `toasts === 1` on every senior state in verify-design.cjs.

**B-09 [P2] H9: family connection-error recovery**
- **Files:** `FamilyApp.tsx`.
- **Change:**
  - In the boot block, when `status === 'error'`, render `role="alert"` with the copy "연결이 잠시 끊겼어요. 잠시 후 다시 연결해 주세요." and `<button className="btn btn-primary" onClick={() => initTachi(personaId, true)}>다시 연결</button>`;
  - keep `role="status"` with "가족방에 연결하는 중…" while connecting.
- **Verify:** force the error (stop the socket or block `/socket.io` in Playwright), and the retry button appears and calls `initTachi`.

**B-10 [P2] Accessibility: Director has an `<h1>`**
- **Files:** `DirectorConsole.tsx`, `.css`.
- **Change:** `<h1 className="dc-title"><Link to="/" className="dc-brand">타치 · 디렉터</Link></h1>`; CSS `.dc-title { font-size: var(--text-body); font-weight: var(--weight-semibold); margin: 0; }`.
- **Verify:** `h1 === 1` on the demo states.

**B-11 [P2] Theming: B files on tokens**
- **Files:** `family.css`, `ArtifactPanel.css`, `FamilyApp.css`, `Dialog.css`, `Landing.css`, `DirectorConsole.css`.
- **Change:**
  - `var(--color-graphite-ink)` → `var(--ink)`;
  - `.fam-mark` 18 px → `var(--text-title)`;
  - `.dlg-title` 18 px → `var(--text-title)`;
  - `.ap-title` 20 px → `var(--text-title)`;
  - `.ld-mark` 40 px → `var(--text-display)`;
  - remaining DirectorConsole px font sizes → tokens;
  - `rgba(127,127,127,…)` → `var(--hover)`, `var(--border)` or `var(--bg-chrome)`;
  - `border-radius: 6px | 8px` → `var(--radius-sm)` / `var(--radius-lg)`.
  - Fixed heights to min-height: `.fam-head`, `.fam-side-head` and `.fam-panel-head` change `height: var(--header-height)` to `min-height: var(--header-height)`.
- **Verify:**
  - `grep -rn "var(--color-" web/src/pages/family web/src/pages/demo web/src/pages/Landing.css` returns nothing;
  - `grep -rnE "font-size: *[0-9]+px" web/src/pages/family web/src/pages/demo web/src/pages/Landing.css` returns nothing.

**B-12 [P3] Accessibility 2.3.3: sheet entrance under reduced motion**
- **Files:** `FamilyApp.css`.
- **Change:** `@media (prefers-reduced-motion: reduce) { @keyframes fam-slide { from { opacity: 0; } to { opacity: 1; } } }`.
- **Verify:** the reduced-motion keyframe check in the harness reports it overridden.

**B-13 [P3] Integrity: cascade collision and duplicate label**
- **Files:** `family.css`, `InviteDialog.tsx`, `FamilyApp.css`, `Sidebar.tsx`.
- **Change:**
  - rename the dialog's `.fam-none` to `.fam-contacts-empty` (CSS and InviteDialog);
  - delete the unused `.fam-foot-link` rules;
  - in the Sidebar row, render the `일정 조율` badge only when `!r.title.includes('일정 조율')`.
- **Verify:** "대화방을 선택해 주세요" keeps 48 px padding after the invite dialog has been opened; the side-room row shows the label once.

**B-14 [P3] H10: family example asks**
- **Files:** `FamilyApp.tsx`, `FamilyApp.css`.
- **Change:** the "더 보기" menu gets a section `<p className="caption muted fam-menu-h">타치에게 이렇게 물어보세요</p>` followed by three non-interactive rows (class `fam-menu-tip`, `--text-caption`, `--text-2`), with this exact copy:
  1. "‘타치, 엄마 요즘 혈압 괜찮으셔?’"
  2. "‘타치, 모임 시간 잡아줘’"
  3. "‘엄마 생신에 다 같이 모이자’라고 하면 모임 기획서를 만들어요"
- **Verify:** the menu shows the three tips.

**B-15 [P3] Accessibility: MomPanel tabs keyboard model**
- **Files:** `MomPanel.tsx`.
- **Change:** use a roving `tabIndex` (only the selected tab is 0). ArrowLeft and ArrowRight move to the previous/next tab, and Home/End to the first/last; selection follows focus.
- **Verify:** Tab reaches one tab; ArrowRight moves to 건강 and shows its panel.

**B-16 [P3] Theming: Director toggle uses the shared theme helper**
- **Files:** `DirectorConsole.tsx`. Depends on C-08.
- **Change:** replace `document.documentElement.dataset.theme = theme` with `applyTheme(theme)` from `../../styles/theme`.
- **Verify:** toggling to dark updates `meta[name=theme-color]` to `#212121`.

**B-17 [P3] Responsive: sticky hover (B files)**
- **Change:** wrap every `:hover` rule in `FamilyApp.css`, `ArtifactPanel.css`, `MomPanel.css`, `family.css`, `Landing.css` and `DirectorConsole.css` in `@media (hover: hover)`.
- **Verify:** same grep check as A-23.

### Group S: optional, server (outside A/B/C; required only for Performance 4)

**S-01 [P2] Performance: asset delivery**
- **Files:** `server/index.ts`.
- **Change:** for `/assets/*`, serve pre-compressed or gzip-on-the-fly responses with `Content-Encoding: gzip` (Node `zlib`, no new dependency, cached in memory) and `Cache-Control: public, max-age=31536000, immutable`. For `/demo-photos/*`, use `max-age=86400`.
- **Verify:** `curl -sI -H 'Accept-Encoding: gzip' http://localhost:4100/assets/<js>` shows `Content-Encoding: gzip` and `immutable`.

**S-02 [P3] Copy consistency**
- **Change:** `server/orchestrator/senior.ts:440` `${title} — ${reason}` → `${title}. ${reason}`; `server/orchestrator/artifacts.ts:197` → `${art.title} 모임 기획서를 만들어 봤어요. 함께 다듬어 주세요.`
- **Verify:** grep finds no "—" in user-facing server strings.

---

## 9. Definition of Done and How to Re-verify

1. `npm run typecheck` and `npm run build` pass. The orchestrator restarts the production server on :4100.
2. The static scan prints `[]` (exit 0):
   ```bash
   npx -y impeccable@4.8.1 detect --json web/src
   ```
3. CLI URL scans print `[]` (exit 0) for each of:
   - `/senior?as=mom&embed=1`
   - `/senior?as=mom&embed=1&theme=dark`
   - `/family?as=jieun&embed=1`
   - `/family?as=jieun`
   - `/family?as=jieun&embed=1&theme=dark`
   - `/demo?key=demo42`
   - `/`

   Command:
   ```bash
   IMPECCABLE_BROWSER=<chrome-nosandbox.sh> npx -y impeccable@4.8.1 detect --json http://localhost:4100<path>
   ```
4. The state matrix exits 0. That means 0 detector findings (including advisories) in all 35 states, 0 contrast or placeholder failures, no truncated family title, one toast region on the senior app, and every `behaviour` check true:
   ```bash
   cd /tmp && npx -y impeccable@4.8.1 live-server --background
   NODE_PATH=$(npm root -g) node /home/user/tachi/docs/design/tools/verify-design.cjs
   (cd /tmp && npx -y impeccable@4.8.1 live-server stop --keep-inject)
   ```
   **Baseline today:** 32 detector findings and 15 hard failures.
5. Manual: one keyboard-only pass through senior (chat, album, sheet, privacy, help) and family (thread, panel, artifact, invite). The focus ring must be visible at every stop, Escape must close every overlay, and focus must return to the opener.

**Expected scores after the full list:**

| Score | Before | After |
|---|---|---|
| Audit | 13/20 | **20/20** (19 without S-01) |
| Nielsen | 29/40 | **≈34/40** |

The Nielsen rise comes from: H1 +1 (decided state, stale CTA), H8 +1 (rhythm, duplication, truncation), H10 +1 (help sheet and examples), H9 +1 (family retry), and H3 partly (Escape everywhere). H7 stays at 3 because the family app deliberately has no power-user shortcuts.

## 10. Questions for the User (relay)
1. **Senior graph:** keep the mini graph inside the senior memory card (with larger labels, A-10), or show it only in the album and the Director? *Options: keep in card / album + Director only.*
2. **Senior help (A-22):** replace the header gear with a 도움말 button? The gear duplicates the 설정 tab. *Options: replace / keep both / skip.*
3. **Server scope (S-01):** may the server owner add gzip and immutable caching so Performance can reach 4? *Options: yes / no, accept 19/20.*
