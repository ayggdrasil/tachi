// Dictionary parity + a guard against hard-coded Korean in the to-do / tool-loop UI.
// Regression: QA round "integration" (docs/qa/round-integration.md) — ISSUE-007: TaskCards, the artifact panel's task rows,
// the report's open-tasks list and the "Tachi checked" line were Korean-only while English is the default.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import kit from './kit';
import app from './app';
import server from '../../../server/i18n/strings';

const here = path.dirname(fileURLToPath(import.meta.url));

test('every web and server key exists in both English and Korean', () => {
  for (const [name, d] of [['kit', kit], ['app', app], ['server', server]] as const) {
    const en = Object.keys(d.en), ko = new Set(Object.keys(d.ko));
    assert.deepEqual(en.filter(k => !ko.has(k)), [], `${name}: keys missing in ko`);
    assert.deepEqual(Object.keys(d.ko).filter(k => !(k in d.en)), [], `${name}: keys missing in en`);
  }
});

test('the to-do and tool-loop keys used by the UI are present', () => {
  const dict = { ...kit.en, ...app.en };
  for (const k of ['task.status.todo', 'task.status.in_progress', 'task.status.done', 'task.status.blocked', 'task.stage.booking', 'task.stage.reminder',
    'task.stage.nudge', 'task.stage.escalate', 'task.stage.done', 'task.owner', 'task.due', 'task.links', 'task.newTab', 'task.openTasks', 'task.openCount',
    'task.reminded', 'ml.checked', 'ap.act.booking', 'ap.act.remind', 'ap.act.needOwner', 'ap.act.sharedLinks', 'ap.act.reminded', 'ap.act.failed',
    'ap.openLink', 'ap.due', 'ap.taskDone', 'ap.assignee', 'ap.unassigned', 'ap.taskRemove', 'dir.followups'])
    assert.ok(dict[k], `missing en key ${k}`);
});

test('no hard-coded Hangul in the to-do UI (strings come from the dictionaries)', () => {
  const files = ['../components/cards/TaskCards.tsx', '../components/cards/MiscCards.tsx', '../pages/family/ArtifactPanel.tsx', '../components/chat/MessageList.tsx'];
  for (const f of files) {
    const src = fs.readFileSync(path.join(here, f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
    // MessageList keeps one Korean particle rule for the senior's short name ('어머니'), which is data, not copy
    const hits = src.split('\n').filter(l => /[가-힣]/.test(l) && !/typer\?\.shortName === '어머니'/.test(l));
    assert.deepEqual(hits, [], `${f} has hard-coded Korean`);
  }
});
