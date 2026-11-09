// Locale-aware prompt builders: dispatch to the Korean or English set by the active locale.
import { getLocale } from './locale';
import * as KO from './prompts.ko';
import * as EN from './prompts.en';

const pick = () => (getLocale() === 'en' ? EN : KO);

export const TACHI_PERSONA = KO.TACHI_PERSONA;
export const FAMILY_PERSONA = KO.FAMILY_PERSONA;
export const JSON_ONLY = KO.JSON_ONLY;

export const interviewStartPrompt: typeof KO.interviewStartPrompt = (...a) => pick().interviewStartPrompt(...a);
export const interviewTurnPrompt: typeof KO.interviewTurnPrompt = (...a) => pick().interviewTurnPrompt(...a);
export const extractMemoryPrompt: typeof KO.extractMemoryPrompt = (...a) => pick().extractMemoryPrompt(...a);
export const seniorIntentPrompt: typeof KO.seniorIntentPrompt = (...a) => pick().seniorIntentPrompt(...a);
export const recallPrompt: typeof KO.recallPrompt = (...a) => pick().recallPrompt(...a);
export const seniorChatPrompt: typeof KO.seniorChatPrompt = (...a) => pick().seniorChatPrompt(...a);
export const shareSummaryPrompt: typeof KO.shareSummaryPrompt = (...a) => pick().shareSummaryPrompt(...a);
export const suggestTripPrompt: typeof KO.suggestTripPrompt = (...a) => pick().suggestTripPrompt(...a);
export const itineraryPrompt: typeof KO.itineraryPrompt = (...a) => pick().itineraryPrompt(...a);
export const proactivePrompt: typeof KO.proactivePrompt = (...a) => pick().proactivePrompt(...a);
export const reportHighlightPrompt: typeof KO.reportHighlightPrompt = (...a) => pick().reportHighlightPrompt(...a);
export const familyAnswerPrompt: typeof KO.familyAnswerPrompt = (...a) => pick().familyAnswerPrompt(...a);
export const gatheringPrompt: typeof KO.gatheringPrompt = (...a) => pick().gatheringPrompt(...a);
export const assistPrompt: typeof KO.assistPrompt = (...a) => pick().assistPrompt(...a);
export const availabilityPrompt: typeof KO.availabilityPrompt = (...a) => pick().availabilityPrompt(...a);
export const botPrompt: typeof KO.botPrompt = (...a) => pick().botPrompt(...a);
export const memoryBlock: typeof KO.memoryBlock = (...a) => pick().memoryBlock(...a);
export const taskClassifyPrompt: typeof KO.taskClassifyPrompt = (...a) => pick().taskClassifyPrompt(...a);
