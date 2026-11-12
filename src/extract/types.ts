export type Platform =
    | 'OpenQBank'
    | 'NBME'
    | 'UWorld'
    | 'AMBOSS'
    | 'TrueLearn'
    | 'BluePrint'
    | 'RoshReview'
    | 'USMLEFighter'
    | 'Brivona'
    | 'brivona'
    | 'Unknown';

export interface QuestionData {
    questionId: string;
    platform: Platform;
    stem: string;
    labValues: string;
    options: string[];
    correctAnswer?: string;
    explanation: string;
    image?: string;
    correctExplanationImage?: string;
    tables?: string[];
    references?: string[];
    subject?: string;
    system?: string;
    topic?: string;
    topicUrl?: string;
    educationalObjective?: string;
    explanations?: string[];
    nextQuestion?: string;
    nextAnswer?: string;
    rapidReview?: string;
}

export interface QuestionFingerprint {
    questionId: string;
    platform: Platform;
}

export interface InlineQuestionDataPayload {
    platform?: Platform;
    subject?: string;
    system: string;
    topic?: string;
    topic_url?: string;
    educational_objective?: string;
    references?: string[];
}
