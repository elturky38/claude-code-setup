// "It's done" - checked instead of believed.
//
// 🔴 WHY THIS FILE EXISTS, MEASURED RATHER THAN FELT.
//
// verification-before-completion carries one iron law: no completion claim without a
// verification command run in THAT SAME message. One session (2026-09-15) had the skill
// installed and never called it - 16 skills installed, 3 invoked - and reported "اتعمل
// واتبنى واتجرّب" more than once. The builds happened to have been run, so the reports were
// true. That is luck, not method: nothing in the loop was checking.
//
// The other two gates cannot reach this one. They fire BEFORE a write; a completion claim is
// made AFTER everything. So this is the only one that lives on Stop.
//
// ── what it actually asks ────────────────────────────────────────────────────
//
// Three things have to be true together before the turn is stopped:
//
//   1. the turn CHANGED something - at least one Write or Edit. A turn that only explains
//      may say "تمام" as often as it likes.
//   2. the answer CLAIMS it is done.
//   3. no verification runner was executed in that same turn.
//
// All three, or it stays out of the way. Any one of them alone is a false positive waiting
// to happen, and a Stop hook that cries wolf is the one hook nobody tolerates - it holds the
// answer hostage rather than a file.
//
// ── the loop, and why it cannot happen ───────────────────────────────────────
//
// 🔴 A Stop hook that blocks can be re-entered forever. This one blocks AT MOST ONCE per
// turn: the turn is keyed by the line index of the human message that started it, and the
// key is written to disk before the block is emitted. Second time round the same turn, it
// stands aside even if nothing was verified - because a gate that can hang the session is
// worse than a claim that goes out unchecked.
//
// COST, STATED: verification is recognised two ways - a known build or test runner anywhere in
// the turn, or any non-trivial command run AFTER the last edit. The second half exists because
// the first half alone was an allowlist, and an allowlist of every way a project can be checked
// is a list nobody finishes. See the note on TRIVIA for what that trade buys and what it costs.
'use strict';
const fs = require('fs');
const path = require('path');

// What counts as having actually checked. Build systems, test runners, syntax checks.
const RUNNERS = /(build\.bat|msbuild|dotnet\b|unrealeditor|automation runtests|npm (run )?(test|build)|yarn (test|build)|pnpm (test|build)|jest|vitest|pytest|python -m pytest|cargo (test|build|check)|go (test|build)|ctest|\bmake\b|gradle|mvn\b|--check|-c\s|tsc\b|eslint|verify)/i;

// Commands that only move bytes around or look at them. They prove nothing about whether a
// change works, so they do not count as having checked it. Everything NOT here, run after an
// edit, does count - because RUNNERS alone is an allowlist, and an allowlist of every way a
// project can be verified is a list nobody finishes. The trade: `p4 submit` after an edit now
// reads as a check. Deliberate - for a STOP hook a false pass costs one unchecked sentence,
// while a false block holds the whole answer hostage and gets the hook deleted.
const TRIVIA = /^\s*(ls|ll|dir|cat|head|tail|less|echo|pwd|cd|type|mkdir|touch|rm|del|cp|copy|mv|move|which|where|find|grep|rg|sed|awk|wc|sort|uniq|node -e|node --check|p4 (add|edit|revert|opened|diff|sync|where)|git (add|status|diff|log|show))\b/i;

// Saying it is finished. Arabic first - that is what this session speaks.
const CLAIMS = /(اتعمل|اتعملت|خلص|خلصت|خلصنا|تمام كده|شغال دلوقتي|اتصلح|اتظبط|اتبنى|نجح|جاهز|\bdone\b|\bfixed\b|完了|all set|works now|working now|passing|passes now|succeeded|complete[d]?\b|ready to|✅)/i;

const STATE = path.join(__dirname, '.verify-gate-state.json');

let payload = {};
try { payload = JSON.parse(fs.readFileSync(0, 'utf8')); } catch (e) { process.exit(0); }
if ((payload.hook_event_name || '') !== 'Stop') process.exit(0);

// Already inside a block this hook caused - never stack them.
if (payload.stop_hook_active) process.exit(0);

const tp = payload.transcript_path;
if (!tp || !fs.existsSync(tp)) process.exit(0);

let rows = [];
try {
	rows = fs.readFileSync(tp, 'utf8').split('\n').filter(Boolean).map(l => {
		try { return JSON.parse(l); } catch (e) { return null; }
	}).filter(Boolean);
} catch (e) { process.exit(0); }

// ── where this turn began ────────────────────────────────────────────────────
let turnStart = -1;
for (let i = rows.length - 1; i >= 0; i--) {
	const r = rows[i];
	if (r.type === 'user' && !r.isSidechain && r.origin && r.origin.kind === 'human') { turnStart = i; break; }
}
if (turnStart < 0) process.exit(0);

const turn = rows.slice(turnStart);

// ── once per turn, decided before anything else can go wrong ─────────────────
const session = String(payload.session_id || 'unknown');
const key = session + '#' + turnStart;
let state = {};
try { state = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) { state = {}; }
if (state[key]) process.exit(0);

// ── the three conditions ─────────────────────────────────────────────────────
let edited = false;
let verified = false;
let lastText = '';

for (const r of turn) {
	if (r.isSidechain) continue;
	const content = (r.message || {}).content;
	if (!Array.isArray(content)) {
		if (r.type === 'assistant' && typeof content === 'string') lastText = content;
		continue;
	}
	for (const b of content) {
		if (b.type === 'text' && r.type === 'assistant') lastText = b.text || '';
		if (b.type !== 'tool_use') continue;
		if (/^(Write|Edit|MultiEdit|NotebookEdit)$/.test(b.name || '')) {
			const f = String((b.input || {}).file_path || '');
			// The hooks and the scratchpad are the working surface, not the deliverable.
			if (!/[\\/](scratchpad|Temp|tmp)[\\/]/i.test(f) && !/[\\/]\.claude[\\/]/i.test(f)) edited = true;
		}
		if (/^(Bash|PowerShell)$/.test(b.name || '')) {
			const cmd = String((b.input || {}).command || '');
			// A build or a test counts wherever it sits in the turn. Anything else counts
			// only once there is a change for it to be checking, and only if it is not trivia.
			if (RUNNERS.test(cmd) || (edited && !TRIVIA.test(cmd))) verified = true;
		}
	}
}

/**
 * 🔴 ONE LINE PER TURN, SO THE GATE IS OBSERVABLE AT ALL.
 *
 * A PreToolUse gate proves itself the moment it refuses something. A Stop gate that is
 * working correctly is INVISIBLE - it stands aside on every well-behaved turn, and there is
 * no way to tell that from a hook the settings watcher never loaded. That gap is not
 * theoretical: this file was registered mid-session and could not be shown to be live.
 *
 * So it writes down what it saw and what it decided. One short line, append-only, and the
 * verdict word is the whole point: `verified` means a check was recognised, `no-claim` means
 * nothing was asserted, `BLOCK` means the turn was sent back.
 */
const verdict = !edited ? 'no-edit'
	: verified ? 'verified'
	: !CLAIMS.test(lastText) ? 'no-claim'
	: 'BLOCK';

try {
	fs.appendFileSync(path.join(__dirname, '.verify-gate-log.txt'),
		new Date().toISOString() + '  ' + verdict + '  session=' + session + '\n');
} catch (e) { /* the log is a witness, never a dependency */ }

if (verdict !== 'BLOCK') process.exit(0);

// Written BEFORE the block is emitted, so a crash between here and stdout still cannot
// produce a turn that blocks twice.
state[key] = 1;
try { fs.writeFileSync(STATE, JSON.stringify(state)); } catch (e) { /* advisory only */ }

process.stdout.write(JSON.stringify({
	decision: 'block',
	reason: 'VERIFICATION-BEFORE-COMPLETION: this turn changed files and then said it was done, '
		+ 'and no build, test or check ran in it.\n'
		+ 'The iron law of the skill: no completion claim without a verification command run in '
		+ 'THAT SAME message. "should work", "looks right", "probably passes" are all violations.\n'
		+ 'Do one of these now, then answer:\n'
		+ '  - run the build or the test and report the real output, or\n'
		+ '  - say plainly that it is NOT VERIFIED and what is still unchecked.\n'
		+ 'If a check DID run and this hook did not recognise it, add its command to RUNNERS in '
		+ '.claude/hooks/verify-before-done.js rather than working around this.\n'
		+ 'This fires at most once per turn.',
}));
process.exit(0);
