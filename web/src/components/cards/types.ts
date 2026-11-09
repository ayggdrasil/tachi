import type { Message } from '../../../../shared/types';

export interface CardProps {
  message: Message;
  variant: 'senior' | 'family';
  onOpenArtifact?: (artifactId: string) => void;
  onOpenRoom?: (roomId: string) => void;
}
