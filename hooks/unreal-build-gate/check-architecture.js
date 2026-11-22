// The dependency rule, enforced.
//
// Clean Architecture, Chapter 24 (Partial Boundaries): a source-level boundary inside one
// module is held up by discipline alone, and the book says so plainly - "it is easy for
// developers to weaken the boundary by making source code imports that cross the boundaries
// in the wrong direction". The whole re-layer can be undone by one #include.
//
// So the rule is a check, not a paragraph in a document. It runs in the build gate next to
// the UFUNCTION count, for the same reason: the compiler is happy either way.
//
// THE RINGS, inner to outer. The order is not a preference - it is what the includes
// actually do, counted before it was written down:
//
//   0  Domain       what a villa, a price, a tour ARE. Entities. Depends on nothing at all.
//   1  UseCases     what a person DOES with them. Pure: no world, no actor, no UHT.
//   2  Platform     Unreal's own hooks - GameMode, PlayerController, Drone. Features hang
//                   off these, so they are named by features and name none of them back.
//   3  the features  Doors, Furniture, Lighting, Media, Presentation, Render, SiteMap,
//                   Viewpoints - each its own TOP-LEVEL folder, so the tree says what the
//                   product does (ch.21). May name each other, provided
//                   the naming stays acyclic - that is checked below, not assumed.
//   4  UI           delivery: the widgets and the HTML bridge. Outermost. Everything may
//                   be named by UI; UI may be named by nothing.
//
//   -  Composition  the seams. Declarations answered somewhere further out - PRJUIPolicy,
//                   PRJInputRouting - plus the subsystem that lets features cooperate
//                   without naming each other. Anyone may name it; it may name only Domain.
//                   This is DIP made physical: the name points inward, the answer stays out.
//
// Exit 0 = the rule holds. Exit 1 = it was broken, with the offending lines named.

const fs = require('fs'), path = require('path');

// The rings, the feature list and the source root live in rings.js - ONE copy, read by
// every hook. They used to be typed out here AND in metrics.js, and by 2026-09-15 the two
// lists had drifted to twelve names against eight. See the note at the top of rings.js.
const { PRJ: SRC, RANK, FEATURES, SEAM, PORTS, NOT_A_RING } = require("./rings.js");

// Recorded, never tolerated in silence: APRJPlayerController holds
// TSubclassOf<UPRJMainHUDWidget>, and the VALUE lives inside
// Content/Project/Developer/programming/core/BP_ACCPlayerController.uasset. Retyping the
// property would empty the blueprint's slot without a word from the compiler. It is the one
// arrow left pointing outward, and it closes the day that blueprint is re-authored - not by
// editing the header.
// 2026-09-15: TWO MORE, AND THEY ARE ONE REASON WITH TWO NAMES.
//
// APRJAvatar is a Platform pawn - this file says so at length above, and says the two pawns
// must not move into a feature. A pawn COMPOSES itself in its constructor, and two of the
// components it composes belong to features:
//
//   UPRJCameraTravelComponent   the glide that carries the camera through a switch
//   UPRJWalkMovement            the rule that refuses to raise a body onto the furniture
//
// 🔴 WHY THESE TWO DO NOT GET THE SEAM TREATMENT THE THIRD ONE DID.
//
// A seam works when the inner ring ASKS a question. These are not questions; they are
// CONSTRUCTION, and construction is the one thing a seam cannot be handed. Both are
// created before BeginPlay - CreateDefaultSubobject at PRJAvatar.cpp:228, and
// ObjectInitializer.SetDefaultSubobjectClass at :40 - and a default subobject cannot be
// contributed by another class after the fact without becoming a runtime NewObject instead.
//
// That difference is not academic. Content/Project/Developer/programming/core/
// BP_PRJAvatar.uasset names SwitchTravel, the ONLY asset in 12,061 that does. Turning it
// into a runtime component would empty that blueprint's slot with no word from the
// compiler - the exact failure the UFUNCTION count in verify-build.sh exists to catch, done
// deliberately in the name of a cleaner arrow.
//
// So they are recorded. Both close the day APRJAvatar stops composing itself, not by
// editing this list.
//
// The THIRD violation of 2026-09-15 was not like these and was fixed rather than recorded:
// PRJPlayerController.cpp called UPRJAvatarSwitchSubsystem::Get directly for the STAND HERE
// key while the left button beside it already went through PRJInputRouting. That was a
// question, it now goes through the seam, and the include is gone.
const ALLOWED = new Set([
	'Private/Platform/PRJPlayerController.cpp -> UI/Widgets/PRJMainHUDWidget.h',
	'Private/Platform/PRJAvatar.cpp -> Viewpoints/PRJCameraTravelComponent.h',
	'Private/Platform/PRJAvatar.cpp -> Walk/PRJWalkMovement.h',
]);

function walk(d, out) {
	out = out || [];
	if (!fs.existsSync(d)) return out;
	for (const e of fs.readdirSync(d, { withFileTypes: true })) {
		const p = path.join(d, e.name);
		if (e.isDirectory()) walk(p, out);
		else if (/\.(h|cpp)$/.test(e.name)) out.push(p);
	}
	return out;
}

const rel = f => f.replace(/\\/g, '/').replace(SRC + '/', '');


const unranked = new Set();

function place(p) {
	const parts = p.replace(/^(Public|Private)\//, '').split('/');
	if (parts.length < 2) return null;                       // PRJ.h at the module root
	const top = parts[0];

	// A feature is its own top-level folder now, and its own component.
	if (FEATURES.has(top)) return { ring: 'Feature', group: top };

	if (top === PORTS) return { ring: PORTS, group: PORTS };
	if (top === SEAM) return { ring: SEAM, group: SEAM };
	if (top === 'UI') return { ring: 'UI', group: 'UI/' + parts[1] };
	if (top in RANK) return { ring: top, group: top };

	return null;
}

// An include string as place() reads it: relative paths resolved against the including
// file, then the module name and Public/Private dropped. Anything that still is not one of
// our folders is the engine's, and place() says so.
function ourSpelling(fromRel, inc) {
	let p = inc.replace(/\\/g, '/');
	if (/^\.\.?\//.test(p)) p = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), p));
	return p.replace(/^PRJ\//, '');
}

// 🔴 ASKED ONLY OF OUR OWN FILES, NEVER OF AN INCLUDE STRING.
//
// place() runs on both - on the file being read, and on every path it includes - and the
// include strings are mostly the ENGINE'S: Engine/World.h, GameFramework/Pawn.h,
// Camera/CameraComponent.h. Folding the unranked check into place() reported twenty-three
// engine folders as unranked project folders, which is a check that cries so loudly about
// nothing that the one real case would be lost in it.
function unrankedTop(p) {
	const parts = p.replace(/^(Public|Private)\//, '').split('/');
	if (parts.length < 2) return null;
	const top = parts[0];
	if (FEATURES.has(top) || top === SEAM || top === PORTS || top in RANK || NOT_A_RING.has(top)) return null;
	return top;
}

const violations = [];
const featureEdges = new Map();     // feature -> Set(features it names)
let allowedSeen = 0;

for (const f of walk(SRC)) {
	const top = unrankedTop(rel(f));
	if (top) unranked.add(top);

	const from = place(rel(f));
	if (!from) continue;
	const isPublicHeader = /^Public\//.test(rel(f)) && f.endsWith('.h');

	fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((line, i) => {
		// 🔴 BOTH BRACKETS, AND EVERY SPELLING OF THE SAME PATH. This read only "...", so
		// #include <Viewpoints/X.h> compiled to the same file and was never examined, and
		// "PRJ/Viewpoints/X.h" or "../Viewpoints/X.h" fell out of place() as "not ours".
		// Three spellings, one file - the ring rule has to see all of them as that file.
		const m = line.match(/^[ \t]*#[ \t]*include[ \t]*["<]([^">]+)[">]/);
		if (!m) return;
		const to = place(ourSpelling(rel(f), m[1]));
		if (!to) return;                                     // engine header, or the module root
		if (to.group === from.group) return;                 // inside one group is nobody's business

		if (from.ring === 'Feature' && to.ring === 'Feature') {
			if (!featureEdges.has(from.group)) featureEdges.set(from.group, new Set());
			featureEdges.get(from.group).add(to.group);
			return;
		}

		// Naming a seam is always allowed - that is what a seam is for.
		if (to.ring === SEAM) return;

		// A port may name Domain and nothing else. It is a QUESTION asked inward; the
		// moment it names a feature it is an answer, and a use case holding it would be
		// holding the very adapter it was written to avoid.
		if (from.ring === PORTS) {
			if (to.ring === 'Domain' || to.ring === PORTS) return;
			violations.push({
				file: rel(f), line: i + 1, include: m[1], isPublicHeader,
				why: 'a port may name only Domain - anything else and it is an answer, not a question',
			});
			return;
		}

		// Anyone may name a port. That is the whole point of one.
		if (to.ring === PORTS) return;

		// The seam itself may reach no further in than Domain, or it stops being a seam
		// and becomes a second copy of the thing it was meant to decouple.
		if (from.ring === SEAM) {
			if (to.ring === 'Domain') return;
			violations.push({ file: rel(f), line: i + 1, include: m[1], why: 'a seam may name only Domain', isPublicHeader });
			return;
		}

		// ── the framework class is a detail, even when it is INWARD ──────────────
		//
		// Features -> Platform passes the ring test: Platform is ring 1 and Features is
		// ring 2, so the arrow points inward and every rule above waves it through. It
		// was still wrong, and it was there six times - every feature's input handler
		// named APRJPlayerController to reach one method on it.
		//
		// Clean Architecture ch.22: an inner ring may not name a FRAMEWORK type, and
		// APRJPlayerController is one - it is Unreal's input plumbing wearing a project
		// prefix. The features now take the engine's own APlayerController and ask
		// Composition/PRJInputRouting.h for anything more, which is what a seam is.
		//
		// Checked by name rather than by ring because the ring is not what is wrong
		// here. The rest of Platform is fair game; this one class is the framework.
		if (from.ring === 'Feature' && /Platform\/PRJPlayerController\.h$/.test(m[1])) {
			violations.push({
				file: rel(f), line: i + 1, include: m[1], isPublicHeader,
				why: 'a feature names the framework controller - take APlayerController and ask PRJInputRouting for the rest',
			});
			return;
		}

		if (RANK[to.ring] <= RANK[from.ring]) return;        // inward or sideways: fine

		const key = rel(f) + ' -> ' + m[1];
		if (ALLOWED.has(key) && !isPublicHeader) { allowedSeen++; return; }

		violations.push({
			file: rel(f), line: i + 1, include: m[1], isPublicHeader,
			why: from.ring + ' (ring ' + RANK[from.ring] + ') names ' + to.ring + ' (ring ' + RANK[to.ring] + ') - outward',
		});
	});
}

// ── features may name each other, but not in a circle (ADP) ─────────────────
const cycles = [];
const WHITE = 0, GREY = 1, BLACK = 2;
const colour = new Map();
function visit(node, stack) {
	colour.set(node, GREY);
	for (const next of (featureEdges.get(node) || [])) {
		const c = colour.get(next) || WHITE;
		if (c === GREY) cycles.push([...stack, node, next].join(' -> '));
		else if (c === WHITE) visit(next, [...stack, node]);
	}
	colour.set(node, BLACK);
}
for (const node of featureEdges.keys()) if ((colour.get(node) || WHITE) === WHITE) visit(node, []);

// A top-level folder in neither list has no ring, so every include into or out of it is
// waved through unexamined. Silence there is the failure mode this whole file exists to
// prevent, so it is loud.
if (unranked.size) {
	console.error('UNRANKED TOP-LEVEL FOLDER(S): ' + [...unranked].sort().join(', '));
	console.error('Every include touching these is unchecked. Add each to FEATURES if it is a');
	console.error('thing the product does, to RANK if it is a ring, or to NOT_A_RING with a reason.');
	process.exit(1);
}

if (violations.length === 0 && cycles.length === 0) {
	const edges = [...featureEdges.values()].reduce((n, s) => n + s.size, 0);
	console.log('dependency rule holds: Domain names nothing, no ring names one outside it, '
		+ edges + ' feature-to-feature edges and no cycle'
		+ (allowedSeen ? ' (' + allowedSeen + ' recorded exception in place)' : ''));
	process.exit(0);
}

console.error('DEPENDENCY RULE BROKEN.');
console.error('The rings go Domain -> UseCases -> Platform -> features -> UI, inner to outer. An');
console.error('pointing outward puts a cycle back (ADP) and points at something less stable (SDP).');
if (violations.length) {
	console.error('');
	for (const v of violations) {
		console.error('  ' + v.file + ':' + v.line + '  ->  ' + v.include);
		console.error('      ' + v.why + (v.isPublicHeader ? '   [PUBLIC HEADER - every consumer compiles it too]' : ''));
	}
	console.error('');
	console.error('Fix by declaring what the inner ring needs in Public/Composition/ and answering');
	console.error('it from the outer one, the way PRJUIPolicy and PRJInputRouting already do.');
	console.error('If the dependency is genuinely correct, add it to ALLOWED in this file WITH the');
	console.error('reason - a silent exception is how the rule dies.');
}
if (cycles.length) {
	console.error('');
	console.error('  FEATURE CYCLE - neither of these can be built, tested or read alone:');
	for (const c of cycles) console.error('      ' + c);
	console.error('  Break it by moving the shared piece into Domain, or by declaring a seam in');
	console.error('  Public/Composition/ that both answer.');
}
process.exit(1);
