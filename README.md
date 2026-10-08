# touched

A Claude Code mod. `/touched` opens a pane listing the markdown files changed this session (title and filename, newest first). Select one to preview it, formatted, without leaving Claude Code.

- **Tracking:** Edit/Write calls, plus a `git ls-files` rescan after Bash/PowerShell calls that may have written.
- **List keys:** `1`-`9`, then `a`-`z` open a row. Esc closes the pane.
- **Preview keys:** `n`/`p` next/previous page, `g` top, `e` end, `q` back. Arrows, PgUp/PgDn, Home/End and the wheel scroll.

Try it: `claude --plugin-dir .` then `/touched`.
Test it: `claude plugin test` (typecheck with `tsc -p .` after `/plugin-types .claude/types`).
