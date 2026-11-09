// SQLite persistence (better-sqlite3, WAL). Simple JSON-document tables + indexed columns where we query.
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { Artifact, CalendarEvent, Contact, Memory, Message, Poll, Room, SessionLog, Trip, User } from '../../shared/types';

type Stmt = Database.Statement;

class Doc<T extends { id: string }> {
  private cache = new Map<string, Stmt>();
  constructor(protected db: Database.Database, protected table: string) {}
  protected stmt(sql: string): Stmt {
    let s = this.cache.get(sql);
    if (!s) { s = this.db.prepare(sql); this.cache.set(sql, s); }
    return s;
  }
  get(id: string): T | undefined {
    const row = this.stmt(`SELECT data FROM ${this.table} WHERE id = ?`).get(id) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as T) : undefined;
  }
  all(): T[] {
    return (this.stmt(`SELECT data FROM ${this.table} ORDER BY rowid`).all() as { data: string }[]).map(r => JSON.parse(r.data) as T);
  }
  put(obj: T): T {
    this.stmt(`INSERT INTO ${this.table}(id, data) VALUES(?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data`).run(obj.id, JSON.stringify(obj));
    return obj;
  }
  delete(id: string): void { this.stmt(`DELETE FROM ${this.table} WHERE id = ?`).run(id); }
  find(pred: (x: T) => boolean): T | undefined { return this.all().find(pred); }
  filter(pred: (x: T) => boolean): T[] { return this.all().filter(pred); }
}

class MessageRepo {
  constructor(private db: Database.Database) {}
  insert(m: Message): Message {
    this.db.prepare(
      `INSERT INTO messages(id, room_id, created_at, data) VALUES(?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
    ).run(m.id, m.roomId, m.createdAt, JSON.stringify(m));
    return m;
  }
  update(m: Message): Message { return this.insert(m); }
  get(id: string): Message | undefined {
    const row = this.db.prepare('SELECT data FROM messages WHERE id = ?').get(id) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as Message) : undefined;
  }
  byRoom(roomId: string, limit = 200): Message[] {
    const rows = this.db.prepare(
      `SELECT data FROM (SELECT data, created_at AS c, rowid AS r FROM messages WHERE room_id = ? ORDER BY c DESC, r DESC LIMIT ?)
       ORDER BY c, r`,
    ).all(roomId, limit) as { data: string }[];
    return rows.map(r => JSON.parse(r.data) as Message);
  }
}

class KV {
  constructor(private db: Database.Database) {}
  get<T>(key: string): T | undefined {
    const row = this.db.prepare('SELECT data FROM kv WHERE key = ?').get(key) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as T) : undefined;
  }
  set<T>(key: string, value: T): T {
    this.db.prepare('INSERT INTO kv(key, data) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data').run(key, JSON.stringify(value));
    return value;
  }
  del(key: string): void { this.db.prepare('DELETE FROM kv WHERE key = ?').run(key); }
}

const DOC_TABLES = ['users', 'contacts', 'rooms', 'memories', 'trips', 'artifacts', 'polls', 'sessions', 'calendar_events'] as const;

export interface Db {
  raw: Database.Database;
  users: Doc<User>;
  contacts: Doc<Contact>;
  rooms: Doc<Room>;
  messages: MessageRepo;
  memories: Doc<Memory>;
  trips: Doc<Trip>;
  artifacts: Doc<Artifact>;
  polls: Doc<Poll>;
  sessions: Doc<SessionLog>;
  /** local calendar store (server/calendar/local.ts) */
  calendarEvents: Doc<CalendarEvent>;
  kv: KV;
  wipe(): void;
  close(): void;
}

export function openDb(dataDir: string): Db {
  fs.mkdirSync(dataDir, { recursive: true });
  const raw = new Database(path.join(dataDir, 'tachi.db'));
  raw.pragma('journal_mode = WAL');
  raw.pragma('synchronous = NORMAL');
  for (const t of DOC_TABLES) raw.exec(`CREATE TABLE IF NOT EXISTS ${t}(id TEXT PRIMARY KEY, data TEXT NOT NULL)`);
  raw.exec(`CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY, room_id TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL)`);
  raw.exec(`CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id, created_at)`);
  raw.exec(`CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY, data TEXT NOT NULL)`);
  const db: Db = {
    raw,
    users: new Doc<User>(raw, 'users'),
    contacts: new Doc<Contact>(raw, 'contacts'),
    rooms: new Doc<Room>(raw, 'rooms'),
    messages: new MessageRepo(raw),
    memories: new Doc<Memory>(raw, 'memories'),
    trips: new Doc<Trip>(raw, 'trips'),
    artifacts: new Doc<Artifact>(raw, 'artifacts'),
    polls: new Doc<Poll>(raw, 'polls'),
    sessions: new Doc<SessionLog>(raw, 'sessions'),
    calendarEvents: new Doc<CalendarEvent>(raw, 'calendar_events'),
    kv: new KV(raw),
    wipe() {
      raw.transaction(() => {
        for (const t of DOC_TABLES) raw.exec(`DELETE FROM ${t}`);
        raw.exec('DELETE FROM messages');
        raw.exec('DELETE FROM kv');
      })();
    },
    close() { raw.close(); },
  };
  return db;
}
