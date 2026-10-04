// Run with: node --test
// Checks the move of saved work from the old address to maatirx.com (ui-move.js, 2.20): what is carried, where it
// goes, the link it travels in, what is left behind, and how it is taken in without replacing anything already saved
// at the new address.
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const PK=require("../pk-engine.js");
const M=require("../ui-move.js");
const {scenario}=PK;

const item=(name, s)=> PK.libraryItem(name, {mode:"sim", s:scenario(s), base:null, baseLabel:"", lesson:"", view:Object.assign({}, PK.VIEW_DEFAULTS)}, "2026-09-01T12:00:00.000Z");
const lib=(...items)=> JSON.stringify({format:PK.LIBRARY_FORMAT, version:PK.LIBRARY_VERSION, items});
const names=v=> PK.parseLibrary(v).library.items.map(i=>i.name);
const store=o=>({length:Object.keys(o).length, key:i=> Object.keys(o)[i], getItem:k=> k in o ? o[k] : null});
const prog=f=>{ const p=PK.emptyProgress(); f(p); return JSON.stringify(p); };
const AK="maatirx-assignment-abcdefghijklmnopqrstuvwx";
// as the app writes them: a case item done, a worksheet item's answers by problem
const ASSIGNMENT={0:{ok:true}, 1:{answers:{0:{v:12.5, ok:true}, 1:{v:3, ok:false}}}};
const DRAFT={title:"My case", drug:"gent", patient:{age:70, sex:"F", ht:160, wt:60, scr:1.5}, refs:["A ref"], target:{kind:"pt", peak:[5,10], troughMax:1}, choices:{taus:[8,12], min:40, max:400, step:10}, start:{D:80, tau:8}};
const OLD_WORK={
  "maatirx.library":lib(item("Vanc q12", {dosing:"repeated", tau:12}), item("Slow absorber", {ka:0.3})),
  "maatirx.progress":prog(p=>{ p.lessons.route={predicted:true}; p.practice.single={tried:5, right:4}; p.tasks.fit=2; }),
  [AK]:JSON.stringify(ASSIGNMENT),
  "maatirx-author-draft":JSON.stringify(DRAFT),
  "maatirx.theme":"light", "maatirx.effects":"off", "maatirx.debug":"1", "someone-else":"x"
};

test("everything the app saves is carried, and nothing else (not another site's data, not the debug switch)", ()=>{
  const c=M.collect(store(OLD_WORK));
  assert.deepEqual(Object.keys(c).sort(), [AK,"maatirx-author-draft","maatirx.effects","maatirx.library","maatirx.progress","maatirx.theme"]);
  assert.equal(M.summary(c, PK), "2 saved scenarios, your lesson and practice progress, 1 assignment's progress and a case you were writing");
  assert.equal(M.summary({"maatirx.theme":"light"}, PK), "", "settings alone aren't work to ask about");
});

test("the work goes to the app page at maatirx.com, which takes it in; 'Not now' goes to the same page there", ()=>{
  const loc=(p, s="", h="")=>({protocol:"https:", pathname:p, search:s, hash:h});
  assert.equal(M.target(loc("/project/")), "https://maatirx.com/");
  assert.equal(M.target(loc("/project")), "https://maatirx.com/");
  assert.equal(M.target(loc("/project/validation.html", "?embed")), "https://maatirx.com/validation.html?embed");
  assert.deepEqual(M.home(loc("/project/", "?theme=light", "#l=route")), {url:"https://maatirx.com/?theme=light", hash:"#l=route"});
  assert.deepEqual(M.home(loc("/project/index.html", "", "#app")), {url:"https://maatirx.com/", hash:"#app"});
  for(const p of ["/project/educators.html", "/project/validation.html", "/project/methods.html", "/project/nope"])
    assert.deepEqual(M.home(loc(p, "?x=1", "#a")), {url:"https://maatirx.com/", hash:""}, p+": another page's link isn't the app's");
});

test("the link: the work in its # part, the link's own # part after it", ()=>{
  const data=M.collect(store(OLD_WORK)), hash="#v=15&s=D:500,tau:12", h=M.encode(data, hash);
  assert.ok(h.startsWith("#move=") && h.endsWith(hash));
  // as the page's head script splits it: up to the second #, then the link's own
  const i=h.indexOf("#",1);
  assert.equal(h.slice(i), hash);
  assert.deepEqual(M.decode(h.slice(6,i)), data, "round trip");
  assert.equal(M.encode(data, "").indexOf("#",1), -1, "no # part of its own: nothing after the work");
  assert.ok(!/#/.test(encodeURIComponent(JSON.stringify(data))), "the work itself never holds a #");
});

test("a # part that isn't the app's work is ignored: another key, a value that isn't text, or not JSON", ()=>{
  assert.equal(M.decode(encodeURIComponent(JSON.stringify({"evil":"x", "maatirx.theme":{a:1}}))), null);
  assert.deepEqual(M.decode(encodeURIComponent(JSON.stringify({"evil":"x", "maatirx.theme":"dark"}))), {"maatirx.theme":"dark"});
  assert.equal(M.decode("%E0%A4%A"), null);
  assert.equal(M.decode("not json"), null);
  assert.equal(M.decode(null), null);
});

test("at a new address with nothing saved, everything comes across, and the note says what", ()=>{
  const data=M.collect(store(OLD_WORK)), rep={}, w=M.merge({}, data, PK, rep);
  assert.deepEqual(Object.keys(w).sort(), Object.keys(data).sort());
  assert.deepEqual(names(w["maatirx.library"]), ["Vanc q12","Slow absorber"]);
  assert.equal(w["maatirx.progress"], data["maatirx.progress"]);
  assert.deepEqual(JSON.parse(w[AK]), ASSIGNMENT);
  assert.deepEqual(JSON.parse(w["maatirx-author-draft"]), DRAFT);
  assert.equal(w["maatirx.theme"], "light");
  assert.equal(M.report(rep, PK), "Brought from the old address: 2 saved scenarios, your lesson and practice progress, 1 assignment's progress and a case you were writing. Nothing saved here was replaced.");
});

test("nothing saved at the new address is replaced; scenarios and progress are added; doing it twice writes nothing", ()=>{
  const data=M.collect(store(OLD_WORK));
  const have={
    "maatirx.library":lib(item("Vanc q12", {dosing:"repeated", tau:12}), item("New here", {D:250})),
    "maatirx.progress":prog(p=>{ p.lessons.route={challenge:true}; p.lessons.cl={predicted:true}; p.practice.single={tried:2, right:2}; p.tasks.window=1; }),
    [AK]:JSON.stringify({1:{answers:{1:{v:4, ok:true}, 2:{v:9, ok:true}}}, 2:{ok:true}}),
    "maatirx-author-draft":JSON.stringify({title:"Another case"}),
    "maatirx.theme":"dark"
  };
  const rep={}, w=M.merge(have, data, PK, rep);
  assert.deepEqual(Object.keys(w).sort(), [AK,"maatirx.effects","maatirx.library","maatirx.progress"],
    "the draft and the theme saved here stay as they are");
  assert.deepEqual(names(w["maatirx.library"]), ["Vanc q12","New here","Slow absorber"], "the scenario already here isn't added twice");
  const P=PK.parseProgress(w["maatirx.progress"]);
  assert.deepEqual(P.lessons.route, {predicted:true, challenge:true});
  assert.deepEqual(P.lessons.cl, {predicted:true});
  assert.deepEqual(P.practice.single, {tried:5, right:4});
  assert.deepEqual(P.tasks, {fit:2, window:1});
  const A=JSON.parse(w[AK]);
  assert.equal(A[0].ok, true); assert.equal(A[2].ok, true);
  assert.deepEqual(A[1].answers, {0:{v:12.5, ok:true}, 1:{v:4, ok:true}, 2:{v:9, ok:true}}, "an answer right at either address is right");
  assert.equal(M.report(rep, PK), "Brought from the old address: 1 saved scenario, your lesson and practice progress and 1 assignment's progress. Nothing saved here was replaced. You were writing a case at both addresses; the one here was kept.");
  const again={}, w2=M.merge(Object.assign({}, have, w), data, PK, again);
  assert.deepEqual(w2, {}, "a second move writes nothing");
  assert.equal(M.report(again, PK), "Everything brought from the old address was already here. You were writing a case at both addresses; the one here was kept.");
});

test("work that isn't the app's own shape stays behind: a made-up link can't put markup or the wrong types into storage", ()=>{
  const bad='"><img src=x onerror=alert(1)>';
  const w=M.merge({}, {
    "maatirx.library":"x", "maatirx.progress":"{}", "maatirx-assignment-x":"[1]", "maatirx-author-draft":"7", "maatirx.theme":"light"
  }, PK);
  assert.deepEqual(w, {"maatirx.theme":"light"});
  // assignment progress: only {ok:true} and answers {v: a number, ok: true/false} by problem number
  assert.deepEqual(M.cleanAssignment({0:{ok:bad, answers:{0:{v:bad, ok:true}, 1:{v:2, ok:"yes"}, x:{v:1, ok:true}, 2:{v:1, ok:false, extra:bad}}}, x:{ok:true}, 1:null}),
    {0:{answers:{2:{v:1, ok:false}}}});
  assert.equal(M.cleanAssignment([1]), null);
  // a case being written: plain values in the form's own groups
  assert.deepEqual(M.cleanDraft(DRAFT), DRAFT);
  assert.equal(M.cleanDraft(Object.assign({}, DRAFT, {refs:"one"})), null, "refs must be a list");
  assert.equal(M.cleanDraft(Object.assign({}, DRAFT, {patient:"old"})), null);
  assert.equal(M.cleanDraft({a:{b:{c:{d:{e:1}}}}}), null, "nothing nested deeper than the form");
  assert.equal(M.cleanDraft({title:Infinity}), null);
  // the page escapes what it shows from these anyway (cases.js)
  const cases=fs.readFileSync(path.join(__dirname,"..","cases.js"),"utf8");
  assert.ok(cases.includes('const v=x=> x==null ? "" : h.esc(String(x))'), "the case form escapes every saved value");
  assert.ok(cases.includes('value="${ans[j] ? h.esc(ans[j].v) : ""}"'), "and a worksheet's saved answers");
});

test("the library's limit holds, and the note says how many didn't fit; an unreadable library is left alone", ()=>{
  const full=lib(...Array.from({length:PK.LIBRARY_LIMITS.items-1}, (_,i)=> item("s"+i, {D:100+i})));
  const rep={}, w=M.merge({"maatirx.library":full}, {"maatirx.library":lib(item("one more", {D:999}), item("and another", {D:998}))}, PK, rep);
  assert.equal(names(w["maatirx.library"]).length, PK.LIBRARY_LIMITS.items);
  assert.deepEqual([rep.added, rep.dropped], [1, 1]);
  assert.equal(M.report(rep, PK), `Brought from the old address: 1 saved scenario. Nothing saved here was replaced. 1 old scenario didn't fit, since a library holds ${PK.LIBRARY_LIMITS.items}; it stays at the old address.`);
  assert.deepEqual(M.merge({"maatirx.library":"{broken"}, {"maatirx.library":lib(item("x", {D:1}))}, PK), {});
});

test("the page loads the move at the old address or with work set aside, and the offline worker keeps it", ()=>{
  const html=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8"), sw=fs.readFileSync(path.join(__dirname,"..","sw.js"),"utf8");
  const head=html.slice(0, html.indexOf("</script>"));
  const src=head.match(/ui-move\.js\?v=[0-9a-f]{10}/);
  assert.ok(src, "the head script names the stamped file");
  assert.ok(sw.includes("./"+src[0]), "the worker precaches the same file");
  assert.ok(head.includes(`location.hostname=="${M.OLD}"`) && sw.includes(`OLD_HOST="${M.OLD}"`));
  assert.ok(head.includes('mv=sessionStorage.getItem("maatirx.move")'), "work set aside but not yet read (a reload before the page finished) is read on the next load");
  assert.ok(head.indexOf("#move=")<head.indexOf("location.hash.length>1"), "the work is set aside before the link is read");
  assert.ok(html.includes('addEventListener("storage"'), "an open tab reads the library and progress again when another tab changes them");
});

test("work saved under the old name's keys (a page from before 3.0 at the old address) comes across under MaatiRX's", ()=>{
  const both={"dosecurve.library":lib(item("Old tab", {D:300})), "dosecurve.theme":"dark", "dosecurve-assignment-zz":JSON.stringify({0:{ok:true}}),
    "maatirx.theme":"light", "dosecurve.debug":"1", "maatirx.sent":"2026-10-04T00:00:00.000Z", "maatirx-premove:maatirx.library":"x"};
  const c=M.collect(store(both));
  assert.deepEqual(Object.keys(c).sort(), ["maatirx-assignment-zz","maatirx.library","maatirx.theme"], "the debug switch, the sent mark and set-aside keys stay");
  assert.equal(c["maatirx.theme"], "light", "under both names, MaatiRX's wins");
  // a 2.20 page sends the old names, with the library and progress in the old format
  const old={"dosecurve.library":JSON.stringify({format:PK.LIBRARY_FORMATS[1], version:1, items:[item("Sent by 2.20", {D:400})]}),
    "dosecurve.progress":JSON.stringify(Object.assign(PK.emptyProgress(), {format:PK.PROGRESS_FORMATS[1], lessons:{route:{predicted:true}}}))};
  const got=M.decode(encodeURIComponent(JSON.stringify(old)));
  assert.deepEqual(Object.keys(got).sort(), ["maatirx.library","maatirx.progress"]);
  const rep={}, w=M.merge({}, got, PK, rep);
  assert.deepEqual(names(w["maatirx.library"]), ["Sent by 2.20"]);
  assert.equal(JSON.parse(w["maatirx.library"]).format, PK.LIBRARY_FORMAT, "written in MaatiRX's format");
  assert.equal(PK.parseProgress(w["maatirx.progress"]).lessons.route.predicted, true);
  assert.deepEqual([rep.added, rep.prog], [1, true]);
});

test("keys a page set aside (saved under both names) are merged into MaatiRX's, by the move's rules", ()=>{
  const here={"maatirx.library":lib(item("Here", {D:250})), "maatirx.theme":"dark",
    "maatirx-premove:maatirx.library":lib(item("Here", {D:250}), item("Older tab", {D:600})), "maatirx-premove:maatirx.theme":"light",
    "maatirx-premove:maatirx-assignment-q":JSON.stringify({1:{ok:true}})};
  const st=M.settle(store(here), PK);
  assert.deepEqual(st.remove.sort(), ["maatirx-premove:maatirx-assignment-q","maatirx-premove:maatirx.library","maatirx-premove:maatirx.theme"]);
  assert.deepEqual(Object.keys(st.writes).sort(), ["maatirx-assignment-q","maatirx.library"], "the setting saved under MaatiRX's name stays");
  assert.deepEqual(names(st.writes["maatirx.library"]), ["Here","Older tab"], "nothing twice, nothing lost");
  assert.deepEqual(M.settle(store({"maatirx.theme":"dark"}), PK), {writes:{}, remove:[]});
});
