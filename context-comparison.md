# /context: old setup vs current

Measured on 2026-11-22 with Claude Code 2.1.330.

How: the old global CLAUDE.md and the old skills folder (as they were before I cut the setup down on
2026-10-26) were copied into an empty folder, and `claude -p "/context"` was run there. The same
command was run in another empty folder for the current setup. My current global CLAUDE.md loads in
both runs, so the old files show up as an extra "Project" entry.

| | Old setup | Current |
|---|---|---|
| Memory files | 4.5k (current 1.5k + old CLAUDE.md 3k) | 1.5k |
| Skills | 3.5k | 2.5k |
| Total context at start | 34.9k | 31.9k |

Old skill descriptions, as /context listed them: brainstorming ~70, clean-architecture ~140,
dispatching-parallel-agents ~50, executing-plans ~40, finishing-a-development-branch ~50,
receiving-code-review ~90, requesting-code-review ~40, subagent-driven-development ~40,
systematic-debugging ~40, test-driven-development ~40, toolkit ~170, using-git-worktrees ~70,
using-superpowers ~60, verification-before-completion ~90, writing-plans ~30, writing-skills ~40.
Most of these came from the open-source Superpowers set. Only clean-architecture, toolkit and
obsidian-brain (in `skills/`) are mine.

Not shown by /context: the old UserPromptSubmit hook (`hooks/global/enforce-method.js`) added a
reminder to every prompt.

My own estimation script said 2,591 tokens for the old CLAUDE.md and 2,002 for the current one.
/context says 3k and 1.5k, so I use /context now.
