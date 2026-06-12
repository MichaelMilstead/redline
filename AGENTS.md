<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Conventions

- Component files live in `src/components/` and are named in **kebab-case** (e.g. `editor.tsx`, `note-list.tsx`). The default-exported React component itself keeps PascalCase.
- Import components via the `@/components/...` alias.

# API

- `POST /api/feedback` — takes `{ content: string }` (the full editor text or a selected snippet) and returns `{ feedback: [{ quote, comment, severity, range, suggestions }] }`. Each `range` is `{ start, end }` character offsets into the submitted `content` (or `null` if the quote couldn't be located). `suggestions` is an array of `{ style, text }` rewrites of the quoted span (2 for `issue`/`suggestion` notes, empty for `praise`); accepting one replaces the span. The model returns verbatim quotes; the route resolves them to offsets in `src/app/api/feedback/route.ts`.
- Uses the Anthropic SDK (`claude-opus-4-8`). Requires `ANTHROPIC_API_KEY` in the environment (e.g. `.env.local`).
