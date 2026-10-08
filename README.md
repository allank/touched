# touched

A [Claude Code mod](https://code.claude.com/docs/en/plugins/mods/overview). Type `/touched` to open a pane listing the markdown files changed this session (title and filename, newest first). Select one to read it, formatted, without leaving Claude Code. No diffs, just the documents.

## Install

**Requirements**

- Claude Code with mods enabled: v2.1.287 or later in the terminal (check with `claude --version`). Mods draw in the terminal and the Desktop app's Code tab.
- `git` on your `PATH`, only for spotting markdown changed by shell commands. Without a git repo, edits Claude makes with its Edit and Write tools are still tracked.

**Steps**

1. Add this repo as a marketplace. In a Claude Code session:

   ```text
   /plugin marketplace add allank/touched
   ```

2. Install the plugin:

   ```text
   /plugin install touched@touched
   ```

   Claude Code opens the plugin's details. Read them, then choose a scope:

   - **Install for you (user scope):** available in every project. Pick this unless you have a reason not to.
   - **Install for all collaborators on this repository (project scope):** enabled for the whole repo.
   - **Install for you, in this repo only (local scope):** just this repo.

3. If the summary says `Run /reload-plugins to apply`, run `/reload-plugins`.

4. Check it worked. Ask Claude to edit a markdown file, then run `/touched`.

**One-step alternative**

```text
/plugin install touched --marketplace allank/touched
```

**From a shell** (for scripts or setup):

```bash
claude plugin marketplace add allank/touched
claude plugin install touched@touched --scope user
```

Plugins installed from a shell load the next time you start Claude Code, or when you run `/reload-plugins` in a session that is already open.

**Trust:** a mod is code that runs with your permissions and is not sandboxed. Read `hooks/register.tsx` before installing, or run `claude plugin validate .` in a clone to list what it hooks and calls. This mod reads files you ask it to preview and runs one `git ls-files` command after shell calls that may have written. It makes no network requests.

### Update

Third-party marketplaces do not auto-update by default. To update:

```bash
claude plugin update touched@touched
```

Or turn on auto-update: `/plugin`, **Marketplaces** tab, select `touched`, **Enable auto-update**.

### Uninstall

```bash
claude plugin uninstall touched@touched
claude plugin marketplace remove touched
```

Removing the marketplace also uninstalls its plugins.

### Troubleshooting

- **`/touched` is not found:** run `/plugin`, open the **Installed** tab and confirm `touched` is enabled, then run `/reload-plugins`. Check the **Errors** tab for load failures.
- **Nothing happens or mods are off:** mods can be switched off with `"disableAllHooks": true` in settings, `--safe-mode`, or an organization policy. See [Turn mods on or off](https://code.claude.com/docs/en/plugins/mods/overview#turn-mods-on-or-off).
- **The list is empty:** only markdown files changed in the current session appear. Files that no longer exist are dropped.
- **Shell-made changes are missing:** they need a git repository, and the file must have been modified since the session started.

## Use

Run `/touched` to open the pane. Run it again to close it.

| Where | Key | Does |
| --- | --- | --- |
| List | `1`-`9`, then `a`-`z` | Open that row (first 35 rows; others are click-only) |
| List | Esc | Close the pane |
| Preview | `n` / `p` | Next / previous page of a long file |
| Preview | `g` / `e` | Jump to top / end |
| Preview | `q` | Back to the list |
| Preview | Arrows, PgUp/PgDn, Home/End, wheel | Scroll within a page |

**What counts as changed:** markdown files Claude wrote or edited with the Edit and Write tools, plus markdown files that a `git ls-files` check finds modified since the session started, run after any Bash or PowerShell call that may have written. A markdown file you edit in another editor mid-session can appear after the next shell call.

**Titles** come from the frontmatter `title`, else the first `#` heading outside code blocks, else the filename marked `(no title)`.

## Develop

```bash
claude --plugin-dir .      # load this clone for one session, then /touched
claude plugin test         # run the tests (no session needed)
claude plugin validate .   # check the manifests and list what the mod calls
```

Typecheck with `tsc -p .` after writing the engine's types with `/plugin-types .claude/types`.

The spec this was built from is [issue #7](https://github.com/allank/touched/issues/7).
