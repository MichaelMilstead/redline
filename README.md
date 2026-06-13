# Writer

A proof-of-concept writing app with AI feedback. You write in a
distraction-free editor, and as you pause, the app surfaces inline editorial
notes anchored to specific spans of your text with suggested rewrites you
can accept with a click.

## What it does

- **Automatic feedback** — after you stop typing, the app sends your text
  to Claude and gets back notes anchored to spans. Notes appear as colored
  inline highlights (orange = suggestion, red = issue).
- **Click to review** — click a highlight to open a pinned panel showing the
  note plus suggested rewrites in different styles.
- **Accept a rewrite** — accepting replaces the highlighted span in place.
- **Stays in sync** — a note disappears if you edit its text (the feedback no
  longer applies), and accepting a rewrite doesn't trigger a new round of
  feedback.

## How it works

- `src/app/api/feedback/route.ts` — calls the Claude API ([Anthropic
  SDK](https://github.com/anthropics/anthropic-sdk-typescript)) with the
  document text and returns structured notes. The model returns a verbatim
  `quote` for each note; the server resolves it to a character range (models
  copy text reliably but count offsets poorly).
- `src/components/feedback-extension.ts` — a ProseMirror plugin that renders the
  notes as inline decorations and drops a note when its underlying text changes.
- `src/components/use-feedback.ts` — owns the generation lifecycle: debounced
  auto-runs, request cancellation, and applying the results.
- `src/components/feedback-panel.tsx` / `editor.tsx` — the review UI.

## Running locally

**Prerequisites:** Node.js 18.18+ and an
[Anthropic API key](https://console.anthropic.com/).

1. Install dependencies:

   ```bash
   npm install
   ```

2. Add your API key to a `.env.local` file in the project root:

   ```bash
   ANTHROPIC_API_KEY=sk-ant-...
   ```

3. Start the dev server:

   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) and start writing. After
   you pause, feedback highlights will appear; click one to review and accept a
   rewrite.

