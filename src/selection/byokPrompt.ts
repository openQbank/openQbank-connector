export const BYOK_SYSTEM_PROMPT =
    'Turn the highlighted study text and optional note about what the student got wrong into exactly one high-yield flashcard. '
    + 'Use card_type "cloze" with {{c1::...}} in front and an empty back, or card_type "basic" with front and back. '
    + 'Return only JSON matching the schema.';

export const BYOK_SCHEMA = {
    type: 'object',
    properties: {
        card_type: { type: 'string', enum: ['basic', 'cloze'] },
        front: { type: 'string' },
        back: { type: 'string' },
    },
    required: ['card_type', 'front', 'back'],
    additionalProperties: false,
} as const;
