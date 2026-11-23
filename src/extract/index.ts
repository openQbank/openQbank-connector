import { normalizeWhitespace } from '../shared/text';
import type { InlineQuestionDataPayload, Platform, QuestionData, QuestionFingerprint } from "./types";
export type { InlineQuestionDataPayload, Platform, QuestionData, QuestionFingerprint } from "./types";
import { CANONICAL_ORGAN_SYSTEMS, type CanonicalOrganSystem } from "../shared/organSystems";
export { CANONICAL_ORGAN_SYSTEMS, resolveOrganSystem };

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DEFAULT_ORGAN_SYSTEM: CanonicalOrganSystem = "Multisystem Disorders";

const ORGAN_SYSTEM_ALIAS_MAP: Record<string, CanonicalOrganSystem> = {
    behavioral: "Psychiatry", biostat: "Biostatistics", biostats: "Biostatistics", blood: "Hematology",
    cardio: "Cardiology", cardiovascular: "Cardiology", cns: "Neurology", derm: "Dermatology",
    endo: "Endocrinology", ethics: "Ethics", "f repro": "Gynecology", gi: "Gastroenterology",
    gastro: "Gastroenterology", genprin: "General Principles", heme: "Hematology", immune: "Immunology",
    infectious: "Infectious Disease", msk: "Orthopedics", multisystem: "Multisystem Disorders",
    multi: "Multisystem Disorders", nephro: "Nephrology", neuro: "Neurology", ob: "Obstetrics",
    obgyn: "Obstetrics", onc: "Oncology", ortho: "Orthopedics", psych: "Psychiatry", pulm: "Pulmonology",
    renal: "Nephrology", renalurin: "Nephrology", regulatory: "Regulatory Issues",
    socialsci: "Social Sciences", urology: "Urology",
};

const hashString = (value: string): string => {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
        hash = (hash << 5) - hash + value.charCodeAt(i);
        hash |= 0;
    }
    return String(Math.abs(hash));
};

export const getPlatformFromLocation = (): Platform => {
    const host = window.location.hostname.toLowerCase();
    if (host === 'uworld.com' || host.endsWith('.uworld.com')) return 'UWorld';
    if (host === 'starttest.com' || host.endsWith('.starttest.com')) return 'NBME';
    if (host === 'localhost' || host === 'openqbank.com' || host.endsWith('.openqbank.com')) return 'OpenQBank';
    if (host === 'amboss.com' || host.endsWith('.amboss.com')) return 'AMBOSS';
    if (host === 'truelearn.com' || host.endsWith('.truelearn.com')) return 'TrueLearn';
    if (host === 'blueprintprep.com' || host.endsWith('.blueprintprep.com')) return 'BluePrint';
    if (host === 'roshreview.com' || host.endsWith('.roshreview.com')) return 'RoshReview';
    if (host === 'usmlefighter.com' || host.endsWith('.usmlefighter.com')) return 'USMLEFighter';
    if (host === 'brivona.github.io' || host.endsWith('.brivona.github.io')) return 'Brivona';
    return 'Unknown';
};

// Function to convert HTML to simplified Markdown
const htmlToMarkdown = (html: string): string => {
    let markdown = html || '';

    markdown = markdown.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, '');
    markdown = markdown.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, '');
    markdown = markdown.replace(/<\/?nobr>/gi, '');
    markdown = markdown.replace(/<span\s+class="itdhilite">([\s\S]*?)<\/span>/gi, '$1');

    markdown = markdown.replace(/<br\s*\/?>/gim, '\n');
    markdown = markdown.replace(/<\/div>/gim, '\n');
    markdown = markdown.replace(/<\/p>/gim, '\n\n');

    markdown = markdown.replace(/<b>([\s\S]*?)<\/b>/gim, '**$1**');
    markdown = markdown.replace(/<strong>([\s\S]*?)<\/strong>/gim, '**$1**');
    markdown = markdown.replace(/<i>([\s\S]*?)<\/i>/gim, '*$1*');
    markdown = markdown.replace(/<em>([\s\S]*?)<\/em>/gim, '*$1*');

    markdown = markdown.replace(/<ul>/gim, '');
    markdown = markdown.replace(/<\/ul>/gim, '');
    markdown = markdown.replace(/<li>/gim, '- ');
    markdown = markdown.replace(/<\/li>/gim, '\n');

    markdown = markdown.replace(/<[^>]+>/g, '');

    const txt = document.createElement('textarea');
    txt.innerHTML = markdown;
    markdown = txt.value;
    return markdown.replace(/\n\s*\n/g, '\n\n').trim();
};

// Keep Blueprint structured-markup formatting (bold/underline/italic/lists) but strip
// Blueprint-specific bookkeeping (data-range attrs, empty class attrs, buttons, svgs).
const cleanBlueprintHtml = (root: Element | null): string => {
    if (!root) return '';
    const clone = root.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('script, style, button, svg, img[aria-label="content image"]').forEach((n) => n.remove());
    clone.querySelectorAll('*').forEach((el) => {
        el.removeAttribute('data-range');
        el.removeAttribute('data-testid');
        el.removeAttribute('id');
        el.removeAttribute('style');
        if (el.getAttribute('class') !== null) el.removeAttribute('class');
    });
    // Unwrap the outer <section> so we store just the inner formatted markup.
    const section = clone.querySelector('section') || clone;
    return (section.innerHTML || '').replace(/\s+/g, ' ').replace(/>\s+</g, '><').trim();
};

const extractTablesFromElement = (root: Element | null): string[] => {
    if (!root) return [];

    const tables = Array.from(root.querySelectorAll('table'));
    const serialized: string[] = [];

    tables.forEach((table) => {
        const rowLines: string[] = [];
        const rows = Array.from(table.querySelectorAll('tr'));

        rows.forEach((row) => {
            const cells = Array.from(row.querySelectorAll('th, td'));
            if (cells.length === 0) return;

            const values = cells
                .map((cell) => normalizeWhitespace(htmlToMarkdown(cell.innerHTML || '')))
                .filter((value) => value.length > 0);

            if (values.length > 0) {
                rowLines.push(values.join(' | '));
            }
        });

        const tableText = rowLines.join('\n').trim();
        if (tableText) {
            serialized.push(tableText);
        }
    });

    return serialized;
};

const extractParagraphs = (root: Element | null): string[] => {
    const clone = cloneForExtraction(root);
    if (!clone) return [];

    return Array.from(clone.querySelectorAll('p'))
        .map((p) => normalizeWhitespace(htmlToMarkdown(p.innerHTML || '')))
        .filter((line) => line.length > 0);
};

const matchEducationalObjective = (text: string): { objective: string; index: number } | null => {
    // Delimited by:
    // - double newline
    // - newline followed by next section heading or Choice
    // - or end of string
    const regex = /(?:(?:\*{1,2})?educational objective(?:\*{1,2})?\s*:\s*(?:\*{1,2})?)\s*([\s\S]+?)(?=(?:\r?\n\s*\r?\n|\r?\n\s*(?:Correct Answer|Incorrect Answers|Explanation|Choice\s+[A-Z]|References|Item|Block|Pause|Score Report|End Block)\b|$))/i;
    const match = text.match(regex);
    if (match && match.index !== undefined) {
        let cleaned = match[1].replace(/^\*+\s*/, '').replace(/\s*\*+$/, '').trim();
        cleaned = cleaned.replace(/\s+(Pause|Score Report|End Block|Previous|Next|Proceed to Next Item|Lab Values|Notes|Calculator|Settings)\b[\s\S]*$/i, '').trim();
        if (cleaned) {
            return { objective: cleaned, index: match.index };
        }
    }
    return null;
};

const extractEducationalObjective = (root: Element | null): string | undefined => {
    if (!root) return undefined;

    // 1. Direct HTML tag extraction: "{educational_obj_text}<{either br, p, div, span, td, li or new line}"
    const rawHtml = root.innerHTML || '';
    if (/educational\s*objective/i.test(rawHtml)) {
        const htmlRegex = /(?:(?:\*{1,2})?educational\s*objective(?:\*{1,2})?\s*:\s*(?:\*{1,2})?)\s*([\s\S]+?)(?=(?:<\/(?:p|div|span|td|li)>|<br\s*\/?>|\r?\n\s*\r?\n|\r?\n\s*(?:Correct Answer|Incorrect Answers)\b|$))/i;
        const htmlMatch = rawHtml.match(htmlRegex);
        if (htmlMatch) {
            const stripped = htmlMatch[1].replace(/<[^>]+>/g, '').replace(/^\*+\s*/, '').replace(/\s*\*+$/, '').trim();
            const normalized = normalizeWhitespace(stripped);
            if (normalized) {
                const cleaned = normalized.replace(/\s+(Pause|Score Report|End Block|Previous|Next|Proceed to Next Item|Lab Values|Notes|Calculator|Settings)\b[\s\S]*$/i, '').trim();
                if (cleaned) return cleaned;
            }
        }
    }

    const clone = cloneForExtraction(root);
    if (!clone) return undefined;

    // 2. Leaf-most candidate element extraction
    const candidates = Array.from(clone.querySelectorAll('p, div, li, td, span'));
    for (const el of candidates) {
        if (el.querySelector('p, div, li, td')) continue;
        const text = normalizeWhitespace(htmlToMarkdown(el.innerHTML || el.textContent || ''));
        if (!text || !/educational\s*objective/i.test(text)) continue;

        const matched = matchEducationalObjective(text);
        if (matched) {
            return matched.objective;
        }
    }

    // 3. Full text extraction across root
    const fullText = normalizeWhitespace(htmlToMarkdown(clone.innerHTML || clone.textContent || ''));
    const matched = matchEducationalObjective(fullText);
    if (matched) {
        return matched.objective;
    }

    return undefined;
};

const getFirstMeaningfulLabelChar = (value: string): string | undefined => {
    const match = normalizeWhitespace(value).match(/\b([A-Z])\b/);
    return match?.[1];
};

const findOptionByLabel = (options: string[], label?: string): string | undefined => {
    if (!label) return undefined;

    const normalizedLabel = label.toUpperCase();
    return options.find((option) => {
        const optionLabel = normalizeWhitespace(option).match(/^([A-Z])\)/)?.[1];
        return optionLabel === normalizedLabel;
    });
};

const INLINE_ACTIONS_ROOT_ID = 'openchromebank-inline-actions';
const INLINE_ACTIONS_STYLE_ID = 'openchromebank-inline-actions-style';

const cloneForExtraction = (root: Element | null): HTMLElement | null => {
    if (!root) return null;

    const clone = root.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('script, style').forEach((node) => node.remove());
    clone.querySelectorAll('.its-item-visually-hidden:not(.SOLUTION):not(.CSOLUTION), .ITS-visually-hidden:not(.SOLUTION):not(.CSOLUTION)').forEach((node) => node.remove());
    clone.querySelectorAll(`#${INLINE_ACTIONS_ROOT_ID}, #${INLINE_ACTIONS_STYLE_ID}`).forEach((node) => node.remove());
    return clone;
};

const markdownFromElement = (root: Element | null): string => {
    const clone = cloneForExtraction(root);
    if (!clone) return '';
    return normalizeWhitespace(htmlToMarkdown(clone.innerHTML || clone.textContent || ''));
};

const looksLikePlaceholderExplanation = (text: string): boolean => {
    const normalized = normalizeWhitespace(text);
    if (!normalized) return true;
    if (/^adding\.{0,3}$/i.test(normalized)) return true;
    if (/^(loading|adding|reveal answer)\.{0,3}$/i.test(normalized)) return true;
    if (normalized.length < 20 && /^(loading|adding)\b/i.test(normalized)) return true;
    return false;
};

interface NbmeSolutionData {
    explanation: string;
    correctAnswer?: string;
    educationalObjective?: string;
    explanations?: string[];
    tables?: string[];
}

const parseNbmeSolutionBlock = (root: Element | null, options: string[]): NbmeSolutionData => {
    const extractedRoot = cloneForExtraction(root);
    if (!extractedRoot) {
        return { explanation: '' };
    }

    let paragraphs = Array.from(extractedRoot.querySelectorAll('p'))
        .map((p) => normalizeWhitespace(htmlToMarkdown(p.innerHTML || p.textContent || '')))
        .filter(Boolean);

    if (paragraphs.length === 0) {
        // Fallback: Check for div blocks or split markdown by paragraphs
        const rawMarkdown = htmlToMarkdown(extractedRoot.innerHTML || extractedRoot.textContent || '');
        const splitParas = rawMarkdown
            .split(/\n\s*\n/)
            .map((s) => normalizeWhitespace(s))
            .filter(Boolean);
        if (splitParas.length > 0) {
            paragraphs = splitParas;
        }
    }

    if (paragraphs.length === 0) {
        const rawText = normalizeWhitespace(htmlToMarkdown(extractedRoot.innerHTML || extractedRoot.textContent || ''));
        const matched = matchEducationalObjective(rawText);
        let explanation = rawText;
        let educationalObjective: string | undefined;
        if (matched) {
            educationalObjective = matched.objective;
            explanation = rawText.slice(0, matched.index).trim();
        }
        return {
            explanation,
            educationalObjective,
            tables: extractTablesFromElement(extractedRoot),
        };
    }

    const explanationSections: string[] = [];
    const correctExplanationParts: string[] = [];
    let educationalObjective: string | undefined;
    let correctAnswer: string | undefined;
    let lastSection: 'correct' | 'incorrect' | 'objective' | 'other' = 'other';

    for (const paragraph of paragraphs) {
        const normalized = paragraph.toLowerCase();

        if (normalized.startsWith('correct answer:')) {
            explanationSections.push(paragraph);
            const answerLabel = getFirstMeaningfulLabelChar(paragraph.replace(/^correct answer:\s*/i, ''));
            correctAnswer = findOptionByLabel(options, answerLabel) || answerLabel;
            lastSection = 'correct';
            continue;
        }

        if (normalized.startsWith('incorrect answers:')) {
            explanationSections.push(paragraph);
            lastSection = 'incorrect';
            continue;
        }

        const matched = matchEducationalObjective(paragraph);
        if (matched) {
            educationalObjective = matched.objective;
            const precedingText = paragraph.slice(0, matched.index).trim();
            if (precedingText) {
                explanationSections.push(precedingText);
                if (lastSection === 'correct') {
                    correctExplanationParts.push(precedingText);
                }
            }
            explanationSections.push(paragraph.slice(matched.index).trim());
            lastSection = 'objective';
            continue;
        }

        explanationSections.push(paragraph);

        if (lastSection === 'correct') {
            correctExplanationParts.push(paragraph);
            continue;
        }
    }

    if (!educationalObjective) {
        const fullText = normalizeWhitespace(htmlToMarkdown(extractedRoot.innerHTML || extractedRoot.textContent || ''));
        const matched = matchEducationalObjective(fullText);
        if (matched) {
            educationalObjective = matched.objective;
        }
    }

    const explanation = correctExplanationParts.join('\n\n')
        || normalizeWhitespace(paragraphs.join('\n\n'));

    return {
        explanation,
        correctAnswer,
        educationalObjective,
        explanations: explanationSections.length > 0 ? explanationSections : undefined,
        tables: extractTablesFromElement(extractedRoot),
    };
};

/**
 * Extract lab values from the LabValues table element.
 */
const extractLabValues = (stemElement: Element): string => {
    const labTable = stemElement.querySelector('#LabValues, table[id="LabValues"]');
    if (!labTable) return '';

    const rows = labTable.querySelectorAll('tr[align="center"]');
    const labLines: string[] = [];

    rows.forEach((row) => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
            const label = (cells[0].textContent || '').trim();
            const value = (cells[1].textContent || '').trim();

            const rawLabel = cells[0].textContent || '';
            const isSubItem = rawLabel.startsWith(' ') || rawLabel.startsWith('\u00a0');

            if (label && value) {
                labLines.push(`${isSubItem ? '  ' : ''}${label}: ${value}`);
            } else if (label && !value) {
                labLines.push(label);
            }
        }
    });

    return labLines.join('\n');
};

/**
 * Remove the LabValues table from the stem HTML so it doesn't appear twice.
 */
const removeLabTableFromHtml = (html: string): string => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
    const labTable = doc.querySelector('#LabValues');
    if (labTable) {
        let wrapper: Element | null = labTable;
        while (wrapper && wrapper.parentElement) {
            if (wrapper.tagName === 'TABLE' && wrapper !== labTable) {
                break;
            }
            wrapper = wrapper.parentElement;
            if (wrapper.tagName === 'TABLE' && wrapper !== labTable) {
                break;
            }
        }
        const toRemove = (wrapper && wrapper.tagName === 'TABLE' && wrapper !== labTable) ? wrapper : labTable;
        toRemove.parentElement?.removeChild(toRemove);
    }
    return doc.body.innerHTML;
};

const blobToDataUrl = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (typeof reader.result === 'string') {
                resolve(reader.result);
                return;
            }
            reject(new Error('Failed to read image blob as base64.'));
        };
        reader.onerror = () => reject(new Error('Failed to read image blob.'));
        reader.readAsDataURL(blob);
    });
};

const getCandidateImageSrc = (img: HTMLImageElement): string => {
    const directSrc = img.getAttribute('src') || '';
    const dataSrc = img.getAttribute('data-src') || '';
    const current = img.currentSrc || '';
    return directSrc || dataSrc || current;
};

const isDecorativeQuestionImage = (img: HTMLImageElement): boolean => {
    const className = (img.className || '').toLowerCase();
    const src = (getCandidateImageSrc(img) || '').toLowerCase();
    const alt = (img.getAttribute('alt') || '').toLowerCase();

    if (
        className.includes('strikeout') ||
        className.includes('correcticon') ||
        className.includes('incorrecticon') ||
        className.includes('logo') ||
        className.includes('icon') ||
        className.includes('badge') ||
        src.includes('/assets/new_logo/') ||
        src.includes('/logo') ||
        src.includes('/icons/') ||
        src.includes('onestepfurther') ||
        src.includes('rapidreview') ||
        src.includes('exam-day-edge') ||
        alt.includes('logo') ||
        alt.includes('icon')
    ) {
        return true;
    }
    if (img.closest('.ITSMCOptionTable, .ITSMCOptionTableOn, .ITSMCOptionStrikeout, #answerChoicesTable, #answerContainer, .answer-container, nav, header, footer, .navbar')) {
        return true;
    }
    return false;
};

const convertCandidateImageToDataUrl = async (candidate: HTMLImageElement): Promise<string | undefined> => {
    const rawSrc = getCandidateImageSrc(candidate);
    if (!rawSrc) return undefined;

    if (rawSrc.startsWith('data:image/')) {
        return rawSrc;
    }

    // 1. Try canvas export from loaded DOM image (bypasses fetch CORS if already rendered)
    try {
        if (candidate.complete && candidate.naturalWidth > 0 && candidate.naturalHeight > 0) {
            const canvas = document.createElement('canvas');
            canvas.width = candidate.naturalWidth;
            canvas.height = candidate.naturalHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(candidate, 0, 0);
                const dataUrl = canvas.toDataURL('image/png');
                if (dataUrl && dataUrl.startsWith('data:image/')) {
                    return dataUrl;
                }
            }
        }
    } catch {
        // Tainted canvas due to cross-origin image, fall through
    }

    // 2. Try fetch without credentials (credentials: 'omit' allows Access-Control-Allow-Origin: * on CDNs like imgix/S3)
    const absoluteSrc = new URL(rawSrc, window.location.href).toString();
    try {
        const imageResponse = await fetch(absoluteSrc, { credentials: 'omit', mode: 'cors' });
        if (imageResponse.ok) {
            const imageBlob = await imageResponse.blob();
            if (imageBlob.size > 0) {
                return await blobToDataUrl(imageBlob);
            }
        }
    } catch {
        // If credentials omit failed, try same-origin fetch
        try {
            const imageResponse = await fetch(absoluteSrc, { credentials: 'same-origin' });
            if (imageResponse.ok) {
                const imageBlob = await imageResponse.blob();
                if (imageBlob.size > 0) {
                    return await blobToDataUrl(imageBlob);
                }
            }
        } catch {
            // Fall through to returning absoluteSrc
        }
    }

    return absoluteSrc;
};

const extractStemImageBase64 = async (stemElement: Element, extraRoots: Array<Element | null> = []): Promise<string | undefined> => {
    const searchRoots = [
        stemElement,
        stemElement.closest('.s-ques'),
        stemElement.closest('section'),
        ...extraRoots,
        document
    ].filter(Boolean) as Element[];

    const seen = new Set<string>();
    const imageCandidates: HTMLImageElement[] = [];
    for (const root of searchRoots) {
        const images = Array.from(root.querySelectorAll('img')) as HTMLImageElement[];
        for (const img of images) {
            const key = `${img.getAttribute('src') || ''}|${img.getAttribute('data-src') || ''}|${img.className || ''}`;
            if (seen.has(key)) continue;
            seen.add(key);
            if (isDecorativeQuestionImage(img)) continue;
            imageCandidates.push(img);
        }
    }

    if (imageCandidates.length === 0) return undefined;

    const sortedCandidates = imageCandidates.sort((a, b) => {
        const aArea = (a.naturalWidth || parseInt(a.getAttribute('width') || '0', 10) || 0) *
            (a.naturalHeight || parseInt(a.getAttribute('height') || '0', 10) || 0);
        const bArea = (b.naturalWidth || parseInt(b.getAttribute('width') || '0', 10) || 0) *
            (b.naturalHeight || parseInt(b.getAttribute('height') || '0', 10) || 0);
        return bArea - aArea;
    });

    let fallbackUrl: string | undefined;

    for (const candidate of sortedCandidates) {
        const result = await convertCandidateImageToDataUrl(candidate);
        if (result) {
            if (result.startsWith('data:image/')) {
                return result;
            }
            if (!fallbackUrl) {
                fallbackUrl = result;
            }
        }
    }

    // Preserve a usable remote URL when CORS/cookie rules block fetch conversion.
    return fallbackUrl;
};

const extractImageBase64FromElement = async (root: Element | null): Promise<string | undefined> => {
    if (!root) return undefined;

    const candidates = (Array.from(root.querySelectorAll('img')) as HTMLImageElement[])
        .filter((img) => !isDecorativeQuestionImage(img));
    if (candidates.length === 0) return undefined;

    const sortedCandidates = candidates.sort((a, b) => {
        const aArea = (a.naturalWidth || parseInt(a.getAttribute('width') || '0', 10) || 0) *
            (a.naturalHeight || parseInt(a.getAttribute('height') || '0', 10) || 0);
        const bArea = (b.naturalWidth || parseInt(b.getAttribute('width') || '0', 10) || 0) *
            (b.naturalHeight || parseInt(b.getAttribute('height') || '0', 10) || 0);
        return bArea - aArea;
    });

    let fallbackUrl: string | undefined;

    for (const candidate of sortedCandidates) {
        const result = await convertCandidateImageToDataUrl(candidate);
        if (result) {
            if (result.startsWith('data:image/')) {
                return result;
            }
            if (!fallbackUrl) {
                fallbackUrl = result;
            }
        }
    }

    // Preserve a usable remote URL when CORS/cookie rules block fetch conversion.
    return fallbackUrl;
};

const extractUWorldQuestionIdFromDom = (): string | null => {
    // 1. Explicit query selectors for UWorld DOM patterns
    const selectors = [
        '.question-id',
        '.question-details',
        '.nbmeq-id',
        '#nbmeq-index',
        '[class*="question-id"]',
        '[class*="question-details"]',
        '[class*="nbmeq-id"]',
        '[id*="nbmeq-id"]',
    ];

    for (const selector of selectors) {
        const els = Array.from(document.querySelectorAll(selector));
        for (const el of els) {
            // Check textContent of element
            const text = el.textContent || '';
            let match = text.match(/Question\s*Id:?\s*(\d+)/i);
            if (match?.[1]) {
                return `uworld-${match[1]}`;
            }

            // Check parentElement textContent (e.g. <span class="question-id">Question Id:</span> 12657 inside parent <div class="question-details">)
            if (el.parentElement?.textContent) {
                match = el.parentElement.textContent.match(/Question\s*Id:?\s*(\d+)/i);
                if (match?.[1]) {
                    return `uworld-${match[1]}`;
                }
            }

            // Check nextSibling / nextElementSibling
            const nextText = (el.nextSibling?.textContent || '') + ' ' + ((el as HTMLElement).nextElementSibling?.textContent || '');
            match = nextText.match(/(\d{3,7})/);
            if (match?.[1]) {
                return `uworld-${match[1]}`;
            }
        }
    }

    // 2. Scan all elements containing "Question Id"
    const allEls = Array.from(document.querySelectorAll('span, div, p, td, a, small, b, strong'));
    for (const el of allEls) {
        const text = el.textContent || '';
        if (/Question\s*Id/i.test(text)) {
            let match = text.match(/Question\s*Id:?\s*(\d+)/i);
            if (match?.[1]) {
                return `uworld-${match[1]}`;
            }

            if (el.parentElement?.textContent) {
                match = el.parentElement.textContent.match(/Question\s*Id:?\s*(\d+)/i);
                if (match?.[1]) {
                    return `uworld-${match[1]}`;
                }
            }
        }
    }

    // 3. Document body text / HTML regex fallback
    const bodyText = document.body?.innerText || document.body?.textContent || '';
    const bodyMatch = bodyText.match(/Question\s*Id:?\s*(\d+)/i);
    if (bodyMatch?.[1]) {
        return `uworld-${bodyMatch[1]}`;
    }

    const htmlText = document.body?.innerHTML || '';
    const htmlMatch = htmlText.match(/question-id["'>\s]*>*\s*Question\s*Id:?\s*<\/span>\s*(\d+)/i) || htmlText.match(/Question\s*Id:?\s*<\/span>\s*(\d+)/i);
    if (htmlMatch?.[1]) {
        return `uworld-${htmlMatch[1]}`;
    }

    return null;
};

const extractUWorldQuestionId = (stem: string, options: string[]): string => {
    const domQid = extractUWorldQuestionIdFromDom();
    if (domQid) return domQid;

    const hash = window.location.hash || '';
    const path = window.location.pathname || '';

    const hashMatch = hash.match(/\/launchtest\/\d+\/[^/]+\/(\d+)\//i);
    if (hashMatch?.[1]) {
        return `uworld-${hashMatch[1]}`;
    }

    const queryMatch = (window.location.search || '').match(/[?&](?:questionId|qid)=([\w-]+)/i);
    if (queryMatch?.[1]) {
        return `uworld-${queryMatch[1]}`;
    }

    const pathMatch = path.match(/\/(\d{5,})\/?$/);
    if (pathMatch?.[1]) {
        return `uworld-${pathMatch[1]}`;
    }

    return `uworld-${hashString(`${stem}\n${options.join('\n')}`)}`;
};

const extractUWorldQuestionIdFromLocation = (): string | null => {
    const domQid = extractUWorldQuestionIdFromDom();
    if (domQid) return domQid;

    const hash = window.location.hash || '';
    const path = window.location.pathname || '';

    const hashMatch = hash.match(/\/launchtest\/\d+\/[^/]+\/(\d+)\//i);
    if (hashMatch?.[1]) return `uworld-${hashMatch[1]}`;

    const queryMatch = (window.location.search || '').match(/[?&](?:questionId|qid)=([\w-]+)/i);
    if (queryMatch?.[1]) return `uworld-${queryMatch[1]}`;

    const pathMatch = path.match(/\/(\d{5,})\/?$/);
    if (pathMatch?.[1]) return `uworld-${pathMatch[1]}`;

    return null;
};

const PREDETERMINED_SYSTEM_SET = new Set<string>([
    'biostatistics', 'cardiology', 'cardiovascular', 'dermatology', 'endocrinology',
    'ethics', 'gastroenterology', 'general principles', 'gynecology', 'hematology',
    'immunology', 'infectious disease', 'infectious diseases', 'multisystem disorders',
    'nephrology', 'neurology', 'obstetrics', 'obstetrics & gynecology', 'obstetrics and gynecology',
    'ob/gyn', 'obgyn', 'oncology', 'orthopedics', 'psychiatry', 'pulmonology',
    'regulatory issues', 'social sciences', 'urology', 'pathology', 'pharmacology',
    'behavioral health', 'renal', 'gastrointestinal', 'respiratory', 'musculoskeletal'
]);

const resolveFlippedPlatformSubjectAndSystem = (rawSubject?: string, rawSystem?: string) => {
    const cleanSubj = (rawSubject || '').trim();
    const cleanSys = (rawSystem || '').trim();

    if (!cleanSubj && !cleanSys) {
        return { subject: '', system: '' };
    }
    if (!cleanSubj) return { subject: '', system: cleanSys };
    if (!cleanSys) return { subject: '', system: cleanSubj };

    const normSubj = cleanSubj.toLowerCase();
    const normSys = cleanSys.toLowerCase();

    const subjMatches = PREDETERMINED_SYSTEM_SET.has(normSubj) || CANONICAL_ORGAN_SYSTEMS.some((c: string) => c.toLowerCase() === normSubj) || Boolean(ORGAN_SYSTEM_ALIAS_MAP[normalizeOrganSystemKey(normSubj)]);
    const sysMatches = PREDETERMINED_SYSTEM_SET.has(normSys) || CANONICAL_ORGAN_SYSTEMS.some((c: string) => c.toLowerCase() === normSys) || Boolean(ORGAN_SYSTEM_ALIAS_MAP[normalizeOrganSystemKey(normSys)]);

    // UWorld sometimes labels the organ system as "System" and the clinical category as "Subject".
    // The library hierarchy expects the organ system in subject and the clinical category in system.
    if (sysMatches && !subjMatches) {
        return {
            system: cleanSubj,
            subject: cleanSys,
        };
    }

    return {
        subject: cleanSubj,
        system: cleanSys,
    };
};

const extractUWorldMetadata = (): { subject?: string; system?: string; topic?: string } => {
    const result: { subject?: string; system?: string; topic?: string } = {};
    const blocks = Array.from(document.querySelectorAll(
        '.standards .standardsContent .inner-flex > div, .standards .content .standard, .standards-container .standard-item, [data-testid*="standard"]'
    ));

    blocks.forEach((block) => {
        const valueEl = block.querySelector('.standard-description') || block.querySelector('div:nth-child(1)');
        const labelEl = block.querySelector('.standard-header') || block.querySelector('div:nth-child(2)');
        const label = normalizeWhitespace(labelEl?.textContent || '').toLowerCase();
        const value = normalizeWhitespace(valueEl?.textContent || '');
        if (!value || !label) return;

        if (label.includes('subject')) result.subject = value;
        if (label.includes('system')) result.system = value;
        if (label.includes('topic')) result.topic = value;
    });

    // Fallback: search text patterns if standard blocks didn't capture all 3 tags
    if (!result.subject || !result.system || !result.topic) {
        document.querySelectorAll('.standard, .standards-row, tr, [class*="standard"]').forEach((el) => {
            const text = normalizeWhitespace(el.textContent || '');
            if (!result.subject) {
                const subjMatch = text.match(/Subject\s*[:-]\s*([^;\n\r|]+)/i);
                if (subjMatch?.[1]) result.subject = subjMatch[1].trim();
            }
            if (!result.system) {
                const sysMatch = text.match(/System\s*[:-]\s*([^;\n\r|]+)/i);
                if (sysMatch?.[1]) result.system = sysMatch[1].trim();
            }
            if (!result.topic) {
                const topMatch = text.match(/Topic\s*[:-]\s*([^;\n\r|]+)/i);
                if (topMatch?.[1]) result.topic = topMatch[1].trim();
            }
        });
    }

    const flipped = resolveFlippedPlatformSubjectAndSystem(result.subject, result.system);
    result.subject = flipped.subject;
    result.system = flipped.system;

    return result;
};

const extractUWorldReferences = (): string[] => {
    const referencesContainer = document.querySelector('.references');
    if (!referencesContainer) return [];
    const links = Array.from(referencesContainer.querySelectorAll('a[href]'));
    if (links.length > 0) {
        const hrefs = links
            .map((el) => (el as HTMLAnchorElement).href?.trim() || el.getAttribute('href')?.trim() || '')
            .filter((url) => url.length > 0);
        if (hrefs.length > 0) {
            return Array.from(new Set(hrefs));
        }
    }
    const items = Array.from(referencesContainer.querySelectorAll('.referencesContent li'));
    return items
        .map((item) => normalizeWhitespace(htmlToMarkdown(item.innerHTML || '')))
        .filter((text) => text.length > 0);
};

const extractNbmeQuestionContent = async (platform: Platform): Promise<QuestionData | null> => {
    const stemElement = document.querySelector('.ITSStemText');
    const optionElements = document.querySelectorAll('.ITSMCOptionText, .ITSMCOptionTextOn');
    const questionContainer = stemElement?.closest('.s-ques') || stemElement?.closest('section') || document.body;
    // Find explanation block:
    // 1. Prefer .ITSMCAnswerText that is NOT inside an option table (canonical on starttest.com)
    // 2. Fall back to solution elements ([solution].SOLUTION, etc.) that are NOT inside option elements
    const isInsideOption = (el: Element | null): boolean => {
        return !!el?.closest('.ITSMCOptionTable, .ITSMCOptionTableOn, .ITSMCOptionText, .ITSMCOptionTextOn, .ITSMCOptionStrikeout');
    };

    const directAnswerText = Array.from(document.querySelectorAll('.ITSMCAnswerText'))
        .find((el) => !isInsideOption(el));

    const solutionElement = Array.from(questionContainer?.querySelectorAll('[solution].SOLUTION, [solution].CSOLUTION, .SOLUTION, .CSOLUTION') || [])
        .find((el) => !isInsideOption(el)) || null;

    const explanationElement = directAnswerText || solutionElement || document.querySelector('.ITSMCAnswerText');

    if (!stemElement) {
        return null;
    }

    const preferredAnchor = document.querySelector('a[name^="SCAV"]');
    const fallbackAnchor = Array.from(document.querySelectorAll('a[name]')).find((anchor) => {
        const name = anchor.getAttribute('name');
        return !!name && name.trim().length > 0;
    });
    const questionAnchor = preferredAnchor || fallbackAnchor;
    let questionId = questionAnchor?.getAttribute('name')?.trim() || '';

    const labValues = extractLabValues(stemElement);
    const image = await extractStemImageBase64(stemElement);

    let stemHtml = stemElement.innerHTML;
    stemHtml = removeLabTableFromHtml(stemHtml);
    const stem = htmlToMarkdown(stemHtml);

    if (!questionId) {
        const stemText = normalizeWhitespace(stemElement.textContent || '');
        if (stemText) {
            questionId = `nbme-${hashString(stemText.slice(0, 1000))}`;
        }
    }

    const options: string[] = [];
    const optionTables = document.querySelectorAll('.ITSMCOptionTable, .ITSMCOptionTableOn');
    optionTables.forEach((table) => {
        const labelEl = table.querySelector('.ITSMCOptionLabelText, .ITSMCOptionLabelTextOn');
        const label = labelEl?.textContent?.trim() || '';

        const optionTextEl = table.querySelector('.ITSMCOptionText, .ITSMCOptionTextOn');
        if (optionTextEl) {
            const clone = optionTextEl.cloneNode(true) as HTMLElement;
            const nestedExplanation = clone.querySelector('.ITSMCAnswerText');
            if (nestedExplanation) nestedExplanation.remove();
            const nestedSolution = clone.querySelector('.CSOLUTION');
            if (nestedSolution) nestedSolution.remove();
            clone.querySelectorAll('.its-item-visually-hidden').forEach((node) => node.remove());

            const optionText = htmlToMarkdown(clone.innerHTML);
            if (optionText) {
                const optionPrefix = label ? `${label}) ` : '';
                options.push(`${optionPrefix}${optionText}`);
            }
        }
    });

    if (options.length === 0) {
        optionElements.forEach((el) => {
            const clone = el.cloneNode(true) as HTMLElement;
            const nestedExplanation = clone.querySelector('.ITSMCAnswerText');
            if (nestedExplanation) nestedExplanation.remove();
            const nestedSolution = clone.querySelector('.SOLUTION');
            if (nestedSolution) nestedSolution.remove();
            clone.querySelectorAll('.its-item-visually-hidden').forEach((node) => node.remove());

            const parentTable = el.closest('.ITSMCOptionTable, .ITSMCOptionTableOn');
            const labelEl = parentTable?.querySelector('.ITSMCOptionLabelText, .ITSMCOptionLabelTextOn');
            const label = labelEl?.textContent?.trim() || '';
            const optionText = htmlToMarkdown(clone.innerHTML);
            const optionPrefix = label ? `${label}) ` : '';
            if (optionText) {
                options.push(`${optionPrefix}${optionText}`);
            }
        });
    }

    const nbmeSolution = parseNbmeSolutionBlock(explanationElement, options);
    const highlightedCorrectOption = findOptionByLabel(
        options,
        questionContainer?.querySelector('.correctOption .ITSMCOptionLabelText, .correctOption .ITSMCOptionLabelTextOn')?.textContent || ''
    );
    const educationalObjective = nbmeSolution.educationalObjective
        || (explanationElement ? extractEducationalObjective(explanationElement) : undefined)
        || extractEducationalObjective(questionContainer)
        || extractEducationalObjective(document.body);

    return {
        questionId,
        platform,
        stem,
        labValues,
        options,
        correctAnswer: nbmeSolution.correctAnswer || highlightedCorrectOption,
        explanation: nbmeSolution.explanation,
        image,
        tables: nbmeSolution.tables,
        educationalObjective,
        explanations: nbmeSolution.explanations,
    };
};

const extractUWorldQuestionContent = async (): Promise<QuestionData | null> => {
    const questionTextElement = document.querySelector('#questionText');
    const explanationElement = document.querySelector('#first-explanation')
        || document.querySelector('#firstExplanation')
        || document.querySelector('#explanation-container #explanation')
        || document.querySelector('#questionExplanation #explanation')
        || document.querySelector('#explanation');
    const explanationArea = document.querySelector('#explanation-container')
        || document.querySelector('#questionExplanation')
        || document.querySelector('#first-explanation')
        || document.querySelector('#firstExplanation')
        || explanationElement;
    const answerTable = document.querySelector('#answerChoicesTable')
        || document.querySelector('#answerContainer table')
        || document.querySelector('table.answer-container');

    if (!questionTextElement || !answerTable) {
        return null;
    }

    const stem = htmlToMarkdown(questionTextElement.innerHTML || '');

    const optionRows = Array.from(answerTable.querySelectorAll('tr.answerChoiceBackground, tr.answer-choice-background, tr'));
    const options: string[] = [];

    optionRows.forEach((row) => {
        const contentCell = row.querySelector('.answerChoiceContent, .answer-choice-content');
        if (!contentCell) return;

        const contentClone = contentCell.cloneNode(true) as HTMLElement;

        contentClone.querySelectorAll('i').forEach((el) => el.remove());
        contentClone.querySelectorAll('span').forEach((span) => {
            const text = normalizeWhitespace(span.textContent || '');
            if (/^\(\d+%\)$/.test(text)) {
                span.remove();
            }
        });
        contentClone.querySelectorAll('strike').forEach((strike) => {
            strike.replaceWith(...Array.from(strike.childNodes));
        });

        const optionText = normalizeWhitespace(htmlToMarkdown(contentClone.innerHTML || ''));
        if (!optionText) return;

        const rowText = normalizeWhitespace(row.textContent || '');
        const detectedLabel = rowText.match(/\b([A-Z])\./)?.[1];
        const label = detectedLabel || LETTERS[options.length] || String(options.length + 1);
        options.push(`${label}) ${optionText}`);
    });

    const explanation = markdownFromElement(explanationElement);
    const references = extractUWorldReferences();
    const metadata = extractUWorldMetadata();
    const educationalObjective = extractEducationalObjective(explanationElement);
    const explanations = extractParagraphs(explanationElement);
    const tables = extractTablesFromElement(explanationElement);
    const image = await extractStemImageBase64(questionTextElement, [document.querySelector('#questionContent')]);
    const correctExplanationImage = await extractImageBase64FromElement(explanationArea);

    const questionId = extractUWorldQuestionId(stem, options);
    const correctAnswerLetter = normalizeWhitespace(
        document.querySelector('.stats-bar .stats-label + .stats-value')?.textContent || ''
    ).match(/\b([A-Z])\b/)?.[1];
    const correctAnswer = correctAnswerLetter ? (findOptionByLabel(options, correctAnswerLetter) || correctAnswerLetter) : undefined;

    return {
        questionId,
        platform: 'UWorld',
        stem,
        labValues: '',
        options,
        correctAnswer,
        explanation,
        image,
        correctExplanationImage,
        tables: tables.length > 0 ? tables : undefined,
        references: references.length > 0 ? references : undefined,
        subject: metadata.subject,
        system: metadata.system,
        topic: metadata.topic,
        educationalObjective,
        explanations: explanations.length > 0 ? explanations : undefined,
    };
};

const extractAmbossQuestionId = (stem: string, options: string[]): string => {
    const path = window.location.pathname || '';
    const pathMatch = path.match(/\/questions\/([^/]+)\/([^/?#]+)/i);
    if (pathMatch?.[1] && pathMatch?.[2]) {
        return `amboss-${pathMatch[1]}-${pathMatch[2]}`;
    }

    const queryMatch = (window.location.search || '').match(/[?&](?:questionId|qid)=([\w-]+)/i);
    if (queryMatch?.[1]) {
        return `amboss-${queryMatch[1]}`;
    }

    return `amboss-${hashString(`${stem}\n${options.join('\n')}`)}`;
};

const extractAmbossQuestionIdFromLocation = (): string | null => {
    const path = window.location.pathname || '';
    const pathMatch = path.match(/\/questions\/([^/]+)\/([^/?#]+)/i);
    if (pathMatch?.[1] && pathMatch?.[2]) return `amboss-${pathMatch[1]}-${pathMatch[2]}`;

    const queryMatch = (window.location.search || '').match(/[?&](?:questionId|qid)=([\w-]+)/i);
    if (queryMatch?.[1]) return `amboss-${queryMatch[1]}`;

    return null;
};

const resolveAmbossArticleUrl = (href?: string): string | undefined => {
    if (!href) return undefined;

    try {
        const url = new URL(href, window.location.origin);
        if (/\/article\/[^/]+/i.test(url.pathname)) {
            return url.toString();
        }

        const splitPath = url.pathname.split('/').filter(Boolean);
        const localePrefix = splitPath[0] || 'us';
        const viewState = url.searchParams.get('sv');
        if (viewState) {
            const parsed = JSON.parse(viewState) as Array<{ type?: string; id?: string }>;
            const articleEntry = parsed.find((entry) => entry?.type === 'article' && typeof entry.id === 'string' && entry.id.trim());
            if (articleEntry?.id) {
                return `${url.origin}/${localePrefix}/article/${articleEntry.id}`;
            }
        }

        return url.toString();
    } catch {
        return href;
    }
};

const extractTrueLearnQuestionIdFromLocation = (): string | null => {
    const path = window.location.pathname || '';
    const query = window.location.search || '';

    const testReviewMatch = path.match(/\/question-viewer\/test\/(\d+)\/review/i);
    if (testReviewMatch?.[1]) {
        const params = new URLSearchParams(query);
        const currentQuestion = params.get('currentQuestion')?.trim();
        if (currentQuestion) {
            return `truelearn-test-${testReviewMatch[1]}-q${currentQuestion}`;
        }
        return `truelearn-test-${testReviewMatch[1]}`;
    }

    const params = new URLSearchParams(query);
    const questionId = params.get('questionId')?.trim() || params.get('qid')?.trim();
    if (questionId) return `truelearn-${questionId}`;

    return null;
};

const extractNbmeQuestionIdFromDom = (): string => {
    const preferredAnchor = document.querySelector('a[name^="SCAV"]');
    const fallbackAnchor = Array.from(document.querySelectorAll('a[name]')).find((anchor) => {
        const name = anchor.getAttribute('name');
        return !!name && name.trim().length > 0;
    });
    const questionAnchor = preferredAnchor || fallbackAnchor;
    return questionAnchor?.getAttribute('name')?.trim() || '';
};

export const getQuestionFingerprint = (): QuestionFingerprint | null => {
    const platform = getPlatformFromLocation();

    if (platform === 'UWorld') {
        const questionIdFromLocation = extractUWorldQuestionIdFromLocation();
        if (questionIdFromLocation) return { platform, questionId: questionIdFromLocation };

        const stemElement = document.querySelector('#questionText');
        const stemText = normalizeWhitespace(stemElement?.textContent || '');
        if (stemText) {
            return { platform, questionId: `uworld-${hashString(stemText.slice(0, 1000))}` };
        }
        return null;
    }

    if (platform === 'TrueLearn') {
        const questionIdFromLocation = extractTrueLearnQuestionIdFromLocation();
        if (questionIdFromLocation) return { platform, questionId: questionIdFromLocation };

        const stemElement = document.querySelector('.question-stem');
        const stemText = normalizeWhitespace(stemElement?.textContent || '');
        if (stemText) {
            return { platform, questionId: `truelearn-${hashString(stemText.slice(0, 1000))}` };
        }
        return null;
    }

    if (platform === 'AMBOSS') {
        const questionIdFromLocation = extractAmbossQuestionIdFromLocation();
        if (questionIdFromLocation) return { platform, questionId: questionIdFromLocation };

        const stemElement = document.querySelector('article[class*="questionContent"]')
            || document.querySelector('[data-e2e-test-id="question-selected-true"] [data-test-id="snippet"]');
        const stemText = normalizeWhitespace(stemElement?.textContent || '');
        if (stemText) {
            return { platform, questionId: `amboss-${hashString(stemText.slice(0, 1000))}` };
        }
        return null;
    }

    if (platform === 'BluePrint') {
        const idFromLocation = extractBluePrintQuestionIdFromLocation();
        if (idFromLocation) return { platform, questionId: idFromLocation };
        const stemEl = document.querySelector('[data-testid="exam-answer-explanation-content"]');
        const stemText = normalizeWhitespace(stemEl?.textContent || '');
        if (stemText) return { platform, questionId: `blueprint-${hashString(stemText.slice(0, 1000))}` };
        return null;
    }

    if (platform === 'RoshReview') {
        const qid = (document.querySelector('input#question_id') as HTMLInputElement)?.value?.trim()
            || normalizeWhitespace(document.querySelector('.question_slug')?.textContent || '');
        if (qid) return { platform, questionId: `roshreview-${qid}` };
        const stemText = normalizeWhitespace(document.querySelector('#question_description')?.textContent || '');
        if (stemText) return { platform, questionId: `roshreview-${hashString(stemText.slice(0, 1000))}` };
        return null;
    }

    if (platform === 'USMLEFighter') {
        const qid = document.querySelector('[data-question-id]')?.getAttribute('data-question-id')?.trim();
        if (qid) return { platform, questionId: `usmlefighter-${qid}` };
        const stemEl = document.querySelector('#questionArea .question-data') || document.querySelector('#questionArea');
        const stemText = normalizeWhitespace(stemEl?.textContent || '');
        if (stemText) return { platform, questionId: `usmlefighter-${hashString(stemText.slice(0, 1000))}` };
        return null;
    }

    if (platform === 'Brivona') {
        const qidMatch = document.querySelector('.uw-header-left-title:not(.ma-header-ghost) .ma-qid')?.textContent?.match(/\(Id:\s*(\d+)\)/i);
        const qidFromHeader = qidMatch?.[1];
        const ttsQid = document.querySelector('[data-tts-q]')?.getAttribute('data-tts-q')?.trim();
        const commentaryQid = document.querySelector('.commentary[id^="commentary-"]')?.id.replace(/^commentary-/, '').trim();
        const bmkKey = document.querySelector('[data-bmk-key]')?.getAttribute('data-bmk-key');
        const bmkQid = bmkKey?.match(/\|\|\|(\d+)$/)?.[1];
        const qid = qidFromHeader || ttsQid || commentaryQid || bmkQid;
        if (qid) return { platform, questionId: `brivona-${qid}` };
        const stemEl = document.querySelector('.question-stem');
        const stemText = normalizeWhitespace(stemEl?.textContent || '');
        if (stemText) return { platform, questionId: `brivona-${hashString(stemText.slice(0, 1000))}` };
        return null;
    }

    const stemElement = document.querySelector('.ITSStemText');
    if (!stemElement) return null;

    const questionId = extractNbmeQuestionIdFromDom();
    if (questionId) {
        return {
            platform: platform === 'Unknown' ? 'NBME' : platform,
            questionId,
        };
    }

    const stemText = normalizeWhitespace(stemElement.textContent || '');
    if (!stemText) return null;

    return {
        platform: platform === 'Unknown' ? 'NBME' : platform,
        questionId: `nbme-${hashString(stemText.slice(0, 1000))}`,
    };
};

const extractAmbossQuestionContent = async (): Promise<QuestionData | null> => {
    const mainSpace = document.querySelector('[data-e2e-test-id="questionSessionMainSpace"]');
    const stemElement = document.querySelector('article[class*="questionContent"]')
        || document.querySelector('[data-e2e-test-id="question-selected-true"] [data-test-id="snippet"]');

    if (!stemElement) {
        return null;
    }

    const stem = normalizeWhitespace(htmlToMarkdown(stemElement.innerHTML || stemElement.textContent || ''));
    const answerContainers = Array.from(document.querySelectorAll('[data-e2e-test-id^="answer-theme-"]'));
    const options: string[] = [];
    let correctAnswer = '';
    let explanationElement: Element | null = null;
    let explanationMediaRoot: Element | null = null;
    let correctExplanationImage: string | undefined;
    let topic: string | undefined;
    let topicUrl: string | undefined;

    for (const container of answerContainers) {
        const choiceElement = container.querySelector('[data-e2e-test-id^="answer-"][data-testid^="answer-"]');
        if (!choiceElement) continue;

        const choiceDataId = choiceElement.getAttribute('data-e2e-test-id') || '';
        const letterMatch = choiceDataId.match(/^answer-([a-z])$/i);
        const letter = (letterMatch?.[1] || '').toUpperCase();

        const answerContent = choiceElement.querySelector('[class*="answerContent"]')
            || choiceElement.querySelector('p')
            || choiceElement;
        const text = normalizeWhitespace(htmlToMarkdown((answerContent as HTMLElement).innerHTML || answerContent.textContent || ''));
        if (!text) continue;

        const fullOption = letter ? `${letter}) ${text}` : text;
        const status = container.getAttribute('data-e2e-test-id') || '';
        const isCorrect = status === 'answer-theme-answerOptionCorrect';
        const isFirstAttemptCorrect = status === 'answer-theme-userFirstAttemptCorrect';
        options.push(fullOption);

        if (isCorrect || isFirstAttemptCorrect) {
            correctAnswer = fullOption;
            const answerExplanationRoot = container.querySelector('[data-e2e-test-id="answerExplanation"]');
            const candidateExplanation = answerExplanationRoot?.querySelector('[class*="explanationContent"]')
                || answerExplanationRoot;
            if (candidateExplanation) {
                explanationElement = candidateExplanation;
            }
            if (answerExplanationRoot) {
                explanationMediaRoot = answerExplanationRoot;
                const thumbnailRoot = answerExplanationRoot.querySelector(
                    '[data-e2e-test-id="AnswerThumbnail"], [data-testid="answer-thumbnail"], [data-e2e-test-id="ThumbnailWrapper"]'
                ) || answerExplanationRoot;
                const extractedImage = await extractImageBase64FromElement(thumbnailRoot as Element);
                if (extractedImage) {
                    correctExplanationImage = extractedImage;
                }
            }

            const linkedArticle = container.querySelector('[data-e2e-test-id="linked-article"]') as HTMLAnchorElement | null;
            const linkedArticleTitle = normalizeWhitespace(linkedArticle?.textContent || '');
            if (linkedArticleTitle) {
                topic = linkedArticleTitle;
                topicUrl = resolveAmbossArticleUrl(linkedArticle?.href);
            }
        }
    }

    if (!explanationElement) {
        const fallbackExplanationRoot = document.querySelector('[data-e2e-test-id="answer-theme-answerOptionCorrect"] [data-e2e-test-id="answerExplanation"]')
            || document.querySelector('[data-e2e-test-id="answer-theme-userFirstAttemptCorrect"] [data-e2e-test-id="answerExplanation"]');
        explanationElement = fallbackExplanationRoot?.querySelector('[class*="explanationContent"]')
            || fallbackExplanationRoot;
        explanationMediaRoot = explanationMediaRoot || fallbackExplanationRoot;
    }

    if (!correctExplanationImage) {
        if (!explanationMediaRoot) {
            explanationMediaRoot = document.querySelector('[data-e2e-test-id="answer-theme-answerOptionCorrect"] [data-e2e-test-id="answerExplanation"]')
                || document.querySelector('[data-e2e-test-id="answer-theme-userFirstAttemptCorrect"] [data-e2e-test-id="answerExplanation"]')
                || explanationElement;
        }

        const directThumbnailImg = document.querySelector(
            '[data-e2e-test-id="answer-theme-answerOptionCorrect"] [data-e2e-test-id="AnswerThumbnail"] img,' +
            ' [data-e2e-test-id="answer-theme-userFirstAttemptCorrect"] [data-e2e-test-id="AnswerThumbnail"] img,' +
            ' [data-e2e-test-id="answer-theme-answerOptionCorrect"] [data-testid="answer-thumbnail"] img,' +
            ' [data-e2e-test-id="answer-theme-userFirstAttemptCorrect"] [data-testid="answer-thumbnail"] img,' +
            ' [data-e2e-test-id="answer-theme-answerOptionCorrect"] img[src*="big_"],' +
            ' [data-e2e-test-id="answer-theme-userFirstAttemptCorrect"] img[src*="big_"]'
        ) as HTMLImageElement | null;

        if (directThumbnailImg) {
            const directSrc = getCandidateImageSrc(directThumbnailImg);
            if (directSrc) {
                if (directSrc.startsWith('data:image/')) {
                    correctExplanationImage = directSrc;
                } else {
                    correctExplanationImage = new URL(directSrc, window.location.href).toString();
                }
            }
        }

        if (!correctExplanationImage) {
            const preferredMediaRoot = explanationMediaRoot?.querySelector(
                '[data-e2e-test-id="AnswerThumbnail"], [data-testid="answer-thumbnail"], [data-e2e-test-id="ThumbnailWrapper"]'
            ) || explanationMediaRoot;
            correctExplanationImage = await extractImageBase64FromElement(preferredMediaRoot as Element | null);
        }

        if (!correctExplanationImage) {
            const htmlSnapshot = (explanationMediaRoot?.innerHTML || explanationElement?.innerHTML || '').trim();
            const urlMatch = htmlSnapshot.match(/(?:https?:\/\/[^"'\s>]*big_[^"'\s>]+|(?:\.\/)?[^"'\s>]*big_[^"'\s>]+)/i);
            if (urlMatch?.[0]) {
                correctExplanationImage = new URL(urlMatch[0], window.location.href).toString();
            }
        }
    }

    const explanation = markdownFromElement(explanationElement);
    const linkedArticles = Array.from(document.querySelectorAll('[data-e2e-test-id="linked-article"]'));
    const references = linkedArticles
        .map((link) => {
            const title = normalizeWhitespace(link.textContent || '');
            const href = resolveAmbossArticleUrl((link as HTMLAnchorElement).href || '');
            if (!title && !href) return '';
            return href ? `${title} - ${href}` : title;
        })
        .filter((value) => value.length > 0)
        .filter((value, index, values) => values.indexOf(value) === index);

    const image = await extractStemImageBase64(stemElement, [mainSpace]);
    const questionId = extractAmbossQuestionId(stem, options);

    return {
        questionId,
        platform: 'AMBOSS',
        stem,
        labValues: '',
        options,
        correctAnswer: correctAnswer || undefined,
        explanation,
        image,
        correctExplanationImage,
        tables: extractTablesFromElement(explanationElement),
        references: references.length > 0 ? references : undefined,
        topic,
        topicUrl,
        educationalObjective: extractEducationalObjective(explanationElement),
        explanations: extractParagraphs(explanationElement),
    };
};

const extractBluePrintQuestionIdFromLocation = (): string | null => {
    const params = new URLSearchParams(window.location.search || '');
    const qid = (params.get('questionId') || '').trim();
    if (qid) return `blueprint-${qid}`;
    // Fallback: Blueprint stamps the question UUID as the id on content containers.
    const contentWithId = document.querySelector(
        '[data-testid="exam-answer-explanation-content"][id], [data-testid="exam-rapid-review-content"][id]'
    );
    const domId = (contentWithId?.getAttribute('id') || '').trim();
    if (domId) return `blueprint-${domId}`;
    return null;
};

/*
// Find a collapsible card by its visible title text (case-insensitive).
const findBluePrintCardByTitle = (title: string): Element | null => {
    const cards = Array.from(document.querySelectorAll('[data-testid="collapsible-card"]'));
    const wanted = title.trim().toLowerCase();
    return cards.find((card) => {
        const t = normalizeWhitespace(
            card.querySelector('[data-testid="collapsible-card-title"]')?.textContent || ''
        ).toLowerCase();
        return t === wanted;
    }) || null;
};
*/

const getBluePrintSectionMarkdown = (testId: string): string => {
    const el = document.querySelector(`[data-testid="${testId}"]`);
    if (!el) return '';
    return normalizeWhitespace(htmlToMarkdown(el.innerHTML || el.textContent || ''));
};

// One Step Further answer is hidden behind a "Reveal Answer" button. Click it, then read.
const revealAndReadBluePrintNextAnswer = async (): Promise<string> => {
    const answerBox = document.querySelector('[data-testid="one-step-further-answer"]');
    if (!answerBox) return '';

    const readAnswer = (): string => {
        // After reveal, the answer text replaces the button. Prefer a structured section.
        const section = answerBox.querySelector('section, [data-testid*="answer-content"], .mantine-TypographyStylesProvider-root');
        const raw = section
            ? (section.innerHTML || section.textContent || '')
            : (answerBox.textContent || '');
        const text = normalizeWhitespace(htmlToMarkdown(raw));
        // Ignore the button label itself.
        if (!text || /^reveal answer$/i.test(text)) return '';
        return text;
    };

    let answer = readAnswer();
    if (answer) return answer;

    const revealBtn = answerBox.querySelector<HTMLButtonElement>(
        '[data-testid="one-step-further-answer-reveal-button"]'
    );
    if (revealBtn) {
        revealBtn.click();
        // Wait briefly for Mantine to render the revealed answer.
        for (let i = 0; i < 10; i += 1) {
            await new Promise((r) => setTimeout(r, 100));
            answer = readAnswer();
            if (answer) break;
        }
    }
    return answer;
};

const extractBluePrintSpecialty = (): string => {
    const titleEls = Array.from(document.querySelectorAll('[data-testid="panel-section-title"]'));
    for (const titleEl of titleEls) {
        const title = normalizeWhitespace(titleEl.textContent || '').toLowerCase();
        if (title === 'specialty') {
            const parent = titleEl.closest('.panelsection_panel-section__oNNUg, [class*="panel-section"]') || titleEl.parentElement?.parentElement;
            const descEl = parent?.querySelector('[data-testid="panel-section-description"]');
            if (descEl) {
                return normalizeWhitespace(descEl.textContent || '');
            }
        }
    }
    return '';
};

const extractBluePrintQuestionContent = async (): Promise<QuestionData | null> => {
    // The explanation card is the anchor that proves we're on an answered question page.
    const explanationEl = document.querySelector('[data-testid="exam-answer-explanation-content"]');

    // --- STEM (confirm selector on live site, see §3.4) ---
    const stemEl =
        document.querySelector('[data-testid="exam-question-content"]') ||
        document.querySelector('[data-testid="question-stem"]') ||
        document.querySelector('[data-testid*="question-content"]:not([data-testid*="one-step"])');
    const stem = stemEl
        ? normalizeWhitespace(htmlToMarkdown(stemEl.innerHTML || stemEl.textContent || ''))
        : '';

    // --- ANSWER CHOICES (confirm selector on live site, see §3.4) ---
    const options: string[] = [];
    let correctAnswer: string | undefined;
    const choiceEls = Array.from(
        document.querySelectorAll('[data-testid^="answer-choice"], [data-testid*="answer-option"]')
    );
    choiceEls.forEach((el, idx) => {
        const text = normalizeWhitespace(htmlToMarkdown(el.innerHTML || el.textContent || ''));
        if (!text) return;
        const letter = LETTERS[idx] || String(idx + 1);
        const labeled = /^[A-Z][).]/.test(text) ? text : `${letter}) ${text}`;
        options.push(labeled);
        const status = (el.getAttribute('data-testid') || '') + ' ' + (el.className || '');
        if (/correct/i.test(status) && !/incorrect/i.test(status)) {
            correctAnswer = labeled;
        }
    });

    // --- EXPLANATION ---
    const explanation = markdownFromElement(explanationEl);

    // --- BLUEPRINT-ONLY FIELDS ---
    const nextQuestion = getBluePrintSectionMarkdown('exam-one-step-further-question-content');
    const nextAnswer = await revealAndReadBluePrintNextAnswer();
    const rapidReviewEl = document.querySelector('[data-testid="exam-rapid-review-content"]');
    const rapidReview = cleanBlueprintHtml(rapidReviewEl); // HTML string, formatting preserved

    // Nothing useful on the page → bail so we don't store empty rows.
    if (!explanation && !stem && !nextQuestion && !rapidReview) {
        return null;
    }

    const questionId =
        extractBluePrintQuestionIdFromLocation() ||
        `blueprint-${hashString((stem || explanation).slice(0, 1000))}`;

    const image = stemEl ? await extractStemImageBase64(stemEl as Element) : undefined;
    const correctExplanationImage = await extractImageBase64FromElement(explanationEl);
    const references = extractParagraphs(
        document.querySelector('[id$="panel-exam-references-card-expanded"]')
    );

    const specialty = extractBluePrintSpecialty();

    return {
        questionId,
        platform: 'BluePrint',
        stem,
        labValues: '',
        options,
        correctAnswer,
        explanation,
        image,
        correctExplanationImage,
        tables: extractTablesFromElement(explanationEl),
        references: references.length > 0 ? references : undefined,
        explanations: extractParagraphs(explanationEl),
        nextQuestion: nextQuestion || undefined,
        nextAnswer: nextAnswer || undefined,
        rapidReview: rapidReview || undefined,
        topic: specialty || undefined,
    };
};

const cleanRoshReviewHtml = (root: Element | null): string => {
    if (!root) return '';
    const clone = root.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('script, style, button, svg').forEach((n) => n.remove());
    clone.querySelectorAll('*').forEach((el) => {
        el.removeAttribute('id');
        el.removeAttribute('style');
        if (el.getAttribute('class') !== null) el.removeAttribute('class');
    });
    return (clone.innerHTML || '').replace(/\s+/g, ' ').replace(/>\s+</g, '><').trim();
};

const revealAndReadRoshReviewNextAnswer = async (): Promise<string> => {
    const answerEl = document.querySelector('#osf_answer');
    if (!answerEl) return '';

    const readAnswer = (): string => {
        return normalizeWhitespace(htmlToMarkdown(answerEl.innerHTML || answerEl.textContent || ''));
    };

    let answer = readAnswer();
    if (answer) return answer;

    const revealBtn = document.querySelector<HTMLButtonElement>('#one_step_answer');
    if (revealBtn) {
        revealBtn.click();
        for (let i = 0; i < 10; i += 1) {
            await new Promise((r) => setTimeout(r, 100));
            answer = readAnswer();
            if (answer) break;
        }
    }
    return answer;
};

const extractRoshReviewQuestionContent = async (): Promise<QuestionData | null> => {
    const stemEl = document.querySelector('#question_description');
    const explanationEl = document.querySelector('#question_explanation');

    const stem = stemEl
        ? normalizeWhitespace(htmlToMarkdown(stemEl.innerHTML || stemEl.textContent || ''))
        : '';
    const explanation = markdownFromElement(explanationEl);

    if (!stem && !explanation) {
        return null;
    }

    const options: string[] = [];
    const choiceEls = Array.from(document.querySelectorAll('#answer_options li'));
    choiceEls.forEach((el, idx) => {
        const letter = el.querySelector('.greyRound')?.textContent?.trim() || LETTERS[idx] || String(idx + 1);
        const textEl = el.querySelector('.rr_start');
        const text = textEl
            ? normalizeWhitespace(htmlToMarkdown(textEl.innerHTML || textEl.textContent || ''))
            : normalizeWhitespace(htmlToMarkdown(el.innerHTML || el.textContent || ''));
        
        if (!text) return;
        const labeled = `${letter}) ${text}`;
        options.push(labeled);
    });

    const correctAnswerLetter = document.querySelector('#correct_answer')?.textContent?.trim();
    let correctAnswer: string | undefined;
    if (correctAnswerLetter && options.length > 0) {
        correctAnswer = options.find(opt => opt.startsWith(`${correctAnswerLetter})`));
    }

    const questionIdVal = (document.querySelector('input#question_id') as HTMLInputElement)?.value?.trim()
        || normalizeWhitespace(document.querySelector('.question_slug')?.textContent || '');
    const questionId = questionIdVal 
        ? `roshreview-${questionIdVal}` 
        : `roshreview-${hashString((stem || explanation).slice(0, 1000))}`;

    const image = stemEl ? await extractStemImageBase64(stemEl) : undefined;
    const correctExplanationImage = explanationEl ? await extractImageBase64FromElement(explanationEl) : undefined;

    const system = normalizeWhitespace(document.querySelector('#category_name')?.textContent || '');
    const topic = normalizeWhitespace(document.querySelector('#subcategory_name')?.textContent || '');

    const referencesEls = Array.from(document.querySelectorAll('#references_list li'));
    const references = referencesEls
        .map(el => normalizeWhitespace(htmlToMarkdown(el.innerHTML || el.textContent || '')))
        .filter(Boolean);

    // One Step Further (OSF)
    const nextQuestionEl = document.querySelector('#osf_question');
    const nextQuestion = nextQuestionEl
        ? normalizeWhitespace(htmlToMarkdown(nextQuestionEl.innerHTML || nextQuestionEl.textContent || ''))
        : undefined;
    const nextAnswer = await revealAndReadRoshReviewNextAnswer();

    const rapidReviewEl = document.querySelector('#rapid-review-data');
    const rapidReview = rapidReviewEl ? cleanRoshReviewHtml(rapidReviewEl) : undefined;

    return {
        questionId,
        platform: 'RoshReview',
        stem,
        labValues: '',
        options,
        correctAnswer,
        explanation,
        image,
        correctExplanationImage,
        tables: explanationEl ? extractTablesFromElement(explanationEl) : undefined,
        references: references.length > 0 ? references : undefined,
        explanations: explanationEl ? extractParagraphs(explanationEl) : undefined,
        nextQuestion: nextQuestion || undefined,
        nextAnswer: nextAnswer || undefined,
        rapidReview: rapidReview || undefined,
        subject: 'Emergency Medicine',
        system: system || undefined,
        topic: topic || undefined,
    };
};

const extractTrueLearnQuestionContent = async (): Promise<QuestionData | null> => {
    const stemElement = document.querySelector('.question-stem');
    if (!stemElement) {
        return null;
    }

    const stem = normalizeWhitespace(htmlToMarkdown(stemElement.innerHTML || stemElement.textContent || ''));

    const options: string[] = [];
    let correctAnswer: string | undefined;
    const labels = Array.from(document.querySelectorAll('.answer label, label.ms-1'));
    labels.forEach((label) => {
        const text = normalizeWhitespace(htmlToMarkdown(label.innerHTML || label.textContent || ''));
        if (!text) return;

        options.push(text);

        const answerContainer = label.closest('.answer');
        if (answerContainer?.classList.contains('correct')) {
            correctAnswer = text;
        }
    });

    let mainExplanation = '';
    const explanationContainer = document.querySelector('.explanation-container');
    if (explanationContainer) {
        mainExplanation = markdownFromElement(explanationContainer);
    }

    const correctAnswerLetter = normalizeWhitespace(document.querySelector('.correct-answer')?.textContent || '')
        .match(/correct answer is:\s*([A-Z])/i)?.[1];
    if (!correctAnswer && correctAnswerLetter) {
        correctAnswer = findOptionByLabel(options, correctAnswerLetter) || correctAnswerLetter;
    }

    const bottomLine = normalizeWhitespace(document.querySelector('.bottom-line > span:last-child')?.textContent || '');
    const answerExplanationSections = Array.from(document.querySelectorAll('.answer-explanations'))
        .map((section) => {
            const heading = normalizeWhitespace(section.querySelector('h2, h3, h4')?.textContent || '');
            const clone = cloneForExtraction(section);
            clone?.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((node) => node.remove());
            const body = normalizeWhitespace(htmlToMarkdown(clone?.innerHTML || clone?.textContent || ''));
            if (heading && body) return `${heading}\n${body}`;
            return heading || body;
        })
        .filter(Boolean);

    const insightSections = Array.from(document.querySelectorAll('.insight'))
        .map((section) => {
            const heading = normalizeWhitespace(section.querySelector('h2, h3, h4')?.textContent || '');
            const clone = cloneForExtraction(section);
            clone?.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((node) => node.remove());
            const body = normalizeWhitespace(htmlToMarkdown(clone?.innerHTML || clone?.textContent || ''));
            if (heading && body) return `${heading}\n${body}`;
            return heading || body;
        })
        .filter(Boolean);

    const explanations = [
        bottomLine ? `Bottom Line\n${bottomLine}` : '',
        ...answerExplanationSections,
        ...insightSections,
    ].filter(Boolean);

    const references = Array.from(document.querySelectorAll('.sources-container > span.mt-2'))
        .map((item) => normalizeWhitespace(htmlToMarkdown(item.innerHTML || item.textContent || '')))
        .filter(Boolean);

    let topic: string | undefined;
    let subject: string | undefined;
    let system: string | undefined;
    Array.from(document.querySelectorAll('.topic-container > span')).forEach((item) => {
        const labelElement = item.querySelector('.fst-italic');
        const label = normalizeWhitespace(labelElement?.textContent || '').replace(/:$/, '');
        const clone = cloneForExtraction(item);
        clone?.querySelectorAll('.fst-italic').forEach((node) => node.remove());
        const value = normalizeWhitespace(htmlToMarkdown(clone?.innerHTML || clone?.textContent || ''));

        if (!value) return;
        if (!label && !topic) {
            topic = value;
            return;
        }

        if (/^discipline$/i.test(label) && !subject) {
            subject = value;
        }

        if (/^body system$/i.test(label) && !system) {
            system = value.split('/')[0]?.trim() || value;
        }
    });

    const image = await extractStemImageBase64(stemElement);
    const questionId = extractTrueLearnQuestionIdFromLocation() || `truelearn-${hashString(stem.slice(0, 1000))}`;

    return {
        questionId,
        platform: 'TrueLearn',
        stem,
        labValues: '',
        options,
        correctAnswer,
        explanation: mainExplanation,
        image,
        tables: extractTablesFromElement(explanationContainer),
        references: references.length > 0 ? references : undefined,
        subject,
        system,
        topic,
        educationalObjective: bottomLine || undefined,
        explanations: explanations.length > 0 ? explanations : undefined,
    };
};

const extractUsmleFighterQuestionContent = async (): Promise<QuestionData | null> => {
    const questionTextElement = document.querySelector('#questionArea .question-data')
        || document.querySelector('#question1')
        || document.querySelector('#questionArea .question-text-wrapper')
        || document.querySelector('#questionArea');
    const optionsArea = document.querySelector('#optionsArea')
        || document.querySelector('.csq-question-options');

    if (!questionTextElement || !optionsArea) {
        return null;
    }

    const stem = htmlToMarkdown(questionTextElement.innerHTML || '');

    const wrapperEls = Array.from(optionsArea.querySelectorAll('.csq-question-option-single-wrapper'));
    const optionEls = wrapperEls.length > 0
        ? wrapperEls
        : Array.from(optionsArea.querySelectorAll('.option-single'));
    const options: string[] = [];
    const seenOptionKeys = new Set<string>();
    let detectedCorrectLetter: string | undefined;

    optionEls.forEach((wrapper, index) => {
        const optionSingle = wrapper.matches('.option-single')
            ? wrapper
            : wrapper.querySelector('.option-single');
        const contentCell = optionSingle?.querySelector('.question-option-area')
            || optionSingle
            || wrapper;

        if (wrapper.querySelector('.fa-check, .green')) {
            const letter = optionSingle?.id?.trim() || LETTERS[index];
            if (letter) detectedCorrectLetter = letter;
        }

        const targetEl = (contentCell || wrapper) as Element;
        const contentClone = targetEl.cloneNode(true) as HTMLElement;
        contentClone.querySelectorAll('i, svg, input, .checkbox-wrapper-12, .cbx').forEach((el) => el.remove());
        contentClone.querySelectorAll('.option-percentage').forEach((el) => el.remove());
        contentClone.querySelectorAll('span').forEach((span) => {
            const text = normalizeWhitespace(span.textContent || '');
            if (/^\(\d+%\)$/.test(text)) {
                span.remove();
            }
        });
        contentClone.querySelectorAll('strike').forEach((strike) => {
            strike.replaceWith(...Array.from(strike.childNodes));
        });

        const optionText = normalizeWhitespace(htmlToMarkdown(contentClone.innerHTML || contentClone.textContent || ''));
        if (!optionText) return;

        const match = optionText.match(/^([A-Z])[).]\s*(.*)$/);
        const letter = optionSingle?.id?.trim() || match?.[1] || LETTERS[options.length] || String(options.length + 1);
        const bodyText = match?.[2] !== undefined ? match[2] : optionText;
        const labeled = `${letter}) ${bodyText}`;
        const optionKey = `${letter}::${bodyText.toLowerCase()}`;
        if (seenOptionKeys.has(optionKey)) return;
        seenOptionKeys.add(optionKey);
        options.push(labeled);
    });

    const findUsmleFighterExplanationElement = (): Element | null => {
        const direct = document.querySelector('#explanationArea')
            || document.querySelector('.explanation-description')
            || document.querySelector('.answer-explanation-area');
        if (direct) return direct;

        const wrapper = document.querySelector('#explanation_wrapper');
        if (!wrapper) return null;

        const stripped = markdownFromElement(wrapper);
        if (!stripped || looksLikePlaceholderExplanation(stripped)) {
            return null;
        }
        return wrapper;
    };

    let explanationElement = findUsmleFighterExplanationElement();
    for (let i = 0; i < 10; i += 1) {
        const currentText = explanationElement ? markdownFromElement(explanationElement) : '';
        if (currentText && !looksLikePlaceholderExplanation(currentText)) {
            break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
        explanationElement = findUsmleFighterExplanationElement();
    }

    const rawExplanation = explanationElement ? markdownFromElement(explanationElement) : '';
    const explanation = rawExplanation && !looksLikePlaceholderExplanation(rawExplanation)
        ? rawExplanation
        : undefined;
    const explanations = explanation ? extractParagraphs(explanationElement) : undefined;
    const tables = explanationElement ? extractTablesFromElement(explanationElement) : undefined;
    const image = await extractStemImageBase64(questionTextElement, [document.querySelector('#question_wrapper')]);
    const correctExplanationImage = await extractImageBase64FromElement(document.querySelector('#explanation_wrapper') || explanationElement);

    let subject: string | undefined;
    let system: string | undefined;
    let topic: string | undefined;
    const metaItems = Array.from(document.querySelectorAll('#explanation-course .explanation-meta-item, .explanation-course .explanation-meta-item'));
    metaItems.forEach((item) => {
        const label = normalizeWhitespace(item.querySelector('.explanation-meta-label')?.textContent || '').toLowerCase();
        const value = normalizeWhitespace(item.querySelector('.explanation-meta-value')?.textContent || '');
        if (!value) return;
        if (label.includes('subject')) subject = value;
        else if (label.includes('system')) system = value;
        else if (label.includes('topic')) topic = value;
    });

    const flipped = resolveFlippedPlatformSubjectAndSystem(subject, system);
    subject = flipped.subject;
    system = flipped.system;

    let educationalObjective: string | undefined;
    if (explanation) {
        const objMatch = explanation.match(/educational objective:\s*([\s\S]+?)$/i);
        if (objMatch?.[1]) {
            educationalObjective = objMatch[1].trim();
        }
    }
    if (!educationalObjective && explanationElement) {
        educationalObjective = extractEducationalObjective(explanationElement);
    }
    if (!educationalObjective && explanation) {
        educationalObjective = explanation;
    }

    const qidFromDom = document.querySelector('[data-question-id]')?.getAttribute('data-question-id')?.trim();
    const questionId = qidFromDom
        ? `usmlefighter-${qidFromDom}`
        : `usmlefighter-${hashString(`${stem}\n${options.join('\n')}`)}`;

    const correctAnswerValueText = normalizeWhitespace(
        document.querySelector('.answer-stats-area .correct-answer-value')?.textContent || ''
    );
    const correctAnswerLetter = correctAnswerValueText.match(/^([A-Z])[).]/)?.[1] || detectedCorrectLetter;
    const correctAnswer = correctAnswerLetter
        ? (findOptionByLabel(options, correctAnswerLetter) || correctAnswerLetter)
        : (correctAnswerValueText || undefined);

    return {
        questionId,
        platform: 'USMLEFighter',
        stem,
        labValues: '',
        options,
        correctAnswer,
        explanation: explanation ?? '',
        image,
        correctExplanationImage,
        tables: tables && tables.length > 0 ? tables : undefined,
        subject,
        system,
        topic,
        educationalObjective,
        explanations: explanations && explanations.length > 0 ? explanations : undefined,
    };
};

const extractBrivonaQuestionContent = async (): Promise<QuestionData | null> => {
    const questionTextElement = document.querySelector('.question-stem')
        || document.querySelector('.uw-main .question-stem');
    const optionsArea = document.querySelector('.answer-options');

    if (!questionTextElement || !optionsArea) {
        return null;
    }

    const stem = htmlToMarkdown(questionTextElement.innerHTML || '');

    const optionEls = Array.from(optionsArea.querySelectorAll('.answer-option'));
    const options: string[] = [];
    const seenOptionKeys = new Set<string>();
    let detectedCorrectLetter: string | undefined;

    optionEls.forEach((optionEl, index) => {
        const letterEl = optionEl.querySelector('.option-letter');
        const textEl = optionEl.querySelector('.option-text') || optionEl.querySelector('.option-content') || optionEl;

        const isCorrect = optionEl.classList.contains('correct') || optionEl.querySelector('.correct');
        const letter = letterEl?.textContent?.trim() || LETTERS[index] || String(index + 1);
        if (isCorrect && letter) {
            detectedCorrectLetter = letter;
        }

        const contentClone = textEl.cloneNode(true) as HTMLElement;
        contentClone.querySelectorAll('.uw-strike-btn, svg, input, button').forEach((el) => el.remove());
        const optionText = normalizeWhitespace(htmlToMarkdown(contentClone.innerHTML || contentClone.textContent || ''));
        if (!optionText) return;

        const labeled = `${letter}) ${optionText}`;
        const optionKey = `${letter}::${optionText.toLowerCase()}`;
        if (seenOptionKeys.has(optionKey)) return;
        seenOptionKeys.add(optionKey);
        options.push(labeled);
    });

    const findBrivonaExplanationElement = (): Element | null => {
        return document.querySelector('.commentary-content')
            || document.querySelector('.commentary');
    };

    let explanationElement = findBrivonaExplanationElement();
    for (let i = 0; i < 10; i += 1) {
        const currentText = explanationElement ? markdownFromElement(explanationElement) : '';
        if (currentText && !looksLikePlaceholderExplanation(currentText)) {
            break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
        explanationElement = findBrivonaExplanationElement();
    }

    const rawExplanation = explanationElement ? markdownFromElement(explanationElement) : '';
    const explanation = rawExplanation && !looksLikePlaceholderExplanation(rawExplanation)
        ? rawExplanation
        : undefined;
    const explanations = explanation ? extractParagraphs(explanationElement) : undefined;
    const tables = explanationElement ? extractTablesFromElement(explanationElement) : undefined;
    const image = await extractStemImageBase64(questionTextElement);
    const correctExplanationImage = await extractImageBase64FromElement(explanationElement);

    let educationalObjective: string | undefined;
    if (explanationElement) {
        const objLabel = Array.from(explanationElement.querySelectorAll('strong, b')).find((el) =>
            /educational\s+objective/i.test(el.textContent || '')
        );
        if (objLabel) {
            const p = objLabel.closest('p');
            if (p) {
                const pText = normalizeWhitespace(htmlToMarkdown(p.innerHTML || ''));
                const matched = matchEducationalObjective(pText);
                if (matched) {
                    educationalObjective = matched.objective;
                }
            }
        }
        if (!educationalObjective) {
            educationalObjective = extractEducationalObjective(explanationElement);
        }
    }
    if (!educationalObjective && explanation) {
        const objMatch = explanation.match(/educational objective:\s*([\s\S]+?)$/i);
        if (objMatch?.[1]) {
            educationalObjective = objMatch[1].trim();
        }
    }
    // Fall back to full explanation if objective is absent (for both openQbank and openHyGuru users)
    if (!educationalObjective && explanation) {
        educationalObjective = explanation;
    }

    const qidFromHeader = document.querySelector('.uw-header-left-title:not(.ma-header-ghost) .ma-qid')?.textContent?.match(/\(Id:\s*(\d+)\)/i)?.[1];
    const ttsQid = document.querySelector('[data-tts-q]')?.getAttribute('data-tts-q')?.trim();
    const commentaryQid = document.querySelector('.commentary[id^="commentary-"]')?.id.replace(/^commentary-/, '').trim();
    const bmkKey = document.querySelector('[data-bmk-key]')?.getAttribute('data-bmk-key');
    const bmkQid = bmkKey?.match(/\|\|\|(\d+)$/)?.[1];
    const qidFromDom = qidFromHeader || ttsQid || commentaryQid || bmkQid;

    const questionId = qidFromDom
        ? `brivona-${qidFromDom}`
        : `brivona-${hashString(`${stem}\n${options.join('\n')}`)}`;

    const correctAnswer = detectedCorrectLetter
        ? (findOptionByLabel(options, detectedCorrectLetter) || detectedCorrectLetter)
        : undefined;

    return {
        questionId,
        platform: 'Brivona',
        stem,
        labValues: '',
        options,
        correctAnswer,
        explanation: explanation ?? '',
        image,
        correctExplanationImage,
        tables: tables && tables.length > 0 ? tables : undefined,
        educationalObjective,
        explanations: explanations && explanations.length > 0 ? explanations : undefined,
    };
};

export const getQuestionContent = async (): Promise<QuestionData | null> => {
    try {
        const platform = getPlatformFromLocation();

        if (platform === 'UWorld') {
            return await extractUWorldQuestionContent();
        }

        if (platform === 'AMBOSS') {
            return await extractAmbossQuestionContent();
        }

        if (platform === 'TrueLearn') {
            return await extractTrueLearnQuestionContent();
        }

        if (platform === 'BluePrint') {
            return await extractBluePrintQuestionContent();
        }

        if (platform === 'RoshReview') {
            return await extractRoshReviewQuestionContent();
        }

        if (platform === 'USMLEFighter') {
            return await extractUsmleFighterQuestionContent();
        }

        if (platform === 'Brivona') {
            return await extractBrivonaQuestionContent();
        }

        const result = await extractNbmeQuestionContent(platform === 'Unknown' ? 'NBME' : platform);
        if (result && !result.educationalObjective) {
            result.educationalObjective = extractEducationalObjective(document.body);
        }
        return result;
    } catch (error) {
        console.error('Error extracting question content:', error);
        return null;
    }
};

const normalizeOrganSystemKey = (value?: string) => {
    return (value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
};

const resolveOrganSystem = (value?: string): CanonicalOrganSystem => {
    const key = normalizeOrganSystemKey(value);
    if (!key) return DEFAULT_ORGAN_SYSTEM as CanonicalOrganSystem;

    const direct = CANONICAL_ORGAN_SYSTEMS.find(
        (option: string) => normalizeOrganSystemKey(option) === key
    );
    if (direct) return direct;

    if (ORGAN_SYSTEM_ALIAS_MAP[key]) return ORGAN_SYSTEM_ALIAS_MAP[key];

    const fuzzy = Object.entries(ORGAN_SYSTEM_ALIAS_MAP).find(
        ([alias]) => key.includes(alias) || alias.includes(key)
    );
    if (fuzzy) return fuzzy[1];

    return DEFAULT_ORGAN_SYSTEM as CanonicalOrganSystem;
};

export const buildQuestionDataPayload = (questionData?: QuestionData | null): InlineQuestionDataPayload | undefined => {
    if (!questionData) return undefined;
    const educationalObjective =
        questionData.educationalObjective
        || (questionData.platform === 'USMLEFighter' || questionData.platform === 'Brivona' ? questionData.explanation : undefined);
    return {
        platform: questionData.platform === 'Brivona' ? 'brivona' : questionData.platform,
        subject: questionData.subject,
        system: questionData.system?.trim() || '',
        topic: questionData.topic,
        topic_url: questionData.topicUrl,
        educational_objective: educationalObjective,
        references: questionData.references && questionData.references.length > 0 ? questionData.references : undefined,
    };
};

