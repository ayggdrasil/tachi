import { PhotoCard, MemoryCard, ShareCard, RecallCard } from './MemoryCards';
import { TripSuggestionCard, ItineraryCard } from './TripCards';
import { ArtifactCard, ScheduleProgressCard, ScheduleRequestCard, ScheduleResultCard } from './GatheringCards';
import { HealthCard, ReportCard, SystemLine } from './MiscCards';
import type { CardProps } from './types';

/** Renders the structured card for a non-text message; returns null for plain text. */
export function CardRenderer(props: CardProps) {
  const { message } = props;
  const kindOk = (t: string) => message.payload?.type === t;
  switch (message.kind) {
    case 'photo': return kindOk('photo') ? <PhotoCard {...props} /> : null;
    case 'memory_card': return kindOk('memory_card') ? <MemoryCard {...props} /> : null;
    case 'share_card': return kindOk('share_card') ? <ShareCard {...props} /> : null;
    case 'recall_card': return kindOk('recall_card') ? <RecallCard {...props} /> : null;
    case 'trip_suggestion': return kindOk('trip_suggestion') ? <TripSuggestionCard {...props} /> : null;
    case 'itinerary': return kindOk('itinerary') ? <ItineraryCard {...props} /> : null;
    case 'health_card': return kindOk('health_card') ? <HealthCard {...props} /> : null;
    case 'report': return kindOk('report') ? <ReportCard {...props} /> : null;
    case 'artifact': return kindOk('artifact') ? <ArtifactCard {...props} /> : null;
    case 'schedule_request': return kindOk('schedule_request') ? <ScheduleRequestCard {...props} /> : null;
    case 'schedule_progress': return kindOk('schedule_progress') ? <ScheduleProgressCard {...props} /> : null;
    case 'schedule_result': return kindOk('schedule_result') ? <ScheduleResultCard {...props} /> : null;
    case 'system': return <SystemLine {...props} />;
    default: return null;
  }
}
