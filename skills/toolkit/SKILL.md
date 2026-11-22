---
name: toolkit
description: Fetch a tool from the shared kit instead of writing a new script, identify which project the current work belongs to, and record a finding in the right place. Load at the start of any task on the projects drive, before writing any script, and before saving any doc or memory. Triggers on the project names, Library, Perforce, publish, sign, manifest, Figma, Unreal, audit, cleanup, encoding, duplicate, token, dead path, وثق, سجل, or any request to write a script, doc or memory.
---

# Toolkit, project map, and where a record goes

Three jobs, in the order they come up: **get the right tool** · **know which project you are in** ·
**put a record where it belongs**.

---

## 1. The toolkit — fetch, don't build

```
<library>\2-Tools
```

**Search here before writing any script.** If a tool exists, use it. Never write a tool in order
to build another tool.

```powershell
<library>\2-Tools\run.ps1                           # list every tool
<library>\2-Tools\run.ps1 <Name> -P @{ Help=$true } # its parameters
<library>\2-Tools\run.ps1 <Name> -P @{ ... }        # run it
```

Pick by symptom:

| Symptom | Tool |
|---|---|
| Arabic or dashes turned into garbage characters | `Test-Encoding` (`-Fix` repairs, keeps a `.bak`) |
| About to write a file containing Arabic | `Write-File` (UTF-8 no BOM) |
| A rules/README file points at something missing | `Test-DeadPaths` |
| Need the cost of always-loaded files | `Get-TokenCount` |
| Same file living in several places | `Get-Duplicates` |
| Disk full of build/cache folders | `Get-DeadWeight` (measures + prints commands, never deletes) |
| A recursive search hangs on a big drive | `Find-Files` |
| Work rules lost, machine or account changed | `Get-UserVoice` |
| Anything Unreal (assets, deps, actors, level migrate) | `ue.ps1` + `recipes\` — see `README.md` |

**Ready-made calls with real parameters: `reference/tools.md`.** Open it instead of spending a round
trip on `-Help`.

🔴 **`Test-DeadPaths` only sees ABSOLUTE paths.** A relative path, a skill name, or a bare filename
passes it clean while being just as dead. "All paths resolve" is not "nothing is stale" — the names
a file mentions still have to be checked by hand.

**Adding a tool** — only when nothing in the kit fits: a `.ps1` in `tools\` whose first comment line
is `# DESC: short description`. It appears in the list automatically. 🔴 A `.ps1` dropped in the kit
**root** never gets listed and will be rewritten by the next person who needs it.

**Hard rule:** every `.ps1` in the kit stays **ASCII-only**. PowerShell 5.1 reads a BOM-less `.ps1`
as ANSI, so an Arabic character or an em-dash inside the code corrupts the file and it stops parsing.
Arabic goes in `.md` files. Character ranges in regex get built from codes: `[char]0x0600`.

---

## 2. The project map

Projects live at the root of one drive. **Confirm which one the work belongs to before editing or
recording** - the answer decides where every doc and every memory goes in §3.

| Project | Root | Stack |
|---|---|---|
| **Project A** | `<projects>/project-a` | C# / .NET / WPF |
| **Villa** | `<projects>/villa` | Unreal Engine 5.7, C++ |
| **Library** | `<library>` | shared, not a project - `1-Plugins` · `2-Tools` (the kit) · `3-Assets` |
| **Perforce** | `<perforce>` | Helix depots - sync/submit target, **never the edit target** |

(The real file lists every project on the machine; names and paths are replaced here.)

---
## 3. Where a record goes

🔴 **Recording happens only on "وثق" or "سجل". Nothing is written unasked** — not docs, not skills,
not memories, not summary files of any name. A finished task is not a trigger.

**The two words mean different destinations. They are not interchangeable.**

| Word | Means | Goes to |
|---|---|---|
| **وثق** | write the doc | the project's own docs location (below) |
| **سجل** | save to memory | the memory folder for the current project (below) |

### وثق — project docs

| Project | Docs go to |
|---|---|
| **Project A** | `<projects>/project-a/docs` - file named `V<next>_<TOPIC>.md` |
| **Villa** | Obsidian → `villa\` — `00-Overview` · `01-Systems` · `02-Flows` · `03-Reference` · `04-Findings` · `05-Workflow` |
| **Other projects** | not established — **ask before recording** |
| **Cross-project rules** | `<vault>\القواعد العامة.md` |

A doc is a record: **never first person, never conversational.** It states what is, not what happened
in a chat.

### سجل — memory

```
%USERPROFILE%\.claude\projects\<project-slug>\memory\
```

**One fact per file.** The file:

```markdown
---
name: <short-kebab-case-slug>
description: <one line — this is what decides whether the memory gets recalled later>
metadata:
  type: user | feedback | project | reference
---

<the fact. For feedback and project, follow with **Why:** and **How to apply:** lines.
Link related memories with [[their-name]].>
```

| type | for |
|---|---|
| `user` | who they are — role, expertise, preferences |
| `feedback` | how to work: a correction or a confirmed approach — **include the why** |
| `project` | ongoing work, goals, constraints not derivable from the code or git history |
| `reference` | pointers to external resources — URLs, dashboards, tickets |

Then **one line in `MEMORY.md`** in the same folder: `- [Title](file.md) — hook`.
`MEMORY.md` is the index that loads every session: **one line per memory, never the content itself.**

Before writing, check the folder for a file that already covers it — **update that one rather than
creating a second**. Two memories on one fact is the same defect as two copies of one file.

🔴 **Don't save what is already recorded elsewhere** — code structure, past fixes, git history, or
anything already in `CLAUDE.md`. A memory earns its place by holding what the repo cannot tell you.

🔴 **Absolute dates, never relative.** "last week" is wrong the moment it is read again.

🔴 **A record goes to its own project's location only** — never into another project, never into
this skill, never into the general rules file.

---

## 4. Before you call it done

| Check | Command |
|---|---|
| The file has Arabic in it | `Test-Encoding` on it — **after** writing, not before |
| It names paths | `Test-DeadPaths` — then check relative names and skill names by hand |
| It loads every session | `Get-TokenCount` — know the cost you just added |
