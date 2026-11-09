import type { ID, Room, User } from '../../../../shared/types';

/**
 * Human-readable room title for the viewer.
 * - dm rooms show the OTHER member's name (never the stored title)
 * - the Tachi 1:1 room shows the assistant's name
 * - family / side rooms use the server-provided (locale-aware) title
 * `t` is the function returned by `useT()` (or the standalone `t`).
 */
export function roomDisplayName(
  room: Room | undefined,
  meId: ID | null,
  users: Record<ID, User>,
  t: (key: string, vars?: Record<string, string | number | undefined>) => string,
): string {
  if (!room) return '';
  if (room.type === 'dm') {
    const other = room.memberIds.find(id => id !== meId);
    const u = other ? users[other] : undefined;
    return u?.shortName ?? u?.name ?? t('room.dmFallback');
  }
  if (room.type === 'tachi') return t('room.tachi');
  return room.title || (room.type === 'family' ? t('room.family') : t('room.side'));
}

/** The other person in a dm room (undefined for other room types). */
export function dmPeerId(room: Room | undefined, meId: ID | null): ID | undefined {
  if (!room || room.type !== 'dm') return undefined;
  return room.memberIds.find(id => id !== meId);
}
