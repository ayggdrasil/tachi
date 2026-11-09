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

Claude requests use `output_config.effort: "low"` for short, fast replies (Sonnet 5.5 also opts into server-side refusal fallback); OpenAI requests use `reasoning_effort: "low"`.

Without keys Tachi runs on the deterministic **demo brain** (the UI marks those replies as 오프라인 응답). If a live call fails or times out mid-demo, that single reply falls back automatically.

## The 90-second demo

Start the server (`npm run demo`) — the banner prints the **Director URL with its key** (e.g. `http://localhost:4100/demo?key=x7Kp2a`). The key is generated at boot unless you set `TACHI_DIRECTOR_KEY`; opening `/` on the presenter laptop also offers the Director link. The stage shows two phones (어머니 · 시니어 앱, 딸 지은 · 가족방) and a third slot that switches automatically between the memory-graph proof panel and 민준's side chat.

Press **처음부터 재생** (resets the demo), then **자동 진행** — or step manually with **→ / Space**. Each step waits for its real result before advancing; offline the whole script takes ≈ 65–70 s.

| # | Step | What to point out |
|---|---|---|
| 1 | 타치가 먼저 말 걸기 (09:00) | Proactive greeting from a past memory (해운대 1988) |
| 2 | 옛 사진 올리기 (14:10) | Photo → interview starts |
| 3–5 | 답: 언제·어디 / 누구와 / 기억나는 일 | One question at a time → memory card + new graph nodes (Kùzu) |
| 6 | 가족에게 공유 | Consent first — emotional summary lands in the family room; bots react |
| 7 | 가족: 하린 초대 | Invite from the virtual phonebook; 하린 joins and greets |
| 8 | 키워드로 회상 (14:20) | “불국사” alone brings the memory back (graph path + Cypher in the proof panel) |
| 9 | 여행 제안 수락 | Trip from the memory → senior-friendly itinerary |
| 10 | 가족: 건강 질문 (19:40) | Answers only from what mom made public |
| 11 | 가족: 비공개 질문 | Private daily talk is politely refused |
| 12 | 가족: 모임 제안 | Gathering artifact everyone can edit |
| 13 | 가족: 시간 잡기 | Side chats with each member → date confirmed |
| 14 | 모델 교체 → 다시 질문 | Live switch to another available model (skipped honestly without keys) |
| 15 | 오늘의 리포트 (21:00) | “오늘 09:00, 14:10, 14:20에 어머님과 대화했어요” |

Rail extras: model switch with live health check (✓ latency / ✕), 먼저 말 걸기 (아침/추억/저녁/사진 요청), 리포트 보내기, 일정 확정하기, 가족 봇 on/off, stage theme (light by default), 데모 시각, 처음부터 재생.

### Running on stage — checklist

- `npm install` and `npm run demo` **before** you go on stage (first build ~10 s). Restart after every `git pull`.
- Keys in `.env` (Node ≥ 20.12 loads it natively; older Node uses a built-in parser with a warning).
- Rehearse once with the real model you'll present on; the Director's model row shows ✓ + latency after a health check.
- Slow venue Wi-Fi? `TACHI_LLM_TIMEOUT_MS=5000` (default 7000) — any reply that misses the deadline is answered by the offline brain and labelled 오프라인 응답; after two failures the provider is skipped for a minute.
- Native graph module trouble on an unusual machine? `TACHI_GRAPH_ENGINE=memory` uses the in-memory graph (the Director shows “메모리 그래프 (대체 모드)”).
- Optional access control: `TACHI_DIRECTOR_KEY=...` (fixed Director key), `TACHI_SENIOR_KEY=...` (open the senior app with `?key=`). Without a senior key the persona picker is open — fine for a demo, not for real users.
- `TACHI_LOG_TIMING=1` prints one line per Tachi reply (`model`, `source`, `ms`) for rehearsal timing.

### Multiple devices (type it yourself)

The server listens on your LAN. The Director rail and the landing page show a **QR code**; scan it on any phone on the same Wi‑Fi, choose a role (어머니 / 지은 / 민준 / 수연 / 하린) and type live. A persona claimed by a real device stops being a bot. Not on the same network? Tunnel port 4100 (e.g. `cloudflared tunnel --url http://localhost:4100`).

Replace `demo/photos/*.jpg` with your own family's old photos for the most moving demo (keep the file names, or pick any photo from the senior app).

## Tool-calling loop (도구 호출 루프)

With a live key, tool-shaped requests run an agent loop (`server/brain/toolLoop.ts`; main's senior LLM agent lives in `server/brain/agent.ts`): the model plans, calls tools, sees the results, then a final self-check turn verifies the answer against the goal before Tachi replies. Max 6 model turns, per-call and total deadlines (`TACHI_AGENT_STEP_TIMEOUT_MS`, default 12000; `TACHI_AGENT_DEADLINE_MS`, default 25000). `TACHI_LOG_AGENT=1` prints every step.

- **Tools** (`server/tools/`): `graph_search` (memory graph; family calls see shared memories only), `transit_route` / `map_search` (gazetteer + haversine, senior-paced estimates, no network), `reminder_create` / `reminder_list` (delivered in mom's chat by the proactive ticker on the demo clock). Inputs are schema-validated; privacy is enforced inside each tool.
- **Routing** (`server/orchestrator/agentic.ts`): senior reminders / routes / places and family route / place / reminder / memory questions. With a live model, the tool loop runs first for tool-shaped senior requests and otherwise falls through to the senior LLM agent (`seniorAgent.ts`). Health and mood questions keep the existing privacy-checked answer.
- **Safety net**: any failure, timeout, refusal, invalid output, or an answer naming private data falls back to the existing state machine unchanged. The offline demo brain only handles a few deterministic shapes (e.g. "내일 아침 8시에 혈압약 먹으라고 알려줘", "불국사 가는 길 알려줘", "불국사 근처에 가볼 만한 곳 있어?"); the 90-second script is unaffected. Answers show a small "타치가 확인한 것" line.

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
| `npm test` | Unit tests (brain, graph, providers) + flow, security, P0 and end-to-end smoke suites |
| `npx tsx server/scripts/smoke.ts` | End-to-end socket smoke test of the whole demo |
| `npm run qa:capture` | Rehearse the whole script against a running server (`BASE`, `TACHI_DIRECTOR_KEY`), print per-step seconds, capture phone screenshots, assert primary actions are above the fold (needs `playwright`) |
| `npm run qa:review` | Send source + screenshots to GPT‑6.1 Sol (reasoning `xhigh`, background mode) for a structured review → `docs/reviews/` |
| `npm run design:detect` | impeccable anti-pattern detector over the web source |

Design: achromatic “graphite ink on warm paper” system (see `docs/design-reference.md`), adapted for seniors (20px body, 56px controls).
