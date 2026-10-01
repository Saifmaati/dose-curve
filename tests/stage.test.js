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
  assert.equal(scenes.length, 9);
  scenes.forEach((s,i)=>{
    assert.equal((s.match(/<h[12] /g)||[]).length, 1, `scene ${i+1}: one heading`);
    const cap=(s.match(/<p class="cap">([^<]+)<\/p>/)||[])[1], words=cap.trim().split(/\s+/).length;
    assert.ok(words>=3 && words<=5, `scene ${i+1}: "${cap}" is ${words} words`);
  });
  assert.ok(/Educational model, not for clinical dosing/.test(scenes[0]) && /Educational model, not for clinical dosing/.test(scenes[8]), "the disclaimer opens and closes it");
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
  assert.equal((intro.match(/<div class="scene-pin">/g)||[]).length, 9);   // nine since 2.11: 18 screens
  assert.equal((intro.match(/<span class="snap" aria-hidden="true"><\/span>/g)||[]).length, 27);
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

test("2.11: the objects in the scenes state the engine's numbers, and every motion they make is the engine's", ()=>{
  const intro=page.slice(page.indexOf('<section class="intro"'), page.indexOf('<div class="wrap">')), S=o=> PK.normalizeScenario(PK.scenario(o)), f1=v=> v.toFixed(1);
  // Learn: 200 vials, each a virtual patient's level at 4 hours (the cloud's own patients), sorted to the median and the band
  const p=S({}), w=cv=> Math.sqrt(Math.log(1+cv*cv)), wCL=w(.3), wV=w(.2), z=(rand=>{ let sp=null; return ()=>{ if(sp!==null){ const t=sp; sp=null; return t; } let u=0; while(u<=1e-300) u=rand(); const v=rand(), r=Math.sqrt(-2*Math.log(u)); sp=r*Math.sin(2*Math.PI*v); return r*Math.cos(2*Math.PI*v); }; })(PK.seededRandom(1));
  const lv=[]; for(let i=0;i<200;i++){ const eCL=wCL*z(), eV=wV*z(); lv.push(PK.conc(Object.assign({}, p, {V:p.V*Math.exp(eV), thalf:p.thalf*Math.exp(eV-eCL)}), 4)); }
  const v=lv.slice().sort((a,b)=>a-b);
  assert.ok(intro.includes(`the median, ${f1((v[99]+v[100])/2)} mg/L, and the middle 90% runs from ${f1(v[10])} to ${f1(v[189])} mg/L`), "the vials' median and band");
  assert.match(stage, /sc\.lv=sc\.popP\.map\(q=> PK\.conc\(q, tv\)\)/);
  // Exposure: piperacillin 3 g every 6 hours, MIC 16 mg/L, 70% unbound; the counters end on micStats' own fT>MIC
  const base={route:"inf", dosing:"repeated", D:3000, thalf:0.84, V:15.1, tau:6, nDoses:8, fu:0.7};
  const [a,b]=[0.5,3].map(tinf=> PK.micStats(S(Object.assign({}, base, {tinf})), 16, 24).ft);
  assert.ok(intro.includes(`above the MIC for ${Math.round(a)}% of the time as a 30-minute infusion and ${Math.round(b)}% as a 3-hour infusion`));
  assert.ok(intro.includes(`<span id="ftA">${Math.round(a)}</span>`) && intro.includes(`<span id="ftB">${Math.round(b)}</span>`), "the counters show the final values without the stage");
  const lib=PK.DRUGS.find(d=>d.id==="pip"); assert.equal(lib.fu, base.fu); assert.equal(lib.s.mic, 16); assert.equal(lib.s.D, base.D); assert.equal(lib.s.tau, base.tau);
  assert.match(intro, /a visual cue, not a model of bacterial killing/);
  // Rebound: the rebound lesson's patient through one session (pk-hd.js): the fall, the rebound and the amount removed
  const q=S({route:"iv", dosing:"single", D:1000, V:20, thalf:6, cmt:2, k12:0.8, k21:0.4, hd:1, hdcl:8, hdstart:6, hddur:4, hdevery:48}), r=PK.hd.sessionTable(q, 24)[0];
  assert.ok(intro.includes(`falls ${Math.round(100*r.fall)}%`) && intro.includes(`to ${f1(r.rebound.level)} mg/L within ${f1(r.rebound.after)} hours`) && intro.includes(`${Math.round(100*r.rebound.share)}% of the fall`));
  assert.ok(intro.includes(`<span id="hdRm">${Math.round(PK.hd.stateAt(q, 24).removed)}</span>`));
  assert.ok(read("pk-engine.js").includes('cur:{route:"iv",dosing:"single",D:1000,V:20,thalf:6,cmt:2,k12:0.8,k21:0.4,hd:1,hdcl:8,hdstart:6,hddur:4,hdevery:48}'));
  // the motion: a capsule's amount e^(−ka·t), particles leaving at −ln(1 − F)/ka, the figure's level C(t), the chambers'
  // A₁ and A₂ with k₁₂·A₁ and k₂₁·A₂, the dishes by the share of time above the MIC, the dialyzer at CLd·C(t)
  assert.match(stage, /userData\.set\(still \? 0 : Math\.exp\(-sc\.p1\.ka\*tH\)\)/);
  assert.match(stage, /t=-Math\.log\(1-F\)\/ka/);
  assert.match(stage, /on\("s2","fig"\)\.userData\.set\(lvl\(sc\.c1, sc\.T1, t\), Math\.exp\(-sc\.p1\.ka\*t\)\)/);
  assert.match(stage, /a2:p\.D\*p\.k12\*\(Math\.exp\(-b\*t\)-Math\.exp\(-a\*t\)\)\/\(a-b\)/);
  assert.match(stage, /p\.k12\*A\.a1\/mx, p\.k21\*A\.a2\/mx/);
  assert.match(stage, /dishA"\)\.userData\.glow\(1-fa\)/);
  assert.match(stage, /ta>=r\.start && ta<=r\.end \? lvl\(sc\.c7, sc\.T7, ta\)\/r\.pre : 0/);
  // the two-compartment amounts are the engine's (pk-hd.js carries the same state)
  const p4=S({route:"iv", cmt:2, D:500, V:20, thalf:3, k12:0.9, k21:0.35}), d4=PK.derived(p4), q4=S(Object.assign({}, p4, {hd:1, hdstart:300, hdcl:1, hddur:1, hdevery:168}));
  [0.5,2,6].forEach(t=>{ const s4=PK.hd.stateAt(q4,t), A2=500*0.9*(Math.exp(-d4.beta*t)-Math.exp(-d4.alpha*t))/(d4.alpha-d4.beta);
    assert.ok(Math.abs(s4.q-A2)<1e-6*500 && Math.abs(s4.a-PK.conc(p4,t)*20)<1e-6*500, `t=${t}`); });
  // procedural objects, no model files; the dialysis module stamped by its hash; phones get the figure and vials too
  assert.ok(!/GLTFLoader|\.glb\b/.test(stage), "no model files");
  assert.ok(stage.includes(`const HD_SRC="pk-hd.js?v=${hash("pk-hd.js")}"`));
  assert.match(page, /html\.stage3d \.scene:not\(\[data-scene="1"\]\):not\(\[data-scene="2"\]\):not\(\[data-scene="4"\]\) \.scene-vis\{visibility:visible\}/);
  assert.match(stage, /canvas\.style\.opacity=phoneQ\.matches \? \(\[0,1,3\]\.includes\(Math\.floor\(w\.g\)\)/);
  // reduced motion: each object shows its final state
  ["t=still ? sc.tmax1", "tA=still ? sc.T6", "const t=still ? span"].forEach(k=> assert.ok(stage.includes(k), k));
});
