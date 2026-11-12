/** Hostname patterns for supported qbank content-script matches (see public/manifest.json). */
export const QBANK_HOSTS: readonly RegExp[] = [
    /(^|\.)openqbank\.com$/i,
    /(^|\.)starttest\.com$/i,
    /^uworld\.com$/i,
    /\.uworld\.com$/i,
    /^amboss\.com$/i,
    /\.amboss\.com$/i,
    /^truelearn\.com$/i,
    /\.truelearn\.com$/i,
    /^blueprintprep\.com$/i,
    /\.blueprintprep\.com$/i,
    /^app\.roshreview\.com$/i,
    /\.roshreview\.com$/i,
    /^usmlefighter\.com$/i,
    /\.usmlefighter\.com$/i,
    /^brivona\.github\.io$/i,
    /^localhost$/i,
];
