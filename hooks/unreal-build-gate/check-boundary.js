// The C++ <-> JS boundary, checked.
//
// Clean Architecture, Part V: a boundary is drawn along an axis of change, and the
// dangerous ones are the ones no compiler checks. This is the most dangerous line in the
// project: names shared as plain text between PRJWebUICommands.cpp and the page's
// JavaScript. Rename one side and the build is green, the product is silently deaf.
//
// The skill's Check 5 asks: what proves both sides still agree? Until now, nothing. This.
//
// Three separate contracts, not one list:
//   1. COMMANDS  page -> engine   C++ T.Add(TEXT("x"))     JS send('x')
//   2. EVENTS    engine -> page   C++ SendEvent(TEXT("x")) JS handler table key
//   3. LIGHT KEYS which control the page names inside a lightSet payload. Not a command
//                 name and not an event name -- a VALUE carried by one - so neither check
//                 above sees it, and it was unchecked until a slider named 'warmth' on one
//                 side and 'warmpth' on the other would have moved on screen and reached
//                 nobody, in silence.
//
// Exit 0 = both sides agree. Exit 1 = a name on one side has no partner.

const fs = require('fs'), path = require('path');

const { PRJ: CPP_TREE, UI_TREE: JS_TREE } = require("./rings.js");   // one copy of the root, see rings.js

function walk(d, out, test) {
  out = out || [];
  if (!fs.existsSync(d)) return out;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out, test);
    else if (test(e.name)) out.push(p);
  }
  return out;
}
const readAll = files => files.map(f => fs.readFileSync(f, 'utf8')).join('\n');
const grabAll = (text, re) => {
  const found = new Set();
  let m;
  while ((m = re.exec(text))) found.add(m[1]);
  return found;
};
const sorted = set => [...set].sort();

const cppAll = readAll(walk(CPP_TREE, [], n => /\.(h|cpp)$/.test(n)));
const jsFiles = walk(JS_TREE, [], n => n.endsWith('.js'));
const jsAll = readAll(jsFiles);

// 1. COMMANDS - scanned across the WHOLE module, not one file.
//
// Reading only PRJWebUICommands.cpp was fine while every T.Add lived there. The moment the
// table is split across files, a single-file scan reports fewer commands and still says
// green: the check would go blind exactly when the code moved. Tree-wide is the only
// version that survives the refactor it is meant to protect.
const cppCommands = grabAll(cppAll, /T\.Add\(TEXT\("([^"]+)"\)/g);
const jsCommands = grabAll(jsAll, /\bsend\('([A-Za-z][A-Za-z0-9_]*)'/g);

// 2. EVENTS - the JS side is the APPLY table in engine-bridge.js; window.engineEvent
//    dispatches through APPLY[msg.type]. Read exactly that object literal: matching its
//    braces, not a fixed window, so the check does not drift when the file grows.
const cppEvents = grabAll(cppAll, /SendEvent\(TEXT\("([^"]+)"\)/g);

// The declaration is matched WHOLE. An indexOf('var APPLY') happily finds
// 'var APPLY_RENAMED' and then reads a table that is no longer the one being dispatched
// through - a green run over the wrong object. The red-green suite caught exactly that.
function objectLiteral(src, name) {
  const decl = new RegExp('\\bvar\\s+' + name + '\\s*=');
  const found = decl.exec(src);
  if (!found) return null;
  const at = found.index;
  let i = src.indexOf('{', at);
  if (i < 0) return null;
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') {
      depth--;
      if (depth === 0) return src.slice(i, j + 1);
    }
  }
  return null;
}

// WHICH file holds APPLY is not assumed either. It used to be read out of
// engine-bridge.js by path, which is the same blindness the commands scan was cured of:
// move the table to a new file and the check reads nothing and says green. The tree is
// searched instead, and two tables are as much a refusal as none - the dispatcher reads
// one of them, and a check cannot tell which.
const applyHomes = jsFiles.filter(f => objectLiteral(fs.readFileSync(f, 'utf8'), 'APPLY'));
if (applyHomes.length !== 1) {
  console.error('CHECK BROKEN: expected exactly one `var APPLY` table under UI/, found ' + applyHomes.length + '.');
  for (const f of applyHomes) console.error('    ' + path.relative(JS_TREE, f));
  console.error('The event table was renamed, moved, or duplicated. Fix this checker before');
  console.error('trusting a green run - a check that silently stops looking is worse than none.');
  process.exit(1);
}
const applyTable = objectLiteral(fs.readFileSync(applyHomes[0], 'utf8'), 'APPLY');
// Each key sits on its own line in APPLY, so anchor to the line. Anchoring is what keeps
// inner functions inside a handler body from being mistaken for table entries.
const jsEvents = grabAll(applyTable, /^\s*([A-Za-z][A-Za-z0-9_]*)\s*:\s*function\s*\(/gm);

// 3. PAYLOAD KEYS - the names carried INSIDE a command, one contract per keyed command.
//
// 🔴 THIS USED TO BE lightSet ONLY, AND SAID WHY. The first tree-wide read of
// `Key == TEXT(...)` reported fourteen light keys against four, because renderSet, toggle,
// railPane and action dispatch the same way - so the scan was narrowed to lightSet's file
// and the other four were dropped in silence. Found 2026-09-15: four contracts of exactly
// that shape, unguarded. Narrowing was the wrong cure for mixing them up; reading each
// handler's OWN body is the right one.
//
// Which commands are keyed is DISCOVERED, not listed: any handler that reads a "key" field.
// A sixth keyed command is checked the day it is written, with no edit here.
const cppFiles = walk(CPP_TREE, [], n => /\.(h|cpp)$/.test(n));
const cppText = new Map(cppFiles.map(f => [f, fs.readFileSync(f, 'utf8')]));

// A handler's body: from its T.Add to the next T.Add in the same file, or the file's end.
function handlerBodies() {
  const out = new Map();                                  // command -> [{ file, body }]
  for (const [f, src] of cppText) {
    const re = /T\.Add\(TEXT\("([^"]+)"\)/g;
    const hits = [];
    let m;
    while ((m = re.exec(src))) hits.push({ name: m[1], at: m.index });
    hits.forEach((h, i) => {
      const body = src.slice(h.at, i + 1 < hits.length ? hits[i + 1].at : src.length);
      if (!out.has(h.name)) out.set(h.name, []);
      out.get(h.name).push({ file: f, body });
    });
  }
  return out;
}

// A function body by brace matching, from the first '{' at or after `from`.
function braceBody(src, from) {
  const i = src.indexOf('{', from);
  if (i < 0) return '';
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(i, j + 1);
  }
  return '';
}

const keyTests = text => grabAll(text, /\b\w*Key\s*[!=]=\s*TEXT\("([A-Za-z][A-Za-z0-9_]*)"\)/g);

// The keys a handler answers to: its own comparisons, plus those of any function it hands
// the key to. renderSet answers five of its six keys inside PRJRenderCamera::FieldForKey,
// and a check that stopped at the handler would call all five unanswered.
function cppKeysFor(body) {
  const keys = keyTests(body);
  const called = grabAll(body, /\b([A-Z]\w*)\s*\([^;{}]*\bKey\b[^;{}]*\)/g);
  for (const fn of called) {
    const def = new RegExp('\\b' + fn + '\\s*\\([^;{}]*\\)\\s*(?:const\\s*)?\\{', 'g');
    for (const src of cppText.values()) {
      let m;
      while ((m = def.exec(src))) for (const k of keyTests(braceBody(src, m.index))) keys.add(k);
    }
  }
  return keys;
}

// The page sends a key three ways, and each is read:
//   literal  send('cmd', { key: 'x' ... })
//   wrapper  Engine?.cmd?.('x', ...)  - loose between name and paren, because the call is
//            written through optional chaining and pinning the punctuation would go blind
//            the day somebody drops the ?.
//   table    send('cmd', { key: TABLE[id] }) - every value of TABLE, minus a value the code
//            routes to a command of its own first (TABLE[id] === 'x' then send('x')).
// For lightSet the MARKUP too: one data-light per slider is where that name is written.
const htmlAll = readAll(walk(JS_TREE, [], n => n.endsWith('.html')));

function jsKeysFor(cmd) {
  const keys = new Set([
    ...grabAll(jsAll, new RegExp("\\bsend\\('" + cmd + "'\\s*,\\s*\\{\\s*key\\s*:\\s*'([A-Za-z]\\w*)'", 'g')),
    ...grabAll(jsAll, new RegExp('\\b' + cmd + "\\b[?.]{0,3}\\(\\s*['\"]([A-Za-z]\\w*)['\"]", 'g')),
  ]);
  const tables = grabAll(jsAll, new RegExp("\\bsend\\('" + cmd + "'\\s*,\\s*\\{\\s*key\\s*:\\s*([A-Za-z_]\\w*)\\[", 'g'));
  for (const t of tables) {
    for (const f of jsFiles) {
      const src = fs.readFileSync(f, 'utf8');
      const table = objectLiteral(src, t);
      if (!table) continue;
      const routedAway = grabAll(src, new RegExp('\\b' + t + "\\[\\w+\\]\\s*===\\s*'([A-Za-z]\\w*)'", 'g'));
      for (const v of grabAll(table, /:\s*'([A-Za-z]\w*)'/g)) if (!routedAway.has(v)) keys.add(v);
    }
  }
  if (cmd === 'lightSet') for (const k of grabAll(htmlAll, /data-light="([A-Za-z]+)"/g)) keys.add(k);
  // An exclusive button group whose state key IS the command - { key: 'page', prefix: 'b-',
  // ids: ['b-home', ...] } in home.js. The ids, less the prefix, are the values the state
  // takes, and the bridge sends the state as the key.
  const group = new RegExp("\\{\\s*key\\s*:\\s*'" + cmd + "'[^}]*?prefix\\s*:\\s*'([^']*)'[^}]*?ids\\s*:\\s*\\[([^\\]]*)\\]", 'g');
  let g;
  while ((g = group.exec(jsAll))) {
    for (const id of grabAll(g[2], /'([^']+)'/g)) if (id.startsWith(g[1])) keys.add(id.slice(g[1].length));
  }
  return keys;
}

// What a handler DECLARES it takes: its registered description, the last TEXT("...") of the
// row - "dock section: home / walk / edit / light / present / exit". A key the page sends and
// the C++ answers Unmapped() for is not drift when the description names it: the engine has
// said, in the one place it lists its vocabulary, that the key is known and not acted on.
function declaredKeysFor(body) {
  if (!/Unmapped\(\)/.test(body)) return new Set();
  const texts = [...body.matchAll(/TEXT\("([^"]*)"\)/g)];
  const desc = texts.length ? texts[texts.length - 1][1] : '';
  return new Set(desc.replace(/^[^:]*:/, '').split(/[\s\/,()]+/).filter(Boolean));
}

const keyedContracts = [];
for (const [cmd, homes] of handlerBodies()) {
  if (!homes.some(h => /TEXT\("key"\)/.test(h.body))) continue;
  // One command registered twice is a split dispatcher: the check cannot know which half
  // the engine runs, so it refuses instead of reading one and guessing.
  if (homes.length !== 1) {
    console.error('CHECK BROKEN: command ' + cmd + ' is registered ' + homes.length + ' times:');
    for (const h of homes) console.error('    ' + path.relative(CPP_TREE, h.file));
    process.exit(1);
  }
  keyedContracts.push({ cmd, cpp: cppKeysFor(homes[0].body), js: jsKeysFor(cmd),
                        declared: declaredKeysFor(homes[0].body) });
}

const problems = [];

function compare(label, fromName, from, toName, to, note) {
  const onlyFrom = sorted(from).filter(x => !to.has(x));
  const onlyTo = sorted(to).filter(x => !from.has(x));
  console.log(label + ': ' + from.size + ' in ' + fromName + ', ' + to.size + ' in ' + toName);
  if (onlyFrom.length) {
    problems.push({ label, side: fromName, other: toName, names: onlyFrom, note });
  }
  if (onlyTo.length) {
    problems.push({ label, side: toName, other: fromName, names: onlyTo, note });
  }
  if (!onlyFrom.length && !onlyTo.length) console.log('  both sides agree');
}

compare('COMMANDS', 'C++', cppCommands, 'JS', jsCommands,
  'a command the engine registers that no page sends is dead; one the page sends that the engine does not register fails silently at runtime');
compare('EVENTS', 'C++', cppEvents, 'JS', jsEvents,
  'an event the engine sends that the page has no handler for is dropped on the floor');

// One contract per keyed command. A handler that reads a key but compares none (passes it
// straight through) has nothing to agree on, and is skipped rather than reported as an
// empty contract.
for (const c of keyedContracts.sort((x, y) => x.cmd.localeCompare(y.cmd))) {
  if (!c.cpp.size) continue;
  // Only the page-side surplus can be declared away. A key the C++ answers that no page
  // sends is dead code whatever any description says.
  const declaredUnmapped = sorted(c.js).filter(k => !c.cpp.has(k) && c.declared.has(k));
  if (declaredUnmapped.length) {
    console.log('  ' + c.cmd + ': declared Unmapped by the handler, not drift - ' + declaredUnmapped.join(', '));
  }
  const answered = new Set([...c.cpp, ...declaredUnmapped]);
  compare('KEYS ' + c.cmd, 'C++', answered, 'JS', c.js,
    'a ' + c.cmd + ' key the page sends that the C++ does not answer does nothing, in silence; one the C++ answers that no page sends is dead');
}

if (!problems.length) {
  console.log('\nboundary holds: every shared name has a partner on the other side.');
  process.exit(0);
}

console.error('\nBOUNDARY MISMATCH - ' + problems.length + ' group(s).');
console.error('These names are shared as plain text. The compiler sees none of this.');
for (const p of problems) {
  console.error('');
  console.error('  ' + p.label + ' present in ' + p.side + ' but missing in ' + p.other + ':');
  for (const n of p.names) console.error('      ' + n);
  console.error('    why it matters: ' + p.note);
}
process.exit(1);
