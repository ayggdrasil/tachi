# 타치 Tachi

**어르신의 기억을 지키고, 가족을 다시 잇는 AI 동반자.**
An AI companion that turns a senior's old photos and stories into a living memory graph — and brings the family back around those memories.

- 📷 → 💬 → 🕸 **Photo interview → memory graph.** The senior shares an old photo; Tachi asks short, warm questions (언제? 어디? 누구와? 기억나는 일?) and stores place, era, people, event, emotions and keywords in an embedded **Kùzu graph DB**.
- 🔎 **Keyword recall.** Later, one word (“불국사”) is enough — Tachi walks the graph and brings the memory back with the photo and the matching path (Cypher shown).
- 🔒 **Privacy by category.** 건강 / 추억 / 일상 / 기분 / 여행 — each 가족 공개 or 나만 보기, enforced in server code (not just the prompt).
- ☀️ **Proactive check-ins.** Tachi starts conversations a few times a day (09:00, 14:00, 19:30) from past memories or asks for a new photo, and **reports to the family room** when and what they talked about (private topics masked).
- 💌 **Share to family.** After a memory is saved: “가족에게 공유할까요?” → an emotional summary card lands in the family room.
- 🧳 **Memory-based trips.** Tachi suggests a nearby trip tied to the memory; on “좋아” it builds a senior-friendly itinerary.
- 👨‍👩‍👧 **Family rooms.** Create rooms, invite from a (virtual) phonebook, ask Tachi about mom's public health info, turn a gathering idea into a **collaborative artifact**, and let Tachi **coordinate the date in side chats** with each member.
- 🔁 **Swappable LLMs.** Claude Sonnet 5.5 · Claude Haiku 5.5 · ChatGPT Terra · ChatGPT Luna — switch live; an offline **demo brain** keeps everything working without keys.
- 🤖 **Demo-ready.** AI family bots chime in with 1–2 lines; a Director console runs the 90-second script; real phones can join over LAN.

## Quick start

```bash
npm install
```

```bash
npm run demo
```

Open <http://localhost:4100/demo> for the Director console (or <http://localhost:4100/> to pick a role).
Development with hot reload: `npm run dev` → <http://localhost:5173>.

### Real LLMs (optional)

Create `.env` in the project root:

```bash
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
# optional overrides
TACHI_DEFAULT_MODEL=claude-sonnet        # claude-sonnet | claude-haiku | gpt-terra | gpt-luna | demo
TACHI_MODEL_CLAUDE_SONNET=claude-sonnet-5-5
TACHI_MODEL_CLAUDE_HAIKU=claude-haiku-5-5
TACHI_MODEL_GPT_TERRA=gpt-6.1-terra
TACHI_MODEL_GPT_LUNA=gpt-6-luna
```

Without keys Tachi runs on the deterministic **demo brain** (the UI marks those replies as 오프라인 응답). If a live call fails or times out mid-demo, that single reply falls back automatically.

## The 90-second demo

Director console: <http://localhost:4100/demo>. Left rail = scenario, stage = two phones (어머니 · 시니어 앱, 딸 지은 · 가족방).
Press **→** or **Space** to run the next step (← back, R rewind). “자동 진행” runs the whole script hands-free.

| # | Step | What to point out |
|---|---|---|
| 1 | 타치가 먼저 말 걸기 | Proactive greeting from a past memory (해운대 1988) |
| 2 | 옛 사진 올리기 | Photo → interview starts |
| 3–5 | 답: 언제·어디 / 누구와 / 기억나는 일 | One question at a time → memory card + graph nodes appear (Kùzu) |
| 6 | 가족에게 공유 | Emotional summary arrives in the family room; bots react |
| 7 | 키워드로 회상 | “불국사” alone brings the memory back (graph path + Cypher) |
| 8 | 여행 제안 수락 | Trip from the memory → itinerary → “가족과 함께 가기” |
| 9 | 가족: 건강 질문 | Answers only from what mom made public |
| 10 | 가족: 모임 제안 | Gathering artifact everyone can edit |
| 11 | 가족: 시간 잡기 | Side chats with each member → date confirmed |
| 12 | 오늘의 리포트 | “오늘 09:00, 14:10에 어머님과 대화했어요” |

Rail extras: 먼저 말 걸기 (아침/추억/저녁/사진 요청), 리포트 보내기, 일정 확정하기, 가족 봇 on/off, 모델 전환, 데모 초기화.

### Multiple devices (type it yourself)

The server listens on your LAN. The Director rail and the landing page show a **QR code**; scan it on any phone on the same Wi‑Fi, choose a role (어머니 / 지은 / 민준 / 수연 / 하린) and type live. A persona claimed by a real device stops being a bot. Not on the same network? Tunnel port 4100 (e.g. `cloudflared tunnel --url http://localhost:4100`).

Replace `demo/photos/*.jpg` with your own family's old photos for the most moving demo (keep the file names, or pick any photo from the senior app).

## Architecture

```
web (Vite + React 19)                     server (Node + tsx)
 /senior  senior app (large type)  ◀──▶  Socket.IO  ── orchestrator (flows: interview, share, recall,
 /family  family rooms + artifact          REST        trip, family Q&A, gathering, scheduling,
 /demo    director console                             proactive + report, bots, rooms, privacy)
 /        role picker + LAN QR                           │            │
                                                         ▼            ▼
                                             brain (LLM providers   graph (Kùzu embedded
                                             + demo heuristics)     graph DB, Cypher)
                                                         │
                                                  SQLite (better-sqlite3): users, rooms,
                                                  messages, memories, artifacts, polls, health…
```

- `shared/types.ts` — single contract for domain types and socket events.
- `server/brain/` — Anthropic Messages API & OpenAI Chat Completions via `fetch`, runtime model switching, Korean prompts, offline heuristics with identical return types.
- `server/graph/` — Kùzu schema `Memory, Person, Place, Era, Event, Emotion, Topic` with `APPEARS_IN, TAKEN_AT, IN_ERA, ABOUT, EVOKES, MENTIONS, FAMILY_OF`; in-memory fallback if the native module can't load.
- Privacy is enforced where context is assembled (family Q&A, reports, bootstrap, socket fan-out).

## Scripts

| Command | What it does |
|---|---|
| `npm run demo` | Build the web app and serve everything on :4100 |
| `npm run dev` | Server (watch) + Vite dev server |
| `npm run reset` | Reset the database and graph to the demo seed |
| `npm run typecheck` | TypeScript check |
| `npm test` | Brain/graph unit tests |
| `npx tsx server/scripts/smoke.ts` | End-to-end socket smoke test of the whole demo |
| `npx tsx scripts/qa/capture.ts` | Drive the demo and capture phone screenshots (server must be running) |
| `npx tsx scripts/qa/gpt-review.ts` | Send source + screenshots to GPT‑6.1 Sol for a structured review |

Design: achromatic “graphite ink on warm paper” system (see `docs/design-reference.md`), adapted for seniors (20px body, 56px controls).
