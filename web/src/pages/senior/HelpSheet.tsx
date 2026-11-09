import { useRef } from 'react';
import { Camera, Lock, Mic, Search, Volume2, X } from 'lucide-react';
import { useModal } from '../../components/common/useModal';

const ROWS = [
  { Icon: Camera, text: '사진 보여주기를 누르고 옛날 사진을 고르세요. 타치가 하나씩 여쭤볼게요.' },
  { Icon: Mic, text: '마이크를 누르고 말씀하셔도 돼요.' },
  { Icon: Search, text: '‘불국사’처럼 장소나 사람 이름을 말하면 그 추억을 다시 꺼내 드려요.' },
  { Icon: Lock, text: '새 추억은 처음엔 ‘나만 보기’예요. ‘가족 공개’로 바꿔야 가족이 볼 수 있어요.' },
  { Icon: Volume2, text: '스피커 버튼을 누르면 소리 내어 읽어 드려요.' },
];

export function HelpSheet({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useModal(ref, onClose);
  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden />
      <div className="sa-sheet" role="dialog" aria-modal="true" aria-labelledby="sa-help-title" ref={ref}>
        <div className="sa-sheet-bar">
          <button type="button" className="sa-icon-btn" aria-label="닫기" onClick={onClose}><X size={24} /></button>
        </div>
        <div className="sa-sheet-body">
          <h2 className="sa-sheet-t" id="sa-help-title">타치 사용법</h2>
          <ul className="sa-help">
            {ROWS.map(({ Icon, text }) => <li key={text}><Icon size={20} aria-hidden />{text}</li>)}
          </ul>
          <button type="button" className="btn btn-primary sa-wide" data-autofocus onClick={onClose}>알겠어요</button>
        </div>
      </div>
    </>
  );
}
