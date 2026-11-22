# Vault Structure Convention

```
$VAULT/
  Projects/
    <project-name>/
      _Index.md        # MOC: links to every note below, one line description each
      Architecture.md  # living doc, updated in place
      Decisions.md      # append-only log, dated entries, superseded not deleted
      Plan.md            # checkboxes, current + future steps
      Progress.md        # append-only session log, dated entries
      <topic notes...>   # anything that doesn't fit the above, linked from _Index.md
  Areas/                # ongoing non-project areas (e.g. "Finances", "Health")
  Inbox/                # unsorted capture, drained during cleanup passes
  _index/
    Home.md             # top-level MOC linking to every project/area index
    Workflows.md        # reusable multi-step checklists distilled from repeated work
    Templates/          # reusable note/document templates distilled from repeated patterns
```

## Note conventions

- **Dated entries** in Decisions.md / Progress.md use `## YYYY-MM-DD` headers,
  newest at the bottom (chronological), one bullet per item.
- **Links**: use `[[Note Name]]` wikilinks. Every note should be linked from
  at least one index/MOC — orphaned notes are a cleanup target.
- **Tags**: use sparingly, for cross-project themes only (`#recurring-issue`,
  `#blocked`). Don't tag what's already captured by folder location.
- **Titles**: specific and unique enough to search for
  ("Auth token refresh bug" not "Bug").

## Merge rules

- Same topic, different note → combine into the more complete/central one;
  redirect or delete the other; fix incoming links.
- Same log (Decisions/Progress), overlapping dated entries → dedupe by
  content, not just by date.
- **Decision changes** → never delete or rewrite the old entry. Mark it
  `**Superseded**` and link forward to the new entry
  (`→ [[Decisions#YYYY-MM-DD]]`). The old entry stays as permanent audit
  trail; only the "current" status changes.

## Cleanup triggers

Do a light cleanup pass on a project whenever you're already in it for a
task: check `_Index.md` is complete, look for orphans, look for two notes
that could be one. Don't do a full-vault sweep unless asked — scope
improvement to what you're already touching, to keep it cheap.

## Self-optimization triggers

While working, notice:
- A checklist/sequence of steps you've written out for this vault before →
  promote it to `_index/Workflows.md`, link to it instead of rewriting it.
- A note shape (headings/fields) reused across 2+ projects → promote it to
  `_index/Templates/<name>.md`, use the template for future instances.
