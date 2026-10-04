// Run with: node --test
// Instructor tools (cases.js): community cases written as specs and packed into links, the solvability check,
// assignments (bundles), and completion codes (HMAC-SHA256 with Node's WebCrypto, as in the browser).
const test=require("node:test");
const assert=require("node:assert/strict");
const PK=require("../pk-engine.js");
const C=require("../cases.js");

const SPEC={title:"Gentamicin in an older woman", drug:"gent", patient:{age:70, sex:"F", ht:160, wt:60, scr:1.5},
  over:{thalf:3, V:20}, setting:"Pyelonephritis; 30-minute infusions.", task:"Choose a dose and interval that meet the target.",
  also:"Hearing, balance and kidney function.", refs:["A textbook chapter", "Local guideline"],
  target:{kind:"pt", peak:[5,10], troughMax:1}, choices:{taus:[8,12,24,36], step:10, min:40, max:400, tinf:0.5}, start:{D:80, tau:8}};

test("a spec is checked: every field kept, text trimmed and limited, bad values named", ()=>{
  const g=C.checkSpec(SPEC);
  assert.ok(g.spec, g.errors && g.errors.join("; "));
  ["title","drug","setting","task","also"].forEach(k=> assert.equal(g.spec[k], SPEC[k], k));
  assert.deepEqual(g.spec.patient, SPEC.patient); assert.deepEqual(g.spec.over, SPEC.over); assert.deepEqual(g.spec.refs, SPEC.refs);
  assert.deepEqual(g.spec.target, SPEC.target); assert.deepEqual(g.spec.choices, SPEC.choices); assert.deepEqual(g.spec.start, SPEC.start);
  assert.equal(g.spec.v, C.COMMUNITY_VERSION);
  const long=C.checkSpec(Object.assign({}, SPEC, {title:"x".repeat(500), task:" a\u0000b\u0007c ", refs:Array(9).fill("r")}));
  assert.equal(long.spec.title.length, C.TEXT_LIMITS.title); assert.equal(long.spec.task, "a b c"); assert.equal(long.spec.refs.length, C.TEXT_LIMITS.refs);
  const bad=C.checkSpec(Object.assign({}, SPEC, {drug:"phe", patient:{age:5, sex:"F", ht:160, wt:60, scr:1.5}, target:{kind:"pt", peak:[10,5]}, choices:{taus:[7], step:10, min:40, max:400, tinf:0.5}}));
  assert.ok(!bad.spec);
  ["a first-order drug from the library", "an age of 18–100 years", "a peak range", "at least one dosing interval"].forEach(e=> assert.ok(bad.errors.includes(e), e));
  assert.ok(!C.checkSpec(Object.assign({}, SPEC, {over:{F:0.5}})).spec, "F only for an oral drug");
  assert.ok(!C.checkSpec(Object.assign({}, SPEC, {title:"  "})).spec, "a title");
  assert.ok(!C.checkSpec(null).spec);
});

test("community links round-trip every field, compressed or plain; a proposed regimen travels too", async()=>{
  const spec=C.checkSpec(SPEC).spec;
  for(const plain of [false, true]){
    const h=await C.encodeCommunityLink(spec, {D:110, tau:36}, plain);
    assert.match(h, plain ? /^case=c1\.j\./ : /^case=c1\.z\./);
    const back=await C.decodeAnyCaseLink("#"+h);
    assert.equal(back.id, "community"); assert.deepEqual(back.case.spec, spec); assert.deepEqual(back.reg, {D:110, tau:36});
    assert.equal(back.case.community, true); assert.match(back.case.tag, /unreviewed/);
  }
  const z=await C.encodeCommunityLink(spec), j=await C.encodeCommunityLink(spec, null, true);
  assert.ok(z.length<j.length, "compression shortens the link");
  // an interval the case doesn't offer is dropped
  assert.equal((await C.decodeAnyCaseLink("#"+z+"&d=100&t=6")).reg, null);
});

test("older case links open exactly as before", async()=>{
  for(const c of C.CASES){
    for(const h of ["#case="+c.id, "#"+C.encodeCaseLink(c.id, C.reference(c))]){
      assert.deepEqual(await C.decodeAnyCaseLink(h), C.decodeCaseLink(h), h);
    }
  }
  assert.equal(await C.decodeAnyCaseLink("#case=nope"), null);
  assert.equal(await C.decodeAnyCaseLink("#case=c2.z.AAAA"), null, "an unknown community version");
  assert.equal(await C.decodeAnyCaseLink("#case=c1.z.!!!"), null);
  assert.equal(await C.decodeAnyCaseLink("#case=c1.j."+"A".repeat(20000)), null, "oversized");
});

test("the solvability check: exact against grading every regimen on the grid, and unsolvable cases are refused", async()=>{
  const c=C.communityCase(C.checkSpec(SPEC).spec), sol=C.solveCase(c);
  let brute=0; c.choices.taus.forEach(tau=>{ for(let D=40; D<=400+1e-9; D+=10) if(C.gradeCase(c, {D, tau}).ok) brute++; });
  assert.equal(sol.count, brute); assert.equal(sol.total, 37*4); assert.ok(sol.solvable && sol.best.grade.ok);
  // the author's values are the model's: a shorter half-life than the library's
  assert.equal(PK.derived(C.caseScenario(c, c.start)).ke.toFixed(6), (Math.LN2/3*PK.clFactor(C.caseScenario(c, c.start))).toFixed(6));
  // an AUC target on an oral drug with tablets: the grid is the doses the tablets make
  const lev=C.communityCase(C.checkSpec({title:"Levetiracetam", drug:"lev", patient:{age:50, sex:"M", ht:175, wt:80, scr:1.0}, task:"Choose.",
    target:{kind:"auc", auc:[400,600]}, choices:{taus:[12], step:250, min:250, max:3000}, start:{D:500, tau:12}}).spec);
  const ls=C.solveCase(lev); let lb=0; C.achievable(lev).filter(D=>D>=250 && D<=3000).forEach(D=>{ if(C.gradeCase(lev, {D, tau:12}).ok) lb++; });
  assert.equal(ls.count, lb);
  // a target nothing on the grid meets: the case is refused, as a link too
  const bad=C.checkSpec(Object.assign({}, SPEC, {target:{kind:"pt", peak:[30,31], troughMax:0.1}})).spec;
  assert.ok(bad); assert.equal(C.solveCase(C.communityCase(bad)).solvable, false);
  assert.equal(await C.decodeAnyCaseLink("#"+await C.encodeCommunityLink(bad)), null);
});

test("assignments: checked, round-trip, and rebuild the same worksheets", async()=>{
  const spec=C.checkSpec(SPEC).spec, b={title:"Week 3", items:[{kind:"case", id:"gent"}, {kind:"case", spec}, {kind:"ws", topic:"single", count:5, seed:42, v:PK.WS_VERSION}]};
  const h=await C.encodeBundleLink(b), back=await C.decodeBundleLink("#"+h);
  assert.match(h, /^bundle=b1\.z\./);
  assert.equal(back.title, "Week 3"); assert.equal(back.items.length, 3); assert.deepEqual(back.items[1].spec, spec);
  const ws=back.items[2], a=PK.makeWorksheet({topic:ws.topic, count:ws.count, seed:ws.seed, v:ws.v}), direct=PK.makeWorksheet(PK.decodeTaskLink(`ws=single.5.42.${PK.WS_VERSION}`));
  assert.deepEqual(a.problems.map(p=>p.id+":"+p.seed), direct.problems.map(p=>p.id+":"+p.seed));
  assert.equal(await C.encodeBundleLink({title:"x", items:[]}), null);
  assert.equal(C.checkBundle({items:[{kind:"case", id:"nope"}]}), null, "an unknown case");
  assert.equal(C.checkBundle({items:[{kind:"ws", topic:"x", count:5, seed:1}]}), null, "an unknown topic");
  assert.equal(C.checkBundle({items:Array(20).fill({kind:"case", id:"gent"})}).items.length, C.BUNDLE_MAX);
  assert.equal(await C.decodeBundleLink("#bundle=b9.z.AAAA"), null);
});

test("completion codes: the same inputs give the same code, and a changed payload, code or key fails", async()=>{
  const payload=C.completionPayload({bundle:"58eb2e7a5e9a", identifier:"S-17", items:["gent","ws:single.5.42.5(3/5)"], score:4, total:7, date:"2026-09-30"});
  assert.equal(payload.split("\n")[0], "MaatiRx completion v1");
  const code=await C.completionCode("pk-class-2026", payload);
  assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(await C.completionCode("pk-class-2026", payload), code, "deterministic");
  assert.equal(await C.verifyCode("pk-class-2026", payload, code), true);
  assert.equal(await C.verifyCode("pk-class-2026", payload.replace(/\n/g,"\r\n")+"\n", code.toLowerCase().replace(/-/g," ")), true, "line endings, case and spacing don't matter");
  assert.equal(await C.verifyCode("pk-class-2026", payload.replace("score 4/7","score 7/7"), code), false, "a changed score");
  assert.equal(await C.verifyCode("pk-class-2026", payload.replace("S-17","S-18"), code), false, "a changed identifier");
  assert.equal(await C.verifyCode("another-key", payload, code), false, "another key");
  assert.equal(await C.verifyCode("pk-class-2026", payload, code.slice(0,-1)+(code.endsWith("A") ? "B" : "A")), false, "a changed code");
  // it is an HMAC-SHA256: the code is the first 80 bits of the signature in the 32-letter alphabet
  const crypto=require("node:crypto"), sig=crypto.createHmac("sha256", "pk-class-2026").update(payload).digest();
  const B32="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let bits=0, val=0, out="";
  for(const b of sig){ val=(val<<8)|b; bits+=8; while(bits>=5 && out.length<16){ out+=B32[(val>>>(bits-5))&31]; bits-=5; } }
  assert.equal(code.replace(/-/g,""), out);
  // identifiers: letters, digits, - and _, no spaces (a name isn't asked for)
  ["S-17","ab_9"].forEach(x=> assert.ok(C.IDENT.test(x))); ["Jane Doe","", "x".repeat(25)].forEach(x=> assert.ok(!C.IDENT.test(x), x));
});

test("an fT>MIC target (the author's MIC and least share of each interval): checked, graded on the unbound level, and solved exactly", async()=>{
  const mk=(drug, choices, ft, mic)=> C.checkSpec({title:"An antibiotic", drug, patient:{age:60, sex:"M", ht:178, wt:80, scr:1.0}, task:"Choose.",
    target:{kind:"ftmic", mic, ft}, choices, start:{D:choices.min, tau:choices.taus[0]}});
  const g=mk("pip", {taus:[6,8,12], step:250, min:1000, max:4000, tinf:0.5}, 50, 16);
  assert.ok(g.spec, g.errors && g.errors.join("; ")); assert.deepEqual(g.spec.target, {kind:"ftmic", mic:16, ft:50});
  ["ft", "mic"].forEach(k=> assert.ok(!C.checkSpec(Object.assign({}, g.spec, {target:Object.assign({}, g.spec.target, {[k]:0})})).spec, `a ${k} of 0`));
  assert.ok(!C.checkSpec(Object.assign({}, g.spec, {target:{kind:"ftmic", mic:16, ft:101}})).spec, "over 100%");
  // graded on the unbound level, with the library's fu, exactly as the simulator's panel reads it
  const c=C.communityCase(g.spec), r=C.gradeCase(c, {D:3000, tau:6}), p=C.caseScenario(c, {D:3000, tau:6});
  assert.equal(p.fu, 0.7); assert.equal(r.metrics.aboveMic, PK.micStats(p, 16, 24).ft); assert.equal(r.ok, r.metrics.aboveMic>=50);
  assert.equal(C.gradeCase(c, {D:2000, tau:12}).hint, "ftLow");
  assert.deepEqual(C.caseWindow(c), {mec:16, mtc:250, mic:16}, "the simulator opens with the MIC");
  // the bisection over the dose grid counts exactly what grading every regimen counts
  for(const [drug, choices, ft, mic] of [["pip", {taus:[6,8,12], step:250, min:1000, max:4000, tinf:0.5}, 50, 16], ["mero", {taus:[6,8,12], step:250, min:250, max:2000, tinf:3}, 60, 4],
    ["amox", {taus:[6,8,12], step:250, min:250, max:3000}, 40, 2], ["vanc", {taus:[8,12,24], step:250, min:500, max:2500, tinf:1}, 90, 10]]){
    const cc=C.communityCase(mk(drug, choices, ft, mic).spec), sol=C.solveCase(cc), list=C.achievable(cc);
    const doses=list ? list.filter(D=>D>=choices.min && D<=choices.max) : Array.from({length:Math.floor((choices.max-choices.min)/choices.step)+1}, (_,i)=>choices.min+i*choices.step);
    let brute=0; choices.taus.forEach(tau=> doses.forEach(D=>{ if(C.gradeCase(cc, {D, tau}).ok) brute++; }));
    assert.equal(sol.count, brute, drug); assert.ok(sol.solvable && sol.best.grade.ok, drug);
  }
  // it travels in a community link like any other target
  const back=await C.decodeAnyCaseLink("#"+await C.encodeCommunityLink(g.spec));
  assert.deepEqual(back.case.spec.target, g.spec.target);
});
