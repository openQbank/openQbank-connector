export const CANONICAL_ORGAN_SYSTEMS = [
    'Biostatistics',
    'Cardiology',
    'Dermatology',
    'Endocrinology',
    'Ethics',
    'Gastroenterology',
    'General Principles',
    'Gynecology',
    'Hematology',
    'Immunology',
    'Infectious Disease',
    'Multisystem Disorders',
    'Nephrology',
    'Neurology',
    'Obstetrics',
    'Oncology',
    'Orthopedics',
    'Psychiatry',
    'Pulmonology',
    'Regulatory Issues',
    'Social Sciences',
    'Urology',
] as const;

export type CanonicalOrganSystem = (typeof CANONICAL_ORGAN_SYSTEMS)[number];

const DEFAULT_ORGAN_SYSTEM: CanonicalOrganSystem = 'Multisystem Disorders';

const ORGAN_SYSTEM_ALIAS_MAP: Record<string, CanonicalOrganSystem> = {
    behavioral: 'Psychiatry',
    biostat: 'Biostatistics',
    biostats: 'Biostatistics',
    blood: 'Hematology',
    cardio: 'Cardiology',
    cardiovascular: 'Cardiology',
    cns: 'Neurology',
    derm: 'Dermatology',
    endo: 'Endocrinology',
    ethics: 'Ethics',
    'f repro': 'Gynecology',
    gi: 'Gastroenterology',
    gastro: 'Gastroenterology',
    genprin: 'General Principles',
    heme: 'Hematology',
    immune: 'Immunology',
    infectious: 'Infectious Disease',
    msk: 'Orthopedics',
    multisystem: 'Multisystem Disorders',
    multi: 'Multisystem Disorders',
    nephro: 'Nephrology',
    neuro: 'Neurology',
    ob: 'Obstetrics',
    obgyn: 'Obstetrics',
    onc: 'Oncology',
    ortho: 'Orthopedics',
    psych: 'Psychiatry',
    pulm: 'Pulmonology',
    renal: 'Nephrology',
    renalurin: 'Nephrology',
    regulatory: 'Regulatory Issues',
    socialsci: 'Social Sciences',
    urology: 'Urology',
};

export const normalizeOrganSystemKey = (value?: string): string =>
    (value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

export const resolveOrganSystem = (value?: string): CanonicalOrganSystem => {
    const key = normalizeOrganSystemKey(value);
    if (!key) return DEFAULT_ORGAN_SYSTEM;

    const direct = CANONICAL_ORGAN_SYSTEMS.find(
        (option) => normalizeOrganSystemKey(option) === key,
    );
    if (direct) return direct;

    if (ORGAN_SYSTEM_ALIAS_MAP[key]) return ORGAN_SYSTEM_ALIAS_MAP[key];

    const fuzzy = Object.entries(ORGAN_SYSTEM_ALIAS_MAP).find(
        ([alias]) => key.includes(alias) || alias.includes(key),
    );
    if (fuzzy) return fuzzy[1];

    return DEFAULT_ORGAN_SYSTEM;
};
