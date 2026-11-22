---
name: obsidian-brain
description: >
  Standing workflow rule that makes an Obsidian vault the sole source of truth
  and memory for all projects, and keeps chat output minimal. ALWAYS consult
  this skill for every task in every conversation - coding, planning,
  research, decisions, writing, note-taking, or "continue where we left off"
  requests - because it governs how ALL work gets read from and written to
  Obsidian instead of chat. Trigger even when the user doesn't mention
  Obsidian by name; any request to build something, decide something,
  document something, or resume a project falls under this skill. Also
  trigger on explicit mentions of "vault", "notes", "Obsidian", "continue the
  project", "pick up where we left off", or "clean up my notes".
---

# Obsidian Brain

Obsidian is the brain. Chat is the keyboard. Nothing of substance lives in the
conversation — it lives in the vault, and chat only confirms it happened.

## 0. Vault location (fixed default — do not ask)

**Default vault path:** `<vault>`

This is also stored in `references/vault_path.txt`. Use it as-is. Never ask
the user for the vault path — it is already known. Only change it if the
user explicitly gives a new path in the conversation, in which case update
`references/vault_path.txt` to the new value and use that from then on.

**Windows path, POSIX shell (WSL/Git Bash)**: if `bash` can't resolve the
`C:\...` form directly, try in order without asking the user:
- WSL-style: `<vault>`
- Git Bash-style: `<vault>`
- The path as-given, unmodified (native Windows tools / PowerShell)

Only surface a question if every form fails to resolve (path genuinely
doesn't exist) — then ask the single minimal question: `"Vault path not
found — correct path?"`

All paths below are relative to `$VAULT` (the resolved path).

## 1. Before doing anything: read the vault, not the chat

For any task that touches an existing project (coding, planning, continuing
work, "what's next", etc.):

1. `rg -il "<project-or-topic-keywords>" "$VAULT"` (or `scripts/vault_search.sh`)
   to find relevant notes.
2. Open the project's index/MOC note first (see §3) — it links to
   architecture, decisions, and progress notes. Read those before asking the
   user anything.
3. Only ask the user a question if the answer genuinely isn't in the vault
   and isn't inferable. Never ask for something already documented.
4. Do not rely on chat scrollback as a source of project state — treat each
   conversation as if it has amnesia and the vault is the only memory.

## 2. While doing the task

Work normally (write code, research, plan, decide). Keep any intermediate
reasoning out of chat — draft it directly into the relevant Obsidian note, or
hold it in your own working memory until step 3, rather than narrating it in
the conversation.

## 3. After finishing: write to Obsidian, not to chat

Every unit of finished work gets written into the vault before you reply:

- **Decisions** → `Projects/<project>/Decisions.md` (append, dated, one line
  each: what was decided + one-line why).
- **Architecture / how things fit together** → `Projects/<project>/Architecture.md`
  (update in place — this is a living document, not a log).
- **Plans / next steps** → `Projects/<project>/Plan.md` (checkboxes; check off
  completed items, add new ones).
- **Progress / session log** → `Projects/<project>/Progress.md` (append,
  dated, terse: what changed, not how you felt about it).
- **General explanations / reasoning / docs** → the most specific existing
  note on that topic, or a new note under `Projects/<project>/` if nothing
  fits.
- **Code**: written to the actual codebase as normal; only the *why* and
  *what's left* go into Obsidian, not the code itself.

Every project has one index note: `Projects/<project>/_Index.md`, a Map of
Content linking to the notes above. Update its links whenever you add or
rename a note. See `references/vault_structure.md` for the full convention.

### Never duplicate — merge

Before creating a new note or section:
1. Search for existing notes covering the same topic (`scripts/vault_search.sh
   "<keywords>"`).
2. If found: merge the new information into the existing note (update facts,
   append new dated entries to logs). Never leave two notes covering the
   same ground.
3. If the new info **changes a prior decision**, do not delete the old
   entry — mark it `Superseded` and link to the new one (see §3a). This
   keeps a complete audit trail.
4. If merging reveals the old note is poorly organized (mixed topics, stale
   info, orphaned/no links from the index), fix that too while you're in
   there — see §4. This happens silently, without narrating it in chat.

### 3a. Decision history is append-only

`Decisions.md` entries are never deleted or rewritten, only superseded:

```
## 2026-06-18
- Considered session-cookie auth. **Superseded** by 2026-06-22 → [[Decisions#2026-06-22]]

## 2026-06-22
- Switched to JWT, 24h expiry.
```

Rules:
- Old decision stays, tagged `**Superseded**`, with a link forward to the
  decision that replaced it.
- New decision states what changed; no need to link backward (the forward
  link from the old entry is enough to reconstruct history either direction).
- Never delete a decision entry, even a wrong one — mark and link instead.
- This gives a complete, navigable audit trail without cluttering chat.

## 4. Continuous vault improvement (do this unprompted)

Whenever you touch the vault for a task, opportunistically — without being
asked and without a separate chat message about it:
- Merge any duplicate or near-duplicate notes you encounter.
- Fix broken/missing links; make sure every note is reachable from its
  project's `_Index.md`.
- Split notes that have grown to cover multiple unrelated topics.
- Keep folder structure and naming consistent with
  `references/vault_structure.md`; correct drift when you see it.
- Preserve all information when reorganizing — improve structure, never
  delete content; superseded decisions are marked, not deleted (§3a).

## 4a. Self-optimization: compress repetition into reusable assets

Watch for repeated work across tasks/projects and convert it into a reusable
asset in the vault, unprompted:

- **Same multi-step task done 2+ times** → write it up as a checklist or
  workflow note in `_index/Workflows.md` (one section per workflow), and
  link relevant projects to it instead of re-describing the steps.
- **Same structural pattern reused** (e.g. every project needs the same kind
  of migration note, same API doc shape) → capture it as a template under
  `_index/Templates/` and use that template going forward instead of
  writing similar notes from scratch each time.
- **Same explanation/decision rationale needed repeatedly** → put it once in
  the most central note, link to it everywhere else instead of restating it.
- Do this silently as part of normal task completion — no separate chat
  message announcing it. It shows up in the vault, not the conversation.

The objective: fewer tokens spent re-deriving or re-explaining things across
sessions, more of the vault doing the remembering.

## 5. Chat output rules

- Default reply after completing a task: exactly `Done.` — nothing else,
  no summary, no bullet recap, no "here's what I did."
- Chat is a command interface, not a documentation surface. Never restate,
  summarize, or preview information that is now in the vault.
- Never explain your reasoning, choices, or steps in chat unless the user
  explicitly asks for it in that message. Default assumption: they don't
  want it.
- Give more than `Done.` only when:
  - the user explicitly asks for details/explanation, or
  - a clarifying question is genuinely required to proceed (ask the single
    minimal question needed — no preamble, no multi-paragraph setup), or
  - something failed and the user needs to know to unblock you.
- Token efficiency is the top priority, including in your own tool use:
  don't re-read the whole vault when a targeted search suffices, don't
  re-summarize a note back into itself, don't narrate intermediate steps.

## Quick reference

| Situation | Action |
|---|---|
| Any task starts | Read vault first (never re-ask what's already documented) |
| New info overlaps existing note | Merge, don't duplicate |
| A prior decision changes | Mark old entry `Superseded`, link forward, keep both |
| Task finishes | Full detail → vault, reply `Done.` |
| Same workflow done again | Compress into a checklist/template in `_index/` |
| Vault has stale/duplicate/messy notes | Clean up silently while you're there |
| Missing info not in vault | Ask one minimal question, nothing more |
| User asks for details | Give them — otherwise stay terse |

See `references/vault_structure.md` for folder/note conventions and
`scripts/vault_search.sh` for the search helper.
