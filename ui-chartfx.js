/* DoseCurve: the chart's motion (2.13)
   The concentration chart's living parts, loaded just after the first paint (the chart itself draws without them):
   the drug's particles flowing along the curve, the curve drawing itself the first time it comes into view and while
   Play runs, the doses' ticks pulsing as the play head crosses them, a dose's own curve or an interval lit from its
   tick or its row, and the plot plane tilting toward the pointer with its grid in parallax. None of it runs under
   reduced motion. The page calls DCChartFx(ctx) once; ctx gives live access to the chart (its element, size, scales,
   curves and state). Educational model, not for clinical dosing. */
(function(root){
  "use strict";
  root.DCChartFx=function(ctx){
    const plot=ctx.plot, fxEl=document.getElementById("plotFx"), fxCtx=fxEl && fxEl.getContext("2d");
    const N=72;
    let fx=null, raf=0, on=false, drawX=Infinity, drewOnce=false, drawRaf=0, drawing=false, pulseT=null;

    // The drug, flowing: small luminous points travel along the live curve, spaced evenly in its cumulative area, so
    // they crowd where the level is high and thin out where it is low: the model's own numbers, made visible.
    function set(cv, col, paper){
      if(!fxEl) return;
      if(!cv || ctx.noMotion() || ctx.state.scale==="log"){ fx=null; clear(); return; }
      const pts=cv.pts, cdf=[0];
      for(let i=1;i<pts.length;i++) cdf.push(cdf[i-1]+(pts[i].c+pts[i-1].c)/2*(pts[i].t-pts[i-1].t));
      const tot=cdf[cdf.length-1]; if(!(tot>0)){ fx=null; clear(); return; }
      const S=ctx.states(col, paper);
      fx={pts, cdf:cdf.map(v=>v/tot), paper, cols:[S.cool, paper ? col : S.lum, S.hot], mec:ctx.state.mec, mtc:ctx.state.mtc,
        phase:Array.from({length:N},(_,i)=> (i+ctx.rand(i+1)()*0.6)/N)};
      size(); kick();
    }
    function size(){
      if(!fxEl) return;
      const o=ctx.offset(), d=Math.min(2, devicePixelRatio||1);
      fxEl.style.left=o.x+"px"; fxEl.style.top=o.y+"px"; fxEl.style.width=plot.clientWidth+"px"; fxEl.style.height=plot.clientHeight+"px";
      const w=Math.round(plot.clientWidth*d), h=Math.round(plot.clientHeight*d);
      if(fxEl.width!==w || fxEl.height!==h){ fxEl.width=w; fxEl.height=h; }
    }
    function clear(){ if(fxCtx) fxCtx.clearRect(0,0,fxEl.width,fxEl.height); }
    function kick(){ if(fx && on && !document.hidden && !raf) raf=requestAnimationFrame(frame); }
    function frame(now){
      raf=0; if(!fx || !on || document.hidden){ clear(); return; }
      const k=fxEl.width/ctx.PW, c=fxCtx, P=fx.pts, F=fx.cdf, n=P.length;
      c.setTransform(1,0,0,1,0,0); c.clearRect(0,0,fxEl.width,fxEl.height); c.setTransform(k,0,0,k,0,0);
      c.globalCompositeOperation=fx.paper ? "source-over" : "lighter";
      const sp=now/1000/7.5;
      for(let i=0;i<N;i++){
        const s=(fx.phase[i]+sp)%1; let lo=0, hi=n-1; while(hi-lo>1){ const m=(lo+hi)>>1; if(F[m]<s) lo=m; else hi=m; }
        const u=(s-F[lo])/Math.max(1e-12,F[hi]-F[lo]), x=P[lo].x+(P[hi].x-P[lo].x)*u, y=P[lo].y+(P[hi].y-P[lo].y)*u, cc=P[lo].c+(P[hi].c-P[lo].c)*u;
        if(x>drawX) continue;
        const col=cc<fx.mec ? fx.cols[0] : cc>fx.mtc ? fx.cols[2] : fx.cols[1], fade=Math.min(1, s*12, (1-s)*12);
        if(fx.paper){ c.globalAlpha=0.45*fade; c.fillStyle=col; c.beginPath(); c.arc(x,y,1.3,0,7); c.fill(); }
        else { c.globalAlpha=0.22*fade; c.fillStyle=col; c.beginPath(); c.arc(x,y,4,0,7); c.fill(); c.globalAlpha=0.95*fade; c.fillStyle="#fff"; c.beginPath(); c.arc(x,y,1.1,0,7); c.fill(); }
      }
      c.globalAlpha=1; raf=requestAnimationFrame(frame);
    }
    if(fxEl && "IntersectionObserver" in window) new IntersectionObserver(es=>{ on=es[0].isIntersecting; if(on){ size(); kick(); drawOnce(); } else clear(); }).observe(plot);
    document.addEventListener("visibilitychange", kick);
    addEventListener("resize", ()=>{ if(fx) size(); });

    // The curve draws itself left to right with a glowing head: the first time the chart comes into view, and while
    // Play runs (up to the play head)
    function drawTo(x, head){
      const r=plot.querySelector("#drawRect"), h=plot.querySelector("#drawHead"), main=ctx.curves.find(cv=>!cv.ghost), PW=ctx.PW;
      if(!r) return;
      r.setAttribute("width", x>=PW ? PW : Math.max(0,x)); drawX=x>=PW ? Infinity : x;
      if(h){ if(head && main && x<PW-ctx.M.r){ const P=main.pts; let i=P.findIndex(q=>q.x>=x); if(i<0) i=P.length-1; h.setAttribute("cx",P[i].x); h.setAttribute("cy",P[i].y); h.style.display=""; } else h.style.display="none"; }
    }
    function drawOnce(){
      if(drewOnce || ctx.noMotion() || !ctx.curves.length) return; drewOnce=true;
      const t0=performance.now(), D=1300, a=ctx.M.l, b=ctx.PW-ctx.M.r;
      const step=now=>{ const u=Math.min(1,(now-t0)/D), e=1-Math.pow(1-u,3); drawTo(u<1 ? a+(b-a)*e : ctx.PW, u<1); if(u<1) drawRaf=requestAnimationFrame(step); else drawing=false; };
      drawing=true; drawTo(a, true); drawRaf=requestAnimationFrame(step);
    }
    // the doses' ticks pulse as the play head crosses them
    function pulse(t){
      if(t===null){ pulseT=null; return; }
      if(pulseT!==null && t>pulseT && !ctx.noMotion()) plot.querySelectorAll(".dtick").forEach(el=>{ const d=+el.dataset.t; if(d>pulseT && d<=t){ el.classList.remove("pulse"); void el.getBoundingClientRect(); el.classList.add("pulse"); } });
      pulseT=t;
    }
    // a dose's own curve lights when its tick or its row is pointed at; an interval lights for a dose row
    function lightDose(j){ plot.querySelectorAll(".dose-c").forEach(el=> el.classList.toggle("lit", +el.dataset.dose===j)); }
    function lightInterval(t0, t1){
      const r=plot.querySelector("#ivHi"); if(!r) return;
      if(t0===null){ r.style.display="none"; return; }
      const [T0,T1]=ctx.viewT, a=Math.max(T0,t0), b=Math.min(T1,t1); if(b<=a){ r.style.display="none"; return; }
      r.setAttribute("x", ctx.sx(a)); r.setAttribute("width", ctx.sx(b)-ctx.sx(a)); r.style.display="";
    }
    // The plot plane tilts two or three degrees toward the pointer and its grid moves in parallax, so the chart reads
    // as an object with depth (fine pointers only)
    const box=plot.parentElement, tilt={x:0,y:0,tx:0,ty:0}; let tiltRaf=0;
    function tiltStep(){ tiltRaf=0; tilt.x+=(tilt.tx-tilt.x)*0.12; tilt.y+=(tilt.ty-tilt.y)*0.12;
      box.style.setProperty("--rx", (-tilt.y*2.2).toFixed(3)+"deg"); box.style.setProperty("--ry", (tilt.x*2.8).toFixed(3)+"deg");
      box.style.setProperty("--gx", (-tilt.x*5).toFixed(2)+"px"); box.style.setProperty("--gy", (-tilt.y*4).toFixed(2)+"px");
      if(Math.abs(tilt.tx-tilt.x)>0.002 || Math.abs(tilt.ty-tilt.y)>0.002) tiltRaf=requestAnimationFrame(tiltStep); }
    if(matchMedia("(pointer:fine)").matches){
      box.addEventListener("pointermove", e=>{ if(ctx.noMotion()) return; const r=box.getBoundingClientRect(); tilt.tx=(e.clientX-r.left)/r.width-0.5; tilt.ty=(e.clientY-r.top)/r.height-0.5; if(!tiltRaf) tiltRaf=requestAnimationFrame(tiltStep); });
      box.addEventListener("pointerleave", ()=>{ tilt.tx=0; tilt.ty=0; if(!tiltRaf) tiltRaf=requestAnimationFrame(tiltStep); });
    }
    return {set, drawTo, pulse, lightDose, lightInterval, get drawing(){ return drawing; }};
  };
})(typeof self!=="undefined" ? self : this);
