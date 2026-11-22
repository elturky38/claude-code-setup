# Ready-made calls

Every parameter below is read out of the tool's own `param()` block. Defaults are shown so you know
what happens when you leave one out — the common mistake is `Pattern`, which defaults to `*.md` and
silently skips the code you meant to scan.

```powershell
$K = '<library>\2-Tools\run.ps1'
```

---

## Test-Encoding — corrupted text

`Path` (required) · `Pattern` = `*.md` · `-Fix`

```powershell
& $K Test-Encoding -P @{ Path='D:\proj'; Pattern='*.cs' }
& $K Test-Encoding -P @{ Path='<project>\notes.md'; Fix=$true }   # repairs, keeps a .bak
```

Run it **after** writing any file that contains Arabic. Clean output is the only proof the write
survived.

---

## Write-File — UTF-8 without BOM

`Path` (required) · `Content` · `-Append` · `-NoNewline` · `-Bom`

```powershell
& $K Write-File -P @{ Path='<project>\notes.md'; Content=$text }
& $K Write-File -P @{ Path='<project>\tool.ps1'; Content=$code; Bom=$true }
```

🔴 **`-Bom` for `.ps1` targets only.** PowerShell 5.1 needs the BOM to read non-ASCII source — but
kit scripts stay ASCII-only anyway, so this is for scripts outside the kit.

Why it exists: `Set-Content`, `Out-File` and `>` in PowerShell 5.1 fall back to the system ANSI
codepage or UTF-8 **with** BOM. Both corrupt Arabic and em-dashes for the next reader.

---

## Test-DeadPaths — instructions pointing at nothing

`Path` (required) · `Pattern` = `*.md` · `Roots` = `C: D: E: Z:`

```powershell
& $K Test-DeadPaths -P @{ Path='%USERPROFILE%\.claude'; Pattern='CLAUDE.md' }
& $K Test-DeadPaths -P @{ Path='D:\proj'; Pattern='*.md'; Roots=@('D:') }
```

🔴 **Absolute paths only.** Relative paths, skill names and bare filenames pass clean while being
just as dead. Check those by hand.

---

## Get-Duplicates — one truth in several places

`Root` (required) · `Pattern` = `*.md` · `MinKB` = `0.1` · `Depth` = `6`

```powershell
& $K Get-Duplicates -P @{ Root='D:\proj'; Pattern='*.js' }
```

Matches by **content hash**, not by name — so a renamed copy is still caught, and two different
files with the same name are not.

---

## Get-TokenCount — cost of always-loaded files

`Path` (required) · `Pattern` = `*.md` · `Top` = `0` (all)

```powershell
& $K Get-TokenCount -P @{ Path='%USERPROFILE%\.claude'; Pattern='*.md'; Top=10 }
```

Run it on anything that loads every session. A number you have not measured is a cost you are paying
blind.

---

## Get-DeadWeight — regenerable folders eating disk

`Root` (required) · `Depth` = `4` · `MinMB` = `10` · `-Command`

```powershell
& $K Get-DeadWeight -P @{ Root='D:\'; MinMB=100; Command=$true }
```

**Measures and prints the commands. Never deletes.** Deleting is a decision, and the decision is not
yours to take alone.

---

## Find-Files — search that does not hang

`Root` (required) · `Name` (required) · `Depth` = `4` · `Seconds` = `20` · `-All`

```powershell
& $K Find-Files -P @{ Root='D:\'; Name='*.uproject'; Depth=4 }
```

Use this instead of a plain recursive search on a full drive — the depth and time caps are the whole
point.

---

## Get-UserVoice — recover the work rules

`Project` · `Out` · `Grep` · `MaxLen` = `400`

```powershell
& $K Get-UserVoice -P @{ Grep='ابدا'; MaxLen=200 }
```

Pulls the user's own messages out of Claude transcripts. For when the machine or account changed and
the rules are gone.

---

## ue.ps1 — anything Unreal

Separate runner, not part of `run.ps1`:

```powershell
$UE = '<library>\2-Tools\ue.ps1'

powershell -File $UE -Project "<project>\<name>.uproject" -Recipe assets
powershell -File $UE -Project "<project>\<name>.uproject" -Recipe deps -Args @{ map='/Game/map/L1'; mode='hard' }
```

`Project` (required) · `Recipe` (a `.py` in `recipes\`) · `Args` hashtable · `Code` for inline
Python · `Engine` auto-detected from the `.uproject` · `Out` · `-Quiet`

It handles the boilerplate: Asset Registry init, level loading, path conversion, the
`UnrealEditor-Cmd` call, reading the output back. Full list of recipes and examples: `README.md`.
