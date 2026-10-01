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
const REF_SRC="validation/reference-results.json?v=3e5c9bbc7c";   // stamped by content hash, like the page's files
const clamp=(v,a,b)=> Math.min(b, Math.max(a, v)), lerp=(a,b,u)=> a+(b-a)*u, ease=u=> u<.5 ? 4*u*u*u : 1-Math.pow(-2*u+2,3)/2;
const smooth=u=>{ u=clamp(u,0,1); return u*u*(3-2*u); };
const band=(u,a,b)=> smooth((u-a)/(b-a));
const TOKENS="accent band mec mtc mic b ghost text muted line page surface".split(" ");
const tokensOf=el=>{ const s=getComputedStyle(el), k={}; TOKENS.forEach(n=> k[n]=s.getPropertyValue("--c-"+n).trim()); return k; };
// the cold open's clock: from the navigation, so it keeps time with the page's CSS (black, then light, then the wordmark)
const COLD_MS=4200;

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
      sc.final=[fmt(d.cmax,1), fmt(d.auc,1), fmt(100*w.tIn/sc.T1,0)]; }
    // the same drug every 8 hours, six doses, over 48 h; and the first dose alone, to show what each dose stacks on
    sc.p2=S({dosing:"repeated", tau:8, nDoses:6}); sc.T2=48; sc.c2=sample(sc.p2, sc.T2, 320); sc.d2=PK.doseSchedule(sc.p2).map(x=>x.t);
    sc.c2one=sample(S({}), sc.T2, 320);
    // 200 virtual patients as the app's population mode makes them (clearance CV 30%, volume CV 20%, seed 1), with
    // the median and the 5th–95th percentile band at each time
    { const p=sc.p1, z=normals(PK.seededRandom(1)), w=cv=> Math.sqrt(Math.log(1+cv*cv)), wCL=w(.3), wV=w(.2), n=80;
      sc.pop=[]; for(let i=0;i<200;i++){ const eCL=wCL*z(), eV=wV*z(); sc.pop.push(sample(Object.assign({}, p, {V:p.V*Math.exp(eV), thalf:p.thalf*Math.exp(eV-eCL)}), 24, n)); }
      sc.med=[]; sc.lo=[]; sc.hi=[];
      for(let i=0;i<=n;i++){ const v=sc.pop.map(c=>c[i].c).sort((a,b)=>a-b), t=24*i/n;
        sc.med.push({t, c:(v[99]+v[100])/2}); sc.lo.push({t, c:v[10]}); sc.hi.push({t, c:v[189]}); } }
    // a two-compartment IV bolus: C = A·e^(−αt) + B·e^(−βt), the distribution and the elimination phase
    { const p=S({route:"iv", cmt:2, D:500, V:20, thalf:3, k12:0.9, k21:0.35}), d=PK.derived(p), C0=PK.conc(p,1e-9), a=d.alpha, b=d.beta;
      const A=C0*(a-p.k21)/(a-b), B=C0*(p.k21-b)/(a-b);
      sc.T4=24; sc.c4=sample(p, 24, 240); sc.pa=sc.c4.map(q=>({t:q.t, c:A*Math.exp(-a*q.t)})); sc.pb=sc.c4.map(q=>({t:q.t, c:B*Math.exp(-b*q.t)})); }
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
        if(i && i%6===0){ await new Promise(r=>setTimeout(r)); paintFrame(6); if(three) three.light6(); }
        const s=REF.scenarios[i], p=S(s.scenario), w=PK.windowStats(p,T,mec,mtc,s.site), level=s.site==="effect" ? PK.ceConc : PK.conc, r=s.reference;
        const tol=100*(s.nonlinear ? REF.tolerance.nonlinear : REF.tolerance.linear), tpp=s.nonlinear ? REF.tolerance.tin_pp_nonlinear : REF.tolerance.tin_pp_linear;
        const trough=level(p,(p.dosing==="repeated" ? p.nDoses*p.tau : T)-1e-9);
        sc.checks.push(Math.abs(pct(w.cmax,r.peak))<=tol, Math.abs(pct(trough,r.trough))<=tol, Math.abs(pct(w.auc,r.auc))<=tol, Math.abs(100*w.tIn/T-r.tin_pct)<=tpp);
      }
      paintFrame(6); if(three) three.light6();
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
      for(let i=0;i<=4;i++){ const t=T*i/4; g.add("text",{x:x(t), y:H-8, "text-anchor":"middle", "font-family":"IBM Plex Mono", "font-size":12, fill:k.muted}).textContent=(+t.toFixed(1))+(i===4 ? " h" : ""); } }
    return g;
  }
  const win=(g,k,mec,mtc)=>{ g.add("rect",{x:g.m.l, y:g.y(mtc), width:g.iw, height:g.y(mec)-g.y(mtc), fill:k.band, "fill-opacity":.1});
    [[mtc,k.mtc],[mec,k.mec]].forEach(([c,col])=> g.add("line",{x1:g.m.l, x2:g.m.l+g.iw, y1:g.y(c), y2:g.y(c), stroke:col, "stroke-dasharray":"5 4", "stroke-width":1.2})); };
  const vis=n=> scenes[n-1] && scenes[n-1].querySelector(".scene-vis svg");
  let drawU=1;
  function paintFrame(n){
    const svg=vis(n); if(!svg) return;
    const k=tokensOf(scenes[n-1]), dark=scenes[n-1].dataset.tone==="dark" && !D.classList.contains("light"), c=dark ? k.accent : k.text;
    if(n===1 || n===2 || n===7){
      if(!svg.firstChild){ const g=frame(svg, sc.T1, 14, k, {bare:n!==1}); if(n===1) win(g,k,V0.mec,V0.mtc);
        if(n===1){ svg.appendChild(svgEl("clipPath",{id:"s1clip"})).appendChild(svgEl("rect",{id:"s1wipe", x:0, y:0, width:600, height:340})); }
        const a={stroke:c, "stroke-width":n===2 ? 3 : 2.6, "stroke-linejoin":"round"}; if(n===1) a["clip-path"]="url(#s1clip)"; g.path(sc.c1,a); }
      if(n===1){ const w=$("s1wipe"); if(w) w.setAttribute("width", 24+drawU*552+4); }
      return;
    }
    if(svg.firstChild && n!==6) return;
    if(n===3){ const top=Math.max(...sc.c2.map(q=>q.c))*1.12, g=frame(svg, sc.T2, top, k); win(g,k,V0.mec,Math.min(V0.mtc,top*.98));
      g.path(sc.c2,{stroke:c, "stroke-width":2.4, "stroke-linejoin":"round"});
      sc.d2.forEach(t=>[6,11].forEach((r,j)=> g.add("circle",{cx:g.x(t), cy:g.m.t+g.ih, r, fill:"none", stroke:c, "stroke-opacity":j ? .35 : .9}))); }
    if(n===4){ const g=frame(svg, 24, 16, k); win(g,k,V0.mec,V0.mtc);
      sc.pop.forEach(cv=> g.path(cv,{stroke:c, "stroke-opacity":.12, "stroke-width":1})); g.path(sc.med,{stroke:c, "stroke-width":2.6}); }
    if(n===5){ const g=frame(svg, sc.T4, sc.c4[0].c*1.5, k, {log:true, floor:sc.c4[sc.c4.length-1].c*0.5});
      g.path(sc.pa,{stroke:k.mic, "stroke-width":1.8, "stroke-dasharray":"6 5"}); g.path(sc.pb,{stroke:k.band, "stroke-width":1.8, "stroke-dasharray":"6 5"});
      g.path(sc.c4,{stroke:c, "stroke-width":2.6});
      [["distribution, α", sc.pa, k.mic, 18],["elimination, β", sc.pb, k.band, 150]].forEach(([lb,pts,col,i])=>
        g.add("text",{x:g.x(pts[i].t)+8, y:g.y(pts[i].c)-8, "font-family":"IBM Plex Sans", "font-size":13, fill:col}).textContent=lb); }
    if(n===6){
      if(!svg.firstChild) sphere(sc.nChecks).forEach(([x,y,z],i)=>{ if(z<-0.05) return; const e=svgEl("circle",{cx:300+150*x, cy:170-150*y, r:1.4+1.4*z}); e.dataset.i=i; svg.appendChild(e); });
      for(const el of svg.children){ const i=+el.dataset.i; el.setAttribute("fill", i<sc.checks.length ? (sc.checks[i] ? k.band : k.mtc) : k.line); }
    }
  }
  const paintFrames=()=>{ for(let n=1;n<=7;n++) paintFrame(n); };

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
  // the scenes' text: in as its frame arrives, out as it leaves; the hero's readouts land one by one (beat 3)
  let lastVars="";
  // settle: once scrolling stops, every headline is either fully shown or fully gone (never left half faded)
  function textVars(P, settle){
    const still=stillQ.matches, out=[], r=v=> settle ? Math.round(v) : v;
    scenes.forEach((s,i)=>{
      const u=P-2*i;
      const vin=r(still || (i===0 && u<=0.06) ? 1 : band(u,-0.42,0.06)), vin2=r(still || (i===0 && u<=0.1) ? 1 : band(u,-0.3,0.18)), vout=r(still ? 0 : band(u,0.96,1.42));
      s.style.setProperty("--in", vin.toFixed(3)); s.style.setProperty("--in2", vin2.toFixed(3)); s.style.setProperty("--out", vout.toFixed(3));
      out.push(vin.toFixed(2), vout.toFixed(2));
      if(i===0){ const ro=k=> still ? 1 : r(band(u, 0.6+0.08*k, 0.7+0.08*k));
        [1,2,3].forEach(k=> s.style.setProperty("--ro"+k, ro(k-1).toFixed(3))); }
    });
    if(P>0.04) D.classList.add("cued");
    lastVars=out.join(",");
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
  const coldDraw=()=> stillQ.matches || !D.classList.contains("intro-on") ? 1 : coldOn() || coldT()<COLD_MS ? smooth((coldT()-coldStart()-100)/Math.max(900, Math.min(1900, COLD_MS-coldStart()-500))) : 1;
  // gentle snap: when the scrolling stops close to a resting frame (within a tenth of a screen), settle on it; never
  // during a scene change, never under reduced motion. (CSS proximity snapping, with frames this close together,
  // behaved as mandatory and fought slow scrolling.)
  let snapTimer=0, snapping=false;
  function snapLater(){
    clearTimeout(snapTimer);
    if(!D.classList.contains("intro-on") || snapping) return;
    D.classList.remove("settle");
    snapTimer=setTimeout(()=>{
      const w=where();
      if(D.classList.contains("intro-on") && w.P>=-1){ D.classList.add("settle"); textVars(w.P, true); }
      if(!w.inIntro || w.P<0) return;
      if(stillQ.matches) return;
      const i=Math.floor(w.P/2), u=w.P-2*i; if(u>1.04) return;
      let best=null; (i===0 ? [0,.5,.82] : [.18,.5,.82]).forEach(r=>{ if(Math.abs(u-r)<.1 && (best===null || Math.abs(u-r)<Math.abs(u-best))) best=r; });
      if(best===null || Math.abs(u-best)<.006) return;
      snapping=true; scrollTo({top:intro.offsetTop+(2*i+best)*innerHeight, behavior:"smooth"}); setTimeout(()=>{ snapping=false; }, 700);
    }, 240);
  }
  let lastIn=null, lastTop=null;
  function onScroll(){
    const w=where(), top=toneAt(where(30));
    if(w.inIntro!==lastIn){ lastIn=w.inIntro; D.classList.toggle("in-intro", w.inIntro); setPill(); }
    if(top!==lastTop){ lastTop=top; D.classList.toggle("tone-light", top==="light" && !D.classList.contains("light")); }
    if(D.classList.contains("intro-on") && w.P>=-1) textVars(w.P);
    if(w.inIntro && w.g>=4) runChecks();
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
    return threeLoading=import("three").then(async THREE=>{ if(!can3d()){ threeLoading=null; return; } const t=build(THREE, tierOf()); t.setLive(); await t.ready(); threeLoading=null;
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
    const APPX=120;   // the app's own place in the world: the sequence flies there and the simulator is simply there

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
      M.K=K2;
      return mats[t]=M;
    }

    /* the ribbon: a swept mesh with thickness and bevelled edges, its profile a rounded rectangle across the curve */
    const PROF=(()=>{ const hw=.17, ht=.052, r=.044, seg=3, out=[];
      [[ht-r, hw-r, 0],[-(ht-r), hw-r, Math.PI/2],[-(ht-r), -(hw-r), Math.PI],[ht-r, -(hw-r), 1.5*Math.PI]].forEach(([cn,cz,a0])=>{
        for(let s=0;s<=seg;s++){ const a=a0+(Math.PI/2)*s/seg, nn=Math.cos(a), nz=Math.sin(a); out.push([cn+r*nn, cz+r*nz, nn, nz]); } });
      return out; })();
    const NP=PROF.length;
    function sweep(xs, ys, z, scale=1){
      const N=xs.length, pos=new Float32Array(N*NP*3), nor=new Float32Array(N*NP*3), idx=new Uint32Array((N-1)*NP*6);
      let k=0;
      for(let i=0;i<N-1;i++) for(let j=0;j<NP;j++){ const a=i*NP+j, b=i*NP+(j+1)%NP, c=(i+1)*NP+j, d=(i+1)*NP+(j+1)%NP; idx.set([a,c,b, b,c,d], k); k+=6; }
      const geo=new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos,3)); geo.setAttribute("normal", new THREE.BufferAttribute(nor,3)); geo.setIndex(new THREE.BufferAttribute(idx,1));
      geo.userData={xs:Float32Array.from(xs), z, scale};
      writeSweep(geo, ys); return geo;
    }
    function writeSweep(geo, ys){
      const {xs, z, scale}=geo.userData, N=xs.length, pos=geo.attributes.position.array, nor=geo.attributes.normal.array;
      for(let i=0;i<N;i++){
        const i0=Math.max(0,i-1), i1=Math.min(N-1,i+1); let tx=xs[i1]-xs[i0], ty=ys[i1]-ys[i0]; const l=Math.hypot(tx,ty)||1; tx/=l; ty/=l;
        const nx=-ty, ny=tx;
        for(let j=0;j<NP;j++){ const [pn,pz,cn,cz]=PROF[j], o=(i*NP+j)*3;
          pos[o]=xs[i]+nx*pn*scale; pos[o+1]=ys[i]+ny*pn*scale; pos[o+2]=z+pz*scale; nor[o]=nx*cn; nor[o+1]=ny*cn; nor[o+2]=cz; }
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
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(220, 60), floorMat); floor.rotation.x=-Math.PI/2; floor.position.set(60, 0, -6); floor.renderOrder=-1;
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
    const dust=(()=>{ const n=full ? 900 : 260, pos=new Float32Array(n*3), seed=new Float32Array(n), R=PK.seededRandom(7);
      for(let i=0;i<n;i++){ pos.set([-20+160*R(), .2+8*R(), -14+24*R()], i*3); seed[i]=R(); }
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
    [[-3.5,0],[ -1.2,.6],[21,0],[25,.4],[93,0],[97.5,.5]].forEach(([x,o])=>{
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
      }
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
    function placeCursor(){
      const g=groups.live, m=g && g.getObjectByName("cur"); if(!m) return;
      const i0=live.curves.findIndex(cv=>!cv.ghost), r=g.userData.ribbons[i0], T=g.userData.T, t=curT===null ? -1 : curT-live.T[0];
      if(!r || t<0 || t>T){ m.visible=false; return; }
      const ys=r.userData.ys, f=t/T*(ys.length-1), i=Math.min(ys.length-2, Math.floor(f)), u=f-i, y=ys[i]*(1-u)+ys[i+1]*u;
      m.visible=true; m.position.set(X(t,T), 0, r.userData.z); m.getObjectByName("dot").position.y=y; m.getObjectByName("line").scale.y=Math.max(.001, y);
    }

    /* the sequence's objects, placed along the x axis; the camera travels between them */
    const SX=[0,24,48,72,96];   // close enough that the next scene comes into view as the camera travels
    let popPts=null;
    function buildIntro(){
      prepScenes();
      ["s1","s3","s4","s5","s6","strand"].forEach(k=>{ disposeGroup(groups[k]); delete groups[k]; });
      const g1=groups.s1=new THREE.Group(); scene.add(g1);
      const r1=ribbon(sc.c1, sc.T1, 14, {curtain:!phoneQ.matches}); r1.name="r"; g1.add(r1);
      const h1=head(); g1.add(h1);
      if(phoneQ.matches){ setVis(); return; }   // phones: the single ribbon; the other scenes keep their SVG frames
      const w1=windowPlate(14, V0.mec, V0.mtc); w1.name="win"; g1.add(w1);
      // Simulate: the regimen, and the first dose alone (what the second stacks on)
      const top2=Math.max(...sc.c2.map(q=>q.c))*1.1, g3=groups.s3=new THREE.Group(); g3.position.x=SX[1]; scene.add(g3);
      const r3=ribbon(sc.c2, sc.T2, top2); r3.name="r"; g3.add(r3);
      const one=ribbon(sc.c2one, sc.T2, top2, {ghost:true, curtain:false, z:-.3}); one.name="one"; g3.add(one);
      const w3=windowPlate(top2, V0.mec, V0.mtc); w3.name="win"; g3.add(w3);
      const rg=rings(sc.d2, sc.T2); rg.name="rings"; g3.add(rg); const h3=head(); g3.add(h3);
      // Learn: 200 patients as points, revealed one by one, then condensing into the median and the band
      const g4=groups.s4=new THREE.Group(); g4.position.x=SX[2]; scene.add(g4);
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
        const w4=windowPlate(16, V0.mec, V0.mtc); w4.name="win"; g4.add(w4); }
      // Cases: the two phases, the axis turning logarithmic in front of the camera
      const g5=groups.s5=new THREE.Group(); g5.position.x=SX[3]; scene.add(g5);
      { const fl=sc.c4[sc.c4.length-1].c*0.5, top=sc.c4[0].c*1.5, lin=c=> YH*c/top, lg=c=> YH*(Math.log10(Math.max(c,fl))-Math.log10(fl))/(Math.log10(top)-Math.log10(fl));
        const mk=(pts, name, o)=>{ const r=ribbon(pts, sc.T4, top, Object.assign({curtain:false}, o)); r.name=name; r.userData.lin=Float32Array.from(pts, q=>lin(q.c)); r.userData.lg=Float32Array.from(pts, q=>lg(q.c)); g5.add(r); return r; };
        mk(sc.c4, "r", {}); mk(sc.pa, "a", {thin:true, b:true}); mk(sc.pb, "b", {thin:true, bronze:true, noGlow:true}); }
      // Validated: one point per check, lit as the checks pass
      const g6=groups.s6=new THREE.Group(); g6.position.set(SX[4], 2.4, 0); scene.add(g6);
      { const pts=sphere(sc.nChecks), pos=new Float32Array(pts.length*3), cols=new Float32Array(pts.length*3), off=col(P.line);
        pts.forEach(([x,y,z],i)=>{ pos.set([2.6*x,2.6*y,2.6*z], i*3); cols.set([off.r,off.g,off.b], i*3); });
        const geo=new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos,3)); geo.setAttribute("color", new THREE.BufferAttribute(cols,3));
        const m=new THREE.ShaderMaterial({transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, premultipliedAlpha:true, vertexColors:true, uniforms:{uScale:{value:full ? 44 : 34}},
          vertexShader:"uniform float uScale; varying vec3 vC; void main(){ vC=color; vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv; gl_PointSize=uScale/max(-mv.z,.5); }",
          fragmentShader:"varying vec3 vC; void main(){ vec2 c=gl_PointCoord-.5; float r=dot(c,c); if(r>.25) discard; float a=(1.-smoothstep(.0,.25,r)); a*=a; gl_FragColor=vec4(vC*a*2.2,a); }"});
        const pts3=new THREE.Points(geo, m); pts3.name="pts"; pts3.layers.enable(BLOOM); g6.add(pts3);
        g6.add(new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(2.58, 3)), new THREE.LineBasicMaterial({color:col(P.line), transparent:true, opacity:.18}))); }
      // the strand: the ribbon travelling on between scenes, from the end of each curve to the start of the next, under the
      // sphere and on to the simulator's own curve, so the camera always follows one object
      { const st=groups.strand=new THREE.Group(); scene.add(st);
        const endOf=(g,r,last)=>{ const k=last ? r.userData.n-1 : 0; return [g.position.x+r.userData.xs[k], r.userData.ys[k]]; };
        const legs=[[endOf(g1,r1,1), endOf(g3,r3,0)], [endOf(g3,r3,1), endOf(groups.s4, groups.s4.getObjectByName("med"),0)],
          [endOf(groups.s4, groups.s4.getObjectByName("med"),1), endOf(groups.s5, groups.s5.getObjectByName("r"),0)],
          [endOf(groups.s5, groups.s5.getObjectByName("r"),1), [SX[4]-1, .16]], [[SX[4]+1, .16], [APPX-6, .05]]];
        legs.forEach(([a,b])=>{ const n=72, xs=[], ys=[];
          for(let i=0;i<n;i++){ const u=i/(n-1), e=u*u*(3-2*u); xs.push(lerp(a[0],b[0],u)); ys.push(lerp(a[1],b[1],e)+Math.sin(Math.PI*u)*.18); }
          const geo=sweep(xs, ys, 0, .42), mD=new THREE.Mesh(geo, matsOf("dark").core), mL=new THREE.Mesh(geo, matsOf("light").core);
          mD.layers.enable(BLOOM); mD.name="dark"; mL.name="light";
          const leg=new THREE.Group(); leg.add(mD, mL); leg.userData.tone=t=>{ mD.visible=t!=="light"; mL.visible=t==="light"; }; leg.userData.tone(tone); st.add(leg); });
        // under the sphere, the strand passes as a short, faint arc
        const arc=[], ax=[], ay=[]; for(let i=0;i<40;i++){ const u=i/39; ax.push(lerp(SX[4]-1, SX[4]+1, u)); ay.push(.16); }
        const ag=sweep(ax, ay, 0, .42), aD=new THREE.Mesh(ag, matsOf("dark").core), aL=new THREE.Mesh(ag, matsOf("light").core); aD.layers.enable(BLOOM);
        const al=new THREE.Group(); al.add(aD, aL); al.userData.tone=t=>{ aD.visible=t!=="light"; aL.visible=t==="light"; }; al.userData.tone(tone); st.add(al); }
      setVis(); light6(); applyTone();
    }
    let k6=0;
    function light6(){
      const p=groups.s6 && groups.s6.getObjectByName("pts"); if(!p) return;
      const upto=Math.round(k6*sc.nChecks), on=col(P.band).multiplyScalar(1.4), off=col(P.line).multiplyScalar(.6), bad=col(P.mtc), a=p.geometry.attributes.color;
      for(let i=0;i<a.count;i++){ const c=i<Math.min(upto, sc.checks.length) ? (sc.checks[i] ? on : bad) : off; a.setXYZ(i, c.r, c.g, c.b); }
      a.needsUpdate=true; frame();
    }
    // depth-sorted points (they're additive, but sorting keeps their brightest from flickering as the camera moves)
    let sortAt=0;
    function sortPop(now){
      if(!popPts || now-sortAt<160) return; sortAt=now;
      const geo=popPts.geometry, pos=geo.attributes.position.array, idx=geo.index.array, N=idx.length, cam=camera.position, ox=popPts.parent.position.x;
      const d=new Float32Array(N); for(let i=0;i<N;i++){ const dx=pos[i*3]+ox-cam.x, dy=pos[i*3+1]-cam.y, dz=pos[i*3+2]-cam.z; d[i]=dx*dx+dy*dy+dz*dz; }
      const ord=Array.from(idx).sort((a,b)=> d[b]-d[a]); idx.set(ord); geo.index.needsUpdate=true;
    }

    /* the camera: the sequence's resting frames (three per scene) on one path; a framing per tab in the app */
    const V=(x,y,z)=> new THREE.Vector3(x,y,z);
    const REST=[ // scene, [camera, target] at u = 0.18, 0.5, 0.82 of its pinned screen
      [[V(0,1.9,15),V(0,1.6,0)], [V(-3.2,3.3,14),V(0,1.4,0)], [V(2.6,2.4,13.2),V(.4,1.4,0)]],
      [[V(-8.5,.9,8.4),V(-3,1.2,0)], [V(-1,1.05,7.4),V(2,1.05,0)], [V(6.2,2.6,10.5),V(3,1.1,0)]],
      [[V(SX[1]-6.2,2.3,10),V(SX[1]-3.4,2.9,0)], [V(SX[1]-4,2.5,10.5),V(SX[1]-1.8,2.9,0)], [V(SX[1]+2,3.4,13.5),V(SX[1]+3.4,3,0)]],
      [[V(SX[2]-7,4.4,16),V(SX[2]-2.5,1.5,0)], [V(SX[2]-3,3,13),V(SX[2]-1.5,1.6,0)], [V(SX[2]+1,2.1,11.5),V(SX[2]+.5,1.5,0)]],
      [[V(SX[3]-8,3.4,12),V(SX[3]-4,2.4,0)], [V(SX[3]-4.2,2.6,7),V(SX[3]-3,2,0)], [V(SX[3]+2,3.8,13),V(SX[3]+1,2,0)]],
      [[V(SX[4]+.6,2.6,5.4),V(SX[4],2.4,0)], [V(SX[4]-1.2,2.8,7.8),V(SX[4],2.4,0)], [V(SX[4],3.4,12.5),V(SX[4],2.3,0)]],
      [[V(SX[4]+10,3.2,15),V(APPX-4,1.8,0)], [V(APPX-9.5,5.4,18),V(APPX-.8,2.2,0)], [V(APPX-7.5,4.6,16),V(APPX-.6,2.6,0)]]];
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
    // a phone in portrait sees a narrow slice: the camera stands back so the whole ribbon shows
    const PH=[V(0,3.4,42),V(0,-3.6,0)], PHA=[V(APPX,3.4,42),V(APPX,-3.6,0)];
    let mode="app", camFrom=null, camTo=null, camT0=0, camDur=900, scrollS=0, lastW=null;
    let Psm=null, Ptg=0;   // the scroll position, smoothed (inertia)
    const camNow={p:V(0,0,0), l:V(0,0,0)};
    function target(){
      const portrait=phoneQ.matches && innerWidth<innerHeight;
      if(mode==="intro"){
        if(portrait) return {p:PH[0].clone(), l:PH[1].clone()};
        const still=stillQ.matches, Pv=still ? restOf(Psm===null ? Ptg : Psm) : (Psm===null ? Ptg : Psm), t=pathAt(Pv);
        // the cold open: the camera starts close on the peak in the dark and pulls back to the first resting frame
        const e=coldOn() || coldT()<COLD_MS ? ease(clamp((coldT()-250)/(COLD_MS-400),0,1)) : 1;
        if(e<1 && !still){ t.p.lerpVectors(COLD[0], t.p, e); t.l.lerpVectors(COLD[1], t.l, e); }
        return t;
      }
      if(portrait) return {p:PHA[0].clone(), l:PHA[1].clone()};
      const f=FR[tab]||FR.sim, d=scrollS;
      return {p:f[0].clone().add(V(1.2*d,-0.9*d,0.8*d)), l:f[1].clone().add(V(1.2*d,-0.2*d,0))};
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
      Ptg=Math.max(0, w.P); if(Psm===null || stillQ.matches) Psm=Ptg;
      const max=Math.max(1, D.scrollHeight-innerHeight), start=w.inIntro ? 0 : (D.classList.contains("intro-on") ? intro.offsetTop+intro.offsetHeight : 0);
      scrollS=clamp((scrollY-start)/Math.max(1,max-start),0,1);
      if(was!==mode && !quiet){ setVis(); moveTo(); return; }
      if(mode==="intro") canvas.style.opacity=phoneQ.matches ? (w.g<1 ? 1 : 0) : "";
      else canvas.style.opacity="";
      setVis(); camFrom=null; frame();
    }
    // the beats: what each scene's objects do at the smoothed scroll position
    function beats(Pv, now){
      const u=i=> Pv-2*i;
      if(groups.s1){ const r=groups.s1.getObjectByName("r"), dr=coldDraw(); r.userData.setDraw(dr);
        const hd=groups.s1.getObjectByName("head"), n=r.userData.n, k=Math.min(n-1, Math.round((n-1)*dr));
        hd.userData.place(r.userData.xs[k], r.userData.ys[k], 0, dr<1 ? 1 : Math.max(0, 1-(coldT()-2700)/900)*(tone==="light" ? 0 : 1));
        const w1=groups.s1.getObjectByName("win"); if(w1) w1.userData.rise(stillQ.matches ? 1 : D.classList.contains("intro-on") ? band(u(0),0.28,0.56) : 1); }
      if(groups.s3){ const r=groups.s3.getObjectByName("r"), one=groups.s3.getObjectByName("one"), U=u(2);
        // one dose (to 8 h), a second stacking on what is left (to 16 h), then the climb to steady state (to 48 h)
        const tEnd=stillQ.matches ? sc.T2 : U<.36 ? lerp(0.5, 8, band(U,-0.3,.3)) : U<.66 ? lerp(8, 16, band(U,.36,.62)) : lerp(16, sc.T2, band(U,.66,1));
        const dr=tEnd/sc.T2; r.userData.setDraw(dr);
        one.visible=U>.3 && U<1.2; one.userData.setDraw(1);
        const n=r.userData.n, k=Math.min(n-1, Math.round((n-1)*dr)), hd=groups.s3.getObjectByName("head");
        hd.userData.place(r.userData.xs[k], r.userData.ys[k], 0, dr<.995 && tone!=="light" ? 1 : 0);
        groups.s3.getObjectByName("rings").children.forEach(m=>{ const a=clamp((tEnd-m.userData.t)/3,0,1), s=a>0 && a<1 ? 1+a*2.2 : 1; m.scale.set(s,s,s); m.material.opacity=a<=0 ? .2 : a<1 ? 1-.7*a : .9; }); }
      if(groups.s4 && popPts){ const U=u(3), mt=popPts.material.uniforms;
        mt.uReveal.value=stillQ.matches ? 1 : band(U,-0.2,.5)*1.04; mt.uCond.value=stillQ.matches ? 1 : band(U,.55,.95);
        const sheet=groups.s4.getObjectByName("band"); sheet.material.opacity=.16*mt.uCond.value;
        groups.s4.getObjectByName("med").userData.setDraw(stillQ.matches ? 1 : band(U,.5,.9)); sortPop(now); }
      if(groups.s5){ const U=u(4), lg=stillQ.matches ? 1 : band(U,.32,.62), sep=stillQ.matches ? 1 : band(U,.68,.95);
        ["r","a","b"].forEach(nm=>{ const r=groups.s5.getObjectByName(nm), L=r.userData.lin, G=r.userData.lg, ys=new Float32Array(L.length);
          for(let i=0;i<L.length;i++) ys[i]=lerp(L[i], G[i], lg); if(r.userData.lastLg!==lg){ r.userData.writeY(ys); r.userData.lastLg=lg; } });
        groups.s5.getObjectByName("a").position.z=1.5*sep; groups.s5.getObjectByName("b").position.z=-1.5*sep; }
      if(groups.s6){ const U=u(5), k=stillQ.matches ? 1 : band(U,-0.1,.62); if(Math.abs(k-k6)>.004){ k6=k; light6(); } groups.s6.rotation.y=(stillQ.matches ? .3 : U*.9); }
    }
    function setVis(){
      const intro=mode==="intro";
      ["s1","s3","s4","s5","s6","strand"].forEach(k=>{ if(groups[k]) groups[k].visible=intro; });
      // the app's scenario appears as the sequence reaches it ("Open"), and stays
      if(groups.live) groups.live.visible=!intro || (lastW && lastW.P>12.4);
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
    function renderFull(){
      if(!rt || rt.w!==renderer.domElement.width || rt.h!==renderer.domElement.height) makeTargets(renderer.domElement.width, renderer.domElement.height);
      renderer.setClearColor(0,0);
      renderReflection();
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
    function govern(now){
      if(!post || !lastNow){ lastNow=now; return; }
      const dt=now-lastNow; lastNow=now; if(dt>250) return;   // a pause, not a slow frame
      slow.push(dt); if(slow.length<40) return;
      const avg=slow.reduce((a,b)=>a+b,0)/slow.length; slow=[];
      if(avg>45){ post=false; renderer.toneMapping=THREE.ACESFilmicToneMapping; floorMat.uniforms.uHas.value=0; renderer.setRenderTarget(null); }
    }
    function frame(force){ if(!raf) raf=requestAnimationFrame(render); if(force){ const t=target(); camNow.p.copy(t.p); camNow.l.copy(t.l); } }
    let lastDraw=0;
    function render(now){
      raf=0; let busy=false; const still=stillQ.matches;
      // when only the dust drifts, 30 frames a second are enough
      const moving=(mode==="intro" && Psm!==null && Math.abs(Ptg-Psm)>1e-4) || !!camFrom || !!morph || !!pulseAt || coldOn() || coldT()<COLD_MS+400;
      if(!moving && mode==="intro" && !still && now-lastDraw<31){ frame(); return; }
      lastDraw=now;
      if(mode==="intro" && Psm!==null && !still){ const d=Ptg-Psm; if(Math.abs(d)>1e-4){ Psm+=d*.14; busy=true; } else Psm=Ptg; }
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
      const w=innerWidth, h=innerHeight, off=w>760 && mode!=="intro" ? -w*0.24 : 0, k=w+"x"+h+"x"+off;
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
      cursor:t=>{ curT=t; placeCursor(); frame(); },
      draw1:()=> frame(),
      view:()=>{ if(mode==="app") moveTo(); },
      intro:()=>{ buildIntro(); },
      retheme:()=>{ K=tokensOf(D); Object.keys(mats).forEach(k=>{ Object.values(mats[k]).forEach(m=> m && m.dispose && m.dispose()); delete mats[k]; });
        tone=""; disposeGroup(groups.live); delete groups.live; if(D.classList.contains("intro-on")) buildIntro(); setTone(toneAt(lastW||where())); setLive(); },
      ready:()=> (renderer.compileAsync ? renderer.compileAsync(scene, camera).catch(()=>{}) : Promise.resolve()),
      dispose:()=>{ Object.values(groups).forEach(disposeGroup); if(rt) Object.values(rt).forEach(t=> t && t.dispose && t.dispose()); Object.values(envs).forEach(t=>t.dispose()); pmrem.dispose(); renderer.dispose(); host3d.remove(); }
    };
  }

  /* ---------- wiring ---------- */
  let scrollRaf=0;
  document.addEventListener("click",()=> setTimeout(setPill, 80));   // a case opened, an answer checked: the pill follows
  addEventListener("scroll",()=>{ if(!scrollRaf) scrollRaf=requestAnimationFrame(()=>{ scrollRaf=0; onScroll(); }); snapLater(); }, {passive:true});
  addEventListener("resize",()=> onScroll());
  const prep=()=>{ if(D.classList.contains("intro-on")){ prepScenes(); paintFrames(); if(!D.classList.contains("fx-off") && !phoneQ.matches) setTimeout(runChecks, 2500); } };
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
