// Every automation test the source declares must appear in the run, BY NAME.
//
// 🔴 THE COUNT ALONE LET A TEST VANISH, AND IT LOOKED GREEN.
//
// On 2026-09-15 a new case was registered as "PRJ.UseCase.ConfigureFurniture.QuotedPrice".
// The existing case "PRJ.UseCase.ConfigureFurniture" became a GROUP in the automation tree
// the moment a path extended it, and the group is not run as a test. One case in, one case
// silently out: the gate printed "45 tests ran, all passed" before and after, and the
// selection-pricing test had stopped running.
//
// So the roster is read from source - the path string in every IMPLEMENT_*_AUTOMATION_TEST -
// and each one has to have completed in the log. A declared case that did not run is named.
//
// Usage: node test-roster.js <test log>     Exit 0 = every declared case ran. 1 = not.

const fs = require('fs'), path = require('path');
const { SOURCE, HTMLUI } = require('./rings.js');

// Both prefixes verify-build.sh passes to Automation RunTests. It was 'PRJ.' alone,
// which was true until SELL grew its first test on 2026-09-22: the two new cases
// ran and were counted, and the roster still reported "all 54 declared" because it
// had never been told to look for them. A safety net that cannot see a case cannot
// notice it disappearing.
const FILTERS = ['PRJ.', 'SELL.'];

function walk(d, out) {
	if (!fs.existsSync(d)) return out;
	for (const e of fs.readdirSync(d, { withFileTypes: true })) {
		const p = path.join(d, e.name);
		if (e.isDirectory()) walk(p, out);
		else if (e.name.endsWith('.cpp')) out.push(p);
	}
	return out;
}

const declared = new Map();     // path -> file
for (const f of [...walk(SOURCE, []), ...walk(HTMLUI, [])]) {
	const src = fs.readFileSync(f, 'utf8');
	for (const m of src.matchAll(/IMPLEMENT_[A-Z_]*AUTOMATION_TEST\s*\(\s*\w+\s*,\s*"([^"]+)"/g)) {
		if (FILTERS.some(p => m[1].startsWith(p))) declared.set(m[1], path.relative(SOURCE, f));
	}
}

const log = process.argv[2];
if (!log || !fs.existsSync(log)) {
	console.error('test-roster: no test log at ' + log);
	process.exit(1);
}
const ran = new Set();
for (const m of fs.readFileSync(log, 'utf8').matchAll(/Test Completed\..*?Path=\{([^}]+)\}/g)) ran.add(m[1]);

const missing = [...declared.keys()].filter(p => !ran.has(p)).sort();
if (!missing.length) {
	console.log('test roster: all ' + declared.size + ' declared cases ran.');
	process.exit(0);
}

console.error('TESTS DECLARED BUT NOT RUN - ' + missing.length + ' of ' + declared.size + ':');
for (const p of missing) {
	const shadowedBy = [...declared.keys()].filter(q => q.startsWith(p + '.'));
	console.error('    ' + p + '   (' + declared.get(p) + ')');
	if (shadowedBy.length) {
		console.error('      its path is a GROUP now, because ' + shadowedBy.join(', ') + ' extends it.');
		console.error('      Give the longer one a sibling path instead.');
	}
}
process.exit(1);
