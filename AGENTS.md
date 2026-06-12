<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Conventions

- Component files live in `src/components/` and are named in **kebab-case** (e.g. `editor.tsx`, `note-list.tsx`). The default-exported React component itself keeps PascalCase.
- Import components via the `@/components/...` alias.
