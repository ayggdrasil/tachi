import { SENIOR_ROOM_ID } from '../../../../shared/constants';
import { useTachi } from '../../lib/store';
import { useLocale, useT } from '../../lib/i18n';
import { MessageList } from '../../components/chat/MessageList';
import { Composer } from '../../components/chat/Composer';
import { roomDisplayName, dmPeerId } from '../../components/common/roomName';

/** 'Soonja Kim' -> 'Soonja' (en), '김순자' -> '순자님' (ko). */
function greetName(full: string | undefined, locale: 'en' | 'ko'): string {
  if (!full) return '';
  return locale === 'ko' ? full.slice(1) + '님' : full.split(' ')[0];
}

/** The chat area for whichever room is selected: Tachi 1:1 (photo interview), a family room, a DM, or a scheduling side chat. */
export function SeniorChat({ roomId, onOpenDm }: { roomId: string; onOpenDm: (userId: string) => void }) {
  const t = useT();
  const locale = useLocale();
  const room = useTachi(s => s.rooms.find(r => r.id === roomId));
  const users = useTachi(s => s.users);
  const meId = useTachi(s => s.meId);
  const name = roomDisplayName(room, meId, users, t);
  const isTachi = roomId === SENIOR_ROOM_ID || room?.type === 'tachi';

  if (isTachi) {
    const me = meId ? users[meId] : undefined;
    return (
      <div className="sa-chat">
        <h1 className="sr-only">{t('senior.chatTachi')}</h1>
        <MessageList roomId={roomId} variant="senior"
          emptyHint={<><p className="sa-empty-t">{t('senior.hello', { name: greetName(me?.name, locale) })}</p><p className="muted">{t('senior.helloSub')}</p></>} />
        <Composer roomId={roomId} variant="senior" placeholder={t('senior.placeholder')} />
      </div>
    );
  }

  const peer = dmPeerId(room, meId);
  const people = !!room && room.type !== 'dm';
  return (
    <div className="sa-chat" key={roomId}>
      <h1 className="sr-only">{t('senior.chatWith', { name })}</h1>
      <MessageList roomId={roomId} variant="senior" onOpenDm={people ? onOpenDm : undefined}
        emptyHint={<p className="sa-empty-t">{peer ? t('senior.dmEmpty', { name }) : t('senior.roomEmpty')}</p>} />
      <Composer roomId={roomId} variant="senior" compact
        placeholder={peer ? t('senior.writeTo', { name }) : room?.type === 'side' ? t('senior.writeReply') : t('senior.writeFamily')} />
    </div>
  );
}
