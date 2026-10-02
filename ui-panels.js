/* DoseCurve: the MIC and dialysis panels (2.17)
   The antimicrobial panel's readings (fT>MIC, Cmax/MIC, AUC24/MIC, where the unbound level crosses the MIC, and the
   index and target a library drug's sources give) and the dialysis panel's sessions (levels before and after, the
   fall, the amount removed, the rebound and the IV dose that would restore the level). Loaded once a MIC is entered
   or dialysis is on, or with a link that opens with either. The page calls DCPanels(ctx) once; ctx gives live access
   to its state and helpers. Educational model, not for clinical dosing. */
(function(root){
  "use strict";
  root.DCPanels=function(ctx){
    const {byId, PK, U, fmt, trim, esc, cdp, DRUGS, state, snapshot, chartCurves, loadSources, render}=ctx;

    // The live scenario's sessions in the window: levels before and after, the fall, the amount removed, and the IV
    // dose right after each that would bring the level back to where the session found it (rounded).
    function hd(){
      const p=snapshot(), out=byId("hdOut");
      if(!PK.hdOn(p)) return;
      if(!PK.hdModule){ out.textContent="Loading the dialysis model…"; return; }
      const u=PK.unitsOf(p), T=state.duration, rows=PK.hd.sessionTable(p, T), f=PK.hd.sessionFraction(p), d=DRUGS.find(x=>x.id===ctx.lastDrug);
      const step=d && d.units===p.unit && d.strengths.round || null, rnd=x=> step ? Math.round(x/step)*step : +x.toPrecision(2);
      let h=`<div class="cm-h">Each session, with no dose during it</div>CL ${fmt(PK.derived(p).CL,2)} → <b>${fmt(PK.derived(p).CL+p.hdcl,2)} L/h</b> while it runs; the level falls <b>${fmt(100*f.fall,0)}%</b> over ${trim(p.hddur)} h, ${fmt(100*f.byDialysis/f.fall,0)}% of it by the dialyzer`;
      h+=`<div class="cm-h">Sessions in the ${trim(T)} h window</div>`+(rows.length ? rows.slice(0,8).map(r=>
        `${r.n}. ${trim(r.start)}–${trim(r.end)} h: ${fmt(r.pre,cdp(1))} → <b>${fmt(r.post,cdp(1))}</b> ${u.conc} (−${fmt(100*r.fall,0)}%), ${fmt(r.removed,0)} ${u.amount} removed; `+
        (r.rebound ? `with no dose it then rebounds to <b>${fmt(r.rebound.level,cdp(1))} ${u.conc}</b> ${fmt(r.rebound.after,1)} h later (${fmt(100*r.rebound.share,0)}% of the fall back) as drug returns from the tissues; ` : "")+
        `to restore the level${r.rebound ? " straight after the session" : ""}, about <b>${fmt(rnd(r.supplement),step || rnd(r.supplement)>=10 ? 0 : 1)} ${u.dose}</b> IV after it`).join("<br>") : "none starts in the window");
      out.innerHTML=h;
    }

    // The library drug a scenario still is (its half-life, volume and units unchanged), for the index its sources name.
    const pkpdDrug=p=> DRUGS.find(d=> d.pkpd && p.kin==="linear" && !PK.hepOn(p) && d.s.thalf===p.thalf && d.s.V===p.V && d.units===p.unit);
    const INDEX_NAME={ft:"fT>MIC", cmax:"Cmax/MIC", auc:"AUC24/MIC"};
    function mic(){
      byId("micLabel").textContent=`MIC (${U().conc})`;
      const out=byId("micOut");
      if(!(state.mic>0)){ out.textContent="Enter the organism's MIC to read fT>MIC, Cmax/MIC and AUC24/MIC."; return; }
      const curves=chartCurves(), u=U(), mic=state.mic;
      const rows=curves.map(cv=>({cv, m:PK.micStats(cv.p, mic, state.duration)}));
      const name=r=> ctx.mode==="cmp" ? `<span style="color:${r.cv.col.css}">${r.cv.tag}</span> ` : r.cv.ghost ? "Baseline: " : rows.length>1 ? "Now: " : "";
      const when=m=> m.ss ? `at steady state, over one ${trim(m.span)} h interval` : `over the ${trim(m.span)} h window (not a repeated regimen)`;
      let h=rows.map(r=>{ const m=r.m;
        return `<div class="cm-h">${name(r)}${when(m)}</div>`+
          `fT&gt;MIC <b>${fmt(m.ft, m.ft>=99.5 && m.ft<100 || m.ft>0 && m.ft<0.5 ? 1 : 0)}%</b> · Cmax/MIC <b>${fmt(m.cmaxMic,1)}</b> · ${m.ss ? "AUC24" : "AUC0–24"}/MIC <b>${fmt(m.aucMic,0)}</b><br>`+
          `<span>Cmax ${fmt(m.cmax,cdp(1))} ${u.conc}, ${m.ss ? "AUC24" : "AUC0–24"} ${fmt(m.auc24,0)} ${u.auc}; unbound: fCmax/MIC ${fmt(m.fcmaxMic,1)}, fAUC/MIC ${fmt(m.faucMic,0)}</span>`; }).join("");
      const fus=[...new Set(rows.map(r=>r.m.fu))];
      h+=`<div class="cm-h">Where the unbound level crosses the MIC</div>`+fus.map(fu=>
        `fu ${trim(fu)}: a total level of ${trim(mic)} / ${trim(fu)} = ${fmt(mic/fu,cdp(1))} ${u.conc}`).join("<br>");
      // the index and any target come from the drug's sources, never from a general rule
      const drugs=[...new Set(curves.filter(cv=>!cv.ghost).map(cv=>pkpdDrug(cv.p)))];
      h+=`<div class="cm-h">Index and target</div>`+drugs.map(d=>{
        if(!d) return "No library drug matches this scenario, so no index or target is named: published targets differ by drug class, organism and infection model, and DoseCurve shows one only where a cited source gives it.";
        const P=d.pkpd, src=PK.SOURCES[P.src];
        if(!src) loadSources().then(render).catch(()=>{});
        const cite=src ? `<a href="${src.url}" target="_blank" rel="noopener">${esc(src.cite.split(".")[0])}</a>` : "loading the source";
        let t=`${esc(d.name)}: ${INDEX_NAME[P.index]}. Its source: ${esc(P.note)} (${cite}).`;
        if(P.lo!=null){
          const m=rows.find(r=>!r.cv.ghost && pkpdDrug(r.cv.p)===d).m, v=m.aucMic;
          t+=` This scenario's ${INDEX_NAME[P.index]} is ${fmt(v,0)}: ${v<P.lo ? "below" : v>P.hi ? "above" : "within"} ${P.lo}–${P.hi}.`;
        } else t+=" No number is given for it, so none is shown.";
        return t; }).join("<br>");
      out.innerHTML=h;
    }
    return {mic, hd};
  };
})(typeof self!=="undefined" ? self : this);
