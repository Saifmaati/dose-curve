// Run with: node --test
// What changed, explained (pk-explain.js, moved out of the page in 2.5): the sentences for every lesson's pair and for
// single changes to every library drug, in the simulator and in Compare. They must come out for each, in descriptive
// words, and quote the model's own numbers; the README's example sentence is checked word for word.
const test=require("node:test");
const assert=require("node:assert/strict");
const PK=require("../pk-engine.js");

const N=o=> PK.normalizeScenario(PK.scenario(o));
const fmt=(v,dp)=> v==null ? "—" : v.toLocaleString("en-US",{minimumFractionDigits:dp,maximumFractionDigits:dp});
const H=(a, mode, view)=>{
  const state=Object.assign({duration:48, mec:2, mtc:12, pd:0, etgt:50, mic:0, unit:a.unit}, view);
  const U=()=> PK.unitsOf({unit:a.unit});
  return {fmt, trim:v=> (v%1===0) ? v.toString() : v.toFixed(2).replace(/0+$/,"").replace(/\.$/,""), cap:s=> s.charAt(0).toUpperCase()+s.slice(1),
    U, cdp:dp=> dp+U().cdp, inShown:p=> !p || p.unit===a.unit ? p : PK.convertUnits(p, a.unit), moved:(x,y)=> Math.abs(y-x)/Math.max(Math.abs(x),1e-12)>0.005,
    ROUTE_NAME:{oral:"oral",iv:"IV bolus",inf:"IV infusion",mixed:"mixed-route"},
    IDR_NAME:["Direct (Emax model)","Inhibits production","Inhibits loss","Stimulates production","Stimulates loss"],
    WTM_NAME:{actual:"actual weight", ibw:"ideal body weight", adj:"adjusted body weight"}, mode, state};
};
function explain(a, b, mode="sim", view={}){
  const h=H(a, mode, view), s=h.state;
  const C=PK.compareRows(h.inShown(a), h.inShown(b), s.duration, s.mec, s.mtc, s.pd ? s.etgt : null, s.mic);
  const diffs=PK.PK_KEYS.filter(k=> PK.isRelevant(k,a) && PK.isRelevant(k,b) && (k==="missed" ? PK.missedOf(a)!==PK.missedOf(b) : !PK.sameSetting(k,a,b)));
  return PK.explain.explain(a, b, C.da, C.db, C.wa, C.wb, diffs, mode==="cmp" ? "A" : "the baseline", h);
}
const words=/\b(safe|unsafe|best|recommended?)\b/i;

test("the README's example: CrCl 73 → 41 mL/min for a 90% renal drug, word for word", ()=>{
  const L=PK.LESSONS.find(l=>l.id==="crcl");
  const out=explain(N(L.base), N(L.cur), "sim", L.view);
  assert.ok(out[0].startsWith("CrCl fell from 73 to 41 mL/min (SCr 1 → 1.8 mg/dL), so the clearance of a drug that is 90% renally excreted fell <b>38%</b>; the half-life rose from 3.9 h to 6.2 h; the steady-state trough rose from 2.2 to 4.7 mg/L."), out[0]);
});

test("every lesson's pair is explained, in descriptive words, in the simulator and in Compare", ()=>{
  ["sim","cmp"].forEach(mode=> PK.LESSONS.forEach(L=>{
    const out=explain(N(L.base), N(L.cur), mode, L.view||{});
    assert.ok(Array.isArray(out) && out.length>0, `${L.id} ${mode}`);
    out.forEach(s=>{ assert.equal(typeof s, "string"); assert.ok(!words.test(s.replace(/<[^>]+>/g," ")), `${L.id}: ${s}`); assert.ok(!/NaN|undefined/.test(s), `${L.id}: ${s}`); });
  }));
});

test("one setting changed on every library drug: each is explained without error or empty numbers", ()=>{
  const changes=[{D:2}, {tau:2}, {thalf:1.5}, {V:1.3}, {route:"iv"}, {dosing:"single"}, {loadMult:2, dosing:"repeated"}, {missed:2, nDoses:6, dosing:"repeated"},
    {cmt:2, k12:0.5, k21:0.3}, {pm:"clinical", scr:2}, {hd:1}, {teq:2}, {idr:1, tout:6, imax:0.8}, {hep:1}, {fu:0.5}, {wt:110}, {tinf:3, route:"inf"}];
  let n=0;
  PK.DRUGS.forEach(d=>{
    const base=N(PK.drugScenario(d));
    changes.forEach(c=>{
      const o=Object.assign({}, base); Object.entries(c).forEach(([k,v])=> o[k]=["D","tau","thalf","V"].includes(k) ? (base[k]||12)*v : v);
      const out=explain(base, N(o), "sim", {pd:c.teq||c.idr ? 1 : 0, mic:c.fu ? 1 : 0});
      assert.ok(out.length>0, `${d.id} ${JSON.stringify(c)}`);
      out.forEach(s=> assert.ok(!/NaN|undefined|Infinity/.test(s) && !words.test(s.replace(/<[^>]+>/g," ")), `${d.id} ${JSON.stringify(c)}: ${s}`));
      n++;
    });
  });
  assert.equal(n, PK.DRUGS.length*17);
});

test("no change, no explanation of one", ()=>{
  const a=N({});
  const out=explain(a, N({}));
  assert.ok(out.length>=1 && /change any setting|nothing|same/i.test(out.join(" ")), out.join(" | "));
});
