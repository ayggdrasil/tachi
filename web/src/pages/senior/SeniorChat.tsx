import { SENIOR_ROOM_ID } from '../../../../shared/constants';
import { MessageList } from '../../components/chat/MessageList';
import { Composer } from '../../components/chat/Composer';

export function SeniorChat() {
  return (
    <div className="sa-chat">
      <h1 className="sr-only">타치와 대화</h1>
      <MessageList roomId={SENIOR_ROOM_ID} variant="senior"
        emptyHint={<><p className="sa-empty-t">안녕하세요, 순자님</p><p className="muted">옛날 사진을 보여 주시면 함께 이야기 나눠요.</p></>} />
      <Composer roomId={SENIOR_ROOM_ID} variant="senior" placeholder="말씀해 보세요" />
    </div>
  );
}
