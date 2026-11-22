export function normalizeWhitespace(text: string): string {
    return text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}
