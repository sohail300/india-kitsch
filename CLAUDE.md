@AGENTS.md

## Commit workflow

- Commit messages: subject line, blank line, then bullet points (`- `). Each bullet must be a single unbroken line — do not hard-wrap a bullet's text across multiple lines.
- Never add `Co-Authored-By` / `Generated-with` attribution lines.
- Always show the full commit message(s) for approval before running `git commit`. Only commit after an explicit go-ahead (e.g. "commit them", "go") — drafting/showing a message is not itself approval to commit.

## How this project is driven

- The owner drives the backend-first roadmap (`docs/10-roadmap.md`, Phases 0–14) with short go-aheads ("proceed", "yes", "commit"), trusting the assistant to independently scope/design/implement each phase from the already-written `docs/*.md` files rather than re-explaining intent every time.
- Never start the next phase (or move into frontend work) just because the current one is committed — always wait for an explicit go-ahead.
- When real third-party credentials are needed and not yet set (payments, email, storage, etc.), ask rather than guess, then wait for them to be configured.
- Verify new backend functionality against real infrastructure wherever feasible (real DB, real buckets, real test-mode APIs), not only mocks — and when that surfaces a real bug or environment quirk, document it in the relevant `docs/*.md` file's "Implementation notes" section instead of silently working around it.
- **`public/` is the owner's own unrelated work** (not project scaffolding) — never stage, commit, move, or delete anything under it unless explicitly asked to in that session.
