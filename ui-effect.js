/* MaatiRX: the effect charts (2.13)
   Effect over time, on the concentration chart's time axis, and the concentration–effect curve with a dot at the time
   cursor, for the Effect switch. Loaded when the switch is first on (or a link opens with it); the page passes its
   chart's live state through ctx. Effect is read off the concentration samples the main chart already computed,
   through each scenario's own Emax curve (or pk-idr.js for an indirect response). Educational model, not for
   clinical dosing. */
(function(root){
  "use strict";
  root.DCEffect=function(ctx){
    const {byId, PK, K, U, fmt, fmtAxis, trim, ticksRange, polyline, conc, effColor, pdKey, popBands, loadIdr, render, IDR_NAME, effEl, ecEl, EH, EM, EW, ECH, ECM, state, cdp, esc}=ctx;
    let effY=null, ecMap=null;
    // With an indirect response the effect chart shows the response as a % of its baseline, from pk-idr.js.
    const respOf=(cv,t,ce)=> cv.p.idr>0 ? PK.idr.at(cv.p, state.duration, t) : PK.effectOf(cv.p, ce);
    let effTop=100;
    function renderPd(curves, T0, T1){
      byId("pdBox").hidden=!state.pd; byId("pdRow").hidden=!state.pd;
      if(!state.pd) return;
      const resp=curves.some(cv=>cv.p.idr>0);
      if(resp && !PK.idrModule){
        effEl.innerHTML=`<text x="${ctx.PW/2}" y="${EH/2}" text-anchor="middle" font-family="Inter" font-size="12" fill="${K.muted}">Loading the response model…</text>`;
        byId("pdStats").innerHTML=""; ecEl.innerHTML="";
        loadIdr().then(render).catch(()=>{ effEl.innerHTML=`<text x="${ctx.PW/2}" y="${EH/2}" text-anchor="middle" font-family="Inter" font-size="12" fill="${K.muted}">The response model couldn't load. Check the connection.</text>`; });
        return;
      }
      // the response's own scale: 0 to a round number above the highest value (100 for direct effects)
      let top=100;
      if(resp) curves.forEach(cv=> cv.raw.forEach(q=>{ const v=respOf(cv,q.t,q.ce); if(v>top) top=v; }));
      effTop=resp ? Math.max(120, Math.ceil(top*1.1/20)*20) : 100;
      const iw=ctx.PW-EM.l-EM.r, ih=EH-EM.t-EM.b, x=t=> EM.l+((t-T0)/(T1-T0))*iw, y=e=> EM.t+ih-(e/effTop)*ih;
      effY=y;
      let g=`<rect x="${EM.l}" y="${EM.t}" width="${iw}" height="${ih}" fill="none" stroke="${K.line}"/>`+
        (resp ? "" : `<rect x="${EM.l}" y="${y(100)}" width="${iw}" height="${y(state.etgt)-y(100)}" fill="${K.band}" fill-opacity="0.1"/>`);
      (resp ? ticksRange(0,effTop,5) : [0,25,50,75,100]).forEach(v=>{
        g+=`<line x1="${EM.l}" y1="${y(v)}" x2="${ctx.PW-EM.r}" y2="${y(v)}" stroke="${K.line}"/>`+
          `<text x="${EM.l-9}" y="${y(v)+3.5}" text-anchor="end" font-family="Inter" font-size="10" fill="${K.muted}">${v}</text>`;
      });
      ticksRange(T0,T1,7).forEach(v=>{
        g+=`<line x1="${x(v)}" y1="${EM.t}" x2="${x(v)}" y2="${EH-EM.b}" stroke="${K.line}"/>`+
          `<text x="${x(v)}" y="${EH-EM.b+16}" text-anchor="middle" font-family="Inter" font-size="10" fill="${K.muted}">${fmtAxis(v)}</text>`;
      });
      if(resp) g+=`<line x1="${EM.l}" y1="${y(100)}" x2="${ctx.PW-EM.r}" y2="${y(100)}" stroke="${K.text}" stroke-width="1.2" stroke-dasharray="5 4" opacity="0.7"/>`+
        `<text x="${ctx.PW-EM.r-4}" y="${y(100)-5}" text-anchor="end" font-family="Inter" font-size="9.5" fill="${K.text}">baseline 100%</text>`;
      else g+=`<line x1="${EM.l}" y1="${y(state.etgt)}" x2="${ctx.PW-EM.r}" y2="${y(state.etgt)}" stroke="${K.band}" stroke-width="1.2" stroke-dasharray="5 4" opacity="0.75"/>`+
        `<text x="${ctx.PW-EM.r-4}" y="${y(state.etgt)-5}" text-anchor="end" font-family="Inter" font-size="9.5" fill="${K.band}">target ${state.etgt}%</text>`;
      // population mode: the effect's 5th–95th percentile band across the same virtual patients, its median dotted
      popBands(curves).forEach(({cv,r})=>{
        if(!r.e05) return;
        const idx=r.t.map((t,i)=>i).filter(i=> r.t[i]>=T0-1e-9 && r.t[i]<=T1+1e-9);
        if(idx.length<2) return;
        const yc=e=> y(Math.min(e, effTop)), col=effColor(cv);
        g+=`<polygon points="${idx.map(i=>`${x(r.t[i])},${yc(r.e95[i])}`).concat(idx.slice().reverse().map(i=>`${x(r.t[i])},${yc(r.e05[i])}`)).join(" ")}" fill="${col}" fill-opacity="0.13" stroke="none"/>`+
          `<path d="${polyline(idx.map(i=>({x:x(r.t[i]), y:yc(r.e50[i])})))}" fill="none" stroke="${col}" stroke-width="1.3" stroke-dasharray="2 3" opacity="0.8"/>`;
      });
      const order=ctx.mode==="cmp" ? [curves.find(cv=>cv.id!==ctx.cmp.edit), curves.find(cv=>cv.id===ctx.cmp.edit)] : curves.slice().reverse();
      order.forEach(cv=>{
        const d="M "+cv.raw.map(q=>`${x(q.t)} ${y(respOf(cv,q.t,q.ce))}`).join(" L ");
        g+=cv.ghost ? `<path d="${d}" fill="none" stroke="${K.ghost}" stroke-width="1.8" stroke-dasharray="6 5" opacity="0.75"/>`
          : `<path d="${d}" fill="none" stroke="${effColor(cv)}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`;
      });
      g+=`<text x="${EM.l+iw/2}" y="${EH-4}" text-anchor="middle" font-family="Inter" font-size="11" fill="${K.muted}" font-weight="500">Time (h)</text>`+
        `<text transform="translate(15 ${EM.t+ih/2}) rotate(-90)" text-anchor="middle" font-family="Inter" font-size="11" fill="${K.muted}" font-weight="500">${resp ? (curves.every(cv=>cv.p.idr>0) ? "Response (% of baseline)" : "Effect or response (%)") : "Effect (% of max)"}</text>`+
        `<g id="effCursor" style="display:none"><line id="effCurLine" y1="${EM.t}" y2="${EH-EM.b}" stroke="${K.text}" stroke-width="1.4" opacity="0.7"/>`+
        curves.map((cv,i)=>`<circle class="effDot" data-i="${i}" r="4.5" fill="${effColor(cv)}" stroke="${K.surface}" stroke-width="2"/>`).join("")+`</g>`;
      effEl.innerHTML=g;
      const primary=curves.find(cv=>ctx.mode==="cmp" ? cv.id===ctx.cmp.edit : cv.primary);
      const pp=primary.p;
      byId("pdSub").textContent=pp.idr>0 ? `Indirect, ${IDR_NAME[pp.idr].toLowerCase()}, EC50 ${trim(pp.ec50)} ${U().conc}, ${pp.idr<3 ? `Imax ${fmt(100*pp.imax,0)}%` : `Smax ${trim(pp.smax)}`}, n ${trim(pp.hill)}, response turnover t½ ${trim(pp.tout)} h${PK.keqOf(pp)>0?`, effect-site t½ ${trim(pp.teq)} h`:""}`
        : `EC50 ${trim(pp.ec50)} ${U().conc}, Emax ${trim(pp.emax)}%, n ${trim(pp.hill)}${pp.e0?`, E₀ ${trim(pp.e0)}%`:""}${PK.keqOf(pp)>0?`, effect-site t½ ${trim(pp.teq)} h`:""}`;
      effEl.setAttribute("aria-label", resp ? "Response over time, as a percentage of its baseline. Click or drag to move the time cursor." : "Effect over time, as a percentage of the largest possible response. Click or drag to move the time cursor.");
      renderSigmoid(curves, primary);
      renderPdStats(curves);
    }

    // Effect against log concentration: 2 decades either side of EC50, the target line, EC50 and the
    // concentration that reaches the target marked for the scenario being edited.
    function renderSigmoid(curves, primary){
      const iw=EW-ECM.l-ECM.r, ih=ECH-ECM.t-ECM.b, ecs=curves.map(cv=>cv.p.ec50);
      const lo=Math.floor(Math.log10(Math.min(...ecs))-2), hi=Math.ceil(Math.log10(Math.max(...ecs))+2);
      const X=c=> ECM.l+((Math.log10(Math.min(Math.max(c,10**lo),10**hi))-lo)/(hi-lo))*iw, Y=e=> ECM.t+ih-(e/effTop)*ih;
      ecMap={X,Y};
      let g=`<rect x="${ECM.l}" y="${ECM.t}" width="${iw}" height="${ih}" fill="none" stroke="${K.line}"/>`;
      for(let k=lo;k<=hi;k++){
        const v=10**k, xx=X(v);
        g+=`<line x1="${xx}" y1="${ECM.t}" x2="${xx}" y2="${ECM.t+ih}" stroke="${K.line}"/>`+
          `<text x="${xx}" y="${ECM.t+ih+15}" text-anchor="middle" font-family="Inter" font-size="9.5" fill="${K.muted}">${v>=1?v:v.toPrecision(1)}</text>`;
      }
      (effTop>100 ? ticksRange(0,effTop,4) : [0,50,100]).forEach(v=>{
        g+=`<line x1="${ECM.l}" y1="${Y(v)}" x2="${EW-ECM.r}" y2="${Y(v)}" stroke="${K.line}"/>`+
          `<text x="${ECM.l-7}" y="${Y(v)+3.5}" text-anchor="end" font-family="Inter" font-size="9.5" fill="${K.muted}">${v}</text>`;
      });
      if(primary.p.idr>0) return renderResponseLoop(curves, primary, g, {X, Y, lo, hi, iw, ih});
      g+=`<line x1="${ECM.l}" y1="${Y(state.etgt)}" x2="${EW-ECM.r}" y2="${Y(state.etgt)}" stroke="${K.band}" stroke-width="1" stroke-dasharray="5 4" opacity="0.7"/>`;
      const p=primary.p, col=effColor(primary), top=p.e0+p.emax, ct=PK.concForEffect(p,state.etgt);
      g+=`<line x1="${ECM.l}" y1="${Y(top)}" x2="${EW-ECM.r}" y2="${Y(top)}" stroke="${col}" stroke-width="1" stroke-dasharray="2 4" opacity="0.6"/>`+
        `<text x="${EW-ECM.r-4}" y="${Y(top)+(top>90?12:-5)}" text-anchor="end" font-family="Inter" font-size="9" fill="${col}">Emax ${trim(top)}%</text>`+
        `<line x1="${X(p.ec50)}" y1="${Y(PK.effectOf(p,p.ec50))}" x2="${X(p.ec50)}" y2="${ECM.t+ih}" stroke="${col}" stroke-width="1" stroke-dasharray="3 3" opacity="0.7"/>`+
        `<text x="${X(p.ec50)+5}" y="${ECM.t+ih-6}" font-family="Inter" font-size="9" fill="${col}">EC50 ${trim(p.ec50)}</text>`;
      if(ct!==null && ct>0) g+=`<line x1="${X(ct)}" y1="${Y(state.etgt)}" x2="${X(ct)}" y2="${ECM.t+ih}" stroke="${K.band}" stroke-width="1" stroke-dasharray="1 3" opacity="0.8"/>`;
      // one curve per distinct concentration–effect relationship (A and B share one when only the PK differs)
      const seen=new Set();
      (ctx.mode==="cmp" ? [curves.find(cv=>cv.id!==ctx.cmp.edit), curves.find(cv=>cv.id===ctx.cmp.edit)] : curves.slice().reverse()).forEach(cv=>{
        const key=pdKey(cv.p);
        if(seen.has(key) && cv.ghost) return;
        seen.add(key);
        let d="";
        for(let i=0;i<=160;i++){ const u=lo+(hi-lo)*i/160; d+=(i?" L ":"M ")+`${X(10**u)} ${Y(PK.effectOf(cv.p,10**u))}`; }
        g+=cv.ghost ? `<path d="${d}" fill="none" stroke="${K.ghost}" stroke-width="1.6" stroke-dasharray="6 5" opacity="0.75"/>`
          : `<path d="${d}" fill="none" stroke="${effColor(cv)}" stroke-width="2.2"/>`;
      });
      // an effect-site delay: the effect against the plasma level over the window traces a loop around the curve
      // (hysteresis), with an arrowhead on the rising limb showing it runs counterclockwise
      const loops=curves.filter(cv=>cv.delay && !cv.ghost);
      loops.forEach(cv=>{
        const col=effColor(cv), P=cv.raw.map(q=>[X(q.c), Y(PK.effectOf(cv.p,q.ce))]);
        g+=`<path d="M ${P.map(xy=>xy.join(" ")).join(" L ")}" fill="none" stroke="${col}" stroke-width="1.4" opacity="0.85" stroke-linejoin="round"/>`;
        const iPk=cv.raw.reduce((m,q,i)=> q.c>cv.raw[m].c ? i : m, 0), i=Math.floor(iPk/2);
        if(iPk>=4 && cv.raw[i].c>0){
          const [x0,y0]=P[i-1], [x1,y1]=P[i+1], a=Math.atan2(y1-y0, x1-x0), [cx,cy]=P[i], r=6;
          const pt=d=>`${cx+r*Math.cos(a+d)} ${cy+r*Math.sin(a+d)}`;
          g+=`<polygon points="${pt(0)} ${pt(2.5)} ${pt(-2.5)}" fill="${col}"/>`;
        }
      });
      byId("ecSub").textContent=loops.length ? "Effect against plasma level on a log scale: a counterclockwise loop (delay)" : "Sigmoid Emax on a log scale; the dot follows the time cursor";
      ecEl.setAttribute("aria-label", loops.length ? "Concentration–effect curve on a log scale. With an effect-site delay, the effect plotted against the plasma level traces a counterclockwise loop around the curve: lower while the level rises, higher while it falls. A dot marks the time cursor."
        : "Concentration–effect curve: effect against concentration on a log scale, with a dot at the time cursor.");
      g+=`<text x="${ECM.l+iw/2}" y="${ECH-6}" text-anchor="middle" font-family="Inter" font-size="10.5" fill="${K.muted}">Concentration (${U().conc}, log scale)</text>`+
        `<text transform="translate(13 ${ECM.t+ih/2}) rotate(-90)" text-anchor="middle" font-family="Inter" font-size="10.5" fill="${K.muted}">Effect (%)</text>`+
        curves.map((cv,i)=>`<circle class="ecDot" data-i="${i}" r="5" fill="${effColor(cv)}" stroke="${K.surface}" stroke-width="2" style="display:none"/>`).join("");
      ecEl.innerHTML=g;
    }

    // An indirect response against the plasma level: the curve where it would settle if each level were held (the
    // plateau), and the path it takes over the window, a loop that runs behind the level.
    function renderResponseLoop(curves, primary, g, S){
      const {X, Y, lo, hi, iw, ih}=S, seen=new Set();
      g+=`<line x1="${ECM.l}" y1="${Y(100)}" x2="${EW-ECM.r}" y2="${Y(100)}" stroke="${K.text}" stroke-width="1" stroke-dasharray="5 4" opacity="0.6"/>`;
      curves.filter(cv=>cv.p.idr>0).forEach(cv=>{
        const key=PK.PD_KEYS.filter(k=>k!=="tout").map(k=>cv.p[k]).join(",");
        if(seen.has(key)) return; seen.add(key);
        let d=""; for(let i=0;i<=160;i++){ const u=lo+(hi-lo)*i/160, v=Math.min(PK.idr.plateau(cv.p,10**u), effTop); d+=(i?" L ":"M ")+`${X(10**u)} ${Y(v)}`; }
        g+=`<path d="${d}" fill="none" stroke="${effColor(cv)}" stroke-width="1.2" stroke-dasharray="2 4" opacity="${cv.ghost?0.5:0.8}"/>`;
      });
      curves.filter(cv=>cv.p.idr>0 && !cv.ghost).forEach(cv=>{
        const col=effColor(cv), P=cv.raw.filter(q=>q.c>0).map(q=>[X(q.c), Y(respOf(cv,q.t,q.ce))]);
        if(P.length>1) g+=`<path d="M ${P.map(xy=>xy.join(" ")).join(" L ")}" fill="none" stroke="${col}" stroke-width="2" opacity="0.9" stroke-linejoin="round"/>`;
      });
      byId("ecSub").textContent="Response against plasma level on a log scale; dotted, where it would settle at a steady level";
      ecEl.setAttribute("aria-label", "Response against plasma level on a log scale. The dotted curve is where the response would settle if each level were held; the solid path is the response over the window, which lags behind the level and loops around that curve. A dot marks the time cursor.");
      g+=`<text x="${ECM.l+iw/2}" y="${ECH-6}" text-anchor="middle" font-family="Inter" font-size="10.5" fill="${K.muted}">Concentration (${U().conc}, log scale)</text>`+
        `<text transform="translate(13 ${ECM.t+ih/2}) rotate(-90)" text-anchor="middle" font-family="Inter" font-size="10.5" fill="${K.muted}">Response (%)</text>`+
        curves.map((cv,i)=>`<circle class="ecDot" data-i="${i}" r="5" fill="${effColor(cv)}" stroke="${K.surface}" stroke-width="2" style="display:none"/>`).join("");
      ecEl.innerHTML=g;
    }

    // Peak effect, when it comes, when the target is first reached and for how long, over the whole window. With an
    // indirect response: its largest change from baseline, when that comes, and how long after the plasma peak.
    function renderPdStats(curves){
      const T=state.duration, tg=state.etgt, live=curves.filter(cv=>!cv.ghost);
      if(live.some(cv=>cv.p.idr>0)){
        const st=live.map(cv=> cv.p.idr>0 ? PK.idr.stats(cv.p,T) : null);
        const val=(f,dp)=> st.map(e=> e==null ? "—" : fmt(f(e),dp)).join(" / "), who=ctx.mode==="cmp" ? "A / B: " : "";
        byId("pdStats").innerHTML=[
          {k:`${who}Largest change`, hot:1, v:val(e=>e.change,0), u:"% pts"},
          {k:`${who}When`, v:val(e=>e.tExt,1), u:"h"},
          {k:`${who}Plasma peak`, v:val(e=>e.tCmax,1), u:"h"},
          {k:`${who}Lag behind it`, hot:1, v:val(e=>e.lag,1), u:"h"}
        ].map(c=>`<div class="ro${c.hot?" hot":""}"><div class="ro-k">${c.k}</div><div class="ro-v">${c.v}<small>${c.u}</small></div></div>`).join("");
        return;
      }
      const st=live.map(cv=>PK.effectStats(cv.p,T,tg));
      const val=(f,dp)=> st.map(e=>{ const v=f(e); return v==null ? "never" : fmt(v,dp); }).join(" / ");
      const who=ctx.mode==="cmp" ? "A / B: " : "";
      byId("pdStats").innerHTML=[
        {k:`${who}Peak effect`, hot:1, v:val(e=>e.peak,0), u:"%"},
        {k:`${who}Time of peak`, v:val(e=>e.tPeak,1), u:"h"},
        {k:`${who}Reaches ${tg}%`, v:val(e=>e.onset,1), u:st.every(e=>e.onset==null)?"":"h"},
        {k:`${who}At or above ${tg}%`, hot:1, v:val(e=>e.tAbove,1), u:"h"}
      ].map(c=>`<div class="ro${c.hot?" hot":""}"><div class="ro-k">${c.k}</div><div class="ro-v">${c.v}<small>${c.u}</small></div></div>`).join("");
    }

    function updatePdCursor(){
      if(!state.pd || !effY || !ecMap) return;
      const g=effEl.querySelector("#effCursor");
      if(!g) return;
      const [T0,T1]=ctx.viewT, show=ctx.cursorT!==null && ctx.cursorT>=T0-1e-9 && ctx.cursorT<=T1+1e-9;
      g.style.display=show ? "" : "none";
      ecEl.querySelectorAll(".ecDot").forEach(d=>{ d.style.display=show ? "" : "none"; });
      if(!show) return;
      const x=ctx.sx(ctx.cursorT);   // same width and side margins as the concentration chart
      g.querySelector("#effCurLine").setAttribute("x1",x); g.querySelector("#effCurLine").setAttribute("x2",x);
      g.querySelectorAll(".effDot").forEach(d=>{
        const cv=ctx.plotCurves[+d.dataset.i], e=respOf(cv, ctx.cursorT, PK.ceConc(cv.p,ctx.cursorT));
        d.setAttribute("cx",x); d.setAttribute("cy",effY(e));
      });
      // the dot sits at the plasma level and the effect: on the curve, or with a delay, on the loop
      ecEl.querySelectorAll(".ecDot").forEach(d=>{
        const cv=ctx.plotCurves[+d.dataset.i], c=conc(cv.p,ctx.cursorT);
        d.setAttribute("cx",ecMap.X(c)); d.setAttribute("cy",ecMap.Y(respOf(cv, ctx.cursorT, PK.ceConc(cv.p,ctx.cursorT))));
      });
    }
    return {renderPd, updatePdCursor};
  };
})(typeof self!=="undefined" ? self : this);
