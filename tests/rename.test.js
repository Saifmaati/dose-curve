// Run with: node --test
// The name (3.0): MaatiRX, written exactly so everywhere, and the old name left only where it has to be: the
// "formerly" lines, links to the repository (which keeps its name), the code that reads what was saved under the old
// name, and names of things outside the repository. Also the move of saved settings and work to MaatiRX's keys, which
// every page's head script does on whichever page loads first.
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const {execSync}=require("node:child_process");

const root=path.join(__dirname,"..");
const read=f=> fs.readFileSync(path.join(root,f),"utf8");
const files=execSync("git ls-files", {cwd:root}).toString().split("\n").filter(f=> f && !/\.(png|jpg|woff2|ico|pdf)$/.test(f) && fs.existsSync(path.join(root,f)));
const PAGES=["index.html","validation.html","methods.html","educators.html","404.html"];

test("the brand is written MaatiRX everywhere", ()=>{
  const bad=files.filter(f=> /MaatiR[x]\b|Maati<em>R[x]</.test(read(f)));
  assert.deepEqual(bad, []);
  const site=JSON.parse(read("site.webmanifest"));
  assert.equal(site.short_name, "MaatiRX");
  assert.match(site.name, /^MaatiRX /);
  PAGES.forEach(f=> assert.match(read(f), /<title>MaatiRX[ :—]/, f));
  assert.match(read("CITATION.cff"), /^title: "MaatiRX: /m);
  assert.match(JSON.parse(read(".zenodo.json")).title, /^MaatiRX: /);
});

// Where the old name may still appear, and why: [file pattern, line pattern, reason].
const ALLOWED=[
  [/./, /(github\.com\/|repos\/|--repo )Saifmaati\/dose-curve/i, "the repository keeps its name, so links to it carry it"],
  [/^README\.md$/, /^MaatiRX, formerly DoseCurve:/, "the one line in the README that gives the former name"],
  [/^(methods\.html|tools\/methods\.py)$/, /MaatiRX was formerly DoseCurve, and releases up to 2\.19 are archived under that name\./, "the one line in Model and methods (and its source)"],
  [/^(index|validation|methods|educators|404)\.html$/, /if\(\/\^dosecurve\[\.-\]\/\.test\(ls\.key\(x\)\)\) old\.push/, "the head script that moves keys saved under the old name"],
  [/^pk-engine\.js$/, /_FORMATS?=\[.*"dosecurve-(library|progress)"\]/, "files and progress saved before 3.0 still read"],
  [/^sw\.js$/, /k\.startsWith\("dosecurve-"\)/, "the offline caches named for the old name are cleared"],
  [/^ui-move\.js$/, /OLD_PREFIX=\/\^dosecurve/, "work brought from a page that hasn't moved its keys yet"],
  [/^tests\/(rename|sw|move)\.test\.js$/, /dosecurve|DoseCurve|dose-curve/, "tests of the above"],
  [/^docs\/NEEDS-SAIF\.md$/, /saifmaati\.github\.io\/dose-curve|Desktop\/dose-curve|Downloads\/(DOSECURVE-|dosecurve-reference)/, "the old address to check, the checkout's folder and files in Downloads, by their real names"],
];
test("the old name appears only where it has to (the brief's search, with its reasons)", ()=>{
  const stray=[];
  for(const f of files){
    read(f).split("\n").forEach((line, i)=>{
      if(!/dosecurve|dose-curve/i.test(line)) return;   // the brief's search: DoseCurve, dose-curve and dosecurve, in any case
      if(!ALLOWED.some(([fp, lp])=> fp.test(f) && lp.test(line))) stray.push(`${f}:${i+1}: ${line.trim().slice(0,120)}`);
    });
  }
  assert.deepEqual(stray, []);
  // nor split in two, as the old opening screen and storyboards wrote it
  assert.deepEqual(files.filter(f=> /Dose\s*(·+|\||<\/span>\s*<span>)\s*Curve|"Dose" and "Curve"/.test(read(f))), []);
  const formerly=f=> read(f).split("\n").filter(l=> /formerly DoseCurve/.test(l)).length;
  assert.equal(formerly("README.md"), 1);
  assert.equal(formerly("methods.html"), 1);
});

test("every page moves the settings and work saved under the old name's keys, with the same head script", ()=>{
  const snip=f=>{ const h=read(f).slice(0, read(f).indexOf("</script>")); const m=h.match(/  try\{ var ls=localStorage[\s\S]*?\}catch\(e\)\{\} \}\); \}catch\(e\)\{\}\n/); return m && m[0]; };
  const first=snip("index.html");
  assert.ok(first);
  PAGES.forEach(f=>{
    assert.equal(snip(f), first, f);
    const h=read(f).slice(0, read(f).indexOf("</script>"));
    assert.ok(h.indexOf(first)<h.search(/getItem\("maatirx\./), f+": before anything is read");
  });
  // run it against a browser's storage
  const store=new Map([["dosecurve.theme","light"], ["dosecurve.library",'{"format":"dosecurve-library","items":[]}'], ["dosecurve-assignment-abc","{\"0\":{\"ok\":true}}"],
    ["dosecurve-author-draft","{}"], ["dosecurve.effects","off"], ["maatirx.effects","on"], ["someone-else","x"], ["dosecurveish","y"]]);
  const localStorage={get length(){ return store.size; }, key:i=> [...store.keys()][i] ?? null, getItem:k=> store.has(k) ? store.get(k) : null,
    setItem:(k,v)=> store.set(k, String(v)), removeItem:k=> store.delete(k)};
  vm.runInNewContext(first, {localStorage});
  assert.deepEqual(Object.fromEntries(store), {"maatirx.theme":"light", "maatirx.library":'{"format":"dosecurve-library","items":[]}', "maatirx-assignment-abc":"{\"0\":{\"ok\":true}}",
    "maatirx-author-draft":"{}", "maatirx.effects":"on", "maatirx-premove:maatirx.effects":"off", "someone-else":"x", "dosecurveish":"y"},
    "moved once; what is already under MaatiRX's name stays, and the old value is set aside to be merged, not dropped; only the old name's own keys move");
  const again=new Map(store); vm.runInNewContext(first, {localStorage}); assert.deepEqual(store, again, "and a second load changes nothing");
  // storage blocked: nothing throws
  assert.doesNotThrow(()=> vm.runInNewContext(first, {get localStorage(){ throw new Error("blocked"); }}));
  // storage full: a key that can't be written keeps its old copy, and the others still move
  const full=new Map([["dosecurve.library","L"], ["dosecurve.theme","dark"]]);
  const tight={get length(){ return full.size; }, key:i=> [...full.keys()][i] ?? null, getItem:k=> full.has(k) ? full.get(k) : null,
    setItem:(k,v)=>{ if(k==="maatirx.library") throw new Error("QuotaExceededError"); full.set(k, String(v)); }, removeItem:k=> full.delete(k)};
  vm.runInNewContext(first, {localStorage:tight});
  assert.deepEqual(Object.fromEntries(full), {"dosecurve.library":"L", "maatirx.theme":"dark"});
  // the app page loads ui-move.js when something is set aside, which merges it (move.test.js)
  assert.ok(read("index.html").slice(0, read("index.html").indexOf("</script>")).includes('/(^|,)maatirx-premove:/.test(Object.keys(localStorage))'));
});

test("the pages read and write storage only under MaatiRX's names", ()=>{
  const keys=new Set();
  for(const f of files.filter(f=> /\.(js|html)$/.test(f) && !f.startsWith("tests/")))
    for(const m of read(f).matchAll(/(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem)\("([^"]+)"/g)) keys.add(m[1]);
  for(const m of read("index.html").matchAll(/const \w+_KEY="([^"]+)"/g)) keys.add(m[1]);
  for(const m of read("cases.js").matchAll(/"((?:maatirx|dosecurve)-[a-z-]+)/g)) keys.add(m[1]);
  assert.ok(keys.size>=10, [...keys].join());
  assert.deepEqual([...keys].filter(k=> !/^maatirx[.-]/.test(k)), []);
});
