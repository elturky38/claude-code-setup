---
name: clean-architecture
description: Use when writing, reviewing, splitting, or restructuring code — before adding a class or module, when a file has grown large, when deciding where something belongs, or when a change forces edits in several places. Applies Robert C. Martin's Clean Architecture as concrete checks: SRP by actor, dependency direction, acyclic components, stable-dependency, boundaries, and framework-as-detail.
---

# Clean Architecture

The standard for what code should look like. The chapter-by-chapter source lives at
`<library>\5-Books\clean-architecture` — open the relevant part rather than working from
memory. This file is the working checklist, not a replacement for it.

**Announce at start:** "I'm using the clean-architecture skill."

## The one rule everything else serves

**Dependencies point inward.** Business rules never depend on the things that deliver them —
UI, database, framework, web, device. Those are details, and details change.

If a change to the database, the UI framework, or the engine forces a change in business rules,
that is the defect. Not a tradeoff, not a shortcut: the defect.

## Check 1 — SRP: one reason to change

`Part 3, Chapter 7`

SRP is **not** "does one thing". It is *"a module should have one, and only one, reason to change"*,
and a reason to change is an **actor** — a person or group who would ask for the change.

Ask of any module: **who asks for changes here?** Name them. More than one name is the violation.

Two symptoms to look for:

| Symptom | What it looks like |
|---|---|
| Accidental duplication | A change made for one stakeholder silently breaks another's feature |
| Merge conflicts | Two people from different teams keep editing the same file |

The fix is redistribution across classes, with a Facade in front. Objection "that gives me
one-method classes" — no: one **public** method, as many private as it needs.

## Check 2 — Dependency direction

Draw the arrows before writing code. For each `#include` / `import` ask: **is this pointing
inward, toward more stable policy?** If a core module names a UI type, the arrow is backwards.

Fix by **DIP**: the inner layer declares an interface, the outer layer implements it. The name
moves inward; the implementation stays outward.

## Check 3 — ADP: no cycles

`Part 4`

Components must form a directed **acyclic** graph. A cycle means neither component can be built,
tested, or reasoned about alone. Measure it — do not assume it. Cycles hide in the reverse
direction, in the one or two includes going the wrong way.

Break a cycle with DIP, or by extracting the shared piece into a new component.

## Check 4 — SDP and SAP: depend toward stability

Depend in the direction of **stability**. A component that many things depend on must be hard to
change; a component that changes often must be depended on by little. And a stable component
must be **abstract** (SAP) — otherwise it is rigid rather than stable.

Practical test: a module named `Core` that imports every feature is not core. Core imports nothing.

## Check 5 — Boundaries

`Part 5`

A boundary is drawn along an **axis of change**: things that change for different reasons, at
different rates, for different people, go on opposite sides.

The dangerous boundaries are the ones no compiler checks:

- Strings shared between two languages (command names, event names, JSON keys)
- Asset paths hardcoded in code
- Names that a serialized file or an editor references by string

For each one, ask: **what proves both sides still agree?** If nothing does, that is the first
thing to build — one source of truth per side, plus a check that they match.

## Check 6 — The framework is a detail

`Part 6`

The framework, the database, the web, the engine — none of them is the architecture. They are
plugins to the business rules. Do not marry the framework: use it, keep it at arm's length, and
keep the decision reversible for as long as the work allows.

Good architecture **defers decisions**, it does not lock them in early.

## File structure follows from this

- One clear responsibility per file; files that change together live together.
- Split by responsibility, not by technical layer.
- In an existing codebase, follow its established patterns — do not unilaterally restructure.
  But if a file you are already modifying has grown unwieldy, splitting it is in scope.

## Refactor safety

Restructuring must not change behaviour. Before moving anything, know what proves that:

- What command proves the build still works?
- What contract is referenced by **name** from outside the compiler's view — serialized assets,
  scripts, config, another language? Count it before, count it after.
- Renaming is the highest-risk operation, because names are exactly what those outside references
  hold. Prefer moving over renaming.

Pair this with `superpowers:verification-before-completion` — no completion claim without a
verification command run in the same message.
