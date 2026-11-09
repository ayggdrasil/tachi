# Tachi — Implementation Plan (hackathon build)

> **Tachi** is an AI companion for seniors. It keeps a senior's memories alive (photo → conversation → memory graph),
> checks in proactively, and connects the family around those memories (shared memory cards, health Q&A,
> trip ideas, gathering artifacts, schedule coordination).
>
> Target: a **90-second live demo** that never breaks. Real LLMs when API keys exist, a deterministic
> offline "demo brain" when they don't — the UI and flow are identical either way.

Owner of this document: the orchestrating architect (Opus). Coding agents (Sonnet) implement against
the contracts below. **Contracts are frozen** — if you need a change, add (don't rename/remove) and note it
in your final report.

---

## 1. The 90-second demo script (drives every priority)

Single screen: the **Director console** (`/demo`) shows two phone frames side by side —
**어머니 김순자 (senior app)** and **딸 김지은 (family app)** — plus a slim control rail.
Family members not driven by a human are **AI bots** that chime in with 1–2 lines.

| t | What the audience sees |
|---|---|
| 0–8s | Tachi **proactively** greets mom (`09:00 아침 안부`), referencing an old memory (해운대 1988). |
| 8–30s | Mom taps the big photo button, uploads an old photo. Tachi asks short warm questions one at a time (언제? 어디? 누구와? 가장 기억나는 일?). Mom answers (typed, quick‑reply chips, or voice). |
| 30–38s | A **memory card** appears: 장소 경주 불국사 · 시기 1984년 봄 · 인물 남편 박영수, 딸 지은, 아들 민준 · 감정 즐거움·그리움. A small **graph** animates new nodes/edges (Kùzu graph DB). Visibility toggle: 가족 공개 / 나만 보기. |
| 38–45s | Tachi: **“이 추억을 가족에게 공유할까요?”** → 네 → family room receives an **emotional summary card**; bots react (“엄마 이 사진 처음 봐요!”). |
| 45–52s | Mom types just **“불국사”** → Tachi recalls the memory (photo + story + matched graph path, Cypher shown small). |
| 52–62s | Tachi suggests a **nearby trip** based on the memory (경주 1박 2일). Mom: 좋아 → **itinerary** card (timeline, senior‑friendly notes). “가족과 함께 가기” → creates a **gathering artifact** in the family room. |
| 62–75s | Family room: 지은 asks **“엄마 요즘 혈압 괜찮으셔?”** → Tachi answers from health info mom made public (private info is refused). 지은: **“타치, 모임 시간 잡아줘”** → Tachi opens **side chats** with each member (and asks mom in her own chat); bots answer; a live “응답 3/5” counter → **확정: 다음 주말 일요일 12:00**. Artifact updates. |
| 75–90s | **Daily report** in family room: “오늘 09:00, 14:10 어머니와 대화했어요 …” (private sessions shown as 비공개). Model switcher flips Claude Sonnet ↔ ChatGPT Terra live. |

Every step must be reachable with **one tap** (quick‑reply chips / card buttons) and also via free text.
The Director rail has: scenario step buttons, “타치 먼저 말걸기”, “리포트 보내기”, bots on/off, model switch,
reset demo, LAN QR code for real phones.

---

## 2. Stack

- **Runtime:** Node ≥ 20.10, TypeScript everywhere, run with `tsx` (no server build step).
- **Server:** Express + Socket.IO (real‑time, multi‑device), `better-sqlite3` (relational state),
  **Kùzu** embedded graph DB (`kuzu` npm, Cypher) for the memory graph, `multer` uploads.
- **Web:** Vite + React 18 + React Router, `socket.io-client`, `lucide-react` icons (monochrome line, 1.5 stroke),
  `d3-force` for the memory graph view, `qrcode` (server renders data‑URL).
- **LLM:** provider abstraction over **Anthropic Messages API** and **OpenAI Chat Completions** via `fetch`
  (no SDKs). Runtime‑switchable models (see §6). Offline **demo brain** heuristics as fallback.
- **Ports:** server `PORT=4100` (binds `0.0.0.0`). Vite dev `5173` proxies `/api`, `/socket.io`, `/uploads`,
  `/demo-photos` → 4100. `npm run demo` builds web and serves `dist/` from the server on 4100.

```
tachi/
  shared/types.ts            # ← frozen contract (domain + socket events)
  shared/constants.ts        # personas, model options, privacy categories, demo clock helpers
  server/
    index.ts                 # express + socket.io bootstrap, static, REST            (Agent A)
    db/                      # sqlite schema, repositories, seed                       (Agent A)
    orchestrator/            # flows: senior, family, side, actions, proactive, report, scheduling, bots (Agent A)
    brain/contract.ts        # ← frozen contract for AI functions
    brain/                   # providers, model registry, prompts, AI functions + demo heuristics (Agent B)
    graph/contract.ts        # ← frozen contract for graph store
    graph/                   # Kùzu graph store + in‑memory fallback                   (Agent B)
    data/places.ts           # Korean places gazetteer (+ nearby attractions)          (Agent B)
  web/
    index.html, src/main.tsx, src/App.tsx (routes)
    src/lib/socket.ts, src/lib/store.ts      # ← provided (frozen API)
    src/styles/tokens.css, base.css          # ← provided design tokens
    src/components/chat/*    # MessageList, bubbles, every card renderer, Composer   (Agent C)
    src/components/graph/*   # MemoryGraph (d3-force SVG)                              (Agent C)
    src/pages/senior/*       # senior app                                              (Agent C)
    src/pages/family/*       # family app, rooms, invite, artifact panel, side chats   (Agent D)
    src/pages/demo/*         # director console                                         (Agent D)
    src/pages/Landing.tsx    # persona picker + LAN QR                                  (Agent D)
  demo/photos/               # sample old photos for the demo
  data/                      # runtime: tachi.db, graph.kuzu/, uploads/  (gitignored)
```

---

## 3. Domain model (see `shared/types.ts` for exact types)

- **User** — `mom` (senior 김순자, 78, 서울 마포), family `jieun` (딸), `minjun` (아들), `suyeon` (며느리),
  `harin` (손녀), plus `tachi` (the AI). Each family user has `isBot` runtime flag: true unless a human device
  has claimed that persona.
- **Contact** — virtual phonebook (12 entries: the family above + 이모 김영희, 친구 최정숙, 조카 박철수, 손자 박동현, …).
  Inviting a contact who is not yet a user creates the user (bot persona with a generic voice).
- **Room** — `tachi` (mom ↔ Tachi, private), `family` (group), `side` (Tachi ↔ one member, for scheduling).
- **Message** — `kind` + `text` + typed `payload` (cards). Tachi is sender `tachi`.
- **Memory** — photo, title, story, era/year/season, place, people, event, emotions, tags, `visibility`
  (`family` | `private`), `status` (`draft` | `saved`), `sharedAt`.
- **Graph** — nodes `Memory, Person, Place, Era, Event, Emotion, Topic`; rels `APPEARS_IN (Person→Memory)`,
  `TAKEN_AT (Memory→Place)`, `IN_ERA (Memory→Era)`, `ABOUT (Memory→Event)`, `EVOKES (Memory→Emotion)`,
  `MENTIONS (Memory→Topic)`, `FAMILY_OF (Person→Person {relation})`.
- **Privacy** — per category `health | memory | daily | mood | trip` → `family | private`. Memory has its own
  override. **Enforced in server code** (what context reaches family Q&A / reports), never only by prompt.
- **Health** — 7 days seeded: blood pressure, meds (taken/missed), sleep hours, steps, mood. Mom can log
  (“오늘 혈압 132에 84였어”).
- **Session log** — each Tachi conversation session (`proactive`/`senior-initiated`) with time, category,
  summary → feeds the family **report**.
- **Trip** — suggestion (from a memory's place) → accepted → itinerary (stops with times).
- **Artifact** — gathering plan: title, background (why; linked memory/trip), purpose, place, date
  (undecided/confirmed), agenda, tasks (text, assignee, done), notes; collaboratively edited live.
- **Poll** — schedule coordination: candidate slots, per‑member side room, responses, result.

---

## 4. Flows (server orchestrator, Agent A — calls brain/graph contracts)

**4.1 Senior photo interview.** `message:send {photoUrl}` in mom's tachi room → create draft Memory,
`interview` state on the room (`server memory`). Each senior text while interviewing →
`brain.interviewTurn(state, text)` → reply (+ quick replies) until `done` → `brain.extractMemory(...)` →
save Memory, `graph.upsertMemory(...)` → post `memory_card` (with `graphDelta`) → post a Tachi text
“이 추억을 가족에게 공유할까요?” with actions (`share_memory` / `skip_share`).
**4.2 Share.** `action share_memory` → `brain.shareSummary(memory)` → `share_card` in the family room
(+ senior confirmation “가족방에 전해 드렸어요”). Visibility becomes `family`. Bots react.
**4.3 Recall.** Senior text not in an interview: `brain.classifySeniorIntent` → `recall` →
`graph.search(keywords)` → best memory + path → `brain.recallReply(memory, query)` → `recall_card`.
Demo heuristic: any token matching a graph node name/alias triggers recall.
**4.4 Trip.** After a recall or share (or intent `trip`), Tachi offers `trip_suggestion` built by
`brain.suggestTrip(memory, nearbyPlaces)`; `accept_trip` → `brain.planItinerary(...)` → `itinerary` card with
actions `share_trip`, `make_gathering`.
**4.5 Family Q&A.** In the family room, Tachi answers when the message mentions 타치/@타치 or is a question
about 엄마/어머니/할머니/어머님 (health, mood, recent, memories). Server builds `FamilyContext` with only
**public** categories (+ list of private ones) → `brain.answerFamily(...)` → text (+ optional `health_card`).
**4.6 Gathering artifact.** Family text with gathering intent (모임/생신/모이자/만나자/여행 가자) or action
`make_gathering` → `brain.draftGathering(...)` → Artifact saved → `artifact` message. Live edits via
`artifact:update`. Tachi can add suggestions (`artifact:assist`).
**4.7 Scheduling.** “시간 잡아줘 / 일정 맞춰줘” or action `start_scheduling` → candidate slots
(`shared/constants.ts › buildCandidateSlots(now)`) → Poll → for every member (incl. mom, in her tachi room)
open/reuse a `side` room and post `schedule_request` → responses via action `pick_slots` or free text
(`brain.parseAvailability`) → live `poll:update` + family room progress message updated in place →
all responded (or Director “확정”) → choose max‑availability earliest slot → `schedule_result` in family room,
artifact date confirmed, confirmations in side rooms and mom's room.
**4.8 Proactive + report.** Schedule `09:00 아침 안부`, `14:00 추억 이야기`, `19:30 저녁 인사` (server tick 20s;
Director can fire now). `brain.proactiveMessage(kind, memory?)` → Tachi text in mom's room with
`payload.proactive=true` + quick replies; sometimes asks for a new memory (“오늘은 옛날 사진 한 장 보여주실래요?”).
Session log entries recorded; `brain.composeReport(sessions, privacy)` → `report` card in family room
(after a proactive session gets a reply, on Director request, and at 21:00).
**4.9 Bots.** Unclaimed family personas reply in the family room (probability ~0.6, 1.2–3.5s delay, max 2
bots per trigger, never to another bot's message more than once in a row) using `brain.botReply`, and answer
`schedule_request` in side rooms after 1.5–4s using deterministic preferences (`BOT_SLOT_PREFS`).
**4.10 Presence/claims.** `hello {userId}` claims a persona for that socket; bots skip claimed personas.

---

## 5. Brain (Agent B) — `server/brain/contract.ts`

Every function: if the active model is a real provider and its key exists → prompt the LLM (Korean, warm,
short sentences for seniors, JSON where structured; strict parse + validation) with a 25s timeout; on any
failure → **deterministic demo heuristic** (same return type). Heuristics must make the §1 script work
perfectly offline: Korean year/decade/season parsing, gazetteer place matching (`server/data/places.ts`),
relation words (남편, 영감, 딸, 큰딸, 아들, 손녀, 친구, …) + names, emotion words, events (수학여행, 신혼여행,
결혼식, 환갑, 돌잔치, 졸업, 소풍, 가족여행, 명절 …).

Interview slot order: `when` → `where` → `who` → `story` (skip any slot already filled by earlier answers;
finish after ≤4 questions). Replies ≤ 2 short sentences, honorific (해요체 to 어머님).

## 6. Models (runtime switchable)

| key | label | provider | default model id (env override) |
|---|---|---|---|
| `claude-sonnet` | Claude Sonnet 5.5 | anthropic | `claude-sonnet-5-5` (`TACHI_MODEL_CLAUDE_SONNET`) |
| `claude-haiku` | Claude Haiku 5.5 | anthropic | `claude-haiku-5-5` (`TACHI_MODEL_CLAUDE_HAIKU`) |
| `gpt-terra` | ChatGPT Terra | openai | `gpt-6.1-terra` (`TACHI_MODEL_GPT_TERRA`) |
| `gpt-luna` | ChatGPT Luna | openai | `gpt-6-luna` (`TACHI_MODEL_GPT_LUNA`) |
| `demo` | 데모 브레인 (오프라인) | mock | — |

Keys: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` (from env or `.env` via `process.loadEnvFile`). Default active =
first available of sonnet → terra → demo. Anthropic: `POST https://api.anthropic.com/v1/messages`, headers
`x-api-key`, `anthropic-version: 2023-06-01`; body `{model, max_tokens, system, messages}`; images as
`{type:'image', source:{type:'base64', media_type, data}}`. **Do not send temperature/top_p.**
OpenAI: `POST https://api.openai.com/v1/chat/completions`, `Authorization: Bearer`, body
`{model, messages, max_completion_tokens}`; images as `{type:'image_url', image_url:{url:'data:…'}}`;
JSON via `response_format: {type:'json_object'}`. Base URLs overridable (`TACHI_ANTHROPIC_BASE_URL`,
`OPENAI_BASE_URL`). The UI always shows which model actually answered (`message.meta.model`), and a
fallback badge when the heuristic answered.

## 7. Design system (from refero “ChatGPT — graphite ink on warm paper”, adapted for seniors)

Achromatic only: Graphite Ink `#0d0d0d` text, Pure White `#fff` canvas, Sidebar Mist `#f9f9f9` chrome,
Hairline `#0000001a` borders (elevation = hairline, **no shadows**), Hover Veil `#0000000d`, Mid Ash `#5d5d5d`,
Hollow `#8f8f8f`, Edge Gray `#e6e6e6`, Ink Press `#000` (tooltips, primary filled buttons), scrim `#00000080`.
System font stack only. Radii 10px (buttons, cards, nav), pills only for chips. Spacing 6/8/10/12/16/20/24.
User bubble `#f4f4f4`, Tachi messages are unboxed text on white (like ChatGPT) with a small ink avatar.
Meaning via weight & position, not hue. **Senior mode:** body 20px/1.55, controls ≥ 56px tall, chips 48px,
max 2 actions per card, high contrast (Mid Ash minimum for any text). Family mode: body 16px, ChatGPT layout
(260px sidebar on desktop, full‑screen on mobile). Graph: nodes distinguished by **shape** (Memory filled
circle, Person ring, Place square, Era diamond, Event rounded rect, Emotion small dot), not color.
Photos are the only colorful content — let them breathe.

## 8. Quality bar

- `npm run typecheck` passes. `npm run demo` boots with zero config (demo brain) on a fresh clone.
- Every socket handler wrapped in try/catch; failures post a gentle Tachi fallback, never crash.
- Seeded state makes recall, proactive, report, health Q&A work immediately after reset.
- Director reset restores the exact seed in < 1s (sqlite reseed + graph rebuild).
- Mobile: 390×844 looks native; desktop family view uses the sidebar layout.
- Korean copy throughout; warm, respectful, concise.

## 9. Work split

| Agent | Model | Owns |
|---|---|---|
| Architect | Opus | this plan, `shared/*`, contracts, `web/src/lib/*`, tokens, integration, review loops |
| A — Server core | Sonnet | `server/index.ts`, `server/db/*`, `server/orchestrator/*`, `server/scripts/*` |
| B — AI brain + graph | Sonnet | `server/brain/*` (not contract.ts), `server/graph/*` (not contract.ts), `server/data/*` |
| C — Chat UI + senior app | Sonnet | `web/src/components/**`, `web/src/pages/senior/*` |
| D — Family + director + landing | Sonnet | `web/src/pages/family/*`, `web/src/pages/demo/*`, `web/src/pages/Landing.tsx`, `web/src/App.tsx` |

Then: integration (Architect) → ChatGPT review/improve loop → gstack autoplan QA → impeccable design loop.
