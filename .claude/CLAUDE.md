# RunHub — Claude Context

## Stack
- **Client**: React + Vite on port 5173 (`client/`)
- **Server**: Node on port 3001 (`server/`)
- **DB/Auth**: Supabase (`supabase/`)
- **Shared types/utils**: `shared/`
- **Core IP**: `plan_generation_prompt.md` (marathon/training plan generation logic)

## Rules for working in this repo

1. **Use Context7 MCP** for library/API docs, code generation, and setup steps — without me asking. Especially for React, Vite, Supabase, Node, and any SDK usage. Don't rely on training-data versions of fast-moving libraries.

2. **Before editing `plan_generation_prompt.md`**: read the whole file first. It's core product logic and small wording changes have outsized behavioral impact. Propose diffs, don't rewrite wholesale.

3. **Don't touch Supabase migrations** without confirming with me first — production data implications.

4. **Respect the client/server/shared boundary.** Types used by both client and server live in `shared/`. Don't duplicate.

5. **Commit style**: concise, imperative mood ("Add plan regeneration endpoint", not "Added plan regeneration"). No Claude co-author lines. No emoji in commit messages.

6. **Definition of done**: if you changed client code, confirm it builds (`npm run build` in `client/`). If you changed server code, confirm the endpoint responds. Don't mark tasks complete on "should work."

7. **Communication style**: direct, no fluff, no excessive preamble. If you're unsure, say so and ask. If you made an assumption, state it inline.

## Active MCPs on this machine
- Context7 (docs retrieval)
- Filesystem (scoped to `/Users/mac/Dev`)
