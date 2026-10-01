// Run with: node --test
// The 2.0 stage and root sequence (stage.js, index.html): Three.js pinned to one cdnjs release with its hashes and
// never precached; the stage and its reference data named by content hash; the sequence shown only on a first,
// direct visit to the root address; Effects off on weak devices; and every number the sequence states is the
// engine's own.
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const PK=require("../pk-engine.js");
const C=require("../cases.js");
const root=path.join(__dirname,"..");
const read=f=> fs.readFileSync(path.join(root,f),"utf8");
const hash=f=> crypto.createHash("sha256").update(fs.readFileSync(path.join(root,f))).digest("hex").slice(0,10);
const page=read("index.html"), stage=read("stage.js"), sw=read("sw.js");

test("Three.js is pinned to one cdnjs release with sha512 hashes for both of its files, and never precached", ()=>{
  const m=page.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  assert.ok(m, "an import map");
  const map=JSON.parse(m[1]), url=map.imports.three;
  assert.match(url, /^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/\d+\.\d+\.\d+\/three\.module\.min\.js$/);
  const core=url.replace("three.module.min.js","three.core.min.js");
  [url, core].forEach(u=> assert.match(map.integrity[u]||"", /^sha512-[A-Za-z0-9+/]{86}==$/, u));
  assert.ok(!/cdnjs|three\.module|three\.core/.test(sw), "the service worker never stores Three.js");
  assert.ok(/import\("three"\)/.test(stage) && !/import\("three"\)/.test(page), "only stage.js imports it");
});

test("the stage is loaded after the first paint by its content hash, precached by it, and reads the current reference data", ()=>{
  const h=hash("stage.js");
  assert.ok(page.includes(`const STAGE_SRC="stage.js?v=${h}"`), `index.html loads stage.js?v=${h}`);
  assert.ok(sw.includes(`"./stage.js?v=${h}"`), "sw.js precaches it");
  assert.match(page, /addEventListener\("load",\(\)=> setTimeout\(\(\)=> import\("\.\/"\+STAGE_SRC\)/);
  assert.ok(stage.includes(`validation/reference-results.json?v=${hash("validation/reference-results.json")}`));
});

test("the root sequence shows only on a first, direct visit to the root address, and Effects start off on weak devices", ()=>{
  const head=page.slice(0, page.indexOf("</head>"));
  assert.match(head, /!location\.hash && \/\\\/\(index\\\.html\)\?\$\/\.test\(location\.pathname\)/);
  assert.match(head, /localStorage\.setItem\("dosecurve\.intro","seen"\)/);
  assert.match(head, /if\(!s\)\{ d\.classList\.add\("intro-on"\)/);
  assert.match(head, /n\.deviceMemory<4 \|\| n\.hardwareConcurrency<4/);
  assert.match(head, /localStorage\.getItem\("dosecurve\.effects"\)/);
  assert.match(page, /id="fxBtn" aria-pressed/);
  assert.match(page, /html\.present \.stage-3d/);
});

test("every number the sequence states is the engine's own, and each scene has one heading and a short caption", ()=>{
  const intro=page.slice(page.indexOf('<section class="intro"'), page.indexOf('</section>\n<div class="wrap">')>0 ? page.indexOf('</section>\n<div class="wrap">') : page.indexOf('<div class="wrap">'));
  const REF=require("../validation/reference-results.json");
  [`${PK.LESSONS.length} guided lessons`, `${C.CASES.length} graded cases`, `${REF.scenarios.length} scenarios`, `${4*REF.scenarios.length} readings`, "200 virtual patients"].forEach(t=> assert.ok(intro.includes(t), t));
  const p=PK.normalizeScenario(PK.scenario({})), d=PK.derived(p), V=PK.VIEW_DEFAULTS, w=PK.windowStats(p, V.duration, V.mec, V.mtc);
  assert.ok(intro.includes(`id="heroCmax">${d.cmax.toFixed(1)}<`) && intro.includes(`id="heroAuc">${d.auc.toFixed(1)}<`) && intro.includes(`id="heroTin">${(100*w.tIn/V.duration).toFixed(0)}<`));
  assert.ok(intro.includes(`window ${V.mec}–${V.mtc} mg/L`) && intro.includes(`${p.D} mg by mouth`));
  const scenes=intro.split('<section class="scene').slice(1);
  assert.equal(scenes.length, 7);
  scenes.forEach((s,i)=>{
    assert.equal((s.match(/<h[12] /g)||[]).length, 1, `scene ${i+1}: one heading`);
    const cap=(s.match(/<p class="cap">([^<]+)<\/p>/)||[])[1], words=cap.trim().split(/\s+/).length;
    assert.ok(words>=3 && words<=5, `scene ${i+1}: "${cap}" is ${words} words`);
  });
  assert.ok(/Educational model, not for clinical dosing/.test(scenes[0]) && /Educational model, not for clinical dosing/.test(scenes[6]), "the disclaimer opens and closes it");
  assert.ok(!/\b(safe|unsafe|best|recommended?)\b/i.test(intro.replace(/<[^>]+>/g," ")), "descriptive wording");
});

test("2.1: the stage follows the instrument: the cursor, the population settings, and the same patients as population mode", ()=>{
  assert.match(page, /function updateCursor\(\)\{\n    if\(stage\) stage\.cursor\(cursorT\);/);
  assert.match(page, /pop:state\.pop \? \{n:state\.popn, cvCL:state\.pcl, cvV:state\.pv, seed:state\.pseed\} : null/);
  // the cloud's patients: the worker's sampler (seeded normals, ηCL then ηV, CL·e^ηCL and V·e^ηV through the half-life)
  const worker=read("pop-worker.js");
  assert.match(worker, /const eCL=wCL\*z\(\), eV=wV\*z\(\);/);
  assert.match(worker, /thalf:p\.thalf\*Math\.exp\(eV-eCL\)/);
  assert.match(stage, /z=normals\(PK\.seededRandom\(o\.seed>>>0\)\)/);
  assert.match(stage, /const eCL=wCL\*z\(\), eV=wV\*z\(\), q=Object\.assign\(\{\}, p, \{V:p\.V\*Math\.exp\(eV\), thalf:p\.thalf\*Math\.exp\(eV-eCL\)\}\)/);
  // the same ω: √ln(1 + CV²), with the CV in percent
  const DC=require("../pop-worker.js");
  assert.ok(Math.abs(DC.omega(30)-Math.sqrt(Math.log(1+30*30/1e4)))<1e-15);
  assert.match(stage, /w=cv=> Math\.sqrt\(Math\.log\(1\+cv\*cv\/1e4\)\)/);
});
