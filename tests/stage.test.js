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

test("the root sequence plays on every visit to the root address; #app and content links open the app; Effects start off on weak devices", ()=>{
  const head=page.slice(0, page.indexOf("</head>"));
  assert.match(head, /!location\.hash && \/\\\/\(index\\\.html\)\?\$\/\.test\(location\.pathname\)\)\{\n\s+d\.classList\.add\("intro-on"\)/);
  assert.ok(!/dosecurve\.intro/.test(page), "no remembered 'seen' skip (2.10)");
  // back from the app returns to the sequence: one #app entry, pushed once and replaced after; back and forward between
  // the two never reload; Home adds an entry for the root address and replays the sequence
  assert.match(page, /history\.pushState\(\{dc:1\}, "", url\); else history\.replaceState\(\{dc:1\}, "", url\)/);
  assert.match(page, /\(was==="" \|\| was==="#app"\) && \(h==="" \|\| h==="#app"\)\)\{ if\(h\) toApp\(\); else showSeq\(\); return; \}\n\s+location\.reload\(\);/);
  assert.match(page, /byId\("homeLink"\)\.addEventListener\("click",e=>\{ e\.preventDefault\(\); if\(location\.hash\) history\.pushState/);
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

test("2.2: the paper pages: a decorative masthead per screen, short captions, the case as a dossier with accordions", ()=>{
  assert.match(page, /<div class="masthead" id="masthead" aria-hidden="true">/);
  const m=page.match(/const m=curTab==="ls" \? (\[[^\]]+\]) : curTab==="cs" \? (\[[^\]]+\]) : curTab==="pr" \? (\[[^\]]+\])[\s\S]*?fit \? (\[[^\]]+\]) : win \? (\[[^\]]+\])/);
  assert.ok(m, "a masthead for Lessons, Cases, Practice, Fit and Hit the window");
  m.slice(1).forEach(a=>{ const cap=JSON.parse(a)[2], n=cap.split(/\s+/).length; assert.ok(n>=3 && n<=5, `"${cap}" is ${n} words`); });
  assert.match(page, /lesson \? \[\.\.\.half\(lesson\.title\), byId\("lsNum"\)\.textContent\]/, "a lesson's masthead is its own title");
  assert.match(page, /html\.ed-app #lsTitle\{position:absolute/, "the lesson's title stays its heading for screen readers");
  const C=read("cases.js");
  assert.match(C, /<details class="cs-more cs-dossier" open><summary>Case facts<\/summary><dl class="cs-facts">/);
  assert.match(C, /<details class="cs-more cs-refs"><summary>Sources<\/summary>/);
  assert.equal((C.match(/<dt>Levels<\/dt><dd class="cs-lv">/g)||[]).length, 2);
});

test("2.3: link previews state the app's own counts; the validation page's sphere counts every comparison it runs", ()=>{
  const og=(page.match(/<meta property="og:description" content="([^"]*)">/)||[])[1];
  assert.ok(og.includes(`${PK.LESSONS.length} guided lessons`) && og.includes(`${C.CASES.length} graded clinical cases`), og);
  assert.ok(fs.existsSync(path.join(root,"og-image.png")));
  const v=read("validation.html"), REF=require("../validation/reference-results.json");
  const counters=(v.match(/\bif\(mark\(/g)||[]).length;
  assert.equal(counters, 6, "every counter records its result for the sphere");
  assert.match(v, /window\.dcN=4\*REF\.scenarios\.length\+2\*REF\.map\.scenarios\.length\+3\*REF\.pkpd\.scenarios\.length\+3\*REF\.idr\.scenarios\.length\+2\*REF\.hd\.scenarios\.length;/);
  assert.match(v, /word\.textContent=window\.dcDone \? "Validated" : "Checked"/, "the word says Validated only when every check passed");
  assert.match(v, /<section class="vhero" aria-hidden="true"><p class="vword" id="vWord">Validating<\/p>/);
  assert.ok(v.includes(page.match(/<script type="importmap">[\s\S]*?<\/script>/)[0]), "the same pinned Three.js");
});

test("2.10: one world, one camera: pinned scenes, the cold open's rules, tiers, a governor, and shaders without undefined steps", ()=>{
  // each scene spans two screens with a pinned frame and three resting frames; no CSS snapping (it fought slow scrolling)
  const intro=page.slice(page.indexOf('<section class="intro"'), page.indexOf('<div class="wrap">'));
  assert.equal((intro.match(/<div class="scene-pin">/g)||[]).length, 7);
  assert.equal((intro.match(/<span class="snap" aria-hidden="true"><\/span>/g)||[]).length, 21);
  assert.match(page, /\.scene\{position:relative;height:200vh;height:200svh;overflow:clip\}/);
  assert.ok(!/scroll-snap-type/.test(page), "no CSS scroll snapping");
  // the cold open: first direct visits only, never under reduced motion, ending after 4.2 s or at a real scroll
  const head=page.slice(0, page.indexOf("</head>"));
  assert.match(head, /if\(!still\)\{ d\.classList\.add\("hero-anim"\); d\.classList\.add\("cold"\);/);
  assert.match(head, /setTimeout\(end, 4200\)/); assert.match(head, /if\(scrollY>8\)\{ end\(\);/);
  // the grain and vignette are decorative
  assert.match(page, /<div class="film" aria-hidden="true"><\/div>/);
  assert.match(page, /@media \(prefers-reduced-motion: reduce\)\{ \.film::after,\.scroll-cue::after\{animation:none\} \}/);
  // tiers: the full passes need a capable desktop with a GPU; a governor drops them if frames run slow; pixel ratio ≤ 1.5
  assert.match(stage, /swiftshader\|llvmpipe\|software/);
  assert.match(stage, /if\(avg>45\)\{ post=false;/);
  assert.match(stage, /renderer\.setPixelRatio\(Math\.min\(devicePixelRatio, 1\.5\)\)/);
  assert.match(stage, /document\.addEventListener\("visibilitychange"/);
  assert.match(stage, /const restOf=Pv=>/, "reduced motion holds a resting frame");
  // GLSL leaves smoothstep(a, b, x) undefined when a ≥ b (it gave NaN on some GPUs): none in the shaders
  [...stage.matchAll(/smoothstep\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,/g)].forEach(m=> assert.ok(parseFloat(m[1])<parseFloat(m[2]), m[0]));
  // the sequence's numbers still come from the engine (the scenes' builders), and Three.js stays pinned in one place
  assert.match(stage, /sc\.c2one=sample\(S\(\{\}\), sc\.T2, 320\)/);
  assert.ok((stage.match(/import\("three"\)/g)||[]).length===1);
});
