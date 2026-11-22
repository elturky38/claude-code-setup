# claude-code-setup

The hooks and skills I used with Claude Code from August to October 2026, mostly on a large Unreal
Engine 5.7 C++ project (a villa configurator for the studio I work at). Project names, class prefixes
and paths are replaced (`PRJ`, `<project>`, `<workspace>`), so the scripts show how it worked but
won't run as-is on another project.

The idea behind all of it: a rule the agent can skip gets skipped. If a script can check it, it goes
in a hook. If it needs judgment, it goes in a skill.

## hooks/unreal-build-gate

Wired to PostToolUse (after an edit: build and report, never block) and Stop (block with exit 2 until
the build is green). See `settings/unreal-project-settings.json`.

| File | What it checks |
|---|---|
| `verify-build.sh` | the gate itself: build, Blueprint contract count, the checks below, automation tests, circuit breaker after the same failure twice |
| `build-outcome.sh` | SUCCEEDED / FAILED / BLOCKED. BLOCKED = the build never ran (editor open, Live Coding, locked DLL), so it's not blamed on the code |
| `test-roster.js` | every automation test declared in the source has to finish in the log, by name |
| `check-architecture.js`, `rings.js` | include direction between layers |
| `check-boundary.js` | command and event names shared as plain strings between C++ and the web UI |
| `check-unity.js` | the same file-local helper in two .cpp files (breaks only when unity build groups them) |
| `check-duplication.js` | the same method implemented in two feature folders |
| `check-purity.js` | the inner layers don't include engine headers |
| `metrics.js` | instability / abstractness per component |
| `test-ui.js`, `test-build-outcome.sh` | tests for the web layer and for the outcome parser |

Each file starts with the incident that made it necessary.

## hooks/global

Used on every project (`settings/global-settings.json`).

- `verify-before-done.js` (Stop): if the turn edited files, says it's done, and ran no build or test
  after the last edit, the stop is refused once. Its log from 2026-09-15 to 2026-10-25: 2,161 stops
  checked, 10 blocked.
- `architecture-gate.js` (PreToolUse on Edit/Write): stops a second writer to a value another file
  already sets, and asks for the clean-architecture skill before a new class.
- `enforce-method.js` (UserPromptSubmit + PreToolUse): tells the agent which skill a request needs.

## skills

`clean-architecture`, `toolkit` and `obsidian-brain`.

## context-comparison.md

`/context` for the old setup and the current one.

Written with Claude Code: I set the rules and checked the results, and Claude wrote the scripts.

MIT license.
