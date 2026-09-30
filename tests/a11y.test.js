// Run with: node --test
// Classroom and accessibility commitments that can be read from the page itself: the system theme, present
// mode, single-key shortcuts that can be switched off (WCAG 2.1.4), a keyboard-operable dose timeline, a text
// alternative for the chart, and reduced motion.
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const page=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");

test("the theme follows the system until the reader picks one (before the first paint)", ()=>{
  const head=page.slice(0, page.indexOf("</head>"));
  assert.match(head, /matchMedia\("\(prefers-color-scheme: light\)"\)/);
  assert.ok(head.indexOf('localStorage.getItem("dosecurve.theme")') < head.indexOf("prefers-color-scheme"), "a stored choice wins");
});

test("present mode: a button, a way out (a button and Esc), and the chart given the width", ()=>{
  assert.match(page, /id="presentBtn" aria-pressed="false"/);
  assert.match(page, /id="presentExit"/);
  assert.match(page, /html\.present aside\.controls/);
  assert.match(page, /html\.present \.grid\{grid-template-columns:1fr !important\}/);
  assert.match(page, /e\.key==="Escape" && document\.documentElement\.classList\.contains\("present"\)/);
});

test("single-key shortcuts (Space, L, B, ?) can be switched off, and never fire while typing or in a dialog", ()=>{
  assert.match(page, /id="keysOn" checked/);
  assert.match(page, /dosecurve\.keys/);
  assert.match(page, /closest\("input,select,textarea,\[contenteditable\]"\)/);
  assert.match(page, /document\.querySelector\("dialog\[open\]"\)\) return;/);
  ["<kbd>L</kbd>","<kbd>B</kbd>","<kbd>?</kbd>"].forEach(k=> assert.ok(page.includes(k), k));
});

test("the dose timeline takes the keyboard, and the chart has a text alternative", ()=>{
  assert.match(page, /<svg id="evStrip"[^>]*tabindex="0"/);
  assert.match(page, /strip\.addEventListener\("keydown"/);
  assert.match(page, /<svg id="plot"[^>]*aria-describedby="plotSummary"/);
  assert.match(page, /id="plotSummary"/);
  assert.match(page, /byId\("plotSummary"\)\.textContent=/);
});

test("reduced motion is respected", ()=>{
  assert.match(page, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(page, /reduceMotion\(\)/, "playback steps instead of animating");
});

test("every icon-only button has an accessible name", ()=>{
  const bad=[...page.matchAll(/<button([^>]*)>([^<]{1,3})<\/button>/g)].filter(m=> !/[A-Za-z0-9]/.test(m[2]) && !/aria-label=/.test(m[1]));
  assert.deepEqual(bad.map(m=>m[0]), []);
});
