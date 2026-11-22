// One IDEA, one place - checked across feature folders.
//
// check-unity.js already refuses the same file-scope helper defined in two .cpp files,
// because UnrealBuildTool will eventually put both in one unity blob and the linker will
// say so. That check is about the ODR. This one is about something the linker is perfectly
// happy with and a reader is not: the same METHOD NAME implemented on two classes that
// live in different top-level folders.
//
// 🔴 WHY IT EXISTS, measured rather than imagined.
//
// On 2026-09-15 check-unity.js reported "163 file-scope helpers, none defined in two files"
// - green, correct, and blind to this, which was true at the same moment:
//
//   EvaluateCurveAlpha   Doors, Presentation, Viewpoints   three copies, and the door's
//                        "Ease In Out" was a DIFFERENT CURVE from the other two. One label
//                        on one dropdown meaning two things, for as long as anyone looked.
//   ApplyFinalBlend      Presentation, Viewpoints          the same arithmetic in two
//                        shapes, neither with a test.
//   StopPawnMovement     Presentation, Viewpoints          identical, character for
//                        character, eleven lines.
//
// All three are gathered now. This file is what stops the fourth one arriving unnoticed.
//
// 🔴 A NAME IN TWO FOLDERS IS NOT AUTOMATICALLY A FAULT, so this does not guess. Every
// name below has been read and the reason it is fine is written beside it. A name that is
// NOT below turns the gate red, and clearing it means either removing the duplication or
// adding a line here with what you found. A silent exception is how a rule dies.
//
// Engine overrides are filtered by a fact rather than a list: anything this codebase marks
// `override` in a header is the engine's name and not ours. BeginPlay lives on eighteen
// classes and always will.
//
// Exit 0 = every shared name is accounted for. Exit 1 = a new one, named.

'use strict';
const fs = require('fs'), path = require('path');
const { PRJ: SRC } = require('./rings.js');

// name -> why it is two implementations rather than one duplicated implementation
const ACCEPTED = new Map([
	['Get',
		'the static subsystem/actor accessor idiom. One per type, by definition - Avatar, '
		+ 'Composition, Furniture, SiteMap, Sound, Viewpoints. Nothing is shared but the word.'],
	['Find',
		'same idiom as Get, for the level-placed actors: APRJWalkableFloors::Find and the '
		+ 'sound bank. Each finds its own type.'],
	['EvaluateCurveAlpha',
		'the ARITHMETIC was gathered into PRJDomain::Ease on 2026-09-15. What is left in each '
		+ 'of the three is the CustomCurve branch, which needs a UCurveFloat - an engine asset, '
		+ 'which cannot enter ring 0 - plus the one-line conversion from that actor own UENUM. '
		+ 'The three UENUMs stay separate on purpose: a .uasset holds the type name and a '
		+ 'rename is what outside references cannot survive.'],
	['ApplyFinalBlend',
		'same story: PRJDomain::FinalBlend holds the arithmetic and the tests. What is left '
		+ 'is each caller computing its own WINDOW, which is policy and differs on purpose - '
		+ 'the route takes the max of four authored percentages, the travel component one.'],
	['ApplyPawnTransform',
		'READ AND FOUND DIFFERENT. Same skeleton, different policy: the route calls '
		+ 'EvaluateRuntimePathRotation and honours bUseTeleportForRouteMovement, the travel '
		+ 'component slerps start-to-target and always teleports. Merging them would mean one '
		+ 'of the two silently changing how it moves.'],
	['IsShowing',
		'APRJSwitchMarker::IsShowing is "am I drawn in the world". '
		+ 'UPRJWebUISubsystem::IsShowing is "is the HTML panel up". Unrelated state, one '
		+ 'English word.'],
	['GetCurrentModelIndex',
		'APRJPriceActor OWNS the value. The two card widgets each return their own cached '
		+ 'copy of what they were last told - a field read, not a second answer to the '
		+ 'question.'],
	['GetCurrentCategoryIndex',
		'as GetCurrentModelIndex: the widget returns its own field.'],
	['GetCurrentStyleIndex',
		'as GetCurrentModelIndex: the widget returns its own field.'],
	['SetActiveModelIndex',
		'two INDEPENDENT reactions to one event, not one algorithm twice. A light template '
		+ 'reselects its row; a media display reselects its variant. Neither could use the '
		+ 'other body.'],
	['HandleTravelFinished',
		'two subscribers to one delegate - UPRJCameraTravelComponent::OnTravelFinished. '
		+ 'APRJViewPointActor and APRJWalkCursor each do their own thing when the camera '
		+ 'lands. That is the observer pattern working, not duplication.'],
	['RestoreGameInputFocus',
		'UPRJModelStrip DELEGATES to APRJPlayerController::RestoreGameInputFocus whenever the '
		+ 'controller is one of ours (PRJModelStrip.cpp:501). What follows is a fallback for a '
		+ 'controller that is not, and in this product there is no such controller - the game '
		+ 'mode sets ours. \u{1F534} NOTED, NOT ENDORSED: those eight lines restate the mouse '
		+ 'policy ApplyMouseSettings owns, so they will drift the day that policy changes, and '
		+ 'nothing would notice because the branch cannot run. It is defensive code for an '
		+ 'impossible case and the honest fix is to delete it.'],
]);

function walk(d, out) {
	out = out || [];
	if (!fs.existsSync(d)) return out;
	for (const e of fs.readdirSync(d, { withFileTypes: true })) {
		const p = path.join(d, e.name).replace(/\\/g, '/');
		if (e.isDirectory()) walk(p, out); else out.push(p);
	}
	return out;
}

const files = walk(SRC).filter(f => /\.(h|cpp)$/.test(f));

// Anything marked `override` is the engine's name. This is a measurement, not a list to keep.
const overrides = new Set();
for (const f of files.filter(f => f.endsWith('.h'))) {
	for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
		const m = line.match(/\b([A-Za-z_]\w*)\s*\([^;]*\)\s*(const\s*)?override/);
		if (m) overrides.add(m[1]);
	}
}

// name -> set of top-level folders that implement it
const defs = new Map();
for (const f of files.filter(f => f.endsWith('.cpp'))) {
	const rel = f.replace(SRC + '/', '');
	const folder = rel.split('/')[1];
	if (folder === 'Tests') continue;      // a test names whatever it tests
	for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
		const m = line.match(/^[A-Za-z_][\w:<>,&* ]*\s+[AUF]?PRJ\w+::([A-Za-z_]\w*)\s*\(/);
		if (!m || overrides.has(m[1])) continue;
		if (!defs.has(m[1])) defs.set(m[1], new Map());
		if (!defs.get(m[1]).has(folder)) defs.get(m[1]).set(folder, rel);
	}
}

const shared = [...defs].filter(([, where]) => where.size > 1);
const unexplained = shared.filter(([name]) => !ACCEPTED.has(name));

// An accepted name that no longer appears anywhere is a line nobody needs to read again.
const stale = [...ACCEPTED.keys()].filter(n => !shared.some(([name]) => name === n));

if (unexplained.length === 0 && stale.length === 0) {
	console.log(`one idea per place: ${shared.length} name(s) implemented in more than one `
		+ 'folder, every one of them read and accounted for');
	process.exit(0);
}

if (unexplained.length) {
	console.error('THE SAME NAME IS IMPLEMENTED IN TWO PLACES AND NOBODY HAS SAID WHY.');
	console.error('');
	for (const [name, where] of unexplained) {
		console.error('  ' + name);
		for (const [folder, file] of where) console.error('      ' + folder.padEnd(14) + file);
	}
	console.error('');
	console.error('Either gather the shared part - PRJDomain::Ease and PRJDomain::FinalBlend are');
	console.error('what that looks like - or read both and add the name to ACCEPTED in this file');
	console.error('WITH what you found. Two implementations can be right; unexamined ones are not.');
}

if (stale.length) {
	console.error('');
	console.error('ACCEPTED names that no longer share a folder with anything:');
	for (const n of stale) console.error('  ' + n + '   - remove the entry, it is answering a dead question');
}

process.exit(1);
