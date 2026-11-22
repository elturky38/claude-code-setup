// The two numbers the book asks for, measured rather than felt.
//
//   I = Fan-out / (Fan-in + Fan-out)     instability   0 = nothing can make it change
//   A = abstract types / all types       abstractness  1 = it is all declarations
//   D = |A + I - 1|                      distance from the Main Sequence
//
// Clean Architecture, Part IV. A component that many things depend on must be hard to change
// AND abstract (SAP); one that is stable and concrete sits in the Zone of Pain - rigid, and
// everything is nailed to it.
//
// "Abstract" here means a type this module publishes that carries NO implementation of its
// own: a namespace of declarations answered elsewhere, a UINTERFACE, or a class whose methods
// are all pure virtual. A UCLASS with bodies is concrete.
//
// This is a REPORT, not a gate. It exits 0 whatever it finds: a number moving the wrong way
// can be the honest price of a change, and a check that fails on it would only teach people
// to stop looking. The gate is check-architecture.js, which enforces direction, not distance.
'use strict';
const fs = require('fs'), path = require('path');

// The source root and the feature list come from rings.js. They used to be typed out HERE
// as well, and by 2026-09-15 this copy held eight names against check-architecture.js twelve
// - so Avatar, Interaction, Sound and Walk resolved to null in componentOf() below and
// dropped out of every I/A/D figure this file printed, PRJAvatarSwitch.cpp among them. The
// numbers were not wrong; they were measured against a subset and printed as the whole.
const { PRJ: SRC, FEATURES } = require("./rings.js");
const RINGS = ["Domain", "UseCases", "Ports", "Platform", "UI", "Composition"].concat([...FEATURES]);

function walk(d, out) {
	out = out || [];
	if (!fs.existsSync(d)) return out;
	for (const e of fs.readdirSync(d, { withFileTypes: true })) {
		const p = path.join(d, e.name).replace(/\\/g, '/');
		if (e.isDirectory()) walk(p, out); else out.push(p);
	}
	return out;
}

// A "component" is the folder a dependency can sensibly be drawn to: the ring, except for
// Features and UI where each child is its own component.
function componentOf(incPath) {
	const parts = incPath.split('/');
	if (!RINGS.includes(parts[0])) return null;
	if (parts.length < 2) return null;
	return parts[0] === 'UI' ? parts[0] + '/' + parts[1] : parts[0];
}
const relOf = f => f.replace(SRC + '/', '').replace(/^(Public|Private)\//, '');

const files = walk(SRC + '/Public').concat(walk(SRC + '/Private')).filter(f => /\.(h|cpp)$/.test(f));

const comps = new Map();   // name -> {in:Set, out:Set, abstract:0, concrete:0, names:[]}
const get = n => {
	if (!comps.has(n)) comps.set(n, { in: 0, out: 0, abstract: 0, concrete: 0, names: [] });
	return comps.get(n);
};

for (const f of files) {
	const from = componentOf(relOf(f));
	if (!from) continue;
	get(from);
	for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
		const m = line.match(/^[ \t]*#include[ \t]*"([^"]+)"/);
		if (!m) continue;
		const to = componentOf(m[1]);
		if (!to || to === from) continue;
		get(from).out++;
		get(to).in++;
	}
}

// Abstractness is a property of what a component PUBLISHES, so only public headers count.
for (const f of walk(SRC + '/Public').filter(f => f.endsWith('.h'))) {
	const c = componentOf(relOf(f));
	if (!c) continue;
	const src = fs.readFileSync(f, 'utf8');
	const base = path.basename(f);

	const hasUInterface = /\bUINTERFACE\s*\(/.test(src);
	const hasUClass = /\bUCLASS\s*\(/.test(src);
	const hasUStruct = /\bUSTRUCT\s*\(/.test(src);

	// A port: a plain C++ class whose methods are pure virtual. This is the project's real
	// abstraction now that Ports/ exists, and it is not a UINTERFACE on purpose - see
	// Public/Ports/PRJPriceSource.h for why.
	const hasPureVirtual = /\bvirtual\b[^;{]*=\s*0\s*;/.test(src);

	// 🔴 A HEADER THAT DECLARES A TYPE IS CONCRETE, EVEN WITHOUT USTRUCT.
	//
	// This test used to be "a namespace with no function bodies", which was written when
	// the only such headers were seams - PRJUIPolicy, PRJInputRouting - and was right then.
	// Domain/ broke it on the day it was created: FPRJPriceBook and FPRJSelection are plain
	// structs inside a namespace with their methods declared and defined in the .cpp, so
	// they matched the old test exactly and Domain reported A = 1.00 and D = 0.00.
	//
	// That was the metric flattering the thing it exists to judge. An entity is DATA plus a
	// rule over it; it is the most concrete thing in the system. Only a namespace holding
	// nothing but free-function declarations is a seam.
	const declaresAType = /\b(struct|class)\s+[A-Za-z_]\w*\s*(final)?\s*[:{]/.test(src);
	const declOnly = !hasUClass && !hasUStruct && !hasUInterface && !declaresAType
		&& /\bnamespace\s+\w+/.test(src) && !/\)\s*\{[^}]/.test(src.replace(/\/\*[\s\S]*?\*\//g, ''));

	if (hasUInterface || hasPureVirtual || declOnly) { get(c).abstract++; get(c).names.push('A  ' + base); }
	else { get(c).concrete++; get(c).names.push('   ' + base); }
}

const rows = [...comps.entries()].map(([name, c]) => {
	const total = c.in + c.out;
	const I = total ? c.out / total : 0;
	const types = c.abstract + c.concrete;
	const A = types ? c.abstract / types : 0;
	const D = Math.abs(A + I - 1);
	return { name, ...c, I, A, D };
}).sort((a, b) => b.D - a.D);

const pad = (s, n) => String(s).padEnd(n);
console.log(pad('component', 22) + pad('fan-in', 8) + pad('fan-out', 9) + pad('I', 7) + pad('A', 7) + pad('D', 7) + 'zone');
console.log('-'.repeat(72));
for (const r of rows) {
	const zone = r.D <= 0.35 ? 'ok'
		: (r.A + r.I) < 1 ? 'ZONE OF PAIN - stable and concrete'
			: 'ZONE OF USELESSNESS - abstract and unused';
	console.log(pad(r.name, 22) + pad(r.in, 8) + pad(r.out, 9)
		+ pad(r.I.toFixed(3), 7) + pad(r.A.toFixed(3), 7) + pad(r.D.toFixed(3), 7) + zone);
}

if (process.argv.includes('--types')) {
	for (const r of rows) {
		if (!r.names.length) continue;
		console.log('\n' + r.name + ':');
		for (const n of r.names) console.log('  ' + n);
	}
}
