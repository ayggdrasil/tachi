# /autoplan Review: Tachi (degraded mode)

| | |
|---|---|
| Date | 2026-11-09, 01:50–02:20 UTC |
| Reviewer | QA lead (Claude, Opus 5.5), running gstack `/autoplan` by hand |
| Input ("the plan") | `PLAN.md`, `README.md`, `shared/{types,constants}.ts`, `server/**`, `web/src/**`, shots in `docs/reviews/shots/` |
| Code reviewed | Commits `958c469`, `a346099` (round‑1 fixes), `548d0bb`, `3721e33`, `5d5d070`, `0c9f3dd`, plus the uncommitted round‑2 working tree as it stood at 02:20. Every finding below was re-checked at that point. |
| Screenshots | Taken at 01:42, **before** the round‑1 fixes. Where a screenshot shows something that has since changed, the finding says so. |
| Mode | Degraded (see Phase 0). Single reviewer. No Codex or subagent voices, so every consensus cell is N/A. |

---

## URGENT, outside this plan

None. No security or data-loss issue was found outside the plan's own scope. The privacy and authorization gaps found are in scope and listed as P0/P1 tasks.

## Plan Summary

Tachi is a Korean AI companion for seniors. A photo interview turns into a memory stored in the Kùzu graph DB, and keyword recall brings it back. Privacy is set per category. Tachi starts conversations on its own, reports to the family, suggests a trip and builds an itinerary, offers a collaborative gathering artifact, and coordinates a date through side chats. It runs on swappable LLMs with an offline demo brain, and a Director console drives a scripted 90‑second demo with AI family bots.

The build is in good shape. After round 1, typecheck, 18/18 tests, and the end-to-end smoke test all pass. All ten hard requirements work at least partially. **Four P0 issues remain that can still break or embarrass the live demo:**
- a duplicate daily report at the final step
- the most natural family health question is refused, with a grammar error
- the Director and model controls are open to anyone on the LAN by default
- untested live-LLM latency and token-budget settings, covered by a P1 rehearsal gate that becomes P0 once the presenter decides to demo with live keys

---

## Phase 0: Intake, scope and degraded-mode notes

- **Skipped as instructed:** preamble and skill-start scripts, telemetry, onboarding, Conductor/Codex steps, restore-point git commands, snapshot tool, `gstack-plan-reality`, `gstack-tasks`, `gstack-gate`. The helper binaries are missing because `./setup` was not run.
- **Questions the user would normally answer** (AskUserQuestion, taste choices, User Challenges) were auto-decided with the 6 principles. All of them are recorded in the Decision Audit Trail.
- **Outside voices.** Codex is not installed, so outside coverage is unavailable. This harness has no Agent tool, so the native Claude subagent could not be dispatched either. That makes this a single-reviewer run, and every consensus table below shows N/A. That does not mean the result is clean.
- **UI scope: yes.** Evidence: rendered senior, family and Director screens (`web/src/pages/**`) and 31 phone captures.
- **DX scope: yes.** The user explicitly asked for it. The developer-facing surfaces are the operator/developer journey (`npm run demo`, `.env` keys, Director console, LAN QR) and the `TACHI_*` env vars.
- **Moving target.** Another team committed round‑1 fixes during this review and has round‑2 work uncommitted. I pinned verification to the commits above and re-ran every probe at the end. Where a finding was fixed mid-review, it is credited as fixed, not reported.

**How I verified.** I never touched the shared :4100 server and never reset it.
- **Static checks:** `npx tsc --noEmit -p tsconfig.json` is clean. `npm test` passes 18/18 (brain, graph, flows). `npx tsx server/scripts/smoke.ts` reports SMOKE OK (28 checks).
- **Isolated in-process instances.** I wrote two harnesses that start `createApp({port:0, dataDir:tmp})`: socket.io probes in `verify.ts`, and Playwright at 390×844 against a scratch `vite build` in `ui2.mts`. They live in the session scratchpad: `/tmp/claude-0/-home-user/843dcc6b-8a43-5bd6-a62f-d1e12218a988/scratchpad/qa/`.
- **Live-LLM probe.** I ran a mock Anthropic/OpenAI HTTP endpoint that records request shapes and can answer normally, fail (500), or hang.
- **Model IDs.** `claude-sonnet-5-5` and `claude-haiku-5-5` were confirmed against the current Claude API model table.

---

## Phase 1: CEO review (mode: SELECTIVE EXPANSION)

### 0A. Premise challenge

| # | Premise | Verdict | REALITY evidence |
|---|---|---|---|
| P1 | A deterministic offline brain makes the 90‑second demo "never break". | **Holds.** | Smoke passes with `model=demo`. The scripted answers are written so the heuristics extract everything (`shared/constants.ts` DEMO_SCRIPT). |
| P2 | Real LLMs drop in with an identical flow. | **Partly holds.** | Routing and request shapes are correct for all four models (mock probe). It is unverified with real keys, and Sonnet/Haiku 5.5 adaptive thinking with `max_tokens` of 200–400 is a credible risk of empty-response fallbacks (`server/brain/providers/anthropic.ts:27`). |
| P3 | Privacy is enforced in server code, never only by prompt. | **Mostly holds.** | One effective-visibility rule `memoryVisibleToFamily` (`server/orchestrator/core.ts`), projected bootstraps, refusals never reach the LLM. Gaps: any member of a family-type room counts as "family", including invited friends (verified). A general question is classified as `daily` and refused (verified). |
| P4 | The scripted demo covers what the judges will check. | **Does not hold.** | Requirement 4 (invite from phonebook) and requirement 2 (a private refusal) have no beats in DEMO_SCRIPT, even though `harin` is deliberately left out of the room "for the invite demo" (`shared/constants.ts` comment). |
| P5 | The demo clock produces realistic report times. | **Holds after the round‑2 fix.** | The first `demo:clock` after reset is now absolute (verified 09:00 while presenting at a simulated 15:00). It now collides with the 21:00 ticker (verified duplicate report). |

Tier‑1 REALITY rows (manual, because the `gstack-plan-reality` binary is absent):
- `REALITY: premise-table finding 5 premises, unverified=1 (P2 live keys) shared/constants.ts DEMO_SCRIPT`
- `REALITY: already-done pass round-1 fixes F5/F6/F12 already landed; not re-planned docs/reviews/round-1.md`
- `REALITY: surface-check finding Sonnet 5.5 defaults to adaptive thinking at effort high; provider sends no thinking/effort server/brain/providers/anthropic.ts:27`
- `REALITY: binding-decisions pass PLAN §7 achromatic system honoured; dark theme added in 3721e33 is still achromatic web/src/styles/tokens.css:91`
- `REALITY: numbers finding PLAN "응답 3/5" vs seeded 4 participants; README "09:00, 14:10" only reachable with demo clock shared/constants.ts:41`
- `REALITY: deferred-asks finding 2 of 10 user requirements absent from the scripted demo shared/constants.ts DEMO_SCRIPT`
- `REALITY: pr-count pass single repo, review is report-only docs/qa/autoplan-review.md`

### 0B. What already exists (leverage map)

| Sub-problem | Existing code | Reused? |
|---|---|---|
| Korean particle choice (은/는, 이/가) | `hasBatchim` in `server/brain/heuristics/ko.ts`, used by `joinKo` | **No.** The privacy refusal hard-codes `은` (`heuristics/family.ts:48,95`). |
| Effective visibility | `memoryVisibleToFamily`, `projectMessage`, `healthForFamily` (`core.ts`) | Yes, but it does not account for who is asking. |
| Reset safety | `runWithGen` with an AsyncLocalStorage generation, `installGuards` (`core.ts`) | Yes (verified clean). |
| LLM resilience | Circuit breaker plus `TACHI_LLM_TIMEOUT_MS`, default 12 s (`server/brain/llm.ts`) | Yes. The first hang still costs 24 s (verified). |
| Step gating | `waitFor` plus a 45 s step timeout (`DirectorConsole.tsx`) | Yes. |

### 0C. Dream state

```
CURRENT (HEAD)                          THIS REVIEW'S FIXES                    12-MONTH IDEAL
Scripted demo works offline;      --->  No duplicate/stray ticker output;  ---> Real seniors, real phones; per-room
privacy rules unified; 4 P0             free-form family Q&A answers;          privacy scopes (family vs friends);
stage risks; live LLM untested          locked Director; rehearsed live        voice-first senior UX; live LLM with
                                        keys; invite + privacy beats           measured p95 latency; graph DB with
                                        on the script                          long-term upstream support
```

### Mode and alternatives

I selected SELECTIVE EXPANSION (override rule). The one in-blast-radius expansion I accepted was adding two short beats to the script, for requirement 4 (invite) and requirement 2 (private refusal). It is classified as TASTE because the 90‑second budget is tight; see audit trail D7. I rejected re-architecting privacy into per-room scopes as out of scope for the hackathon and deferred it.

### Demo-story review: the 13 scripted beats at HEAD

| # | Beat | Works offline? | Stage risk at HEAD |
|---|---|---|---|
| 1 | Proactive morning greeting (clock 09:00) | Yes | Fine once the round‑2 rewind fix lands. Before it, a 15:00 presentation showed "좋은 아침이에요" at 오후 3:01 (verified). |
| 2–5 | Photo, then when/where, who, story, then memory card plus graph | Yes | Consent-first now: the card shows 나만 보기 until mom says yes (verified). |
| 6 | Share, then emotional summary in the family room, bots react | Yes | The family-facing summary calls 박영수 "남편분" (`heuristics/compose.ts:16`). The children should read "아버님". |
| 7 | "불국사" recall | Yes | Waits for `trip_suggestion`. |
| 8 | "좋아", then itinerary | Yes | — |
| 9 | Health question to jieun | Yes | Only the exact scripted wording is safe. "엄마 요즘 어때?" is refused, with "일상 대화**은**" (P0‑2). |
| 10 | Gathering artifact | Yes | Correct place in the scripted order. Out of order, the place contradicts the title (P1‑5). |
| 11 | Scheduling through side chats | Yes | Result is unanimous with bots plus assisted stand-ins. |
| 12 | Model swap to gpt‑terra, then ask again | **No key means an "오프라인 응답" badge** | The step hard-codes `gpt-terra` (P1‑2). |
| 13 | Daily report (clock 21:00) | Yes | **A second report card arrives within 20 s** (P0‑1). |

### Review Sections 1–11

1. **Architecture.**
   - The single orchestrator plus brain/graph contracts is the right shape for a hackathon. Per-room `enqueue` gives ordered replies, and the generation guard makes reset safe. Diagram in Phase 3.
   - Finding: the 20‑second ticker (`server/orchestrator/proactive.ts:122-145`) is a second, unsupervised actor that writes into the same rooms the Director scripts. Nothing coordinates them (P0‑1).
2. **Error and rescue.** The registry is below. All LLM paths fall back to heuristics. The breaker opens after 2 failures. Socket handlers are wrapped in `safe()`, and failures post a gentle Tachi line. Remaining gaps: the first hung provider stalls 24 s, and adaptive-thinking token exhaustion is not detected as its own failure (`stop_reason: max_tokens` reads as "empty response").
3. **Security and threat model.**
   - (a) Without `TACHI_DIRECTOR_KEY` (undocumented in README), any LAN socket can `hello` as `director` and reset, toggle bots or impersonate personas. Likelihood: high, because the QR is meant to be scanned. Impact: high. Verified.
   - (b) `model:set` needs no `hello` at all and accepts unavailable models (`socket.ts:188`, `models.ts:33`). Verified: an anonymous socket switched the model to `gpt-luna` with no key.
   - (c) An invited friend or neighbour gets health data (verified).
   - Uploads are limited to images ≤15 MB with random names. No injection vectors found: Kùzu queries are parameterized (`graph/kuzu.ts:128`).
4. **Data flow and interaction edge cases.**
   - Double-tap: actions are marked `done` server-side.
   - Fast share-then-recall race (R1‑F5): fixed, 1 trip card (verified).
   - Reset mid-extraction: clean (verified).
   - Casual family sentences create artifacts: 3 out of 3 (verified, P1‑4).
   - "가족여행 사진" goes to trip intent instead of recall, because `/여행/` is checked first (`intents.ts:26`, P2).
   - While a poll is open and unanswered, "점심 먹었어" can be read as an availability answer (`scheduling.ts:256`, P2).
5. **Code quality.** Mostly explicit and readable. Smells:
   - The monkey-patched `sock.on` and `installGuards` that wrap DB methods are clever and global (P5 risk). They are acceptable for a demo but need a comment and a test.
   - The particle helper is duplicated instead of reused (DRY).
6. **Tests.** Smoke, flows and unit tests cover the scripted path, privacy projection and reset. Missing:
   - ticker and clock interaction
   - family-intent false positives
   - josa
   - asker-relation privacy
   - provider request shape
   - the dialog-clickability regression, which was only caught by a production build

   Full diagram in Phase 3.
7. **Performance.** In-memory scale is trivial. `textMatches` scans all memories per keyword (`kuzu.ts:139`), which is fine at under 100 memories. The hot path is LLM latency: Sonnet 5.5 at default effort `high` plus a 2,500-token itinerary may exceed the 12 s deadline. No latency budget or benchmark exists yet, which is a finding.
8. **Observability.** Startup banner and warn-once logs exist. There is no per-step latency log for the Director, so a rehearsal cannot show where time went. P2: log `{step, model, source, ms}` for each Tachi message.
9. **Deployment and rollout.** Single process, local. The `npm start` server does not reload when code changes. Restart it after pulling, as was done at 02:04. `kuzu` takes 542 MB on disk (`du`), so install it before going to the venue (DX).
10. **Long-term trajectory.**
    - Reversibility: 4/5.
    - Upstream Kùzu development reportedly stopped in Oct 2025; I could not confirm this here because there was no network check. Pin `kuzu@0.11.3` and keep the in-memory fallback (`TACHI_GRAPH_ENGINE=memory`), which already exists.
    - Debt: global monkey-patches, heuristic intent regexes.
11. **Design.** UI scope is present, so see Phase 2. Recommendation: run `/design-review` on a rebuilt production bundle, because the 01:42 shots predate a346099/3721e33.

### Error and Rescue Registry

| Codepath | What can go wrong | Rescued? | Action | User sees |
|---|---|---|---|---|
| `brain.run()` (all AI fns) | Provider 4xx/5xx, timeout, malformed JSON | Y | Heuristic plus breaker (2 failures, 60 s) | Reply with an "오프라인 응답" badge |
| `complete()` on a hung provider | First call waits 12 s, second waits 12 s | Partial | Breaker trips only after 2 failures | **24 s silence on the first turn** (verified) |
| Anthropic adaptive thinking | Thinking uses up `max_tokens` (200–400), so no text block | Y (as empty) | Treated as failure, then fallback | Silent drop to the demo brain; breaker opens |
| `tick()` | Fires during scripted steps | **N** | — | Extra report or proactive card on stage |
| `hello` as director | No key configured | **N** | — | Anyone can reset or control the demo |
| `startScheduling` | No common slot | Y | Best candidate plus 확정/다시 조율 (round 1) | Clear choice |
| `resetDemo` mid-flow | Stale writes | Y | Generation guard | Clean seed (verified) |

### Failure Modes Registry

| Codepath | Failure | Rescued | Test | User sees | Logged |
|---|---|---|---|---|---|
| ticker × demo clock 21:00 | duplicate report | N | N | duplicate card | N, **CRITICAL GAP** |
| ticker × real 14:00–14:05 without scripted clock | spontaneous proactive | N | N | stray greeting | N, **CRITICAL GAP** |
| family Q&A "요즘 어때" | over-refusal plus josa error | N | N | wrong refusal | N, **CRITICAL GAP** |
| friend in a family-type room | health leak | N | N | silent leak | N, **CRITICAL GAP** |
| anonymous `model:set` | demo goes offline | N | N | offline badges | N |
| casual "가자/생신/모임" | artifact spam | N | N | duplicate artifacts | N |
| live LLM slow or thinking | 24 s stall, then offline | Partial | mock only | stall | warn |

### NOT in scope (deferred)

- Per-room privacy scopes (family vs friends vs clinic). Deferred: needs product design; the P1 relation check covers the demo.
- Voice input and output quality. Deferred: browser speech APIs only.
- Auth, accounts and persistence beyond the demo seed.
- Replacing Kùzu. Deferred: the fallback exists.

### Dream-state delta

After the P0/P1 list, Tachi is a stage-safe demo with honest privacy for the family room. It still falls short of the 12‑month ideal in three places: per-room scopes, measured live-LLM latency, and real multi-household onboarding.

### CEO consensus table

```
CEO DUAL VOICES: CONSENSUS TABLE
  Dimension                             Claude(native)  Codex  Consensus
  1. Premises valid?                    unavailable     n/a    N/A
  2. Right problem to solve?            unavailable     n/a    N/A
  3. Scope calibration correct?         unavailable     n/a    N/A
  4. Alternatives explored?             unavailable     n/a    N/A
  5. Competitive/market risks covered?  unavailable     n/a    N/A
  6. 6-month trajectory sound?          unavailable     n/a    N/A
Primary review: premises 4/5 hold; scope gap = req 2 & 4 off-script.
```

### CEO completion summary

```
| Mode selected        | SELECTIVE EXPANSION                                         |
| System audit         | round-1 fixes landed; 18/18 tests; smoke OK                 |
| Step 0               | 5 premises (1 wrong: script coverage), 1 expansion (TASTE)  |
| Section 1  (Arch)    | 1 issue (unsupervised ticker)                               |
| Section 2  (Errors)  | 7 paths mapped, 2 GAPS                                      |
| Section 3  (Security)| 3 issues, 2 High                                            |
| Section 4  (Data/UX) | 6 edge cases mapped, 3 unhandled                            |
| Section 5  (Quality) | 2 issues                                                    |
| Section 6  (Tests)   | diagram produced (Phase 3), 6 gaps                          |
| Section 7  (Perf)    | 1 issue (no latency budget for live LLM)                    |
| Section 8  (Observ)  | 1 gap                                                       |
| Section 9  (Deploy)  | 2 risks (stale server process, 542 MB kuzu install)         |
| Section 10 (Future)  | Reversibility 4/5, 2 debt items                             |
| Section 11 (Design)  | see Phase 2                                                 |
| Error/rescue registry| 7 rows, 2 CRITICAL GAPS                                     |
| Failure modes        | 7 rows, 4 CRITICAL GAPS                                     |
| Outside voice        | codex unavailable; native subagent unavailable              |
| Unresolved decisions | 0 (all auto-decided, see audit trail)                       |
```

---

## Phase 2: Design review

**Step 0: initial rating, 7/10.** The system is unusually disciplined: achromatic tokens, hairlines and no shadows, a senior scale of 20 px body and 56 px controls. The deductions are interaction-state gaps, family-mode accessibility and copy. There is no `DESIGN.md`; I calibrated against PLAN §7 and `docs/design-reference.md`.

**Automated audit at HEAD.** Playwright, 390×844, computed styles, run on a scratch build of HEAD.

| Screen | Targets under spec | Text under spec | Text lighter than Mid Ash | Chromatic colours or shadows |
|---|---|---|---|---|
| Senior chat (spec ≥56 px, ≥17 px) | 1: text input 230×49 | date chip 13 px; tab labels 16 px | 0 | 0 |
| Senior privacy | 0 | tab labels 16 px | 0 | 0 |
| Family thread (44 px guideline) | 8: header icons and send at 36×36, invite 50×40 | avatar initials 11 px, timestamps 12 px | timestamps `#8f8f8f` (audited before the 3721e33 "AA tertiary" change, so re-check) | 1 avatar-stack ring (2 px spread, used as an outline; acceptable) |

The round‑1 mid-review regression (the `.fam-banner` fallback `#eef`) is now `var(--bg-chrome)`, so it is fixed.

| Pass | Score (now → after tasks) | Key decision |
|---|---|---|
| 1. Information architecture | 8 → 8 | One primary action per card (max 2). Chat first, then album, then settings. |
| 2. Interaction states | 6 → 8 | Missing: refusal copy is wrong; an "LLM thinking" state beyond the typing dots; an empty album state is unverified. P0‑2 and P1‑1 lift this. |
| 3. Journey and emotional arc | 8 → 9 | The consent-first share is now emotionally right. Remaining: "남편분" in the climax card (P1‑7). |
| 4. AI slop risk | 9 → 9 | No card grids, gradients, emoji or purple. Photos are the only colour. |
| 5. Design system | 8 → 8 | Achromatic. TASTE: the 3721e33 dark theme follows the OS and can flip the stage to an untested look (D13). |
| 6. Responsive and accessibility | 6 → 7 | Senior input 49 px, family icons 36 px, 12–13 px meta text (P2). Dialog focus trap works. Dialogs were unclickable in production builds until `548d0bb`, when the fix team fixed it in parallel with this review. Verified by tap at HEAD. |
| 7. Unresolved decisions | 3 found, 3 auto-decided | Dark-mode pinning (D13), refusal copy (D10), invite greeting copy (D15). |

**Overall design score (lowest of passes 1–6): 6 → 7.**

Litmus scorecard (native voice only; Codex column is N/A):
1. Brand unmistakable in first screen: YES (타치 header, ink avatar).
2. One strong visual anchor: YES (photo or primary black button).
3. Understandable by scanning headlines: YES.
4. Each section has one job: YES.
5. Cards necessary: YES (cards are the interaction).
6. Motion improves hierarchy: YES (single fade-up, reduced-motion respected).
7. Premium with shadows removed: YES (no shadows used).

Hard-rule hits: none. One universal-rule miss: family meta text at 12 px with `#8f8f8f` was below 4.5:1 at audit time.

```
DECISION NEEDED                               | IF DEFERRED
Dark theme on the Director stage?             | Presenter laptop in dark mode → untested look on projector (auto-decided: pin light, D13)
Refusal wording for private categories        | "건강 정보은…" on stage (P0-2)
Invitee greeting                              | "네, 알겠습니다." from a newly invited aunt (P1-6)
```

---

## Phase 2.5: DX review (mode: DX POLISH)

**Product type and persona.** The surface is a hackathon app run by a demo operator: the presenter plus 1–2 teammates who clone, install and run it on a laptop, add keys, and drive `/demo`.

**Empathy narrative.**
> I clone the repo the night before. `npm install` pulls 747 MB, of which kuzu is 542 MB, on hotel Wi‑Fi. `npm run demo` boots in about 2 s and prints the LAN URL. I open `/demo`, it works with the demo brain, great. I add `.env` with my keys and switch to Claude.
>
> Nothing tells me my Node 20.11 silently ignored `.env`, because `process.loadEnvFile` only exists from Node 20.12/21.7 and `package.json` says `>=20.10`. Nothing tells me that `TACHI_DIRECTOR_KEY` exists. That means the QR I show the room hands everyone a reset button.
>
> On stage, step 12 switches to Terra with no OpenAI key and shows "오프라인 응답".

**Developer journey map.**

```
STAGE        | DEVELOPER DOES                    | FRICTION                                               | STATUS
1 Discover   | reads README quick start           | README promises "오늘 09:00, 14:10" report (needs clock) | ok
2 Install    | npm install                        | 542 MB kuzu; Node >=20.10 too low for loadEnvFile       | fix (P1-8)
3 Hello world| npm run demo → /demo → 자동 진행    | none offline; TTHW ~2-3 min warm cache                  | ok
4 Real usage | adds .env keys, swaps model        | silent .env skip; model step hard-codes gpt-terra       | fix (P1-2, P1-8)
5 Debug      | reads console warn-once lines      | no per-step latency log                                 | deferred (P2)
6 Upgrade    | git pull                           | running `npm start` server must be restarted manually    | document (P1-8)
```

**TTHW.**
- About 2–3 minutes with a warm npm cache. Measured pieces: build 0.3 s, server boot about 2 s, smoke run 8 s.
- On venue Wi‑Fi, assume over 10 minutes because of the 542 MB `kuzu` download. That is a red flag unless `node_modules` is pre-installed or `TACHI_GRAPH_ENGINE=memory` is documented as the escape hatch.
- Target: under 3 minutes.

**DX scorecard.**

| Dimension | Score | Note |
|---|---|---|
| Getting started | 6 | Two commands. Heavy install. Engine floor is wrong. |
| API/CLI naming | 7 | Clear `npm run` scripts. Env name drift: PLAN says `ANTHROPIC_BASE_URL_TACHI`, code reads `TACHI_ANTHROPIC_BASE_URL`. |
| Error messages | 6 | Friendly Korean toasts. Missing: a ".env found but not loaded" warning, and a director-key hint in the banner. |
| Documentation | 6 | Good README and script table. Missing `TACHI_DIRECTOR_KEY`, `TACHI_LLM_TIMEOUT_MS`, `TACHI_GRAPH_ENGINE`. |
| Upgrade path | 4 | No guidance to restart the running server. |
| Dev environment | 6 | `npm run dev` hot reload. Typecheck in 0.8 s. |
| Community | n/a (3) | Hackathon. |
| Measurement | 5 | Smoke test plus capture script exist. No step latency metrics. |
| **Overall DX** | **6/10** | TTHW: 2–3 min warm, over 10 min cold. Target: under 3 min. |

**DX implementation checklist:**
- [ ] `engines.node` set to `>=20.12`
- [ ] warn when `.env` exists but is not loaded
- [ ] README section "Running on stage" (director key, restart, pre-install, memory-graph escape hatch, live-key rehearsal command)
- [ ] model step falls back to an available model

DX consensus: N/A (single voice).

---

## Phase 3: Eng review

### Scope challenge

The review accepts scope as-is. The plan touches about 40 files across 3 layers; that is the existing product, not new scope. Each P0/P1 task touches 1–3 files, so the complexity gate does not apply to the fix list.

Tier-1 REALITY rows:
- `REALITY: premise-table pass privacy/reset premises verified by probes server/orchestrator/core.ts`
- `REALITY: already-done pass R1 F5/F6/F12/F3 fixed — not re-tasked docs/reviews/round-1.md`
- `REALITY: surface-check finding loadEnvFile absent on Node <20.12 server/util/env.ts:2`
- `REALITY: binding-decisions pass contracts additive only shared/types.ts`
- `REALITY: numbers pass tests 18/18, smoke 28 checks server/scripts/smoke.ts`
- `REALITY: deferred-asks finding req 2/4 absent from script shared/constants.ts`
- `REALITY: pr-count pass n/a (report only)`

### Architecture

```
 Director (/demo) ──demo:* (director-only, key optional!)──┐      LAN phones ──hello(persona)──┐
 Senior app (/senior) ─┐                                    │                                  │
 Family app (/family) ─┴── socket.io ───────────────────────┴──────────────────────────────────┘
                              │  safe() → runWithGen(gen) → enqueue(roomId)
                              ▼
   ┌───────────────────── orchestrator ─────────────────────┐        ┌── ticker (20 s) ──┐
   │ senior.ts  family.ts  scheduling.ts  artifacts.ts       │◀───────│ tick(): proactive │  ← unsupervised writer
   │ bots.ts    proactive.ts  rooms.ts  sessions.ts          │        │ + 21:00 report    │    (P0-1)
   │ core.ts: memoryVisibleToFamily / projectMessage / guards│        └───────────────────┘
   └──────────┬───────────────────────┬──────────────────────┘
              ▼                       ▼
   brain (run → llm | heuristic | rule)   graph store (Kùzu primary + in-memory mirror)
     providers: anthropic / openai          parameterized Cypher; fallback on error
     breaker: 2 fails → 60 s offline
              ▼
   SQLite (users, rooms, messages, memories, polls, artifacts, sessions, kv: privacy/health/demo)
```

Privacy data flow (family Q&A):

```
family msg → classifyFamilyIntent(rule) → ask_tachi → buildFamilyContext(asker)   ← asker relation NOT checked (P1-3)
          → questionCategory(q) ── private? → rule refusal ("…은 비공개" josa bug, P0-2)
                                └─ "요즘/오늘" → 'daily' (private by default) → over-refusal (P0-2)
          → answerFamily(LLM | heuristic) with public slices only → health_card if public
```

Senior-room pending state machine: `none → share_confirm → (yes: share → offerTrip → trip_confirm) | (no: private) → trip_confirm → (yes: itinerary → 'itinerary' pending) | (no) → none`. Invalid transitions are blocked because actions are marked `done` and the yes/no parser is strict (R1‑F7).

### Code quality findings

1. **Duplicated particle logic.** Reuse `hasBatchim` (DRY).
2. **Over-broad `familyIntent` regex** (`intents.ts:61`). `가자` and `생신` win over `타치` addressing.
3. **Global monkey-patching.** `sock.on` is wrapped in `socket.ts` and DB methods in `installGuards`. Keep it, but add a header comment and a unit test, so a future engineer does not bypass it with a cached reference.

### Test review

Coverage diagram for the codepaths this review touches:

```
CODEPATH                                   TYPE         EXISTS?  GAP / TEST TO ADD
senior interview → memory → graph          E2E smoke    yes      —
consent-first share / decline → private    smoke        yes      —
recall by keyword (11 variants)            —            no       flows: '다보탑','벚꽃','민준이 도망가던 날' → same memoryId
share → recall race                        —            no       flows: share then immediate '불국사' → 1 trip_suggestion
family Q&A public / private                smoke        partial  unit: questionCategory('엄마 요즘 어때?') ≠ refusal; josa '건강 정보는'
asker relation privacy                     —            no       flows: friend in 친척방 asks BP → refusal, no health_card
familyIntent false positives               —            no       unit: '엄마 생신 선물 뭐가 좋을까?' → not gathering
ticker × demo clock                        —            no       flows: clock 21:00 + demo:report + tick() → exactly 1 report
director auth                              smoke        partial  flows: anon model:set rejected; hello director w/o key when key set
provider request shape                     —            no       unit w/ mock fetch: no temperature, effort/max_tokens floor
reset mid-flow                             smoke        yes      —
dialogs clickable (prod build)             —            no       playwright: tap 초대 in InviteDialog at 390px
```

LLM changes: no eval suite exists. Before the demo, a live-key rehearsal of the 13-step auto script must show `source:'llm'` and `fallback:false` on every Tachi message.

**Test plan** (written inline here; the `~/.gstack/projects/` state root is unavailable in degraded mode):
- Affected routes: `/demo`, `/senior?as=mom`, `/family?as=jieun`, socket events `demo:clock`, `demo:report`, `model:set`, `hello`, `message:send` (family).
- Critical paths:
  - the auto-run of all 13 steps produces exactly one report card
  - a free-form family question gets an answer
  - an anonymous socket cannot reset or switch the model
- Edge cases:
  - presenting at 14:02 real time without the scripted clock
  - a friend in a relatives room
  - three casual family sentences

### Performance

There is no budget today. Proposed budget for stage use: p95 Tachi reply under 6 s live, under 1.5 s offline. Bench: run the auto-run with live keys and log ms per step (P2 observability). The top three slow paths are the itinerary (2,500 tokens), extractMemory (1,200) and draftGathering (1,500).

### Eng consensus table

All cells N/A (single voice). Native assessment:
- Architecture sound: yes, with one unsupervised writer.
- Tests: good on the happy path, with 6 gaps.
- Performance: no budget.
- Security: 2 High.
- Error paths: mostly handled.
- Deployment risk: moderate (stale process, heavy install).

### Eng completion summary

| Item | Result |
|---|---|
| Scope challenge | Accepted as-is |
| Reality rows | 7/7 (manual), 1 unverified premise (live keys) |
| Architecture | 1 issue |
| Code quality | 3 issues |
| Tests | Diagram produced, 6 gaps |
| Performance | 1 issue |
| Failure modes | 4 critical gaps (registry above) |
| Unresolved decisions | 0 |
| Outside voice | Unavailable |

---

## Review Scores

| Phase | Score | Outside voice | Native voice | Consensus |
|---|---|---|---|---|
| CEO (scope and demo story) | 7/10. 8 of 10 requirements have a scripted beat; 4 P0 stage risks. | Codex unavailable | Subagent unavailable (primary only) | N/A |
| Design | 6/10 now, 7/10 after tasks (lowest pass) | Unavailable | Unavailable | N/A |
| DX | 6/10. TTHW 2–3 min warm, over 10 min cold; target under 3 min. | Unavailable | Unavailable | N/A |
| Eng | 7/10 (architecture 7, tests 7, security 5, error paths 7, deployment 6) | Unavailable | Unavailable | N/A |

## Cross-phase themes

1. **The ticker and demo clock are uncoordinated.** Raised in CEO (beat 13), Eng (failure modes) and Design (stray card on stage).
2. **Open Director and model control.** Raised in CEO (security), Eng (threat model) and DX (undocumented key).
3. **Over-refusal and grammar in family Q&A.** Raised in CEO (requirement 5 "freely"), Design (refusal state copy) and Eng (test gap).
4. **Live-LLM readiness is unproven.** Raised in CEO (premise P2), Eng (performance budget) and DX (silent `.env`, model step).

---

## Decision Audit Trail

<!-- AUTONOMOUS DECISION LOG -->
| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|---|---|---|---|---|---|
| D1 | 0 | UI scope = yes | Mechanical | P1 | Rendered screens and captures | Skip design |
| D2 | 0 | DX scope = yes | Mechanical | user request | Operator journey is developer-facing | Skip DX |
| D3 | 0 | Single-reviewer mode; all consensus N/A | Mechanical | P6 | Codex absent, no Agent tool | Fake "CONFIRMED" |
| D4 | 0 | Pin review to commits and re-verify at the end | Mechanical | P6 | Code changed during review | Review the 01:42 snapshot only |
| D5 | 1 | Mode SELECTIVE EXPANSION | Mechanical | override | autoplan rule | HOLD |
| D6 | 1 | Accept offline-brain premise | Mechanical | P6 | Verified by smoke | — |
| D7 | 1 | Add invite (req 4) and private-refusal (req 2) beats to the script | **TASTE** | P1/P2 | Under 1 day, in blast radius. Costs about 8 s of the 90 s budget. | Leave requirements off-stage |
| D8 | 3 | Fix the ticker by suppressing it in Director mode **and** marking fired on manual triggers | Mechanical | P5 | Explicit, covers both duplicate paths | Lowering the tick interval |
| D9 | 3 | Josa fix reuses `hasBatchim` | Mechanical | P4 | Helper already exists | New josa library |
| D10 | 2 | "요즘/어때/잘 지내" becomes a public summary, not a `daily` refusal | Mechanical | P1 | Requirement 5 says "freely" | Keep `daily` mapping |
| D11 | 1 | Director key: auto-generate and print at boot when no key is set | **TASTE** | P1/P5 | Safe by default and still zero-config. The alternative is to require an env var. | Leave open by default |
| D12 | 3 | `model:set`: require a hello'd persona plus an available model (not director-only) | Mechanical | P3 | Keeps the family desktop switcher (shot 90) working | Director-only |
| D13 | 2 | Pin the Director stage and embedded phones to light theme unless `?theme=dark` | **TASTE** | P5 | Matches PLAN §7 and every capture; projector legibility | Follow OS |
| D14 | 3 | Friend privacy: refuse Q&A unless the asker's relation is family (role `family` only for kin) | Mechanical | P5 | Smallest change; per-room scopes deferred | Per-room privacy model |
| D15 | 3 | Gathering intent: require a proposal verb and reuse an open artifact under 24 h old | Mechanical | P3 | Stops spam without a confirmation dialog | Confirm-before-create dialog |
| D16 | 3 | LLM: `effort:'low'` plus `max_tokens` floor of 1024 (Anthropic); `reasoning_effort:'low'` (OpenAI); demo timeout 6 s; breaker trips on the first timeout | Mechanical | P3 | Works across Sonnet and Haiku 5.5. Needs live verification. | Disable thinking per model |
| D17 | 3 | Test plan inline, TODOS.md not written | Mechanical | user constraint | Must not modify product files | Write `~/.gstack` and TODOS.md |
| D18 | 1 | No User Challenges raised | Mechanical | rule | Requires two agreeing voices; only one ran | — |

**Taste decisions for the final gate:** D7 (script length), D11 (key strategy), D13 (theme pinning). **User Challenges:** none.

---

## Hard-requirement checklist (state at HEAD plus working tree, 02:20)

| # | Requirement | Status | Evidence (how verified) |
|---|---|---|---|
| 1 | Photo, Q&A, graph DB (place, era, people, related, other); later keywords retrieve | **PASS** | Smoke: memory_card carries graph nodes. Shot 05: "노드 12 · 연결 11". Engine is `kuzu`, with parameterized Cypher (`graph/kuzu.ts:128`). `verify.ts consent` battery, all on the new memory: "불국사", "다보탑", "벚꽃", "민준이 도망가던 날", "1984년", "영수 씨랑 경주 갔던 거", "그리움" each return a recall_card for 1984 불국사; "해운대", "수박", "명동성당", "졸업식" return their seeded memories. Edge (P2): "가족여행 사진" goes to trip intent. |
| 2 | Conversations family-visible or private **by type** | **PASS** | Five category toggles (shot 94). Playwright: tapping 건강 정보 → 나만 보기 sets server `privacy.health=private`, then jieun's BP question is refused. Smoke: `health:update` is null for family, report masks private sessions and the private wedding memory, revoked memory is gone from family bootstrap. Gaps are under requirement 5. |
| 3 | Tachi proactively talks a few times a day (past memories or asks for new ones) and reports times to family | **PASS (P0 caveat)** | Schedule 09:00, 14:00, 19:30 plus `ask_photo` (`shared/constants.ts`, `proactive.ts`). Shot 01: greeting from 1988 해운대. Shot 12: "오늘 01:42, 01:43에 어머님과 대화했어요". Caveat: duplicate report at the 21:00 step (P0‑1). |
| 4 | Create family/relative rooms and invite from a virtual phonebook | **PASS since `548d0bb`** | `ui2.mts` at 390 px: phonebook search "최정숙" then tap 초대 → member `u-jungsook` added and "최정숙님이 초대되었어요" shown. 새 대화방 "외가 친척방" created with `[jieun, mom, tachi]`. Before `548d0bb` the production build's dialogs were unclickable because the scrim covered them; the fix team found and fixed this in parallel. Not on the demo script (P1‑6). |
| 5 | Family can ask about public info (health) freely | **PARTIAL** | Scripted "타치, 엄마 요즘 혈압은 괜찮으셔?" gets a BP/meds answer plus health_card (smoke, shot 09). **But** "엄마 요즘 어때?" returns "어머님께서 일상 대화은 비공개로 해 두셨어요" (verified with the heuristic at HEAD; it never reaches the LLM). The josa is also wrong in the health refusal. A friend invited to 친척방 receives BP numbers plus health_card (`verify.ts dir`). |
| 6 | After a memory, "가족에게 공유할까요?", then an emotional summary in the family room | **PASS** | Shots 05/06 and smoke `share_card reached the family room`. Consent-first: the family receives only the "비공개 추억" stub until yes; decline makes it private (`verify.ts consent`). Copy: "남편분" in the family-facing card (P1‑7). |
| 7 | Nearby trip from the memory; on OK, an itinerary | **PASS** | Smoke: trip suggested, itinerary after "좋아". Shots 06/08: 경주 1박 2일, timeline, senior notes. |
| 8 | Claude Sonnet, Haiku, ChatGPT Terra, Luna usable and swappable | **PARTIAL** | Mock-provider probe: active model defaults to `claude-sonnet` with keys. Replies labeled "Claude Sonnet 5.5", "Claude Haiku 5.5", "ChatGPT Terra", "ChatGPT Luna" with model ids `claude-sonnet-5-5`, `claude-haiku-5-5`, `gpt-6.1-terra`, `gpt-6-luna`. Anthropic requests carry `anthropic-version: 2023-06-01`, `x-api-key`, an image block for photos, and no temperature. OpenAI requests carry `max_completion_tokens` and `response_format: json_object`. A 500 falls back with the label "데모 브레인"; a hang stalls 24.1 s and then the breaker opens. **Not verified with real keys.** Adaptive-thinking budget risk (P1‑1). Step 12 without an OpenAI key shows an offline badge (P1‑2). |
| 9 | Gathering artifact everyone edits; scheduling opens side chats with each member | **PASS** | `verify.ts artifact`: the artifact has title, background, purpose, place, 5 agenda items and 4 tasks. jieun's edits (notes, place, a new task) reached minjun live with `updatedBy=jieun`. Scheduling opened side rooms for jieun, minjun and suyeon, plus mom in her own room. Smoke: result slot is the common one. Caveats: casual messages spawn artifacts (P1‑4); place can contradict the title (P1‑5). |
| 10 | Demo environment: AI bots chime in, or multiple devices join | **PASS (P0 caveat)** | Bots post 1–2 lines with `generatedBy: 'bot'` provenance (shots 06, 10, 11; `verify.ts artifact`). LAN QR, persona claim and bot stand-down (smoke: `jieun persona claimed`). Caveat: the same LAN access lets anyone reach `/demo` and the controls (P0‑3). |

**Round‑1 (GPT) findings, re-verified at HEAD:**
- **Fixed:** F3 (side chat, by code), F5 (1 trip card), F6 (consent-first), F9/F10 (smoke), F12 (clean reset), F21 (`source` field).
- **Partly fixed:** F8. The graph is filtered and demo events are director-only, but the director role is open without a key and `model:set` is open.
- **Fixed with a regression:** F4. The clock rewinds now, but the ticker duplicates the report.
- **Not re-verified visually:** F17, F18, F19, F23.

---

## Implementation Tasks (aggregated across phases)

**P0 = can break or embarrass the live demo. P1 = should land before the demo.** Effort assumes bug-fix-with-regression ratios.

### P0

- [ ] **P0‑1 (human: ~1h / CC: ~10min). Orchestrator: stop the ticker from posting duplicate or stray cards during Director runs.**
  - Surfaced by: CEO beat 13, Eng failure modes. Verified with `verify.ts report2`: demo clock 21:00, then `demo:report`, then the next `tick()`, gives **2 report cards**. Also verified: demo clock 14:01 with no Director action gives 1 spontaneous proactive.
  - Files: `server/orchestrator/proactive.ts` (`postReport`, `tick`, `fireProactive`), `server/orchestrator/core.ts` (`setDemoClock`).
  - Fix:
    - `postReport(false)` sets `ctx.db.kv.set('report-fired-on', ymd(now()))`.
    - `fireProactive(kind)` already marks its own entry; also mark every schedule entry whose time is at or before `now()` as fired.
    - `setDemoClock` marks all entries with time at or before the target as fired, and sets `report-fired-on` when the target is 21:00 or later.
    - `tick()` returns early while any socket is joined as `director` (`ctx.io.sockets.adapter.rooms.get('user:director')?.size`).
  - Verify: re-run `report2` and expect 1 report card. Add the same check to `server/scripts/flows.test.ts`.

- [ ] **P0‑2 (human: ~1h / CC: ~10min). Brain heuristics: answer general family questions and fix the refusal grammar.**
  - Surfaced by: requirement 5, verified at HEAD. "엄마 요즘 어때?" gets "일상 대화**은** 비공개로…"; the health refusal reads "건강 정보**은**…".
  - Files: `server/brain/heuristics/family.ts` (lines 19‑25 `questionCategory`, 48, 95), `server/brain/heuristics/ko.ts` (reuse `hasBatchim`).
  - Fix:
    - In `questionCategory`, stop mapping `요즘|오늘|안부` to `daily`. Return `undefined` (general summary) for "어때/괜찮/잘 지내/요즘" unless the question names daily content.
    - Build the topic particle with `hasBatchim(label) ? '은' : '는'` on lines 48 and 95.
  - Verify: unit tests expecting `answerFamily('엄마 요즘 어때?', ctx)` to contain BP or mood and not "비공개로 해 두셨어요", and the health refusal to contain "건강 정보는".

- [ ] **P0‑3 (human: ~1.5h / CC: ~15min). Socket auth: close Director and model control to LAN visitors by default.**
  - Surfaced by: CEO §3, verified with `verify.ts dir`. With no `TACHI_DIRECTOR_KEY`, any socket can `hello` as `director` and turn bots off. An anonymous socket (no hello) switched the model to unavailable `gpt-luna`.
  - Files: `server/orchestrator/socket.ts` (`hello` director branch, `model:set` at line 188), `server/brain/models.ts:33` (`setActive`), `server/index.ts` (banner), `server/orchestrator/app.ts` (`/api/graph?as=director`), `README.md`.
  - Fix:
    - If `TACHI_DIRECTOR_KEY` is unset, generate one at boot (`nanoid(6)`) and print `디렉터 http://localhost:4100/demo?key=…`. The client already forwards `?key=` (`web/src/lib/store.ts directorKey()`).
    - `model:set` requires `sock.data.userId` and is ignored for unavailable options; `setActive` rejects `available:false`.
    - Document both in README "Running on stage".
  - Verify: re-run `dir`. Expect hello as director without a key to be rejected, and anonymous `model:set` to leave `active` unchanged.

### P1

- [ ] **P1‑1 (human: ~2h / CC: ~20min). Live LLM: fit the 90 s budget and rehearse with real keys.**
  - Surfaced by: premise P2. Verified: a hung provider gives a 24.1 s first reply before the breaker opens. Sonnet and Haiku 5.5 run adaptive thinking by default with small `max_tokens`.
  - Files: `server/brain/providers/anthropic.ts:27`, `server/brain/providers/openai.ts`, `server/brain/llm.ts`.
  - Fix:
    - Send `output_config: { effort: 'low' }` and use `max_tokens: Math.max(req.maxTokens, 1024)`.
    - Treat `stop_reason: 'max_tokens'` with no text as its own error that is logged.
    - OpenAI: add `reasoning_effort: 'low'`.
    - Use `TACHI_LLM_TIMEOUT_MS` default 6000 when a Director is connected, and trip the breaker on the first abort.
  - Verify: with real keys, run 자동 진행 on Sonnet and then Terra. Every Tachi message must have `meta.source==='llm'` and `!meta.fallback`, and no step may exceed 8 s.

- [ ] **P1‑2 (human: ~30min / CC: ~5min). Director: make the model-swap step use an available model.**
  - Surfaced by: beat 12 hard-codes `modelKey: 'gpt-terra'`. Without an OpenAI key it produces an "오프라인 응답" badge.
  - Files: `web/src/pages/demo/DirectorConsole.tsx` (model step), `shared/constants.ts` (DEMO_SCRIPT step `model`).
  - Fix: choose the first `models.options` entry that is `available` and not active. If there is none, skip the step with the hint "API 키가 없어 모델 교체를 건너뛰어요".
  - Verify: with only `ANTHROPIC_API_KEY` set, the step switches to `claude-haiku`. With no keys, the step is skipped.

- [ ] **P1‑3 (human: ~1h / CC: ~10min). Privacy: only kin can query mom's health.**
  - Surfaced by: verified with `verify.ts dir`. 최정숙 (friend) in '친척방' got "평균 혈압이 129/82…" plus a health_card.
  - Files: `server/orchestrator/rooms.ts:31` (invited user `role`), `server/orchestrator/family.ts:54` (`answer`), `server/orchestrator/bots.ts` (candidates filter).
  - Fix:
    - Set invited users to `role: 'family'` only when the relation is in {딸, 아들, 며느리, 사위, 손녀, 손자, 여동생, 조카}; otherwise `'friend'`.
    - In `answer()`, if the asker's role is not `family` or the room contains a non-family member, use the refusal "가족에게만 공유된 정보예요" and never post a health_card.
  - Verify: add a flows test where the friend's question gets no `health_card` and no digits in the reply.

- [ ] **P1‑4 (human: ~1h / CC: ~10min). Family intent: casual sentences must not spawn artifacts.**
  - Surfaced by: verified with `verify.ts rooms`. "엄마 생신 선물 뭐가 좋을까?", "타치, 지난번 모임 사진 어디 있어?" and "다음 주에 엄마랑 병원 같이 가자" created **3** artifacts titled "어머니 생신 · 서울 가족 여행".
  - Files: `server/brain/heuristics/intents.ts:58-66`, `server/orchestrator/family.ts:40`.
  - Fix:
    - Gathering requires (모임|생신|여행|가족) **and** a proposal form (가자|모이자|하자|어때요?|어떨까) and no past or question markers (지난|어디 있|뭐가 좋).
    - A `타치` address plus a question mark goes to `ask_tachi`.
    - If an artifact under 24 h old exists in the room, append a note via `assistArtifact` instead of creating a new one.
  - Verify: the 3 sentences create 0 artifacts; the scripted "이번 엄마 생신에 다 같이 경주 가자!" still creates 1.

- [ ] **P1‑5 (human: ~45min / CC: ~10min). Artifact place and title must agree.**
  - Surfaced by: verified on a fresh seed. "경주 가자" produced title 경주, `place: "서울 신촌 일대"`, and a background citing the 1999 졸업식.
  - Files: `server/brain/heuristics/family.ts:110` (`draftGathering`), `server/orchestrator/artifacts.ts:11` (`pickMemoryForGathering`).
  - Fix: if the proposal names a place, use it for `place`. Only link a memory whose `placeId` or region matches that destination.
  - Verify: after a reset, minjun's step 10 alone gives a place containing "경주".

- [ ] **P1‑6 (human: ~1.5h / CC: ~15min). Demo script: add the requirement 4 and requirement 2 beats, plus a natural invite greeting** (TASTE D7).
  - Surfaced by: CEO premise P4; the invitee bots said "네, 알겠습니다." (verified).
  - Files: `shared/constants.ts` (DEMO_SCRIPT), `web/src/pages/demo/DirectorConsole.tsx` (`runStep`), `server/orchestrator/socket.ts` (director-only `demo:invite {roomId, contactId, as}` that calls `inviteContact`), `server/brain/heuristics/family.ts:221` (add a `system` greeting pool such as "초대해 줘서 고마워요! 할머니 소식 여기서 볼게요ㅎㅎ").
  - Fix: after step 6, insert "가족: 하린 초대" (`c-harin`) and "지은: 엄마 오늘 뭐 하셨어?", which shows a private refusal. Keep each beat at 4 s or less.
  - Verify: auto-run finishes the full script in under 95 s offline; harin's join line is persona-appropriate.

- [ ] **P1‑7 (human: ~20min / CC: ~5min). Copy: the family-facing share card must not call 박영수 "남편분".**
  - Surfaced by: shot 06-family-share.
  - Files: `server/brain/heuristics/compose.ts:14-20` (`peopleCalls`, add an audience parameter), `server/brain/prompts.ts` (`shareSummaryPrompt`: "자녀가 읽는 글이므로 남편은 '아버님'").
  - Verify: the scripted share_card text contains "아버님" and not "남편분".

- [ ] **P1‑8 (human: ~45min / CC: ~10min). DX: no silent `.env` skip; stage runbook.**
  - Surfaced by: DX journey. `process.loadEnvFile` is missing on Node 20.10/20.11, and `engines` says `>=20.10`.
  - Files: `package.json` (`engines.node: ">=20.12"`), `server/util/env.ts` (warn if `fs.existsSync('.env')` and `loadEnvFile` is undefined), `README.md` (new "Running on stage" section: pre-install, `TACHI_DIRECTOR_KEY`, `TACHI_LLM_TIMEOUT_MS`, `TACHI_GRAPH_ENGINE=memory`, restart after pull), `PLAN.md` §6 (env name is `TACHI_ANTHROPIC_BASE_URL`).
  - Verify: on Node 20.11 with a `.env`, startup prints the warning.

- [ ] **P1‑9 (human: ~30min / CC: ~5min). Stage theme: pin light** (TASTE D13).
  - Surfaced by: Design pass 5. 3721e33 follows the OS, so a dark-mode laptop shows an untested stage.
  - Files: `web/src/pages/demo/DirectorConsole.tsx` (pass `&theme=light` to phone iframes and set `data-theme` on `/demo` unless `?theme=dark`), `web/src/main.tsx`.
  - Verify: Playwright `colorScheme:'dark'` on `/demo` gives a body background of `rgb(255, 255, 255)`.

- [ ] **P1‑10 (human: ~1h / CC: ~15min). Tests: lock in this review's regressions.**
  - Files: `server/scripts/flows.test.ts`, `server/brain/brain.test.ts`.
  - Fix: add tests for P0‑1, P0‑2, P0‑3, P1‑3 and P1‑4, the share-then-recall race (1 trip card), and keyword recall variants. Add a Playwright check that the InviteDialog "초대" button is clickable in a production build, to guard the `548d0bb` regression.
  - Verify: `npm test` is green and the new cases fail on the pre-fix code.

### P2 (follow-ups, not blocking)

- **Recall hijacked by trip intent.** "가족여행 사진" goes to a trip because `/여행/` is checked before keyword match (`server/brain/heuristics/intents.ts:26`). Run `matchKeywords` first when a token matches a node name.
- **Poll availability hijack.** With an open poll, the senior saying "점심 먹었어" is read as availability because `AVAIL_RE` includes `점심|저녁` (`server/orchestrator/scheduling.ts:256`). Require a day word, or reply to the schedule_request.
- **Senior floor misses.** Composer input is 49 px tall (spec ≥56). The date chip is 13 px. `web/src/components/chat/Composer.css`, `web/src/components/chat/MessageList.css`.
- **Family touch targets.** Header and send icons are 36×36. Add 44 px hit areas in `web/src/pages/family/FamilyApp.css` and `web/src/components/chat/Composer.css`.
- **Tertiary text contrast.** Re-audit family timestamps after 3721e33 changed tertiary text; `#8f8f8f` on white is 3.3:1.
- **Seeded report header.** It says "오늘의 타치 리포트 · 11월 8일" for yesterday's report. Use "어제의 타치 리포트" when `dateLabel` is not today (`web/src/components/cards/MiscCards.tsx`).
- **Invite search focus ring.** The ring is drawn inside the field border (dark ring offset, `web/src/pages/family/family.css` `.fam-search`). Move the focus style to the container.
- **Director observability.** Log `{stepId, ms, model, source}` for each completed step so rehearsals show latency.
- **README/PLAN drift.** README says "해운대 1988" and "09:00, 14:10"; PLAN says 1983 and 1975 불국사. Align them with DEMO_SCRIPT.

### Deferred to TODOS.md (not written: product files are off-limits for this review)

- Per-room privacy scopes (family / relatives / friends / clinic). Needs product design; P1‑3 covers the demo.
- Upstream Kùzu maintenance risk. Pin `kuzu@0.11.3`, keep the memory engine, and revisit after the hackathon.
- A live-LLM eval suite (Korean tone, JSON validity, latency p95) for when real users come.

---

## Final gate (auto-decided; the user is away)

- Plan: **A) approve the review as-is**, with taste decisions D7, D11 and D13 at their recommended defaults.
- To unblock the demo, land **P0‑1 to P0‑3** first, then **P1‑1** (only if presenting with live keys), then P1‑2 to P1‑10.
- Re-run before going on stage:
  - `npm test`
  - `npx tsx server/scripts/smoke.ts`
  - one full Director 자동 진행 on a freshly restarted `npm run demo`, offline and, if keys are used, live
