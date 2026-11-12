import type { InlineQuestionDataPayload, Platform, QuestionData, QuestionFingerprint } from './types';
export type { InlineQuestionDataPayload, Platform, QuestionData, QuestionFingerprint } from './types';
export { CANONICAL_ORGAN_SYSTEMS, resolveOrganSystem } from '../shared/organSystems';

export const getPlatformFromLocation = (): Platform | null => null;

export const getQuestionFingerprint = (): QuestionFingerprint | null => null;

export const getQuestionContent = async (): Promise<QuestionData | null> => null;

export const buildQuestionDataPayload = (
    _questionData?: QuestionData | null,
): InlineQuestionDataPayload | undefined => undefined;
