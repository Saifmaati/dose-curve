/* MaatiRx: bringing the work saved at the old address to https://maatirx.com/ (2.20)
   A browser keeps a site's saved data per address, so the scenario library, lesson, practice and assignment progress,
   a case being written and the settings saved at saifmaati.github.io/dose-curve/ don't follow the app to its new
   address by themselves. Once the old address redirects, its service worker still opens the saved app page there
   (sw.js); this file then says the app has moved and, once the new address answers, offers to bring that work along
   in the app page's # part there, which never leaves the browser. The old address keeps its copy and its offline
   page until the reader chooses to go: until then each old link offers to bring it again, which adds nothing twice.
   At the new address the page takes the work in without replacing anything already saved there (scenarios and
   progress are added; work that isn't the app's own shape is left behind), reloads, and says what came across, with
   Undo. The page loads this file only at the old address or with such work set aside; the tests require() it. */
(function(root, factory){
  const api=factory();
  if(typeof module==="object" && module.exports) module.exports=api;
  else { root.DCMove=api; api.run(); }
})(typeof self!=="undefined" ? self : this, function(){
  "use strict";
  const OLD="saifmaati.github.io", NEW="maatirx.com", KEY="maatirx.move", DONE="maatirx.moved", SENT="maatirx.sent", MAX=1e6;
  // every key the app saves (the names are DoseCurve's, kept so nothing saved is lost; decision 234)
  const carried=k=> /^dosecurve[.-]/.test(k) && k!=="dosecurve.debug";
  const LIB="dosecurve.library", PROG="dosecurve.progress", ASSIGN="dosecurve-assignment-", DRAFT="dosecurve-author-draft";
  const json=s=>{ try{ return JSON.parse(s); }catch(e){ return null; } };
  const isObj=o=> !!o && typeof o==="object" && !Array.isArray(o);
  const num=x=> typeof x==="number" && isFinite(x);
  const join=parts=> parts.length<2 ? parts.join("") : parts.slice(0,-1).join(", ")+" and "+parts[parts.length-1];
  const count=(n, one, many)=> n===1 ? "1 "+one : `${n} ${many}`;

  // What this browser has saved for the app: {key: text}.
  function collect(store){
    const out={};
    for(let i=0;i<store.length;i++){ const k=store.key(i); if(k && carried(k)){ const v=store.getItem(k); if(typeof v==="string") out[k]=v; } }
    return out;
  }

  // A link's # part: the saved work, then the link's own # part, if it had one.
  const encode=(data, hash)=> "#move="+encodeURIComponent(JSON.stringify(data))+(hash && hash!=="#" ? hash : "");
  // The kept-aside text back to {key: text}, keeping only the app's own keys with text values.
  function decode(raw){
    let o=null; try{ o=typeof raw==="string" ? JSON.parse(decodeURIComponent(raw)) : null; }catch(e){}
    if(!isObj(o)) return null;
    const out={};
    Object.keys(o).forEach(k=>{ if(carried(k) && typeof o[k]==="string") out[k]=o[k]; });
    return Object.keys(out).length ? out : null;
  }

  // An assignment's progress as the app writes it (cases.js markDone): {item: {ok: true, answers: {problem: {v, ok}}}},
  // and nothing else; null if it isn't one.
  function cleanAssignment(o){
    if(!isObj(o)) return null;
    const out={};
    Object.keys(o).forEach(i=>{
      const x=o[i];
      if(!/^\d{1,3}$/.test(i) || !isObj(x)) return;
      const m={};
      if(x.ok===true) m.ok=true;
      if(isObj(x.answers)){
        m.answers={};
        Object.keys(x.answers).forEach(j=>{ const y=x.answers[j];
          if(/^\d{1,3}$/.test(j) && isObj(y) && num(y.v) && typeof y.ok==="boolean") m.answers[j]={v:y.v, ok:y.ok}; });
      }
      out[i]=m;
    });
    return out;
  }
  // A case being written (cases.js read()): text, numbers, true/false and lists of them, in the form's own groups;
  // null if it isn't one.
  function cleanDraft(o){
    const plain=(x,d)=> x==null || typeof x==="string" || typeof x==="boolean" || num(x)
      || (d<3 && (Array.isArray(x) ? x.every(y=> plain(y,d+1)) : isObj(x) && Object.values(x).every(y=> plain(y,d+1))));
    if(!isObj(o) || !plain(o,0) || (o.refs!=null && !Array.isArray(o.refs))) return null;
    if(["patient","over","target","choices","start"].some(k=> o[k]!=null && !isObj(o[k]))) return null;
    return o;
  }
  // An assignment's progress from both addresses: an item done at either is done, answers from both (right wins).
  function mergeAssignment(a, b){
    const out=Object.assign({}, a);
    Object.keys(b).forEach(i=>{
      const x=a[i] || {}, y=b[i], m=Object.assign({}, x, y);
      if(x.ok || y.ok) m.ok=true;
      if(x.answers || y.answers){
        const ax=x.answers || {}, ay=y.answers || {};
        m.answers=Object.assign({}, ax, ay);
        Object.keys(ax).forEach(q=>{ if(ax[q].ok) m.answers[q]=ax[q]; });
      }
      out[i]=m;
    });
    return out;
  }

  // What to write at this address: {key: text}, nothing that is already the same. A key saved only at the old
  // address comes across; one saved at both keeps this address's value, except the library (the old scenarios not
  // already here are added, up to its limit), progress (a lesson marked at either is marked; practice and task counts
  // take the larger) and an assignment's progress (merged). Work that isn't the app's own shape stays behind. Doing
  // it twice writes nothing the second time. rep, if given, gets what happened: {added, dropped, prog, assign, draft,
  // draftKept, settings}.
  function merge(have, incoming, PK, rep){
    const out={}, r=rep || {};
    Object.assign(r, {added:0, dropped:0, prog:false, assign:0, draft:false, draftKept:false, settings:false});
    Object.keys(incoming).forEach(k=>{
      const v=incoming[k], h=have[k];
      if(k===LIB){
        const b=PK.parseLibrary(v);
        if(b.error || !b.library.items.length) return;
        if(h==null){ out[k]=JSON.stringify(b.library); r.added=b.library.items.length; return; }
        const a=PK.parseLibrary(h);
        if(a.error) return;
        const seen=new Set(a.library.items.map(i=> i.name+"\n"+i.link));
        const add=b.library.items.filter(i=> !seen.has(i.name+"\n"+i.link)), m=PK.mergeLibrary(a.library, add);
        r.added=m.added; r.dropped=m.dropped;
        if(m.added) out[k]=JSON.stringify(m.library);
      } else if(k===PROG){
        const o=json(v);
        if(!isObj(o) || o.format!==PK.PROGRESS_FORMAT) return;
        const a=PK.parseProgress(h || ""), b=PK.parseProgress(o), m=PK.parseProgress(h || "");
        Object.keys(b.lessons).forEach(id=>{ m.lessons[id]=Object.assign({}, a.lessons[id], b.lessons[id]); });
        Object.keys(b.practice).forEach(t=>{ const x=a.practice[t] || {tried:0, right:0}, y=b.practice[t];
          m.practice[t]={tried:Math.max(x.tried, y.tried), right:Math.max(x.right, y.right)}; });
        Object.keys(b.tasks).forEach(t=>{ m.tasks[t]=Math.max(a.tasks[t] || 0, b.tasks[t] || 0); });
        const s=JSON.stringify(m);
        if(s!==JSON.stringify(a)){ out[k]=s; r.prog=true; }
      } else if(k.startsWith(ASSIGN)){
        const b=cleanAssignment(json(v));
        if(!b || !Object.keys(b).length) return;
        const a=cleanAssignment(json(h)) || {}, s=JSON.stringify(mergeAssignment(a, b));
        if(h==null || s!==JSON.stringify(a)){ out[k]=s; r.assign++; }
      } else if(k===DRAFT){
        const b=cleanDraft(json(v));
        if(!b) return;
        if(h==null){ out[k]=JSON.stringify(b); r.draft=true; }
        else if(h!==v) r.draftKept=true;
      } else if(h==null){ out[k]=v; r.settings=true; }
    });
    return out;
  }

  // "12 saved scenarios, your lesson and practice progress and progress on 1 assignment", or "" with no work.
  function summary(data, PK){
    const parts=[];
    if(data[LIB]){ const n=PK.parseLibrary(data[LIB]).library.items.length; if(n) parts.push(count(n, "saved scenario", "saved scenarios")); }
    if(data[PROG]){ const p=PK.parseProgress(data[PROG]);
      if(Object.keys(p.lessons).length || Object.keys(p.practice).length || Object.values(p.tasks).some(Boolean)) parts.push("your lesson and practice progress"); }
    const a=Object.keys(data).filter(k=> k.startsWith(ASSIGN)).length;
    if(a) parts.push(count(a, "assignment's progress", "assignments' progress"));
    if(data[DRAFT]) parts.push("a case you were writing");
    return join(parts);
  }
  // What came across, from merge's rep, for the note at the new address.
  function report(r, PK){
    const parts=[];
    if(r.added) parts.push(count(r.added, "saved scenario", "saved scenarios"));
    if(r.prog) parts.push("your lesson and practice progress");
    if(r.assign) parts.push(count(r.assign, "assignment's progress", "assignments' progress"));
    if(r.draft) parts.push("a case you were writing");
    let s=parts.length ? `Brought from the old address: ${join(parts)}. Nothing saved here was replaced.`
      : r.settings ? "Your settings came from the old address." : "Everything brought from the old address was already here.";
    if(r.dropped) s+=` ${count(r.dropped, "old scenario", "old scenarios")} didn't fit, since a library holds ${PK.LIBRARY_LIMITS.items}; ${r.dropped===1 ? "it stays" : "they stay"} at the old address.`;
    if(r.draftKept) s+=" You were writing a case at both addresses; the one here was kept.";
    return s;
  }

  // The same page at the new address: /dose-curve/x → /x.
  const target=loc=> loc.protocol+"//"+NEW+loc.pathname.replace(/^\/dose-curve(\/|$)/,"/")+loc.search;
  // Where the work goes: the app page, which takes it in, with this page's own query and # part only if this is it.
  const home=loc=>{ const app=/^\/dose-curve(\/(index\.html)?)?$/.test(loc.pathname);
    return {url:loc.protocol+"//"+NEW+"/"+(app ? loc.search : ""), hash:app ? loc.hash : ""}; };

  /* ---------- in the page ---------- */
  const esc=s=> String(s).replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  function dialog(title, html, buttons){
    const d=document.createElement("dialog");
    d.className="lib"; d.setAttribute("aria-labelledby","mvTitle"); d.setAttribute("aria-describedby","mvText");
    d.innerHTML=`<div class="lib-inner"><div class="lib-head"><h2 id="mvTitle">${title}</h2></div><div id="mvText">${html}</div><div class="lib-foot">${
      buttons.map((b,i)=>`<button class="abtn" type="button" data-i="${i}">${b.label}</button>`).join("")}</div></div>`;
    d.addEventListener("click", e=>{ const b=e.target.closest("[data-i]"); if(b) buttons[+b.dataset.i].run(d); });
    d.addEventListener("close", ()=> d.remove());
    document.body.appendChild(d); d.showModal();
    return d;
  }
  const store=(s, k, v)=>{ try{ if(v===undefined) return s.getItem(k); if(v===null) s.removeItem(k); else s.setItem(k, v); }catch(e){ return null; } };

  // At the old address: has it moved? A redirect for a file that isn't kept offline says so; no connection, no.
  async function moved(){
    try{ return (await fetch("site.webmanifest?moved="+Date.now(), {redirect:"manual", cache:"no-store"})).type==="opaqueredirect"; }
    catch(e){ return false; }
  }
  // Does the new address answer (its name found, its certificate in place)? Until it does, this copy keeps working.
  async function answers(){
    try{ await fetch(location.protocol+"//"+NEW+"/site.webmanifest?up="+Date.now(), {mode:"no-cors", cache:"no-store"}); return true; }
    catch(e){ return false; }
  }
  // Leaving the old address for good: its service worker and the app's saved files go, so its links go straight on.
  async function letGo(){
    try{ const r=await navigator.serviceWorker.getRegistration(); if(r) await r.unregister(); }catch(e){}
    try{ await Promise.all((await caches.keys()).filter(k=> /^(maatirx|dosecurve)-/.test(k)).map(k=> caches.delete(k))); }catch(e){}
  }
  async function send(){
    if(!(await moved()) || !(await answers())) return;
    const data=collect(localStorage), what=summary(data, window.PK), same=target(location)+location.hash;
    if(!what){ await letGo(); location.replace(same); return; }
    const to=home(location), link=to.url+encode(data, to.hash), sent=store(localStorage, SENT);
    const go={label:`Go to ${NEW}`, run:async()=>{ await letGo(); location.replace(same); }};
    if(link.length>MAX){
      dialog("MaatiRx has moved", `<p>Its address is now <b>${NEW}</b>. What you saved here (${esc(what)}) is too much to carry in a link: close this, use Library → Export all here, then Import file at ${NEW}.</p>`,
        [{label:"Close", run:d=> d.close()}, go]);
      return;
    }
    const bring=label=>({label, run:()=>{ store(localStorage, SENT, new Date().toISOString()); location.replace(link); }});
    if(sent){
      const day=new Date(sent).toLocaleDateString(undefined, {day:"numeric", month:"long", year:"numeric"});
      dialog("MaatiRx has moved", `<p>Its address is now <b>${NEW}</b>. What you saved here (${esc(what)}) was brought there on ${esc(day)}. If it didn't arrive, bring it again: nothing is added twice.</p>`,
        [go, bring("Bring it again")]);
      return;
    }
    dialog("MaatiRx has moved", `<p>Its address is now <b>${NEW}</b>. A browser keeps saved work per address, so what you saved here (${esc(what)}) stays here unless you bring it.</p>
      <p class="lib-privacy">It travels in the link itself, inside this browser; nothing is sent to a server.</p>`,
      [bring(`Bring it to ${NEW}`), {label:"Not now", run:()=> location.replace(same)}]);
  }

  // At the new address, with work brought from the old one: write it, then reload with "#move=done" so the page
  // reads it all (theme and effects included) and this file can say what came across. If it can't all be written,
  // nothing is.
  function receive(raw){
    const data=decode(raw);
    if(!data) return;
    const have=collect(localStorage), rep={}, writes=merge(have, data, window.PK, rep), keys=Object.keys(writes), what=report(rep, window.PK);
    if(!keys.length){ dialog("Your saved work is here", `<p>${esc(what)}</p>`, [{label:"Done", run:d=> d.close()}]); return; }
    const undo={}; keys.forEach(k=>{ undo[k]=k in have ? have[k] : null; });
    try{
      keys.forEach(k=> localStorage.setItem(k, writes[k]));
      sessionStorage.setItem(DONE, JSON.stringify({undo, what}));
    }catch(e){
      keys.forEach(k=> store(localStorage, k, undo[k]));
      dialog("Your saved work couldn't be kept here", `<p>This browser didn't let the page save it (its storage may be full or blocked), so nothing was changed. It is still at the old address: an old link will offer to bring it again.</p>`,
        [{label:"Close", run:d=> d.close()}]);
      return;
    }
    history.replaceState(null, "", location.pathname+location.search+"#move=done"+location.hash);
    location.reload();
  }
  function done(){
    const r=json(store(sessionStorage, DONE));
    store(sessionStorage, DONE, null);
    if(!isObj(r) || !isObj(r.undo)) return;
    dialog("Your saved work is here", `<p>${esc(r.what)}</p>`,
      [{label:"Done", run:d=> d.close()},
       {label:"Undo", run:()=>{ Object.keys(r.undo).forEach(k=> store(localStorage, k, typeof r.undo[k]==="string" ? r.undo[k] : null)); location.reload(); }}]);
  }

  function run(){
    const raw=store(sessionStorage, KEY);
    store(sessionStorage, KEY, null);
    if(raw==="done") done();
    else if(raw) receive(raw);
    else if(location.hostname===OLD) send();
  }
  return {run, collect, encode, decode, merge, summary, report, target, home, carried, cleanAssignment, cleanDraft, OLD, NEW};
});
