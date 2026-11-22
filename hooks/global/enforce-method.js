// The method, enforced instead of requested.
//
// 🔴 WHY THIS FILE EXISTS, MEASURED RATHER THAN FELT.
//
// One session (2026-08-25) was asked about a slider bug. It gave file:line evidence and
// it said "مالقيتش عيب هنا" - so CLAUDE.md was loaded and partly obeyed. But it made ZERO
// skill calls on a bug (rule 15 says systematic-debugging), and it edited SHtmlWidget.h at
// 10:51:55 having never been given a go-word (rule 1).
//
// The two hardest rules are the two that were skipped, and that is not a coincidence: they
// are the ones that cost something in the moment. A rule that costs something and has no
// mechanism is a suggestion.
//
// verify-build.sh cannot help here. It checks the BUILD - it has no idea whether a skill was
// called or whether anyone said ابدا. So this hook does two jobs:
//
//   UserPromptSubmit          reads the request, works out which skill rule 15 demands, and
//                             injects that as context. Cheap, runs on every prompt, and it
//                             puts the requirement in front of the model at the one moment
//                             it is deciding what to do.
//
//   PreToolUse Edit|Write     refuses the edit when no go-word has been given since the last
//                             edit. This is rule 1, and it is the only one of the fifteen
//                             that can be checked mechanically from outside.
//
// THE COST, STATED: the go-word list is a list, and a word that means "go" but is not on it
// will be refused. That is a one-line fix in GO_WORDS below, and it is the right way round -
// a gate that occasionally asks again is recoverable; one that never fires is not.
'use strict';
const fs = require('fs');
const path = require('path');

// ── the go-words ─────────────────────────────────────────────────────────────
//
// From CLAUDE.md rules 1 and 12, plus the ordinary imperatives that mean the same thing.
// Rule 1 says "read the intent, not the word", which a regex cannot do - so the list is
// deliberately GENEROUS. A false allow costs one unwanted edit that /rewind undoes; a false
// block costs trust in the whole mechanism, and a mechanism nobody trusts gets switched off.
const GO_WORDS = [
	'ابدا', 'ابدأ', 'إبدأ', 'يلا', 'يالا', 'ماشي', 'اتفضل', 'إتفضل',
	'كمل', 'كمّل', 'اعمل', 'إعمل', 'اعملها', 'اعملهم', 'نفذ', 'نفّذ',
	'صلح', 'صلّح', 'اصلح', 'أصلح', 'ظبط', 'اظبط', 'غير', 'غيّر',
	'حل', 'شيل', 'ضيف', 'أضف', 'اضف', 'حدث', 'حدّث', 'انقل',
	// Added the moment the list was first tested: "ثبت طريقة الشغل" is a go-word by any
	// reading and the list did not have it. That is the stated defect arriving within a
	// minute of the file being written - which is the argument for keeping the list
	// generous rather than the argument against having one.
	'ثبت', 'ثبّت', 'سطب', 'ركب', 'طبق', 'طبّق', 'سلم', 'سلّم',
	'go', 'do it', 'proceed', 'implement', 'apply', 'fix it', 'make it',
];

// Words that ask for the OPPOSITE - explain only, touch nothing (rule 9).
// Checked first: "فهمني وبعدين اعمل" is ambiguous, and the safe reading of an ambiguous
// instruction to change code is "not yet".
const STOP_WORDS = ['متعملش حاجة', 'متعملش', 'فقط فهمني', 'فهمني', 'سيبك', 'انا اللي هعمل', 'أنا اللي هعمل', 'اشرح', 'don\'t', 'do not'];

// ── which skill rule 15 demands ──────────────────────────────────────────────
const SKILL_RULES = [
	{
		when: /باج|مشكلة|عيب|مش شغال|مش بيشتغل|بيقف|غلط|error|bug|broken|fails|crash|not work/i,
		skill: 'systematic-debugging',
		why: 'this is a bug report, and rule 15 says systematic-debugging runs BEFORE any fix is proposed',
	},
	{
		when: /صفحة|ميزة|feature|اضف|أضف|ضيف|اعمل لي|جديد|new |add |build |create /i,
		skill: 'brainstorming',
		why: 'this is new work, and rule 15 says brainstorming comes before creative work',
	},
	{
		when: /خطة|plan|مراحل|refactor|اعادة|إعادة|هيكل|architecture|معمار/i,
		skill: 'writing-plans + clean-architecture',
		why: 'this is multi-step or structural, so a written plan comes before code and the architecture checks apply',
	},
];

// One answer to "is this product code", used by the early skip and by the turn counter.
const NOT_PRODUCT_PATH = /[\/](scratchpad|Temp|tmp)[\/]|[\/].claude[\/]|[\/]docs[\/]plans[\/]/i;

// ── the rule with no keyword ─────────────────────────────────────────────────
//
// CLAUDE.md sends `toolkit` to the START of any task on the E: drive, and no wording in the
// prompt announces that - the drive does. It is checked against the PATH BEING WRITTEN
// rather than against the sentence, which is why it could not live in SKILL_RULES above.
const TOOLKIT_DRIVE = /^[eE]:[\/]/;

function readStdin() {
	try { return fs.readFileSync(0, 'utf8'); } catch (e) { return ''; }
}

function out(obj) { process.stdout.write(JSON.stringify(obj)); process.exit(0); }

const raw = readStdin();
let payload = {};
try { payload = JSON.parse(raw); } catch (e) { process.exit(0); }   // never break the session

const event = payload.hook_event_name || '';

// ═══ UserPromptSubmit: put rule 15 in front of the model, every single prompt ═══
if (event === 'UserPromptSubmit') {
	const prompt = String(payload.prompt || '');
	const hits = SKILL_RULES.filter(r => r.when.test(prompt));

	const lines = [
		'METHOD REMINDER (from .claude/hooks/enforce-method.js, not from the user):',
		'- Rule 3: every claim carries file:line from real source, or says NOT VERIFIED.',
		// Rule 7, added 2026-09-08 after a p4 submit was reported with a six-row status
		// table, a folder breakdown and a paragraph on the tool - when "اتسلم، change 134,
		// 112 files" was the whole answer. The evidence tables are for FINDINGS. A task
		// that just ran needs its result, not a transcript of the checks behind it.
		'- Rule 7: answer in ONE line unless asked for more. Report a completed task as: what happened + the number that proves it. No status tables, no checklists of what you verified, no restating the plan. Tables are for findings and comparisons only. Explaining how something works (rule 14) is the one exception.',
		// Added 2026-09-15, the day a new component took a value PRJRenderCamera.cpp:431 already
		// owned and killed the HIGHT slider. The architecture rule used to reach the model only
		// when the PROMPT said "architecture" - and a prompt that says "fix the bouncing" is the
		// one that gets a class written. architecture-gate.js is the stop; this is the warning
		// that arrives early enough to make the stop unnecessary.
		'- Rule 15 + clean-architecture: before writing ANY new class, component or module, invoke the `clean-architecture` skill and name, out loud, who already owns every value the new code will WRITE. Two writers on one value is the failure this line exists for.',
	];
	for (const h of hits) {
		lines.push(`- Rule 15: invoke the \`${h.skill}\` skill before answering - ${h.why}.`);
	}
	if (!hits.length) {
		lines.push('- Rule 15: if this turns out to be a bug, a feature, or multi-step work, invoke the matching skill before writing anything.');
	}

	out({
		hookSpecificOutput: {
			hookEventName: 'UserPromptSubmit',
			additionalContext: lines.join('\n'),
		},
		suppressOutput: true,
	});
}

// ═══ PreToolUse on Edit|Write: rule 1, checked ═══════════════════════════════
if (event === 'PreToolUse') {
	const file = String((payload.tool_input || {}).file_path || '');

	// The gate is about the PRODUCT's code. Scratch files, the hooks themselves and plan
	// documents are the working surface of a diagnosis, not the change being gated.
	if (/[\\/](scratchpad|Temp|tmp)[\\/]/i.test(file) || /[\\/]\.claude[\\/]/i.test(file) || /[\\/]docs[\\/]plans[\\/]/i.test(file)) {
		process.exit(0);
	}

	const tp = payload.transcript_path;
	if (!tp || !fs.existsSync(tp)) process.exit(0);   // cannot tell - do not block

	// Walk the transcript backwards to the most recent human message. Anything before an
	// earlier edit is spent: a go-word given for yesterday's task does not authorise today's.
	let lastHuman = '';
	let turnStart = 0;
	let lines = [];
	try {
		lines = fs.readFileSync(tp, 'utf8').split('\n').filter(Boolean);
		for (let i = lines.length - 1; i >= 0; i--) {
			let r; try { r = JSON.parse(lines[i]); } catch (e) { continue; }
			if (r.type !== 'user' || r.isSidechain) continue;
			if (!(r.origin && r.origin.kind === 'human')) continue;
			const c = (r.message || {}).content;
			lastHuman = typeof c === 'string' ? c
				: Array.isArray(c) ? c.filter(b => b.type === 'text').map(b => b.text).join(' ') : '';
			if (lastHuman.trim()) { turnStart = i; break; }
		}
	} catch (e) { process.exit(0); }

	/**
	 * 🔴 THE TABLE ABOVE IS NOW ENFORCED, NOT ANNOUNCED - AND THAT IS THE WHOLE EDIT.
	 *
	 * Measured on One session (2026-09-15): 16 skills installed, 3 invoked across the
	 * entire session, and clean-architecture only after the user said so. The reminder this
	 * same file injects on EVERY prompt was on screen the whole time. So the reminder is not
	 * the mechanism; it is the thing the mechanism was mistaken for.
	 *
	 * Enforced HERE rather than in architecture-gate.js on purpose: SKILL_RULES lives in this
	 * file, and a gate that re-declared which skill a prompt demands would be a second answer
	 * to a question this file already answers. One rule, one place - Check 1 of the book,
	 * applied to the hooks themselves.
	 *
	 * SESSION-SCOPED, NOT PER-MESSAGE. A skill invoked once has its checklist in context for
	 * the rest of the session, so re-demanding it on every follow-up would be noise, and noise
	 * is how a gate gets switched off. The cost: a session that changes subject entirely keeps
	 * the earlier skill's credit. Accepted - the failure being stopped is never calling it.
	 */
	// Every product file this turn has already written. Scratch files and the hooks
	// themselves are the working surface of a diagnosis, not the deliverable being counted.
	const turnEdits = new Set();
	for (let i = turnStart; i < lines.length; i++) {
		let r; try { r = JSON.parse(lines[i]); } catch (e) { continue; }
		if (r.type !== 'assistant' || r.isSidechain) continue;
		const c = (r.message || {}).content;
		if (!Array.isArray(c)) continue;
		for (const b of c) {
			if (b.type !== 'tool_use' || !/^(Write|Edit|MultiEdit|NotebookEdit)$/.test(b.name || '')) continue;
			const f = String((b.input || {}).file_path || '');
			if (!f || NOT_PRODUCT_PATH.test(f)) continue;
			turnEdits.add(path.resolve(f));
		}
	}

	const required = SKILL_RULES.filter(r => r.when.test(lastHuman)).map(r => ({ skill: r.skill, why: r.why }));
	/**
	 * 🔴 THE SHAPE OF THE WORK, NOT THE WORDING OF THE REQUEST.
	 *
	 * SKILL_RULES above reads the SENTENCE, and a sentence lies about its own size: "صلّح
	 * النطنطة" is four words and it produced a new component, a new namespace and a test
	 * file. So brainstorming and writing-plans were demanded by keyword and never once by
	 * the work that actually happened.
	 *
	 * These two ask the filesystem instead, the same way TOOLKIT_DRIVE asks the drive:
	 *   a file that does not exist yet  = creative work, however small the request sounded.
	 *   the third product file this turn = multi-step, whoever called it a quick fix.
	 *
	 * COST, STATED: a one-file throwaway still pays one brainstorming call, and a turn that
	 * legitimately touches three files pays one writing-plans call. Both are one call per
	 * session, and both guard the decision that is expensive to get wrong.
	 */
	if (!fs.existsSync(file)) {
		required.push({ skill: 'brainstorming', why: 'this file does not exist yet - a new file is creative work whatever the request was worded like, and rule 15 puts brainstorming before it' });
	}

	if (turnEdits.size >= 2 && !turnEdits.has(path.resolve(file))) {
		required.push({ skill: 'writing-plans', why: 'this is the third product file changed in one turn - that is multi-step work by measurement rather than by wording, and rule 15 puts a written plan before it' });
	}

	if (TOOLKIT_DRIVE.test(file)) {
		required.push({ skill: 'toolkit', why: 'this is the E: drive, and CLAUDE.md loads toolkit at the start of any task there' });
	}

	if (/\.(cpp|h|hpp|cc|cxx|c|cs|ts|tsx|js|jsx|py|java|go|rs)$/i.test(file) && !/test/i.test(file)) {
		required.push({ skill: 'test-driven-development', why: 'this is implementation code, and rule 15 puts test-driven-development before it - a test written after the fact is a test shaped by the bug it missed' });
	}

	// A compound entry like "writing-plans + clean-architecture" is two demands, not one name.
	const wanted = [];
	for (const r of required) {
		for (const name of r.skill.split('+').map(x => x.trim())) {
			if (name && !wanted.some(w => w.skill === name)) wanted.push({ skill: name, why: r.why });
		}
	}

	let transcript = '';
	try { transcript = fs.readFileSync(tp, 'utf8'); } catch (e) { transcript = ''; }

	const missing = transcript
		? wanted.filter(w => !transcript.includes('"skill":"' + w.skill + '"'))
		: [];

	if (missing.length) {
		out({
			hookSpecificOutput: {
				hookEventName: 'PreToolUse',
				permissionDecision: 'deny',
				permissionDecisionReason: 'RULE 15 - THE SKILL WAS NOT INVOKED, ONLY REMEMBERED.\n'
					+ missing.map(m => '  `' + m.skill + '` - ' + m.why).join('\n')
					+ '\nInvoke it with the Skill tool and follow what it says, then write. '
					+ 'Reading and diagnosing stay allowed; this blocks writing only.\n'
					+ 'Measured, not theoretical: on 2026-09-15 this session had 16 skills installed and '
					+ 'called 3, while this same file printed the reminder on every prompt.',
			},
		});
	}

	const said = lastHuman.toLowerCase();
	const stopped = STOP_WORDS.some(w => said.includes(w.toLowerCase()));
	const went = GO_WORDS.some(w => said.includes(w.toLowerCase()));

	// The go-word half of this gate was retired on 2026-08-26 on the user's own
	// instruction ("ما تشتغل وتخلص الشغل ... اتخنقت منها"): it was firing on work that
	// had already been asked for. `went` is left computed above because the word list is
	// still the readable record of what "go" means here. Rule 9 is what remains enforced.
	if (!stopped) process.exit(0);
	void went;

	out({
		hookSpecificOutput: {
			hookEventName: 'PreToolUse',
			permissionDecision: 'deny',
			permissionDecisionReason: stopped
				? 'RULE 9: the last instruction was "explain only" - hand over the path or the command and touch nothing.'
				: 'RULE 1 (the "ابدا" gate): no code on the first message. '
					+ 'Say what the root cause is with file:line, present each path WITH its own defect '
					+ 'stated before the choice, and wait for a go-word. Reading and diagnosing are always '
					+ 'allowed - this blocks writing only. '
					+ 'If the user did mean go and used a word this hook does not know, add it to GO_WORDS '
					+ 'in .claude/hooks/enforce-method.js rather than working around this.',
		},
	});
}

process.exit(0);
