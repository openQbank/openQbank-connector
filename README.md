# openQbank Connector

The browser extension for [openQbank](https://openqbank.com), operated by **openMedEd LLC**. **openQbank Connector** brings clinical reasoning, AI tutoring, FSRS flashcard generation, and high-yield video recommendations directly into every major USMLE question bank platform.

**Auth:** Popup login uses `/api/app/auth/*` (not `/api/extension/login`). After store adoption, remove legacy wrappers per [openQbank README](../openQbank/README.md#delete-legacy-auth-wrappers-manual-follow-up).

---

## Supported Question Bank Platforms

openQbank Connector automatically parses and supports questions on:

| Platform | URL Pattern / Match | Supported Capabilities |
| :--- | :--- | :--- |
| **NBME** | `*.starttest.com` | Instant Solve, Step-by-Step Breakdown, Flashcards, Concept Flags |
| **UWorld** | `*.uworld.com` | Instant Solve, Step-by-Step Breakdown, Flashcards, Concept Flags |
| **AMBOSS** | `*.amboss.com` | Instant Solve, Step-by-Step Breakdown, Flashcards, Concept Flags |
| **TrueLearn** | `*.truelearn.com` | Instant Solve, Step-by-Step Breakdown, Flashcards, Concept Flags |
| **Blueprint** | `*.blueprintprep.com` | Instant Solve, Step-by-Step Breakdown, Flashcards, Concept Flags |
| **Rosh Review** | `*.roshreview.com` | Instant Solve, Step-by-Step Breakdown, Flashcards, Concept Flags |
| **USMLE Fighter** | `*.usmlefighter.com` | Instant Solve, Step-by-Step Breakdown, Flashcards, Concept Flags |
| **openQbank** | `*.openqbank.com` | Full native sync, card provisioning, remix integration |

---

## Key Features

- **Real-Time Question Extraction**: Automatically detects and extracts the question stem, lab values, answer choices, and explanations from the active tab.
- **Strategic Clinical Breakdown**: Breaks down complex vignettes using diagnostic frameworks, key discriminator findings, and elimination rationale.
- **HyGuru High-Yield Video Recommendations**: Contextually maps topics via Topic2QID to curated HyGuru video lectures and high-yield pearls.
- **Copy-On-Request FSRS Flashcards**: Generates high-yield cloze and basic flashcards saved directly to your openQbank account with FSRS spaced repetition scheduling.
- **Concept Flagging**: Flag difficult questions or concepts to trigger background card generation and review queues.
- **Dual-Auth Seamless Connectivity**: Connects to the dedicated Fly.io API microservice (`https://openqbank-api.fly.dev`) using 30-day Bearer tokens with automatic local development fallback.

---

## Tech Stack & Architecture

- **Manifest Version**: Manifest V3 (Chrome Extension)
- **Frontend**: React 19, TypeScript (`~5.9.3`), Tailwind CSS (`v4.1`)
- **Icons & Markdown**: Lucide React (`lucide-react`), React Markdown (`react-markdown`, `remark-gfm`)
- **Build System**: Vite (`v7.3`) + `@vitejs/plugin-react`
- **Backend API**: `https://openqbank-api.fly.dev` (Fly.io API microservice)

```
┌─────────────────────────────────────────────────────────────┐
│               Active Browser Tab (e.g. UWorld, NBME)        │
│                       [ Content Script ]                    │
└──────────────────────────────┬──────────────────────────────┘
                               │ Extract Stem & Choices
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 openQbank Connector Popup                   │
│             (React 19 + TypeScript + Tailwind)              │
└──────────────────────────────┬──────────────────────────────┘
                               │ Bearer Auth & Payloads
                               ▼
┌─────────────────────────────────────────────────────────────┐
│             openQbank Dedicated Fly API Server              │
│               https://openqbank-api.fly.dev                 │
└──────────────────────────────┬──────────────────────────────┘
                               │
                ┌──────────────┴──────────────┐
                ▼                             ▼
   ┌─────────────────────────┐   ┌─────────────────────────┐
   │  Supabase Postgres DB   │   │ Fly LLM Queue Worker    │
   │  (user_cards, FSRS)     │   │ (cards, deep learn)     │
   └─────────────────────────┘   └─────────────────────────┘
```

---

## Installation & Setup

### Prerequisites
- Node.js (v18+ or v20+ recommended)
- Google Chrome (or Chromium-based browser)

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/yourusername/openChromeBank.git
cd openChromeBank
npm install
```

### 2. Build the Extension
```bash
npm run build:web
```
This compiles the TypeScript code and bundles the extension into the `dist/` directory via Vite.

### 3. Package Extension (Optional .zip build)
```bash
node scripts/pack-extension.mjs
```
This produces `~/Downloads/openQbank-connector-v<VERSION>.zip`.

### 4. Publish to the Chrome Web Store
Copy `.env.example` to `.env` and fill in the Chrome Web Store OAuth values. To build and validate a release without contacting Google:
```bash
npm run publish:release -- --version 13.3.4 --dry-run
```

To upload a release without submitting it for review:
```bash
npm run publish:release -- --version 13.3.4 --upload-only
```

The `vX.Y.Z` GitHub Actions workflow performs the same build and upload through the protected `chrome-web-store` environment. Review submission is intentionally a separate approval step.

### 5. Load into Chrome
1. Open Google Chrome and navigate to `chrome://extensions`.
2. Toggle on **Developer mode** in the top right corner.
3. Click **Load unpacked** in the top left.
4. Select the `dist/` folder inside this repository.
5. Pin the **openQbank Connector** icon to your browser toolbar.

---

## Development

To run the development server with live reload:
```bash
npm run dev
```

To run linter and tests:
```bash
npm run lint
npm test
```

---

## Connecting Your Account

1. Click the openQbank Connector icon in your browser toolbar.
2. Sign in with your openQbank credentials (email and password).
3. The extension obtains a stateless 30-day Bearer access token and a 90-day refresh token stored securely in `chrome.storage.local`.
4. Navigate to any supported QBank question and open the popup to instantly analyze questions, create cards, or watch targeted video reviews.

---

## License

openQbank Connector is proprietary software operated by openMedEd LLC. See [openQbank Terms of Service](https://openqbank.com/terms) and [Privacy Policy](https://openqbank.com/privacy).


