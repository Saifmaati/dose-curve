/* MaatiRX sensitivity analysis
   One input at a time moved 20% down and 20% up, everything else held, and the change in four outputs: AUC24, the
   peak, the trough and the time in the window. Clearance moves with the volume held (the half-life follows), volume
   with clearance held, and F is capped at 1. A regular regimen is read at steady state (AUC24 = AUCτ × 24 / τ, and
   the steady-state peak and trough); a single dose, a custom schedule, or a regimen on dialysis over the chart window
   (the AUC over the window, its peak, and the level at its end). The time in the window is always over the
   chart window. The page loads this file when the Sensitivity panel opens (it registers itself as PK.sensModule); in
   Node the engine requires it on first use of PK.sens. Educational model, not for clinical dosing. */
(function(root, factory){
  if(typeof module==="object" && module.exports) module.exports=factory(require("./pk-engine.js"));
  else if(root && root.PK) root.PK.sensModule=factory(root.PK);
})(typeof self!=="undefined" ? self : this, function(PK){
  "use strict";
  const {normalizeScenario, cloneScenario, derived, windowStats, conc, ssPeakTrough, hepOn, hdOn, mmSteady, unitsOf}=PK;
  const STEP=0.2;
  const METRICS=[{id:"auc", name:"AUC", kind:"pct"}, {id:"cmax", name:"Peak", kind:"pct"}, {id:"cmin", name:"Trough", kind:"pct"}, {id:"tin", name:"Time in window", kind:"pp"}];

  // The inputs that mean something for this scenario, each as a function that scales it by f.
  function inputs(p){
    const mm=p.kin==="mm", oral=p.dosing==="custom" ? p.events.some(e=>e.route==="oral") : p.route==="oral", list=[];
    if(!mm && !hepOn(p)) list.push({id:"cl", name:"Clearance", set:(q,f)=>{ q.thalf=p.thalf/f; }});
    if(mm) list.push({id:"vmax", name:"Vmax", set:(q,f)=>{ q.vmax=p.vmax*f; }}, {id:"km", name:"Km", set:(q,f)=>{ q.km=p.km*f; }});
    // volume with clearance held: the half-life moves with it (with the liver model, clearance is the liver's anyway)
    list.push({id:"v", name:"Volume", set:(q,f)=>{ q.V=p.V*f; if(!mm && !hepOn(p)) q.thalf=p.thalf*f; }});
    if(oral && !hepOn(p)) list.push({id:"f", name:"Bioavailability", set:(q,f)=>{ q.F=Math.min(1, p.F*f); }});
    if(oral) list.push({id:"ka", name:"Absorption rate", set:(q,f)=>{ q.ka=p.ka*f; }});
    list.push({id:"d", name:"Dose", set:(q,f)=>{ if(p.dosing==="custom") q.events=p.events.map(e=>Object.assign({}, e, {mg:e.mg*f})); else q.D=p.D*f; }});
    if(p.dosing==="repeated") list.push({id:"tau", name:"Dosing interval", set:(q,f)=>{ q.tau=p.tau*f; }});
    if(p.cmt===2 && !mm) list.push({id:"k12", name:"k12", set:(q,f)=>{ q.k12=p.k12*f; }}, {id:"k21", name:"k21", set:(q,f)=>{ q.k21=p.k21*f; }});
    return list;
  }
  // The four outputs for a scenario.
  function outputs(p, view){
    const T=view.duration, w=windowStats(p, T, view.mec, view.mtc), tin=100*w.tIn/T;
    const ss=p.dosing==="repeated" && !hdOn(p) && !(p.kin==="mm" && mmSteady(p).none);
    if(ss && p.kin==="mm"){ const m=mmSteady(p), pt=PK.ssProfile(p); return {auc:24*m.avg, cmax:pt.ssPeak, cmin:pt.ssTrough, tin, ss:true}; }
    if(ss){ const pt=ssPeakTrough(p); return {auc:derived(p).auc*24/p.tau, cmax:pt.peak, cmin:pt.trough, tin, ss:true}; }
    return {auc:w.auc, cmax:w.cmax, cmin:conc(p, T-1e-9), tin, ss:false};
  }
  const change=(kind, a, b)=> kind==="pp" ? b-a : (a===0 ? (b===0 ? 0 : null) : 100*(b/a-1));
  // Each input at −20% and +20%, and the change in each output from the scenario as it is.
  function analyse(p, view){
    const base=outputs(p, view), rows=inputs(p).map(inp=>{
      const at=f=>{ const q=cloneScenario(p); inp.set(q, f); return outputs(normalizeScenario(q), view); };
      const lo=at(1-STEP), hi=at(1+STEP), out={id:inp.id, name:inp.name, capped:inp.id==="f" && p.F*(1+STEP)>1};
      METRICS.forEach(m=>{ out[m.id]={lo:change(m.kind, base[m.id], lo[m.id]), hi:change(m.kind, base[m.id], hi[m.id])}; });
      return out;
    });
    return {base, rows};
  }
  const span=r=> Math.max(Math.abs(r.lo||0), Math.abs(r.hi||0));
  // The rows for one output, largest effect first, and the sentence that names the dominant input.
  function ranked(res, metric){
    const m=METRICS.find(x=>x.id===metric), rows=res.rows.slice().sort((a,b)=> span(b[metric])-span(a[metric]));
    const top=rows[0], u=m.kind==="pp" ? " percentage points" : "%", sg=v=> v==null ? "n/a" : (v>0 ? "+" : v<0 ? "−" : "")+Math.abs(v).toFixed(1)+u;
    const tied=rows.filter(r=> Math.abs(span(r[metric])-span(top[metric]))<0.05);
    const what=res.base.ss ? (metric==="auc" ? "AUC24 at steady state" : metric==="cmax" ? "the steady-state peak" : metric==="cmin" ? "the steady-state trough" : "the time in the window")
      : (metric==="auc" ? "the AUC over the time window" : metric==="cmax" ? "the peak in the window" : metric==="cmin" ? "the level at the end of the window" : "the time in the window");
    const text=span(top[metric])<0.05 ? `None of these inputs moves ${what} by more than 0.05${u.trim()==="%" ? "%" : u} at ±20%.`
      : `${what.charAt(0).toUpperCase()+what.slice(1)} is most sensitive to ${tied.map(r=>r.name.toLowerCase()).join(" and ")}: −20% changes it by ${sg(top[metric].lo)}, +20% by ${sg(top[metric].hi)}.`
        +(rows.length>1 && span(rows[1][metric])>=0.05 && tied.length===1 ? ` Next is ${rows[1].name.toLowerCase()} (${sg(rows[1][metric].lo)} / ${sg(rows[1][metric].hi)}).` : "");
    return {rows, text, metric:m};
  }
  // The tornado chart as SVG, in the page's chart colours (k: its theme tokens; the dark theme's when not given).
  function svg(rk, k){
    // the instrument's style (2.12): a hairline centre and row rules, thin bars, the +20% bar in the accent and the
    // −20% bar in the neutral second colour, values in tabular figures
    k=k || {line:"#22262E", text:"#ECEEF2", muted:"#8F96A3", accent:"#D8C29D", b:"#C2C9D4"};
    const W=760, row=34, top=28, H=top+rk.rows.length*row+32, mid=W/2+80, half=W-mid-80, pp=rk.metric.kind==="pp", lo=k.b || k.muted;
    const mx=Math.max(1, ...rk.rows.map(r=>span(r[rk.metric.id])));
    const x=v=> mid+(v/mx)*half, fmt=v=> v==null ? "—" : (v>0 ? "+" : v<0 ? "−" : "")+Math.abs(v).toFixed(1)+(pp ? " pp" : "%");
    const T=(a, txt)=> `<text ${a} font-family="Inter" style="font-variant-numeric:tabular-nums">${txt}</text>`;
    let g=`<line x1="${mid}" y1="${top-8}" x2="${mid}" y2="${H-20}" stroke="${k.text}" stroke-opacity="0.3" stroke-width="1"/>`+
      T(`x="${mid}" y="${top-12}" text-anchor="middle" font-size="12" fill="${k.muted}"`, "no change");
    rk.rows.forEach((r,i)=>{
      const y=top+i*row, v=r[rk.metric.id];
      if(i) g+=`<line x1="${mid-half-200}" y1="${y}" x2="${W-10}" y2="${y}" stroke="${k.text}" stroke-opacity="0.06" stroke-width="1"/>`;
      g+=T(`x="${mid-half-12}" y="${y+20}" text-anchor="end" font-size="14" fill="${k.text}"`, r.name+(r.capped ? " (capped at 1)" : ""));
      [["lo",lo],["hi",k.accent]].forEach(([key,col],j)=>{
        const val=v[key]; if(val==null) return;
        const a=Math.min(x(0), x(val)), w=Math.max(1, Math.abs(x(val)-x(0)));
        g+=`<rect x="${a}" y="${y+7+j*11}" width="${w}" height="7" rx="3.5" fill="${col}" opacity="0.9"/>`+
          T(`x="${val>=0 ? a+w+6 : a-6}" y="${y+14+j*11}" text-anchor="${val>=0 ? "start" : "end"}" font-size="11.5" fill="${col}"`, fmt(val));
      });
    });
    g+=`<rect x="${mid-half}" y="${H-14}" width="12" height="6" rx="3" fill="${lo}"/>`+T(`x="${mid-half+17}" y="${H-7}" font-size="12.5" fill="${k.muted}"`, "input −20%")+
      `<rect x="${mid-half+120}" y="${H-14}" width="12" height="6" rx="3" fill="${k.accent}"/>`+T(`x="${mid-half+137}" y="${H-7}" font-size="12.5" fill="${k.muted}"`, "input +20%");
    return {markup:g, height:H, width:W};
  }
  return {STEP, METRICS, inputs, outputs, analyse, ranked, svg};
});
