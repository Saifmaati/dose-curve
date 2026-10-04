// Run with: node --test
// The educator landing page (educators.html, built by a script from the engine): its counts are the app's, every
// lesson link is the share link the app itself makes and opens that lesson, and every case link opens a case.
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const PK=require("../pk-engine.js");
const C=require("../cases.js");
const page=fs.readFileSync(path.join(__dirname,"..","educators.html"),"utf8");
const S=o=> PK.normalizeScenario(PK.scenario(o));
const unesc=s=> s.replace(/&quot;/g,'"').replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&");

test("the page states the app's own numbers, and the disclaimer", ()=>{
  const REF=require("../validation/reference-results.json");
  const n=4*REF.scenarios.length+2*REF.map.scenarios.length+3*REF.pkpd.scenarios.length+3*REF.idr.scenarios.length+2*REF.hd.scenarios.length;
  [[PK.LESSONS.length,"guided lessons"],[C.CASES.length,"clinical cases graded"],[PK.PRACTICE.length,"kinds of generated practice"],[n,"comparisons with an independent solver"]].forEach(([v,w])=>
    assert.ok(new RegExp(`<b>${v}</b><span>${w}`).test(page), `${v} ${w}`));
  assert.match(page, /Educational model, not for clinical dosing\./);
  assert.match(page, /<html lang="en">/); assert.match(page, /name="viewport"/);
  assert.ok(!/\b(safe|unsafe|best|recommended?)\b/i.test(page.replace(/<[^>]+>/g," ")), "descriptive wording");
  const version=(fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8").match(/"softwareVersion":"([\d.]+)"/)||[])[1];
  assert.ok(page.includes(`MaatiRX ${version},`), "the page's version is the app's");
});

test("every lesson is linked with the share link the app makes for it, and that link opens the lesson", ()=>{
  const links=[...page.matchAll(/href="\.\/#([^"]+)" data-lesson="([^"]+)"/g)].map(m=>({hash:unesc(m[1]), id:m[2]}));
  assert.deepEqual(links.map(l=>l.id).sort(), PK.LESSONS.map(L=>L.id).sort());
  links.forEach(({hash, id})=>{
    const L=PK.LESSONS.find(x=>x.id===id), want=PK.encodeLink({mode:"sim", s:S(L.cur), base:S(L.base), baseLabel:L.baseLabel, lesson:L.id, view:Object.assign({}, PK.VIEW_DEFAULTS, L.view)});
    assert.equal(hash, want, `${id}: rebuild the page (scratchpad edu.js) when a lesson changes`);
    const st=PK.decodeLink("#"+hash);
    assert.equal(st.lesson, id); assert.equal(st.newer, false);
    assert.equal(PK.encodeScenario(st.s), PK.encodeScenario(S(L.cur)));
  });
});

test("every case is linked, and each link opens its case", async()=>{
  const ids=[...page.matchAll(/href="\.\/#case=([^"]+)" data-case="([^"]+)"/g)].map(m=>{ assert.equal(m[1], m[2]); return m[1]; });
  assert.deepEqual(ids.sort(), C.CASES.map(c=>c.id).sort());
  for(const id of ids) assert.equal((await C.decodeAnyCaseLink("#case="+id)).id, id);
  assert.match(page, /href="\.\/#practice"/); assert.match(page, /href="validation\.html"/); assert.match(page, /teaching-guide\.md/);
});

test("the app opens a tab from a named link, links to this page, and keeps it offline", ()=>{
  const app=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8"), sw=fs.readFileSync(path.join(__dirname,"..","sw.js"),"utf8");
  assert.match(app, /\^#\(practice\|lessons\|cases\|compare\)\$/);
  assert.match(app, /<a href="educators\.html">For educators<\/a>/);
  assert.ok(sw.includes('"./educators.html"'));
});
