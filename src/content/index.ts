import {
    CARD_POLL_CHECK_OFFSETS_MS,
    calculateCardPollProgress,
    isOpenQbankTier,
    isOpenQbankFree,
    isOpenQbankPro,
    isOpenQbankAdmin,
    isLeadInCard,
    shouldShowOpenQbankGenerateButton,
    shouldApplyOpenQbankCachedPreview,
    isExtensionDarkSurface,
} from './tierAccess';
import { sendOpenQBankRequest, showUpdateRequiredModal } from '../shared/request';
import { CANONICAL_ORGAN_SYSTEMS, resolveOrganSystem } from '../shared/organSystems';
import {
    updateCustomCardFabVisibility,
    removeCustomCardFab,
} from './customCardFab';
import { OPENQBANK_INJECTED_TOKEN_CSS } from './openqbankTokens';
import { DISCLAIMER_TEXT } from '../disclaimer';

import type { QuestionData } from '@extract';
import {
    buildQuestionDataPayload,
    getQuestionContent,
    getQuestionFingerprint,
    getPlatformFromLocation,
} from '@extract';


interface InlineActionState {
    questionId: string | null;
    cardsPending: boolean;
    cardsDoneQuestionId: string | null;
    flagPending: boolean;
    flagDoneQuestionId: string | null;
    customAnkiEnabled: boolean | null;
    status: string;
    statusKind: 'idle' | 'info' | 'success' | 'error';
    generatedCardsText: string | null;
    lockedCount: number;
    contentScope: 'full' | 'partial' | null;
    userTier: string | null;
    userType: string | null;
    cacheIdentity: string | null;
    statusResolved: boolean;
    showPreview: boolean;
    activeCardIndex: number;
    revealedCardIndices: Set<number>;
    addedCardIndices: Set<number>;
    reportingCardIndex?: number | null;
    countdownText?: string | null;
    countdownProgress?: number | null;
    countdownStartedAt?: number | null;
    modalZoomLevel?: number;
    totalCards?: number;
    customCardFabEnabled?: boolean;
    aiFlashcardsEnabled?: boolean;
    userOwnedPreview?: boolean;
    upgradeRequired?: boolean;
    minVersion?: string;
    upgradeUrl?: string;
}

const INLINE_ACTIONS_ROOT_ID = 'openchromebank-inline-actions';
const INLINE_ACTIONS_STYLE_ID = 'openchromebank-inline-actions-style';

const normalizeWhitespace = (text: string): string =>
    text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

type LearningFlagResponse = {
    flagged?: boolean;
};

type GenerateCardsResponse = {
    queued?: boolean;
    already_cached?: boolean;
    question_id?: string;
    job_id?: number;
    message?: string;
    error?: string;
    cards?: string;
    content_scope?: 'full' | 'partial';
    locked_count?: number;
    user_owned?: boolean;
    generation_pending?: boolean;
    generation_failed?: boolean;
};

const requestGenerateCards = async (
    questionId?: string,
    questionData?: QuestionData | null,
): Promise<GenerateCardsResponse> => {
    return (await sendOpenQBankRequest<GenerateCardsResponse>(
        '/api/extension/generate-cards',
        {
            question_id: questionId?.trim() || questionData?.questionId?.trim() || '',
            question_data: buildQuestionDataPayload(questionData),
        },
        true,
    )) || {};
};

const requestLearningFlag = async (
    questionId?: string,
    questionData?: QuestionData | null,
) : Promise<LearningFlagResponse> => {
    return (await sendOpenQBankRequest<LearningFlagResponse>(
        '/api/extension/flag-learning',
        {
            question_id: questionId?.trim() || questionData?.questionId?.trim() || '',
            question_data: buildQuestionDataPayload(questionData),
        },
        true,
    )) || {};
};

const requestAddToLibrary = async (
    questionId: string,
    cardIndex?: number,
    questionData?: QuestionData | null,
) => {
    return await sendOpenQBankRequest<{ success: boolean; cards_count?: number }>(
        '/api/extension/add-to-library',
        {
            question_id: questionId.trim(),
            card_index: cardIndex != null ? cardIndex : undefined,
            question_data: buildQuestionDataPayload(questionData),
        },
        true,
    );
};

const requestReportCard = async (payload: {
    questionId: string;
    cardIndex: number;
    rating?: string;
    issues?: string[];
    comment?: string;
    platform?: string;
    cardFront?: string;
    cardBack?: string;
    topic?: string;
}) => {
    return await sendOpenQBankRequest<{ success: boolean }>(
        '/api/extension/report-card',
        {
            question_id: payload.questionId.trim(),
            card_index: payload.cardIndex,
            rating: payload.rating || 'needs_work',
            issues: payload.issues || [],
            feedback_text: payload.comment || '',
            platform: payload.platform || getPlatformFromLocation(),
            card_front: payload.cardFront || '',
            card_back: payload.cardBack || '',
            topic: payload.topic || '',
        },
        true,
    );
};

const inlineActionState: InlineActionState = {
    questionId: null,
    cardsPending: false,
    cardsDoneQuestionId: null,
    flagPending: false,
    flagDoneQuestionId: null,
    customAnkiEnabled: null,
    status: '',
    statusKind: 'idle',
    generatedCardsText: null,
    lockedCount: 0,
    contentScope: null,
    userTier: null,
    userType: null,
    cacheIdentity: null,
    statusResolved: false,
    showPreview: false,
    activeCardIndex: 0,
    revealedCardIndices: new Set<number>(),
    addedCardIndices: new Set<number>(),
    reportingCardIndex: null,
    modalZoomLevel: 0.95,
    totalCards: 0,
    customCardFabEnabled: true,
    aiFlashcardsEnabled: true,
    userOwnedPreview: false,
    upgradeRequired: false,
    minVersion: undefined,
    upgradeUrl: undefined,
};

const canRenderInlineActionsInCurrentWindow = () => {
    const platform = getPlatformFromLocation();
    if ((platform === 'NBME' || platform === 'OpenQBank') && document.querySelector('.ITSStemText')) {
        return true;
    }

    try {
        return window.top === window.self;
    } catch {
        return false;
    }
};

const getInlineActionAnchor = (): Element | null => {
    const platform = getPlatformFromLocation();

    if (platform === 'BluePrint') {
        return document.querySelector('[data-testid="exam-answer-explanation-content"]')
            ?.closest('[data-testid="collapsible-card"]')
            || document.querySelector('[data-testid="exam-answer-explanation-content"]');
    }

    if (platform === 'RoshReview') {
        return document.querySelector('#answer_detail')
            || document.querySelector('#question_explanation')
            || document.querySelector('#question_detail');
    }

    if (platform === 'USMLEFighter') {
        return document.querySelector('#explanationArea')
            || document.querySelector('.answer-explanation-area')
            || document.querySelector('#explanation-course')
            || document.querySelector('.answer-stats-area')
            || document.querySelector('#questionArea');
    }

    if (platform === 'Brivona') {
        return document.querySelector('.commentary.show .commentary-content')
            || document.querySelector('.commentary.show h4')
            || document.querySelector('.commentary.show')
            || document.querySelector('.commentary .commentary-content')
            || document.querySelector('.commentary h4')
            || document.querySelector('.commentary')
            || document.querySelector('.answer-options')
            || document.querySelector('.question-stem')
            || document.querySelector('.uw-main');
    }

    if (platform === 'UWorld') {
        return document.querySelector('#first-explanation')
            || document.querySelector('#firstExplanation')
            || document.querySelector('#explanation-container')
            || document.querySelector('#questionExplanation')
            || document.querySelector('#questionExplanation #explanation')
            || document.querySelector('#questionText')
            || document.querySelector('#questionContent')
            || document.querySelector('#answerChoicesTable')
            || document.querySelector('#answerContainer')
            || document.querySelector('table.answer-container');
    }

    if (platform === 'AMBOSS') {
        const answeredMarker = document.querySelector(
            '[data-e2e-test-id="answer-theme-answerOptionCorrect"], [data-e2e-test-id="answer-theme-userFirstAttemptCorrect"]'
        );
        if (!answeredMarker) {
            return null;
        }
        return document.querySelector('[data-e2e-test-id="answerExplanation"] [class*="explanationContent"]')
            || document.querySelector('[data-e2e-test-id="answerExplanation"]')
            || document.querySelector('article[class*="questionContent"]')
            || document.querySelector('[data-e2e-test-id="question-selected-true"] [data-test-id="snippet"]')
            || document.querySelector('[data-e2e-test-id="questionSessionMainSpace"]');
    }

    if (platform === 'TrueLearn') {
        return document.querySelector('.explanation-container')
            || document.querySelector('.answer-explanations')
            || document.querySelector('.insight')
            || document.querySelector('.question-stem')
            || document.querySelector('.question-block')
            || document.querySelector('.answers-container');
    }

    if (platform === 'NBME' || platform === 'OpenQBank' || platform === 'Unknown') {
        return document.querySelector('[solution].SOLUTION, [solution].CSOLUTION, .SOLUTION, .CSOLUTION')
            || document.querySelector('.ITSMCAnswerText')
            || document.querySelector('.ITSStemText')
            || document.querySelector('.s-ques')
            || document.querySelector('section');
    }

    return document.querySelector('.ITSStemText')
        || document.querySelector('.s-ques')
        || document.querySelector('section');
};

const getInlineActionPlacement = (): { anchor: Element; position: InsertPosition } | null => {
    const platform = getPlatformFromLocation();

    if (platform === 'BluePrint') {
        const roshAnchor = document.querySelector('#answer_detail h2') || document.querySelector('#answer_detail > h2');
        if (roshAnchor) {
            return { anchor: roshAnchor, position: 'afterend' };
        }
        const roshDetail = document.querySelector('#answer_detail');
        if (roshDetail) {
            return { anchor: roshDetail, position: 'afterbegin' };
        }

        const explanationContent = document.querySelector('[data-testid="exam-answer-explanation-content"]');
        const card = explanationContent?.closest('[data-testid="collapsible-card"]') || explanationContent;
        if (!card) return null;
        return { anchor: card, position: 'beforebegin' };
    }

    if (platform === 'RoshReview') {
        const roshAnchor = document.querySelector('#answer_detail h2') || document.querySelector('#answer_detail > h2');
        if (roshAnchor) {
            return { anchor: roshAnchor, position: 'afterend' };
        }
        const roshDetail = document.querySelector('#answer_detail');
        if (roshDetail) {
            return { anchor: roshDetail, position: 'afterbegin' };
        }

        const anchor = document.querySelector('#question_detail');
        if (!anchor) return null;
        return { anchor, position: 'beforebegin' };
    }

    if (platform === 'USMLEFighter') {
        const expArea = document.querySelector('#explanationArea');
        if (expArea) {
            return { anchor: expArea, position: 'beforebegin' };
        }
        const statsArea = document.querySelector('.answer-stats-area');
        if (statsArea) {
            return { anchor: statsArea, position: 'afterend' };
        }
        const expWrapper = document.querySelector('#explanation_wrapper') || document.querySelector('.answer-explanation-area');
        if (expWrapper) {
            return { anchor: expWrapper, position: 'afterbegin' };
        }
    }

    if (platform === 'Brivona') {
        const commContent = document.querySelector('.commentary.show .commentary-content')
            || document.querySelector('.commentary .commentary-content');
        if (commContent) {
            return { anchor: commContent, position: 'beforebegin' };
        }
        const commH4 = document.querySelector('.commentary.show h4')
            || document.querySelector('.commentary h4');
        if (commH4) {
            return { anchor: commH4, position: 'afterend' };
        }
        const comm = document.querySelector('.commentary.show')
            || document.querySelector('.commentary');
        if (comm) {
            return { anchor: comm, position: 'afterbegin' };
        }
        const optionsArea = document.querySelector('.answer-options');
        if (optionsArea) {
            return { anchor: optionsArea, position: 'afterend' };
        }
        const stem = document.querySelector('.question-stem');
        if (stem) {
            return { anchor: stem, position: 'afterend' };
        }
    }

    if (platform === 'AMBOSS') {
        const answeredMarker = document.querySelector(
            '[data-e2e-test-id="answer-theme-answerOptionCorrect"], [data-e2e-test-id="answer-theme-userFirstAttemptCorrect"]'
        );
        if (!answeredMarker) {
            return null;
        }
        return { anchor: answeredMarker, position: 'beforeend' };
    }

    if (platform === 'NBME' || platform === 'OpenQBank' || platform === 'Unknown') {
        const explanationText = document.querySelector('.ITSMCAnswerText');
        const correctAnswerParagraph = explanationText
            ? Array.from(explanationText.querySelectorAll('p')).find((paragraph) => {
                const text = normalizeWhitespace(paragraph.textContent || '');
                return /^correct answer:/i.test(text);
            })
            : null;

        if (correctAnswerParagraph) {
            return { anchor: correctAnswerParagraph, position: 'afterend' };
        }

        if (explanationText) {
            return { anchor: explanationText, position: 'afterbegin' };
        }
    }

    const anchor = getInlineActionAnchor();
    if (!anchor) return null;
    return { anchor, position: 'beforebegin' };
};

const ensureInlineActionStyles = () => {
    if (document.getElementById(INLINE_ACTIONS_STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = INLINE_ACTIONS_STYLE_ID;
    style.textContent = `
      ${OPENQBANK_INJECTED_TOKEN_CSS}
      #${INLINE_ACTIONS_ROOT_ID}, #${INLINE_ACTIONS_ROOT_ID} * {
        box-sizing: border-box !important;
        user-select: text !important;
        -webkit-user-select: text !important;
        pointer-events: auto !important;
      }
      #${INLINE_ACTIONS_ROOT_ID} {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        width: 100%;
        margin: 14px auto 18px;
        font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 8px;
        width: 100%;
        align-items: center;
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-button {
        appearance: none !important;
        -webkit-appearance: none !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 6px !important;
        flex: 0 0 auto !important;
        width: auto !important;
        min-width: 0 !important;
        max-width: max-content !important;
        height: auto !important;
        min-height: 32px !important;
        max-height: 40px !important;
        border: 1px solid transparent !important;
        border-radius: 12px !important;
        padding: 8px 14px !important;
        font-size: 13px !important;
        line-height: 1.2 !important;
        font-weight: 700 !important;
        white-space: nowrap !important;
        text-align: center !important;
        vertical-align: middle !important;
        cursor: pointer !important;
        box-shadow: none;
        transition: transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease, background 120ms ease !important;
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-button[hidden] {
        display: none !important;
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-button:hover:not(:disabled) {
        transform: translateY(-1px) !important;
        box-shadow: 0 6px 14px rgba(15, 23, 42, 0.12) !important;
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-button:disabled {
        opacity: 0.62 !important;
        cursor: wait !important;
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-button img {
        width: 14px !important;
        height: 14px !important;
        min-width: 14px !important;
        min-height: 14px !important;
        max-width: 14px !important;
        max-height: 14px !important;
        margin: 0 5px 0 0 !important;
        padding: 0 !important;
        border: none !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        display: inline-block !important;
        vertical-align: middle !important;
        object-fit: contain !important;
        flex: 0 0 auto !important;
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-button svg {
        width: 15px !important;
        height: 15px !important;
        min-width: 15px !important;
        min-height: 15px !important;
        max-width: 15px !important;
        max-height: 15px !important;
        margin: 0 4px 0 0 !important;
        padding: 0 !important;
        fill: none !important;
        stroke: currentColor !important;
        stroke-width: 1.9 !important;
        stroke-linecap: round !important;
        stroke-linejoin: round !important;
        flex: 0 0 auto !important;
        display: inline-block !important;
        vertical-align: middle !important;
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-button--cards {
        background: #ffe5b4 !important;
        border-color: #ffe5b4 !important;
        color: #1f2937 !important;
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-button--cards:hover:not(:disabled) {
        background: #ffdab9 !important;
        border-color: #ffdab9 !important;
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-button--peach-cta {
        position: relative;
        z-index: 0;
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-button--peach-cta::before {
        content: '';
        position: absolute;
        inset: -3px;
        border-radius: 15px;
        padding: 3px;
        background: linear-gradient(90deg, #ffe5b4, #ffb347, #3b82f6, #ffb347, #ffe5b4);
        background-size: 300% 100%;
        -webkit-mask:
          linear-gradient(#fff 0 0) content-box,
          linear-gradient(#fff 0 0);
        -webkit-mask-composite: xor;
        mask:
          linear-gradient(#fff 0 0) content-box,
          linear-gradient(#fff 0 0);
        mask-composite: exclude;
        animation: ocb-peach-ring-shift 2.4s ease-in-out infinite;
        pointer-events: none;
        z-index: -1;
      }
      @keyframes ocb-peach-ring-shift {
        0%, 100% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-button--countdown {
        position: relative !important;
        border: 2px solid #ffdab9 !important;
        background:
          linear-gradient(90deg, #ffe5b4, #ffb347, #3b82f6) left center / var(--ocb-progress, 0%) 100% no-repeat,
          #fff7ed !important;
        opacity: 0.95 !important;
        cursor: not-allowed !important;
        color: #1f2937 !important;
        transition: background-size 0.15s ease-out;
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-button--countdown.ocb-button--peach-cta::before {
        display: none;
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-button--flag {
        background: #ffffff;
        border-color: #e5e7eb;
        color: #111827;
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-button--flag:hover:not(:disabled) {
        background: #f3f4f6;
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-status {
        width: 100%;
        text-align: center;
        min-height: 18px;
        font-size: 12px;
        color: #475569;
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-status[data-kind="success"] {
        color: #166534;
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-status[data-kind="error"] {
        color: #b91c1c;
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-status[data-kind="error"] a {
        color: #7c3aed;
        text-decoration: underline;
        font-weight: 600;
        margin-left: 3px;
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-status[data-kind="info"] {
        color: #1e40af;
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-preview-container {
        width: 100%;
        box-sizing: border-box;
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        padding: 16px;
        margin-top: 12px;
        box-shadow: 0 4px 12px rgba(15, 23, 42, 0.05);
        text-align: left;
        color: #111827;
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-preview-title {
        font-size: 14px;
        font-weight: 700;
        margin: 0 0 12px 0;
        color: #1f2937;
        display: flex;
        align-items: center;
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-disclaimer-wrapper {
        position: relative;
        display: inline-flex;
        align-items: center;
        z-index: 1100;
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-disclaimer-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        border: 1px solid #d1d5db;
        background: #f9fafb;
        color: #6b7280;
        cursor: pointer !important;
        padding: 0;
        transition: all 0.15s ease;
        box-sizing: border-box;
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-disclaimer-btn:hover,
      #${INLINE_ACTIONS_ROOT_ID} .ocb-disclaimer-btn:focus-visible,
      #${INLINE_ACTIONS_ROOT_ID} .ocb-disclaimer-wrapper.is-open .ocb-disclaimer-btn {
        color: var(--ocb-accent-blue-deep, #3b82f6);
        border-color: var(--ocb-accent-blue-baby, #b4ceff);
        background: var(--ocb-bg-surface, #ffffff);
        outline: none;
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-disclaimer-popover {
        display: none;
        position: absolute;
        top: calc(100% + 6px);
        left: 0;
        width: min(320px, 85vw);
        padding: 10px 12px;
        font-size: 11.5px;
        line-height: 1.45;
        color: #1f2937;
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 10px;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
        z-index: 1101;
        pointer-events: auto;
        text-align: left;
        font-weight: normal;
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-disclaimer-popover strong {
        display: block;
        margin-bottom: 3px;
        color: #111827;
        font-weight: 700;
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-disclaimer-wrapper:hover .ocb-disclaimer-popover,
      #${INLINE_ACTIONS_ROOT_ID} .ocb-disclaimer-wrapper:focus-within .ocb-disclaimer-popover,
      #${INLINE_ACTIONS_ROOT_ID} .ocb-disclaimer-wrapper.is-open .ocb-disclaimer-popover {
        display: block;
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-preview-card {
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        padding: 10px 14px;
        margin-bottom: 8px;
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-preview-card-field {
        font-size: 13px;
        color: #111827;
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-preview-field-label {
        font-weight: 700;
        color: #111827;
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-preview-card-notes {
        font-size: 11px;
        color: #4b5563;
        margin-top: 4px;
        font-style: italic;
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-preview-card-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-bottom: 6px;
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-tag-badge {
        font-size: 11px;
        font-weight: 600;
        padding: 2px 6px;
        border-radius: 4px;
        text-transform: capitalize;
        display: inline-block;
      }
      #${INLINE_ACTIONS_ROOT_ID} .vignette-breakdown {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-top: 6px;
      }
      #${INLINE_ACTIONS_ROOT_ID} .vignette-row {
        line-height: 1.5;
        font-size: 13px;
      }
      #${INLINE_ACTIONS_ROOT_ID} .vignette-label {
        font-weight: 700;
        color: #111827;
        margin-right: 4px;
      }
      #${INLINE_ACTIONS_ROOT_ID} .vignette-value {
        color: #374151;
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-reveal-btn,
      #${INLINE_ACTIONS_ROOT_ID} .ocb-add-library-btn,
      #${INLINE_ACTIONS_ROOT_ID} .ocb-report-btn {
        z-index: 1000000 !important;
        pointer-events: auto !important;
        cursor: pointer !important;
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-add-library-btn,
      .ocb-add-library-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        padding: 5px 12px;
        font-size: 11.5px;
        font-weight: 700;
        font-family: inherit;
        border-radius: 12px;
        background-color: #ffe5b4;
        color: #1f2937;
        border: 1px solid #fcd34d;
        cursor: pointer !important;
        text-decoration: none;
        line-height: 1;
        letter-spacing: 0.01em;
        transition: transform 0.15s ease, background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-add-library-btn:hover:not(:disabled):not(.is-added),
      .ocb-add-library-btn:hover:not(:disabled):not(.is-added) {
        background-color: #ffdab9;
        border-color: #fbbf24;
        transform: translateY(-1px);
        box-shadow: 0 2px 6px rgba(245, 158, 11, 0.15);
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-add-library-btn:active:not(:disabled):not(.is-added),
      .ocb-add-library-btn:active:not(:disabled):not(.is-added) {
        transform: translateY(0);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
      }
      .ocb-add-library-btn.is-animating {
        animation: ocb-checkout-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-add-library-btn.is-added,
      .ocb-add-library-btn.is-added {
        background-color: #ecfdf5 !important;
        border-color: #10b981 !important;
        color: #065f46 !important;
        cursor: default !important;
        transform: none !important;
        box-shadow: none !important;
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-report-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        padding: 0;
        border-radius: 8px;
        background: transparent;
        border: 1px solid #e5e7eb;
        color: #9ca3af;
        cursor: pointer !important;
        transition: all 0.15s ease;
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-report-btn:hover {
        background: #fef2f2;
        border-color: #fca5a5;
        color: #dc2626;
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-report-btn.is-reported {
        background: #fef2f2;
        border-color: #fca5a5;
        color: #dc2626;
        cursor: default !important;
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-add-library-btn svg,
      .ocb-add-library-btn svg {
        width: 14px !important;
        height: 14px !important;
        max-width: 14px !important;
        max-height: 14px !important;
        stroke: currentColor !important;
        fill: none !important;
        flex: 0 0 auto !important;
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-report-btn svg {
        width: 13px !important;
        height: 13px !important;
        max-width: 13px !important;
        max-height: 13px !important;
        stroke: currentColor !important;
        fill: none !important;
        flex: 0 0 auto !important;
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-preview-header img {
        height: 18px !important;
        max-height: 18px !important;
        width: 18px !important;
        max-width: 18px !important;
        margin: 0 !important;
        padding: 0 !important;
        display: block !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        border: none !important;
        object-fit: contain !important;
      }
      @keyframes ocb-checkout-pop {
        0% { transform: scale(1); }
        40% { transform: scale(0.92); }
        75% { transform: scale(1.05); }
        100% { transform: scale(1); }
      }
      #ocb-report-modal {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(15, 23, 42, 0.5);
        backdrop-filter: blur(2px);
      }
      #ocb-report-modal .ocb-modal-box {
        background: #ffffff;
        border-radius: 20px;
        border: 1px solid #e5e7eb;
        width: min(440px, 92vw);
        padding: 22px;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        box-sizing: border-box;
      }
      #ocb-report-modal .ocb-modal-title {
        font-size: 16px;
        font-weight: 700;
        color: #111827;
        margin: 0;
      }
      #ocb-report-modal .ocb-chip {
        display: inline-flex;
        align-items: center;
        padding: 5px 11px;
        border-radius: 9999px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        background: #f3f4f6;
        border: 1px solid #e5e7eb;
        color: #4b5563;
        transition: all 0.15s ease;
        user-select: none;
      }
      #ocb-report-modal .ocb-chip:hover {
        background: #e5e7eb;
      }
      #ocb-report-modal .ocb-chip.is-selected {
        background: #eff6ff;
        border-color: #93c5fd;
        color: #1d4ed8;
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-loading-box {
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: 100%;
      }
      #${INLINE_ACTIONS_ROOT_ID} .ocb-loading-line {
        height: 12px;
        background: linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%);
        background-size: 200% 100%;
        animation: ocb-loading-skeleton 1.5s infinite;
        border-radius: 4px;
      }
      @keyframes ocb-loading-skeleton {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
      @keyframes ocb-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
            @media (prefers-color-scheme: dark) {
                #${INLINE_ACTIONS_ROOT_ID} .ocb-preview-container {
                    background: var(--ocb-bg-surface, #0f172a);
                    border-color: var(--ocb-border, #243047);
                    color: #ffffff !important;
                }
                #${INLINE_ACTIONS_ROOT_ID} .ocb-preview-title,
                #${INLINE_ACTIONS_ROOT_ID} .ocb-preview-card-field,
                #${INLINE_ACTIONS_ROOT_ID} .ocb-preview-field-label,
                #${INLINE_ACTIONS_ROOT_ID} .vignette-label,
                #${INLINE_ACTIONS_ROOT_ID} .vignette-value {
                    color: #ffffff !important;
                }
                #${INLINE_ACTIONS_ROOT_ID} .ocb-preview-card {
                    background: var(--ocb-bg-surface-alt, #16233c) !important;
                    border-color: var(--ocb-border, #243047) !important;
                }
                #${INLINE_ACTIONS_ROOT_ID} .ocb-preview-card-notes {
                    color: var(--ocb-text-muted, #94a3b8) !important;
                }
                #${INLINE_ACTIONS_ROOT_ID} .ocb-brand-name {
                    color: #ffffff !important;
                }
                #${INLINE_ACTIONS_ROOT_ID} .ocb-brand-dot {
                    color: #ffe5b4 !important;
                }
                #${INLINE_ACTIONS_ROOT_ID} .ocb-disclaimer-btn {
                    border-color: #374151;
                    background: #1f2937;
                    color: #9ca3af;
                }
                #${INLINE_ACTIONS_ROOT_ID} .ocb-disclaimer-btn:hover,
                #${INLINE_ACTIONS_ROOT_ID} .ocb-disclaimer-btn:focus-visible,
                #${INLINE_ACTIONS_ROOT_ID} .ocb-disclaimer-wrapper.is-open .ocb-disclaimer-btn {
                    color: var(--ocb-accent-blue-deep, #3b82f6);
                    border-color: var(--ocb-accent-blue-deep, #3b82f6);
                    background: #1f2937;
                }
                #${INLINE_ACTIONS_ROOT_ID} .ocb-disclaimer-popover {
                    background: #1f2937 !important;
                    border-color: #374151 !important;
                    color: #e5e7eb !important;
                    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4) !important;
                }
                #${INLINE_ACTIONS_ROOT_ID} .ocb-disclaimer-popover strong {
                    color: #ffffff !important;
                }
                #${INLINE_ACTIONS_ROOT_ID} .ocb-report-btn {
                    border-color: #374151;
                    color: #9ca3af;
                }
                #${INLINE_ACTIONS_ROOT_ID} .ocb-report-btn:hover {
                    background: rgba(220, 38, 38, 0.15);
                    border-color: #dc2626;
                    color: #f87171;
                }
            }
            #${INLINE_ACTIONS_ROOT_ID}.ocb-dark .ocb-preview-container {
                background: var(--ocb-bg-surface, #0f172a);
                border-color: var(--ocb-border, #243047);
                color: #ffffff !important;
            }
            #${INLINE_ACTIONS_ROOT_ID}.ocb-dark .ocb-preview-title,
            #${INLINE_ACTIONS_ROOT_ID}.ocb-dark .ocb-preview-card-field,
            #${INLINE_ACTIONS_ROOT_ID}.ocb-dark .ocb-preview-field-label,
            #${INLINE_ACTIONS_ROOT_ID}.ocb-dark .vignette-label,
            #${INLINE_ACTIONS_ROOT_ID}.ocb-dark .vignette-value {
                color: #ffffff !important;
            }
            #${INLINE_ACTIONS_ROOT_ID}.ocb-dark .ocb-preview-card {
                background: var(--ocb-bg-surface-alt, #16233c) !important;
                border-color: var(--ocb-border, #243047) !important;
            }
            #${INLINE_ACTIONS_ROOT_ID}.ocb-dark .ocb-preview-card-notes {
                color: var(--ocb-text-muted, #94a3b8) !important;
            }
            #${INLINE_ACTIONS_ROOT_ID}.ocb-dark .ocb-brand-name {
                color: #ffffff !important;
            }
            #${INLINE_ACTIONS_ROOT_ID}.ocb-dark .ocb-brand-dot {
                color: #ffe5b4 !important;
            }
            #${INLINE_ACTIONS_ROOT_ID}.ocb-dark .ocb-disclaimer-btn {
                border-color: #374151;
                background: #1f2937;
                color: #9ca3af;
            }
            #${INLINE_ACTIONS_ROOT_ID}.ocb-dark .ocb-disclaimer-btn:hover,
            #${INLINE_ACTIONS_ROOT_ID}.ocb-dark .ocb-disclaimer-btn:focus-visible,
            #${INLINE_ACTIONS_ROOT_ID}.ocb-dark .ocb-disclaimer-wrapper.is-open .ocb-disclaimer-btn {
                color: var(--ocb-accent-blue-deep, #3b82f6);
                border-color: var(--ocb-accent-blue-deep, #3b82f6);
                background: #1f2937;
            }
            #${INLINE_ACTIONS_ROOT_ID}.ocb-dark .ocb-disclaimer-popover {
                background: #1f2937 !important;
                border-color: #374151 !important;
                color: #e5e7eb !important;
                box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4) !important;
            }
            #${INLINE_ACTIONS_ROOT_ID}.ocb-dark .ocb-disclaimer-popover strong {
                color: #ffffff !important;
            }
            #${INLINE_ACTIONS_ROOT_ID}.ocb-dark .ocb-report-btn {
                border-color: #374151;
                color: #9ca3af;
            }
            #${INLINE_ACTIONS_ROOT_ID}.ocb-dark .ocb-report-btn:hover {
                background: rgba(220, 38, 38, 0.15);
                border-color: #dc2626;
                color: #f87171;
            }
      @media (max-width: 680px) {
        #${INLINE_ACTIONS_ROOT_ID} .ocb-button {
          flex: 0 0 auto !important;
          justify-content: center;
        }
        #${INLINE_ACTIONS_ROOT_ID} .ocb-actions {
          justify-content: center;
        }
      }
      `;
    document.head.appendChild(style);
};

const SUPPORT_CONTACT_URL = 'https://openqbank.com/support';

const buildErrorStatusHtml = (msg: string): string => {
    const escaped = msg
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    return `${escaped}. Believe this is an error? <a href="${SUPPORT_CONTACT_URL}" target="_blank" rel="noopener noreferrer">Contact us.</a>`;
};

const setInlineStatus = (status: string, kind: InlineActionState['statusKind'] = 'info') => {
    inlineActionState.status = status;
    inlineActionState.statusKind = kind;
    renderInlineActions();
};

const createInlineActionButton = (action: 'cards' | 'flag') => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `ocb-button ocb-button--${action}`;
    button.dataset.ocbAction = action;
    return button;
};

const openReportCardModal = (cardIndex: number, triggerBtn?: HTMLElement) => {
    let modal = document.getElementById('ocb-report-modal');
    if (modal) modal.remove();

    const parsedCards = inlineActionState.generatedCardsText
        ? parseCardsPayload(inlineActionState.generatedCardsText).cards
        : [];
    const visibleCards = parsedCards.filter((c) => !isLeadInCard(c));
    const targetCard = visibleCards[cardIndex];

    modal = document.createElement('div');
    modal.id = 'ocb-report-modal';

    const issueOptions = [
        'Inaccurate / Hallucination',
        'Wrong Answer',
        'Formatting Issue',
        'Typo / Grammar',
        'Too Easy / Vague',
    ];

    modal.innerHTML = `
        <div class="ocb-modal-box">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
                <h3 class="ocb-modal-title" style="display: flex; align-items: center; gap: 6px;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
                    Report Flashcard
                </h3>
                <button type="button" id="ocb-report-close-btn" style="background: none; border: none; font-size: 20px; line-height: 1; cursor: pointer; color: #9ca3af; padding: 4px;">&times;</button>
            </div>
            <div style="margin-bottom: 14px;">
                <label style="display: block; font-size: 12px; font-weight: 700; color: #374151; margin-bottom: 6px;">Quality Rating</label>
                <div style="display: flex; gap: 8px;">
                    <button type="button" class="ocb-rating-btn is-active" data-rating="needs_work" style="flex: 1; padding: 6px 12px; border-radius: 10px; font-size: 12.5px; font-weight: 700; cursor: pointer; background: #fee2e2; border: 1.5px solid #f87171; color: #991b1b;">Needs Work</button>
                    <button type="button" class="ocb-rating-btn" data-rating="good" style="flex: 1; padding: 6px 12px; border-radius: 10px; font-size: 12.5px; font-weight: 700; cursor: pointer; background: #f3f4f6; border: 1.5px solid #e5e7eb; color: #4b5563;">Good / Minor</button>
                </div>
            </div>
            <div style="margin-bottom: 14px;">
                <label style="display: block; font-size: 12px; font-weight: 700; color: #374151; margin-bottom: 6px;">Specific Issues</label>
                <div id="ocb-report-issues-container" style="display: flex; flex-wrap: wrap; gap: 6px;">
                    ${issueOptions.map((opt) => `<span class="ocb-chip" data-issue="${opt}">${opt}</span>`).join('')}
                </div>
            </div>
            <div style="margin-bottom: 18px;">
                <label style="display: block; font-size: 12px; font-weight: 700; color: #374151; margin-bottom: 6px;">Additional Details (Optional)</label>
                <textarea id="ocb-report-comments" rows="3" placeholder="What should be corrected or improved?" style="width: 100%; border: 1px solid #d1d5db; border-radius: 10px; padding: 8px 10px; font-size: 12.5px; font-family: inherit; resize: vertical; box-sizing: border-box; outline: none;"></textarea>
            </div>
            <div style="display: flex; align-items: center; justify-content: flex-end; gap: 8px;">
                <button type="button" id="ocb-report-cancel-btn" style="padding: 7px 14px; border-radius: 10px; font-size: 12.5px; font-weight: 600; cursor: pointer; background: #ffffff; border: 1px solid #d1d5db; color: #374151;">Cancel</button>
                <button type="button" id="ocb-report-submit-btn" style="padding: 7px 16px; border-radius: 10px; font-size: 12.5px; font-weight: 700; cursor: pointer; background: #ffe5b4; border: 1px solid #ffd488; color: #1f2937;">Submit Report</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => modal?.remove();
    modal.querySelector('#ocb-report-close-btn')?.addEventListener('click', closeModal);
    modal.querySelector('#ocb-report-cancel-btn')?.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    let currentRating = 'needs_work';
    const ratingBtns = modal.querySelectorAll<HTMLButtonElement>('.ocb-rating-btn');
    ratingBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
            currentRating = btn.dataset.rating || 'needs_work';
            ratingBtns.forEach((b) => {
                const isActive = b.dataset.rating === currentRating;
                if (isActive) {
                    b.classList.add('is-active');
                    if (currentRating === 'needs_work') {
                        b.style.background = '#fee2e2';
                        b.style.borderColor = '#f87171';
                        b.style.color = '#991b1b';
                    } else {
                        b.style.background = '#d1fae5';
                        b.style.borderColor = '#34d399';
                        b.style.color = '#065f46';
                    }
                } else {
                    b.classList.remove('is-active');
                    b.style.background = '#f3f4f6';
                    b.style.borderColor = '#e5e7eb';
                    b.style.color = '#4b5563';
                }
            });
        });
    });

    const selectedIssues = new Set<string>();
    modal.querySelectorAll('.ocb-chip').forEach((chip) => {
        chip.addEventListener('click', () => {
            const issue = chip.getAttribute('data-issue') || '';
            if (selectedIssues.has(issue)) {
                selectedIssues.delete(issue);
                chip.classList.remove('is-selected');
            } else {
                selectedIssues.add(issue);
                chip.classList.add('is-selected');
            }
        });
    });

    const submitBtn = modal.querySelector<HTMLButtonElement>('#ocb-report-submit-btn');
    submitBtn?.addEventListener('click', () => {
        if (!inlineActionState.questionId) return;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';

        const comment = (modal?.querySelector<HTMLTextAreaElement>('#ocb-report-comments')?.value || '').trim();
        void requestReportCard({
            questionId: inlineActionState.questionId,
            cardIndex,
            rating: currentRating,
            issues: Array.from(selectedIssues),
            comment,
            cardFront: targetCard?.front || '',
            cardBack: targetCard?.back || '',
            topic: targetCard?.organSystem || '',
        }).then((res) => {
            if (res?.success) {
                if (triggerBtn) {
                    triggerBtn.classList.add('is-reported');
                    triggerBtn.setAttribute('title', 'Reported');
                }
                closeModal();
                setInlineStatus('Report submitted. Thank you!', 'success');
            } else {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Submit Report';
                alert('Failed to submit report. Please try again.');
            }
        }).catch(() => {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Report';
            alert('Failed to submit report. Please try again.');
        });
    });
};

const ensureInlineActionsRoot = () => {
    let root = document.getElementById(INLINE_ACTIONS_ROOT_ID) as HTMLDivElement | null;
    if (root) return root;

    root = document.createElement('div');
    root.id = INLINE_ACTIONS_ROOT_ID;

    const actions = document.createElement('div');
    actions.className = 'ocb-actions';
    actions.append(
        createInlineActionButton('cards'),
        createInlineActionButton('flag'),
    );

    const status = document.createElement('div');
    status.className = 'ocb-status';
    status.dataset.kind = 'idle';

    const previewContainer = document.createElement('div');
    previewContainer.className = 'ocb-preview-container';
    previewContainer.hidden = true;

    root.append(actions, status, previewContainer);
    root.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;

        const addBtn = target.closest<HTMLButtonElement>('.ocb-add-library-btn');
        if (addBtn && !addBtn.disabled && !addBtn.classList.contains('is-added')) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            const cardIdx = parseInt(addBtn.dataset.cardIndex || '0', 10);
            const questionId = inlineActionState.questionId;
            if (questionId) {
                addBtn.disabled = true;
                addBtn.classList.add('is-animating');
                addBtn.innerHTML = `<span>Adding...</span>`;
                void (async () => {
                    try {
                        const questionData = await getQuestionContent();
                        const res = await requestAddToLibrary(questionId, cardIdx, questionData);
                        if (res?.success) {
                            inlineActionState.addedCardIndices.add(cardIdx);
                            const cached = questionStateCache.get(questionId);
                            if (cached) {
                                if (!cached.addedCardIndices) cached.addedCardIndices = new Set();
                                cached.addedCardIndices.add(cardIdx);
                            }
                            addBtn.classList.remove('is-animating');
                            addBtn.classList.add('is-added');
                            addBtn.disabled = true;
                            addBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span>Added to Library</span>`;
                            renderInlineActions();
                        } else {
                            addBtn.classList.remove('is-animating');
                            addBtn.disabled = false;
                            addBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span>Add to Library</span>`;
                        }
                    } catch (e) {
                        console.error('Failed to add card to library:', e);
                        addBtn.classList.remove('is-animating');
                        addBtn.disabled = false;
                        addBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span>Add to Library</span>`;
                    }
                })();
            }
            return;
        }

        const reportBtn = target.closest<HTMLButtonElement>('.ocb-report-btn');
        if (reportBtn) {
            const cardIdx = parseInt(reportBtn.dataset.cardIndex || '0', 10);
            openReportCardModal(cardIdx, reportBtn);
            return;
        }

        const revealBtn = target.closest<HTMLButtonElement>('.ocb-reveal-btn');
        if (revealBtn) {
            const cardIdx = parseInt(revealBtn.dataset.cardIndex || '0', 10);
            if (inlineActionState.revealedCardIndices.has(cardIdx)) {
                inlineActionState.revealedCardIndices.delete(cardIdx);
            } else {
                inlineActionState.revealedCardIndices.add(cardIdx);
            }
            renderInlineActions();
            return;
        }

        const button = target.closest<HTMLButtonElement>('[data-ocb-action]');
        if (!button || button.disabled || !root?.contains(button)) return;

        const action = button.dataset.ocbAction;
        if (action === 'cards') {
            if (inlineActionState.generatedCardsText) {
                inlineActionState.showPreview = true;
                setInlineStatus('Cards generated successfully.', 'success');
                renderInlineActions();
                return;
            }
            void handleInlineGenerateCards();
            return;
        }
        if (action === 'flag') {
            void handleInlineFlagQuestion();
        }
    });

    return root;
};

// ponytail: per-question cache so navigating away and back restores correct cards for each question
const questionStateCache = new Map<string, {
    generatedCardsText: string | null;
    lockedCount: number;
    contentScope: 'full' | 'partial' | null;
    cardsDoneQuestionId: string | null;
    flagDoneQuestionId: string | null;
    showPreview: boolean;
    activeCardIndex: number;
    revealedCardIndices: Set<number>;
    modalZoomLevel?: number;
    userOwnedPreview?: boolean;
    addedCardIndices?: Set<number>;
}>();

const polledQuestionIds = new Set<string>();
const activeCardPolls = new Set<string>();
/** Bumps when user starts Generate so in-flight background checks cannot clobber preview state. */
const cardCheckEpochByQuestion = new Map<string, number>();
let cardsProgressTickerId: number | null = null;

// Progress bar fills over the generation timeout window.
const CARD_POLL_MAX_CONSECUTIVE_ERRORS = 5;
const AUTH_STATUS_STORAGE_KEY = 'ocb_extension_auth_status';

const stopCardsProgressTicker = () => {
    if (cardsProgressTickerId != null) {
        window.clearInterval(cardsProgressTickerId);
        cardsProgressTickerId = null;
    }
};

const paintCardsButtonProgress = (progress: number, label: string) => {
    inlineActionState.countdownProgress = progress;
    inlineActionState.countdownText = label;

    const rootEl = document.getElementById(INLINE_ACTIONS_ROOT_ID);
    const cardsBtn = rootEl?.querySelector('.ocb-button--cards') as HTMLButtonElement | null;
    if (!cardsBtn) return;

    cardsBtn.style.setProperty('--ocb-progress', `${progress.toFixed(1)}%`);
    cardsBtn.classList.add('ocb-button--countdown');
    cardsBtn.classList.remove('ocb-button--peach-cta');
    cardsBtn.disabled = true;
    cardsBtn.innerHTML = label;
};

const startCardsProgressTicker = (label: string, resetStart = false) => {
    stopCardsProgressTicker();
    if (resetStart || inlineActionState.countdownStartedAt == null) {
        inlineActionState.countdownStartedAt = Date.now();
    }
    const startedAt = inlineActionState.countdownStartedAt;
    paintCardsButtonProgress(calculateCardPollProgress(Date.now() - startedAt), label);
    cardsProgressTickerId = window.setInterval(() => {
        if (!inlineActionState.cardsPending || inlineActionState.generatedCardsText) {
            stopCardsProgressTicker();
            return;
        }
        const origin = inlineActionState.countdownStartedAt ?? startedAt;
        paintCardsButtonProgress(calculateCardPollProgress(Date.now() - origin), label);
    }, 100);
};

const purgeAllLocalGeneratedCards = async () => {
    questionStateCache.clear();
    inlineActionState.generatedCardsText = null;
    inlineActionState.lockedCount = 0;
    inlineActionState.contentScope = null;
    inlineActionState.cardsDoneQuestionId = null;
    inlineActionState.showPreview = false;
};

const persistGeneratedCardsLocally = (
    questionId: string,
    cards: string,
    opts?: { lockedCount?: number },
) => {
    const lockedCount = opts?.lockedCount ?? inlineActionState.lockedCount ?? 0;
    questionStateCache.set(questionId, {
        generatedCardsText: cards,
        lockedCount,
        contentScope: null,
        cardsDoneQuestionId: questionId,
        flagDoneQuestionId: questionId,
        showPreview: true,
        activeCardIndex: inlineActionState.questionId === questionId ? inlineActionState.activeCardIndex : 0,
        revealedCardIndices: inlineActionState.questionId === questionId
            ? new Set(inlineActionState.revealedCardIndices)
            : new Set<number>(),
        modalZoomLevel: inlineActionState.questionId === questionId
            ? inlineActionState.modalZoomLevel
            : 0.95,
        userOwnedPreview: inlineActionState.questionId === questionId
            ? inlineActionState.userOwnedPreview
            : false,
        addedCardIndices: inlineActionState.questionId === questionId
            ? new Set(inlineActionState.addedCardIndices)
            : new Set<number>(),
    });
};

const isOpenQbankCoreUser = (): boolean =>
    isOpenQbankTier(inlineActionState.userType, inlineActionState.userTier);

/** Restore openQbank core inline preview from per-question session cache (not chrome.storage). */
const hydrateOpenQbankCorePreviewFromSession = (questionId: string): boolean => {
    if (!isOpenQbankCoreUser()) return false;
    const mem = questionStateCache.get(questionId);
    if (!mem?.generatedCardsText) return false;
    inlineActionState.generatedCardsText = mem.generatedCardsText;
    inlineActionState.lockedCount = mem.lockedCount || 0;
    inlineActionState.contentScope = mem.contentScope;
    inlineActionState.cardsDoneQuestionId = questionId;
    inlineActionState.flagDoneQuestionId = mem.flagDoneQuestionId ?? questionId;
    inlineActionState.showPreview = mem.showPreview !== false;
    inlineActionState.userOwnedPreview = Boolean(mem.userOwnedPreview);
    if (mem.addedCardIndices) {
        inlineActionState.addedCardIndices = new Set(mem.addedCardIndices);
    }
    return true;
};

const readGeneratedCardsLocally = async (questionId: string): Promise<string | null> => {
    const memory = questionStateCache.get(questionId);
    if (memory?.generatedCardsText) {
        if (inlineActionState.questionId === questionId) {
            inlineActionState.lockedCount = memory.lockedCount || 0;
            inlineActionState.contentScope = memory.contentScope;
            inlineActionState.userOwnedPreview = Boolean(memory.userOwnedPreview);
        }
        return memory.generatedCardsText;
    }
    return null;
};
const updateInlineQuestionState = (questionId: string | null) => {
    if (inlineActionState.questionId === questionId) return;

    // Save current question's completed state before switching
    const prev = inlineActionState.questionId;
    if (prev) {
        questionStateCache.set(prev, {
            generatedCardsText: inlineActionState.generatedCardsText,
            lockedCount: inlineActionState.lockedCount,
            contentScope: inlineActionState.contentScope,
            cardsDoneQuestionId: inlineActionState.cardsDoneQuestionId,
            flagDoneQuestionId: inlineActionState.flagDoneQuestionId,
            showPreview: inlineActionState.showPreview,
            activeCardIndex: inlineActionState.activeCardIndex,
            revealedCardIndices: new Set(inlineActionState.revealedCardIndices),
            modalZoomLevel: inlineActionState.modalZoomLevel,
            userOwnedPreview: inlineActionState.userOwnedPreview,
            addedCardIndices: new Set(inlineActionState.addedCardIndices),
        });
    }

    inlineActionState.questionId = questionId;
    // Keep the pending flag if a poll is still running for the question we're switching to
    // (Rosh Review re-renders the explanation panel mid-extract and can briefly null the fingerprint).
    inlineActionState.cardsPending = Boolean(questionId && activeCardPolls.has(questionId));
    inlineActionState.flagPending = false;
    inlineActionState.status = '';
    inlineActionState.statusKind = 'idle';

    // Restore cached state if returning to a previously-visited question
    const cached = questionId ? questionStateCache.get(questionId) : null;
    if (cached) {
        inlineActionState.generatedCardsText = cached.generatedCardsText;
        inlineActionState.lockedCount = cached.lockedCount || 0;
        inlineActionState.contentScope = cached.contentScope;
        inlineActionState.cardsDoneQuestionId = cached.cardsDoneQuestionId;
        inlineActionState.flagDoneQuestionId = cached.flagDoneQuestionId;
        inlineActionState.showPreview = cached.showPreview || inlineActionState.cardsPending;
        inlineActionState.activeCardIndex = cached.activeCardIndex;
        inlineActionState.revealedCardIndices = new Set(cached.revealedCardIndices);
        inlineActionState.addedCardIndices = cached.addedCardIndices ? new Set(cached.addedCardIndices) : new Set<number>();
        inlineActionState.modalZoomLevel = cached.modalZoomLevel || 0.95;
        inlineActionState.userOwnedPreview = Boolean(cached.userOwnedPreview);
    } else {
        inlineActionState.generatedCardsText = null;
        inlineActionState.lockedCount = 0;
        inlineActionState.contentScope = null;
        inlineActionState.userOwnedPreview = false;
        inlineActionState.showPreview = inlineActionState.cardsPending;
        inlineActionState.activeCardIndex = 0;
        inlineActionState.revealedCardIndices = new Set<number>();
        inlineActionState.addedCardIndices = new Set<number>();
        inlineActionState.modalZoomLevel = 0.95;
    }
};

const getSafeExtensionUrl = (path: string): string => {
    try {
        if (typeof chrome !== 'undefined' && chrome?.runtime && typeof chrome.runtime.getURL === 'function') {
            return chrome.runtime.getURL(path);
        }
    } catch {
        // Fallback on invalidation
    }
    return '';
};

const renderInlineActions = () => {
    if (!canRenderInlineActionsInCurrentWindow()) return;

    ensureInlineActionStyles();
    const placement = getInlineActionPlacement();
    const fingerprint = getQuestionFingerprint();

    if (!placement || !fingerprint?.questionId) {
        document.getElementById(INLINE_ACTIONS_ROOT_ID)?.remove();
        removeCustomCardFab();
        // Host pages (UWorld, etc.) briefly drop fingerprint during DOM re-renders — do not wipe card state.
        return;
    }

    updateInlineQuestionState(fingerprint.questionId);

    if (
        isOpenQbankCoreUser()
        && !inlineActionState.generatedCardsText
        && fingerprint.questionId
    ) {
        hydrateOpenQbankCorePreviewFromSession(fingerprint.questionId);
    } else if (
        isOpenQbankCoreUser()
        && inlineActionState.generatedCardsText
        && inlineActionState.cardsDoneQuestionId === fingerprint.questionId
    ) {
        inlineActionState.showPreview = true;
    }

    const isOpenQbank = Boolean(
        inlineActionState.statusResolved &&
        isOpenQbankTier(inlineActionState.userType, inlineActionState.userTier)
    );
    const fabShouldShow = Boolean(
        fingerprint?.questionId &&
        isOpenQbank &&
        inlineActionState.customCardFabEnabled === true
    );

    updateCustomCardFabVisibility(fabShouldShow, {
        getQuestionData: getQuestionContent,
        getFingerprint: getQuestionFingerprint,
        getStatus: () => ({
            isOpenQbankUser: isOpenQbank,
            isPro: isOpenQbankPro(inlineActionState.userType, inlineActionState.userTier),
            isAdmin: isOpenQbankAdmin(inlineActionState.userType, inlineActionState.userTier),
            totalCards: inlineActionState.totalCards || 0,
            customAnkiEnabled: Boolean(inlineActionState.customAnkiEnabled),
        }),
        sendRequest: sendOpenQBankRequest,
        canonicalOrganSystems: CANONICAL_ORGAN_SYSTEMS,
        resolveOrganSystem,
        buildQuestionDataPayload,
    });

    if (inlineActionState.customAnkiEnabled === null || !inlineActionState.statusResolved) {
        void refreshCustomAnkiAccess().then(() => renderInlineActions());
    } else if (
        (inlineActionState.customAnkiEnabled === true || false)
        && inlineActionState.generatedCardsText === null
        && !inlineActionState.cardsPending
    ) {
        void checkExistingCards();
    }

    const root = ensureInlineActionsRoot();

    const shouldReposition = (() => {
        if (!root?.parentElement) return true;
        if (placement.position === 'beforebegin') {
            return root.nextElementSibling !== placement.anchor;
        }
        if (placement.position === 'afterend') {
            return root.previousElementSibling !== placement.anchor;
        }
        if (placement.position === 'afterbegin') {
            return placement.anchor.firstElementChild !== root;
        }
        if (placement.position === 'beforeend') {
            return placement.anchor.lastElementChild !== root;
        }
        return false;
    })();

    if (shouldReposition) {
        placement.anchor.insertAdjacentElement(placement.position, root);
    }

    const isDarkSurface = isExtensionDarkSurface() || (() => {
        try {
            if (document.documentElement.classList.contains('dark') || document.body?.classList.contains('dark')) return true;
            const bg = window.getComputedStyle(document.body).backgroundColor;
            const match = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            if (match) {
                const [r, g, b] = [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
                if ((r * 299 + g * 587 + b * 114) / 1000 < 128 && (r + g + b > 0 || bg.startsWith('rgb(0'))) {
                    return true;
                }
            }
        } catch {
            // ignore
        }
        return false;
    })();
    root.classList.toggle('ocb-dark', isDarkSurface);

    const isHigherTier = inlineActionState.customAnkiEnabled === true;
    const flagDoneForQuestion = inlineActionState.flagDoneQuestionId === inlineActionState.questionId;

    const cardsButton = root.querySelector<HTMLButtonElement>('[data-ocb-action="cards"]');
    const flagButton = root.querySelector<HTMLButtonElement>('[data-ocb-action="flag"]');
    const status = root.querySelector<HTMLDivElement>('.ocb-status');
    const previewContainer = root.querySelector<HTMLDivElement>('.ocb-preview-container');
    const actionsDiv = root.querySelector<HTMLDivElement>('.ocb-actions');

    const parsedCardsList = inlineActionState.generatedCardsText
        ? parseCardsPayload(inlineActionState.generatedCardsText).cards
        : [];
    const visibleCardsList = parsedCardsList.filter((c) => !isLeadInCard(c));
    const hasCardsDisplayed = Boolean(
        inlineActionState.showPreview &&
        inlineActionState.generatedCardsText &&
        visibleCardsList.length > 0
    );

    if (cardsButton) {
        const isOpenQbank = isOpenQbankTier(inlineActionState.userType, inlineActionState.userTier);
        const isOpenQbankFreeUser = isOpenQbankFree(inlineActionState.userType, inlineActionState.userTier);
        const showCards = isOpenQbank
            ? (isOpenQbankFreeUser && !hasCardsDisplayed) || shouldShowOpenQbankGenerateButton(
                Boolean(inlineActionState.customAnkiEnabled),
                hasCardsDisplayed,
                inlineActionState.aiFlashcardsEnabled !== false,
            )
            : isHigherTier && !hasCardsDisplayed;
        if (showCards) {
            cardsButton.hidden = false;
            cardsButton.style.removeProperty('display');
            cardsButton.disabled = isOpenQbankFreeUser || inlineActionState.cardsPending;
            if (inlineActionState.cardsPending) {
                cardsButton.classList.add('ocb-button--countdown');
                cardsButton.classList.remove('ocb-button--peach-cta');
                cardsButton.style.setProperty('--ocb-progress', `${(inlineActionState.countdownProgress ?? 0).toFixed(1)}%`);
                cardsButton.innerHTML = `Generating flashcard...`;
            } else {
                cardsButton.classList.remove('ocb-button--countdown');
                cardsButton.classList.remove('ocb-button--peach-cta');
                cardsButton.style.removeProperty('--ocb-progress');
                cardsButton.innerHTML = isOpenQbankFreeUser
                    ? 'Upgrade to Generate Flashcards'
                    : `<img src="${getSafeExtensionUrl('logo.png')}" alt="openQbank" style="height: 14px !important; width: 14px !important; max-width: 14px !important; max-height: 14px !important; vertical-align: middle !important; margin: 0 5px 0 0 !important; display: inline-block !important; object-fit: contain !important;" />Generate Flashcard`;
            }
        } else {
            cardsButton.hidden = true;
            cardsButton.style.setProperty('display', 'none', 'important');
        }
    }

    if (flagButton) {
        if (isHigherTier) {
            flagButton.hidden = true;
            flagButton.style.setProperty('display', 'none', 'important');
        } else {
            flagButton.hidden = false;
            flagButton.style.setProperty('display', 'inline-flex', 'important');
            flagButton.disabled = inlineActionState.flagPending;
            flagButton.innerHTML = inlineActionState.flagPending ? 'Adding...' : flagDoneForQuestion ? 'Added to openQbank' : 'Add to openQbank';
        }
    }

    if (actionsDiv) {
        const isCardsHidden = !cardsButton || cardsButton.hidden || cardsButton.style.display === 'none';
        const isFlagHidden = !flagButton || flagButton.hidden || flagButton.style.display === 'none';
        if (isCardsHidden && isFlagHidden) {
            actionsDiv.style.setProperty('display', 'none', 'important');
        } else {
            actionsDiv.style.removeProperty('display');
        }
    }

    if (status) {
        if (hasCardsDisplayed || inlineActionState.statusKind === 'info') {
            status.textContent = '';
            status.style.setProperty('display', 'none', 'important');
        } else {
            status.style.removeProperty('display');
            status.dataset.kind = inlineActionState.statusKind;
            if (inlineActionState.statusKind === 'error' && inlineActionState.status) {
                status.innerHTML = buildErrorStatusHtml(inlineActionState.status);
            } else {
                status.textContent = inlineActionState.status;
            }
        }
    }

    if (previewContainer) {
        if (hasCardsDisplayed) {
            previewContainer.style.marginTop = '0px';
            previewContainer.style.background = 'transparent';
            previewContainer.style.border = 'none';
            previewContainer.style.padding = '0px';
            previewContainer.style.boxShadow = 'none';
        } else {
            previewContainer.style.removeProperty('margin-top');
            previewContainer.style.removeProperty('background');
            previewContainer.style.removeProperty('border');
            previewContainer.style.removeProperty('padding');
            previewContainer.style.removeProperty('box-shadow');
        }
        if (
            inlineActionState.cardsPending &&
            isOpenQbankTier(inlineActionState.userType, inlineActionState.userTier)
        ) {
            previewContainer.hidden = true;
            previewContainer.innerHTML = '';
        } else if (inlineActionState.showPreview && inlineActionState.generatedCardsText) {
            const { cards } = parseCardsPayload(inlineActionState.generatedCardsText);
            const visibleCards = cards.filter((c) => !isLeadInCard(c));
            if (visibleCards.length > 0) {
                const vignetteHtml = '';

                const cardsHtml = visibleCards.map((c, i) => {
                    const isCloze = c.cardType.toLowerCase() === 'cloze';

                    const sourceTagItems = c.tagsList && c.tagsList.length > 0
                        ? c.tagsList
                        : splitStoredCardTags(c.tags);

                    const rawTags = [c.organSystem, ...sourceTagItems]
                        .map(t => t ? t.trim() : '')
                        .filter(t => t && t.toLowerCase() !== 'general' && t.toLowerCase() !== 'cloze' && t.toLowerCase() !== 'basic');

                    const uniqueTags: string[] = [];
                    rawTags.forEach(t => {
                        if (!uniqueTags.some(u => u.toLowerCase() === t.toLowerCase())) {
                            uniqueTags.push(t);
                        }
                    });

                    const tagsBadges = uniqueTags.map(tag => `<span class="ocb-tag-badge" style="${getTagStyles(tag)}">${tag}</span>`).join(' ');
                    const tagsStrip = tagsBadges ? `<div class="ocb-preview-card-tags" style="display: flex; gap: 4px; flex-wrap: wrap;">${tagsBadges}</div>` : '';

                    const answerFieldHtml = `
                            <div class="ocb-preview-card-field" style="line-height: 1.45; margin-top: 4px;">
                                <span class="ocb-preview-field-label" style="font-weight: 700; color: var(--ocb-text, #111827);">Back:</span> ${formatCardText(c.back)}
                            </div>
                        `;

                    const frontImgMarkup = (c.isManual && c.image)
                        ? `<div class="ocb-preview-card-image" style="margin: 6px 0;"><img src="${c.image}" alt="Question Image" style="max-height: 180px; max-width: 100%; border-radius: 8px; border: 1px solid #e5e7eb; display: block;" /></div>`
                        : '';

                    const backImgMarkup = (c.isManual && c.correctExplanationImage)
                        ? `<div class="ocb-preview-card-image" style="margin: 6px 0;"><img src="${c.correctExplanationImage}" alt="Explanation Diagram" style="max-height: 180px; max-width: 100%; border-radius: 8px; border: 1px solid #e5e7eb; display: block;" /></div>`
                        : '';

                    const titleMarkup = isCloze 
                        ? `<div class="ocb-preview-card-field"><span class="ocb-preview-field-label" style="font-weight: 700; color: var(--ocb-text, #111827);">Cloze Text:</span> ${formatCardText(c.clozeText || c.front)}</div>`
                        : `
                            ${frontImgMarkup}
                            <div class="ocb-preview-card-field" style="line-height: 1.45;"><span class="ocb-preview-field-label" style="font-weight: 700; color: var(--ocb-text, #111827);">Question:</span> ${formatCardText(c.front)}</div>
                            ${answerFieldHtml}
                            ${backImgMarkup}
                          `;
                    
                    const notesMarkup = c.notes 
                        ? `<div class="ocb-preview-card-notes" style="margin-top: 4px; font-size: 11px; color: var(--ocb-text-secondary, #4b5563);"><b>Note:</b> ${formatCardText(c.notes)}</div>`
                        : '';

                    const isCardAdded = inlineActionState.addedCardIndices.has(i) || Boolean(inlineActionState.userOwnedPreview);
                    const addLibraryBtnMarkup = isCardAdded
                        ? `<button type="button" class="ocb-add-library-btn is-added" data-card-index="${i}" disabled><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span>Added to Library</span></button>`
                        : `<button type="button" class="ocb-add-library-btn" data-card-index="${i}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span>Add to Library</span></button>`;

                    const actionButtonsMarkup = `<div style="display: flex; align-items: center; gap: 6px; margin-left: auto;">
                            <button type="button" class="ocb-report-btn" data-card-index="${i}" aria-label="Report card / feedback" title="Report card / feedback">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
                            </button>
                            ${addLibraryBtnMarkup}
                           </div>`;

                    const topHeaderMarkup = (tagsStrip || actionButtonsMarkup)
                        ? `<div class="ocb-preview-card-header" style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px;">
                            ${tagsStrip || '<div></div>'}
                            ${actionButtonsMarkup}
                           </div>`
                        : '';

                    return `
                        <div class="ocb-preview-card">
                            ${topHeaderMarkup}
                            <div class="ocb-preview-card-body">
                                ${titleMarkup}
                                ${notesMarkup}
                            </div>
                        </div>
                    `;
                }).join('');

                const openqbankDisclaimerPopoverHtml = () => `
                    <div class="ocb-disclaimer-wrapper">
                        <button type="button" class="ocb-disclaimer-btn" aria-label="Disclaimer" title="Educational Reconstruction" onclick="this.parentElement.classList.toggle('is-open'); event.stopPropagation();">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                        </button>
                        <div class="ocb-disclaimer-popover" role="tooltip" style="left: 0; right: auto;">
                            <strong>Educational Reconstruction:</strong>
                            ${DISCLAIMER_TEXT}
                        </div>
                    </div>
                `;

                const headerHtml = `
                    <div class="ocb-preview-header" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                          <a href="https://openqbank.com/library" target="_blank" rel="noopener" class="ocb-cobranding" style="display: inline-flex; align-items: center; text-decoration: none; cursor: pointer; height: 18px; gap: 6px;">
                              <img src="${getSafeExtensionUrl('logo.png')}" alt="openQbank" style="height: 18px; width: 18px; object-fit: contain; display: block;" />
                              <span class="ocb-brand-name" style="font-weight: 800; font-size: 13px; color: var(--ocb-text, #111827); letter-spacing: -0.02em; line-height: 1; display: inline-flex; align-items: center;">openQbank<span class="ocb-brand-dot" style="color: #ffe5b4; font-size: 16px; line-height: 0; position: relative; top: 1px; margin-left: 0.5px;">.</span></span>
                          </a>
                          ${openqbankDisclaimerPopoverHtml()}
                        </div>
                    </div>
                `;

                previewContainer.hidden = false;
                previewContainer.innerHTML = `
                    ${headerHtml}
                    <div class="ocb-preview-cards-list">
                        ${vignetteHtml}
                        ${cardsHtml}
                    </div>
                `;
            } else {
                previewContainer.hidden = true;
                previewContainer.innerHTML = '';
            }
        } else {
            previewContainer.hidden = true;
            previewContainer.innerHTML = '';
        }
    }
};

const refreshCustomAnkiAccess = async () => {
    const previousIdentity = inlineActionState.cacheIdentity;
    const previousScope = inlineActionState.contentScope;
    try {
        const status = await sendOpenQBankRequest<{
            authenticated?: boolean;
            has_access?: boolean;
            custom_anki_enabled?: boolean;
            tier?: string;
            user_type?: string;
            cache_identity?: string;
            content_scope?: 'full' | 'partial' | null;
            total_cards?: number;
            upgrade_required?: boolean;
            min_version?: string;
            upgrade_url?: string;
        }>('/api/extension/status', undefined, true, 'GET');

        const authenticated = Boolean(status?.authenticated);
        inlineActionState.statusResolved = true;
        inlineActionState.upgradeRequired = Boolean(status?.upgrade_required);
        inlineActionState.minVersion = typeof status?.min_version === 'string' ? status.min_version : undefined;
        inlineActionState.upgradeUrl = typeof status?.upgrade_url === 'string' ? status.upgrade_url : undefined;
        inlineActionState.customAnkiEnabled = Boolean(
            status?.has_access && status?.custom_anki_enabled,
        );
        inlineActionState.userTier = status?.tier || null;
        inlineActionState.userType = status?.user_type || null;
        if (typeof status?.total_cards === 'number') {
            inlineActionState.totalCards = status.total_cards;
        }
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            try {
                const stored = await chrome.storage.local.get(['custom_card_fab_enabled', 'ai_flashcards_enabled']);
                if (stored && typeof stored.custom_card_fab_enabled === 'boolean') {
                    inlineActionState.customCardFabEnabled = stored.custom_card_fab_enabled;
                }
                if (stored && typeof stored.ai_flashcards_enabled === 'boolean') {
                    inlineActionState.aiFlashcardsEnabled = stored.ai_flashcards_enabled;
                }
            } catch {
                // Ignore storage read failures.
            }
        }
        inlineActionState.cacheIdentity = (typeof status?.cache_identity === 'string' && status.cache_identity.trim())
            ? status.cache_identity.trim()
            : null;
        // Prefer server content_scope; fall back to tier derivation.
        inlineActionState.contentScope = (status?.content_scope as 'full' | 'partial' | null | undefined)
            ?? null;

        if (!authenticated) {
            await purgeAllLocalGeneratedCards();
            inlineActionState.cacheIdentity = null;
            inlineActionState.contentScope = null;
            return;
        }

        // Account switch or paid→free: purge local caches.
        if (previousIdentity && inlineActionState.cacheIdentity) {
            const prevUser = previousIdentity.split(':')[0];
            const nextUser = inlineActionState.cacheIdentity.split(':')[0];
            if (prevUser !== nextUser) {
                await purgeAllLocalGeneratedCards();
            } else if (previousScope === 'full' && inlineActionState.contentScope === 'partial') {
                await purgeAllLocalGeneratedCards();
            } else if (previousScope === 'partial' && inlineActionState.contentScope === 'full') {
                // Upgrade: drop partial local entries so refetch gets full payload.
                await purgeAllLocalGeneratedCards();
                if (inlineActionState.questionId && !inlineActionState.cardsPending) {
                    void checkExistingCards();
                }
            }
        }
    } catch {
        // Keep last known state but mark unresolved so paid content stays gated.
        inlineActionState.statusResolved = false;
    }
};
interface AnkiCard {
    cardType: string;
    front: string;
    back: string;
    clozeText: string;
    notes: string;
    tags: string;
    tagsList?: string[];
    organSystem: string;
    image?: string;
    correctExplanationImage?: string;
    isManual?: boolean;
    isLeadIn?: boolean;
}

const parseMarkdownTableCards = (text: string): AnkiCard[] => {
    const lines = text.split('\n').map(l => l.trim());
    const tableLines = lines.filter(l => l.startsWith('|'));
    if (tableLines.length < 3) return [];

    const cards: AnkiCard[] = [];
    for (let i = 2; i < tableLines.length; i++) {
        const line = tableLines[i];
        const cells = line.split('|').map(c => c.trim());
        if (cells.length < 9) continue;
        cards.push({
            cardType: cells[1],
            front: cells[2],
            back: cells[3],
            clozeText: cells[4],
            notes: cells[5],
            tags: cells[6],
            organSystem: cells[7]
        });
    }
    return cards;
};

interface ParsedCardsResult {
    vignette?: string;
    cards: AnkiCard[];
}

const parseCardsPayload = (text: string): ParsedCardsResult => {
    if (!text || !text.trim()) return { cards: [] };
    const cleaned = text.trim();

    try {
        let jsonText = cleaned;
        const match = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (match) {
            jsonText = match[1].trim();
        }
        const parsed = JSON.parse(jsonText);

        if (parsed && typeof parsed === 'object') {
            const vignette = typeof parsed.vignette === 'string' && parsed.vignette.trim() ? parsed.vignette.trim() : undefined;
            const rawCards = Array.isArray(parsed.cards) ? parsed.cards : Array.isArray(parsed) ? parsed : [];
            if (rawCards.length > 0) {
                const cards: AnkiCard[] = rawCards.map((rawCard: unknown) => {
                    const c = (rawCard && typeof rawCard === 'object' ? rawCard : {}) as Record<string, unknown>;
                    const hasExplicitLeadIn = Boolean(c.lead_in || c.leadIn || (vignette && (c.question || c.answer)));
                    const rawType = String(c.card_type || c.cardType || '').trim().toLowerCase();
                    const isLeadInType = hasExplicitLeadIn || rawType === 'leadin' || rawType === 'lead-in' || rawType === 'lead_in';
                    const front = String(c.lead_in || c.leadIn || c.question || c.front || '').trim();
                    const back = String(c.answer || c.back || '').trim();
                    const notes = String(c.explanation || c.high_yield_pearl || c.notes || '').trim();
                    const organSystem = String(c.organ_system || c.organSystem || 'General').trim();
                    let tagsList: string[] | undefined;
                    let tags = '';
                    if (Array.isArray(c.tags)) {
                        tagsList = c.tags.map((t) => String(t || '').trim()).filter(Boolean);
                        tags = tagsList.join(' ');
                    } else if (typeof c.tags === 'string' && c.tags.trim()) {
                        tagsList = splitStoredCardTags(c.tags);
                        tags = tagsList.join('|');
                    }
                    const cardType = isLeadInType
                        ? 'leadin'
                        : String(c.card_type || c.cardType || (c.cloze_text || c.clozeText ? 'Cloze' : 'Basic')).trim();
                    const clozeText = String(c.cloze_text || c.clozeText || '').trim();
                    const isManual = Boolean(c.is_manual || c.isManual || c.cards_prompt_version === 'custom_v1');
                    const image = isManual ? String(c.image || '').trim() : '';
                    const correctExplanationImage = isManual ? String(c.correct_explanation_image || c.correctExplanationImage || '').trim() : '';

                    return {
                        cardType,
                        front,
                        back,
                        clozeText,
                        notes,
                        tags,
                        tagsList,
                        organSystem,
                        image: image || undefined,
                        correctExplanationImage: correctExplanationImage || undefined,
                        isManual,
                        isLeadIn: isLeadInType || isLeadInCard({ cardType, front }),
                    };
                });
                return { vignette, cards };
            }
        }
    } catch {
        // Fall back to markdown table parser
    }

    const markdownCards = parseMarkdownTableCards(cleaned);
    return { cards: markdownCards };
};

const getTagStyles = (label: string): string => {
    const text = label.trim().toLowerCase();
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
        hash = text.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash) % 360;
    const hue = text === 'endocrinology' ? 330 : h;
    const s = 70;
    return `background: hsl(${hue}, ${s}%, 95%) !important; color: hsl(${hue}, ${s}%, 30%) !important; border: 1px solid hsl(${hue}, ${s}%, 85%) !important;`;
};

const formatCardText = (txt: string): string => {
    if (!txt) return '';
    let result = txt.replace(/\{\{c(\d+)::(.*?)\}\}/g, (_match, num, content) => {
        const deletion = String(content).split('::', 1)[0];
        const index = parseInt(num) || 1;
        const colors = [
            '#ffe5b4', // c1
            '#d1fae5', // c2
            '#e0f2fe', // c3
            '#fce7f3', // c4
            '#f3e8ff', // c5
        ];
        const textColors = [
            '#1f2937', // c1
            '#065f46', // c2
            '#0369a1', // c3
            '#9d174d', // c4
            '#6b21a8', // c5
        ];
        const color = colors[(index - 1) % colors.length];
        const textColor = textColors[(index - 1) % textColors.length];
        return `<span class="ocb-cloze-highlight" style="background: ${color}; color: ${textColor};">${deletion}</span>`;
    });
    result = result.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    return result;
};

const splitStoredCardTags = (tags: string | undefined | null): string[] => {
    const raw = String(tags || '').trim();
    if (!raw) return [];
    if (raw.includes('|')) return raw.split('|').map((t) => t.trim()).filter(Boolean);
    if (raw.includes(',')) return raw.split(',').map((t) => t.trim()).filter(Boolean);
    return [raw];
};
window.addEventListener('keydown', (e) => {
    // Prevent UWorld arrow key navigation from changing questions when openqbank connector/modal is active or open
    const isFabModalOpen = Boolean(document.querySelector('#ocb-card-modal.ocb-modal-open'));
    const activeEl = document.activeElement;
    const isInsideConnector = Boolean(
        activeEl?.closest(`#${INLINE_ACTIONS_ROOT_ID}, #openchromebank-custom-card-root, #openqbank-custom-card-fab-root`)
    );

    if (isFabModalOpen || isInsideConnector) {
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
            const isTyping = activeEl && (
                activeEl.tagName === 'INPUT' ||
                activeEl.tagName === 'TEXTAREA' ||
                activeEl.tagName === 'SELECT' ||
                (activeEl as HTMLElement).isContentEditable
            );
            // If typing in input/textarea, allow local cursor navigation but prevent UWorld from changing questions
            e.stopPropagation();
            e.stopImmediatePropagation();
            if (!isTyping) {
                e.preventDefault();
            }
        }
    }
}, true);

const finishCountdownProgressBar = async () => {
    stopCardsProgressTicker();
    inlineActionState.countdownProgress = 100;

    const rootEl = document.getElementById(INLINE_ACTIONS_ROOT_ID);
    const cardsBtn = rootEl?.querySelector('.ocb-button--cards') as HTMLButtonElement | null;
    if (cardsBtn) {
        cardsBtn.style.setProperty('--ocb-progress', '100%');
        cardsBtn.classList.add('ocb-button--countdown');
        cardsBtn.classList.remove('ocb-button--peach-cta');
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
};

const applyGeneratedCards = (
    questionId: string,
    cards: string,
    statusMessage?: string,
    meta?: { contentScope?: 'full' | 'partial' | null; lockedCount?: number; userOwned?: boolean },
) => {
    stopCardsProgressTicker();
    inlineActionState.countdownProgress = 100;
    inlineActionState.countdownStartedAt = null;
    inlineActionState.generatedCardsText = cards;
    inlineActionState.lockedCount = meta?.lockedCount ?? inlineActionState.lockedCount ?? 0;
    inlineActionState.contentScope = meta?.contentScope ?? null;
    inlineActionState.cardsDoneQuestionId = questionId;
    inlineActionState.flagDoneQuestionId = questionId;
    inlineActionState.cardsPending = false;
    inlineActionState.countdownText = null;
    inlineActionState.showPreview = true;
    inlineActionState.userOwnedPreview = Boolean(meta?.userOwned);
    persistGeneratedCardsLocally(questionId, cards, {
        lockedCount: inlineActionState.lockedCount,
    });
    if (statusMessage) {
        setInlineStatus(statusMessage, 'success');
    } else {
        setInlineStatus('Cards generated successfully.', 'success');
    }
    renderInlineActions();
};

// check_only requests are only used to resolve the question id and read the cache,
// so the (potentially multi-megabyte) base64 images are dead weight on every poll.
const buildCheckOnlyQuestionDataPayload = (questionData: QuestionData | null) =>
    buildQuestionDataPayload(questionData);

type ReadyCardsResult = {
    cards: string;
    contentScope?: 'full' | 'partial';
    lockedCount?: number;
    userOwned?: boolean;
};

const fetchGeneratedCardsIfReady = async (
    questionId: string,
    questionData: QuestionData | null,
): Promise<ReadyCardsResult | null> => {
    const response = await sendOpenQBankRequest<{
        already_cached?: boolean;
        cards?: string;
        queued?: boolean;
        job_id?: number;
        message?: string;
        error?: string;
        content_scope?: 'full' | 'partial';
        locked_count?: number;
        user_owned?: boolean;
        generation_pending?: boolean;
        generation_failed?: boolean;
    }>(
        '/api/extension/generate-cards',
        {
            question_id: questionId,
            question_data: buildCheckOnlyQuestionDataPayload(questionData),
            check_only: true,
        },
        true,
    );

    if (response?.generation_failed) {
        throw new Error(response.error || response.message || 'Card generation failed.');
    }

    if (response?.generation_pending || (response?.queued && !response?.already_cached)) {
        return null;
    }

    if (response?.already_cached && response.cards) {
        return {
            cards: response.cards,
            contentScope: response.content_scope,
            lockedCount: response.locked_count,
            userOwned: response.user_owned,
        };
    }
    return null;
};
const isFatalPollError = (message: string): boolean =>
    message.includes('invalidated')
    || message.includes('message channel closed')
    || message.includes('Authentication required')
    || message.includes('Login required')
    || message.includes('Unauthorized');

const pollCardGeneration = async (questionId: string, questionData: QuestionData | null) => {
    if (activeCardPolls.has(questionId)) return;
    activeCardPolls.add(questionId);
    polledQuestionIds.add(questionId);

    const labelText = 'Generating flashcard...';
    const pollStartedAt = inlineActionState.countdownStartedAt ?? Date.now();
    if (inlineActionState.countdownStartedAt == null) {
        inlineActionState.countdownStartedAt = pollStartedAt;
    }

    // Keep filling the inline button; never open a loading modal.
    inlineActionState.cardsPending = true;
    inlineActionState.countdownText = labelText;
    startCardsProgressTicker(labelText, false);

    const isCurrentQuestion = () => inlineActionState.questionId === questionId;

    const resetToGenerateButton = (message?: string) => {
        stopCardsProgressTicker();
        polledQuestionIds.delete(questionId);
        if (!isCurrentQuestion()) return;
        inlineActionState.cardsPending = false;
        inlineActionState.countdownText = null;
        inlineActionState.countdownProgress = null;
        inlineActionState.countdownStartedAt = null;
        // No cards yet — hide preview so the generate button returns.
        if (!inlineActionState.generatedCardsText) {
            inlineActionState.showPreview = false;
        }
        if (message) {
            setInlineStatus(message, 'info');
        }
        renderInlineActions();
    };

    const finishWithCards = async (ready: ReadyCardsResult) => {
        // The user may have moved on; still cache the result so returning here is instant.
        if (!isCurrentQuestion()) {
            persistGeneratedCardsLocally(questionId, ready.cards, {
                lockedCount: ready.lockedCount ?? 0,
            });
            return;
        }
        await finishCountdownProgressBar();
        applyGeneratedCards(questionId, ready.cards, undefined, {
            contentScope: ready.contentScope ?? null,
            lockedCount: ready.lockedCount ?? 0,
            userOwned: ready.userOwned ?? false,
        });
    };

    // The page can re-render the explanation panel mid-generation (Rosh Review does this
    // when the One Step Further answer is revealed), which momentarily drops the question
    // fingerprint and clears the pending flag. The poll owns that flag until it finishes.
    const pendingGuard = window.setInterval(() => {
        if (!isCurrentQuestion() || inlineActionState.generatedCardsText) return;
        inlineActionState.cardsPending = true;
        inlineActionState.countdownText = labelText;
    }, 100);

    try {
        let consecutiveErrors = 0;

        for (const offset of CARD_POLL_CHECK_OFFSETS_MS) {
            if (isCurrentQuestion() && inlineActionState.generatedCardsText) return;

            const delay = Math.max(0, pollStartedAt + offset - Date.now());
            if (delay > 0) {
                await new Promise((r) => setTimeout(r, delay));
            }

            if (isCurrentQuestion() && inlineActionState.generatedCardsText) return;

            try {
                const ready = await fetchGeneratedCardsIfReady(questionId, questionData);
                consecutiveErrors = 0;
                if (ready) {
                    await finishWithCards(ready);
                    return;
                }
            } catch (e) {
                const msg = e instanceof Error ? e.message : 'Failed to query card status.';
                consecutiveErrors += 1;
                if (isFatalPollError(msg)) {
                    if (msg.includes('invalidated') || msg.includes('message channel closed')) {
                        setInlineStatus('Extension reloaded. Please refresh this webpage tab.', 'info');
                        resetToGenerateButton();
                    } else {
                        setInlineStatus(msg, 'error');
                        resetToGenerateButton();
                    }
                    return;
                }
                if (consecutiveErrors >= CARD_POLL_MAX_CONSECUTIVE_ERRORS) {
                    setInlineStatus(msg, 'error');
                    resetToGenerateButton();
                    return;
                }
            }
        }

        // Job-aware polling covers the worker timeout; stop only after the full window.
        resetToGenerateButton('Cards still generating. Click Generate again to check.');
    } finally {
        window.clearInterval(pendingGuard);
        activeCardPolls.delete(questionId);
    }
};

const checkExistingCards = async () => {
if (!inlineActionState.questionId) return;
const questionId = inlineActionState.questionId;

if (
    inlineActionState.cardsPending
    || inlineActionState.generatedCardsText !== null
    || polledQuestionIds.has(questionId)
    || activeCardPolls.has(questionId)
) return;

const isOpenQbankCore = isOpenQbankCoreUser();
const checkEpochAtStart = isOpenQbankCore ? (cardCheckEpochByQuestion.get(questionId) ?? 0) : 0;

if (isOpenQbankCore && hydrateOpenQbankCorePreviewFromSession(questionId)) {
    renderInlineActions();
    return;
}

// Non-core tiers may use in-memory cache; openQbank core uses session cache + API.
if (!isOpenQbankCore) {
const localCards = await readGeneratedCardsLocally(questionId);
if (inlineActionState.questionId !== questionId) return;
if (localCards) {
    inlineActionState.generatedCardsText = localCards;
    inlineActionState.cardsDoneQuestionId = questionId;
    inlineActionState.flagDoneQuestionId = questionId;
    inlineActionState.showPreview = true;
    renderInlineActions();
    return;
}
}

// Only one network check per question per page session unless the user clicks Generate again.
polledQuestionIds.add(questionId);

try {
const questionData = await getQuestionContent();
if (!questionData || inlineActionState.questionId !== questionId) return;
if (inlineActionState.cardsPending || activeCardPolls.has(questionId)) return;
if (isOpenQbankCore && (cardCheckEpochByQuestion.get(questionId) ?? 0) !== checkEpochAtStart) return;

const response = await sendOpenQBankRequest<{
    queued?: boolean;
    already_cached?: boolean;
    cards?: string;
    job_id?: number;
    content_scope?: 'full' | 'partial';
    locked_count?: number;
    user_owned?: boolean;
}>(
    '/api/extension/generate-cards',
    {
        question_id: questionId,
        question_data: buildCheckOnlyQuestionDataPayload(questionData),
        check_only: true,
    },
    true,
);

// A user-initiated generation may have started while this background check was in flight.
if (inlineActionState.questionId !== questionId || activeCardPolls.has(questionId)) return;
if (isOpenQbankCore && (cardCheckEpochByQuestion.get(questionId) ?? 0) !== checkEpochAtStart) return;
if (inlineActionState.generatedCardsText && inlineActionState.cardsDoneQuestionId === questionId) return;

const cachedCards = response?.cards;
const applyCachedPreview = isOpenQbankCore
    ? shouldApplyOpenQbankCachedPreview(Boolean(response?.already_cached), cachedCards)
    : shouldApplyOpenQbankCachedPreview(Boolean(response?.already_cached), cachedCards);

if (applyCachedPreview && cachedCards) {
    inlineActionState.generatedCardsText = cachedCards;
    inlineActionState.lockedCount = response?.locked_count ?? 0;
    inlineActionState.contentScope = response?.content_scope ?? null;
    inlineActionState.cardsDoneQuestionId = questionId;
    inlineActionState.flagDoneQuestionId = questionId;
    inlineActionState.showPreview = true;
    inlineActionState.userOwnedPreview = Boolean(response?.user_owned);
    persistGeneratedCardsLocally(questionId, cachedCards, {
        lockedCount: inlineActionState.lockedCount,
    });
    renderInlineActions();
} else if (response?.queued && response.job_id) {
    inlineActionState.showPreview = false;
    inlineActionState.cardsPending = true;
    inlineActionState.countdownProgress = 0;
    inlineActionState.countdownStartedAt = Date.now();
    const queuedLabel = 'Generating flashcard...';
    startCardsProgressTicker(queuedLabel, false);
    renderInlineActions();
    void pollCardGeneration(questionId, questionData);
}
} catch (e) {
const msg = e instanceof Error ? e.message : String(e);
if (
    msg.includes('invalidated') ||
    msg.includes('message channel closed') ||
    msg.includes('Authentication required') ||
    msg.includes('Login required') ||
    msg.includes('Unauthorized')
) {
    // Extension reloaded or user not logged in; ignore background check error silently
    return;
}
console.error('Failed to check existing cards:', e);
}
};

const handleInlineGenerateCards = async () => {
    if (
        !inlineActionState.questionId
        || inlineActionState.cardsPending
        || activeCardPolls.has(inlineActionState.questionId)
    ) return;

    // Refresh entitlement before serving/generating content.
    await refreshCustomAnkiAccess();

    if (
        isOpenQbankFree(inlineActionState.userType, inlineActionState.userTier)
        || inlineActionState.aiFlashcardsEnabled === false
    ) {
        renderInlineActions();
        return;
    }

    if (inlineActionState.upgradeRequired) {
        showUpdateRequiredModal(inlineActionState.minVersion, inlineActionState.upgradeUrl);
        return;
    }

    const isOpenQbankCore = isOpenQbankCoreUser();

    if (isOpenQbankCore && inlineActionState.questionId) {
        hydrateOpenQbankCorePreviewFromSession(inlineActionState.questionId);
    }

    // Non-core tiers may use in-memory cache; openQbank core uses session cache + API.
    if (!isOpenQbankCore && !inlineActionState.generatedCardsText && inlineActionState.questionId) {
        const localCards = await readGeneratedCardsLocally(inlineActionState.questionId);
        if (localCards) {
            inlineActionState.generatedCardsText = localCards;
            inlineActionState.cardsDoneQuestionId = inlineActionState.questionId;
            inlineActionState.flagDoneQuestionId = inlineActionState.questionId;
        }
    }

    // Instant in-memory / local cache hit: if cards are already present, display immediately
    if (inlineActionState.generatedCardsText) {
        inlineActionState.showPreview = true;
        inlineActionState.cardsPending = false;
        inlineActionState.countdownProgress = 100;
        setInlineStatus('Cards generated successfully.', 'success');
        renderInlineActions();
        return;
    }

    polledQuestionIds.delete(inlineActionState.questionId);
    if (isOpenQbankCore) {
        const qid = inlineActionState.questionId;
        cardCheckEpochByQuestion.set(qid, (cardCheckEpochByQuestion.get(qid) ?? 0) + 1);
    }

    // Progress fills the inline button only — never open a loading modal.
    inlineActionState.showPreview = false;
    inlineActionState.cardsPending = true;
    inlineActionState.countdownProgress = 0;
    inlineActionState.countdownStartedAt = Date.now();
    const pendingLabel = 'Generating flashcard...';
    inlineActionState.countdownText = pendingLabel;
    setInlineStatus('', 'idle');
    startCardsProgressTicker(pendingLabel, false);
    renderInlineActions();

    try {
        const questionData = await getQuestionContent();
        if (!questionData?.questionId) {
            throw new Error('No question found on this page.');
        }

        const resolvedObjective =
            questionData.educationalObjective
            || (questionData.platform === 'USMLEFighter' || questionData.platform === 'Brivona' ? questionData.explanation : '');
        if (!resolvedObjective?.trim()) {
            throw new Error('This question is not supported as it lacks an educational objective.');
        }

        const result = await requestGenerateCards(questionData.questionId, questionData);
        if (result.already_cached && result.cards) {
            await finishCountdownProgressBar();
            applyGeneratedCards(questionData.questionId, result.cards, undefined, {
                contentScope: result.content_scope ?? null,
                lockedCount: result.locked_count ?? 0,
                userOwned: result.user_owned ?? false,
            });
            return;
        }

        if (result.queued) {
            await pollCardGeneration(questionData.questionId, questionData);
        } else {
            throw new Error(result.message || 'Failed to queue card generation.');
        }
    } catch (error) {
        const rawMsg = error instanceof Error ? error.message : 'Failed to queue card generation.';
        const message = rawMsg.includes('Authentication required') ? 'Please sign in to openQbank via extension popup.' : rawMsg;
        setInlineStatus(message, 'error');
        stopCardsProgressTicker();
        inlineActionState.cardsPending = false;
        inlineActionState.countdownProgress = null;
        inlineActionState.countdownStartedAt = null;
        inlineActionState.countdownText = null;
    } finally {
        renderInlineActions();
    }
};

const handleInlineFlagQuestion = async () => {
    if (!inlineActionState.questionId || inlineActionState.flagPending) return;

    inlineActionState.flagPending = true;
    setInlineStatus('Adding question...', 'info');

    try {
        const questionData = await getQuestionContent();
        if (!questionData?.questionId) {
            throw new Error('No question found on this page.');
        }

        const result = await requestLearningFlag(questionData.questionId, questionData);
        if (!result?.flagged) {
            throw new Error('Question was not flagged.');
        }

        inlineActionState.flagDoneQuestionId = questionData.questionId;
        setInlineStatus('Question added to openQbank.', 'success');
    } catch (error) {
        const rawMsg = error instanceof Error ? error.message : 'Failed to add question.';
        const message = rawMsg.includes('Authentication required') ? 'Please sign in to openQbank via extension popup.' : rawMsg;
        setInlineStatus(message, 'error');
    } finally {
        inlineActionState.flagPending = false;
        renderInlineActions();
    }
};

const scheduleInlineRender = (() => {
    let timeoutId: number | null = null;

    return () => {
        if (!canRenderInlineActionsInCurrentWindow()) return;
        if (timeoutId) window.clearTimeout(timeoutId);
        timeoutId = window.setTimeout(() => {
            timeoutId = null;
            renderInlineActions();
        }, 150);
    };
})();

const installInlineActionObservers = () => {
    if (!canRenderInlineActionsInCurrentWindow()) return;

    scheduleInlineRender();

    const observer = new MutationObserver(() => {
        scheduleInlineRender();
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
    });

    const originalPushState = history.pushState.bind(history);
    history.pushState = function (...args) {
        const result = originalPushState(...args);
        scheduleInlineRender();
        return result;
    };

    const originalReplaceState = history.replaceState.bind(history);
    history.replaceState = function (...args) {
        const result = originalReplaceState(...args);
        scheduleInlineRender();
        return result;
    };

    window.addEventListener('popstate', scheduleInlineRender);
    window.addEventListener('hashchange', scheduleInlineRender);
    window.setInterval(scheduleInlineRender, 1500);
};

installInlineActionObservers();

// Listen for messages from popup or background script
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'GET_QUESTION_CONTENT') {
        getQuestionContent()
            .then((data) => {
                if (data) {
                    sendResponse({ success: true, data });
                }
            })
            .catch((error) => {
                console.error('GET_QUESTION_CONTENT failed:', error);
                sendResponse({ success: false, error: 'Failed to extract question content.' });
            });
    }
    if (request.action === 'GET_QUESTION_FINGERPRINT') {
        try {
            const data = getQuestionFingerprint();
            if (!data) {
                sendResponse({ success: false, error: 'No question fingerprint available.' });
                return true;
            }
            sendResponse({ success: true, data });
        } catch (error) {
            console.error('GET_QUESTION_FINGERPRINT failed:', error);
            sendResponse({ success: false, error: 'Failed to extract question fingerprint.' });
        }
    }
    if (request.action === 'RUN_GENERATE_CARDS') {
        handleInlineGenerateCards()
            .then(() => {
                sendResponse({
                    success: true,
                    message: 'Queued — flashcards are being generated.',
                });
            })
            .catch((error) => {
                sendResponse({
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to queue card generation.',
                });
            });
    }
    if (request.action === 'RUN_GENERATE_NEW_QUESTION') {
        sendResponse({
            success: false,
            error: 'Retest generation from the extension is disabled. Generate new questions from openQbank.com/me.',
        });
    }
    if (request.action === 'RUN_FLAG_QUESTION') {
        handleInlineFlagQuestion()
            .then(() => {
                sendResponse({
                    success: true,
                    message: 'Question added to openQbank.',
                });
            })
            .catch((error) => {
                sendResponse({
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to add question.',
                });
            });
    }
    return true;
});

// Refresh entitlement when tab becomes visible / focused (upgrade/downgrade mid-session).
window.addEventListener('focus', () => {
    void refreshCustomAnkiAccess().then(() => renderInlineActions());
});
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        void refreshCustomAnkiAccess().then(() => renderInlineActions());
    }
});

// Popup auth/status broadcasts via chrome.storage so content scripts reconcile without reload.
try {
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local') return;
            if (changes[AUTH_STATUS_STORAGE_KEY] || changes['openqbank_access_token'] || changes['custom_card_fab_enabled'] || changes['ai_flashcards_enabled']) {
                void refreshCustomAnkiAccess().then(() => renderInlineActions());
            }
        });
    }
} catch {
    // Ignore if extension APIs unavailable.
}
