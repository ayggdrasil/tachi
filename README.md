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
- 🧠 **LLM-driven 1:1 with the senior.** With a live model, the senior's own chat is a real conversation: Tachi answers questions about memories it doesn't have yet, asks one gentle question at a time, and **pushes the new memory into the DB + graph once the story is complete** (never on the first sentence; private until she agrees to share).
- 🌏 **English by default, Korean on demand.** Switch in the Director or senior settings, or add `?lang=ko`.
- 🗂 **Room switcher + 1:1 chats.** Jump between rooms from a menu; tap any family member (or their name in a chat) to open a person-to-person side chat. AI-bot relatives answer in character.
- 🗺 **Trip story cards.** When the senior shares a trip, the family room gets a travel-story card (the memory it grew from, highlights and the date); the day-by-day plan unfolds on tap.

**Live demo:** <https://sb-4ytb6h9dessx.vercel.run> (Director console: `/demo?key=…`, ask the team for the key).

## For judges: run it with your own LLM key (3 minutes)

Needs [Node.js](https://nodejs.org) 20.12 or newer.

```bash
git clone https://github.com/ayggdrasil/tachi.git && cd tachi
```

```bash
npm install
```

```bash
npm run demo
```

1. Open <http://localhost:4100>. The first card is **AI model**.
2. Pick **Anthropic (Claude)** or **OpenAI (ChatGPT)**, paste your API key, press **Connect**. (Pasting a key that starts with `sk-ant-` picks Anthropic automatically.)
3. Tachi sends one tiny test request. On success the card shows **✓ model · latency**, and every chat after that is answered by the real model. A wrong key, an account without credit or a model the account can't use is reported right there, and the app stays on what was working.

**Remember on this computer** (on by default) saves the key to `.env` in the project folder, so it survives restarts. `.env` is git-ignored and owner-only, and the key is only ever sent to the provider you picked. **Disconnect** removes it again.

No key? Everything still runs on the offline **demo brain** (scripted replies, marked 오프라인 응답 / “Offline reply”). Get a key at [console.anthropic.com](https://console.anthropic.com/settings/keys) or [platform.openai.com](https://platform.openai.com/api-keys).

The key card only appears in a browser on the machine running the server. Phones on the same Wi-Fi, tunnels and other websites can't read or change the key.

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

Easiest: paste a key in the **AI model** card on <http://localhost:4100> (see [For judges](#for-judges-run-it-with-your-own-llm-key-3-minutes)). Or create `.env` in the project root yourself:

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

**No `.env` access (e.g. the hosted demo)?** Open the Director console → **Model → API key**, choose OpenAI or Anthropic, paste a key and press **Connect**. The key is tested first; a rejected key never replaces a working one. By default it is kept in server memory only (never logged or sent to other clients) and disappears on restart. Tick **Save on this server (.env)** to keep it across restarts. **Remove** forgets it (memory and `.env`) and switches back to the demo brain.

Without keys Tachi runs on the deterministic **demo brain** (the UI marks those replies as 오프라인 응답). If a live call fails or times out mid-demo, that single reply falls back automatically.

### GBrain memory mirror (optional)

[GBrain](https://github.com/garrytan/gbrain) can sit next to Tachi as a **second memory store with deep recall**. Kùzu stays the primary graph (live graph, Cypher proof, every demo step); GBrain gets a write-through copy and answers only when the graph finds nothing by name:

- **Write-through.** Every saved memory becomes a page `tachi/memories/<id>`; people, places, eras, events, emotions and topics become pages under `tachi/people/`, `tachi/places/`, …, joined by typed links (`attended` for people in a memory, `mentions` + the Tachi relation as context for the rest, `relates_to` for family). Writes are queued in the background and never slow down or fail a Tachi flow.
- **Deep recall.** “차가운 바다 기억나?” has no graph node by that name, so Tachi asks GBrain (`query`, memory pages only), maps the hit back to its own memory and shows the usual recall card, marked **GBrain 깊은 회상** with the GBrain query in place of the Cypher. With a live model, the LLM senior agent gets the same fallback when it gathers candidate memories for a turn.
- **Reset.** Demo reset soft-deletes everything under `tachi/` (restorable for 72 h in GBrain) and the re-seed is mirrored again.

GBrain needs [Bun](https://bun.sh) ≥ 1.4.4 and runs as its own process. Use a **dedicated brain** for Tachi (not the one your coding agent uses), and create the token before starting the server (a running PGLite server locks the brain):

```bash
bun install -g github:garrytan/gbrain#stable
```

```bash
GBRAIN_HOME=~/tachi-brain gbrain init --pglite --no-embedding
```

```bash
GBRAIN_HOME=~/tachi-brain gbrain auth create tachi --scopes read,write
```

```bash
GBRAIN_HOME=~/tachi-brain gbrain serve --http --port 3131
```

Then add to `.env`:

```bash
TACHI_GBRAIN_URL=http://127.0.0.1:3131/mcp
TACHI_GBRAIN_TOKEN=gbrain_...           # from `gbrain auth create`
# optional
TACHI_GBRAIN_PREFIX=tachi               # page subtree Tachi owns (reset deletes only this)
TACHI_GBRAIN_TIMEOUT_MS=3000            # deep-recall deadline; on any error recall just says it hasn't heard that story
```

`npm run gbrain:check` verifies a running brain end to end (mirror, typed links, graph recall vs. GBrain recall, cleanup) under a throwaway prefix. `/api/status` reports `memoryMirror` health (state + queued writes; error details only in the server log). If an existing database is started with GBrain for the first time, its memories are copied over once.

Things to know:

- **Privacy stays in Tachi.** GBrain has no notion of 가족 공개 / 나만 보기, so Tachi never hands it the decision: only the server holds the token, pages carry no visibility flag and no photo URL (uploaded photos are capability URLs), health data is never mirrored, and every GBrain hit is re-checked against Tachi's own memories before it is shown. Deep recall is used only in the senior's own room.
- **Data leaving the machine.** A keyless brain (`--no-embedding`) keeps everything local. If you configure embedding, reranking or synthesis providers in GBrain, they receive memory text.
- **Korean search.** Without embeddings GBrain matches Korean by keyword (its CJK path; no particle stemming), so it adds recall over summaries and full story text. Real meaning-based recall (“바닷가” → 해운대) needs an embedding provider in GBrain.

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
- `server/graph/gbrain.ts` — optional GBrain mirror: MCP client for `gbrain serve --http`, Memory → pages + typed links, background write queue, deep recall (see [GBrain memory mirror](#gbrain-memory-mirror-optional)).
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
| `npm run gbrain:check` | Live check of the optional GBrain mirror against a running `gbrain serve --http` (needs `TACHI_GBRAIN_URL` / `TACHI_GBRAIN_TOKEN`) |
| `npm run qa:capture` | Rehearse the whole script against a running server (`BASE`, `TACHI_DIRECTOR_KEY`), print per-step seconds, capture phone screenshots, assert primary actions are above the fold (needs `playwright`) |
| `npm run qa:review` | Send source + screenshots to GPT‑6.1 Sol (reasoning `xhigh`, background mode) for a structured review → `docs/reviews/` |
| `npm run design:detect` | impeccable anti-pattern detector over the web source |

Design: achromatic “graphite ink on warm paper” system (see `docs/design-reference.md`), adapted for seniors (20px body, 56px controls).
