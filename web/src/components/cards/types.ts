import type { Message } from '../../../../shared/types';

export interface CardProps {
  message: Message;
  variant: 'senior' | 'family';
  onOpenArtifact?: (artifactId: string) => void;
  /** Rendered by the card at its primary-action position (memory_card, itinerary). */
  actionSlot?: React.ReactNode;
  onOpenRoom?: (roomId: string) => void;
}
