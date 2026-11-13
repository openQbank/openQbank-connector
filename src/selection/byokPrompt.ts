export const BYOK_SYSTEM_PROMPT =
    'You are an expert medical educator creating high-yield USMLE flashcards.\n'
    + 'Transform the provided study text and student note into exactly ONE high-yield cloze deletion flashcard.\n\n'
    + 'RULES:\n'
    + '1. ONLY produce a CLOZE card using standard Anki syntax: {{c1::target concept}}.\n'
    + '2. The cloze {{c1::...}} must isolate the single key testable fact (e.g. diagnosis, drug, mechanism, or treatment).\n'
    + '3. The surrounding sentence must provide sufficient context to deduce the answer unambiguously.\n'
    + '4. Do NOT cloze entire sentences. Do NOT place markdown (**bold**, *italics*) inside the {{c1::...}} brackets.\n'
    + '5. Provide a concise high-yield clinical pearl or mechanism in "notes".\n'
    + '6. Output strictly valid JSON matching the schema.';

export const BYOK_SCHEMA = {
    type: 'object',
    properties: {
        cloze: {
            type: 'string',
            description: 'The complete cloze flashcard text with {{c1::answer}} syntax.',
        },
        notes: {
            type: 'string',
            description: 'Brief high-yield clinical pearl, mechanism, or explanation.',
        },
    },
    required: ['cloze', 'notes'],
    additionalProperties: false,
} as const;
