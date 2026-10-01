/* DoseCurve: the validation page's checks
   Every comparison the validation page makes between the engine and the independent solver's reference results
   (validation/reference-results.json): each scenario's peak, trough, AUC and time in window, the Bayesian estimates,
   the antimicrobial indices, the indirect responses and the dialysis sessions. The page runs this as a Web Worker,
   so it stays responsive while the checks run; it passes the engine files' stamped addresses and the reference
   results in one message, and gets back each check's result and each table's rows as they finish. Where a worker
   can't start (a page opened from the file system), the page loads this file itself and runs the same checks,
   handing the page back between them. The tests require() it. Educational model, not for clinical dosing. */
(function(root, factory){
  const api=factory();
  if(typeof module==="object" && module.exports) module.exports=api;
  else {
    root.DCVal=api;
    // as a worker: one {files, ref} message; each file must be this site's own stamped engine file
    if(typeof importScripts==="function" && typeof document==="undefined"){
      root.onmessage=e=>{
        const m=e.data||{}, files=m.files||[];
        if(!m.ref || !files.length || !files.every(f=> typeof f==="string" && /^pk-(engine|hd|idr|bayes)\.js\?v=[0-9a-f]{10}$/.test(f))) return;
        importScripts(...files);
        api.run(root.PK, m.ref, msg=> root.postMessage(msg)).catch(err=> root.postMessage({error:String(err && err.message || err)}));
      };
    }
  }
})(typeof self!=="undefined" ? self : this, function(){
  "use strict";
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const pct=(a,b)=> b===0 ? (a===0 ? 0 : Infinity) : 100*(a/b-1);
  const f=(v,dp)=> Number(v).toFixed(dp), fd=v=> (Math.abs(v)<0.0005 ? "0.000" : f(v,3))+"%";
  const count=REF=> 4*REF.scenarios.length+2*REF.map.scenarios.length+3*REF.pkpd.scenarios.length+3*REF.idr.scenarios.length+2*REF.hd.scenarios.length;

  // Runs every check in the page's order. emit gets {marks} (each comparison's pass or fail, in order, for the
  // sphere), {progress, of}, {table, html} once a table is complete, and finally {done} with the totals. pause is
  // awaited between scenarios: nothing in a worker, a short hand-back on the page.
  async function run(PK, REF, emit, pause){
    const wait=pause || (()=>{});
    const {T,mec,mtc}=REF.window, rows=[];
    let pass=0, total=0;
    const worst={rel:0, pp:0};
    for(let i=0;i<REF.scenarios.length;i++){
      if(i && i%4===0){ emit({progress:i, of:REF.scenarios.length}); await wait(); }
      const s=REF.scenarios[i], marks=[];
      const p=PK.normalizeScenario(PK.scenario(s.scenario)), w=PK.windowStats(p,T,mec,mtc,s.site), level=s.site==="effect" ? PK.ceConc : PK.conc;
      const m={peak:w.cmax, trough:level(p,(p.dosing==="repeated" ? p.nDoses*p.tau : T)-1e-9), auc:w.auc, tin:100*w.tIn/T}, r=s.reference;
      const tol=s.nonlinear ? REF.tolerance.nonlinear : REF.tolerance.linear, tpp=s.nonlinear ? REF.tolerance.tin_pp_nonlinear : REF.tolerance.tin_pp_linear;
      const d={peak:pct(m.peak,r.peak), trough:pct(m.trough,r.trough), auc:pct(m.auc,r.auc), tin:m.tin-r.tin_pct};
      const ok=["peak","trough","auc"].every(k=>Math.abs(d[k])<=100*tol) && Math.abs(d.tin)<=tpp;
      ["peak","trough","auc"].forEach(k=>{ total++; const o=Math.abs(d[k])<=100*tol; marks.push(o); if(o) pass++; worst.rel=Math.max(worst.rel,Math.abs(d[k])); });
      total++; { const o=Math.abs(d.tin)<=tpp; marks.push(o); if(o) pass++; } worst.pp=Math.max(worst.pp,Math.abs(d.tin));
      emit({marks});
      rows.push(`<tr><td>${esc(s.id)}</td><td>${f(r.peak,3)}</td><td>${fd(d.peak)}</td><td>${f(r.trough,3)}</td><td>${fd(d.trough)}</td><td>${f(r.auc,1)}</td><td>${fd(d.auc)}</td><td>${f(r.tin_pct,2)}%</td><td>${f(d.tin,3)}</td><td class="${ok?"ok":"no"}">${ok?"✓":"✗"}</td></tr>`);
    }
    emit({table:"#tbl", html:rows.join("")});

    // the Bayesian (MAP) estimates: clearance and volume against the reference
    let mapPass=0, mapTotal=0, mapWorst=0;
    const mapRows=[];
    for(const s of (REF.map ? REF.map.scenarios : [])){ await wait();
      const p=PK.normalizeScenario(PK.scenario(s.scenario)), e=PK.bayes.estimate(p, p.lv, s.opts), r=s.reference;
      const dCL=pct(e.CL,r.CL), dV=pct(e.V,r.V), ok=[dCL,dV].every(d=>Math.abs(d)<=100*REF.map.tolerance), marks=[];
      [dCL,dV].forEach(d=>{ mapTotal++; const o=Math.abs(d)<=100*REF.map.tolerance; marks.push(o); if(o) mapPass++; mapWorst=Math.max(mapWorst,Math.abs(d)); });
      emit({marks});
      mapRows.push(`<tr><td>${esc(s.id)}</td><td>${p.lv.length}</td><td>${f(r.priorCL,3)}</td><td>${f(r.CL,3)}</td><td>${fd(dCL)}</td><td>${f(r.priorV,2)}</td><td>${f(r.V,2)}</td><td>${fd(dV)}</td><td class="${ok?"ok":"no"}">${ok?"✓":"✗"}</td></tr>`);
    }
    emit({table:"#mapTbl", html:mapRows.join("")});
    pass+=mapPass; total+=mapTotal;

    // the antimicrobial indices at steady state
    let pkPass=0, pkTotal=0;
    const P=REF.pkpd || {scenarios:[], tolerance:{}}, pkRows=[];
    for(const s of P.scenarios){ await wait();
      const m=PK.micStats(PK.normalizeScenario(PK.scenario(s.scenario)), s.mic, 24), r=s.reference;
      const dft=m.ft-r.ft_pct, dc=pct(m.cmaxMic,r.cmax_mic), da=pct(m.aucMic,r.auc24_mic);
      const oks=[Math.abs(dft)<=P.tolerance.ft_pp, Math.abs(dc)<=100*P.tolerance.ratio, Math.abs(da)<=100*P.tolerance.ratio], ok=oks.every(Boolean);
      oks.forEach(o=>{ pkTotal++; if(o) pkPass++; }); emit({marks:oks});
      pkRows.push(`<tr><td>${esc(s.name)}</td><td>${f(r.ft_pct,2)}%</td><td>${Math.abs(dft)<0.0005 ? "0.000" : f(dft,3)}</td><td>${f(r.cmax_mic,3)}</td><td>${fd(dc)}</td><td>${f(r.auc24_mic,2)}</td><td>${fd(da)}</td><td class="${ok?"ok":"no"}">${ok?"✓":"✗"}</td></tr>`);
    }
    emit({table:"#pkpdTbl", html:pkRows.join("")});
    pass+=pkPass; total+=pkTotal;

    // indirect responses: at five times and at the largest change
    let idPass=0, idTotal=0;
    const D=REF.idr || {scenarios:[], tolerance:{}}, idRows=[];
    for(const s of D.scenarios){ await wait();
      const p=PK.normalizeScenario(PK.scenario(s.scenario)), st=PK.idr.stats(p, s.T), r=s.reference;
      const wst=Math.max(...Object.entries(r.at).map(([t,v])=> Math.abs(pct(PK.idr.at(p, s.T, +t*s.T), v))));
      const de=pct(st.ext, r.ext), dt=st.tExt-r.t_ext;
      const oks=[wst<=100*D.tolerance.rel, Math.abs(de)<=100*D.tolerance.rel, Math.abs(dt)<=D.tolerance.t_h], ok=oks.every(Boolean);
      oks.forEach(o=>{ idTotal++; if(o) idPass++; }); emit({marks:oks});
      idRows.push(`<tr><td>${esc(s.name)}</td><td>${f(r.ext,3)}</td><td>${fd(de)}</td><td>${f(r.t_ext,2)}</td><td>${Math.abs(dt)<0.0005 ? "0.000" : f(dt,3)}</td><td>${fd(wst)}</td><td class="${ok?"ok":"no"}">${ok?"✓":"✗"}</td></tr>`);
    }
    emit({table:"#idrTbl", html:idRows.join("")});
    pass+=idPass; total+=idTotal;

    // hemodialysis: the level at six times, and each session's levels and removal
    let hdPass=0, hdTotal=0;
    const HDR=REF.hd || {scenarios:[], tolerance:{}}, hdRows=[];
    for(const s of HDR.scenarios){ await wait();
      const p=PK.normalizeScenario(PK.scenario(s.scenario)), r=s.reference, tab=PK.hd.sessionTable(p, s.T).filter(x=>x.end<=s.T);
      const wl=Math.max(...Object.entries(r.at).map(([t,v])=> Math.abs(pct(PK.conc(p, +t*s.T-1e-9), v))));
      const wsn=Math.max(0, ...r.sessions.flatMap((x,i)=> [pct(tab[i].pre,x.pre), pct(tab[i].post,x.post), pct(tab[i].removed,x.removed)].map(Math.abs)));
      const oks=[wl<=100*HDR.tolerance.rel, wsn<=100*HDR.tolerance.rel], ok=oks.every(Boolean);
      oks.forEach(o=>{ hdTotal++; if(o) hdPass++; }); emit({marks:oks});
      hdRows.push(`<tr><td>${esc(s.name)}</td><td>${r.sessions.length}</td><td>${f(r.sessions[0].removed,2)}</td><td>${fd(wl)}</td><td>${fd(wsn)}</td><td class="${ok?"ok":"no"}">${ok?"✓":"✗"}</td></tr>`);
    }
    emit({table:"#hdTbl", html:hdRows.join("")});
    pass+=hdPass; total+=hdTotal;

    const out={done:true, pass, total, scenarios:REF.scenarios.length, map:mapTotal/2, pkpd:pkTotal/3, idr:idTotal/3, hd:hdTotal/2, worst:worst.rel, worstPp:worst.pp, mapWorst};
    emit(out); return out;
  }
  return {run, count};
});
