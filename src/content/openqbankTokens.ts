/** Shared design tokens for injected content-script UI (openQbank + openHyGuru). */
export const OPENQBANK_INJECTED_TOKEN_CSS = `
  :root {
    --ocb-brand: #ffe5b4;
    --ocb-brand-hover: #ffdab9;
    --ocb-text-on-brand: #1f2937;
    --ocb-accent-blue-deep: #3b82f6;
    --ocb-accent-blue-baby: #b4ceff;
    --ocb-bg-app: #f9fafb;
    --ocb-bg-surface: #ffffff;
    --ocb-bg-surface-alt: #f3f4f6;
    --ocb-text: #111827;
    --ocb-text-secondary: #4b5563;
    --ocb-text-muted: #9ca3af;
    --ocb-border: #e5e7eb;
    --ocb-danger: #dc2626;
    --ocb-radius-btn: 12px;
    --ocb-radius-card: 20px;
    --ocb-radius-pill: 9999px;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --ocb-bg-app: #0b1220;
      --ocb-bg-surface: #0f172a;
      --ocb-bg-surface-alt: #16233c;
      --ocb-text: #ffffff;
      --ocb-text-secondary: #cbd5e1;
      --ocb-text-muted: #94a3b8;
      --ocb-border: #243047;
      --ocb-brand: #ffe5b4;
      --ocb-brand-hover: #ffdab9;
      --ocb-text-on-brand: #1f2937;
    }
  }
`;
