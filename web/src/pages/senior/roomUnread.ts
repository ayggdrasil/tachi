import { useEffect, useRef, useState } from 'react';
import type { ID, Message } from '../../../../shared/types';
import { useTachi } from '../../lib/store';

/**
 * Client-side unread counts: messages from other people that arrived after the last time the room was open
 * (history that existed when the app connected counts as read).
 */
export function useRoomUnread(currentRoomId: ID, active: boolean): Record<ID, number> {
  const messages = useTachi(s => s.messages);
  const rooms = useTachi(s => s.rooms);
  const meId = useTachi(s => s.meId);
  const [seen, setSeen] = useState<Record<ID, number>>({});
  const baseline = useRef<Record<ID, number>>({});

  useEffect(() => {
    // First sight of a room: everything already there is "read".
    let changed = false;
    const next: Record<ID, number> = { ...baseline.current };
    for (const r of rooms) {
      if (next[r.id] === undefined) { next[r.id] = (messages[r.id] ?? []).length; changed = true; }
    }
    if (changed) { baseline.current = next; setSeen(s => ({ ...next, ...s })); }
  }, [rooms, messages]);

  const curLen = (messages[currentRoomId] ?? []).length;
  useEffect(() => {
    if (!active) return;
    setSeen(s => (s[currentRoomId] === curLen ? s : { ...s, [currentRoomId]: curLen }));
  }, [currentRoomId, curLen, active]);

  const out: Record<ID, number> = {};
  for (const r of rooms) {
    const list: Message[] = messages[r.id] ?? [];
    const from = seen[r.id] ?? list.length;
    out[r.id] = r.id === currentRoomId && active ? 0 : list.slice(from).filter(m => m.senderId !== meId && m.kind !== 'system').length;
  }
  return out;
}
