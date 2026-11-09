import { SENIOR_ROOM_ID } from '../../../../shared/constants';
import { MessageList } from '../../components/chat/MessageList';
import { Composer } from '../../components/chat/Composer';

export function SeniorChat() {
  return (
    <div className="sa-chat">
      <MessageList roomId={SENIOR_ROOM_ID} variant="senior"
        emptyHint={<><p className="sa-empty-t">안녕하세요, 순자님</p><p className="muted">옛날 사진을 보여 주시면 함께 이야기 나눠요.</p></>} />
      <Composer roomId={SENIOR_ROOM_ID} variant="senior" placeholder="타치에게 말해 보세요" />
    </div>
  );
}
