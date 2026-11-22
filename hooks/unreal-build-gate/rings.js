// The rings, and where the source is. ONE copy, because there used to be several.
//
// 🔴 WHY THIS FILE EXISTS, said plainly rather than discovered again later.
//
// The feature list was written down TWICE - check-architecture.js and metrics.js - and by
// 2026-09-15 the two had drifted to twelve names against eight. metrics.js was silently
// dropping Avatar, Interaction, Sound and Walk out of every I/A/D figure it printed,
// including PRJAvatarSwitch.cpp, the largest file in the project. The report was not wrong
// about the components it named; it was measuring a subset and presenting it as the whole.
//
// The root path was written down SIX times across five hooks. Nothing had drifted there
// yet, which is the only reason it was not also a bug.
//
// A rule enforced from two copies is a rule that will be enforced from one of them.
//
// ROOT is DERIVED, not typed. The hooks live at <workspaces>/.claude/hooks, so the
// workspace is two directories up. Moving the tree to another drive or another machine now
// changes nothing here.

'use strict';
const path = require('path');

const WORKSPACES = path.resolve(__dirname, '../..').replace(/\\/g, '/');
const ROOT = WORKSPACES + '/178_Project/R00';

const PRJ = ROOT + '/Project/Source/PRJ';
const SOURCE = ROOT + '/Project/Source';
const HTMLUI = ROOT + '/Project/Plugins/HtmlUI/Source';
const UI_TREE = ROOT + '/UI';

// THE RINGS, inner to outer. The order is not a preference - it is what the includes
// actually do, counted before it was written down.
//
//   0  Domain       what a villa, a price, a tour ARE. Entities. Depends on nothing at all.
//   1  UseCases     what a person DOES with them. Pure: no world, no actor, no UHT.
//   2  Platform     Unreal's own hooks - GameMode, PlayerController, Drone. ch.32 puts the
//                   framework at the OUTSIDE of the inner rings; it only ever sat at rank 1
//                   because, before there were entities, it was the innermost thing there was.
//   3  the features each its own TOP-LEVEL folder, so the tree says what the product does
//                   (ch.21). May name each other, provided the naming stays acyclic.
//   4  UI           delivery: the widgets and the HTML bridge. Outermost.
const RANK = { Domain: 0, UseCases: 1, Platform: 2, Feature: 3, UI: 4 };

// 🔴 THE FEATURES ARE NAMED HERE BECAUSE THE FOLDER THAT GROUPED THEM IS GONE.
//
// ch.21: the top of the tree should say what the product DOES, not how it was built. It used
// to read Domain / Platform / Features / UI - four words that fit any project ever written.
// It now reads Avatar, Doors, Elevator, Furniture ... and one look tells you this shows villas.
//
// The cost lands here and is worth naming rather than hiding: the ring of a folder used to be
// readable from its path and is now a list somebody has to keep. That is the right way round.
// A path told us the ring by COINCIDENCE of where a folder happened to sit; this is a
// decision, written down, in the file the checks read. A top-level folder in neither list is
// REFUSED by check-architecture.js rather than silently ranked.
//
// 🔴 THE TWO PAWNS ARE NOT FEATURES AND MUST NOT MOVE INTO ONE. APRJDrone and APRJAvatar are
// Platform: they are Unreal's own hooks, an APawn and an ACharacter. What IS a feature is the
// product's answer to "let me walk instead of fly", and that is Avatar/.
//
// 2026-09-07  Interaction, Walk, Sound added - two of them had been on disk and UNRANKED,
//             so the gate was exiting 1 on every run and every include touching them went
//             unexamined. Recorded rather than quietly added.
// 2026-09-09  Avatar added: the SWITCH between flying and walking.
// 2026-09-15  Elevator added, and it is THE SAME FAILURE AS 2026-09-07 REPEATED. The folder
//             landed with the plan of 2026-09-14 and was never ranked, so from that day the
//             gate printed only the unranked alarm and returned before reporting a single
//             include violation - three real ones, all Platform naming a feature outward,
//             sat unseen behind it. Elevator is a feature by the same test as the twelve
//             beside it: a thing the product DOES, and one look at the folder says so.
const FEATURES = new Set([
	'Avatar', 'Doors', 'Elevator', 'Furniture', 'Interaction', 'Lighting', 'Media',
	'Presentation', 'Render', 'SiteMap', 'Sound', 'Viewpoints', 'Walk',
]);

// Two seams, and they are not the same shape.
//
//   Composition  answered further OUT. May name anything inward. This is where an inner ring
//                asks a question the outer one answers - PRJUIPolicy, PRJInputRouting.
//   Ports        what a USE CASE needs the world to do. May name only Domain: a port that
//                names a feature has stopped being a question and become an answer, and the
//                arrow has quietly turned round.
const SEAM = 'Composition';
const PORTS = 'Ports';

// Not a ring and not a feature. Tests name whatever they test, by definition.
const NOT_A_RING = new Set(['Tests']);

module.exports = { WORKSPACES, ROOT, PRJ, SOURCE, HTMLUI, UI_TREE, RANK, FEATURES, SEAM, PORTS, NOT_A_RING };
