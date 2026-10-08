# touched

A Claude Code mod. `/touched` toggles a pane listing the markdown files changed this session (title and filename, newest first). Select one to preview it, formatted, without leaving Claude Code.

- **Tracking:** Edit/Write calls, plus a `git ls-files` rescan after Bash/PowerShell calls that may have written.
- **List keys:** `1`-`9`, then `a`-`z` open a row. Esc closes the pane.
- **Preview keys:** `n`/`p` next/previous page, `g` top, `e` end, `q` back. Arrows, PgUp/PgDn, Home/End and the wheel scroll.

## Install

```
/plugin marketplace add allank/touched
/plugin install touched@touched
```

Or in one step: `/plugin install touched --marketplace allank/touched`. Update with `claude plugin update touched@touched`.

A mod is code that runs with your permissions and is not sandboxed. Read `hooks/register.tsx` before installing; `claude plugin validate .` lists what it hooks and calls.

Try it from a clone: `claude --plugin-dir .` then `/touched`.
Test it: `claude plugin test` (typecheck with `tsc -p .` after `/plugin-types .claude/types`).
