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

  /* Segmented Toggle Control (DESIGN.md) */
  .ocb-segment-toggle {
    display: flex;
    background: var(--ocb-bg-surface-alt, #f3f4f6);
    padding: 3px;
    border-radius: var(--ocb-radius-btn, 12px);
    gap: 3px;
    box-sizing: border-box;
  }
  .ocb-segment-btn {
    appearance: none;
    flex: 1;
    border: none;
    background: transparent;
    padding: 7px 12px;
    font-size: 13px;
    font-weight: 700;
    color: var(--ocb-text-secondary, #4b5563);
    border-radius: 9px;
    cursor: pointer;
    font-family: 'DM Sans', 'Inter', system-ui, -apple-system, sans-serif;
    transition: background 150ms ease, color 150ms ease, box-shadow 150ms ease;
    text-align: center;
  }
  .ocb-segment-btn:hover {
    color: var(--ocb-text, #111827);
  }
  .ocb-segment-btn.ocb-segment-active,
  .ocb-segment-btn.is-active {
    background: var(--ocb-brand, #ffe5b4);
    color: var(--ocb-text-on-brand, #1f2937);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  }
  @media (prefers-color-scheme: dark) {
    .ocb-segment-btn.ocb-segment-active,
    .ocb-segment-btn.is-active {
      background: var(--ocb-brand, #ffe5b4);
      color: #1f2937;
    }
  }
`;
