// App factory: express + socket.io + REST. Used by server/index.ts and the smoke test.
import '../util/env';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import QRCode from 'qrcode';
import { nanoid } from 'nanoid';
import { Server } from 'socket.io';
import { createBrain } from '../brain/index';
import { createGraphStore } from '../graph/index';
import { openDb } from '../db';
import { seed } from '../db/seed';
import { ctx, type IO } from './ctx';
import { attachSocketHandlers } from './socket';
import { startTicker, stopTicker } from './proactive';
import { log, warn } from '../util/misc';
import type { ModelKey } from '../../shared/types';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function lanUrls(port: number): string[] {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list ?? []) if (i.family === 'IPv4' && !i.internal) out.push(`http://${i.address}:${port}`);
  }
  return out;
}

export interface AppOptions { port?: number; dataDir?: string; paceMs?: number; quiet?: boolean }

export async function createApp(opts: AppOptions = {}) {
  const port = opts.port ?? Number(process.env.PORT || 4100);
  const dataDir = opts.dataDir ?? path.join(ROOT, 'data');
  const uploadsDir = path.join(dataDir, 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  const photosDir = path.join(ROOT, 'demo', 'photos');
  fs.mkdirSync(photosDir, { recursive: true });

  const app = express();
  const server = http.createServer(app);
  const io: IO = new Server(server, { cors: { origin: true }, maxHttpBufferSize: 2e6 }) as IO;

  Object.assign(ctx, {
    io, db: openDb(dataDir), dataDir, rootDir: ROOT, paceMs: opts.paceMs ?? Number(process.env.TACHI_PACE_MS || 800),
    brain: createBrain(), graph: createGraphStore({ dataDir }),
  });
  ctx.lanUrls = lanUrls(port);
  await ctx.graph.init();

  // first boot → seed; existing db with an empty graph → rebuild graph from memories
  if (!ctx.db.users.all().length) await seed();
  else {
    try {
      const st = await ctx.graph.stats();
      if (st.nodes === 0) for (const m of ctx.db.memories.all().filter(x => x.status === 'saved')) await ctx.graph.upsertMemory(m);
    } catch (e) { warn('graph rebuild failed:', e); }
  }
  const demo = ctx.db.kv.get<import('../../shared/types').DemoState>('demo');
  if (demo) ctx.db.kv.set('demo', { ...demo, lanUrls: ctx.lanUrls });
  const savedModel = ctx.db.kv.get<ModelKey>('model');
  if (savedModel) { try { ctx.brain.setActiveModel(savedModel); } catch { /* unavailable now */ } }

  // ── REST ──
  app.use(express.json({ limit: '1mb' }));
  app.use('/uploads', express.static(uploadsDir));
  app.use('/demo-photos', express.static(photosDir));

  const upload = multer({
    storage: multer.diskStorage({
      destination: uploadsDir,
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase().replace(/[^.a-z0-9]/g, '');
        const fallbackExt = file.mimetype === 'image/png' ? '.png' : file.mimetype === 'image/webp' ? '.webp' : '.jpg';
        cb(null, `${nanoid(12)}${ext && ext.length <= 6 ? ext : fallbackExt}`);
      },
    }),
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype.startsWith('image/')) cb(null, true);
      else cb(new Error('이미지 파일만 올릴 수 있어요.'));
    },
  });
  app.post('/api/upload', upload.any(), (req, res) => {
    const f = (req.files as Express.Multer.File[] | undefined)?.[0];
    if (!f) { res.status(400).json({ error: '파일이 없어요.' }); return; }
    res.json({ url: `/uploads/${f.filename}` });
  });

  let qrCache: { key: string; qr: string } | undefined;
  app.get('/api/lan', async (_req, res) => {
    const urls = ctx.lanUrls.length ? ctx.lanUrls : [`http://localhost:${port}`];
    try {
      if (qrCache?.key !== urls[0]) qrCache = { key: urls[0], qr: await QRCode.toDataURL(urls[0] + '/', { margin: 1, width: 320 }) };
      res.json({ urls, qr: qrCache.qr });
    } catch (e) { warn('qr failed:', e); res.json({ urls, qr: '' }); }
  });
  app.get('/api/demo-photos', (_req, res) => {
    let files: string[] = [];
    try { files = fs.readdirSync(photosDir).filter(f => /\.(jpe?g|png|webp|gif)$/i.test(f)).sort(); } catch { /* none */ }
    res.json(files.map(f => `/demo-photos/${f}`));
  });
  app.get('/api/graph', async (_req, res) => {
    try { res.json(await ctx.graph.subgraph()); } catch (e) { res.status(500).json({ error: String(e) }); }
  });
  app.get('/api/status', (_req, res) => {
    res.json({ ok: true, graphEngine: ctx.graph.engine, model: ctx.brain.getModelState().active });
  });

  if (process.env.NODE_ENV === 'production') {
    const dist = path.join(ROOT, 'dist');
    app.use(express.static(dist));
    app.get('/{*splat}', (req, res, next) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io')) { next(); return; }
      res.sendFile(path.join(dist, 'index.html'), err => { if (err) next(); });
    });
  }

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    warn('http error:', err);
    res.status(400).json({ error: err instanceof Error ? err.message : '요청을 처리하지 못했어요.' });
  });

  attachSocketHandlers(io);
  startTicker();

  const listen = (p = port): Promise<number> => new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(p, '0.0.0.0', () => resolve((server.address() as { port: number }).port));
  });
  const close = async (): Promise<void> => {
    stopTicker();
    ctx.gen++;
    await io.close();
    if (server.listening) await new Promise<void>(r => server.close(() => r()));
    try { ctx.db.close(); } catch { /* already closed */ }
  };
  if (!opts.quiet) log('app ready');
  return { app, server, io, listen, close, ctx };
}
