// One definition, one place - checked, because the compiler only checks it SOMETIMES.
//
// Unreal compiles several .cpp files into one translation unit (a "unity blob"). A helper
// in an anonymous namespace is file-local in the C++ standard's eyes, but two files that
// both define one are legal apart and a redefinition together. Which blob a file lands in
// is decided by UnrealBuildTool - by file order, by folder, by the adaptive-unity list of
// recently-edited files - so the same tree compiles today and fails tomorrow because
// somebody touched an unrelated file.
//
// That is exactly what the stage 6 splits left behind: split-class.js copied the shared
// preamble into every part, so ExtractSortIndexFromWidgetName was defined four times. The
// build stayed green for a day and a half because adaptive unity happened to keep those
// four files apart, and it went red the moment a folder move changed the grouping.
//
// verify-split.sh looked for duplicated `Class::Method` definitions and found none: these
// are free functions, and a free function is not a method. So the check that would have
// caught it is this one, and it now runs on every build instead of once per refactor.
//
// Exit 0 = every file-scope definition is unique. Exit 1 = the same one is in two files.
'use strict';
const fs = require('fs'), path = require('path');

const { PRJ, HTMLUI } = require("./rings.js");   // one copy of the root, see rings.js
const ROOTS = [PRJ, HTMLUI];

function walk(d, out) {
	out = out || [];
	if (!fs.existsSync(d)) return out;
	for (const e of fs.readdirSync(d, { withFileTypes: true })) {
		const p = path.join(d, e.name).replace(/\\/g, '/');
		if (e.isDirectory()) walk(p, out);
		else if (e.name.endsWith('.cpp')) out.push(p);
	}
	return out;
}

// Strip comments and string literals first: a function-looking line inside a comment block
// is not a definition, and this file is surrounded by prose that says the word.
function strip(src) {
	return src
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/\/\/[^\n]*/g, '')
		.replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
}

// A definition at FILE scope: no leading whitespace inside a namespace block is required,
// so indentation is allowed, but the name must not be qualified with `::` (that is a member
// definition, which the linker already catches) and the line must open a body.
const DEF = /^[ \t]*(?:static[ \t]+|inline[ \t]+|constexpr[ \t]+)*[A-Za-z_][A-Za-z0-9_:<>,*&[\] \t]*?[ \t*&]([A-Za-z_][A-Za-z0-9_]*)[ \t]*\([^;]*$/;

const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'sizeof', 'else', 'do']);

const seen = new Map();   // name -> [{file, line}]

for (const root of ROOTS) {
	for (const f of walk(root)) {
		const lines = strip(fs.readFileSync(f, 'utf8')).split(/\r?\n/);
		// Depth 0 is file scope. Depth 1 counts too, but ONLY when the block we are inside
		// is a namespace - and knowing which it is means remembering what opened each
		// brace, not just how many are open.
		//
		// 🔴 THE VERSION THAT COUNTED BRACES ALONE REPORTED THREE THINGS THAT WERE NOT
		// DUPLICATES, and it had been doing so unseen: the Stop gate runs the four checks
		// in order and exits on the first failure, and check-architecture.js was failing
		// ahead of this one on two unranked folders. So this ran green in nobody's
		// terminal for as long as that lasted.
		//
		// What it got wrong, both cases real:
		//
		//   HoverIcon - a `static ConstructorHelpers::FObjectFinder<> HoverIcon(...)` in
		//     the door's constructor AND in the light's. That is a function-local static.
		//     Its linkage is the function, two functions may each have one, and a unity
		//     blob cannot make them collide. But it sits at brace depth 1, which the old
		//     rule read as "inside a namespace".
		//
		//   StartupModule / ShutdownModule - `virtual void StartupModule() override`
		//     inside a class declared in a .cpp, once in PRJ and once in HtmlUIRender.
		//     Class members, and in two separate MODULES, which never share a blob at
		//     all.
		//
		// A check that cries about three safe things is a check people learn to skip,
		// which is how the real one gets past - so the fix is to make it right rather
		// than to record exceptions. The earlier bug the old comment describes is still
		// avoided: the kind is pushed AFTER the line is examined, so a definition on the
		// same line as the brace that encloses it is still judged by the outer scope.
		let depth = 0;
		const blocks = [];              // what opened each brace, outermost first
		let prevCode = '';              // last non-blank line, for the brace-on-its-own-line style

		const inNamespaceOnly = () => depth === 0 || (depth === 1 && blocks[0] === 'namespace');

		lines.forEach((line, i) => {
			const opens = (line.match(/\{/g) || []).length;
			const closes = (line.match(/\}/g) || []).length;

			const m = line.match(DEF);
			if (m && !KEYWORDS.has(m[1]) && inNamespaceOnly()) {
				const looksLikeCall = /^[ \t]*[A-Za-z_][A-Za-z0-9_]*[ \t]*\(/.test(line) && !/[ \t*&]/.test(line.slice(0, line.indexOf(m[1])).trim());

				// A member declared inside a class body is the linker's problem, not the
				// unity blob's. Caught by keyword because the brace stack cannot see a
				// class whose opening brace is on an earlier line than its members.
				const looksLikeMember = /\b(?:virtual|override|final)\b/.test(line);

				if (!looksLikeCall && !looksLikeMember) {
					if (!seen.has(m[1])) seen.set(m[1], []);
					seen.get(m[1]).push({ file: f.replace(/^.*\/Source\//, 'Source/'), line: i + 1 });
				}
			}

			// Braces closed first, then opened, so a `} else {` on one line lands right.
			for (let c = 0; c < closes; ++c) blocks.pop();

			/* Everything that is not a namespace is lumped together: what matters is only
			 * whether an enclosing block still counts as file scope, and nothing but a
			 * namespace does.
			 *
			 * 🔴 THE PREVIOUS LINE IS CONSULTED AND IT IS NOT OPTIONAL. This codebase
			 * puts the brace on its own line, so the word `namespace` and the `{` it
			 * opens are never on the same one:
			 *
			 *     namespace
			 *     {
			 *         int Helper() { ... }
			 *
			 * Read off the brace's own line only, that block is classified 'other', the
			 * helper inside it stops being file scope, and the check reports a clean tree
			 * over two identical anonymous-namespace helpers - the exact fault it was
			 * written to catch. Found by planting one and watching it pass. */
			const declares = /\bnamespace\b/.test(line) || /\bnamespace\b/.test(prevCode);
			const kind = declares ? 'namespace' : 'other';
			for (let o = 0; o < opens; ++o) blocks.push(kind);

			depth += opens - closes;

			// Blank lines are skipped so a gap between the keyword and its brace does not
			// lose the association.
			if (line.trim() !== '') prevCode = line;
		});
	}
}

const clashes = [...seen.entries()].filter(([, where]) => {
	const files = new Set(where.map(w => w.file));
	return files.size > 1;
});

if (!clashes.length) {
	console.log(`one definition per name: ${seen.size} file-scope helpers, none defined in two files`);
	process.exit(0);
}

console.error('SAME HELPER DEFINED IN MORE THAN ONE FILE - ' + clashes.length + ' name(s).');
console.error('These are legal in separate translation units and a redefinition inside one unity');
console.error('blob. Which blob a file lands in is UnrealBuildTool\'s choice, so this compiles until');
console.error('it does not, for a reason that has nothing to do with the file that broke.');
console.error('');
for (const [name, where] of clashes) {
	console.error('  ' + name);
	for (const w of where) console.error('      ' + w.file + ':' + w.line);
}
console.error('');
console.error('Fix by keeping ONE definition: leave it in the file that uses it, or declare it in a');
console.error('private header the parts share - the way Private/UI/Web/PRJWebUICommandGroups.h does.');
process.exit(1);
