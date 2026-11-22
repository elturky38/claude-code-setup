// The inner rings compile without the framework - checked, because "pure" is a claim that
// rots the first time somebody needs one convenient header.
//
// Clean Architecture ch.32: the framework is a detail. FString and TArray are NOT the
// framework - they are Unreal's replacement for the standard library, and forbidding them
// would mean writing a second string type to prove a point. What is forbidden is anything
// that drags in UObject, a world, an actor, or the reflection system: those are the things
// that make a business rule need an engine to run, and needing an engine to run is exactly
// what stops a rule being tested and stops it outliving the engine.
//
// Exit 0 = the inner rings are pure. Exit 1 = one of them reached out, with file:line.
'use strict';
const fs = require('fs'), path = require('path');

const { PRJ: SRC } = require("./rings.js");   // one copy of the root, see rings.js
const PURE_DIRS = ['Domain', 'UseCases', 'Ports'];

// The container and maths library, and nothing else. Anything not on this list is either
// the engine proper or a header nobody has thought about yet - and the second one is worth
// stopping too, because that is how the first one arrives.
const ALLOWED_PREFIX = [
	// 🔴 Misc/ USED TO BE HERE WHOLE, AND THAT WAS A HOLE. Misc/ is Unreal's grab-bag: it
	// holds Optional.h and CoreMiscDefines.h, and it also holds App.h and CoreDelegates.h -
	// application state and an engine-wide event bus. A prefix that admits both admits the
	// second one silently. Named individually from 2026-09-15; nothing in the pure rings was
	// using Misc/ at all when this was narrowed, so it cost nothing and closed the door.
	'CoreTypes.h', 'CoreFwd.h', 'Containers/', 'Math/',
	'Misc/CoreMiscDefines.h', 'Misc/Optional.h', 'Misc/AssertionMacros.h',
	'Misc/EnumClassFlags.h',
	'Templates/', 'HAL/Platform.h', 'Algo/',
];

const FORBIDDEN_MACRO = /\b(UCLASS|USTRUCT|UPROPERTY|UFUNCTION|UENUM|GENERATED_BODY)\b/;

function walk(d, out) {
	out = out || [];
	if (!fs.existsSync(d)) return out;
	for (const e of fs.readdirSync(d, { withFileTypes: true })) {
		const p = path.join(d, e.name).replace(/\\/g, '/');
		if (e.isDirectory()) walk(p, out);
		else if (/\.(h|cpp)$/.test(e.name)) out.push(p);
	}
	return out;
}

const files = [];
for (const root of ['Public', 'Private']) {
	for (const d of PURE_DIRS) files.push(...walk(`${SRC}/${root}/${d}`));
}

const problems = [];
for (const f of files) {
	const rel = f.replace(SRC + '/', '');

	// 🔴 COMMENTS ARE BLANKED BEFORE ANYTHING IS READ, AND THE LINE NUMBERS SURVIVE IT.
	//
	// This check used to read raw text, so a file that EXPLAINED why it has no UENUM was
	// reported for having one. That happened the first time somebody wrote the reason down -
	// PRJEasing.h on 2026-09-15, whose header note says "They are UENUM(BlueprintType)" about
	// three enums living in OTHER rings. A gate that punishes the explanation teaches people
	// to delete the explanation, which is the opposite of what this codebase is for.
	//
	// Block comments are replaced character for character with spaces and the newlines are
	// kept, so :NN still points at the right line. Line comments keep everything left of //.
	const blank = m => m.replace(/[^\n]/g, ' ');
	const src = fs.readFileSync(f, 'utf8')
		.replace(/\/\*[\s\S]*?\*\//g, blank)
		.replace(/\/\/[^\n]*/g, blank);

	src.split(/\r?\n/).forEach((line, i) => {
		const inc = line.match(/^[ \t]*#include[ \t]*[<"]([^>"]+)[>"]/);
		if (inc) {
			const h = inc[1];
			// One inner ring naming another is the point of having them.
			if (PURE_DIRS.some(d => h.startsWith(d + '/'))) return;
			if (ALLOWED_PREFIX.some(p => h === p || h.startsWith(p))) return;
			problems.push({
				file: rel, line: i + 1, what: '#include "' + h + '"',
				why: h.endsWith('.generated.h')
					? 'reflection - this type would need UHT, and UHT needs the engine'
					: 'an engine header outside the container library',
			});
			return;
		}
		const mac = line.match(FORBIDDEN_MACRO);
		if (mac) {
			problems.push({
				file: rel, line: i + 1, what: mac[1],
				why: 'a reflection macro - it makes this type belong to the engine, not to the villa',
			});
		}
	});
}

if (problems.length === 0) {
	console.log(`inner rings are pure: ${files.length} file(s) in ${PURE_DIRS.join(' / ')}, `
		+ 'no engine header and no reflection macro');
	process.exit(0);
}

console.error('THE INNER RING REACHED FOR THE FRAMEWORK.');
console.error('Domain/, UseCases/ and Ports/ must compile without a world, an actor or UHT.');
console.error('That is the whole reason they exist: a rule that needs an engine to run cannot');
console.error('be tested without one, and cannot outlive it.');
console.error('');
for (const p of problems) {
	console.error('  ' + p.file + ':' + p.line + '  ' + p.what);
	console.error('      ' + p.why);
}
console.error('');
console.error('Fix by taking the engine type at the EDGE - the adapter maps it into a plain');
console.error('struct - or by declaring what you need in Ports/ and answering it outside.');
process.exit(1);
