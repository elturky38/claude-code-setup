// The web layer's behaviour, under test. Node, no browser, no framework.
//
// 🔴 WHY THIS EXISTS AT ALL.
//
// On 2026-09-15 the C++ had 43 automation cases and the web layer had ZERO of any kind -
// and the web layer is where the visitor actually presses things. Two of the faults found
// that day were pure logic with no rendering in them at all, so nothing about a browser was
// ever the reason they went untested:
//
//   Escape        eight separate document listeners, one per pane. rail.js had no guard and
//                 closed both rail panes on EVERY press, so dismissing the Edit list also
//                 shut the map and the render pane. The four that tried to claim the key
//                 first used capture plus stopPropagation - which does not stop another
//                 listener on the same element, so it never stopped anything.
//   send()        no timeout anywhere. A command the engine never answered left the caller
//                 waiting for ever, and the RENDERING screen goes up BEFORE the command is
//                 sent - so a lost answer meant a locked screen with no way back.
//
// Both are plain logic over a keydown and a callback. What they needed was not a browser,
// it was somebody deciding they were testable. The stubs below are the whole harness: an
// addEventListener that records, and a clock that can be wound forward by hand.
//
// Run: node test-ui.js     Exit 0 = pass. The Stop gate runs it on any UI edit.

'use strict';
const fs = require('fs');
const vm = require('vm');
const { UI_TREE } = require('./rings.js');

let passed = 0;
const failures = [];
// 🔴 EVERY READ OF A REPLY GOES THROUGH THIS. A test that CRASHES instead of failing is
// worse than no test: the gate prints a stack trace from the harness and the reader has to
// work out that the harness was fine and the code was not. Proved the hard way - the first
// time these tests caught a real regression they threw on JSON.parse(undefined) rather than
// saying which check went red.
function body(reply) {
	if (typeof reply !== 'string') return { __missing: true };
	try { return JSON.parse(reply); } catch (e) { return { __unparseable: reply }; }
}

function check(what, got, want) {
	if (got === want) { passed++; return; }
	failures.push(`  ${what}\n      want ${JSON.stringify(want)}  got ${JSON.stringify(got)}`);
}

// ── a document that only does what these two files ask of it ──────────────────
function makeDom() {
	const listeners = [];
	const doc = {
		addEventListener: (type, fn, capture) => listeners.push({ type, fn, capture: !!capture }),
	};
	return {
		doc,
		press(key) {
			let defaultPrevented = false, propagationStopped = false;
			const e = {
				key,
				preventDefault() { defaultPrevented = true; },
				stopPropagation() { propagationStopped = true; },
			};
			// Capture handlers first, then the rest - the order a browser uses.
			for (const l of listeners.filter(l => l.capture)) l.fn(e);
			for (const l of listeners.filter(l => !l.capture)) l.fn(e);
			return { defaultPrevented, propagationStopped };
		},
		listenerCount: () => listeners.length,
	};
}

function load(relPath, sandbox) {
	const code = fs.readFileSync(UI_TREE + '/' + relPath, 'utf8');
	vm.createContext(sandbox);
	vm.runInContext(code, sandbox, { filename: relPath });
}

// ═════════════════════════════════════════════════════════════════════════════
// Escape: one press, one layer, and it is the one in front.
// ═════════════════════════════════════════════════════════════════════════════
{
	const dom = makeDom();
	const win = {};
	const sandbox = { window: win, document: dom.doc, console };
	sandbox.window = sandbox;          // escape-stack writes window.EscapeStack
	sandbox.document = dom.doc;
	load('Shared/escape-stack.js', sandbox);

	check('escape-stack adds exactly one document listener', dom.listenerCount(), 1);

	// Three layers open at once. Registered back-to-front on purpose: the order that
	// decides must be the declared one, not the order somebody happened to register in.
	const closed = [];
	const open = { rail: true, modelList: true, quit: true };
	sandbox.window.EscapeStack.register('rail', () => open.rail, () => { closed.push('rail'); open.rail = false; });
	sandbox.window.EscapeStack.register('modelList', () => open.modelList, () => { closed.push('modelList'); open.modelList = false; });
	sandbox.window.EscapeStack.register('quit', () => open.quit, () => { closed.push('quit'); open.quit = false; });

	// 🔴 THE TEST THE OLD CODE WOULD HAVE FAILED. Three layers up, one press.
	const first = dom.press('Escape');
	check('one press closes exactly one layer', closed.length, 1);
	check('and it is the front-most one', closed[0], 'quit');
	check('the press is consumed', first.defaultPrevented, true);

	// The next press finds quit already gone and takes the next one down.
	dom.press('Escape');
	check('the second press takes the next layer down', closed[1], 'modelList');

	dom.press('Escape');
	check('the third press reaches the rail', closed[2], 'rail');

	// Nothing left. A press with everything closed must do nothing at all.
	dom.press('Escape');
	check('a press with nothing open closes nothing', closed.length, 3);

	// Any other key is not ours.
	dom.press('Enter');
	check('Enter is not Escape', closed.length, 3);

	// A layer nobody declared an order for is refused rather than silently ranked first.
	const before = closed.length;
	const quiet = { error: () => {}, warn: () => {}, info: () => {}, log: () => {} };
	sandbox.console = quiet;
	sandbox.window.EscapeStack.register('somethingNew', () => true, () => closed.push('somethingNew'));
	dom.press('Escape');
	check('an undeclared layer is never given the key', closed.length, before);
}

// ═════════════════════════════════════════════════════════════════════════════
// send(): every caller is answered exactly once, whatever happens.
// ═════════════════════════════════════════════════════════════════════════════
function makeTransport(engineQuery) {
	const timers = [];
	const sandbox = {
		console: { warn: () => {}, info: () => {}, log: () => {}, error: () => {} },
		setTimeout: (fn, ms) => { timers.push({ fn, ms, live: true }); return timers.length - 1; },
		clearTimeout: (id) => { if (timers[id]) timers[id].live = false; },
		location: { search: '' },
	};
	const win = {
		engineQuery,
		addEventListener: () => {},
	};
	sandbox.window = win;
	sandbox.document = { documentElement: { classList: { add: () => {} } }, addEventListener: () => {} };
	win.window = win;
	sandbox.window = win;
	Object.assign(sandbox, { window: win });
	load('Shared/engine-transport.js', sandbox);
	return {
		send: win.ueSend,
		tick() { for (const t of timers) { if (t.live) { t.live = false; t.fn(); } } },
		pending: () => timers.filter(t => t.live).length,
	};
}

{
	// 1. The engine answers. The caller gets the engine's own reply, once.
	let replies = [];
	const ok = makeTransport(function (req) { req.onSuccess('{"ok":true,"v":7}'); });
	ok.send('renderSet', { key: 'zoom' }, r => replies.push(r));
	check('an answered command calls back once', replies.length, 1);
	check('with the engine own reply', body(replies[0]).v, 7);
	check('and cancels its timeout', ok.pending(), 0);
	ok.tick();
	check('so the clock cannot answer it a second time', replies.length, 1);
}

{
	// 2. 🔴 THE CASE THAT HAD NO ANSWER AT ALL. The engine never calls back.
	let replies = [];
	const mute = makeTransport(function () { /* swallows the request */ });
	mute.send('render', {}, r => replies.push(r));
	check('before the clock runs out, nothing has been said', replies.length, 0);
	mute.tick();
	check('after it, the caller is told exactly once', replies.length, 1);
	const answer = body(replies[0]);
	check('and told what happened', answer.reason, 'timeout');
	check('the reply says ok:false so existing callers read it as a no', answer.ok, false);
	check('and it names the command', answer.cmd, 'render');
}

{
	// 3. The engine refuses.
	let replies = [];
	const no = makeTransport(function (req) { req.onFailure(-1, 'handler threw'); });
	no.send('clipPlay', { id: 2 }, r => replies.push(r));
	check('a refusal answers once', replies.length, 1);
	check('as a JSON string, not an object', typeof replies[0], 'string');
	check('saying it failed', body(replies[0]).reason, 'failed');
}

{
	// 4. No engine at all - a plain browser. This used to return in silence, which is why
	// the browser-fallback branches in tour.js:304 and :359 have never once executed.
	let replies = [];
	const none = makeTransport(undefined);
	none.send('tourSave', {}, r => replies.push(r));
	check('a plain browser still answers the caller', replies.length, 1);
	check('saying there is no engine', body(replies[0]).reason, 'no-engine');
}

{
	// 5. A caller that passed no callback must not crash anything.
	let threw = false;
	const silent = makeTransport(function () {});
	try { silent.send('clipStop'); silent.tick(); } catch (e) { threw = true; }
	check('a command with no callback is safe', threw, false);
}

if (failures.length === 0) {
	console.log(`web layer: ${passed} checks passed`);
	process.exit(0);
}

console.error('WEB LAYER TESTS FAILED');
console.error('');
for (const f of failures) console.error(f);
console.error('');
console.error(`${passed} passed, ${failures.length} failed`);
process.exit(1);
