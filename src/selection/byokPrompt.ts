import type { CustomCardPrefill } from '../content/customCardFab';

export type SelectionKind = 'default' | 'vignette';

export const BYOK_PROMPTS: Record<SelectionKind, string> = {
    default: 'Create one or two concise medical cloze flashcards grounded in the selection. Each front must contain valid Anki cloze syntax such as {{c1::answer}}. Return JSON with a cards array of objects containing front and notes.',
    vignette: 'Create one short clinical case grounded in the selection. Return JSON with a cards array containing one object with front, notes, and two to four ordered steps, each with label and value.',
};

export type SelectionDraft = {
    card_type: 'cloze' | 'sequential';
    front: string;
    back?: string;
    notes?: string;
    organ_system?: string;
    subject?: string;
    topic?: string;
    steps?: { label: string; value: string }[];
};

export function toPrefill(card: SelectionDraft, taxonomy: Pick<SelectionDraft, 'organ_system' | 'subject' | 'topic'> = {}): CustomCardPrefill {
    return {
        cardType: card.card_type,
        front: card.front,
        back: card.back || '',
        notes: card.notes,
        steps: card.steps,
        organSystem: taxonomy.organ_system,
        subject: taxonomy.subject,
        topic: taxonomy.topic,
    };
}
