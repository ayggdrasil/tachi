# QA round: `feat/integration` (PR #1, tool loop + to-do execution)

| | |
|---|---|
| Date | 2026-11-09 |
| Reviewer | QA lead (Claude, Opus 5.5), running gstack `/qa` + `/design-review` and impeccable `audit` / `critique` by hand |
| Branch | `feat/integration` at `c5f6ed9`, then merged with `origin/feat/integration` `6058592` (latest main) mid-round |
| Commits in this round | `841e500`, `d478f0e`, `4343725`, `f76682a`, `a27805e`, `118a3a7` (merge), `338cb82`, `a0dbebe` |
| Server | `npm run build`, then `NODE_ENV=production TACHI_DIRECTOR_KEY=demo42 PORT=4261 npx tsx server/index.ts`, each run on a fresh `TACHI_DATA_DIR`; English (default) and `TACHI_LOCALE=ko` |
| Evidence | Screenshots and logs are in the session scratchpad, not committed: `/tmp/claude-0/-home-user-tachi/133f30ab-6ba8-54db-873e-85ab76e07a83/scratchpad/` (called `$S` below) |

## Summary

QA found **20 issues**. **15 are fixed and verified**: 8 P1 and 7 P2. **5 P2s are deferred**: 3 belong to main, and 2 need a product decision. No P0 was found. In particular, no privacy leak: family-facing tools and answers never showed a private item, either in the browser or in the tests.

The P1s are all one problem: **the PR's features did not work in the English default locale.**
- Every to-do and tool-loop string was Korean.
- English task texts were misclassified. "Book lodging and restaurants" became a reminder instead of a booking.
- English replies in the side room ("I'll do it later", "I need help") were not understood.
- The offline planner ignored English. As a result, "what's worth visiting near Bulguksa?" fell through to the state machine, which answered with Mom's blood-pressure summary.
- The live loop's system and verification prompts were Korean, so with a live key the model would have answered in Korean.

All of this now works in English, and Korean behaves exactly as before. Main's `DEMO_SCRIPT` / `DEMO_SCRIPT_EN` beats are unchanged: FLOWS, SMOKE, EN TEST and AGENT TEST all pass, and both captures finished with no errors.

**PR summary:** QA found 20 issues and fixed 15. Health score went from 87 to 99. The impeccable audit went from 12/20 to 15/20.

## Methods

| Method | How it was run | Tool or by hand |
|---|---|---|
| gstack `/qa` Phases 1–10 (`qa/SKILL.md`, `sections/exploratory.md`, `qa-patterns.md`) | Baseline, triage, fix loop (regression test first, then repair, re-test, commit per fix), final QA and this report. Preamble, telemetry, learnings, deadline/evidence binaries and Conductor steps were skipped, and no gstack code was run. Charters and probes were written by hand. | by hand |
| gstack `/design-review` (10-category checklist, trunk test, interaction-flow review) | Applied to the screenshots and the DOM of the changed surfaces | by hand |
| Demo capture | `scripts/qa/capture.ts` on 390×844 phones plus 1440 desktop/Director. Fixed first: it always replayed the Korean script (ISSUE-015). Runs: `$S/shots-before-en/`, `$S/shots-after-en/`, `$S/shots-after-ko/` (39 shots each, `errors: []`) | Playwright (preinstalled) |
| Feature probe | `$S/probe/probe.mts` exercises the new features at 390 and 1440 and collects console errors and any Hangul in English screens: gathering artifact, panel task rows, booking button, assignee reminder, typed later/help replies, family escalation, Director follow-ups and toast, tool-loop requests, report open-tasks line, desktop panel, horizontal overflow. Logs: `$S/probe-before-en.log`, `$S/probe-after-en.log`, `$S/probe-final-en.log`, `$S/probe-after-ko.log` | Playwright + socket.io, script written by hand |
| a11y measurements | `$S/probe/a11y.mts`: contrast of task-row text in light and dark, target sizes, focus ring | Playwright, by hand |
| impeccable `audit.md` / `critique.md` | Scored the changed UI (TaskCards, ArtifactPanel task rows, ActionBar task actions, report open-tasks list, Director button) and the app overall | by hand |
| `npm run design:detect` | Ran offline. Source scan: 69 files, **0 findings** (regex rules only, so this is an undercount per the tool). URL scans (`--viewport 390x844` / `1440x900`) of `/family`, `/senior` and `/demo` returned `[]`. I could not confirm that the URL scan actually rendered the SPA, so it is not counted as evidence. | tool |

## Health score (gstack rubric)

| Category (weight) | Before | After | Notes |
|---|---|---|---|
| Console (15%) | 100 | 100 | 0 console or page errors in every run |
| Links (10%) | 100 | 100 | Booking deep links are well-formed (Naver, Kakao, Korail, SRT) |
| Visual (10%) | 79 | 97 | Before: ISSUE-009 (High), 010 and 011 (Low). After: 020 (main, Low) |
| Functional (20%) | 66 | 97 | Before: 004 (High), 002 and 003 (Medium), 008 (Low). After: 016 (Low) |
| UX (15%) | 89 | 97 | Before: 013 (Medium), 011 (Low). After: 019 (main, Low) |
| Performance (10%) | 100 | 100 | |
| Content (5%) | 82 | 97 | Before: 001/005/007 (High), 012 (Low). After: 018 (main, Low) |
| Accessibility (15%) | 89 | 100 | Before: Korean aria-labels in English (Medium), 014 (Low) |
| **Score** | **87** | **99** | |

## impeccable audit (0–4)

Scope: the changed and new UI, judged in the context of the whole app.

| # | Dimension | Before | After | Key finding |
|---|---|---|---|---|
| 1 | Accessibility | 2 | 3 | Before: English screen-reader users heard Korean ("…완료", "…담당자", "(새 창)", status chips), and the owner select and "Open link" were under 24px. After: labels follow the locale, targets are at least 24px, task-row contrast is 5.1–19.4:1 in light and 6.4–13.6:1 in dark, and the global focus ring applies. Not 4, because the checkbox is 20px (inside a 32px hit area) and the action button is 32px on fine pointers. |
| 2 | Performance | 3 | 3 | No change. Each TaskCard subscribes to one artifact task (a cheap selector). |
| 3 | Theming | 3 | 3 | Tokens are used throughout. The new compact chip uses only existing tokens. |
| 4 | Responsive | 2 | 3 | Before: the report's open-tasks rows broke apart at 390 (chip, text and owner on separate lines; one row also broke at 1440), and gathering-card icons shrank when a to-do wrapped. After: 390 and 1440 both look right with no horizontal overflow. |
| 5 | Implementation integrity | 2 | 3 | Before: Korean-only copy in an English product, a status chip that went stale after a reply, and "경주 경주 숙소" on re-share. After: minor isolated issues remain (016–020). `design:detect` reports 0 findings. |
| **Total** | | **12/20** | **15/20** | Before: Acceptable. After: Good. |

### impeccable critique (changed UI)

- **Task card (side room and family room).** The hierarchy is good: kicker (stage · plan), then task title, then Tachi's line, then status / owner / due, then links, then buttons. Two problems are fixed:
  - The chip went stale. After "I need help" the earlier card still read "To do". Fixed in ISSUE-013.
  - The due line wrapped with an orphaned "·". Fixed in ISSUE-011.
  - The meaning of the monochrome chips (outline, fill, dashed, icon shape) holds up well in both themes.
- **Booking card.** The links are clear, full-width 44px rows with a new-tab hint for screen readers. The primary button said "Booked", which reads like a status; it now says "Mark as booked". Korean keeps "예약 완료", the established wording.
- **ArtifactPanel task rows.** Dense but legible at 390. The action button wraps onto its own line, right-aligned, which is acceptable. The follow-up history line ("Reminded · Tue, Nov 10 1:00 PM") is now localized and useful.
- **Report open-tasks list.** It was the weakest surface (ISSUE-009). It now reads as a calm checklist.
- **Director "Follow up on tasks".** Discoverable and labelled. The toast was Korean and is now localized ("Followed up on 3 to-dos.").
- **gstack design scores.** Design B → B+ (hierarchy and typography unchanged; layout and content fixed). AI-slop A: the deliberate monochrome system, no gradients, no emoji.

## Findings

| ID | Sev | Page / surface | Description | Status | Commit |
|---|---|---|---|---|---|
| ISSUE-001 | P1 | Side rooms, family room, Director | All to-do server copy was Korean in English: reminder/nudge/escalation/booking cards, card buttons, side-room title "할 일 · …", the typed-reply prompt, follow-up notes, and the Director follow-ups toast (`socket.ts`). Due dates also used Korean labels. | fixed (`task.*` keys in `server/i18n/strings.ts`; Korean copy unchanged) | `d478f0e` |
| ISSUE-002 | P1 | Gathering tasks | `classifyTask` only matched Korean. "Book lodging and restaurants" became a reminder, and "Reserve a table" and "Book a rental car" were not bookings. | fixed (English patterns; `query` stays the canonical Korean noun used in the map URLs) | `d478f0e` |
| ISSUE-003 | P1 | Side rooms | Typed English replies ("I'll do it later", "I need help", "Done") were not recognised. Tachi answered with a Korean prompt asking the user to choose. | fixed | `d478f0e` |
| ISSUE-004 | P1 | Senior chat, family room | The offline planner and the live routing patterns only matched Korean. English reminder, route and place requests fell through: the senior got "…you said. Take your time.", and family questions got Mom's blood-pressure summary. The family-room gate also only matched Korean names. | fixed (English planner, live patterns and gate; DEMO_SCRIPT_EN lines verified not to match) | `4343725` |
| ISSUE-005 | P1 | Tool loop | Composed answers, route notes, place names, "X asked me to remind you", reminder delivery and quick replies, the session log, the tool labels behind "타치가 확인한 것", and the live system and verification prompts were all Korean. A live model would therefore answer in Korean. | fixed | `4343725` |
| ISSUE-006 | P1 | Tool loop | `parseWhen` did not understand English times (8am, 3:30 pm, noon, tonight, in 30 minutes, Friday at 10, next Monday, Nov 12), and `whenLabel` was Korean. Health reminders were only detected in Korean. | fixed | `4343725` |
| ISSUE-007 | P1 | TaskCards, ArtifactPanel, report, MessageList | The web to-do UI was Korean-only: status chips, kickers, "담당", "까지", the link list label, "(새 창)", panel action buttons and notes, aria-labels, "담당 미정", follow-up history, the open-tasks fallback, "타치가 확인한 것", and the execute timeout. `TASK_STATUS_LABEL` was a Korean-only shared constant. | fixed (kit/app dictionaries; constant removed) | `f76682a` |
| ISSUE-008 | P2 | Booking | Sharing booking links a second time prefixed the area twice ("경주 경주 숙소"), because `action.query` was overwritten with the full query. | fixed | `d478f0e` |
| ISSUE-009 | P1 | Daily report (390, 1440) | Open-tasks rows broke apart: the chip on its own line, the text below it, and "· Suyeon" on a third line. The compact chip looked like an empty checkbox. | fixed | `a27805e` |
| ISSUE-010 | P2 | Gathering card | To-do circle icons shrank when the text wrapped. | fixed | `a27805e` |
| ISSUE-011 | P2 | Task card | When the due line wrapped it started with an orphaned "·". The "Booked" button read like a status. | fixed ("Due …", "Mark as booked") | `a27805e` |
| ISSUE-012 | P2 | Family room (ko) | Wrong Korean subject particle: "동궁과 월지이 있어요". | fixed (`withJosa`) | `338cb82` |
| ISSUE-013 | P2 | Task card | The status chip and owner were snapshots, so a card kept showing "To do" after "I need help" or a reassignment. | fixed (reads the live task from the artifact store) | `a0dbebe` |
| ISSUE-014 | P2 | ArtifactPanel | The owner select (22px) and "Open link" (20px) were under the WCAG 2.5.8 minimum of 24px. | fixed | `a0dbebe` |
| ISSUE-015 | P2 | QA tooling | `scripts/qa/capture.ts` always replayed the Korean `DEMO_SCRIPT`, even against the English default, and clicked Korean tab names. | fixed (`demoScriptFor(locale)`) | `841e500` |
| ISSUE-016 | P2 | Side rooms | `taskRoomFor` reuses an existing 1:1 side room. To-do reminders and the scheduling poll can therefore share a room titled "To-do · …" that also shows a "Scheduling" badge. | **fixed** (decision: one side room per member). To-do rooms get the plain gathering title; the room list and header badge read \"Scheduling\" when a poll uses the room, otherwise \"To-do\". Regression check in `tasks.en.test`. | follow-up commit |
| ISSUE-017 | P2 | Family room | With health set to private, the family's "what reminders does Mom have?" answer is masked entirely ("This was made private by Mom."), including the hospital reminder the asker set herself. The cause: the answer carries the `health` category and the projection hides it. | **fixed** (decision: a family member sees reminders she set herself). Only reminders shown because the senior shared their category count toward the answer's privacy categories; Mom's private health reminders stay hidden. Regression check in `toolloop.en.test` (failed on the old code). | follow-up commit |
| ISSUE-018 | P2 | Health card (main) | In English, the medication slot labels inside the health card's aria text are Korean ("아침", "저녁"). They come from main's health seed / `HealthSummaryView`. `en.test` deliberately excludes medications from its Hangul check. | **deferred**: main's surface, outside this PR | — |
| ISSUE-019 | P2 | Daily report (main) | The highlight template inserts a capitalised session title: "talking about Recalling a memory" / "about Reminders & directions". | **deferred**: main's report template | — |
| ISSUE-020 | P2 | ArtifactPanel agenda (main) | At 390 the agenda rows' remove buttons do not line up (x=351–360). | **deferred**: main's agenda list, cosmetic | — |

Calendar: nothing calendar-related was added back.

## Regression tests (written before each repair, red on the old code)

| Test | Protects | Red evidence (old code) | Green |
|---|---|---|---|
| `server/scripts/tasks.en.test.ts` (new, in `npm test`) | ISSUE-001/002/003/008: English classification, booking labels with Korean URL words, English cards / buttons / side-room title / typed replies / escalation / ladder / Director toast / report, no Hangul in any task text a person reads | 12 FAILs, then a crash (no booking card for "Book lodging…") | TASKS EN OK (35) |
| `server/scripts/toolloop.en.test.ts` (new, in `npm test`) | ISSUE-004/005/006: English planner shapes, DEMO_SCRIPT_EN lines not planned and not routed to the live loop, English replies and labels, Mom's announcement, delivery, privacy of the reminder list, English live prompts (mocked Anthropic) | the planner had no English path (`reminderTextEn` missing; every request fell through) | AGENT EN OK (47) |
| `web/src/i18n/i18n.test.ts` (new, in `npm test`) | ISSUE-007: en/ko key parity for kit, app and server; required UI keys; no hard-coded Hangul in TaskCards, MiscCards, ArtifactPanel and MessageList | 2 of 3 tests failed | 3/3 |
| `server/scripts/toolloop.test.ts` (one check added) | ISSUE-012: particle | the probe log showed "월지이" | AGENT OK |
| `server/brain/toolLoop.test.ts`, `server/tools/tools.test.ts` | now pin `setLocale('ko')`, because they assert Korean output with Korean seed users | n/a | pass |

Layout fixes (009/010/011/013/014) were verified in the browser, per gstack: CSS-only defects may rely on browser evidence.

## Final QA (after all commits, merged with latest main)

- `npm run typecheck`: clean.
- `npm test`: exit 0. 91 node tests passed, 0 failed. FLOWS OK, TASKS OK (59), AGENT OK, SMOKE OK, EN TEST OK, TASKS EN OK (35), AGENT EN OK (47), AGENT TEST OK.
- `npm run build`: OK.
- Capture: English and Korean runs both finished with `errors: []`, and step timings matched the baseline (schedule about 11 s, everything else under 2 s).
- Probe in English (`$S/probe-final-en.log`): no Hangul in the panel, side room, senior chat or family chat. The only Hangul on the Director screen is the "한국어" option in the language picker. 0 console errors and no overflow at 390.
- Probe in Korean (`$S/probe-after-ko.log`): every to-do and tool-loop line keeps its original Korean wording.

## Screenshots (scratchpad, not committed)

- Before, English: `$S/shots-before-en/16-family-report.png` (broken open-tasks list), `$S/shots-before-en/13-family-gathering.png` (shrunken icon), `$S/probe-before-en/02-family-panel-taskrows.png` (Korean task rows in English), `$S/probe-before-en/04-side-reminder.png` (Korean reminder card)
- After, English: `$S/shots-after-en/16-family-report.png`, `$S/probe-after-en/02-family-panel-taskrows.png`, `$S/probe-after-en/03-family-booking-card.png`, `$S/probe-final-en/05-side-after-replies.png` (live "Needs help" chip), `$S/probe-after-en/09-family-report.png`, `$S/probe-after-en/10-family-desktop-panel.png` (1440), `$S/probe-final-en/06-director.png`
- After, Korean: `$S/shots-after-ko/`, `$S/probe-after-ko/04-side-reminder.png`

## Needs a decision

1. ~~ISSUE-016~~ and ~~ISSUE-017~~: decided and fixed (see the table).
2. **ISSUE-018/019/020** are in main's surfaces. Fix them in a main follow-up if wanted.
