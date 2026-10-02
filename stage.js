/* DoseCurve stage
   The hero object that travels through the site, and the root sequence above the app. The page imports this file
   after its first paint, calls start(PK) and then hands it, after every change, the curves its chart has just drawn:
   the stage draws them as a 3D ribbon, so the two can never disagree. The sequence's own scenes come from the same
   engine: the default scenario, a regimen, 200 virtual patients, a two-compartment drug, and the 146 scenarios the
   validation page checks against an independent solver.

   2.10: one world and one camera. Each scene spans two screens of scroll; the camera follows a path through its
   resting frames, scrubbed by the scroll with inertia, and the scenes' beats (the ribbon drawing, the window rising,
   a second dose stacking, patients condensing, the axis turning logarithmic, the checks lighting) are driven by the
   same scroll. A cold open (black, first light, the wordmark) plays before any scroll.

   With Effects on and WebGL it draws with Three.js, pinned in the page's import map (cdnjs, with hashes), in tiers:
   tier 2 (a capable desktop) renders physically based materials, frosted glass, a studio environment, a mirrored floor
   and its own post-processing (selective bloom, depth of field, chromatic aberration at the edges, ACES tone mapping
   and a per-scene grade); tier 1 (phones, modest machines) renders directly, with simpler materials and no passes.
   Otherwise it draws the CSS stage's path and each scene's frame in SVG. Under reduced motion everything is still.
   cdnjs has only Three.js's core builds, so every pass here is this file's own. Educational model, not for clinical
   dosing. */

const D=document.documentElement, $=id=>document.getElementById(id), NS="http://www.w3.org/2000/svg";
const phoneQ=matchMedia("(max-width:760px)"), stillQ=matchMedia("(prefers-reduced-motion: reduce)");
const REF_SRC="validation/reference-results.json?v=4a69dae91a";   // stamped by content hash, like the page's files
const clamp=(v,a,b)=> Math.min(b, Math.max(a, v)), lerp=(a,b,u)=> a+(b-a)*u, ease=u=> u<.5 ? 4*u*u*u : 1-Math.pow(-2*u+2,3)/2;
const smooth=u=>{ u=clamp(u,0,1); return u*u*(3-2*u); };
const band=(u,a,b)=> smooth((u-a)/(b-a));
const TOKENS="accent band mec mtc mic b ghost text muted line page surface".split(" ");
const tokensOf=el=>{ const s=getComputedStyle(el), k={}; TOKENS.forEach(n=> k[n]=s.getPropertyValue("--c-"+n).trim()); return k; };
// the cold open's clock: from the navigation, so it keeps time with the page's CSS (black, then light, then the wordmark)
const COLD_MS=4200;

// Three.js, for the stage and for the chart's own 3D mode (2.18): this file stays the only one that imports it
export const loadThree=()=> import("three");

export function start(PK){
  const fmt=(v,dp)=> v.toLocaleString(undefined,{minimumFractionDigits:dp, maximumFractionDigits:dp});
  const intro=$("intro"), scenes=[...document.querySelectorAll("#intro .scene")];
  let K=tokensOf(D), live=null, tab="sim", three=null, threeLoading=null;

  /* ---------- the engine's scenes ---------- */
  const S=o=> PK.normalizeScenario(PK.scenario(o)), V0=PK.VIEW_DEFAULTS;
  const sample=(p,T,n)=>{ const ev=PK.doseEvents(p), out=[]; for(let i=0;i<=n;i++){ const t=T*i/n; out.push({t, c:PK.conc(p,t,ev)}); } return out; };
  // computed only when the sequence is shown: a deep link or a return visit never pays for it
  const sc={};
  function normals(rand){ let spare=null; return ()=>{ if(spare!==null){ const s=spare; spare=null; return s; } let u=0; while(u<=1e-300) u=rand(); const v=rand(), r=Math.sqrt(-2*Math.log(u)); spare=r*Math.sin(2*Math.PI*v); return r*Math.cos(2*Math.PI*v); }; }
  function prepScenes(){
    if(sc.c1) return;
    // the default scenario and its three readouts
    sc.p1=S({}); sc.T1=V0.duration; sc.c1=sample(sc.p1, sc.T1, 240);
    { const d=PK.derived(sc.p1), w=PK.windowStats(sc.p1, sc.T1, V0.mec, V0.mtc);
      sc.final=[fmt(d.cmax,1), fmt(d.auc,1), fmt(100*w.tIn/sc.T1,0)]; sc.tmax1=d.tmax; }
    // the same drug every 8 hours, six doses, over 48 h; and the first dose alone, to show what each dose stacks on
    sc.p2=S({dosing:"repeated", tau:8, nDoses:6}); sc.T2=48; sc.c2=sample(sc.p2, sc.T2, 320); sc.d2=PK.doseSchedule(sc.p2).map(x=>x.t);
    sc.c2one=sample(S({}), sc.T2, 320);
    // 200 virtual patients as the app's population mode makes them (clearance CV 30%, volume CV 20%, seed 1), with
    // the median and the 5th–95th percentile band at each time
    { const p=sc.p1, z=normals(PK.seededRandom(1)), w=cv=> Math.sqrt(Math.log(1+cv*cv)), wCL=w(.3), wV=w(.2), n=80;
      sc.pop=[]; sc.popP=[]; for(let i=0;i<200;i++){ const eCL=wCL*z(), eV=wV*z(), q=Object.assign({}, p, {V:p.V*Math.exp(eV), thalf:p.thalf*Math.exp(eV-eCL)}); sc.popP.push(q); sc.pop.push(sample(q, 24, n)); }
      sc.med=[]; sc.lo=[]; sc.hi=[];
      for(let i=0;i<=n;i++){ const v=sc.pop.map(c=>c[i].c).sort((a,b)=>a-b), t=24*i/n;
        sc.med.push({t, c:(v[99]+v[100])/2}); sc.lo.push({t, c:v[10]}); sc.hi.push({t, c:v[189]}); } }
    // a two-compartment IV bolus: C = A·e^(−αt) + B·e^(−βt), the distribution and the elimination phase
    { const p=S({route:"iv", cmt:2, D:500, V:20, thalf:3, k12:0.9, k21:0.35}), d=PK.derived(p), C0=PK.conc(p,1e-9), a=d.alpha, b=d.beta;
      const A=C0*(a-p.k21)/(a-b), B=C0*(p.k21-b)/(a-b);
      sc.T4=24; sc.c4=sample(p, 24, 240); sc.pa=sc.c4.map(q=>({t:q.t, c:A*Math.exp(-a*q.t)})); sc.pb=sc.c4.map(q=>({t:q.t, c:B*Math.exp(-b*q.t)}));
      // the amounts in the two compartments (2.11's chambers): central A₁ = C·V₁, peripheral
      // A₂ = D·k₁₂·(e^(−βt) − e^(−αt)) / (α − β), from the same α and β
      sc.p4=p; sc.amt4=t=>({a1:PK.conc(p, Math.max(t,1e-9))*p.V, a2:p.D*p.k12*(Math.exp(-b*t)-Math.exp(-a*t))/(a-b)}); }
    // each patient's level at 4 hours (2.11's vials), and the median and the middle 90% there
    { const tv=4; sc.tv=tv; sc.lv=sc.popP.map(q=> PK.conc(q, tv));
      const order=sc.lv.map((c,j)=>j).sort((x,y)=> sc.lv[x]-sc.lv[y]); sc.rank=new Array(200); order.forEach((j,r)=> sc.rank[j]=r); }
    // An antimicrobial at steady state against an MIC: piperacillin 3 g every 6 hours as a 30-minute and as a 3-hour
    // infusion (the app's "Extended infusion" pair), MIC 16 mg/L, unbound fraction 0.7; the share of the interval with
    // the unbound level above the MIC, counted along it (it ends on micStats' own fT>MIC)
    { const base={route:"inf", dosing:"repeated", D:3000, thalf:0.84, V:15.1, tau:6, nDoses:8, fu:0.7};
      sc.mic=16; sc.T6=6; sc.p6=[0.5,3].map(tinf=> S(Object.assign({}, base, {tinf})));
      sc.ms6=sc.p6.map(p=> PK.micStats(p, sc.mic, 24));
      sc.c6=sc.p6.map(p=> Array.from({length:361},(_,i)=>{ const t=sc.T6*i/360; return {t, c:PK.ssConc(p, Math.min(t, sc.T6-1e-9))}; }));
      sc.ab6=sc.c6.map((cv,k)=>{ const thr=sc.ms6[k].thr, out=[0];
        for(let i=1;i<cv.length;i++){ const a=cv[i-1], b=cv[i], dt=b.t-a.t;
          out.push(out[i-1]+(a.c>=thr && b.c>=thr ? dt : a.c<thr && b.c<thr ? 0 : dt*(Math.max(a.c,b.c)-thr)/Math.abs(b.c-a.c))); }
        const k2=sc.ms6[k].ft/100*sc.T6/out[out.length-1]; return out.map(v=> v*k2); }); }
  }
  // A two-compartment drug through a hemodialysis session (the rebound lesson's patient): pk-hd.js, loaded for it
  const HD_SRC="pk-hd.js?v=adbb8a2d82";   // stamped by content hash, like the page's files
  const HD_T0=4;   // the scene shows the course from 4 hours, after the bolus's first fall
  let hdPrep=null;
  function prepHd(){
    if(hdPrep) return hdPrep;
    const ok=()=>{ const p=S({route:"iv", dosing:"single", D:1000, V:20, thalf:6, cmt:2, k12:0.8, k21:0.4, hd:1, hdcl:8, hdstart:6, hddur:4, hdevery:48});
      sc.p7=p; sc.T7=24; sc.c7=sample(p, 24, 288); sc.row7=PK.hd.sessionTable(p, 24)[0]; sc.kd7=p.hdcl;
      sc.rm7=t=> PK.hd.stateAt(p, t).removed; };
    return hdPrep=(PK.hdModule ? Promise.resolve() : new Promise((res,rej)=>{ const e=document.createElement("script"); e.src=HD_SRC;
      e.onload=()=> PK.hdModule ? res() : rej(new Error("hd")); e.onerror=()=> rej(new Error("hd")); document.head.appendChild(e); }))
      .then(ok).catch(()=>{ hdPrep=null; });
  }
  // the validation checks, filled as the engine's values are compared with the independent solver's
  sc.checks=[]; sc.nChecks=584;
  let checking=null;
  function runChecks(){
    if(checking) return checking;
    return checking=fetch(REF_SRC).then(r=> r.ok ? r.json() : Promise.reject(new Error("ref"))).then(async REF=>{
      const {T,mec,mtc}=REF.window, pct=(a,b)=> b===0 ? (a===0 ? 0 : Infinity) : 100*(a/b-1);
      sc.nChecks=4*REF.scenarios.length;
      for(let i=0;i<REF.scenarios.length;i++){
        if(i && i%6===0){ await new Promise(r=>setTimeout(r)); paintFrame(8); if(three) three.light6(); }
        const s=REF.scenarios[i], p=S(s.scenario), w=PK.windowStats(p,T,mec,mtc,s.site), level=s.site==="effect" ? PK.ceConc : PK.conc, r=s.reference;
        const tol=100*(s.nonlinear ? REF.tolerance.nonlinear : REF.tolerance.linear), tpp=s.nonlinear ? REF.tolerance.tin_pp_nonlinear : REF.tolerance.tin_pp_linear;
        const trough=level(p,(p.dosing==="repeated" ? p.nDoses*p.tau : T)-1e-9);
        sc.checks.push(Math.abs(pct(w.cmax,r.peak))<=tol, Math.abs(pct(trough,r.trough))<=tol, Math.abs(pct(w.auc,r.auc))<=tol, Math.abs(100*w.tIn/T-r.tin_pct)<=tpp);
      }
      paintFrame(8); if(three) three.light6();
    }).catch(()=>{ checking=null; });
  }
  // the points of the check sphere: one per check, spread evenly (a Fibonacci lattice)
  const sphere=n=> Array.from({length:n},(_,i)=>{ const y=1-2*(i+.5)/n, r=Math.sqrt(1-y*y), th=i*Math.PI*(3-Math.sqrt(5)); return [r*Math.cos(th), y, r*Math.sin(th)]; });

  /* ---------- the CSS stage and the scenes' frames (SVG) ---------- */
  const svgEl=(tag,a)=>{ const e=document.createElementNS(NS,tag); for(const k in a) e.setAttribute(k,a[k]); return e; };
  function cssPath(){
    const svg=$("stageSvg"); if(!svg || !live) return;
    const cv=live.curves.find(c=>!c.ghost); if(!cv) return;
    const [T0,T1]=live.T, top=Math.max(live.mtc, ...cv.pts.map(q=>q.c))*1.08 || 1;
    const d=cv.pts.filter((q,i)=>i%2===0).map((q,i)=>(i?"L":"M")+(1000*(q.t-T0)/(T1-T0)).toFixed(1)+" "+(410-400*q.c/top).toFixed(1)).join("");
    svg.querySelectorAll("path").forEach(p=> p.setAttribute("d", d));
  }
  // a frame: a 600 × 340 box with a time axis; y is linear or log
  function frame(svg, T, top, k, opt={}){
    svg.textContent="";
    const m={l:24, r:24, t:16, b:30}, W=600, H=340, iw=W-m.l-m.r, ih=H-m.t-m.b, lo=opt.log ? Math.log10(opt.floor) : 0, hi=opt.log ? Math.log10(top) : top;
    const x=t=> m.l+t/T*iw, y=c=> m.t+ih-((opt.log ? Math.log10(Math.max(c,opt.floor)) : c)-lo)/(hi-lo)*ih;
    const g={x, y, m, iw, ih, add:(tag,a)=> svg.appendChild(svgEl(tag,a)), path:(pts,a)=> svg.appendChild(svgEl("path", Object.assign({d:pts.map((q,i)=>(i?"L":"M")+x(q.t).toFixed(1)+" "+y(q.c).toFixed(1)).join(""), fill:"none"}, a)))};
    if(!opt.bare){ g.add("line",{x1:m.l, x2:W-m.r, y1:m.t+ih, y2:m.t+ih, stroke:k.line});
      for(let i=0;i<=4;i++){ const t=T*i/4; g.add("text",{x:x(t), y:H-8, "text-anchor":"middle", "font-family":"Inter", "font-size":12, fill:k.muted}).textContent=(+(t+(opt.t0||0)).toFixed(1))+(i===4 ? " h" : ""); } }
    return g;
  }
  const win=(g,k,mec,mtc)=>{ g.add("rect",{x:g.m.l, y:g.y(mtc), width:g.iw, height:g.y(mec)-g.y(mtc), fill:k.band, "fill-opacity":.1});
    [[mtc,k.mtc],[mec,k.mec]].forEach(([c,col])=> g.add("line",{x1:g.m.l, x2:g.m.l+g.iw, y1:g.y(c), y2:g.y(c), stroke:col, "stroke-dasharray":"5 4", "stroke-width":1.2})); };
  const vis=n=> scenes[n-1] && scenes[n-1].querySelector(".scene-vis svg");
  let drawU=1;
  function paintFrame(n){
    const svg=vis(n); if(!svg) return;
    const k=tokensOf(scenes[n-1]), dark=scenes[n-1].dataset.tone==="dark" && !D.classList.contains("light"), c=dark ? k.accent : k.text;
    if(n===1 || n===2 || n===9){
      if(!svg.firstChild){ const g=frame(svg, sc.T1, 14, k, {bare:n!==1}); if(n===1) win(g,k,V0.mec,V0.mtc);
        if(n===1){ svg.appendChild(svgEl("clipPath",{id:"s1clip"})).appendChild(svgEl("rect",{id:"s1wipe", x:0, y:0, width:600, height:340})); }
        const a={stroke:c, "stroke-width":n===2 ? 3 : 2.6, "stroke-linejoin":"round"}; if(n===1) a["clip-path"]="url(#s1clip)"; g.path(sc.c1,a); }
      if(n===1){ const w=$("s1wipe"); if(w) w.setAttribute("width", 24+drawU*552+4); }
      return;
    }
    if(svg.firstChild && n!==8) return;
    if(n===3){ const top=Math.max(...sc.c2.map(q=>q.c))*1.12, g=frame(svg, sc.T2, top, k); win(g,k,V0.mec,Math.min(V0.mtc,top*.98));
      g.path(sc.c2,{stroke:c, "stroke-width":2.4, "stroke-linejoin":"round"});
      sc.d2.forEach(t=>[6,11].forEach((r,j)=> g.add("circle",{cx:g.x(t), cy:g.m.t+g.ih, r, fill:"none", stroke:c, "stroke-opacity":j ? .35 : .9}))); }
    if(n===4){ const g=frame(svg, 24, 16, k); win(g,k,V0.mec,V0.mtc);
      sc.pop.forEach(cv=> g.path(cv,{stroke:c, "stroke-opacity":.12, "stroke-width":1})); g.path(sc.med,{stroke:c, "stroke-width":2.6});
      g.add("line",{x1:g.x(sc.tv), x2:g.x(sc.tv), y1:g.m.t, y2:g.m.t+g.ih, stroke:k.muted, "stroke-dasharray":"2 4"}); }
    if(n===5){ const g=frame(svg, sc.T4, sc.c4[0].c*1.5, k, {log:true, floor:sc.c4[sc.c4.length-1].c*0.5});
      g.path(sc.pa,{stroke:k.mic, "stroke-width":1.8, "stroke-dasharray":"6 5"}); g.path(sc.pb,{stroke:k.band, "stroke-width":1.8, "stroke-dasharray":"6 5"});
      g.path(sc.c4,{stroke:c, "stroke-width":2.6});
      [["distribution, α", sc.pa, k.mic, 18],["elimination, β", sc.pb, k.band, 150]].forEach(([lb,pts,col,i])=>
        g.add("text",{x:g.x(pts[i].t)+8, y:g.y(pts[i].c)-8, "font-family":"Inter", "font-size":13, fill:col}).textContent=lb); }
    if(n===6){   // the steady-state interval, both infusions; the time the 3-hour infusion's unbound level is above the MIC, shaded
      const top=Math.max(...sc.c6[0].map(q=>q.c))*1.08, g=frame(svg, sc.T6, top, k), thr=sc.ms6[0].thr, cv=sc.c6[1];
      cv.forEach((q,i)=>{ if(i && q.c>=thr) g.add("rect",{x:g.x(cv[i-1].t), y:g.y(q.c), width:Math.max(.6,g.x(q.t)-g.x(cv[i-1].t)), height:Math.max(0,g.y(thr)-g.y(q.c)), fill:k.mic, "fill-opacity":.16}); });
      g.add("line",{x1:g.m.l, x2:g.m.l+g.iw, y1:g.y(thr), y2:g.y(thr), stroke:k.mic, "stroke-dasharray":"5 4", "stroke-width":1.2});
      g.path(sc.c6[0],{stroke:k.ghost, "stroke-width":1.6, "stroke-dasharray":"4 4"}); g.path(cv,{stroke:c, "stroke-width":2.6, "stroke-linejoin":"round"});
      g.add("text",{x:g.x(sc.T6)-4, y:g.y(thr)-8, "text-anchor":"end", "font-family":"Inter", "font-size":13, fill:k.mic}).textContent="MIC (unbound)"; }
    if(n===7){   // the session's hours shaded, the rebound ringed (pk-hd.js, loaded for it)
      if(!sc.c7){ prepHd().then(()=>{ if(sc.c7) paintFrame(7); }); return; }
      const g=frame(svg, sc.T7-HD_T0, 14, k, {t0:HD_T0}), r=sc.row7, at=t=> t-HD_T0, cv=sc.c7.filter(q=> q.t>=HD_T0).map(q=>({t:at(q.t), c:q.c}));
      g.add("rect",{x:g.x(at(r.start)), y:g.m.t, width:g.x(at(r.end))-g.x(at(r.start)), height:g.ih, fill:k.band, "fill-opacity":.1});
      g.add("text",{x:g.x(at(r.start))+8, y:g.m.t+16, "font-family":"Inter", "font-size":13, fill:k.band}).textContent="dialysis";
      g.path(cv,{stroke:c, "stroke-width":2.6, "stroke-linejoin":"round"});
      const tr=at(r.end+r.rebound.after);
      g.add("line",{x1:g.x(tr), x2:g.x(tr), y1:g.y(r.post), y2:g.y(r.rebound.level), stroke:k.mtc, "stroke-dasharray":"3 3"});
      g.add("circle",{cx:g.x(tr), cy:g.y(r.rebound.level), r:7, fill:"none", stroke:k.mtc, "stroke-width":1.6});
      g.add("text",{x:g.x(tr)+12, y:g.y(r.rebound.level)-10, "font-family":"Inter", "font-size":13, fill:k.mtc}).textContent="rebound"; }
    if(n===8){
      if(!svg.firstChild) sphere(sc.nChecks).forEach(([x,y,z],i)=>{ if(z<-0.05) return; const e=svgEl("circle",{cx:300+150*x, cy:170-150*y, r:1.4+1.4*z}); e.dataset.i=i; svg.appendChild(e); });
      for(const el of svg.children){ const i=+el.dataset.i; el.setAttribute("fill", i<sc.checks.length ? (sc.checks[i] ? k.band : k.mtc) : k.line); }
    }
  }
  const paintFrames=()=>{ for(let n=1;n<=9;n++) paintFrame(n); };

  /* ---------- where the visitor is in the sequence ---------- */
  // P: the scroll position in screens from the sequence's top. Each scene spans two screens: its frame is pinned for
  // the first (u from 0 to 1, its beats) and slides away during the second while the next arrives.
  const SCREEN=()=> innerHeight;
  function where(at){
    if(!D.classList.contains("intro-on") || !scenes.length) return {g:-1, P:-1, inIntro:false};
    const y=scrollY+(at===undefined ? innerHeight/2 : at), top0=intro.offsetTop, P=(scrollY-top0)/SCREEN();
    for(let i=0;i<scenes.length;i++){ const s=scenes[i], top=s.offsetTop+top0, h=s.offsetHeight;
      if(y<top+h) return {g:i+clamp((y-top)/h,0,1), P, inIntro:y>=top0, scene:s}; }
    return {g:scenes.length, P, inIntro:false};
  }
  const toneAt=w=> D.classList.contains("light") || (w && w.inIntro ? w.scene && w.scene.dataset.tone==="light" : D.classList.contains("ed-app")) ? "light" : "dark";
  const toneOfScene=i=> D.classList.contains("light") || (scenes[i] && scenes[i].dataset.tone==="light") ? "light" : "dark";
  // The virtual scroll (2.15): one value eased toward the real scroll each frame (lerp 0.1) and shared by the camera,
  // the objects and the headlines. A scene's text crossfades in as its frame arrives and out as it leaves: classes the
  // stylesheet turns into 0.8 s transitions of opacity and transform alone (cubic-bezier(0.22, 1, 0.36, 1)); the
  // hero's readouts land one by one. Native scrolling is left alone, so a trackpad's momentum carries as usual.
  let vP=null, vTarget=0, vRaf=0;
  function vStep(){
    vRaf=0;
    if(vP===null || stillQ.matches) vP=vTarget; else vP+=(vTarget-vP)*0.1;
    if(Math.abs(vTarget-vP)<2e-4) vP=vTarget;
    sceneState(vP); if(three) three.setP(vP);
    if(vP!==vTarget) vRaf=requestAnimationFrame(vStep);
  }
  const sceneOn=[], scenePast=[];
  function sceneState(P){
    const still=stillQ.matches;
    scenes.forEach((s,i)=>{
      const u=P-2*i, on=still || (i===0 ? u<1.0 : u>-0.32 && u<1.0), past=!on && u>=1.0;
      if(sceneOn[i]!==on){ sceneOn[i]=on; s.classList.toggle("on", on); }
      if(scenePast[i]!==past){ scenePast[i]=past; s.classList.toggle("past", past); }
      if(i===0) s.classList.toggle("ro", still || u>0.58);
    });
    if(P>0.04) D.classList.add("cued");
  }
  let drawn1=false;
  // scene 1's frame draws itself once, in time with the cold open (or at once under reduced motion); in 3D the stage
  // draws its own ribbon on the same clock
  function countUp(){
    if(drawn1) return; drawn1=true; prepScenes();
    const ro=["heroCmax","heroAuc","heroTin"].map($); ro.forEach((el,j)=>{ if(el) el.textContent=sc.final[j]; });
    const at=u=>{ drawU=u; paintFrame(1); };
    D.classList.remove("hero-anim");
    if(stillQ.matches){ at(1); return; }
    const step=()=>{ const u=coldDraw(); at(u); if(u<1) requestAnimationFrame(step); };
    step();
  }
  // the cold open's curves: the light rises from 0.6 s, the ribbon draws from 0.7 s, both done by about 2.6 s
  const coldOn=()=> D.classList.contains("cold");
  const coldT=()=> performance.now();
  // timed from when the stage can show it (at least 0.6 s in), so the light and the draw always play in full
  let readyAt=0;
  const coldStart=()=> Math.max(600, readyAt+120);
  const coldLight=()=> stillQ.matches || !D.classList.contains("intro-on") ? 1 : coldOn() || coldT()<COLD_MS ? smooth((coldT()-coldStart())/1500) : 1;
  // (eased in, so the first hours, when the capsule dissolves at ka, take a visible share of it)
  const coldDraw=()=> stillQ.matches || !D.classList.contains("intro-on") ? 1 : coldOn() || coldT()<COLD_MS ? Math.pow(smooth((coldT()-coldStart()-100)/Math.max(900, Math.min(2500, COLD_MS-coldStart()-400))), 1.6) : 1;
  // gentle snap: when the scrolling stops close to a resting frame (within a tenth of a screen), settle on it; never
  // during a scene change, never under reduced motion. (CSS proximity snapping, with frames this close together,
  // behaved as mandatory and fought slow scrolling.)
  let snapTimer=0, snapping=false;
  function snapLater(){
    clearTimeout(snapTimer);
    if(!D.classList.contains("intro-on") || snapping) return;
    snapTimer=setTimeout(()=>{
      const w=where();
      if(!w.inIntro || w.P<0) return;
      if(stillQ.matches) return;
      const i=Math.floor(w.P/2), u=w.P-2*i; if(u>1.04) return;
      let best=null; (i===0 ? [0,.5,.82] : [.18,.5,.82]).forEach(r=>{ if(Math.abs(u-r)<.1 && (best===null || Math.abs(u-r)<Math.abs(u-best))) best=r; });
      if(best===null || Math.abs(u-best)<.006) return;
      snapping=true; scrollTo({top:intro.offsetTop+(2*i+best)*innerHeight, behavior:"smooth"}); setTimeout(()=>{ snapping=false; }, 700);
    }, 320);   // (after a trackpad's momentum has run out)
  }
  let lastIn=null, lastTop=null;
  function onScroll(){
    const w=where(), top=toneAt(where(30));
    if(w.inIntro!==lastIn){ lastIn=w.inIntro; D.classList.toggle("in-intro", w.inIntro); setPill(); }
    if(top!==lastTop){ lastTop=top; D.classList.toggle("tone-light", top==="light" && !D.classList.contains("light")); }
    if(D.classList.contains("intro-on") && w.P>=-1){ D.classList.add("seq-js"); vTarget=w.P; if(!vRaf) vRaf=requestAnimationFrame(vStep); }
    if(w.inIntro && w.g>=6) runChecks();
    if(w.inIntro && w.g>=5) prepHd();   // the dialysis course (pk-hd.js), a scene ahead
    if(three) three.scroll(w);
  }

  /* ---------- the pill: the screen's main action ---------- */
  const pill=$("pill");
  const ACTIONS={
    sim:()=> ({label:$("pinBtn").textContent, el:$("pinBtn")}),
    cmp:()=> ({label:"Swap A and B", el:$("swapAB")}),
    ls:()=> ({label:"Start a lesson", el:document.querySelector(".ls-card:not(.done)")||document.querySelector(".ls-card")}),
    cs:()=>{ const b=document.querySelector("#csForm button[type=submit]"); return b && b.offsetParent ? {label:b.textContent, el:b} : {label:"Open a case", el:document.querySelector(".cs-card")}; },
    pr:()=> $("prVerdict") && $("prVerdict").textContent ? {label:"Next problem", el:$("prNext")} : {label:"Check the answer", el:$("prCheck")},
    lesson:()=> ({label:$("lsNext").textContent, el:$("lsNext")}),
    fit:()=> ({label:"New data set", el:$("fitNew")}),
    win:()=> ({label:"New drug", el:$("winNew")})
  };
  let action=null;
  function setPill(){
    if(!pill) return;
    if(D.classList.contains("in-intro")){ action=null; pill.textContent="Open the simulator"; return; }
    action=(ACTIONS[tab]||ACTIONS.sim)();
    pill.textContent=action && action.el ? action.label : "Open the simulator";
  }

  /* ---------- the 3D stage ---------- */
  const can3d=()=> !D.classList.contains("fx-off") && !D.classList.contains("embed") && !!window.WebGLRenderingContext;
  // tier 2: a capable desktop with WebGL2 (the full passes); tier 1: everything else that has WebGL
  function tierOf(){
    let forced=null; try{ forced=localStorage.getItem("dosecurve.fxtier"); }catch(e){}
    if(forced==="1" || forced==="2") return +forced;
    const n=navigator, gl2=!!window.WebGL2RenderingContext;
    // (a software renderer is ruled out once the renderer exists, from its own context: see build)
    return !phoneQ.matches && gl2 && (n.hardwareConcurrency||4)>=6 && !(n.deviceMemory<8) ? 2 : 1;
  }
  function load3d(){
    if(three || threeLoading || !can3d()) return threeLoading;
    return threeLoading=loadThree().then(async THREE=>{ if(!can3d()){ threeLoading=null; return; } const t=build(THREE, tierOf()); t.setLive(); await t.ready(); threeLoading=null;
        if(!can3d()){ t.dispose(); return; } three=t; readyAt=performance.now(); D.classList.add("stage3d"); onScroll(); three.frame(true); })
      .catch(()=>{ threeLoading=null; D.classList.remove("stage3d"); });
  }
  function build(THREE, tier){
    const host3d=document.createElement("div"); host3d.className="stage-3d"; host3d.setAttribute("aria-hidden","true");
    const canvas=document.createElement("canvas"); host3d.appendChild(canvas);
    const renderer=new THREE.WebGLRenderer({canvas, antialias:tier!==2, alpha:true, powerPreference:"high-performance"});
    // a software renderer (no GPU) draws every pixel on the processor: never the full passes there
    let soft=false;
    try{ const g=renderer.getContext(), x=g.getExtension("WEBGL_debug_renderer_info"); soft=!!(x && /swiftshader|llvmpipe|software|softpipe|basic render/i.test(g.getParameter(x.UNMASKED_RENDERER_WEBGL))); }catch(e){}
    const full=tier===2 && !soft;
    document.body.appendChild(host3d);
    renderer.setClearColor(0x000000, 0);
    renderer.localClippingEnabled=true;   // the glass figure's liquid is cut at its level
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    // tier 1 maps tones as it draws; tier 2 draws linear light into its own targets and maps it in the composite
    renderer.toneMapping=full ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    const scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera(34, 1, 0.1, 400);
    const col=c=> new THREE.Color(c);
    const BLOOM=1;   // the layer that glows: emissive cores, the draw head, dust, the lit checks
    let tone="dark", P=K;   // the palette of the section the object is in
    const lightTone=()=> tone==="light";
    const XW=12, YH=4, X=(t,T)=> -XW/2+XW*t/T;
    const groups={};
    const disposeGroup=g=>{ if(!g) return; g.traverse(o=>{ if(o.geometry) o.geometry.dispose(); if(o.material) [].concat(o.material).forEach(m=>{ if(!m.userData.shared) m.dispose(); }); }); if(g.parent) g.parent.remove(g); };
    const GRAPHITE="#2C313A", BRONZE="#8C6A44";
    const APPX=168;   // the app's own place in the world: the sequence flies there and the simulator is simply there

    /* lights and a studio environment (PMREM), one per tone */
    const key=new THREE.DirectionalLight(0xfff1df, 2.4); key.position.set(-6, 10, 8);
    const rim=new THREE.DirectionalLight(0x8fc4ff, 1.5); rim.position.set(7, 4, -9);
    const fill=new THREE.HemisphereLight(0xd6deff, 0x07090e, 0.45);
    scene.add(key, key.target, rim, rim.target, fill);
    const LIGHT_DIR=new THREE.Vector3().subVectors(new THREE.Vector3(0,0,0), key.position).normalize();
    const pmrem=new THREE.PMREMGenerator(renderer);
    const envs={};
    function envOf(t){
      if(!full) return null;
      if(envs[t]) return envs[t];
      const es=new THREE.Scene(), lit=t==="light";
      es.add(new THREE.Mesh(new THREE.BoxGeometry(30,30,30), new THREE.MeshBasicMaterial({side:THREE.BackSide, color:col(lit ? "#c9ced6" : "#04060b")})));
      const panel=(w,h,c,i,x,y,z)=>{ const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h), new THREE.MeshBasicMaterial({color:col(c).multiplyScalar(i), side:THREE.DoubleSide})); m.position.set(x,y,z); m.lookAt(0,0,0); es.add(m); };
      panel(10,5,"#fff0dc", lit ? 2.6 : 5, -7,9,7);    // the key's softbox, warm
      panel(2.4,12,"#86bcff", lit ? 1.1 : 3.4, 9,3,-8);  // a cool strip behind, for the rim
      panel(14,2.5,"#ffffff", lit ? 1.2 : .5, 0,-8,5);   // a bounce from below
      panel(6,3,"#ffb36b", lit ? .5 : 1.4, 10,6,9);      // the warm accent
      envs[t]=pmrem.fromScene(es, 0.04).texture;
      es.traverse(o=>{ if(o.geometry) o.geometry.dispose(); if(o.material) o.material.dispose(); });
      return envs[t];
    }

    /* materials: shared per tone, so a tone change swaps them without recompiling */
    const mats={};
    function matsOf(t){
      if(mats[t]) return mats[t];
      const lit=t==="light", K2=lit ? tokensOf(document.querySelector(".scene.ed")||D) : K, M={};
      const mark=m=>{ m.userData.shared=true; return m; };
      M.core=mark(lit ? (full ? new THREE.MeshPhysicalMaterial({color:col(GRAPHITE), metalness:.8, roughness:.3, clearcoat:1, clearcoatRoughness:.14, envMapIntensity:1.15, side:THREE.DoubleSide})
                              : new THREE.MeshStandardMaterial({color:col(GRAPHITE), metalness:.6, roughness:.38, envMapIntensity:1, side:THREE.DoubleSide}))
        : new THREE.MeshStandardMaterial({color:col("#0b1418"), emissive:col(K2.accent), emissiveIntensity:full ? 2.1 : 1.6, metalness:.2, roughness:.32, side:THREE.DoubleSide}));
      M.coreB=mark(lit ? new THREE.MeshStandardMaterial({color:col(K2.b), metalness:.35, roughness:.35, side:THREE.DoubleSide})
        : new THREE.MeshStandardMaterial({color:col("#120d14"), emissive:col(K2.b), emissiveIntensity:full ? 2.2 : 1.4, roughness:.35, side:THREE.DoubleSide}));
      M.bronze=mark(full ? new THREE.MeshPhysicalMaterial({color:col(BRONZE), metalness:.9, roughness:.28, clearcoat:.7, clearcoatRoughness:.2, side:THREE.DoubleSide})
                         : new THREE.MeshStandardMaterial({color:col(BRONZE), metalness:.7, roughness:.35, side:THREE.DoubleSide}));
      M.ghost=mark(new THREE.MeshBasicMaterial({color:col(K2.ghost), transparent:true, opacity:.45, side:THREE.DoubleSide, depthWrite:false}));
      M.halo=mark(new THREE.MeshBasicMaterial({color:col(K2.accent), transparent:true, opacity:lit ? 0 : .11, side:THREE.DoubleSide, depthWrite:false, blending:THREE.AdditiveBlending}));
      M.trail=mark(new THREE.MeshBasicMaterial({color:col(K2.accent), transparent:true, opacity:lit ? 0 : .05, side:THREE.DoubleSide, depthWrite:false, blending:THREE.AdditiveBlending}));
      M.curtain=mark(new THREE.MeshBasicMaterial({color:col(lit ? GRAPHITE : K2.accent), transparent:true, opacity:lit ? .045 : .05, side:THREE.DoubleSide, depthWrite:false}));
      // the therapeutic window: frosted glass with transmission (tier 2), or a quiet translucent plate
      M.glass=mark(full ? new THREE.MeshPhysicalMaterial({color:col(K2.band), transmission:1, roughness:.42, thickness:.4, ior:1.42, metalness:0,
          clearcoat:.5, clearcoatRoughness:.25, attenuationColor:col(K2.band), attenuationDistance:4, transparent:true, opacity:lit ? .16 : .22, depthWrite:false, envMapIntensity:.7})
        : new THREE.MeshStandardMaterial({color:col(K2.band), transparent:true, opacity:lit ? .07 : .09, roughness:.4, depthWrite:false}));
      M.mec=mark(new THREE.LineDashedMaterial({color:col(K2.mec), dashSize:.22, gapSize:.16, transparent:true, opacity:.9}));
      M.mtc=mark(new THREE.LineDashedMaterial({color:col(K2.mtc), dashSize:.22, gapSize:.16, transparent:true, opacity:.9}));
      M.ring=mark(new THREE.MeshBasicMaterial({color:col(lit ? GRAPHITE : K2.accent), transparent:true, opacity:.95, side:THREE.DoubleSide, depthWrite:false}));
      // 2.11's objects: clear glass (a figure, vials, chambers, dishes, a cartridge, the instrument's globe), frosted with
      // transmission in tier 2 and a clear sheen otherwise; brass; graphite caps; hairline rings
      M.vessel=mark(full ? new THREE.MeshPhysicalMaterial({color:col(lit ? "#f7f8fa" : "#e4edf6"), transmission:1, roughness:lit ? .17 : .2, thickness:.3, ior:1.45,
          clearcoat:1, clearcoatRoughness:.08, metalness:0, envMapIntensity:lit ? 1.1 : 1.5, transparent:true, depthWrite:false, side:THREE.DoubleSide})
        : new THREE.MeshStandardMaterial({color:col(lit ? "#cfd5dd" : "#9fb6cc"), transparent:true, opacity:lit ? .26 : .17, roughness:.14, metalness:.1, depthWrite:false, side:THREE.DoubleSide}));
      // the vials: 200 of them overlap, so their glass is a clear sheen without transmission (transmission there cost
      // 50 ms frames)
      M.vial=mark(full ? new THREE.MeshPhysicalMaterial({color:col(lit ? "#e9edf2" : "#b9cde0"), transparent:true, opacity:lit ? .34 : .24, roughness:.06, metalness:0,
          clearcoat:1, clearcoatRoughness:.05, envMapIntensity:lit ? 1.4 : 1.8, depthWrite:false, side:THREE.DoubleSide})
        : new THREE.MeshStandardMaterial({color:col(lit ? "#cfd5dd" : "#9fb6cc"), transparent:true, opacity:lit ? .3 : .2, roughness:.12, metalness:.1, depthWrite:false, side:THREE.DoubleSide}));
      M.brass=mark(full ? new THREE.MeshPhysicalMaterial({color:col("#B08A52"), metalness:1, roughness:.26, clearcoat:.6, clearcoatRoughness:.18, envMapIntensity:1.3})
                        : new THREE.MeshStandardMaterial({color:col("#B08A52"), metalness:.75, roughness:.32}));
      M.cap=mark(new THREE.MeshStandardMaterial({color:col(lit ? "#3a404a" : "#1d222b"), metalness:.7, roughness:.3}));
      M.hairMec=mark(new THREE.MeshBasicMaterial({color:col(K2.mec), transparent:true, opacity:.85}));
      M.hairMtc=mark(new THREE.MeshBasicMaterial({color:col(K2.mtc), transparent:true, opacity:.85}));
      M.hairMic=mark(new THREE.LineDashedMaterial({color:col(K2.mic), dashSize:.22, gapSize:.16, transparent:true, opacity:.95}));
      M.sheetMic=mark(new THREE.MeshBasicMaterial({color:col(K2.mic), transparent:true, opacity:lit ? .05 : .07, side:THREE.DoubleSide, depthWrite:false}));
      M.sheetBand=mark(new THREE.MeshBasicMaterial({color:col(K2.band), transparent:true, opacity:lit ? .07 : .06, side:THREE.DoubleSide, depthWrite:false}));
      M.K=K2;
      return mats[t]=M;
    }

    /* the ribbon: a swept mesh with thickness and bevelled edges, its profile a rounded rectangle across the curve */
    const PROF=(()=>{ const hw=.17, ht=.052, r=.044, seg=3, out=[];
      [[ht-r, hw-r, 0],[-(ht-r), hw-r, Math.PI/2],[-(ht-r), -(hw-r), Math.PI],[ht-r, -(hw-r), 1.5*Math.PI]].forEach(([cn,cz,a0])=>{
        for(let s=0;s<=seg;s++){ const a=a0+(Math.PI/2)*s/seg, nn=Math.cos(a), nz=Math.sin(a); out.push([cn+r*nn, cz+r*nz, nn, nz]); } });
      return out; })();
    const NP=PROF.length;
    function sweep(xs, ys, z, scale=1, zs=null){
      const N=xs.length, pos=new Float32Array(N*NP*3), nor=new Float32Array(N*NP*3), idx=new Uint32Array((N-1)*NP*6);
      let k=0;
      for(let i=0;i<N-1;i++) for(let j=0;j<NP;j++){ const a=i*NP+j, b=i*NP+(j+1)%NP, c=(i+1)*NP+j, d=(i+1)*NP+(j+1)%NP; idx.set([a,c,b, b,c,d], k); k+=6; }
      const geo=new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos,3)); geo.setAttribute("normal", new THREE.BufferAttribute(nor,3)); geo.setIndex(new THREE.BufferAttribute(idx,1));
      geo.userData={xs:Float32Array.from(xs), z, scale, zs:zs && Float32Array.from(zs)};
      writeSweep(geo, ys); return geo;
    }
    function writeSweep(geo, ys){
      const {xs, z, scale, zs}=geo.userData, N=xs.length, pos=geo.attributes.position.array, nor=geo.attributes.normal.array;
      for(let i=0;i<N;i++){
        const i0=Math.max(0,i-1), i1=Math.min(N-1,i+1); let tx=xs[i1]-xs[i0], ty=ys[i1]-ys[i0]; const l=Math.hypot(tx,ty)||1; tx/=l; ty/=l;
        const nx=-ty, ny=tx;
        for(let j=0;j<NP;j++){ const [pn,pz,cn,cz]=PROF[j], o=(i*NP+j)*3;
          pos[o]=xs[i]+nx*pn*scale; pos[o+1]=ys[i]+ny*pn*scale; pos[o+2]=(zs ? zs[i] : z)+pz*scale; nor[o]=nx*cn; nor[o+1]=ny*cn; nor[o+2]=cz; }
      }
      geo.attributes.position.needsUpdate=true; geo.attributes.normal.needsUpdate=true; geo.computeBoundingSphere();
    }
    // a flat strip (the glow trails and the curtain)
    function strip(xs, ys, w, z, toFloor){
      const n=xs.length, pos=new Float32Array(n*6), idx=[];
      for(let i=0;i<n;i++){ if(toFloor) pos.set([xs[i],ys[i],z, xs[i],0,z], i*6); else pos.set([xs[i],ys[i],z-w/2, xs[i],ys[i],z+w/2], i*6); if(i) idx.push(2*i-2,2*i-1,2*i, 2*i-1,2*i+1,2*i); }
      const geo=new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos,3)); geo.setIndex(idx); geo.userData={xs:Float32Array.from(xs), z, toFloor, w};
      return geo;
    }
    function writeStrip(geo, ys){ const a=geo.attributes.position.array, {toFloor}=geo.userData;
      for(let i=0;i<ys.length;i++){ a[i*6+1]=ys[i]; if(!toFloor) a[i*6+4]=ys[i]; } geo.attributes.position.needsUpdate=true; geo.computeBoundingSphere(); }
    // a ribbon of points {t, c}: the solid in both tones (one shown at a time), the dark tone's glow, a faint curtain
    function ribbon(pts, T, top, o={}){
      const g=new THREE.Group(), n=pts.length;
      const yOf=c=> o.log ? YH*(Math.log10(Math.max(c,o.floor))-Math.log10(o.floor))/(Math.log10(top)-Math.log10(o.floor)) : YH*c/top;
      const xs=pts.map(q=>X(q.t,T)), ys=pts.map(q=>yOf(q.c)), z=o.z||0;
      const geo=sweep(xs, ys, z, o.thin ? .55 : 1);
      const meshD=new THREE.Mesh(geo, o.ghost ? matsOf("dark").ghost : o.b ? matsOf("dark").coreB : matsOf("dark").core);
      const meshL=new THREE.Mesh(geo, o.ghost ? matsOf("light").ghost : o.b ? matsOf("light").coreB : o.bronze ? matsOf("light").bronze : matsOf("light").core);
      meshD.name="dark"; meshL.name="light"; if(!o.ghost) meshD.layers.enable(BLOOM);
      g.add(meshD, meshL);
      const extras=[];
      if(!o.ghost && !o.noGlow){ const h=new THREE.Mesh(strip(xs, ys, 1.05, z-.02), matsOf("dark").halo), tr=new THREE.Mesh(strip(xs, ys, 2.1, z-.05), matsOf("dark").trail);
        h.name="dark"; tr.name="dark"; h.layers.enable(BLOOM); g.add(h, tr); extras.push(h, tr); }
      if(!o.ghost && o.curtain!==false){ const cm=new THREE.Mesh(strip(xs, ys, 0, z-.17, true), matsOf("dark").curtain); cm.name="curtain"; g.add(cm); extras.push(cm); }
      const per=NP*6;
      g.userData={T, xs, ys:Float32Array.from(ys), z, n, yOf,
        setDraw:u=>{ const k=Math.max(0, Math.round((n-1)*clamp(u,0,1))); geo.setDrawRange(0, k*per); extras.forEach(m=> m.geometry.setDrawRange(0, k*6)); },
        writeY:ys2=>{ writeSweep(geo, ys2); extras.forEach(m=> writeStrip(m.geometry, ys2)); g.userData.ys.set(ys2); },
        tone:t=>{ meshD.visible=t!=="light"; meshL.visible=t==="light"; extras.forEach(m=>{ m.visible=m.name==="curtain" || t!=="light"; });
          const cm=g.children.find(m=>m.name==="curtain"); if(cm) cm.material=matsOf(t).curtain; }};
      g.userData.tone(tone);
      return g;
    }
    // the draw head: a point of light at the end of a ribbon while it draws
    function head(){
      const geo=new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3),3));
      const m=new THREE.ShaderMaterial({uniforms:{uColor:{value:col(K.accent)}, uSize:{value:full ? 900 : 600}, uA:{value:1}}, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, premultipliedAlpha:true,
        vertexShader:"uniform float uSize; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv; gl_PointSize=uSize/-mv.z; }",
        fragmentShader:"uniform vec3 uColor; uniform float uA; void main(){ vec2 c=gl_PointCoord-.5; float r=length(c)*2.; float a=(exp(-r*r*7.)*1.4+exp(-r*r*40.)*2.)*uA; if(a<.004) discard; gl_FragColor=vec4(uColor*a, min(a,1.)); }"});
      const pt=new THREE.Points(geo, m); pt.layers.enable(BLOOM); pt.frustumCulled=false; pt.name="head";
      pt.userData.place=(x,y,z,a)=>{ geo.attributes.position.setXYZ(0,x,y,z); geo.attributes.position.needsUpdate=true; m.uniforms.uA.value=a; pt.visible=a>.01; };
      return pt;
    }
    // the time cursor on the ribbon: a point on the curve, a line down to the floor, a ring where it meets it
    function cursorMark(){
      const g=new THREE.Group(); g.visible=false;
      const dot=new THREE.Mesh(new THREE.SphereGeometry(.11,24,16), new THREE.MeshBasicMaterial({color:col(lightTone() ? GRAPHITE : P.text)}));
      const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,1,0)]), new THREE.LineBasicMaterial({color:col(P.muted), transparent:true, opacity:.8}));
      const ring=new THREE.Mesh(new THREE.RingGeometry(.13,.19,36), new THREE.MeshBasicMaterial({color:col(lightTone() ? GRAPHITE : P.text), transparent:true, opacity:.6, side:THREE.DoubleSide, depthWrite:false}));
      ring.rotation.x=-Math.PI/2; ring.position.y=.012; dot.name="dot"; line.name="line"; g.add(dot, line, ring);
      return g;
    }
    // the virtual patients, as the population mode makes them (the same sampler and seed): up to 150 drawn
    let popKey="", popPos=null;
    function popCloud(p, T0, T, top){
      const o=live.pop, key=[PK.encodeScenario(p), o.n, o.cvCL, o.cvV, o.seed, T0, T, top].join("|");
      if(key!==popKey){
        const n=Math.min(150, Math.max(50, Math.round(o.n))), z=normals(PK.seededRandom(o.seed>>>0)), w=cv=> Math.sqrt(Math.log(1+cv*cv/1e4)), wCL=w(o.cvCL), wV=w(o.cvV), N=80, ev=PK.doseEvents(p);
        popPos=new Float32Array(n*N*6);
        for(let j=0;j<n;j++){ const eCL=wCL*z(), eV=wV*z(), q=Object.assign({}, p, {V:p.V*Math.exp(eV), thalf:p.thalf*Math.exp(eV-eCL)}), zz=(j%15-7)*.04; let px=0, py=0;
          for(let i=0;i<=N;i++){ const t=T*i/N, x=X(t,T), yy=YH*Math.min(PK.conc(q, T0+t, ev), top*1.25)/top; if(i) popPos.set([px,py,zz, x,yy,zz], (j*N+i-1)*6); px=x; py=yy; } }
        popKey=key;
      }
      const geo=new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(popPos,3));
      return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({color:col(lightTone() ? GRAPHITE : P.accent), transparent:true, opacity:lightTone() ? .1 : .13,
        blending:lightTone() ? THREE.NormalBlending : THREE.AdditiveBlending, depthWrite:false}));
    }
    // the therapeutic window: a frosted glass plate between MEC and MTC, with dashed edges; it can rise from the floor
    function windowPlate(top, mec, mtc, z=-0.75){
      const g=new THREE.Group(), y=c=> YH*Math.min(c,top)/top, h=Math.max(.001, y(mtc)-y(mec));
      const plate=new THREE.Mesh(new THREE.BoxGeometry(XW, 1, .08), matsOf(tone).glass); plate.name="plate"; g.add(plate);
      const edge=(c,m)=>{ const l=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-XW/2,0,z+.05), new THREE.Vector3(XW/2,0,z+.05)]), m); l.computeLineDistances(); return l; };
      const lo=edge(mec, matsOf(tone).mec), hi=edge(mtc, matsOf(tone).mtc); lo.name="lo"; hi.name="hi"; g.add(lo, hi);
      g.userData={rise:k=>{ k=Math.max(.001,k); plate.scale.y=h*k; plate.position.set(0, y(mec)+h*k/2, z); lo.position.y=y(mec); hi.position.y=y(mec)+h*k; hi.visible=lo.visible=k>.02; },
        tone:t=>{ plate.material=matsOf(t).glass; lo.material=matsOf(t).mec; hi.material=matsOf(t).mtc; }};
      if(mtc<=mec || mec>top){ g.visible=false; }
      g.userData.rise(1);
      return g;
    }
    function rings(times, T){
      const g=new THREE.Group();
      const own=t=>{ const m=matsOf(t).ring.clone(); m.userData.shared=false; return m; };
      times.forEach(t=>{ if(t<0 || t>T) return; const r=new THREE.Mesh(new THREE.RingGeometry(.1,.16,40), own(tone));
        r.rotation.x=-Math.PI/2; r.position.set(X(t,T), .012, 0); r.userData.t=t; g.add(r); });
      g.userData.tone=t=>{ g.children.forEach(r=>{ const o=r.material.opacity; r.material.dispose(); r.material=own(t); r.material.opacity=o; }); };
      return g;
    }

    /* the floor: a shader plane under the whole world with a faint grid that recedes into the fog and, in tier 2, a
       blurred mirror reflection of everything above it */
    const fogU={color:{value:col(K.page)}, density:{value:.022}};
    const reflTex={value:null}, reflMat={value:new THREE.Matrix4()};
    const floorMat=new THREE.ShaderMaterial({transparent:true, depthWrite:false, premultipliedAlpha:true,
      uniforms:{tRefl:reflTex, uTexMat:reflMat, uHas:{value:0}, uAmt:{value:.42}, uGrid:{value:col(K.line)}, uGridA:{value:.32}, uTint:{value:col(K.page)}, fogColor:fogU.color, fogDensity:fogU.density},
      vertexShader:`uniform mat4 uTexMat; varying vec4 vR; varying vec3 vW; varying float vD;
        void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; vR=uTexMat*w; vec4 mv=viewMatrix*w; vD=-mv.z; gl_Position=projectionMatrix*mv; }`,
      fragmentShader:`uniform sampler2D tRefl; uniform float uHas, uAmt, uGridA; uniform vec3 uGrid, uTint, fogColor; uniform float fogDensity; varying vec4 vR; varying vec3 vW; varying float vD;
        void main(){
          float fog=1.-exp(-fogDensity*fogDensity*vD*vD);
          vec2 g=abs(fract(vW.xz-.5)-.5)/fwidth(vW.xz); float line=1.-min(min(g.x,g.y),1.);
          float ga=line*uGridA*(1.-fog);
          vec3 c=uGrid; float a=ga;
          vec3 pm=c*a;
          if(uHas>.5){ vec4 r=texture2DProj(tRefl, vR); float k=uAmt*(1.-fog)*(1.-smoothstep(6.,42.,vD)); vec3 rc=min(r.rgb, vec3(1.2))*k; pm+=rc; a=clamp(a+max(r.a*k, max(rc.r,max(rc.g,rc.b))),0.,1.); }
          gl_FragColor=vec4(min(pm, vec3(a)), a);
        }`});
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(270, 60), floorMat); floor.rotation.x=-Math.PI/2; floor.position.set(82, 0, -6); floor.renderOrder=-1;
    scene.add(floor);

    /* dust: slow motes through the whole world, brighter where they catch the key light */
    const dustMat=new THREE.ShaderMaterial({transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, premultipliedAlpha:true,
      uniforms:{uTime:{value:0}, uScale:{value:full ? 120 : 90}, uColor:{value:col("#ffe7c8")}, uL:{value:LIGHT_DIR}, uA:{value:1}},
      vertexShader:`attribute float aSeed; uniform float uTime, uScale; uniform vec3 uL; varying float vA;
        void main(){ vec3 p=position; p.x+=sin(uTime*.05+aSeed*6.283)*.7; p.y+=sin(uTime*.071+aSeed*12.1)*.4; p.z+=cos(uTime*.043+aSeed*9.3)*.6;
          vec4 w=modelMatrix*vec4(p,1.), mv=viewMatrix*w; gl_Position=projectionMatrix*mv; float d=-mv.z;
          gl_PointSize=uScale*(.35+aSeed)/max(d,.5); vec3 v=normalize(w.xyz-cameraPosition); float sc=pow(max(dot(v,uL),0.),5.);
          vA=(.16+1.5*sc)*(1.-smoothstep(6.,48.,d))*smoothstep(.6,2.5,d); }`,
      fragmentShader:`uniform vec3 uColor; uniform float uA; varying float vA; void main(){ vec2 c=gl_PointCoord-.5; float r=dot(c,c); if(r>.25) discard; float a=(1.-smoothstep(0.,.25,r))*vA*uA*.55; gl_FragColor=vec4(uColor*a,a); }`});
    const dust=(()=>{ const n=full ? 1200 : 340, pos=new Float32Array(n*3), seed=new Float32Array(n), R=PK.seededRandom(7);
      for(let i=0;i<n;i++){ pos.set([-20+215*R(), .2+8*R(), -14+24*R()], i*3); seed[i]=R(); }
      const geo=new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos,3)); geo.setAttribute("aSeed", new THREE.BufferAttribute(seed,1));
      const pts=new THREE.Points(geo, dustMat); pts.frustumCulled=false; pts.layers.enable(BLOOM); scene.add(pts); return pts; })();

    /* light shafts in dark scenes: a few soft additive planes along the key light */
    const shaftMat=new THREE.ShaderMaterial({transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, premultipliedAlpha:true, side:THREE.DoubleSide,
      uniforms:{uA:{value:.0}, uTime:{value:0}, uColor:{value:col("#ffe3c0")}},
      vertexShader:"varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }",
      fragmentShader:`uniform float uA, uTime; uniform vec3 uColor; varying vec2 vUv;
        void main(){ float x=clamp(abs(vUv.x-.5)*2.,0.,1.); float a=pow(max(1.-x,0.),2.2)*smoothstep(0.,.25,vUv.y)*pow(max(vUv.y,0.),.6)*(1.-smoothstep(.55,1.,vUv.y))*uA*(.85+.15*sin(uTime*.3+vUv.y*3.));
          gl_FragColor=vec4(uColor*a,0.); }`});   // light only: the composite gives it alpha by its brightness
    const shafts=new THREE.Group(); scene.add(shafts);
    [[-3.5,0],[ -1.2,.6],[21,0],[25,.4],[93,0],[97.5,.5],[141,0],[145.5,.5]].forEach(([x,o])=>{
      const m=new THREE.Mesh(new THREE.PlaneGeometry(1.6+o, 22), shaftMat); m.position.set(x+2, 5.5, -4.5-o*3);
      m.rotation.z=Math.atan2(-LIGHT_DIR.x, -LIGHT_DIR.y)*-1; m.rotation.y=.35; shafts.add(m); });

    /* the live scenario: what the chart shows, at the app's place. The same curves with new numbers ease into their
       new shape; a new set of curves (a baseline, Compare, another theme) is built afresh */
    let liveKey="", pulseAt=0, morph=null, curT=null;
    function setLive(){
      if(!live) return;
      const [T0,T1]=live.T, T=T1-T0, cvs=live.curves, phone=phoneQ.matches;
      const top=Math.max(live.mtc, ...cvs.map(cv=> Math.max(...cv.pts.map(q=>q.c))))*1.1 || 1;
      const sets=cvs.map(cv=> cv.pts.filter((q,i)=> i%2===0).map(q=>({t:q.t-T0, c:q.c})));
      const sig=[cvs.map((cv,i)=>(cv.ghost ? "g" : "")+(cv.id||"")+sets[i].length).join(","), T, phone].join("|");
      let g=groups.live;
      if(!g || g.userData.sig!==sig){
        disposeGroup(g); g=groups.live=new THREE.Group(); g.position.x=APPX; scene.add(g); g.userData.sig=sig; morph=null;
        g.userData.ribbons=cvs.map((cv,i)=>{ const r=ribbon(sets[i], T, top, {ghost:cv.ghost, b:cv.id==="b", z:cv.id==="b" ? 1.1 : cv.ghost ? -0.35 : 0, curtain:!phone && !cv.ghost}); g.add(r); return r; });
        const deco=new THREE.Group(); deco.name="deco"; g.add(deco);
        const cm=cursorMark(); cm.name="cur"; g.add(cm);
      } else {
        const tg=sets.map(pts=> Float32Array.from(pts, q=> YH*q.c/top));
        if(stillQ.matches) g.userData.ribbons.forEach((r,i)=> r.userData.writeY(tg[i])); else morph=tg;
        // the camera drifts toward the part of the curve that changed most, then settles back (2.14)
        const r0=g.userData.ribbons[cvs.findIndex(cv=>!cv.ghost)];
        if(r0 && !stillQ.matches){ const ys=r0.userData.ys, t0=tg[cvs.findIndex(cv=>!cv.ghost)]; let bi=0, bd=0; for(let k=0;k<ys.length;k++){ const d=Math.abs(t0[k]-ys[k]); if(d>bd){ bd=d; bi=k; } }
          if(bd>0.05){ drift.x=clamp(r0.userData.xs[bi]*0.32, -2.4, 2.4); drift.y=clamp((t0[bi]-ys[bi])*0.25, -0.8, 0.8); drift.t0=performance.now(); } }
      }
      // the glass figure beside the ribbon (desktop): its level the concentration at the time cursor, else at the peak
      if(!phone){ let fg=g.getObjectByName("lfig");
        const lv={mec:live.mec, mtc:live.mtc, top}, key=[live.mec, live.mtc, top.toFixed(4)].join();
        if(!fg || fg.userData.key!==key){ if(fg) disposeGroup(fg); fg=figure(lv); fg.name="lfig"; fg.userData.key=key; fg.position.set(XW/2+3.4, 0, -2.6); fg.scale.setScalar(.82); g.add(fg); fg.traverse(o=>{ if(o.userData && o.userData.tone) o.userData.tone(tone); }); }
        placeFigure(); }
      g.userData.T=T;
      // the window, the doses and the population follow at once (they are cheap to redraw)
      const deco=g.getObjectByName("deco"); deco.children.slice().forEach(disposeGroup);
      const lead=cvs.find(cv=>!cv.ghost);
      if(!phone){
        const wp=windowPlate(top, live.mec, live.mtc); wp.name="win"; deco.add(wp);
        const sched=lead && lead.p && lead.p.dosing!=="single" ? PK.doseSchedule(lead.p).filter(d=>!d.missed).map(d=>d.t-T0) : [];
        const r=rings(sched, T); r.name="rings"; deco.add(r);
        const keyNow=sched.join(","); if(keyNow!==liveKey){ liveKey=keyNow; if(sched.length && !stillQ.matches) pulseAt=performance.now(); }
        if(live.pop && lead && lead.p && lead.p.kin!=="mm") deco.add(popCloud(lead.p, T0, T, top));
      }
      placeCursor(); setVis(); frame();
    }
    function placeFigure(){
      const g=groups.live, fg=g && g.getObjectByName("lfig"), lead=live && live.curves.find(cv=>!cv.ghost); if(!fg || !lead) return;
      const P=lead.pts, t=curT===null ? null : curT;
      let c=0; if(t!==null && t>=P[0].t && t<=P[P.length-1].t){ let i=P.findIndex(q=>q.t>=t); if(i<=0) c=P[0].c; else { const a=P[i-1], b=P[i], u=(t-a.t)/Math.max(1e-9,b.t-a.t); c=a.c+(b.c-a.c)*u; } }
      else c=Math.max(...P.map(q=>q.c));
      fg.userData.set(c, 0);
    }
    const drift={x:0, y:0, cx:0, cy:0, t0:0};
    function placeCursor(){
      const g=groups.live, m=g && g.getObjectByName("cur"); if(!m) return;
      const i0=live.curves.findIndex(cv=>!cv.ghost), r=g.userData.ribbons[i0], T=g.userData.T, t=curT===null ? -1 : curT-live.T[0];
      if(!r || t<0 || t>T){ m.visible=false; return; }
      const ys=r.userData.ys, f=t/T*(ys.length-1), i=Math.min(ys.length-2, Math.floor(f)), u=f-i, y=ys[i]*(1-u)+ys[i+1]*u;
      m.visible=true; m.position.set(X(t,T), 0, r.userData.z); m.getObjectByName("dot").position.y=y; m.getObjectByName("line").scale.y=Math.max(.001, y);
    }

    /* 2.11: the objects in the scenes, all procedural (no model files). Every motion they make is the engine's: a
       capsule's remaining amount e^(−ka·t), a level C(t), the amounts in two compartments, each patient's level, the
       time above an MIC, the dialyzer's removal CLd·C(t). */
    const toned=(m, role)=>{ m.material=matsOf(tone)[role]; m.userData.tone=t=>{ m.material=matsOf(t)[role]; }; return m; };
    const lathe=(pts, seg)=> new THREE.LatheGeometry(new THREE.SplineCurve(pts.map(([x,y])=> new THREE.Vector2(x,y))).getPoints(Math.max(24, pts.length*6)), seg);
    const SEG=full ? 64 : 36;
    // a luminous liquid, its own material (it may carry a clipping plane): lit from inside in the dark, a clear tint on paper
    function liquidMat(pick){
      const m=new THREE.MeshStandardMaterial({roughness:.28, metalness:0, side:THREE.DoubleSide});
      m.userData.paint=t=>{ const c=col((pick||(k=>k.accent))(matsOf(t).K));
        if(t==="light"){ m.color.copy(c); m.emissive.copy(c).multiplyScalar(.3); m.emissiveIntensity=1; } else { m.color.set("#06141b"); m.emissive.copy(c); m.emissiveIntensity=full ? 1.6 : 1.25; } };
      m.userData.paint(tone); return m; }
    const liquidMesh=(geo, m)=>{ const x=new THREE.Mesh(geo, m); x.layers.enable(BLOOM); x.userData.tone=t=> m.userData.paint(t); return x; };
    // the luminous surface of a liquid: a disc a little brighter than the liquid
    function surfaceDisc(pick){
      const m=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}), d=new THREE.Mesh(new THREE.CircleGeometry(1, SEG), m); d.rotation.x=-Math.PI/2; d.layers.enable(BLOOM);
      d.userData.tone=t=>{ const c=col((pick||(k=>k.accent))(matsOf(t).K)); if(t==="light") m.color.copy(c).lerp(col("#ffffff"), .35); else m.color.copy(c).multiplyScalar(full ? 2.4 : 1.6); };
      d.userData.tone(tone); return d; }

    // a capsule: two gelatin halves, lying on its side; it dissolves (dithered away) as the amount left in it falls
    function capsule(len=.62, r=.15){
      const g=new THREE.Group(), body=new THREE.Mesh(new THREE.CapsuleGeometry(r, len-2*r, 8, 24)), cap=new THREE.Mesh(new THREE.CapsuleGeometry(r*1.07, (len-2*r)*.46, 8, 24));
      const mk=()=> full ? new THREE.MeshPhysicalMaterial({roughness:.3, clearcoat:1, clearcoatRoughness:.12, sheen:.4, alphaHash:true}) : new THREE.MeshStandardMaterial({roughness:.34, alphaHash:true});
      body.material=mk(); cap.material=mk(); cap.position.y=len*.2; g.add(body, cap); g.rotation.z=Math.PI/2;
      const paint=t=>{ body.material.color.set("#EEE6D6"); cap.material.color.set(matsOf(t).K.accent); };
      body.userData.tone=paint; paint(tone);
      g.userData.set=rem=>{ const a=clamp(rem,0,1); body.material.opacity=cap.material.opacity=a; const k=.55+.45*Math.cbrt(a); g.scale.set(k,k,k); g.visible=a>.008; };
      return g;
    }
    // the absorbed drug: particles leave the capsule at times that follow ka (−ln(1 − F) / ka for evenly spread F) and
    // land on the ribbon at the time each reaches the blood, so they draw it
    function absorption(from, pts, T, top, ka, n){
      const pos=new Float32Array(n*3), to=new Float32Array(n*3), tb=new Float32Array(n), sd=new Float32Array(n), R=PK.seededRandom(5), N=pts.length-1;
      for(let i=0;i<n;i++){ const F=(i+R())/n*.985, t=-Math.log(1-F)/ka, f=clamp(t/T,0,1)*N, j=Math.min(N-1,Math.floor(f)), u=f-j, c=pts[j].c*(1-u)+pts[j+1].c*u;
        tb[i]=t; sd[i]=R(); pos.set([from.x+(R()-.5)*.36, from.y+(R()-.5)*.12, from.z+(R()-.5)*.12], i*3); to.set([X(t,T), YH*c/top, (R()-.5)*.14], i*3); }
      const geo=new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos,3));
      [["aTo",to,3],["aTb",tb,1],["aSd",sd,1]].forEach(([k,a,s])=> geo.setAttribute(k, new THREE.BufferAttribute(a,s)));
      const m=new THREE.ShaderMaterial({transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, premultipliedAlpha:true,
        uniforms:{uT:{value:0}, uFly:{value:1.1}, uColor:{value:col(K.accent)}, uScale:{value:full ? 60 : 44}},
        vertexShader:`attribute vec3 aTo; attribute float aTb, aSd; uniform float uT, uFly, uScale; varying float vA;
          void main(){ float s=clamp((uT-aTb)/uFly,0.,1.), e=s*s*(3.-2.*s); vec3 p=mix(position, aTo, e); p.y+=sin(3.14159*s)*(.3+.5*aSd); p.z+=sin(6.2832*s)*.22*(aSd-.5);
            vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; gl_PointSize=min(uScale*(.5+aSd)/max(-mv.z,.5), 28.); vA=step(.0001,s)*(1.-smoothstep(.78,1.,s)); }`,
        fragmentShader:`uniform vec3 uColor; varying float vA; void main(){ vec2 c=gl_PointCoord-.5; float r=dot(c,c); if(r>.25 || vA<.003) discard; float a=(1.-smoothstep(0.,.25,r))*vA; gl_FragColor=vec4(uColor*a*1.6,a); }`});
      const p=new THREE.Points(geo, m); p.frustumCulled=false; p.layers.enable(BLOOM);
      p.userData.tone=t=>{ m.uniforms.uColor.value.set(t==="light" ? GRAPHITE : K.accent); m.blending=t==="light" ? THREE.NormalBlending : THREE.AdditiveBlending; m.needsUpdate=true; };
      return p;
    }

    // a glass figure, the body as one compartment: its liquid stands at the concentration, C(t), between hairline rings
    // at the window's edges (MEC and MTC), with the dose's capsule dissolving inside
    const FIG=[[0,0],[.72,0],[.84,.06],[.92,.3],[1.02,.78],[.98,1.15],[.82,1.6],[.74,1.9],[.84,2.3],[1.06,2.7],[1.26,3.02],[1.3,3.2],[1.18,3.36],[.66,3.5],[.3,3.6],
      [.25,3.7],[.25,3.96],[.38,4.08],[.48,4.3],[.5,4.56],[.46,4.82],[.34,5.02],[.16,5.15],[0,5.18]];
    const FIG_Y=c=> .14+3.25*Math.min(c,14)/14;   // a level, as a height inside the figure (14 mg/L at the shoulders)
    function figure(lv){
      lv=lv || {mec:V0.mec, mtc:V0.mtc, top:14};
      const sc14=c=> 14*c/lv.top;   // the figure's scale: 14 mg/L (or the scenario's top) at the shoulders
      const g=new THREE.Group(), outer=new THREE.SplineCurve(FIG.map(([x,y])=> new THREE.Vector2(x,y))).getPoints(120);
      g.add(toned(new THREE.Mesh(new THREE.LatheGeometry(outer, SEG)), "vessel"));
      const inner=[new THREE.Vector2(0,.1)].concat(outer.filter(v=> v.y>.12 && v.y<3.52).map(v=> new THREE.Vector2(Math.max(.02, v.x*.9-.03), v.y)));
      const rAt=y=>{ for(let i=1;i<inner.length;i++) if(inner[i].y>=y){ const a=inner[i-1], b=inner[i], u=(y-a.y)/Math.max(1e-6,b.y-a.y); return a.x+(b.x-a.x)*u; } return inner[inner.length-1].x; };
      const lm=liquidMat(), plane=new THREE.Plane(new THREE.Vector3(0,-1,0), 0); lm.clippingPlanes=[plane];
      const liq=liquidMesh(new THREE.LatheGeometry(inner, SEG), lm); g.add(liq);
      const surf=surfaceDisc(); g.add(surf);
      [[lv.mec,"hairMec"],[lv.mtc,"hairMtc"]].forEach(([c,role])=>{ if(!(c>0) || c>lv.top) return; const y=FIG_Y(sc14(c)), r=rAt(y)/.9+.06, ring=new THREE.Mesh(new THREE.TorusGeometry(r, .011, 6, SEG)); ring.rotation.x=Math.PI/2; ring.position.y=y; g.add(toned(ring, role)); });
      const cp=capsule(.5,.12); cp.position.set(0, 1.42, 0); g.add(cp);
      g.userData={rAt, set:(c, rem)=>{ const y=FIG_Y(sc14(c)); plane.constant=y+g.position.y; surf.position.y=y; const r=rAt(y); surf.scale.set(r,r,r); surf.visible=c>.02; cp.userData.set(rem); }};
      return g;
    }

    // 200 glass vials, one per virtual patient, each filled to that patient's level; sorted, they stand in order, the
    // middle 90% (the band) and the middle two (the median) lit
    function vials(){
      const g=new THREE.Group(), N=200, seg=full ? 20 : 12;
      const glass=new THREE.InstancedMesh(lathe([[0,0],[.1,0],[.118,.02],[.122,.07],[.122,.72],[.104,.79],[.074,.83],[.074,.9]], seg), matsOf(tone).vial, N);
      glass.userData.tone=t=>{ glass.material=matsOf(t).vial; };
      // the liquid's colour is each vial's own (instance colours); the dark tone adds a faint glow
      const lm=new THREE.MeshStandardMaterial({roughness:.3, metalness:0}), liq=new THREE.InstancedMesh(new THREE.CylinderGeometry(.104,.104,1,seg).translate(0,.5,0), lm, N);
      liq.userData.tone=t=>{ lm.emissive.set(t==="light" ? "#000000" : "#0c2630"); }; liq.userData.tone(tone);
      const caps=new THREE.InstancedMesh(new THREE.CylinderGeometry(.088,.088,.07,seg), matsOf(tone).cap, N); caps.userData.tone=t=>{ caps.material=matsOf(t).cap; };
      g.add(glass, liq, caps);
      const at=j=>{ const col2=j%20, row=Math.floor(j/20); return [-5.7+.6*col2, 1.5+.36*row]; }, sorted=r=>{ const c2=Math.floor(r/10), row=r%10; return [-5.7+.6*c2, 1.5+.36*row]; };
      const M4=new THREE.Matrix4(), Q=new THREE.Quaternion(), Sv=new THREE.Vector3(), Pv=new THREE.Vector3(), cA=new THREE.Color(), cB=new THREE.Color();
      g.userData.set=(reveal, levelOf, cond, tn)=>{
        const K2=matsOf(tn).K, base=col(K2.accent), hiBand=col(K2.band), hiMed=col(tn==="light" ? BRONZE : "#ffcf8a"), tail=col(K2.ghost);
        for(let j=0;j<N;j++){ const shown=smooth((reveal-j/N)/.03), r=sc.rank[j], a=at(j), b=sorted(r), e=smooth(cond);
          const x=lerp(a[0],b[0],e), z=lerp(a[1],b[1],e), s=Math.max(.0001, shown), fill=.7*Math.min(levelOf(j),V0.mtc)/V0.mtc;   // full at the MTC
          Q.identity(); M4.compose(Pv.set(x,0,z), Q, Sv.set(s,s,s)); glass.setMatrixAt(j, M4);
          M4.compose(Pv.set(x,.02*s,z), Q, Sv.set(s, Math.max(.0001, fill*s), s)); liq.setMatrixAt(j, M4);
          M4.compose(Pv.set(x,.92*s,z), Q, Sv.set(s,s,s)); caps.setMatrixAt(j, M4);
          cA.copy(base); cB.copy(r===99 || r===100 ? hiMed : r>=10 && r<=189 ? hiBand : tail); liq.setColorAt(j, cA.lerp(cB, e)); }
        [glass, liq, caps].forEach(m=>{ m.instanceMatrix.needsUpdate=true; m.computeBoundingSphere(); }); if(liq.instanceColor) liq.instanceColor.needsUpdate=true; };
      g.userData.set(0, ()=>0, 0, tone);   // the instance colours exist from the start, so the shader is compiled with them
      return g;
    }

    // two connected glass chambers, the central and the peripheral compartment: each holds its amount (a share of the
    // dose), and particles cross the tube at rates k₁₂·A₁ (out) and k₂₁·A₂ (back)
    function chambers(){
      const g=new THREE.Group(), R=.62, H=2.7, gap=2.3, prof=[[0,0],[R-.08,0],[R,.07],[R,H],[R+.05,H+.04]];
      const c1=new THREE.Group(), c2=new THREE.Group(); c2.position.set(-gap,0,-.5); g.add(c1, c2);
      const parts=[[c1, k=>k.accent],[c2, k=>k.b]].map(([c,pick])=>{
        c.add(toned(new THREE.Mesh(lathe(prof, SEG)), "vessel"));
        const lm=liquidMat(pick), liq=liquidMesh(new THREE.CylinderGeometry(R-.06,R-.06,1,SEG).translate(0,.5,0), lm); liq.position.y=.05; c.add(liq);
        const s=surfaceDisc(pick); s.scale.set(R-.06,R-.06,R-.06); c.add(s); return {liq, s}; });
      const len=Math.hypot(gap, .5)-2*R+.12, tube=new THREE.Mesh(new THREE.CylinderGeometry(.1,.1,len,20,1,true));
      tube.position.set(-gap/2,.42,-.25); tube.rotation.z=Math.PI/2; tube.rotation.y=-Math.atan2(.5,gap); g.add(toned(tube,"vessel"));
      const n=full ? 220 : 120, lane=new Float32Array(n), ph=new Float32Array(n), sd=new Float32Array(n), pos=new Float32Array(n*3), Rr=PK.seededRandom(9);
      for(let i=0;i<n;i++){ lane[i]=i%2; ph[i]=Rr(); sd[i]=Rr(); }
      const geo=new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos,3)); [["aLane",lane],["aPh",ph],["aSd",sd]].forEach(([k,a])=> geo.setAttribute(k, new THREE.BufferAttribute(a,1)));
      const m=new THREE.ShaderMaterial({transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, premultipliedAlpha:true,
        uniforms:{uTime:{value:0}, uOut:{value:0}, uBack:{value:0}, uA:{value:col(K.accent)}, uB:{value:col(K.b)}, uScale:{value:full ? 42 : 32}, uFrom:{value:new THREE.Vector3(-R+.04,.42,0)}, uTo:{value:new THREE.Vector3(-gap+R-.04,.42,-.5)}},
        vertexShader:`attribute float aLane, aPh, aSd; uniform float uTime, uOut, uBack, uScale; uniform vec3 uFrom, uTo; varying float vA; varying float vL;
          void main(){ float f=fract(aPh+uTime*(.32+.2*aSd)); float u=aLane<.5 ? f : 1.-f; vec3 p=mix(uFrom, uTo, u); p.y+=(aSd-.5)*.11+(aLane-.5)*.05; p.z+=(fract(aSd*7.3)-.5)*.1;
            vA=step(aSd, aLane<.5 ? uOut : uBack)*smoothstep(0.,.12,u)*(1.-smoothstep(.88,1.,u)); vL=aLane;
            vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; gl_PointSize=min(uScale/max(-mv.z,.5), 22.); }`,
        fragmentShader:`uniform vec3 uA, uB; varying float vA; varying float vL; void main(){ vec2 c=gl_PointCoord-.5; float r=dot(c,c); if(r>.25 || vA<.01) discard; float a=(1.-smoothstep(0.,.25,r))*vA; gl_FragColor=vec4(mix(uA,uB,vL)*a*1.5,a); }`});
      const pts=new THREE.Points(geo, m); pts.frustumCulled=false; pts.layers.enable(BLOOM); g.add(pts);
      pts.userData.tone=t=>{ const K2=matsOf(t).K; m.uniforms.uA.value.set(K2.accent); m.uniforms.uB.value.set(K2.b); m.blending=t==="light" ? THREE.NormalBlending : THREE.AdditiveBlending; m.needsUpdate=true; };
      pts.userData.tone(tone);
      g.userData.set=(f1, f2, out, back, time)=>{ [[parts[0],f1],[parts[1],f2]].forEach(([q,f])=>{ const h=Math.max(.001,(H-.2)*clamp(f,0,1)); q.liq.scale.y=h; q.s.position.y=.05+h; q.s.visible=f>.004; });
        m.uniforms.uOut.value=out; m.uniforms.uBack.value=back; m.uniforms.uTime.value=time; };
      return g;
    }

    // a culture dish (glass, agar, colonies) whose colonies dim by the share of time so far that the unbound level has
    // been above the MIC: a visual cue for fT>MIC, not a model of bacterial killing
    function cultureDish(seed){
      const g=new THREE.Group(), R=1.55;
      g.add(toned(new THREE.Mesh(lathe([[0,0],[R-.06,0],[R,.04],[R,.24],[R+.03,.26]], SEG)), "vessel"));
      const lid=toned(new THREE.Mesh(lathe([[0,.34],[R+.05,.3],[R+.09,.26],[R+.09,.12]], SEG)), "vessel"); lid.position.set(.5,.42,-.9); lid.rotation.x=-.42; g.add(lid);
      const agarM=new THREE.MeshStandardMaterial({roughness:.55, metalness:0});
      const agar=new THREE.Mesh(new THREE.CylinderGeometry(R-.05,R-.05,.12,SEG), agarM); agar.position.y=.08; g.add(agar);
      agar.userData.tone=t=> agarM.color.set(t==="light" ? "#d9c08f" : "#2a1d0e"); agar.userData.tone(tone);
      const n=full ? 150 : 90, cm=new THREE.MeshStandardMaterial({roughness:.4, metalness:0}), col3=new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI*2, 0, Math.PI/2), cm, n);
      const Rr=PK.seededRandom(seed), M4=new THREE.Matrix4(), Q=new THREE.Quaternion(), c=new THREE.Color();
      for(let i=0;i<n;i++){ const r=(R-.22)*Math.sqrt(Rr()), a=Rr()*Math.PI*2, s=.035+.085*Math.pow(Rr(),2);
        M4.compose(new THREE.Vector3(r*Math.cos(a), .14, r*Math.sin(a)), Q, new THREE.Vector3(s, s*.55, s)); col3.setMatrixAt(i, M4); col3.setColorAt(i, c.setHSL(.08+.04*Rr(), .55, .62+.2*Rr())); }
      col3.layers.enable(BLOOM); g.add(col3);
      // dark: the colonies glow and dim; paper: they are a warm brown that fades into the agar
      const paint=(t,k)=>{ const e=.06+.94*Math.pow(clamp(k,0,1),1.6), warm=col("#ffb36b");
        if(t==="light"){ cm.color.set("#d9c08f").lerp(col("#8a4b14"), e); cm.emissive.set("#000000"); cm.emissiveIntensity=0; }
        else { cm.color.set("#2b1a0a"); cm.emissive.copy(warm); cm.emissiveIntensity=(full ? 1.9 : 1.4)*e; } };
      let glow=1; col3.userData.tone=t=> paint(t, glow); paint(tone, 1);
      g.userData.glow=k=>{ glow=k; paint(tone, k); };
      return g;
    }

    // a dialyzer: a glass cartridge of hollow fibres between capped ends, held on a stand. During a session its fibres
    // glow and blood and dialysate stream through it (blood down the fibres, dialysate up around them) in proportion to
    // the removal rate, CLd·C(t); between sessions it is dark
    function dialyzer(){
      const g=new THREE.Group(), R=.34, H=3.1, y0=.62, segs=full ? 40 : 24;
      const house=toned(new THREE.Mesh(new THREE.CylinderGeometry(R,R,H,segs,1,true)), "vessel"); house.position.y=y0+H/2; g.add(house);
      [[y0+H, 1],[y0, -1]].forEach(([y,s])=>{ const cap=toned(new THREE.Mesh(new THREE.CylinderGeometry(s>0 ? R*.5 : R*1.06, s>0 ? R*1.06 : R*.5, .3, segs)), "cap"); cap.position.y=y+s*.15; g.add(cap);
        const port=toned(new THREE.Mesh(new THREE.CylinderGeometry(.065,.065,.34,16)), "cap"); port.position.y=y+s*.45; g.add(port); });
      [y0+.42, y0+H-.42].forEach(y=>{ const p=toned(new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,.42,16)), "cap"); p.rotation.z=Math.PI/2; p.position.set(R+.18,y,0); g.add(p); });
      const pole=toned(new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,y0+H+.6,12)), "brass"); pole.position.set(-.95,(y0+H+.6)/2,-.2); g.add(pole);
      const foot=toned(new THREE.Mesh(new THREE.CylinderGeometry(.42,.48,.06,32)), "brass"); foot.position.set(-.95,.03,-.2); g.add(foot);
      [y0+.7, y0+H-.7].forEach(y=>{ const arm=toned(new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,.62,10)), "brass"); arm.rotation.z=Math.PI/2; arm.position.set(-.62,y,-.1); g.add(arm);
        const ring=toned(new THREE.Mesh(new THREE.TorusGeometry(R+.03,.025,8,40)), "brass"); ring.rotation.x=Math.PI/2; ring.position.y=y; g.add(ring); });
      const nf=full ? 120 : 64, fp=new Float32Array(nf*6), Rr=PK.seededRandom(13), fx=[];
      for(let i=0;i<nf;i++){ const r=(R-.06)*Math.sqrt(Rr()), a=Rr()*Math.PI*2, x=r*Math.cos(a), z=r*Math.sin(a); fx.push([x,z]); fp.set([x,y0+.02,z, x,y0+H-.02,z], i*6); }
      const fg=new THREE.BufferGeometry(); fg.setAttribute("position", new THREE.BufferAttribute(fp,3));
      const fm=new THREE.LineBasicMaterial({transparent:true, opacity:.2, depthWrite:false}), fibres=new THREE.LineSegments(fg, fm); fibres.layers.enable(BLOOM); g.add(fibres);
      const n=full ? 340 : 180, pos=new Float32Array(n*3), lane=new Float32Array(n), ph=new Float32Array(n), sd=new Float32Array(n);
      for(let i=0;i<n;i++){ lane[i]=i%3===0 ? 1 : 0; const f=fx[i%nf]; const r2=lane[i] ? (R-.04)*Math.sqrt(Rr()) : 0, a2=Rr()*Math.PI*2;
        pos.set(lane[i] ? [r2*Math.cos(a2), 0, r2*Math.sin(a2)] : [f[0], 0, f[1]], i*3); ph[i]=Rr(); sd[i]=Rr(); }
      const pg=new THREE.BufferGeometry(); pg.setAttribute("position", new THREE.BufferAttribute(pos,3)); [["aLane",lane],["aPh",ph],["aSd",sd]].forEach(([k,a])=> pg.setAttribute(k, new THREE.BufferAttribute(a,1)));
      const pm=new THREE.ShaderMaterial({transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, premultipliedAlpha:true,
        uniforms:{uTime:{value:0}, uRate:{value:0}, uY0:{value:y0}, uH:{value:H}, uBlood:{value:col(K.mtc)}, uDial:{value:col(K.accent)}, uScale:{value:full ? 34 : 26}},
        vertexShader:`attribute float aLane, aPh, aSd; uniform float uTime, uRate, uY0, uH, uScale; varying float vA; varying float vL;
          void main(){ float f=fract(aPh+uTime*(.22+.12*aSd)); float u=aLane<.5 ? 1.-f : f; vec3 p=position; p.y=uY0+.05+u*(uH-.1);
            vA=step(aSd, uRate)*smoothstep(0.,.08,f)*(1.-smoothstep(.92,1.,f)); vL=aLane;
            vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; gl_PointSize=min(uScale/max(-mv.z,.5), 18.); }`,
        fragmentShader:`uniform vec3 uBlood, uDial; varying float vA; varying float vL; void main(){ vec2 c=gl_PointCoord-.5; float r=dot(c,c); if(r>.25 || vA<.01) discard; float a=(1.-smoothstep(0.,.25,r))*vA; gl_FragColor=vec4(mix(uBlood,uDial,vL)*a*1.4,a); }`});
      const flow=new THREE.Points(pg, pm); flow.frustumCulled=false; flow.layers.enable(BLOOM); g.add(flow);
      const paint=t=>{ const K2=matsOf(t).K; fm.color.set(K2.mtc); pm.uniforms.uBlood.value.set(K2.mtc); pm.uniforms.uDial.value.set(K2.accent);
        pm.blending=fm.blending=t==="light" ? THREE.NormalBlending : THREE.AdditiveBlending; pm.needsUpdate=fm.needsUpdate=true; };
      fibres.userData.tone=paint; paint(tone);
      g.userData.set=(rate, time)=>{ const r=clamp(rate,0,1); pm.uniforms.uRate.value=r; pm.uniforms.uTime.value=time; fm.opacity=.12+.6*r; };
      return g;
    }

    // the check sphere's instrument: a glass globe in a brass armillary (a meridian and a horizon ring) on a turned stand
    const CY=3.6;   // the globe's centre height
    function instrument(){
      const g=new THREE.Group();
      // the globe's glass is its own (it clears as the camera flies in)
      const globe=new THREE.Mesh(new THREE.SphereGeometry(2.95, full ? 72 : 40, full ? 48 : 28)), own={};
      globe.userData.tone=t=>{ if(!own[t]){ own[t]=matsOf(t).vessel.clone(); own[t].userData.shared=false; own[t].transparent=true; } globe.material=own[t]; }; globe.userData.tone(tone);
      globe.position.y=CY; globe.name="globe"; g.add(globe);
      const mer=new THREE.Group(); mer.position.y=CY; g.add(mer);
      mer.add(toned(new THREE.Mesh(new THREE.TorusGeometry(3.22, .05, 12, 160)), "brass"));
      const hor=toned(new THREE.Mesh(new THREE.TorusGeometry(3.38, .06, 12, 160)), "brass"); hor.rotation.x=Math.PI/2; hor.position.y=CY; g.add(hor);
      [-1,1].forEach(s=>{ const pin=toned(new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,.34,12)), "brass"); pin.position.y=s*3.32; mer.add(pin); });
      const stand=toned(new THREE.Mesh(lathe([[0,0],[.95,0],[.98,.06],[.6,.14],[.28,.26],[.2,.42],[.26,.48],[.14,.56],[.12,CY-3.3]], SEG)), "brass"); g.add(stand);
      g.userData.mer=mer; return g;
    }

    /* the sequence's objects, placed along the x axis; the camera travels between them */
    const SX=[0,24,48,72,96,120,144];   // the scenes with their own place: hero, simulate, learn, cases, exposure, rebound, validated
    const FX=12;   // the glass figure ("Every dose"), between the hero and Simulate, in front of the strand
    const GLOBE_C=new THREE.Vector3(SX[6], CY, 0);
    const SCENE_GROUPS=["s1","s2","s3","s4","s5","s6","s7","s8","strand"];
    let popPts=null;
    // top of the exposure scene's ribbons (mg/L): the 30-minute infusion's peak stands well above the 3-hour one's
    const TOP6=130;
    function buildIntro(){
      prepScenes();
      SCENE_GROUPS.forEach(k=>{ disposeGroup(groups[k]); delete groups[k]; });
      popPts=null;
      const phone=phoneQ.matches, add=(k,x,y=0)=>{ const g=groups[k]=new THREE.Group(); g.position.set(x,y,0); scene.add(g); return g; };
      // Hero: the ribbon draws itself in the cold open, fed by the particles of a dissolving capsule
      const g1=add("s1",0);
      const r1=ribbon(sc.c1, sc.T1, 14, {curtain:!phone}); r1.name="r"; g1.add(r1);
      const h1=head(); g1.add(h1);
      const cap1=capsule(); cap1.name="cap"; cap1.position.set(X(0,sc.T1)-.15, .17, .7); g1.add(cap1);
      const ab=absorption(cap1.position, sc.c1, sc.T1, 14, sc.p1.ka, full ? 640 : phone ? 200 : 320); ab.name="abs"; g1.add(ab);
      const cur1=cursorDot(); cur1.name="cur"; g1.add(cur1);
      // Every dose: the glass figure, its level the default scenario's concentration
      const g2=add("s2",FX); g2.position.z=1.25; const fig=figure(); fig.name="fig"; g2.add(fig);
      // Learn: on phones the vials alone (the cloud stays the SVG frame's)
      const g4=add("s4",SX[2]); const vi=vials(); vi.name="vials"; g4.add(vi);
      if(!phone){
        const w1=windowPlate(14, V0.mec, V0.mtc); w1.name="win"; g1.add(w1);
        // Simulate: the regimen, the first dose alone (what the second stacks on), a capsule at each dose
        const top2=Math.max(...sc.c2.map(q=>q.c))*1.1, g3=add("s3",SX[1]);
        const r3=ribbon(sc.c2, sc.T2, top2); r3.name="r"; g3.add(r3);
        const one=ribbon(sc.c2one, sc.T2, top2, {ghost:true, curtain:false, z:-.3}); one.name="one"; g3.add(one);
        const w3=windowPlate(top2, V0.mec, V0.mtc); w3.name="win"; g3.add(w3);
        const rg=rings(sc.d2, sc.T2); rg.name="rings"; g3.add(rg); const h3=head(); g3.add(h3);
        const caps=new THREE.Group(); caps.name="caps"; sc.d2.forEach(t=>{ const c=capsule(.44,.105); c.position.set(X(t,sc.T2), .12, .62); c.userData.t=t; caps.add(c); }); g3.add(caps);
        // Learn: 200 patients as points, revealed one by one, then condensing into the median and the band; the vials in front
        { const n=sc.pop[0].length, per=full ? 150 : 90, N=200*per, pos=new Float32Array(N*3), aIdx=new Float32Array(N), aMed=new Float32Array(N), aLo=new Float32Array(N), aHi=new Float32Array(N);
          const yv=c=> YH*Math.min(c,16*1.2)/16, R=PK.seededRandom(11), at=(arr,f)=>{ const i=Math.min(n-2, Math.floor(f)), u=f-i; return arr[i].c*(1-u)+arr[i+1].c*u; };
          sc.pop.forEach((c,j)=>{ for(let i=0;i<per;i++){ const k=j*per+i, f=(n-1)*Math.pow(R(),1.35);   // denser early, where the curve moves
            pos.set([X(24*f/(n-1),24), yv(at(c,f)), (j%20-9.5)*.06], k*3); aIdx[k]=j/200; aMed[k]=yv(at(sc.med,f)); aLo[k]=yv(at(sc.lo,f)); aHi[k]=yv(at(sc.hi,f)); } });
          const geo=new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos,3));
          [["aIdx",aIdx],["aMed",aMed],["aLo",aLo],["aHi",aHi]].forEach(([k,a])=> geo.setAttribute(k, new THREE.BufferAttribute(a,1)));
          const order=new Uint32Array(N); for(let i=0;i<N;i++) order[i]=i; geo.setIndex(new THREE.BufferAttribute(order,1));
          const m=new THREE.ShaderMaterial({transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, premultipliedAlpha:true,
            uniforms:{uReveal:{value:1}, uCond:{value:0}, uColor:{value:col(P.accent)}, uScale:{value:full ? 48 : 36}, uA:{value:1}},
            vertexShader:`attribute float aIdx, aMed, aLo, aHi; uniform float uReveal, uCond, uScale; varying float vA;
              void main(){ float shown=smoothstep(aIdx, aIdx+.03, uReveal);
                float yc=clamp(aMed+(position.y-aMed)*.3, aLo, aHi); vec3 p=vec3(position.x, mix(position.y, yc, uCond), position.z*(1.-.85*uCond));
                vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; gl_PointSize=uScale/max(-mv.z,.5)*(1.+.6*(1.-shown));
                vA=shown*(1.-.6*uCond); }`,
            fragmentShader:`uniform vec3 uColor; uniform float uA; varying float vA; void main(){ vec2 c=gl_PointCoord-.5; float r=dot(c,c); if(r>.25) discard; float a=(1.-smoothstep(.02,.25,r))*vA*uA*.36; gl_FragColor=vec4(uColor*a,a); }`});
          popPts=new THREE.Points(geo, m); popPts.name="cloud"; popPts.layers.enable(BLOOM); g4.add(popPts);
          // the band (the middle 90%) as a glass sheet, and the median as a ribbon
          const pos2=new Float32Array((n)*6), idx=[]; for(let i=0;i<n;i++){ pos2.set([X(sc.lo[i].t,24), yv(sc.lo[i].c), -.05, X(sc.hi[i].t,24), yv(sc.hi[i].c), -.05], i*6); if(i) idx.push(2*i-2,2*i-1,2*i, 2*i-1,2*i+1,2*i); }
          const bg=new THREE.BufferGeometry(); bg.setAttribute("position", new THREE.BufferAttribute(pos2,3)); bg.setIndex(idx); bg.computeVertexNormals();
          const sheet=new THREE.Mesh(bg, new THREE.MeshStandardMaterial({color:col(P.band), transparent:true, opacity:0, roughness:.4, side:THREE.DoubleSide, depthWrite:false})); sheet.name="band"; g4.add(sheet);
          const med=ribbon(sc.med, 24, 16, {curtain:false, bronze:true, noGlow:false}); med.name="med"; g4.add(med);
          const w4=windowPlate(16, V0.mec, V0.mtc); w4.name="win"; g4.add(w4);
          // the time the vials are read at: a thin glass plane through the cloud
          const tp=new THREE.Mesh(new THREE.PlaneGeometry(2.6, YH*1.2)); tp.rotation.y=Math.PI/2; tp.position.set(X(sc.tv,24), YH*.6, 0); tp.name="tplane"; g4.add(toned(tp,"sheetBand")); }
        // Cases: the two phases, the axis turning logarithmic in front of the camera; the two compartments as chambers
        const g5=add("s5",SX[3]);
        { const fl=sc.c4[sc.c4.length-1].c*0.5, top=sc.c4[0].c*1.5, lin=c=> YH*c/top, lg=c=> YH*(Math.log10(Math.max(c,fl))-Math.log10(fl))/(Math.log10(top)-Math.log10(fl));
          const mk=(pts, name, o)=>{ const r=ribbon(pts, sc.T4, top, Object.assign({curtain:false}, o)); r.name=name; r.userData.lin=Float32Array.from(pts, q=>lin(q.c)); r.userData.lg=Float32Array.from(pts, q=>lg(q.c)); g5.add(r); return r; };
          mk(sc.c4, "r", {}); mk(sc.pa, "a", {thin:true, b:true}); mk(sc.pb, "b", {thin:true, bronze:true, noGlow:true});
          const ch=chambers(); ch.name="ch"; ch.position.set(-8.6, 0, -2.1); g5.add(ch); const cd=cursorDot(); cd.name="cur"; g5.add(cd); }
        // Exposure: one steady-state interval of piperacillin, as a 30-minute and a 3-hour infusion, against the MIC; a dish each
        const g6=add("s6",SX[4]);
        { const thr=sc.ms6[0].thr, y=c=> YH*c/TOP6;
          const a=ribbon(sc.c6[0], sc.T6, TOP6, {curtain:false}); a.name="r30"; g6.add(a);
          const ag=ribbon(sc.c6[0], sc.T6, TOP6, {ghost:true, curtain:false, z:-.3}); ag.name="r30g"; g6.add(ag);
          const b=ribbon(sc.c6[1], sc.T6, TOP6, {curtain:false, z:.35}); b.name="r3h"; g6.add(b);
          const ln=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-XW/2,y(thr),-.2), new THREE.Vector3(XW/2,y(thr),-.2)])); ln.computeLineDistances(); g6.add(toned(ln,"hairMic"));
          const sh=new THREE.Mesh(new THREE.PlaneGeometry(XW, y(thr))); sh.position.set(0, y(thr)/2, -.25); g6.add(toned(sh,"sheetMic"));
          [[-2.6,0,"dishA",21],[2.6,1,"dishB",23]].forEach(([x,k,nm,seed])=>{ const d=cultureDish(seed); d.position.set(x,0,3.1); d.name=nm; g6.add(d); });
          const h6=head(); g6.add(h6); }
        // Rebound: the dialysis course (pk-hd.js arrives a moment later), the session's hours, the cartridge behind
        add("s7",SX[5]); buildHd();
        // Validated: one point per check, lit as the checks pass, in a glass globe on a brass stand
        const g8=add("s8",SX[6]); const ins=instrument(); ins.name="ins"; g8.add(ins);
        { const pts=sphere(sc.nChecks), pos=new Float32Array(pts.length*3), cols=new Float32Array(pts.length*3), off=col(P.line);
          pts.forEach(([x,y,z],i)=>{ pos.set([2.6*x,2.6*y,2.6*z], i*3); cols.set([off.r,off.g,off.b], i*3); });
          const geo=new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos,3)); geo.setAttribute("color", new THREE.BufferAttribute(cols,3));
          const m=new THREE.ShaderMaterial({transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, premultipliedAlpha:true, vertexColors:true, uniforms:{uScale:{value:full ? 44 : 34}, uK:{value:2.2}},
            vertexShader:"uniform float uScale; varying vec3 vC; void main(){ vC=color; vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv; gl_PointSize=min(uScale/max(-mv.z,.5), 26.); }",
            fragmentShader:"uniform float uK; varying vec3 vC; void main(){ vec2 c=gl_PointCoord-.5; float r=dot(c,c); if(r>.25) discard; float a=(1.-smoothstep(.0,.25,r)); a*=a; gl_FragColor=vec4(vC*a*uK,a); }"});
          const core=new THREE.Group(); core.name="core"; core.position.y=CY; g8.add(core);
          const pts3=new THREE.Points(geo, m); pts3.name="pts"; pts3.layers.enable(BLOOM); core.add(pts3);
          // on paper the checks are ink (normal blending), in the dark they glow (additive)
          pts3.userData.tone=t=>{ m.blending=t==="light" ? THREE.NormalBlending : THREE.AdditiveBlending; m.uniforms.uK.value=t==="light" ? 1 : 2.2; m.needsUpdate=true; light6(); };
          core.add(new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(2.58, 3)), new THREE.LineBasicMaterial({color:col(P.line), transparent:true, opacity:.14}))); }
        buildStrand();
      }
      setVis(); light6(); applyTone();
    }
    // the dialysis scene's ribbon and cartridge, once pk-hd.js has given its course
    function buildHd(){
      const g7=groups.s7; if(!g7) return;
      if(!sc.c7){ prepHd().then(()=>{ if(sc.c7 && groups.s7===g7){ buildHd(); buildStrand(); setVis(); applyTone(); precompile(); } }); return; }
      g7.children.slice().forEach(disposeGroup);
      const span=sc.T7-HD_T0, pts=sc.c7.filter(q=> q.t>=HD_T0).map(q=>({t:q.t-HD_T0, c:q.c})), r=sc.row7;
      const rb=ribbon(pts, span, 14, {curtain:true}); rb.name="r"; g7.add(rb);
      const x=t=> X(t-HD_T0, span), y=c=> YH*c/14;
      const band7=new THREE.Mesh(new THREE.PlaneGeometry(x(r.end)-x(r.start), YH*1.1)); band7.position.set((x(r.start)+x(r.end))/2, YH*.55, -.6); g7.add(toned(band7,"sheetBand"));
      const dz=dialyzer(); dz.name="dz"; dz.position.set((x(r.start)+x(r.end))/2, 0, -2.4); g7.add(dz);
      const tr=r.end+r.rebound.after, ring=new THREE.Mesh(new THREE.TorusGeometry(.2,.02,8,40)); ring.position.set(x(tr), y(r.rebound.level), .05); ring.name="reb"; g7.add(toned(ring,"hairMtc"));
      const drop=new THREE.Mesh(new THREE.CylinderGeometry(.008,.008,1,6)); drop.name="drop"; drop.position.set(x(tr), (y(r.post)+y(r.rebound.level))/2, .05); drop.scale.y=Math.max(.001,y(r.rebound.level)-y(r.post)); g7.add(toned(drop,"hairMtc"));
      const cd=cursorDot(); cd.name="cur"; g7.add(cd);
    }
    // the strand: the ribbon travelling on between scenes, from the end of each curve to the start of the next, behind the
    // glass figure, around the instrument's stand and on to the simulator's own curve, so the camera always follows one object
    function buildStrand(){
      disposeGroup(groups.strand); delete groups.strand;
      const st=groups.strand=new THREE.Group(); scene.add(st);
      const endOf=(k,nm,last)=>{ const g=groups[k], r=g && g.getObjectByName(nm); if(!r) return null; const i=last ? r.userData.n-1 : 0; return [g.position.x+r.userData.xs[i], r.userData.ys[i]]; };
      const legs=[], pair=(a,b)=>{ if(a && b) legs.push([a,b,null]); }, base=[SX[6]-2.6,.16];
      pair(endOf("s1","r",1), endOf("s3","r",0)); pair(endOf("s3","r",1), endOf("s4","med",0)); pair(endOf("s4","med",1), endOf("s5","r",0)); pair(endOf("s5","r",1), endOf("s6","r3h",0));
      const s7a=endOf("s7","r",0); if(s7a){ pair(endOf("s6","r3h",1), s7a); pair(endOf("s7","r",1), base); } else pair(endOf("s6","r3h",1), base);
      // around the stand, in front of it, and on to the app
      legs.push([base,[SX[6]+2.6,.16], u=> 1.7*Math.sin(Math.PI*u)], [[SX[6]+2.6,.16],[APPX-6,.05], null]);
      legs.forEach(([a,b,zf])=>{ const n=72, xs=[], ys=[], zs=[];
        for(let i=0;i<n;i++){ const u=i/(n-1), e=u*u*(3-2*u); xs.push(lerp(a[0],b[0],u)); ys.push(lerp(a[1],b[1],e)+(zf ? 0 : Math.sin(Math.PI*u)*.18)); zs.push(zf ? zf(u) : 0); }
        const geo=sweep(xs, ys, 0, .42, zf ? zs : null), mD=new THREE.Mesh(geo, matsOf("dark").core), mL=new THREE.Mesh(geo, matsOf("light").core);
        mD.layers.enable(BLOOM); mD.name="dark"; mL.name="light";
        const leg=new THREE.Group(); leg.add(mD, mL); leg.userData.tone=t=>{ mD.visible=t!=="light"; mL.visible=t==="light"; }; leg.userData.tone(tone); st.add(leg); });
    }
    // every object's shaders, in both tones, before the sequence plays (otherwise each compiles the first time it comes
    // into view, or the first time the tone changes, and that frame stalls)
    async function precompile(tones){
      if(!renderer.compileAsync) return;
      const was=tone, vis=SCENE_GROUPS.map(k=> groups[k] && groups[k].visible);
      SCENE_GROUPS.forEach(k=>{ if(groups[k]) groups[k].visible=true; });
      // group by group, so the work is spread over several frames rather than one long one
      const parts=SCENE_GROUPS.concat(["live"]).map(k=> groups[k]).filter(Boolean).concat([floor, dust, shafts]);
      for(const t of tones || [was]){ if(t!==tone){ tone=t; applyTone(); }
        for(const o of parts){ try{ await renderer.compileAsync(o, camera, scene); }catch(e){} await new Promise(r=> setTimeout(r)); } }
      if(tone!==was){ tone=was; applyTone(); }
      SCENE_GROUPS.forEach((k,i)=>{ if(groups[k]) groups[k].visible=vis[i]; }); setVis();
    }
    // the other tone waits until the cold open is over and the reader has stopped scrolling for a moment (its light
    // environment is made in one piece of work that would stall a frame mid-scroll)
    let lastScrollAt=0; addEventListener("scroll", ()=>{ lastScrollAt=performance.now(); }, {passive:true});
    const otherTone=()=> new Promise(res=>{
      const go=()=>{ if(performance.now()-lastScrollAt<700) return setTimeout(go, 250);
        (window.requestIdleCallback || (f=>setTimeout(f,200)))(()=>{ if(performance.now()-lastScrollAt<700) return go(); precompile([tone==="light" ? "dark" : "light"]).then(res); }, {timeout:2500}); };
      setTimeout(go, Math.max(0, COLD_MS+600-performance.now())); });
    // a small marker riding a ribbon: the time a scene's object is showing
    function cursorDot(){
      const m=new THREE.MeshBasicMaterial(), d=new THREE.Mesh(new THREE.SphereGeometry(.09,20,14), m); d.visible=false; d.layers.enable(BLOOM);
      d.userData.tone=t=> m.color.set(t==="light" ? GRAPHITE : "#ffffff"); d.userData.tone(tone);
      d.userData.at=(r, t, show)=>{ if(!r || !show){ d.visible=false; return; } const T=r.userData.T, ys=r.userData.ys, f=clamp(t/T,0,1)*(ys.length-1), i=Math.min(ys.length-2, Math.floor(f)), u=f-i;
        d.visible=true; d.position.set(X(clamp(t,0,T),T), ys[i]*(1-u)+ys[i+1]*u, r.userData.z+.02+r.position.z); };
      return d;
    }
    let k6=0;
    function light6(){
      const p=groups.s8 && groups.s8.getObjectByName("pts"); if(!p) return;
      const lit=tone==="light", upto=Math.round(k6*sc.nChecks), on=col(P.band).multiplyScalar(lit ? 1 : 1.4), off=lit ? col("#b9bfc8") : col(P.line).multiplyScalar(.6), bad=col(P.mtc), a=p.geometry.attributes.color;
      for(let i=0;i<a.count;i++){ const c=i<Math.min(upto, sc.checks.length) ? (sc.checks[i] ? on : bad) : off; a.setXYZ(i, c.r, c.g, c.b); }
      a.needsUpdate=true; frame();
    }
    // depth-sorted points (on paper they blend normally, so their order shows); re-sorted only when the camera has
    // moved a fair way, and not more than twice a second, and only once the camera has come to rest. 2.19: a counting
    // sort on 4,096 depth buckets, far to near, in about a millisecond (the comparator sort it replaces took 80 ms for
    // 30,000 points, a frame dropped whenever a reader paused mid-scroll)
    let sortAt=0, sortBuf=null; const sortCam=new THREE.Vector3(1e9,0,0), lastCam=new THREE.Vector3();
    function sortPop(now){
      const resting=camera.position.distanceTo(lastCam)<0.004; lastCam.copy(camera.position);
      if(!popPts || !resting || now-sortAt<500 || camera.position.distanceTo(sortCam)<0.8) return; sortAt=now; sortCam.copy(camera.position);
      const geo=popPts.geometry, pos=geo.attributes.position.array, idx=geo.index.array, N=idx.length, cam=camera.position, ox=popPts.parent.position.x;
      if(!sortBuf || sortBuf.d.length!==N) sortBuf={d:new Float32Array(N), out:new Uint32Array(N), bins:new Uint32Array(4097)};
      const {d, out, bins}=sortBuf, B=4096;
      let lo=Infinity, hi=0;
      for(let i=0;i<N;i++){ const dx=pos[i*3]+ox-cam.x, dy=pos[i*3+1]-cam.y, dz=pos[i*3+2]-cam.z, v=Math.sqrt(dx*dx+dy*dy+dz*dz); d[i]=v; if(v<lo) lo=v; if(v>hi) hi=v; }
      const k=(B-1)/((hi-lo)||1), bin=i=> ((hi-d[i])*k)|0;   // the farthest in bin 0
      bins.fill(0);
      for(let i=0;i<N;i++) bins[bin(i)+1]++;
      for(let b=1;b<=B;b++) bins[b]+=bins[b-1];
      for(let i=0;i<N;i++) out[bins[bin(i)]++]=i;
      idx.set(out); geo.index.needsUpdate=true;
    }

    /* the camera: the sequence's resting frames (three per scene) on one path; a framing per tab in the app */
    const V=(x,y,z)=> new THREE.Vector3(x,y,z);
    const REST=[ // scene, [camera, target] at u = 0.18, 0.5, 0.82 of its pinned screen
      [[V(0,1.9,15),V(0,1.6,0)], [V(-3.2,3.3,14),V(0,1.4,0)], [V(2.6,2.4,13.2),V(.4,1.4,0)]],
      [[V(FX-7.8,3,15),V(FX-1.8,2.3,0)], [V(FX-4.6,3,16),V(FX-1.6,2.5,1.2)], [V(FX+2.2,3.4,14.5),V(FX-1.4,2.3,1.2)]],
      [[V(SX[1]-6.2,2.3,10),V(SX[1]-3.4,2.9,0)], [V(SX[1]-4,2.5,10.5),V(SX[1]-1.8,2.9,0)], [V(SX[1]+2,3.4,13.5),V(SX[1]+3.4,3,0)]],
      [[V(SX[2]-7,6.6,21),V(SX[2]-2.5,.9,1.5)], [V(SX[2]-3,6.6,20.5),V(SX[2]-1.2,.6,2)], [V(SX[2]+1,7.2,19.5),V(SX[2]+.4,.3,2.2)]],
      [[V(SX[3]-13,3.2,10),V(SX[3]-8.4,1.5,-1.6)], [V(SX[3]-4.6,2.7,7.6),V(SX[3]-3,2,0)], [V(SX[3]+2,3.8,13),V(SX[3]+1,2,0)]],
      [[V(SX[4]-5.5,4.4,18.5),V(SX[4]-1,2.5,1)], [V(SX[4]-1.5,4.8,17.5),V(SX[4]+.3,2.3,1.5)], [V(SX[4]+3,4,16),V(SX[4]+.8,1.9,2)]],
      [[V(SX[5]-7,3,13),V(SX[5]-2.6,2,-.8)], [V(SX[5]-3,3.2,14.5),V(SX[5]-1,1.9,-.8)], [V(SX[5]+2.5,3,13.5),V(SX[5]+.5,1.6,0)]],
      [[V(SX[6]+1.6,CY+.6,12),V(SX[6],CY,0)], [V(SX[6]-2,CY+.9,13),V(SX[6],CY-.2,0)], [V(SX[6],CY+1.8,17),V(SX[6],CY-.4,0)]],
      // Open: the camera flies into the globe (its glass clears as the camera nears it), among the checks, and on
      // out to the simulator
      [[V(SX[6]+.2,CY+.15,.7),V(SX[6]+10,CY-1,2)], [V(APPX-9.5,5.4,18),V(APPX-.8,2.2,0)], [V(APPX-7.5,4.6,16),V(APPX-.6,2.6,0)]]];
    const KEYS=[]; REST.forEach((r,i)=> r.forEach((k,j)=> KEYS.push({P:2*i+[.18,.5,.82][j], p:k[0], l:k[1], scene:i})));
    const COLD=[V(-3.6,1.95,6.2),V(-5.1,2.3,0)];   // the cold open: close on the peak, in the dark
    const cr=(p0,p1,p2,p3,u,out)=>{ const u2=u*u, u3=u2*u;
      return out.set(.5*((2*p1.x)+(-p0.x+p2.x)*u+(2*p0.x-5*p1.x+4*p2.x-p3.x)*u2+(-p0.x+3*p1.x-3*p2.x+p3.x)*u3),
        .5*((2*p1.y)+(-p0.y+p2.y)*u+(2*p0.y-5*p1.y+4*p2.y-p3.y)*u2+(-p0.y+3*p1.y-3*p2.y+p3.y)*u3),
        .5*((2*p1.z)+(-p0.z+p2.z)*u+(2*p0.z-5*p1.z+4*p2.z-p3.z)*u2+(-p0.z+3*p1.z-3*p2.z+p3.z)*u3)); };
    function pathAt(Pv){
      const n=KEYS.length;
      if(Pv<=KEYS[0].P) return {p:KEYS[0].p.clone(), l:KEYS[0].l.clone()};
      if(Pv>=KEYS[n-1].P) return {p:KEYS[n-1].p.clone(), l:KEYS[n-1].l.clone()};
      let i=0; while(i<n-2 && KEYS[i+1].P<Pv) i++;
      const a=KEYS[Math.max(0,i-1)], b=KEYS[i], c=KEYS[i+1], d=KEYS[Math.min(n-1,i+2)], u=smooth((Pv-b.P)/(c.P-b.P));
      return {p:cr(a.p,b.p,c.p,d.p,u,V(0,0,0)), l:cr(a.l,b.l,c.l,d.l,u,V(0,0,0))};
    }
    // the paper pages: the ribbon crosses the masthead, high in the frame, above the panels' top edge
    const FR={sim:[V(APPX-7.5,4.6,16),V(APPX-.6,2.6,0)], cmp:[V(APPX-9.5,6.2,17),V(APPX-.8,1.5,0.4)], ls:[V(APPX-3.6,2.4,19),V(APPX+.6,-2.1,0)],
      cs:[V(APPX+1.5,3.4,19),V(APPX+1,-2.2,0)], pr:[V(APPX-2.5,2.2,24),V(APPX+.4,-2.8,0)]};
    FR.lesson=FR.fit=FR.win=FR.ls;
    // a phone in portrait sees a narrow slice: the camera stands back so the whole object shows (the ribbon, the figure,
    // the vials), easing from the ribbon to the figure; the scenes between keep their SVG frames
    const PH=[V(0,3.4,42),V(0,-3.6,0)], PHT=[V(FX,6.4,25),V(FX,-2.2,1.2)], PHV=[V(SX[2],12,33),V(SX[2],-8,3)], PHA=[V(APPX,3.4,42),V(APPX,-3.6,0)];
    const phoneAt=Pv=>{ const [a,b,u]=Pv<4.5 ? [PH,PHT,smooth((Pv-1)/1.2)] : [PHT,PHV,1]; return {p:a[0].clone().lerp(b[0],u), l:a[1].clone().lerp(b[1],u)}; };
    let mode="app", camFrom=null, camTo=null, camT0=0, camDur=900, scrollS=0, lastW=null;
    let Psm=null, Ptg=0, vSetAt=0;   // the virtual scroll, set by the page's loop (setP)
    const camNow={p:V(0,0,0), l:V(0,0,0)};
    function target(){
      const portrait=phoneQ.matches && innerWidth<innerHeight;
      if(mode==="intro"){
        const still=stillQ.matches, Pv=still ? restOf(Psm===null ? Ptg : Psm) : (Psm===null ? Ptg : Psm);
        if(portrait) return phoneAt(Pv);
        const t=pathAt(Pv);
        // the cold open: the camera starts close on the peak in the dark and pulls back to the first resting frame
        const e=coldOn() || coldT()<COLD_MS ? ease(clamp((coldT()-250)/(COLD_MS-400),0,1)) : 1;
        if(e<1 && !still){ t.p.lerpVectors(COLD[0], t.p, e); t.l.lerpVectors(COLD[1], t.l, e); }
        return t;
      }
      if(portrait) return {p:PHA[0].clone(), l:PHA[1].clone()};
      const f=FR[tab]||FR.sim, d=scrollS;
      return {p:f[0].clone().add(V(1.2*d+drift.cx,-0.9*d+drift.cy,0.8*d)), l:f[1].clone().add(V(1.2*d+drift.cx*1.4,-0.2*d+drift.cy,0))};
    }
    // reduced motion: each scene holds one resting frame (its last, where every beat is complete); nothing travels
    const restOf=Pv=>{ const i=clamp(Math.round((Pv-0.82)/2),0,REST.length-1); return 2*i+.82; };
    function moveTo(){ camFrom={p:camNow.p.clone(), l:camNow.l.clone()}; camTo=target(); camT0=performance.now(); frame(); }

    /* tone: materials, fog, environment and the floor follow the section the camera is in */
    function applyTone(){
      const M=matsOf(tone), lit=tone==="light";
      scene.environment=envOf(tone);
      Object.values(groups).forEach(g=> g && g.traverse(o=>{ if(o.userData && o.userData.tone) o.userData.tone(tone); }));
      fogU.color.value.set(lit ? M.K.page || "#ECEEF1" : K.page); fogU.density.value=lit ? .02 : .024;
      if(scene.fog) scene.fog.color.copy(fogU.color.value);
      floorMat.uniforms.uGrid.value.set(lit ? "#b4bbc6" : K.line); floorMat.uniforms.uGridA.value=lit ? .14 : .26; floorMat.uniforms.uAmt.value=lit ? .05 : .085;
      key.intensity=lit ? 2.6 : 2.4; rim.intensity=lit ? .9 : 1.6; fill.intensity=lit ? .9 : .4;
      dustMat.uniforms.uColor.value.set(lit ? "#7b6a55" : "#ffe7c8"); dustMat.blending=lit ? THREE.NormalBlending : THREE.AdditiveBlending; dustMat.needsUpdate=true;
      shaftMat.uniforms.uA.value=lit ? 0 : .055;
      if(popPts){ popPts.material.uniforms.uColor.value.set(lit ? GRAPHITE : P.accent); popPts.material.blending=lit ? THREE.NormalBlending : THREE.AdditiveBlending; popPts.material.needsUpdate=true; }
      const sheet=groups.s4 && groups.s4.getObjectByName("band"); if(sheet) sheet.material.color.set(M.K.band);
      frame();
    }
    function setTone(t){
      if(t===tone) return; tone=t; P=t==="light" ? tokensOf(document.querySelector(".scene.ed")||D) : K;
      applyTone(); if(lastW) scroll(lastW, true);
    }
    function scroll(w, quiet){
      lastW=w; const was=mode;
      mode=w.inIntro ? "intro" : "app";
      // the tone: the scene the camera is in (its frame), else the app's
      if(mode==="intro"){ const i=clamp(Math.floor((w.P+0.5)/2),0,scenes.length-1); setTone(toneOfScene(i)); } else setTone(toneAt(w));
      resize();
      if(Psm===null || stillQ.matches){ Ptg=Math.max(0, w.P); Psm=Ptg; }
      const max=Math.max(1, D.scrollHeight-innerHeight), start=w.inIntro ? 0 : (D.classList.contains("intro-on") ? intro.offsetTop+intro.offsetHeight : 0);
      scrollS=clamp((scrollY-start)/Math.max(1,max-start),0,1);
      if(was!==mode && !quiet){ setVis(); moveTo(); return; }
      // phones: the 3D picture for the hero, the figure and the vials; the other scenes show their SVG frames
      if(mode==="intro") canvas.style.opacity=phoneQ.matches ? ([0,1,3].includes(Math.floor(w.g)) ? 1 : 0) : "";
      else canvas.style.opacity="";
      setVis(); camFrom=null; frame();
    }
    // the beats: what each scene's objects do at the smoothed scroll position. Every quantity is the engine's; the
    // scroll only chooses the time
    const lvl=(pts,T,t)=>{ const N=pts.length-1, f=clamp(t/T,0,1)*N, i=Math.min(N-1,Math.floor(f)), u=f-i; return pts[i].c*(1-u)+pts[i+1].c*u; };
    const cum=(arr,T,t)=>{ const N=arr.length-1, f=clamp(t/T,0,1)*N, i=Math.min(N-1,Math.floor(f)), u=f-i; return arr[i]*(1-u)+arr[i+1]*u; };
    const counters={};
    const say=(id,v)=>{ if(counters[id]===v) return; counters[id]=v; const el=$(id); if(el) el.textContent=v; };
    let vialKey="";
    function beats(Pv, now){
      const u=i=> Pv-2*i, still=stillQ.matches, time=still ? 0 : now/1000, G=k=> groups[k], on=(k,nm)=> G(k) && G(k).getObjectByName(nm);
      if(G("s1")){ const r=on("s1","r"), dr=coldDraw(); r.userData.setDraw(dr);
        const hd=on("s1","head"), n=r.userData.n, k=Math.min(n-1, Math.round((n-1)*dr));
        hd.userData.place(r.userData.xs[k], r.userData.ys[k], 0, dr<1 ? 1 : Math.max(0, 1-(coldT()-2700)/900)*(tone==="light" ? 0 : 1));
        // the capsule holds what is left of the dose, e^(−ka·t), at the time drawn; its particles reach the ribbon
        const tH=dr*sc.T1; on("s1","cap").userData.set(still ? 0 : Math.exp(-sc.p1.ka*tH)); on("s1","abs").material.uniforms.uT.value=still ? 1e3 : tH;
        const w1=on("s1","win"); if(w1) w1.userData.rise(still ? 1 : D.classList.contains("intro-on") ? band(u(0),0.28,0.56) : 1); }
      if(G("s2")){ const U=u(1), t=still ? sc.tmax1 : sc.T1*band(U,.02,.94);
        // the figure's level is C(t) and its capsule e^(−ka·t); the hero's ribbon marks the same moment
        on("s2","fig").userData.set(lvl(sc.c1, sc.T1, t), Math.exp(-sc.p1.ka*t));
        on("s1","cur").userData.at(on("s1","r"), t, U>-.4 && U<1.4); }
      if(G("s3")){ const r=on("s3","r"), one=on("s3","one"), U=u(2);
        // one dose (to 8 h), a second stacking on what is left (to 16 h), then the climb to steady state (to 48 h)
        const tEnd=still ? sc.T2 : U<.36 ? lerp(0.5, 8, band(U,-0.3,.3)) : U<.66 ? lerp(8, 16, band(U,.36,.62)) : lerp(16, sc.T2, band(U,.66,1));
        const dr=tEnd/sc.T2; r.userData.setDraw(dr);
        one.visible=U>.3 && U<1.2; one.userData.setDraw(1);
        const n=r.userData.n, k=Math.min(n-1, Math.round((n-1)*dr)), hd=on("s3","head");
        hd.userData.place(r.userData.xs[k], r.userData.ys[k], 0, dr<.995 && tone!=="light" ? 1 : 0);
        on("s3","rings").children.forEach(m=>{ const a=clamp((tEnd-m.userData.t)/3,0,1), s=a>0 && a<1 ? 1+a*2.2 : 1; m.scale.set(s,s,s); m.material.opacity=a<=0 ? .2 : a<1 ? 1-.7*a : .9; });
        // each dose's capsule dissolves from its own dose time, e^(−ka·(t − t_dose))
        on("s3","caps").children.forEach(c=> c.userData.set(tEnd<c.userData.t ? 1 : Math.exp(-sc.p2.ka*(tEnd-c.userData.t)))); }
      if(G("s4")){ const U=u(3), rv=still ? 1 : band(U,-0.2,.5)*1.04, cond=still ? 1 : band(U,.55,.95), tv=still ? sc.tv : lerp(0, sc.tv, band(U,-.2,.45));
        if(popPts){ const mt=popPts.material.uniforms; mt.uReveal.value=rv; mt.uCond.value=cond;
          on("s4","band").material.opacity=.16*cond; on("s4","med").userData.setDraw(still ? 1 : band(U,.5,.9)); sortPop(now);
          const tp=on("s4","tplane"); if(tp){ tp.position.x=X(tv,24); tp.visible=tv>.05; } }
        // each vial holds its patient's level at time tv (4 hours, once there), then they sort by it
        const key=[rv.toFixed(3), tv.toFixed(3), cond.toFixed(3), tone].join();
        if(key!==vialKey){ vialKey=key; const N=sc.pop[0].length-1, f=tv/24*N, i=Math.min(N-1,Math.floor(f)), w=f-i;
          on("s4","vials").userData.set(rv, j=> tv>=sc.tv-1e-9 ? sc.lv[j] : sc.pop[j][i].c*(1-w)+sc.pop[j][i+1].c*w, cond, tone); } }
      if(G("s5")){ const U=u(4), lg=still ? 1 : band(U,.32,.62), sep=still ? 1 : band(U,.68,.95);
        ["r","a","b"].forEach(nm=>{ const r=on("s5",nm), L=r.userData.lin, Gq=r.userData.lg, ys=new Float32Array(L.length);
          for(let i=0;i<L.length;i++) ys[i]=lerp(L[i], Gq[i], lg); if(r.userData.lastLg!==lg){ r.userData.writeY(ys); r.userData.lastLg=lg; } });
        on("s5","a").position.z=1.5*sep; on("s5","b").position.z=-1.5*sep;
        // the chambers hold A₁(t) and A₂(t) as shares of the dose; the tube carries k₁₂·A₁ out and k₂₁·A₂ back
        const t=still ? 2 : sc.T4*Math.pow(band(U,-.15,.95),2), A=sc.amt4(t), p=sc.p4, mx=p.k12*p.D;
        on("s5","ch").userData.set(A.a1/p.D, A.a2/p.D, p.k12*A.a1/mx, p.k21*A.a2/mx, time);
        on("s5","cur").userData.at(on("s5","r"), t, U>-.3 && U<1.3); }
      if(G("s6")){ const U=u(5), tA=still ? sc.T6 : sc.T6*band(U,-.15,.4), tB=still ? sc.T6 : sc.T6*band(U,.45,.9);
        const ra=on("s6","r30"), rg=on("s6","r30g"), rb=on("s6","r3h"), second=still || U>=.45;
        ra.visible=!second; rg.visible=second; ra.userData.setDraw(tA/sc.T6); rg.userData.setDraw(1); rb.visible=tB>.01; rb.userData.setDraw(tB/sc.T6);
        const r=second ? rb : ra, tt=second ? tB : tA, n=r.userData.n, k=Math.min(n-1, Math.round((n-1)*tt/sc.T6));
        on("s6","head").userData.place(r.userData.xs[k], r.userData.ys[k], r.userData.z, tt>.01 && tt<sc.T6-.01 && tone!=="light" ? 1 : 0);
        // the share of the interval so far with the unbound level above the MIC: each dish dims by it, and it is counted
        const fa=cum(sc.ab6[0], sc.T6, tA)/sc.T6, fb=cum(sc.ab6[1], sc.T6, tB)/sc.T6;
        on("s6","dishA").userData.glow(1-fa); on("s6","dishB").userData.glow(1-fb);
        say("ftA", String(Math.round(100*fa))); say("ftB", String(Math.round(100*fb))); }
      if(G("s7") && on("s7","r")){ const U=u(6), span=sc.T7-HD_T0, r=sc.row7;
        const t=still ? span : U<.34 ? lerp(0, r.start-HD_T0, band(U,-.2,.32)) : U<.67 ? lerp(r.start-HD_T0, r.end-HD_T0, band(U,.36,.64)) : lerp(r.end-HD_T0, span, band(U,.68,.98)), ta=t+HD_T0;
        const rb=on("s7","r"); rb.userData.setDraw(t/span); on("s7","cur").userData.at(rb, t, t>.02 && t<span-.02);
        // during the session the dialyzer runs at the removal rate CLd·C(t) (relative to its start); after it, the rebound
        const run=ta>=r.start && ta<=r.end ? lvl(sc.c7, sc.T7, ta)/r.pre : 0; on("s7","dz").userData.set(run, time);
        const tr=r.end+r.rebound.after, reb=clamp((ta-tr)/1.2+1,0,1); [on("s7","reb"), on("s7","drop")].forEach(m=>{ m.visible=reb>0; });
        on("s7","reb").scale.setScalar(Math.max(.001,reb));
        say("hdRm", String(Math.round(sc.rm7(ta)))); }
      if(G("s8")){ const U=u(7), k=still ? 1 : band(U,-0.1,.62); if(Math.abs(k-k6)>.004){ k6=k; light6(); }
        const a=still ? .3 : U*.9; on("s8","core").rotation.y=a; on("s8","ins").userData.mer.rotation.y=a;
        const gl=on("s8","globe"), dist=camera.position.distanceTo(GLOBE_C), base=full && post ? 1 : (tone==="light" ? .26 : .17);
        // (once nearly clear it is hidden: from inside, a transmissive sphere would shade the whole screen twice a frame)
        gl.material.opacity=base*(.06+.94*smooth((dist-3.2)/3)); gl.visible=gl.material.opacity>base*0.12; }
    }
    function setVis(){
      const intro=mode==="intro";
      SCENE_GROUPS.forEach(k=>{ if(groups[k]) groups[k].visible=intro; });
      // the app's scenario appears as the sequence reaches it ("Open"), and stays
      if(groups.live) groups.live.visible=!intro || (lastW && lastW.P>16.4);
      shafts.visible=intro && !phoneQ.matches;
    }

    /* tier 2's passes: the scene in linear HDR with depth; reflection, bloom and blur at half resolution; one composite */
    let rt=null;
    const fsCam=new THREE.OrthographicCamera(-1,1,1,-1,0,1), fsGeo=new THREE.PlaneGeometry(2,2);
    const fsScene=new THREE.Scene(), fsMesh=new THREE.Mesh(fsGeo); fsMesh.frustumCulled=false; fsScene.add(fsMesh);
    const pass=(mat, target)=>{ fsMesh.material=mat; renderer.setRenderTarget(target); renderer.render(fsScene, fsCam); };
    const VS="varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }";
    const blurMat=new THREE.ShaderMaterial({uniforms:{t:{value:null}, dir:{value:new THREE.Vector2()}, thr:{value:0}}, vertexShader:VS, depthTest:false, depthWrite:false,
      fragmentShader:`uniform sampler2D t; uniform vec2 dir; uniform float thr; varying vec2 vUv;
        vec4 bright(vec4 c){ if(thr<=0.) return c; float l=max(c.r,max(c.g,c.b)); return c*smoothstep(thr, thr*1.6, l); }
        void main(){ vec4 s=bright(texture2D(t,vUv))*.2270270270;
          s+=(bright(texture2D(t,vUv+dir*1.3846153846))+bright(texture2D(t,vUv-dir*1.3846153846)))*.3162162162;
          s+=(bright(texture2D(t,vUv+dir*3.2307692308))+bright(texture2D(t,vUv-dir*3.2307692308)))*.0702702703;
          gl_FragColor=s; }`});
    const compMat=new THREE.ShaderMaterial({depthTest:false, depthWrite:false, vertexShader:VS,
      uniforms:{tScene:{value:null}, tBlur:{value:null}, tBloom:{value:null}, tDepth:{value:null}, near:{value:.1}, far:{value:400}, focus:{value:14}, aperture:{value:.55},
        exposure:{value:1}, bloomAmt:{value:1}, ca:{value:.012}, shadow:{value:new THREE.Vector3(.012,.022,.06)}, warm:{value:new THREE.Vector3(1.04,.99,.92)}, gradeAmt:{value:1}},
      fragmentShader:`#include <packing>
        uniform sampler2D tScene, tBlur, tBloom, tDepth; uniform float near, far, focus, aperture, exposure, bloomAmt, ca, gradeAmt; uniform vec3 shadow, warm; varying vec2 vUv;
        vec3 aces(vec3 x){ x*=.6; return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.); }
        vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1./2.4))-.055, step(.0031308, c)); }
        void main(){
          vec2 c=vUv-.5; float r2=dot(c,c); vec2 off=c*ca*r2*4.;
          vec4 s=texture2D(tScene,vUv); s.r=texture2D(tScene,vUv+off).r; s.b=texture2D(tScene,vUv-off).b;
          float d=texture2D(tDepth,vUv).x; float z=-perspectiveDepthToViewZ(d, near, far);
          float coc=d>=.9999 ? 0. : clamp(abs(z-focus)/max(focus,.001)*aperture, 0., 1.);
          vec4 b=texture2D(tBlur,vUv); vec4 col=mix(s, b, smoothstep(.05,.9,coc));
          vec3 bl=texture2D(tBloom,vUv).rgb*bloomAmt;
          vec3 rgb=aces((col.rgb+bl)*exposure);
          // the grade: shadows toward deep blue-black, highlights a touch warm, never grey
          float l=dot(rgb, vec3(.2126,.7152,.0722));
          vec3 g=rgb*mix(vec3(1.), warm, smoothstep(.35,1.,l)) + shadow*(1.-smoothstep(0.,.35,l))*col.a;   // only where there is something
          rgb=mix(rgb, g, gradeAmt);
          rgb=toSRGB(clamp(rgb,0.,1.));
          float a=clamp(max(col.a, max(max(rgb.r,rgb.g),rgb.b)),0.,1.);
          gl_FragColor=vec4(min(rgb, vec3(a)), a);
        }`});
    function makeTargets(w,h){
      if(rt) Object.values(rt).forEach(t=> t && t.dispose && t.dispose());
      const hw=Math.max(2,Math.round(w/2)), hh=Math.max(2,Math.round(h/2));
      const opts={type:THREE.HalfFloatType, depthBuffer:false};
      const main=new THREE.WebGLRenderTarget(w,h,{type:THREE.HalfFloatType, samples:4, depthTexture:new THREE.DepthTexture(w,h)});
      rt={main, half:new THREE.WebGLRenderTarget(hw,hh,opts), halfB:new THREE.WebGLRenderTarget(hw,hh,opts),
        bloom:new THREE.WebGLRenderTarget(hw,hh,{type:THREE.HalfFloatType}), bloomB:new THREE.WebGLRenderTarget(hw,hh,opts), bloomC:new THREE.WebGLRenderTarget(Math.round(hw/2),Math.round(hh/2),opts), bloomD:new THREE.WebGLRenderTarget(Math.round(hw/2),Math.round(hh/2),opts),
        refl:new THREE.WebGLRenderTarget(hw,hh,{type:THREE.HalfFloatType}), reflB:new THREE.WebGLRenderTarget(hw,hh,opts), w, h, hw, hh};
      reflTex.value=rt.refl.texture;
    }
    // the mirror: a camera reflected in the floor renders everything above it; the floor reads it back through uTexMat
    const vcam=new THREE.PerspectiveCamera(), mirror={n:V(0,1,0), cam:V(), look:V(), rot:new THREE.Matrix4(), target:V()};
    const BIAS=new THREE.Matrix4().set(.5,0,0,.5, 0,.5,0,.5, 0,0,.5,.5, 0,0,0,1);
    function renderReflection(){
      camera.updateMatrixWorld(); mirror.cam.setFromMatrixPosition(camera.matrixWorld);
      if(mirror.cam.y<=.05){ floorMat.uniforms.uHas.value=0; return; }
      mirror.rot.extractRotation(camera.matrixWorld); mirror.look.set(0,0,-1).applyMatrix4(mirror.rot).add(mirror.cam);
      vcam.position.set(mirror.cam.x, -mirror.cam.y, mirror.cam.z);
      mirror.target.set(mirror.look.x, -mirror.look.y, mirror.look.z);
      vcam.up.set(0,1,0).applyMatrix4(mirror.rot); vcam.up.y*=-1; vcam.lookAt(mirror.target);
      vcam.near=camera.near; vcam.far=camera.far; vcam.fov=camera.fov; vcam.aspect=camera.aspect; vcam.projectionMatrix.copy(camera.projectionMatrix); vcam.updateMatrixWorld();
      vcam.matrixWorldInverse.copy(vcam.matrixWorld).invert();
      reflMat.value.copy(BIAS).multiply(vcam.projectionMatrix).multiply(vcam.matrixWorldInverse);
      floor.visible=false; shafts.visible=false; const dv=dust.visible; dust.visible=false;
      renderer.setRenderTarget(rt.refl); renderer.setClearColor(0,0); renderer.clear(); renderer.render(scene, vcam);
      floor.visible=true; dust.visible=dv; shafts.visible=mode==="intro" && !phoneQ.matches;
      blurMat.uniforms.thr.value=0;
      for(const r of [3,7]){ blurMat.uniforms.t.value=rt.refl.texture; blurMat.uniforms.dir.value.set(r/rt.hw,0); pass(blurMat, rt.reflB);
        blurMat.uniforms.t.value=rt.reflB.texture; blurMat.uniforms.dir.value.set(0,r/rt.hh); pass(blurMat, rt.refl); }
      floorMat.uniforms.uHas.value=1;
    }
    const OFF={};   // debugging only (dosecurve.debug): parts switched off to find a fault
    let reflN=0, moving=false;
    function renderFull(){
      if(!rt || rt.w!==renderer.domElement.width || rt.h!==renderer.domElement.height) makeTargets(renderer.domElement.width, renderer.domElement.height);
      renderer.setClearColor(0,0);
      // the floor's faint, blurred reflection is redrawn every other frame while the camera moves (one frame's lag in a
      // 10% reflection can't be seen; the frame time it saves can) (2.15)
      reflN++; if(!(moving && reflN%2) || floorMat.uniforms.uHas.value===0) renderReflection();
      if(OFF.shafts) shafts.visible=false; if(OFF.floor) floor.visible=false; if(OFF.dust) dust.visible=false;
      // the scene
      renderer.setRenderTarget(rt.main); renderer.clear(); renderer.render(scene, camera);
      // the glow: emissive objects only, bright-passed and blurred twice
      const keep=camera.layers.mask; camera.layers.set(BLOOM); const fv=floor.visible; floor.visible=false;
      renderer.setRenderTarget(rt.bloom); renderer.clear(); renderer.render(scene, camera); camera.layers.mask=keep; floor.visible=fv;
      blurMat.uniforms.thr.value=.55; blurMat.uniforms.t.value=rt.bloom.texture; blurMat.uniforms.dir.value.set(1.5/rt.hw,0); pass(blurMat, rt.bloomB);
      blurMat.uniforms.thr.value=0; blurMat.uniforms.t.value=rt.bloomB.texture; blurMat.uniforms.dir.value.set(0,1.5/rt.hh); pass(blurMat, rt.bloom);
      blurMat.uniforms.t.value=rt.bloom.texture; blurMat.uniforms.dir.value.set(2/rt.bloomC.width,0); pass(blurMat, rt.bloomC);
      blurMat.uniforms.t.value=rt.bloomC.texture; blurMat.uniforms.dir.value.set(0,2/rt.bloomC.height); pass(blurMat, rt.bloomD);
      // the out-of-focus copy for depth of field
      blurMat.uniforms.t.value=rt.main.texture; blurMat.uniforms.dir.value.set(2.2/rt.hw,0); pass(blurMat, rt.halfB);
      blurMat.uniforms.t.value=rt.halfB.texture; blurMat.uniforms.dir.value.set(0,2.2/rt.hh); pass(blurMat, rt.half);
      const U=compMat.uniforms; U.tScene.value=rt.main.texture; U.tBlur.value=rt.half.texture; U.tBloom.value=rt.bloomD.texture; U.tDepth.value=rt.main.depthTexture;
      U.near.value=camera.near; U.far.value=camera.far;
      if(OFF.dof) U.aperture.value=0; if(OFF.bloom) U.bloomAmt.value=0;
      pass(compMat, null);
    }

    /* rendering: continuous while the sequence moves (inertia, the cold open, dust), on demand in the app */
    let raf=0, focusSm=14, post=full, slow=[], lastNow=0;
    // a governor: if the frames run slow while the stage animates, the passes switch off (Effects stay on)
    // (2.15) smoothness comes first: three frames over 20 ms within 4 s while the scene moves (or a slow average) and
    // the passes switch off for the rest of the visit, the picture drawn directly as tier 1 draws it
    let slowHits=[];
    // (and the glass steps down with them: transmission is a whole extra render of the scene each frame)
    const dropPasses=()=>{ post=false; renderer.toneMapping=THREE.ACESFilmicToneMapping; floorMat.uniforms.uHas.value=0; renderer.setRenderTarget(null);
      scene.traverse(o=>{ [].concat(o.material||[]).forEach(m=>{ if(m && m.transmission>0){ m.transmission=0; m.transparent=true; m.opacity=Math.min(m.opacity, 0.22); m.depthWrite=false; m.needsUpdate=true; } }); });
      Object.values(mats).forEach(M=> Object.values(M).forEach(m=>{ if(m && m.transmission>0){ m.transmission=0; m.transparent=true; m.opacity=Math.min(m.opacity, 0.22); m.needsUpdate=true; } })); };
    function govern(now){
      if(!post || !lastNow){ lastNow=now; return; }
      const dt=now-lastNow; lastNow=now; if(dt>250) return;   // a pause, not a slow frame
      if(moving && dt>21){ slowHits.push(now); slowHits=slowHits.filter(t=> now-t<4000); if(slowHits.length>=3){ dropPasses(); return; } }
      slow.push(dt); if(slow.length<40) return;
      const avg=slow.reduce((a,b)=>a+b,0)/slow.length; slow=[];
      if(avg>45) dropPasses();
    }
    function frame(force){ if(!raf) raf=requestAnimationFrame(render); if(force){ const t=target(); camNow.p.copy(t.p); camNow.l.copy(t.l); } }
    let lastDraw=0;
    function render(now){
      raf=0; let busy=false; const still=stillQ.matches;
      // when only the dust drifts, 30 frames a second are enough
      moving=(mode==="intro" && now-vSetAt<60) || !!camFrom || !!morph || !!pulseAt || coldOn() || coldT()<COLD_MS+400;
      if(!moving && mode==="intro" && !still && now-lastDraw<31){ frame(); return; }
      lastDraw=now;
      if(mode==="intro" && now-vSetAt<60) busy=true;   // the page's virtual scroll is moving (setP)
      if(mode==="intro" && (coldOn() || coldT()<COLD_MS+400) && !still) busy=true;
      if(camFrom && camTo){ const u=still ? 1 : clamp((now-camT0)/camDur,0,1), e=ease(u);
        camTo=target(); camNow.p.copy(camFrom.p).lerp(camTo.p,e); camNow.l.copy(camFrom.l).lerp(camTo.l,e); if(u<1) busy=true; else camFrom=null; }
      else { camTo=target(); const a=still || mode==="intro" ? 1 : .2; camNow.p.lerp(camTo.p,a); camNow.l.lerp(camTo.l,a); if(camNow.p.distanceTo(camTo.p)>1e-3) busy=true; }
      camera.position.copy(camNow.p); camera.lookAt(camNow.l);
      if(mode==="intro") beats(Psm===null ? Ptg : Psm, now);
      if(morph && groups.live){   // the app's ribbon eases into its new shape
        let left=0; groups.live.userData.ribbons.forEach((r,i)=>{ const ys=r.userData.ys, tg=morph[i], nx=new Float32Array(ys.length);
          for(let k=0;k<ys.length;k++){ const d=tg[k]-ys[k]; nx[k]=Math.abs(d)<1e-4 ? tg[k] : ys[k]+d*.3; left=Math.max(left, Math.abs(d)); } r.userData.writeY(nx); });
        placeCursor(); if(left>1e-3) busy=true; else morph=null;
      }
      const rg=groups.live && groups.live.getObjectByName("rings");   // the app: the new schedule's doses pulse in order
      // the drift toward a change eases out and back in about two seconds
      if(mode==="app"){ const back=now-drift.t0>1300; drift.cx+=((back ? 0 : drift.x)-drift.cx)*0.05; drift.cy+=((back ? 0 : drift.y)-drift.cy)*0.05;
        if(Math.abs(drift.cx)>1e-3 || Math.abs(drift.cy)>1e-3 || !back) busy=true; }
      if(rg && pulseAt){ const e=(now-pulseAt)/1000; rg.children.forEach((r,i)=>{ const a=clamp(e-i*0.12,0,1), s=a<1 ? 1+a*1.8 : 1; r.scale.set(s,s,s); r.material.opacity=a<1 ? .95-.6*a : .95; });
        if(e<rg.children.length*0.12+1) busy=true; else pulseAt=0; }
      // the light: first light in the cold open; exposure, focus and grade by the scene
      const L=coldLight(), lit=tone==="light";
      key.intensity=(lit ? 2.6 : 2.4)*L; rim.intensity=(lit ? .9 : 1.6)*L; fill.intensity=(lit ? .9 : .4)*L;
      const ex=(lit ? 1.12 : 1.0)*(.05+.95*L);
      dustMat.uniforms.uA.value=L; shaftMat.uniforms.uTime.value=now/1000;
      if(!still && mode==="intro"){ dustMat.uniforms.uTime.value=now/1000; busy=true; }
      // the focus pulls to the text as a headline arrives or leaves, and racks back onto the ribbon as the camera settles
      let textness=0;
      if(mode==="intro" && lastW && !still){ const Pv=Psm===null ? Ptg : Psm, i=clamp(Math.floor((Pv+0.5)/2),0,REST.length-1), u=Pv-2*i;
        textness=Math.max(1-band(u,-0.42,0.1), band(u,0.96,1.4)); if(i===0 && u<.1) textness=0; }
      const dist=camNow.p.distanceTo(camNow.l), want=lerp(dist, dist*.32, textness);
      focusSm+= (want-focusSm)*(still ? 1 : .12);
      if(busy) govern(now); else lastNow=0;
      if(post){ const U=compMat.uniforms; U.exposure.value=ex; U.focus.value=focusSm; U.aperture.value=mode==="intro" ? .6 : .25; U.bloomAmt.value=lit ? .3 : .8;
        U.gradeAmt.value=lit ? .25 : 1; U.ca.value=lit ? .0015 : mode==="intro" ? .006 : .003; renderFull(); }
      else { renderer.toneMappingExposure=ex; renderer.setRenderTarget(null); renderer.render(scene, camera); }
      if(busy && !document.hidden) frame();
    }
    let offset=null;
    function resize(){
      // the app's picture sits right of centre, clear of the controls; in the desktop workspace (2.14) it is centred,
      // behind the chart's glass
      const w=innerWidth, h=innerHeight, ws=w>=1100 && !D.classList.contains("ed-app") && !D.classList.contains("present");
      const off=w>760 && mode!=="intro" && !ws ? -w*0.24 : 0, k=w+"x"+h+"x"+off;
      if(k===offset) return; offset=k;
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.setSize(w,h,false);
      camera.aspect=w/h; camera.fov=w<h ? 46 : 34;
      // in the app the picture sits right of centre, clear of the controls; in the sequence it crosses the middle
      if(off) camera.setViewOffset(w, h, off, 0, w, h); else camera.clearViewOffset();
      camera.updateProjectionMatrix(); frame();
    }
    addEventListener("resize", ()=>{ offset=null; resize(); }); resize();
    document.addEventListener("visibilitychange", ()=>{ if(!document.hidden) frame(); });   // paused while hidden
    try{ if(localStorage.getItem("dosecurve.debug")) window.__dc3={THREE, scene, camera, renderer, floor, shafts, dust, groups, compMat, floorMat, OFF, frame:()=>frame()}; }catch(e){}
    scene.environment=envOf("dark");
    // distance fades into the page's own colour (exponential), as the floor's grid does
    scene.fog=new THREE.FogExp2(col(K.page), .016);
    if(D.classList.contains("intro-on")) buildIntro();
    applyTone();
    return {
      setLive, scroll:w=>scroll(w), frame, light6,
      setP:v=>{ Psm=Ptg=Math.max(0,v); vSetAt=performance.now(); frame(); },
      cursor:t=>{ curT=t; placeCursor(); placeFigure(); frame(); },
      draw1:()=> frame(),
      view:()=>{ if(mode==="app") moveTo(); },
      intro:()=>{ buildIntro(); },
      retheme:()=>{ K=tokensOf(D); Object.keys(mats).forEach(k=>{ Object.values(mats[k]).forEach(m=> m && m.dispose && m.dispose()); delete mats[k]; });
        tone=""; disposeGroup(groups.live); delete groups.live; if(D.classList.contains("intro-on")) buildIntro(); setTone(toneAt(lastW||where())); setLive(); },
      ready:()=>{ const r=precompile(); r.then(otherTone); return r; },
      dispose:()=>{ Object.values(groups).forEach(disposeGroup); if(rt) Object.values(rt).forEach(t=> t && t.dispose && t.dispose()); Object.values(envs).forEach(t=>t.dispose()); pmrem.dispose(); renderer.dispose(); host3d.remove(); }
    };
  }

  /* ---------- wiring ---------- */
  let scrollRaf=0;
  document.addEventListener("click",()=> setTimeout(setPill, 80));   // a case opened, an answer checked: the pill follows
  addEventListener("scroll",()=>{ if(!scrollRaf) scrollRaf=requestAnimationFrame(()=>{ scrollRaf=0; onScroll(); }); snapLater(); }, {passive:true});
  addEventListener("resize",()=> onScroll());
  // (the checks run once the page is idle, with or without the 3D stage: the SVG frame shows them too, and run on a
  // scroll they cost a frame mid-sequence)
  const prep=()=>{ if(D.classList.contains("intro-on")){ prepScenes(); paintFrames(); setTimeout(()=> (window.requestIdleCallback || (f=>setTimeout(f,100)))(runChecks, {timeout:3000}), 2500); } };
  prep(); onScroll(); setPill();
  load3d();
  // scene 1's frame draws on the cold open's clock (the CSS stage's SVG; the 3D ribbon keeps the same time)
  if(D.classList.contains("intro-on")) countUp();

  return {
    set(data){ live=data; cssPath(); if(three) three.setLive(); setPill(); },
    cursor(t){ if(three) three.cursor(t); },
    view(t){ if(t===tab && lastTop!==null) return setPill(); tab=t; lastTop=null; onScroll(); if(three) three.view(); setPill(); },
    pill(){ setPill(); if(!action || !action.el) return false; action.el.click(); setTimeout(setPill, 50); return true; },
    theme(){ K=tokensOf(D); cssPath(); scenes.forEach(s=>{ const v=s.querySelector(".scene-vis svg"); if(v) v.textContent=""; }); prep(); lastTop=null; onScroll(); if(three) three.retheme(); },
    fx(){ if(can3d()) load3d(); else if(three){ three.dispose(); three=null; D.classList.remove("stage3d"); if(D.classList.contains("intro-on")) paintFrames(); } },
    intro(){ prep(); if(three) three.intro(); else load3d(); onScroll(); drawn1=false; countUp(); setPill(); }
  };
}
