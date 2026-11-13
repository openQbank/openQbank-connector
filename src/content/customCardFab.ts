/**
 * Floating Quick-Add Flashcard Component for openChromeBank
 * Follows /openqbank-css design language:
 * - Peach primary CTA (--brand: #ffe5b4, hover: #ffdab9, dark text: #1f2937)
 * - Solid fill buttons, no decorative emojis
 * - Satisfying bouncy spring popout animation (cubic-bezier(0.34, 1.56, 0.64, 1))
 * - Cloze vs Basic card type toggle
 * - Front, back (Basic only), notes, organ system dropdown, topic tag
 * - Autofill from detected question content
 * - 100 card limit check for openQbank-free users
 * - Partner product exclusion
 */

import { OPENQBANK_INJECTED_TOKEN_CSS } from './openqbankTokens';
import { DISCLAIMER_TEXT } from '../disclaimer';

export interface QuestionDataLike {
  questionId?: string;
  system?: string;
  subject?: string;
  topic?: string;
  educationalObjective?: string;
  image?: string;
  correctExplanationImage?: string;
}

export interface CustomCardFabOptions {
  getQuestionData: () => Promise<QuestionDataLike | null>;
  getFingerprint: () => { questionId: string; platform: string } | null;
  getStatus: () => {
    isOpenQbankUser: boolean;
    isPro: boolean;
    isAdmin?: boolean;
    totalCards: number;
    customAnkiEnabled: boolean;
  };
  sendRequest: <T = unknown>(
    path: string,
    payload?: Record<string, unknown>,
    expectData?: boolean,
    method?: 'GET' | 'POST',
  ) => Promise<T | null>;
  canonicalOrganSystems: readonly string[];
  resolveOrganSystem: (value?: string) => string;
  buildQuestionDataPayload?: (data?: any) => any;
}

const FAB_ROOT_ID = 'openchromebank-custom-card-root';
const FAB_STYLE_ID = 'openchromebank-custom-card-style';

type SequentialStepDraft = { label: string; value: string };

const renderOcbSequentialSteps = (root: HTMLElement, steps: SequentialStepDraft[]) => {
  const container = root.querySelector<HTMLElement>('#ocb-sequential-steps');
  if (!container) return;
  const list = steps.length ? steps : [{ label: 'Diagnosis', value: '' }, { label: 'Mechanism', value: '' }];
  container.innerHTML = '';
  list.forEach((step, idx) => {
    const row = document.createElement('div');
    row.className = 'ocb-seq-row';
    row.style.cssText = 'display:grid;grid-template-columns:1fr 1.4fr auto;gap:8px;margin-bottom:8px;align-items:start;';
    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.className = 'ocb-input ocb-seq-label';
    labelInput.placeholder = 'Field name';
    labelInput.value = step.label;
    const valueTa = document.createElement('textarea');
    valueTa.className = 'ocb-textarea ocb-seq-value';
    valueTa.rows = 2;
    valueTa.placeholder = 'Value';
    valueTa.value = step.value;
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'ocb-btn ocb-btn-ghost';
    rm.textContent = '×';
    rm.onclick = () => {
      const current = collectOcbSequentialSteps(root);
      current.splice(idx, 1);
      renderOcbSequentialSteps(root, current.length ? current : [{ label: '', value: '' }]);
    };
    row.append(labelInput, valueTa, rm);
    container.appendChild(row);
  });
};

const collectOcbSequentialSteps = (root: HTMLElement): SequentialStepDraft[] => {
  const rows = root.querySelectorAll<HTMLElement>('.ocb-seq-row');
  const steps: SequentialStepDraft[] = [];
  rows.forEach((row) => {
    const label = row.querySelector<HTMLInputElement>('.ocb-seq-label')?.value?.trim() || '';
    const value = row.querySelector<HTMLTextAreaElement>('.ocb-seq-value')?.value?.trim() || '';
    if (label && value) steps.push({ label, value });
  });
  return steps;
};

let isModalOpen = false;
let currentCardType: 'cloze' | 'basic' | 'image' | 'sequential' = 'cloze';
let isSubmitting = false;
let setCardTypeRef: ((type: 'cloze' | 'basic' | 'image' | 'sequential') => void) | null = null;
let lastQuestionId = '';
let currentImageDataUrl: string | null = null;
let currentFrontImageDataUrl: string | null = null;

const MAX_INPUT_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB raw input limit before compression
const TARGET_PAYLOAD_SIZE_BYTES = 1.8 * 1024 * 1024; // 1.8MB target to stay safely under 2MB over the wire

const processImageFile = (
  file: File,
): Promise<{ dataUrl: string; width: number; height: number; sizeBytes: number }> => {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_INPUT_FILE_SIZE_BYTES) {
      reject(new Error('Image exceeds 25MB input limit.'));
      return;
    }
    if (!file.type.startsWith('image/')) {
      reject(new Error('Selected file is not an image.'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const resultStr = typeof reader.result === 'string' ? reader.result : '';
      if (!resultStr) {
        reject(new Error('Failed to read image.'));
        return;
      }

      const img = new Image();
      img.onload = () => {
        const maxDim = 1280;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({
            dataUrl: resultStr,
            width: img.width,
            height: img.height,
            sizeBytes: file.size,
          });
          return;
        }

        // Fill background with white to avoid black backgrounds on transparent PNGs converting to JPEG
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // Always encode as image/jpeg for efficient client-side compression
        // (Canvas toDataURL with image/png ignores quality and outputs uncompressed ~2-5MB bitmaps)
        let quality = 0.82;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        let approxSize = Math.round((dataUrl.length * 3) / 4);

        // Progressive compression loop if needed
        while (approxSize > TARGET_PAYLOAD_SIZE_BYTES && quality > 0.40) {
          quality -= 0.12;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
          approxSize = Math.round((dataUrl.length * 3) / 4);
        }

        // If still too large, step down resolution
        if (approxSize > TARGET_PAYLOAD_SIZE_BYTES) {
          const scale = 0.75;
          const scaledWidth = Math.round(width * scale);
          const scaledHeight = Math.round(height * scale);
          const scaleCanvas = document.createElement('canvas');
          scaleCanvas.width = scaledWidth;
          scaleCanvas.height = scaledHeight;
          const sCtx = scaleCanvas.getContext('2d');
          if (sCtx) {
            sCtx.fillStyle = '#ffffff';
            sCtx.fillRect(0, 0, scaledWidth, scaledHeight);
            sCtx.drawImage(canvas, 0, 0, scaledWidth, scaledHeight);
            dataUrl = scaleCanvas.toDataURL('image/jpeg', 0.75);
            approxSize = Math.round((dataUrl.length * 3) / 4);
            width = scaledWidth;
            height = scaledHeight;
          }
        }

        if (approxSize > 2 * 1024 * 1024) {
          reject(new Error('Image exceeds 2MB limit after compression.'));
          return;
        }

        resolve({
          dataUrl,
          width,
          height,
          sizeBytes: approxSize,
        });
      };
      img.onerror = () => reject(new Error('Failed to load image.'));
      img.src = resultStr;
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
};

const updateMediaUi = (
  root: HTMLElement,
  dataUrl: string | null,
  meta?: { width: number; height: number; sizeBytes: number },
  isPreloaded = false,
) => {
  currentImageDataUrl = dataUrl;
  const dropzone = root.querySelector<HTMLElement>('#ocb-media-dropzone');
  const previewBox = root.querySelector<HTMLElement>('#ocb-media-preview-box');
  const previewImg = root.querySelector<HTMLImageElement>('#ocb-media-preview-img');
  const previewDetails = root.querySelector<HTMLElement>('#ocb-media-preview-details');

  if (!dropzone || !previewBox || !previewImg) return;

  if (dataUrl) {
    dropzone.style.display = 'none';
    previewBox.style.display = 'flex';
    previewImg.src = dataUrl;
    if (previewDetails) {
      if (meta && meta.width > 0) {
        const kb = Math.round(meta.sizeBytes / 1024);
        const prefix = isPreloaded ? 'Extracted (Admin) · ' : '';
        previewDetails.textContent = `${prefix}${meta.width}×${meta.height} · ${kb} KB`;
      } else {
        previewDetails.textContent = isPreloaded ? 'Extracted from question (Admin)' : 'Image attached';
      }
    }
  } else {
    dropzone.style.display = 'block';
    previewBox.style.display = 'none';
    previewImg.removeAttribute('src');
    if (previewDetails) previewDetails.textContent = '';
  }
};

const updateFrontMediaUi = (
  root: HTMLElement,
  dataUrl: string | null,
  meta?: { width: number; height: number; sizeBytes: number },
  isPreloaded = false,
) => {
  currentFrontImageDataUrl = dataUrl;
  const dropzone = root.querySelector<HTMLElement>('#ocb-front-image-dropzone');
  const previewBox = root.querySelector<HTMLElement>('#ocb-front-image-preview-box');
  const previewImg = root.querySelector<HTMLImageElement>('#ocb-front-image-preview-img');
  const previewDetails = root.querySelector<HTMLElement>('#ocb-front-image-preview-details');

  if (!dropzone || !previewBox || !previewImg) return;

  if (dataUrl) {
    dropzone.style.display = 'none';
    previewBox.style.display = 'flex';
    previewImg.src = dataUrl;
    if (previewDetails) {
      if (meta && meta.width > 0) {
        const kb = Math.round(meta.sizeBytes / 1024);
        const prefix = isPreloaded ? 'Extracted (Admin) · ' : '';
        previewDetails.textContent = `${prefix}${meta.width}×${meta.height} · ${kb} KB`;
      } else {
        previewDetails.textContent = isPreloaded ? 'Extracted from question (Admin)' : 'Question image attached';
      }
    }
  } else {
    dropzone.style.display = 'block';
    previewBox.style.display = 'none';
    previewImg.removeAttribute('src');
    if (previewDetails) previewDetails.textContent = '';
  }
};

export const removeCustomCardFab = () => {
  const root = document.getElementById(FAB_ROOT_ID);
  if (root) root.remove();
  isModalOpen = false;
  lastQuestionId = '';
  currentImageDataUrl = null;
  currentFrontImageDataUrl = null;
};

const resetCardInputs = (root: HTMLElement) => {
  const frontInput = root.querySelector<HTMLTextAreaElement>('#ocb-input-front');
  const frontCaption = root.querySelector<HTMLInputElement>('#ocb-front-image-caption');
  const backInput = root.querySelector<HTMLTextAreaElement>('#ocb-input-back');
  const notesInput = root.querySelector<HTMLTextAreaElement>('#ocb-input-notes');
  const fileInput = root.querySelector<HTMLInputElement>('#ocb-media-file-input');
  const frontFileInput = root.querySelector<HTMLInputElement>('#ocb-front-image-file-input');
  const statusMsg = root.querySelector<HTMLElement>('#ocb-status-message');
  if (frontInput) frontInput.value = '';
  if (frontCaption) frontCaption.value = '';
  if (backInput) backInput.value = '';
  if (notesInput) notesInput.value = '';
  if (fileInput) fileInput.value = '';
  if (frontFileInput) frontFileInput.value = '';
  updateMediaUi(root, null);
  updateFrontMediaUi(root, null);
  if (statusMsg) {
    statusMsg.style.display = 'none';
    statusMsg.textContent = '';
  }
};

export const updateCustomCardFabVisibility = (
  shouldShow: boolean,
  options: CustomCardFabOptions,
) => {
  const status = options.getStatus();
  if (!shouldShow || !status.isOpenQbankUser) {
    removeCustomCardFab();
    return;
  }

  ensureCustomCardFab(options);
};

export const ensureCustomCardFab = (options: CustomCardFabOptions) => {
  const status = options.getStatus();
  if (!status.isOpenQbankUser) {
    removeCustomCardFab();
    return;
  }

  injectFabStyles();

  let root = document.getElementById(FAB_ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = FAB_ROOT_ID;
    document.body.appendChild(root);
  }

  // Detect if question changed: clear card contents and autodetect new question's metadata
  const currentQid = options.getFingerprint()?.questionId || '';
  if (currentQid && currentQid !== lastQuestionId) {
    lastQuestionId = currentQid;
    if (root.hasChildNodes()) {
      resetCardInputs(root);
      const systemSelect = root.querySelector<HTMLSelectElement>('#ocb-select-system');
      const subjectInput = root.querySelector<HTMLInputElement>('#ocb-input-subject');
      const topicInput = root.querySelector<HTMLInputElement>('#ocb-input-topic');
      void autodetectQuestionMetadata(options, systemSelect, subjectInput, topicInput);
    }
  }

  // Render FAB + Modal structure if empty
  if (!root.hasChildNodes()) {
    root.innerHTML = `
      <!-- Floating Action Button -->
      <button
        type="button"
        id="ocb-fab-btn"
        class="ocb-fab"
        title="Custom Flashcard (openQbank)"
        aria-label="Custom Flashcard"
      >
        <svg class="ocb-fab-icon" viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </button>

      <!-- Bouncy Popout Overlying Window -->
      <div id="ocb-card-modal" class="ocb-card-modal" role="dialog" aria-modal="true" aria-labelledby="ocb-modal-title">
        <!-- Modal Header -->
        <div class="ocb-modal-header">
          <div class="ocb-modal-title-wrap">
            <span id="ocb-modal-title" class="ocb-brand-logo">
              <img src="${(typeof chrome !== 'undefined' && chrome?.runtime?.getURL) ? chrome.runtime.getURL('logo.png') : '/logo.png'}" alt="openQbank" style="height: 20px !important; width: 20px !important; max-width: 20px !important; max-height: 20px !important; object-fit: contain !important; margin: 0 7px 0 0 !important; display: inline-block !important; vertical-align: middle !important;" />
              openQbank<span class="ocb-brand-dot">.</span>
            </span>
            <div class="ocb-disclaimer-wrapper">
              <button type="button" class="ocb-disclaimer-btn" aria-label="Disclaimer" title="Educational Reconstruction" onclick="this.parentElement.classList.toggle('is-open'); event.stopPropagation();">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
              </button>
              <div class="ocb-disclaimer-popover" role="tooltip">
                <strong>Educational Reconstruction:</strong>
                ${DISCLAIMER_TEXT}
              </div>
            </div>
          </div>
        </div>

        <!-- Scrollable Modal Body -->
        <div class="ocb-modal-body">
          <!-- Card Type Toggle Segment -->
          <div class="ocb-form-group">
            <label class="ocb-label">Card Type</label>
            <div class="ocb-segment-toggle">
              <button type="button" id="ocb-type-cloze" class="ocb-segment-btn ocb-segment-active">Cloze</button>
              <button type="button" id="ocb-type-basic" class="ocb-segment-btn">Basic</button>
              <button type="button" id="ocb-type-image" class="ocb-segment-btn">Image</button>
              <button type="button" id="ocb-type-sequential" class="ocb-segment-btn">Sequential</button>
            </div>
          </div>

          <div id="ocb-sequential-group" class="ocb-form-group" style="display: none;">
            <div class="ocb-label-row">
              <label class="ocb-label">Sequential Fields</label>
              <span class="ocb-sublabel">Reveal one field at a time in review</span>
            </div>
            <div id="ocb-sequential-steps"></div>
            <button type="button" id="ocb-sequential-add-field" class="ocb-btn ocb-btn-ghost" style="margin-top: 8px; width: 100%;">Add Field</button>
          </div>

          <!-- Front / Cloze Text Input (Cloze & Basic) -->
          <div id="ocb-front-text-group" class="ocb-form-group">
            <div class="ocb-label-row">
              <label id="ocb-front-label" class="ocb-label" for="ocb-input-front">Cloze Text</label>
              <span id="ocb-front-hint" class="ocb-sublabel">Use {{c1::cloze deletion}} syntax</span>
            </div>
            <textarea
              id="ocb-input-front"
              class="ocb-textarea"
              rows="3"
              placeholder="e.g. {{c1::Atorvastatin}} is a HMG-CoA reductase inhibitor used to treat {{c2::hypercholesterolemia}}."
              required
            ></textarea>
          </div>

          <!-- Front Image Group (Image Card Mode) -->
          <div id="ocb-front-image-group" class="ocb-form-group" style="display: none;">
            <div class="ocb-label-row">
              <label class="ocb-label" for="ocb-front-image-dropzone">Image (Front)</label>
              <span class="ocb-sublabel">Drop, paste, or browse</span>
            </div>
            <!-- Empty Front Dropzone State -->
            <div id="ocb-front-image-dropzone" class="ocb-media-dropzone" role="button" tabindex="0" aria-label="Upload front card image">
              <input type="file" id="ocb-front-image-file-input" accept="image/png,image/jpeg,image/webp,image/gif" style="display: none;" />
              <div class="ocb-media-dropzone-content">
                <svg class="ocb-media-icon" viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="3" ry="3"></rect>
                  <circle cx="8.5" cy="8.5" r="1.5"></circle>
                  <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
                <div class="ocb-media-text-wrap">
                  <span id="ocb-front-media-primary-text" class="ocb-media-primary-text">Drop image, paste, or click to upload</span>
                  <span id="ocb-front-media-hint-text" class="ocb-media-hint-text">PNG, JPG, WEBP, GIF up to 2MB</span>
                </div>
              </div>
            </div>

            <!-- Attached Front Image Preview State -->
            <div id="ocb-front-image-preview-box" class="ocb-media-preview-box" style="display: none;">
              <div class="ocb-media-preview-thumb-wrap">
                <img id="ocb-front-image-preview-img" class="ocb-media-preview-thumb" alt="Attached front image" />
              </div>
              <div class="ocb-media-preview-info">
                <span class="ocb-media-preview-title">Front image attached</span>
                <span id="ocb-front-image-preview-details" class="ocb-media-preview-details"></span>
              </div>
              <button type="button" id="ocb-front-image-btn-remove" class="ocb-media-remove-btn" title="Remove image">
                Remove
              </button>
            </div>

            <!-- Optional Short Prompt / Caption Under Front Image -->
            <div style="margin-top: 4px;">
              <input
                type="text"
                id="ocb-front-image-caption"
                class="ocb-input"
                placeholder="Optional prompt or question (e.g. Identify this lesion)..."
              />
            </div>
          </div>

          <!-- Back Input (Basic & Image) -->
          <div id="ocb-back-group" class="ocb-form-group" style="display: none;">
            <label class="ocb-label" for="ocb-input-back">Back (Answer)</label>
            <textarea
              id="ocb-input-back"
              class="ocb-textarea"
              rows="2"
              placeholder="Answer or key clinical takeaway..."
            ></textarea>
          </div>

          <!-- Notes Field -->
          <div class="ocb-form-group">
            <label class="ocb-label" for="ocb-input-notes">Notes / Pearls <span class="ocb-optional">(optional)</span></label>
            <textarea
              id="ocb-input-notes"
              class="ocb-textarea"
              rows="2"
              placeholder="High-yield educational objective, mechanism, or clinical notes..."
            ></textarea>
          </div>

          <!-- Media Field -->
          <div class="ocb-form-group">
            <div class="ocb-label-row">
              <label class="ocb-label" for="ocb-media-dropzone"><span id="ocb-media-label-text">Media</span> <span class="ocb-optional">(optional)</span></label>
              <span class="ocb-sublabel">Paste, drop, or browse</span>
            </div>

            <!-- Empty Dropzone State -->
            <div id="ocb-media-dropzone" class="ocb-media-dropzone" role="button" tabindex="0" aria-label="Upload image">
              <input type="file" id="ocb-media-file-input" accept="image/png,image/jpeg,image/webp,image/gif" style="display: none;" />
              <div class="ocb-media-dropzone-content">
                <svg class="ocb-media-icon" viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="3" ry="3"></rect>
                  <circle cx="8.5" cy="8.5" r="1.5"></circle>
                  <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
                <div class="ocb-media-text-wrap">
                  <span id="ocb-media-primary-text" class="ocb-media-primary-text">Drop image, paste, or click to upload</span>
                  <span id="ocb-media-hint-text" class="ocb-media-hint-text">PNG, JPG, WEBP, GIF up to 2MB</span>
                </div>
              </div>
            </div>

            <!-- Attached Image Preview State -->
            <div id="ocb-media-preview-box" class="ocb-media-preview-box" style="display: none;">
              <div class="ocb-media-preview-thumb-wrap">
                <img id="ocb-media-preview-img" class="ocb-media-preview-thumb" alt="Attached media" />
              </div>
              <div class="ocb-media-preview-info">
                <span class="ocb-media-preview-title">Image attached</span>
                <span id="ocb-media-preview-details" class="ocb-media-preview-details"></span>
              </div>
              <button type="button" id="ocb-media-btn-remove" class="ocb-media-remove-btn" title="Remove image">
                Remove
              </button>
            </div>
          </div>

          <!-- 3 Titratable Tags: Subject, Organ System, Topic / Subtopic -->
          <div class="ocb-tags-grid">
            <div class="ocb-form-group">
              <label class="ocb-label" for="ocb-input-subject">Subject</label>
              <input
                type="text"
                id="ocb-input-subject"
                class="ocb-input"
                placeholder="e.g. Pathology, Pharmacology"
              />
            </div>
            <div class="ocb-form-group">
              <label class="ocb-label" for="ocb-select-system">Organ System</label>
              <select id="ocb-select-system" class="ocb-select">
                ${options.canonicalOrganSystems
                  .map((s) => `<option value="${s}">${s}</option>`)
                  .join('')}
              </select>
            </div>
          </div>
          <div class="ocb-form-group">
            <label class="ocb-label" for="ocb-input-topic">Topic / Subtopic</label>
            <input
              type="text"
              id="ocb-input-topic"
              class="ocb-input"
              placeholder="e.g. Heart Failure, Atorvastatin"
            />
          </div>

          <!-- Status / Error Notification -->
          <div id="ocb-status-message" class="ocb-status-message" style="display: none;"></div>
        </div>

        <!-- Modal Footer Actions -->
        <div class="ocb-modal-footer">
          <button type="button" id="ocb-btn-copy" class="ocb-btn ocb-btn-ghost">Copy for Anki</button>
          <button type="button" id="ocb-btn-cancel" class="ocb-btn ocb-btn-ghost">Cancel</button>
          <button type="button" id="ocb-btn-submit" class="ocb-btn ocb-btn-primary">
            <span id="ocb-submit-text">Create Flashcard</span>
            <div id="ocb-submit-spinner" class="ocb-spinner" style="display: none;"></div>
          </button>
        </div>
      </div>
    `;

    bindEvents(root, options);
  }

  syncMediaProState(root, options);
};

const syncMediaProState = (root: HTMLElement, options: CustomCardFabOptions) => {
  const isPro = Boolean(options.getStatus().isPro);
  const dropzone = root.querySelector<HTMLElement>('#ocb-media-dropzone');
  const primaryText = root.querySelector<HTMLElement>('#ocb-media-primary-text');
  const hintText = root.querySelector<HTMLElement>('#ocb-media-hint-text');

  const frontDropzone = root.querySelector<HTMLElement>('#ocb-front-image-dropzone');
  const frontPrimaryText = root.querySelector<HTMLElement>('#ocb-front-media-primary-text');
  const frontHintText = root.querySelector<HTMLElement>('#ocb-front-media-hint-text');

  if (dropzone) {
    if (!isPro) {
      dropzone.classList.add('ocb-media-dropzone--pro-only');
      dropzone.setAttribute('title', 'Upgrade to openQbank Pro to unlock image uploads');
      if (primaryText) primaryText.textContent = 'Upgrade to unlock image uploads.';
      if (hintText) hintText.textContent = '';
    } else {
      dropzone.classList.remove('ocb-media-dropzone--pro-only');
      dropzone.removeAttribute('title');
      if (primaryText) primaryText.textContent = 'Drop image, paste, or click to upload';
      if (hintText) hintText.textContent = 'PNG, JPG, WEBP, GIF up to 2MB';
    }
  }

  if (frontDropzone) {
    if (!isPro) {
      frontDropzone.classList.add('ocb-media-dropzone--pro-only');
      frontDropzone.setAttribute('title', 'Upgrade to openQbank Pro to unlock Image cards');
      if (frontPrimaryText) frontPrimaryText.textContent = 'Upgrade to unlock Image cards.';
      if (frontHintText) frontHintText.textContent = '';
    } else {
      frontDropzone.classList.remove('ocb-media-dropzone--pro-only');
      frontDropzone.removeAttribute('title');
      if (frontPrimaryText) frontPrimaryText.textContent = 'Drop image, paste, or click to upload';
      if (frontHintText) frontHintText.textContent = 'PNG, JPG, WEBP, GIF up to 2MB';
    }
  }
};

const applyCardTypeDom = (
  root: HTMLElement,
  type: 'cloze' | 'basic' | 'image' | 'sequential',
  isPro: boolean = false,
) => {
  currentCardType = type;
  const typeClozeBtn = root.querySelector<HTMLButtonElement>('#ocb-type-cloze');
  const typeBasicBtn = root.querySelector<HTMLButtonElement>('#ocb-type-basic');
  const typeImageBtn = root.querySelector<HTMLButtonElement>('#ocb-type-image');
  const typeSequentialBtn = root.querySelector<HTMLButtonElement>('#ocb-type-sequential');
  const sequentialGroup = root.querySelector<HTMLElement>('#ocb-sequential-group');
  const frontTextGroup = root.querySelector<HTMLElement>('#ocb-front-text-group');
  const frontImageGroup = root.querySelector<HTMLElement>('#ocb-front-image-group');
  const frontLabel = root.querySelector<HTMLElement>('#ocb-front-label');
  const frontHint = root.querySelector<HTMLElement>('#ocb-front-hint');
  const frontInput = root.querySelector<HTMLTextAreaElement>('#ocb-input-front');
  const backGroup = root.querySelector<HTMLElement>('#ocb-back-group');
  const mediaLabelText = root.querySelector<HTMLElement>('#ocb-media-label-text');
  const statusMsg = root.querySelector<HTMLElement>('#ocb-status-message');

  typeClozeBtn?.classList.toggle('ocb-segment-active', type === 'cloze');
  typeBasicBtn?.classList.toggle('ocb-segment-active', type === 'basic');
  typeImageBtn?.classList.toggle('ocb-segment-active', type === 'image');
  typeSequentialBtn?.classList.toggle('ocb-segment-active', type === 'sequential');

  if (sequentialGroup && type !== 'sequential') sequentialGroup.style.display = 'none';

  if (type === 'cloze') {
    if (frontTextGroup) frontTextGroup.style.display = 'block';
    if (frontImageGroup) frontImageGroup.style.display = 'none';
    if (frontLabel) frontLabel.textContent = 'Cloze Text';
    if (frontHint) frontHint.style.display = 'inline';
    if (frontInput) {
      frontInput.placeholder = 'e.g. {{c1::Atorvastatin}} is a HMG-CoA reductase inhibitor.';
    }
    if (backGroup) backGroup.style.display = 'none';
    if (mediaLabelText) mediaLabelText.textContent = 'Media';
    if (statusMsg && statusMsg.textContent?.includes('openQbank Pro feature')) {
      statusMsg.style.display = 'none';
    }
  } else if (type === 'sequential') {
    if (frontTextGroup) frontTextGroup.style.display = 'block';
    if (frontImageGroup) frontImageGroup.style.display = 'none';
    if (frontLabel) frontLabel.textContent = 'Vignette / Prompt';
    if (frontHint) {
      frontHint.style.display = 'inline';
      frontHint.textContent = 'Clinical stem shown before steps reveal';
    }
    if (frontInput) frontInput.placeholder = 'e.g. 55-year-old man with chest pain radiating to the back...';
    if (backGroup) backGroup.style.display = 'none';
    if (sequentialGroup) sequentialGroup.style.display = 'block';
    if (!root.querySelector('#ocb-sequential-steps .ocb-seq-row')) {
      renderOcbSequentialSteps(root, []);
    }
    if (mediaLabelText) mediaLabelText.textContent = 'Media';
  } else if (type === 'basic') {
    if (frontTextGroup) frontTextGroup.style.display = 'block';
    if (frontImageGroup) frontImageGroup.style.display = 'none';
    if (frontLabel) frontLabel.textContent = 'Front (Question)';
    if (frontHint) frontHint.style.display = 'none';
    if (frontInput) frontInput.placeholder = 'e.g. Mechanism of action of Atorvastatin?';
    if (backGroup) backGroup.style.display = 'block';
    if (mediaLabelText) mediaLabelText.textContent = 'Media';
    if (statusMsg && statusMsg.textContent?.includes('openQbank Pro feature')) {
      statusMsg.style.display = 'none';
    }
  } else {
    // type === 'image'
    if (frontTextGroup) frontTextGroup.style.display = 'none';
    if (frontImageGroup) frontImageGroup.style.display = 'block';
    if (backGroup) backGroup.style.display = 'block';
    if (mediaLabelText) mediaLabelText.textContent = 'Explanation Media';
    if (!isPro) {
      showStatus(statusMsg, 'Image flashcards are an openQbank Pro feature. Visit openqbank.com/settings to upgrade.', 'error');
    } else if (statusMsg && statusMsg.textContent?.includes('openQbank Pro feature')) {
      statusMsg.style.display = 'none';
    }
  }
};

const bindEvents = (root: HTMLElement, options: CustomCardFabOptions) => {
  const fabBtn = root.querySelector<HTMLButtonElement>('#ocb-fab-btn');
  const modal = root.querySelector<HTMLElement>('#ocb-card-modal');
  const cancelBtn = root.querySelector<HTMLButtonElement>('#ocb-btn-cancel');
  const submitBtn = root.querySelector<HTMLButtonElement>('#ocb-btn-submit');

  const typeClozeBtn = root.querySelector<HTMLButtonElement>('#ocb-type-cloze');
  const typeBasicBtn = root.querySelector<HTMLButtonElement>('#ocb-type-basic');
  const typeImageBtn = root.querySelector<HTMLButtonElement>('#ocb-type-image');
  const typeSequentialBtn = root.querySelector<HTMLButtonElement>('#ocb-type-sequential');
  const sequentialAddBtn = root.querySelector<HTMLButtonElement>('#ocb-sequential-add-field');

  const frontInput = root.querySelector<HTMLTextAreaElement>('#ocb-input-front');
  const frontDropzone = root.querySelector<HTMLElement>('#ocb-front-image-dropzone');
  const frontFileInput = root.querySelector<HTMLInputElement>('#ocb-front-image-file-input');
  const frontRemoveBtn = root.querySelector<HTMLButtonElement>('#ocb-front-image-btn-remove');
  const frontCaptionInput = root.querySelector<HTMLInputElement>('#ocb-front-image-caption');

  const backInput = root.querySelector<HTMLTextAreaElement>('#ocb-input-back');
  const notesInput = root.querySelector<HTMLTextAreaElement>('#ocb-input-notes');
  const systemSelect = root.querySelector<HTMLSelectElement>('#ocb-select-system');
  const subjectInput = root.querySelector<HTMLInputElement>('#ocb-input-subject');
  const topicInput = root.querySelector<HTMLInputElement>('#ocb-input-topic');
  const statusMsg = root.querySelector<HTMLElement>('#ocb-status-message');

  // Switch between Cloze, Basic, and Image
  const setCardType = (type: 'cloze' | 'basic' | 'image' | 'sequential') => {
    applyCardTypeDom(root, type, Boolean(options.getStatus().isPro));
  };

  typeClozeBtn?.addEventListener('click', () => setCardType('cloze'));
  typeBasicBtn?.addEventListener('click', () => setCardType('basic'));
  typeImageBtn?.addEventListener('click', () => setCardType('image'));
  typeSequentialBtn?.addEventListener('click', () => setCardType('sequential'));
  sequentialAddBtn?.addEventListener('click', () => {
    const steps = collectOcbSequentialSteps(root);
    steps.push({ label: '', value: '' });
    renderOcbSequentialSteps(root, steps);
  });

  const toggleModal = (open?: boolean) => {
    const status = options.getStatus();
    if (!status.isOpenQbankUser) {
      removeCustomCardFab();
      return;
    }
    const isOpenInDom = Boolean(modal?.classList.contains('ocb-modal-open'));
    isModalOpen = typeof open === 'boolean' ? open : !isOpenInDom;
    if (modal) {
      if (isModalOpen) {
        modal.classList.add('ocb-modal-open');
        fabBtn?.classList.add('ocb-fab-active');
        void autodetectQuestionMetadata(options, systemSelect, subjectInput, topicInput);
        syncMediaProState(root, options);
        if (currentCardType === 'image') {
          setTimeout(() => frontCaptionInput?.focus(), 150);
        } else {
          setTimeout(() => frontInput?.focus(), 150);
        }
      } else {
        modal.classList.remove('ocb-modal-open');
        fabBtn?.classList.remove('ocb-fab-active');
        if (statusMsg) statusMsg.style.display = 'none';
      }
    }
  };

  setCardTypeRef = setCardType;

  const copyBtn = root.querySelector<HTMLButtonElement>('#ocb-btn-copy');
  copyBtn?.addEventListener('click', async () => {
    const front = (frontInput?.value || '').trim();
    const back = (backInput?.value || '').trim();
    const line = currentCardType === 'basic' ? `${front}\t${back}` : front;
  try {
      await navigator.clipboard.writeText(line);
      showStatus(statusMsg, 'Copied. Paste into Anki (Basic: Front, Back; Cloze: Text).', 'success');
    } catch {
      showStatus(statusMsg, 'Could not copy to clipboard.', 'error');
    }
  });

  fabBtn?.addEventListener('click', () => toggleModal());
  cancelBtn?.addEventListener('click', () => toggleModal(false));

  const dropzone = root.querySelector<HTMLElement>('#ocb-media-dropzone');
  const fileInput = root.querySelector<HTMLInputElement>('#ocb-media-file-input');
  const removeBtn = root.querySelector<HTMLButtonElement>('#ocb-media-btn-remove');

  // Bottom Media: Click or keyboard
  const handleDropzoneAction = () => {
    if (!options.getStatus().isPro) {
      window.open('https://openqbank.com/settings', '_blank', 'noopener,noreferrer');
      return;
    }
    fileInput?.click();
  };

  dropzone?.addEventListener('click', handleDropzoneAction);
  dropzone?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleDropzoneAction();
    }
  });

  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const result = await processImageFile(file);
      updateMediaUi(root, result.dataUrl, result);
      if (statusMsg) statusMsg.style.display = 'none';
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to process image.';
      showStatus(statusMsg, msg, 'error');
    } finally {
      fileInput.value = '';
    }
  });

  dropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.add('ocb-media-dropzone-active');
  });
  dropzone?.addEventListener('dragenter', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.add('ocb-media-dropzone-active');
  });
  dropzone?.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove('ocb-media-dropzone-active');
  });
  dropzone?.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove('ocb-media-dropzone-active');

    if (!options.getStatus().isPro) {
      showStatus(statusMsg, 'Image uploads are an openQbank Pro feature. Visit openqbank.com/settings to upgrade.', 'error');
      window.open('https://openqbank.com/settings', '_blank', 'noopener,noreferrer');
      return;
    }

    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    try {
      const result = await processImageFile(file);
      updateMediaUi(root, result.dataUrl, result);
      if (statusMsg) statusMsg.style.display = 'none';
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to process image.';
      showStatus(statusMsg, msg, 'error');
    }
  });

  removeBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    updateMediaUi(root, null);
    if (fileInput) fileInput.value = '';
  });

  // Front Image: Click or keyboard
  const handleFrontDropzoneAction = () => {
    if (!options.getStatus().isPro) {
      window.open('https://openqbank.com/settings', '_blank', 'noopener,noreferrer');
      return;
    }
    frontFileInput?.click();
  };

  frontDropzone?.addEventListener('click', handleFrontDropzoneAction);
  frontDropzone?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleFrontDropzoneAction();
    }
  });

  frontFileInput?.addEventListener('change', async () => {
    const file = frontFileInput.files?.[0];
    if (!file) return;
    try {
      const result = await processImageFile(file);
      updateFrontMediaUi(root, result.dataUrl, result);
      if (statusMsg) statusMsg.style.display = 'none';
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to process image.';
      showStatus(statusMsg, msg, 'error');
    } finally {
      frontFileInput.value = '';
    }
  });

  frontDropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    frontDropzone.classList.add('ocb-media-dropzone-active');
  });
  frontDropzone?.addEventListener('dragenter', (e) => {
    e.preventDefault();
    e.stopPropagation();
    frontDropzone.classList.add('ocb-media-dropzone-active');
  });
  frontDropzone?.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    frontDropzone.classList.remove('ocb-media-dropzone-active');
  });
  frontDropzone?.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    frontDropzone.classList.remove('ocb-media-dropzone-active');

    if (!options.getStatus().isPro) {
      showStatus(statusMsg, 'Image flashcards are an openQbank Pro feature. Visit openqbank.com/settings to upgrade.', 'error');
      window.open('https://openqbank.com/settings', '_blank', 'noopener,noreferrer');
      return;
    }

    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    try {
      const result = await processImageFile(file);
      updateFrontMediaUi(root, result.dataUrl, result);
      if (statusMsg) statusMsg.style.display = 'none';
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to process image.';
      showStatus(statusMsg, msg, 'error');
    }
  });

  frontRemoveBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    updateFrontMediaUi(root, null);
    if (frontFileInput) frontFileInput.value = '';
  });

  // Media: Clipboard paste anywhere in modal
  modal?.addEventListener('paste', async (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items || items.length === 0) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        e.preventDefault();
        if (!options.getStatus().isPro) {
          showStatus(statusMsg, 'Image uploads are an openQbank Pro feature. Visit openqbank.com/settings to upgrade.', 'error');
          return;
        }

        const file = item.getAsFile();
        if (!file) continue;

        try {
          const result = await processImageFile(file);
          if (currentCardType === 'image' && !currentFrontImageDataUrl) {
            updateFrontMediaUi(root, result.dataUrl, result);
          } else {
            updateMediaUi(root, result.dataUrl, result);
          }
          if (statusMsg) statusMsg.style.display = 'none';
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Failed to process pasted image.';
          showStatus(statusMsg, msg, 'error');
        }
        return;
      }
    }
  });

  // Keyboard shortcuts:
  // 1. Cmd + Enter (or Ctrl + Enter) submits the card if content is not empty
  modal?.addEventListener('keydown', (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      const front = (frontInput?.value || '').trim();
      const hasImage = currentCardType === 'image' && Boolean(currentFrontImageDataUrl);
      if ((front || hasImage) && !isSubmitting) {
        e.preventDefault();
        e.stopPropagation();
        submitBtn?.click();
      }
    }
  });

  // 2. Escape closes the manual creation popup if open
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape' && isModalOpen) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      toggleModal(false);
    }
  }, true);

  // 3. Pressing 'a' on page opens the manual card creation workflow (unless typing in an input)
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if ((e.key === 'a' || e.key === 'A') && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const activeEl = document.activeElement;
      const isInput = activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.tagName === 'SELECT' ||
        (activeEl as HTMLElement).isContentEditable
      );
      if (!isInput && !isModalOpen) {
        e.preventDefault();
        toggleModal(true);
      }
    }
  }, true);

  // Submit Flashcard
  submitBtn?.addEventListener('click', async () => {
    if (isSubmitting) return;

    const front = (frontInput?.value || '').trim();
    const frontCaption = (frontCaptionInput?.value || '').trim();
    const back = (backInput?.value || '').trim();
    const notes = (notesInput?.value || '').trim();
    const organSystem = systemSelect?.value || 'Multisystem Disorders';
    const subject = (subjectInput?.value || '').trim();
    const topic = (topicInput?.value || '').trim();

    if (currentCardType === 'image') {
      if (!options.getStatus().isPro) {
        showStatus(statusMsg, 'Image flashcards are an openQbank Pro feature. Visit openqbank.com/settings to upgrade.', 'error');
        window.open('https://openqbank.com/settings', '_blank', 'noopener,noreferrer');
        return;
      }
      if (!currentFrontImageDataUrl) {
        showStatus(statusMsg, 'Please upload or drop an image for the front.', 'error');
        return;
      }
      if (!back) {
        showStatus(statusMsg, 'Please enter an answer for the card.', 'error');
        backInput?.focus();
        return;
      }
    } else if (currentCardType === 'sequential') {
      if (!front) {
        showStatus(statusMsg, 'Please enter a vignette prompt.', 'error');
        frontInput?.focus();
        return;
      }
      const steps = collectOcbSequentialSteps(root);
      if (steps.length < 2) {
        showStatus(statusMsg, 'Add at least two sequential fields with labels and values.', 'error');
        return;
      }
    } else {
      if (!front) {
        showStatus(statusMsg, 'Please enter front or cloze text.', 'error');
        frontInput?.focus();
        return;
      }
      if (currentCardType === 'basic' && !back) {
        showStatus(statusMsg, 'Please enter an answer for the Basic card.', 'error');
        backInput?.focus();
        return;
      }
    }

    isSubmitting = true;
    setSubmitBusy(submitBtn, true);
    if (statusMsg) statusMsg.style.display = 'none';

    try {
      const fingerprint = options.getFingerprint();
      const questionData = await options.getQuestionData();
      const questionId = fingerprint?.questionId || questionData?.questionId || '';
      const platform = fingerprint ? (fingerprint.platform || 'NBME') : 'Web';

      const finalFront = currentCardType === 'image' ? (frontCaption || 'Image') : front;
      const frontImage = currentCardType === 'image' ? (currentFrontImageDataUrl || undefined) : undefined;
      const explanationImage = currentImageDataUrl || undefined;
      const sequentialSteps =
        currentCardType === 'sequential' ? collectOcbSequentialSteps(root) : undefined;

      const response = await options.sendRequest<{
        success?: boolean;
        error?: string;
      }>(
        '/api/extension/custom-card',
        {
          question_id: questionId,
          platform,
          card_type: currentCardType,
          front: finalFront,
          back: currentCardType === 'sequential' ? '' : back,
          notes,
          organ_system: organSystem,
          subject,
          topic,
          image: frontImage,
          correct_explanation_image: explanationImage,
          ...(sequentialSteps ? { steps: sequentialSteps } : {}),
        },
        true,
        'POST',
      );

      if (response?.error) {
        showStatus(statusMsg, response.error, 'error');
        return;
      }

      if (statusMsg) {
        statusMsg.style.display = 'none';
        statusMsg.textContent = '';
      }

      triggerLevelUpAnimation(root);

      // Clear card content fields and media so it's immediately ready for next entry
      if (frontInput) {
        frontInput.value = '';
        if (currentCardType !== 'image') {
          setTimeout(() => frontInput?.focus(), 50);
        }
      }
      if (frontCaptionInput) {
        frontCaptionInput.value = '';
        if (currentCardType === 'image') {
          setTimeout(() => frontCaptionInput?.focus(), 50);
        }
      }
      if (backInput) backInput.value = '';
      if (notesInput) notesInput.value = '';
      updateMediaUi(root, null);
      updateFrontMediaUi(root, null);
      if (fileInput) fileInput.value = '';
      if (frontFileInput) frontFileInput.value = '';
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save flashcard.';
      showStatus(statusMsg, msg, 'error');
    } finally {
      isSubmitting = false;
      setSubmitBusy(submitBtn, false);
      syncMediaProState(root, options);
    }
  });
};

let lastSwayVariant = 0;
const triggerLevelUpAnimation = (root: HTMLElement) => {
  const wrapper = document.createElement('div');
  const variant = lastSwayVariant % 3;
  lastSwayVariant++;
  wrapper.className = 'ocb-float-wrapper';
  wrapper.innerHTML = `<div class="ocb-float-inner ocb-sway-variant-${variant}">+1</div>`;
  root.appendChild(wrapper);
  setTimeout(() => wrapper.remove(), 1600);
};

const autodetectQuestionMetadata = async (
  options: CustomCardFabOptions,
  systemSelect: HTMLSelectElement | null,
  subjectInput: HTMLInputElement | null,
  topicInput: HTMLInputElement | null,
) => {
  try {
    const qData = await options.getQuestionData();
    if (!qData) return;

    const systemVal = typeof qData.system === 'string' ? qData.system : undefined;
    const subjectVal = typeof qData.subject === 'string' ? qData.subject : undefined;
    const topicVal = typeof qData.topic === 'string' ? qData.topic : undefined;

    const platform = options.getFingerprint()?.platform || (qData as any)?.platform || '';
    const isLoosenedPlatform = platform === 'UWorld' || platform === 'USMLEFighter' || platform === 'Brivona' || platform === 'brivona';

    if (systemSelect && systemVal) {
      const cleanSystemVal = systemVal.trim();
      const resolved = options.resolveOrganSystem(cleanSystemVal);
      const targetSystem = (isLoosenedPlatform && cleanSystemVal) ? cleanSystemVal : resolved;

      // Ensure targetSystem exists in dropdown options (dynamically add if missing)
      const existingOption = Array.from(systemSelect.options).find(
        (opt) => opt.value.toLowerCase() === targetSystem.toLowerCase()
      );
      if (!existingOption && targetSystem) {
        const newOpt = document.createElement('option');
        newOpt.value = targetSystem;
        newOpt.textContent = targetSystem;
        systemSelect.appendChild(newOpt);
      }
      systemSelect.value = existingOption ? existingOption.value : targetSystem;
    }

    const fallbackSubject = platform === 'RoshReview' ? 'Emergency Medicine' : undefined;

    if (subjectInput && (subjectVal || fallbackSubject)) {
      subjectInput.value = subjectVal || fallbackSubject || '';
    }

    if (topicInput && topicVal) {
      topicInput.value = topicVal;
    }

  } catch {
    // Non-critical autodetection failure
  }
};

const showStatus = (el: HTMLElement | null, text: string, kind: 'error' | 'success') => {
  if (!el) return;
  el.textContent = text;
  el.className = `ocb-status-message ocb-status-${kind}`;
  el.style.display = 'block';
};

const setSubmitBusy = (btn: HTMLButtonElement | null, busy: boolean) => {
  if (!btn) return;
  btn.disabled = busy;
  const text = btn.querySelector<HTMLElement>('#ocb-submit-text');
  const spinner = btn.querySelector<HTMLElement>('#ocb-submit-spinner');
  if (text) text.style.display = busy ? 'none' : 'inline';
  if (spinner) spinner.style.display = busy ? 'inline-block' : 'none';
};

const injectFabStyles = () => {
  if (document.getElementById(FAB_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = FAB_STYLE_ID;
  style.textContent = `
    ${OPENQBANK_INJECTED_TOKEN_CSS}
    #${FAB_ROOT_ID}, #${FAB_ROOT_ID} * {
      box-sizing: border-box !important;
      font-family: 'DM Sans', 'Inter', system-ui, -apple-system, sans-serif !important;
      -webkit-font-smoothing: antialiased;
    }

    #${FAB_ROOT_ID} {
      position: fixed;
      bottom: 84px;
      right: 24px;
      z-index: 2147483640;
      pointer-events: auto;
    }

    /* Floating Action Button */
    .ocb-fab {
      appearance: none;
      width: 48px;
      height: 48px;
      border-radius: 9999px;
      background: #ffe5b4;
      color: #1f2937;
      border: 1.5px solid #fcd34d;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.08);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      padding: 0;
      transition: transform 180ms ease, background 180ms ease, box-shadow 180ms ease;
    }

    .ocb-fab:hover {
      background: #ffdab9;
      transform: translateY(-2px) scale(1.04);
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.16), 0 3px 8px rgba(0, 0, 0, 0.10);
    }

    .ocb-fab:active {
      transform: translateY(0) scale(0.96);
    }

    .ocb-fab .ocb-fab-icon {
      display: block;
      transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
      transform: rotate(0deg);
      transform-origin: center center;
    }

    .ocb-fab.ocb-fab-active .ocb-fab-icon {
      transform: rotate(45deg);
    }

    /* Instagram-Style Dual-Axis 60fps/120fps Floating +1 Animation */
    .ocb-float-wrapper {
      position: absolute;
      bottom: 58px;
      right: 6px;
      z-index: 2147483647;
      pointer-events: none;
      user-select: none;
      will-change: transform, opacity;
      animation: ocbFloatUp 1.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    .ocb-float-inner {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, var(--ocb-accent-blue-baby, #b4ceff) 0%, var(--ocb-accent-blue-deep, #3b82f6) 100%);
      color: #ffffff;
      font-size: 15px;
      font-weight: 800;
      line-height: 1;
      padding: 6px 15px;
      border-radius: 9999px;
      border: 1.5px solid rgba(255, 255, 255, 0.9);
      box-shadow: 0 8px 24px -2px rgba(245, 158, 11, 0.55), 0 3px 8px rgba(0, 0, 0, 0.12);
      will-change: transform;
      transform-origin: center bottom;
      backface-visibility: hidden;
      animation-duration: 1.5s;
      animation-timing-function: ease-in-out;
      animation-fill-mode: forwards;
    }

    .ocb-sway-variant-0 {
      animation-name: ocbFloatSwayLeft;
    }

    .ocb-sway-variant-1 {
      animation-name: ocbFloatSwayRight;
    }

    .ocb-sway-variant-2 {
      animation-name: ocbFloatSwayCenter;
    }

    /* Vertical Ascent: Continuous Uninterrupted Spring Curve */
    @keyframes ocbFloatUp {
      0% {
        opacity: 0;
        transform: translate3d(0, 0, 0);
      }
      10% {
        opacity: 1;
      }
      72% {
        opacity: 0.95;
      }
      100% {
        opacity: 0;
        transform: translate3d(0, -220px, 0);
      }
    }

    /* Horizontal Sway & Spring Pop Variants */
    @keyframes ocbFloatSwayLeft {
      0% {
        transform: translate3d(0, 0, 0) scale(0.25) rotate(0deg);
      }
      16% {
        transform: translate3d(-10px, 0, 0) scale(1.26) rotate(-10deg);
      }
      38% {
        transform: translate3d(-16px, 0, 0) scale(1.06) rotate(-5deg);
      }
      62% {
        transform: translate3d(12px, 0, 0) scale(1.0) rotate(8deg);
      }
      84% {
        transform: translate3d(4px, 0, 0) scale(0.95) rotate(2deg);
      }
      100% {
        transform: translate3d(-2px, 0, 0) scale(0.85) rotate(0deg);
      }
    }

    @keyframes ocbFloatSwayRight {
      0% {
        transform: translate3d(0, 0, 0) scale(0.25) rotate(0deg);
      }
      16% {
        transform: translate3d(10px, 0, 0) scale(1.26) rotate(10deg);
      }
      38% {
        transform: translate3d(16px, 0, 0) scale(1.06) rotate(5deg);
      }
      62% {
        transform: translate3d(-12px, 0, 0) scale(1.0) rotate(-8deg);
      }
      84% {
        transform: translate3d(-4px, 0, 0) scale(0.95) rotate(-2deg);
      }
      100% {
        transform: translate3d(2px, 0, 0) scale(0.85) rotate(0deg);
      }
    }

    @keyframes ocbFloatSwayCenter {
      0% {
        transform: translate3d(0, 0, 0) scale(0.25) rotate(0deg);
      }
      16% {
        transform: translate3d(-6px, 0, 0) scale(1.24) rotate(-6deg);
      }
      40% {
        transform: translate3d(12px, 0, 0) scale(1.05) rotate(7deg);
      }
      65% {
        transform: translate3d(-8px, 0, 0) scale(1.0) rotate(-4deg);
      }
      85% {
        transform: translate3d(3px, 0, 0) scale(0.95) rotate(2deg);
      }
      100% {
        transform: translate3d(0, 0, 0) scale(0.85) rotate(0deg);
      }
    }

    /* Bouncy Spring Popout Window */
    .ocb-card-modal {
      position: fixed;
      bottom: 144px;
      right: 24px;
      width: 390px;
      height: 580px;
      max-width: calc(100vw - 36px);
      max-height: min(600px, calc(100vh - 150px));
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 24px;
      box-shadow: 0 16px 40px rgba(15, 23, 42, 0.16), 0 4px 12px rgba(15, 23, 42, 0.08);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      opacity: 0;
      transform: scale(0.82) translateY(24px);
      transform-origin: bottom right;
      pointer-events: none;
      transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease;
    }

    .ocb-card-modal.ocb-modal-open {
      opacity: 1;
      transform: scale(1) translateY(0);
      pointer-events: auto;
    }

    /* Header */
    .ocb-modal-header {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      padding: 16px 20px 14px;
      border-bottom: 1px solid #f3f4f6;
      background: #fafafa;
    }

    .ocb-modal-title-wrap {
      display: flex;
      align-items: center;
    }

    .ocb-brand-logo {
      font-size: 1.2rem;
      font-weight: 700;
      color: #111827;
      letter-spacing: -0.02em;
      line-height: 1;
      display: inline-flex;
      align-items: center;
      user-select: none;
    }

    .ocb-brand-logo img {
      height: 20px !important;
      width: 20px !important;
      max-width: 20px !important;
      max-height: 20px !important;
      object-fit: contain !important;
      margin: 0 7px 0 0 !important;
      padding: 0 !important;
      border: none !important;
      border-radius: 0 !important;
      box-shadow: none !important;
      display: inline-block !important;
      vertical-align: middle !important;
    }

    .ocb-brand-dot {
      color: #ffe5b4;
      font-size: 1.45rem;
      line-height: 0;
      position: relative;
      top: 1px;
      margin-left: 0.5px;
    }

    .ocb-modal-header .ocb-disclaimer-wrapper {
      position: relative;
      display: inline-flex;
      align-items: center;
      margin-left: 8px;
    }

    .ocb-modal-header .ocb-disclaimer-btn {
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

    .ocb-modal-header .ocb-disclaimer-btn:hover,
    .ocb-modal-header .ocb-disclaimer-btn:focus-visible,
    .ocb-modal-header .ocb-disclaimer-wrapper.is-open .ocb-disclaimer-btn {
      color: var(--ocb-accent-blue-deep, #3b82f6);
      border-color: var(--ocb-accent-blue-baby, #b4ceff);
      background: #ffffff;
      outline: none;
    }

    .ocb-modal-header .ocb-disclaimer-popover {
      display: none;
      position: absolute;
      top: calc(100% + 6px);
      left: 0;
      width: min(300px, 80vw);
      padding: 10px 12px;
      font-size: 11.5px;
      line-height: 1.45;
      color: #1f2937;
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
      z-index: 1000;
      pointer-events: auto;
      text-align: left;
      font-weight: normal;
    }

    .ocb-modal-header .ocb-disclaimer-popover strong {
      display: block;
      margin-bottom: 3px;
      color: #111827;
      font-weight: 700;
    }

    .ocb-modal-header .ocb-disclaimer-wrapper:hover .ocb-disclaimer-popover,
    .ocb-modal-header .ocb-disclaimer-wrapper:focus-within .ocb-disclaimer-popover,
    .ocb-modal-header .ocb-disclaimer-wrapper.is-open .ocb-disclaimer-popover {
      display: block;
    }


    /* Scrollable Body */
    .ocb-modal-body {
      padding: 16px 18px;
      overflow-y: auto;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .ocb-form-group {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    .ocb-label-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
    }

    .ocb-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #4b5563;
    }

    .ocb-sublabel {
      font-size: 10px;
      color: #9ca3af;
      font-style: italic;
    }

    .ocb-optional {
      font-weight: 400;
      text-transform: none;
      color: #9ca3af;
    }

    /* Segment Control (Cloze vs Basic) */
    .ocb-segment-toggle {
      display: flex;
      background: #f3f4f6;
      padding: 3px;
      border-radius: 12px;
      gap: 3px;
    }

    .ocb-segment-btn {
      appearance: none;
      flex: 1;
      border: none;
      background: transparent;
      padding: 6px 10px;
      font-size: 12px;
      font-weight: 700;
      color: #4b5563;
      border-radius: 9px;
      cursor: pointer;
      transition: background 150ms ease, color 150ms ease, box-shadow 150ms ease;
    }

    .ocb-segment-btn.ocb-segment-active {
      background: #ffe5b4;
      color: #1f2937;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
    }

    /* Inputs & Textareas */
    .ocb-textarea, .ocb-input, .ocb-select {
      width: 100%;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 8px 11px;
      font-size: 12px;
      line-height: 1.45;
      color: #111827;
      background: #ffffff;
      transition: border-color 150ms ease, box-shadow 150ms ease;
    }

    .ocb-textarea:focus, .ocb-input:focus, .ocb-select:focus {
      outline: none;
      border-color: #fcd34d;
      box-shadow: 0 0 0 2px rgba(254, 211, 77, 0.25);
    }

    .ocb-textarea {
      resize: vertical;
      min-height: 54px;
    }

    .ocb-tags-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    /* Media Dropzone & Preview */
    .ocb-media-dropzone {
      border: 1.5px dashed #d1d5db;
      border-radius: 12px;
      padding: 12px 14px;
      background: #fafafa;
      cursor: pointer;
      text-align: center;
      transition: border-color 150ms ease, background 150ms ease, transform 120ms ease;
    }

    .ocb-media-dropzone:hover {
      border-color: #fcd34d;
      background: #fffdf5;
    }

    .ocb-media-dropzone:focus-visible {
      outline: none;
      border-color: #fcd34d;
      box-shadow: 0 0 0 2px rgba(254, 211, 77, 0.3);
    }

    .ocb-media-dropzone.ocb-media-dropzone-active {
      border-color: var(--ocb-accent-blue-deep, #3b82f6);
      background: var(--ocb-bg-surface-alt, #f3f4f6);
      transform: scale(1.01);
    }

    .ocb-media-dropzone.ocb-media-dropzone--pro-only {
      border: 2px solid transparent !important;
      background: linear-gradient(#ffffff, #ffffff) padding-box, linear-gradient(120deg, #3b82f6, #fb7185, #ffb347) border-box !important;
      box-shadow: 0 4px 16px rgba(255, 179, 71, 0.14) !important;
      cursor: pointer;
    }

    .ocb-media-dropzone.ocb-media-dropzone--pro-only:hover {
      box-shadow: 0 6px 20px rgba(251, 113, 133, 0.22) !important;
      transform: translateY(-1px);
    }

    .ocb-media-dropzone.ocb-media-dropzone--pro-only .ocb-media-primary-text {
      color: #2563eb;
      font-weight: 800;
    }

    .ocb-media-dropzone.ocb-media-dropzone--pro-only .ocb-media-icon {
      color: #fb7185;
    }

    .ocb-media-dropzone-content {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      pointer-events: none;
    }

    .ocb-media-icon {
      color: #9ca3af;
      flex-shrink: 0;
      transition: color 150ms ease;
    }

    .ocb-media-dropzone:hover .ocb-media-icon {
      color: var(--ocb-accent-blue-deep, #3b82f6);
    }

    .ocb-media-text-wrap {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
    }

    .ocb-media-primary-text {
      font-size: 11px;
      font-weight: 700;
      color: #374151;
      line-height: 1.2;
    }

    .ocb-media-hint-text {
      font-size: 10px;
      color: #9ca3af;
      line-height: 1.2;
    }

    .ocb-media-preview-box {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      background: #fafafa;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
    }

    .ocb-media-preview-thumb-wrap {
      width: 48px;
      height: 48px;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid #e5e7eb;
      background: #ffffff;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .ocb-media-preview-thumb {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .ocb-media-preview-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .ocb-media-preview-title {
      font-size: 11px;
      font-weight: 700;
      color: #111827;
      line-height: 1.2;
    }

    .ocb-media-preview-details {
      font-size: 10px;
      color: #6b7280;
      line-height: 1.2;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ocb-media-remove-btn {
      appearance: none;
      background: #ffffff;
      border: 1px solid #e5e7eb;
      color: #6b7280;
      padding: 5px 9px;
      font-size: 11px;
      font-weight: 700;
      border-radius: 8px;
      cursor: pointer;
      transition: background 150ms ease, color 150ms ease, border-color 150ms ease;
      flex-shrink: 0;
    }

    .ocb-media-remove-btn:hover {
      background: #fee2e2;
      border-color: #fecaca;
      color: #dc2626;
    }

    /* Status Notifications */
    .ocb-status-message {
      padding: 8px 12px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
      text-align: center;
    }

    .ocb-status-error {
      background: #fee2e2;
      color: #991b1b;
      border: 1px solid #fecaca;
    }

    .ocb-status-success {
      background: #dcfce7;
      color: #166534;
      border: 1px solid #bbf7d0;
    }

    /* Modal Footer */
    .ocb-modal-footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      padding: 12px 18px;
      border-top: 1px solid #f3f4f6;
      background: #fafafa;
    }

    .ocb-btn {
      appearance: none;
      border-radius: 12px;
      padding: 8px 16px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.02em;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: background 150ms ease, transform 120ms ease, opacity 150ms ease;
    }

    .ocb-btn:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    .ocb-btn-ghost {
      background: #ffffff;
      border: 1px solid #e5e7eb;
      color: #4b5563;
    }

    .ocb-btn-ghost:hover:not(:disabled) {
      background: #f3f4f6;
      color: #111827;
    }

    .ocb-btn-primary {
      background: #ffe5b4;
      border: 1px solid #fcd34d;
      color: #1f2937;
    }

    .ocb-btn-primary:hover:not(:disabled) {
      background: #ffdab9;
      transform: translateY(-1px);
    }

    .ocb-btn-primary:active:not(:disabled) {
      transform: translateY(0);
    }

    .ocb-spinner {
      width: 14px;
      height: 14px;
      border: 2px solid rgba(31, 41, 55, 0.2);
      border-top-color: #1f2937;
      border-radius: 50%;
      animation: ocb-spin 0.6s linear infinite;
    }

    @keyframes ocb-spin {
      to { transform: rotate(360deg); }
    }

    @media (prefers-color-scheme: dark) {
      .ocb-card-modal {
        background: var(--ocb-bg-surface);
        border-color: var(--ocb-border);
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
      }
      .ocb-modal-header {
        background: var(--ocb-bg-surface-alt);
        border-bottom-color: var(--ocb-border);
      }
      .ocb-brand-logo { color: var(--ocb-text); }
      .ocb-modal-body { background: var(--ocb-bg-surface); color: var(--ocb-text); }
      .ocb-modal-header .ocb-disclaimer-btn,
      .ocb-modal-header .ocb-disclaimer-popover,
      .ocb-media-preview-thumb-wrap,
      .ocb-media-remove-btn {
        background: var(--ocb-bg-surface-alt);
        color: var(--ocb-text);
        border-color: var(--ocb-border);
      }
      .ocb-modal-header .ocb-disclaimer-popover strong,
      .ocb-media-preview-title,
      .ocb-media-primary-text,
      .ocb-segment-btn.ocb-segment-active,
      .ocb-btn-ghost:hover:not(:disabled) {
        color: var(--ocb-text);
      }
      .ocb-sublabel,
      .ocb-optional,
      .ocb-media-hint-text,
      .ocb-media-preview-details {
        color: var(--ocb-text-muted);
      }
      .ocb-segment-toggle { background: var(--ocb-bg-app); }
      .ocb-label, .ocb-input, .ocb-textarea, .ocb-select {
        color: var(--ocb-text);
        background: var(--ocb-bg-surface-alt);
        border-color: var(--ocb-border);
      }
      .ocb-segment-btn { background: var(--ocb-bg-surface-alt); color: var(--ocb-text-secondary); border-color: var(--ocb-border); }
      .ocb-segment-btn.ocb-segment-active { background: var(--ocb-bg-surface); color: var(--ocb-text); }
      .ocb-btn-ghost { background: var(--ocb-bg-surface-alt); border-color: var(--ocb-border); color: var(--ocb-text-secondary); }
      .ocb-modal-footer { background: var(--ocb-bg-surface-alt); border-top-color: var(--ocb-border); }
      .ocb-media-dropzone { background: var(--ocb-bg-surface-alt); border-color: var(--ocb-border); }
      .ocb-media-preview-box { background: var(--ocb-bg-surface-alt); border-color: var(--ocb-border); }
      .ocb-media-dropzone.ocb-media-dropzone--pro-only {
        background: linear-gradient(var(--ocb-bg-surface-alt), var(--ocb-bg-surface-alt)) padding-box, linear-gradient(120deg, #3b82f6, #fb7185, #ffb347) border-box !important;
      }
      .ocb-status-error { background: #451a1a; color: #fecaca; border-color: #7f1d1d; }
      .ocb-status-success { background: #143325; color: #bbf7d0; border-color: #166534; }
      .ocb-btn-primary { color: var(--ocb-text-on-brand); }
    }
  `;

  document.head.appendChild(style);
};

export interface CustomCardPrefill {
  cardType: 'basic' | 'cloze';
  front: string;
  back: string;
  notes?: string;
}

export const openCustomCardModal = async (
  options: CustomCardFabOptions,
  prefill: CustomCardPrefill,
) => {
  ensureCustomCardFab(options);
  const root = document.getElementById(FAB_ROOT_ID);
  if (!root) return;

  const modal = root.querySelector<HTMLElement>('#ocb-card-modal');
  const fabBtn = root.querySelector<HTMLElement>('#ocb-fab-btn');
  const frontInput = root.querySelector<HTMLTextAreaElement>('#ocb-input-front');
  const backInput = root.querySelector<HTMLTextAreaElement>('#ocb-input-back');
  const notesInput = root.querySelector<HTMLTextAreaElement>('#ocb-input-notes');
  const systemSelect = root.querySelector<HTMLSelectElement>('#ocb-select-system');
  const subjectInput = root.querySelector<HTMLInputElement>('#ocb-input-subject');
  const topicInput = root.querySelector<HTMLInputElement>('#ocb-input-topic');

  if (!options.getFingerprint() && fabBtn) {
    fabBtn.style.display = 'none';
  }

  const isPro = Boolean(options.getStatus().isPro);
  applyCardTypeDom(root, prefill.cardType || 'cloze', isPro);
  setCardTypeRef?.(prefill.cardType || 'cloze');

  if (frontInput) frontInput.value = prefill.front || '';
  if (backInput) backInput.value = prefill.back || '';
  if (notesInput) notesInput.value = prefill.notes || '';

  // Open the modal if collapsed, or maintain open state
  if (modal) {
    modal.classList.add('ocb-modal-open');
    fabBtn?.classList.add('ocb-fab-active');
    isModalOpen = true;
  }

  // Always autodetect question metadata (subject, system, topic for UWorld, etc.)
  await autodetectQuestionMetadata(options, systemSelect, subjectInput, topicInput);
  syncMediaProState(root, options);

  setTimeout(() => frontInput?.focus(), 120);
};
