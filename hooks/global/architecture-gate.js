// The architecture checks, enforced instead of remembered.
//
// 🔴 WHY THIS FILE EXISTS, MEASURED RATHER THAN FELT.
//
// One session (2026-09-15) built UPRJStepSmoothingComponent. It wrote the camera's
// relative Z every tick. PRJRenderCamera.cpp:431 already wrote that same field from the
// HIGHT slider. Two writers, one value - so the slider went dead the moment the component
// shipped, and the user found it, not the author.
//
// That is Clean Architecture Check 1 (SRP by actor) and Check 5 (boundaries), and the skill
// carrying both was INSTALLED AND NEVER INVOKED that session. systematic-debugging was
// called; clean-architecture was not. The principles were worked from memory, and memory
// produced a class that took a value belonging to somebody else.
//
// enforce-method.js cannot catch this. It gates rule 9 and injects rule 15 as prose at
// prompt time - useful, and demonstrably not enough: the reminder was on screen for the
// whole session that produced the bug. A reminder is a suggestion. This is a stop.
//
// ── the two checks, and what each one really costs ───────────────────────────
//
//   A. THE SKILL GATE. Creating a new type - class, struct, namespace - with the
//      clean-architecture skill never invoked this session is refused. One refusal per
//      session; invoking the skill clears it for good.
//      COST: a genuinely trivial new type still pays one skill call. Accepted - the call is
//      cheap and the decision it guards is the expensive one.
//
//   B. THE SECOND-WRITER STOP. A setter that is NEW to the file being written, and that
//      some other file in the project already calls, is refused ONCE with the list of those
//      other files. Answer the question - who owns this value - and the retry goes through.
//      NARROWED ON PURPOSE to setters new to this file: a file that already writes a value
//      is not the moment ownership gets decided. The moment is the first write.
//      COST, STATED: it matches by METHOD NAME, so `Mesh->SetRelativeLocation` and
//      `DoorPivot->SetRelativeLocation` read as the same question. That is noise, and it is
//      the right noise: the answer takes one grep and the miss took a working feature.
//      IT WOULD HAVE CAUGHT THE BUG ABOVE - and receiver-name matching would NOT have, since
//      the component called its target `Target` and the panel called it `Camera`. That was
//      measured before this file shipped rather than assumed after.
//
// NEVER BREAKS THE SESSION: every failure path exits 0. A gate that takes the session down
// gets switched off within a day, and then it gates nothing.
'use strict';
const fs = require('fs');
const path = require('path');

const SOURCE = /\.(cpp|h|hpp|cc|cxx|c|cs|ts|tsx|js|jsx|py|java|go|rs)$/i;

// The working surface of a diagnosis, not the change being gated. Same exclusions as
// enforce-method.js, and they have to stay the same: two gates disagreeing about what
// counts as product code is a second source of truth about this repo's shape.
const NOT_PRODUCT = [/[\\/](scratchpad|Temp|tmp|Intermediate|Binaries|node_modules)[\\/]/i,
	/[\\/]\.claude[\\/]/i, /[\\/]docs[\\/]plans[\\/]/i];

// Setters whose owner is never in question: they configure the object the caller just made.
// Kept short and grown only on evidence - a generous skip list is this gate switched off
// one line at a time.
const ALWAYS_OWNED = new Set(['SetupAttachment', 'SetRootComponent', 'SetTraceLabel']);

const STATE = path.join(__dirname, '.arch-gate-state.json');
const MAX_FILES = 4000;      // past this the scan is abandoned rather than made slow
const MAX_BYTES = 1500000;   // per file

function out(obj) { process.stdout.write(JSON.stringify(obj)); process.exit(0); }
function deny(reason) {
	out({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });
}

let payload = {};
try { payload = JSON.parse(fs.readFileSync(0, 'utf8')); } catch (e) { process.exit(0); }
if ((payload.hook_event_name || '') !== 'PreToolUse') process.exit(0);

const input = payload.tool_input || {};
const file = String(input.file_path || '');
if (!file || !SOURCE.test(file)) process.exit(0);
if (NOT_PRODUCT.some(r => r.test(file))) process.exit(0);

// What is about to land in the file. Write carries the whole thing; Edit carries the new
// half only, which is exactly the half whose setters are new.
const incoming = String(input.content || input.new_string ||
	(Array.isArray(input.edits) ? input.edits.map(e => e.new_string || '').join('\n') : ''));
if (!incoming) process.exit(0);

// ── session state ────────────────────────────────────────────────────────────
const session = String(payload.session_id || 'unknown');
let state = {};
try { state = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) { state = {}; }
const mine = state[session] || (state[session] = { asked: [] });
function remember(key) {
	mine.asked.push(key);
	try { fs.writeFileSync(STATE, JSON.stringify(state)); } catch (e) { /* advisory only */ }
}

// ── A. the skill gate ────────────────────────────────────────────────────────
const declaresType = /\b(class|struct|namespace)\s+[A-Za-z_]/.test(incoming);
const isNewFile = !fs.existsSync(file);

if (declaresType || isNewFile) {
	const tp = payload.transcript_path;
	let invoked = false;
	if (tp && fs.existsSync(tp)) {
		try { invoked = fs.readFileSync(tp, 'utf8').includes('"skill":"clean-architecture"'); }
		catch (e) { invoked = true; }   // cannot tell - do not block
	} else {
		invoked = true;
	}

	if (!invoked) {
		deny('CLEAN ARCHITECTURE - THE SKILL WAS NOT INVOKED.\n'
			+ 'A new type is being created and `clean-architecture` has not been called this session, '
			+ 'so the checks are being worked from memory. That is exactly what produced the '
			+ 'UPRJStepSmoothingComponent / HIGHT-slider collision on 2026-09-15.\n'
			+ 'Invoke the skill, then answer these three out loud before writing:\n'
			+ '  1. WHO OWNS every value this type will write? Name the file:line that already writes it.\n'
			+ '  2. Do the dependency arrows point INWARD, toward policy rather than toward the engine?\n'
			+ '  3. Is the boundary on a real axis of change, or where it was convenient to put it?');
	}
}

// ── B. the second-writer stop ────────────────────────────────────────────────
function settersIn(text) {
	const found = new Set();
	const re = /(?:->|\.)\s*(Set[A-Z]\w*)\s*\(/g;
	let m;
	while ((m = re.exec(text)) !== null) found.add(m[1]);
	return found;
}

const incomingSetters = settersIn(incoming);
if (!incomingSetters.size) process.exit(0);

// Only setters NEW to this file. A file that already writes a value is past the moment
// ownership gets decided; re-asking there is the noise that gets a gate disabled.
let existing = new Set();
if (!isNewFile) {
	try { existing = settersIn(fs.readFileSync(file, 'utf8')); } catch (e) { /* treat as new */ }
}

const fresh = [...incomingSetters].filter(s => !existing.has(s) && !ALWAYS_OWNED.has(s)
	&& !mine.asked.includes(s + '@' + file));
if (!fresh.length) process.exit(0);

// ── the scan ─────────────────────────────────────────────────────────────────
const root = String(payload.cwd || process.cwd());
const hits = new Map();   // setter -> ["file:line", ...]
let budget = MAX_FILES;

(function walk(dir) {
	if (budget <= 0) return;
	let entries;
	try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
	for (const e of entries) {
		if (budget <= 0) return;
		const full = path.join(dir, e.name);
		if (e.isDirectory()) {
			if (/^(\.|node_modules$|Intermediate$|Binaries$|Saved$|DerivedDataCache$|Content$)/.test(e.name)) continue;
			walk(full);
		} else if (SOURCE.test(e.name) && path.resolve(full) !== path.resolve(file)) {
			budget--;
			let text;
			try {
				if (fs.statSync(full).size > MAX_BYTES) continue;
				text = fs.readFileSync(full, 'utf8');
			} catch (err) { continue; }
			for (const s of fresh) {
				if (!text.includes(s + '(')) continue;
				const lines = text.split('\n');
				for (let i = 0; i < lines.length; i++) {
					if (new RegExp('(?:->|\\.)\\s*' + s + '\\s*\\(').test(lines[i])) {
						if (!hits.has(s)) hits.set(s, []);
						const list = hits.get(s);
						if (list.length < 40) list.push(path.relative(root, full).replace(/\\/g, '/') + ':' + (i + 1));
						break;
					}
				}
			}
		}
	}
})(root);

if (!hits.size) process.exit(0);

for (const s of hits.keys()) remember(s + '@' + file);

/**
 * 🔴 NEAREST FIRST, AND THE ORDER IS THE WHOLE VALUE OF THE LIST.
 *
 * The first cut of this file showed the first four matches it happened to walk past. On the
 * very bug it was written for that was three unrelated actors and NOT PRJRenderCamera.cpp -
 * four files that all read "different object", and a stop that argues itself away is worse
 * than no stop. Sorting by how much of the path is shared puts the likeliest real owner at
 * the top, because in this codebase a shared module is a shared subject.
 */
const target = path.relative(root, file).split(path.sep).join('/').split('/');
function nearness(rel) {
	const parts = rel.split(':')[0].split('/');
	let n = 0;
	while (n < parts.length && n < target.length && parts[n] === target[n]) n++;
	return n;
}

const lines = [...hits.entries()].map(([s, where]) => {
	const sorted = where.slice().sort((x, y) => nearness(y) - nearness(x));
	const shown = sorted.slice(0, 5);
	const more = sorted.length - shown.length;
	return `  ${s}  <- already written in: ${shown.join(', ')}${more > 0 ? ` (+${more} more)` : ''}`;
});

deny('SECOND WRITER - CLEAN ARCHITECTURE CHECK 1 (SRP by actor) AND CHECK 5 (boundaries).\n'
	+ `This file is about to write ${hits.size} value(s) that other files already write:\n`
	+ lines.join('\n') + '\n'
	+ 'Two writers on one value is how the HIGHT slider died on 2026-09-15 - the newcomer '
	+ 'overwrote the owner every frame and nothing failed until a person dragged it.\n'
	+ 'Before retrying: READ those lines. Then say, in the answer, either\n'
	+ '  - "different object, different value" and why, or\n'
	+ '  - who the OWNER is, and write through it or above it instead of over it.\n'
	+ 'The retry is allowed - this stop fires once per setter per file. It is here to make '
	+ 'the question get asked, not to make the write impossible.');
