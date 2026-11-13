# openQbank Connector

Hey! This is the browser extension for [openQbank](https://openqbank.com).

I built this connector because studying for the USMLE with generic 30,000-card Anki decks and clunky copy-pasting was driving me crazy. Instead of breaking your flow during question review, this extension embeds directly into your favorite question banks so you can make targeted, clean flashcards right when you miss a question.

---

## Supported Question Banks

The connector automatically parses and detects questions on:

| Platform | URL Pattern | What Works |
| :--- | :--- | :--- |
| **UWorld** | `*.uworld.com` | Metadata autodetection, BYOK cloze generation, floating card creator, add to library |
| **NBME** | `*.starttest.com` | Question parsing, BYOK card generation, floating card creator, add to library |
| **AMBOSS** | `*.amboss.com` | Question parsing, BYOK card generation, floating card creator, add to library |
| **TrueLearn** | `*.truelearn.com` | Question parsing, BYOK card generation, floating card creator, add to library |
| **Blueprint** | `*.blueprintprep.com` | Question parsing, BYOK card generation, floating card creator, add to library |
| **Rosh Review** | `*.roshreview.com` | Question parsing, BYOK card generation, floating card creator, add to library |

---

## What It Actually Does

- **Floating Flashcard Creator (+)**: Click the floating button (or press `a` on your keyboard) to write cards on the fly without leaving your question review.
- **BYOK AI Cloze Cards**: If you bring your own OpenAI API key (under Settings → Advanced), you can highlight any high-yield explanation, click **Make card**, and get a cleanly formatted cloze card (`{{c1::...}}`). It automatically detects the subject, organ system, and topic (on UWorld) so you don't have to fill in tags manually.
- **Copy for Anki**: One click copies your generated or manual cloze card straight to your clipboard formatted for Anki.
- **Add to Library**: Save questions to your openQbank account with one click to keep track of tricky concepts.
- **Real-Time Question Parsing**: Automatically pulls the question ID, organ system, subject, and topic so your cards stay organized.

### Anki Export

I am working on an Anki Addon that will directly sync your deck with Anki. It should be fairly easy but I want to do it right. In the interim in the next few days I will release an export to anki button from the openQbank home page! 

---

## Architecture & Tech Stack

Under the hood, the extension is built with:
- **Manifest Version**: Manifest V3
- **Frontend**: React 19, TypeScript, Tailwind CSS
- **Icons & Markdown**: Lucide React, React Markdown
- **Build System**: Vite (`vite.config.ts`, `vite.config.content.ts`, `vite.config.selection.ts`)
- **Backend API**: `https://openqbank-api.fly.dev` (Fly.io API microservice)

```
┌─────────────────────────────────────────────────────────────┐
│               Active Browser Tab (e.g. UWorld, NBME)        │
│                       [ Content Script ]                    │
└──────────────────────────────┬──────────────────────────────┘
                               │ Extract Stem & Metadata
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

## Development & Local Setup

### Prerequisites
- Node.js (v18+ or v20+)
- Google Chrome (or Chromium-based browser)

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/openMedEd/openQbank-connector.git
cd openQbank-connector
npm install
```

### 2. Build the Extension
```bash
npm run build:web
```
This runs `tsc` and Vite to bundle the popup, background service worker, inline content script (`dist/content.js`), and selection listener (`dist/selection.js`).

### 3. Load into Chrome
1. Head over to `chrome://extensions`.
2. Toggle on **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select the `dist/` folder inside this repository.
5. Pin the **openQbank Connector** icon to your toolbar.

### 4. Running Tests & Linter
```bash
npm test
npm run lint
```

---

## Development Disclaimer

The vast majority of the code in this repository was written by various LLMs. That being said, I designed the architecture and privacy standards from scratch, prompting agents with highly specific design instructions. I encourage you to review the code, find issues, and open PRs. Please also open PRs if you have any feature requests :). 

---

## License

This project is licensed under the [MIT License](LICENSE). openQbank Connector is owned and operated by openMedEd LLC. See [openQbank Terms of Service](https://openqbank.com/terms) and [Privacy Policy](https://openqbank.com/privacy).