/* DoseCurve stage
   The hero object that travels through the site, and the root sequence above the app. The page imports this file
   after its first paint, calls start(PK, host) and then hands it, after every change, the curves its chart has just
   drawn: the stage draws them as a 3D ribbon, so the two can never disagree. The sequence's own scenes come from the
   same engine: the default scenario, a regimen, 200 virtual patients, a two-compartment drug, and the 146 scenarios
   the validation page checks against an independent solver.

   With Effects on and WebGL available it draws with Three.js, pinned in the page's import map (cdnjs, with hashes):
   a luminous ribbon in dark sections, solid graphite in light ones, passing over the headlines in the sequence and
   behind the glass panels in the app. Otherwise it draws the CSS stage's path and each scene's frame in SVG. Phones
   get the single ribbon. It renders only when something changes. Educational model, not for clinical dosing. */

const D=document.documentElement, $=id=>document.getElementById(id), NS="http://www.w3.org/2000/svg";
const phoneQ=matchMedia("(max-width:760px)"), stillQ=matchMedia("(prefers-reduced-motion: reduce)");
const REF_SRC="validation/reference-results.json?v=fee9fced8e";   // stamped by content hash, like the page's files
const clamp=(v,a,b)=> Math.min(b, Math.max(a, v)), lerp=(a,b,u)=> a+(b-a)*u, ease=u=> u<.5 ? 4*u*u*u : 1-Math.pow(-2*u+2,3)/2;
const smooth=u=>{ u=clamp(u,0,1); return u*u*(3-2*u); };
const TOKENS="accent band mec mtc mic b ghost text muted line page surface".split(" ");
const tokensOf=el=>{ const s=getComputedStyle(el), k={}; TOKENS.forEach(n=> k[n]=s.getPropertyValue("--c-"+n).trim()); return k; };

export function start(PK){
  const fmt=(v,dp)=> v.toLocaleString(undefined,{minimumFractionDigits:dp, maximumFractionDigits:dp});
  const intro=$("intro"), scenes=[...document.querySelectorAll("#intro .scene")];
  let K=tokensOf(D), live=null, tab="sim", three=null, threeLoading=null;

  /* ---------- the engine's scenes ---------- */
  const S=o=> PK.normalizeScenario(PK.scenario(o)), V0=PK.VIEW_DEFAULTS;
  const sample=(p,T,n)=>{ const ev=PK.doseEvents(p), out=[]; for(let i=0;i<=n;i++){ const t=T*i/n; out.push({t, c:PK.conc(p,t,ev)}); } return out; };
  const sc={};
  // the default scenario, and the three readouts read off its curve as it is drawn: Cmax as it climbs; the AUC
  // observed so far plus C(t)/kₑ, the usual extrapolation to infinity; the time in the window so far
  sc.p1=S({}); sc.T1=V0.duration; sc.c1=sample(sc.p1, sc.T1, 240);
  { const d=PK.derived(sc.p1), w=PK.windowStats(sc.p1, sc.T1, V0.mec, V0.mtc), ke=Math.LN2/d.thalfEff;
    let cm=0, auc=0, tin=0;
    sc.cum=sc.c1.map((q,i)=>{ if(i){ const m=(sc.c1[i-1].c+q.c)/2, dt=sc.T1/240; auc+=m*dt; if(m>=V0.mec && m<=V0.mtc) tin+=dt; } cm=Math.max(cm,q.c); return [cm, auc+q.c/ke, 100*tin/sc.T1]; });
    sc.final=[fmt(d.cmax,1), fmt(d.auc,1), fmt(100*w.tIn/sc.T1,0)]; }
  // the same drug every 8 hours, six doses, over 48 h
  sc.p2=S({dosing:"repeated", tau:8, nDoses:6}); sc.T2=48; sc.c2=sample(sc.p2, sc.T2, 320); sc.d2=PK.doseSchedule(sc.p2).map(x=>x.t);
  // 200 virtual patients as the app's population mode makes them (clearance CV 30%, volume CV 20%, seed 1)
  function normals(rand){ let spare=null; return ()=>{ if(spare!==null){ const s=spare; spare=null; return s; } let u=0; while(u<=1e-300) u=rand(); const v=rand(), r=Math.sqrt(-2*Math.log(u)); spare=r*Math.sin(2*Math.PI*v); return r*Math.cos(2*Math.PI*v); }; }
  { const p=sc.p1, z=normals(PK.seededRandom(1)), w=cv=> Math.sqrt(Math.log(1+cv*cv)), wCL=w(.3), wV=w(.2), n=80;
    sc.pop=[]; for(let i=0;i<200;i++){ const eCL=wCL*z(), eV=wV*z(); sc.pop.push(sample(Object.assign({}, p, {V:p.V*Math.exp(eV), thalf:p.thalf*Math.exp(eV-eCL)}), 24, n)); }
    sc.med=[]; for(let i=0;i<=n;i++){ const v=sc.pop.map(c=>c[i].c).sort((a,b)=>a-b); sc.med.push({t:24*i/n, c:(v[99]+v[100])/2}); } }
  // a two-compartment IV bolus: C = A·e^(−αt) + B·e^(−βt), the distribution and the elimination phase
  { const p=S({route:"iv", cmt:2, D:500, V:20, thalf:3, k12:0.9, k21:0.35}), d=PK.derived(p), C0=PK.conc(p,1e-9), a=d.alpha, b=d.beta;
    const A=C0*(a-p.k21)/(a-b), B=C0*(p.k21-b)/(a-b);
    sc.T4=24; sc.c4=sample(p, 24, 240); sc.pa=sc.c4.map(q=>({t:q.t, c:A*Math.exp(-a*q.t)})); sc.pb=sc.c4.map(q=>({t:q.t, c:B*Math.exp(-b*q.t)})); }
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
  // g: the scene at a height on the screen (the middle unless given), as its index plus how far through it
  function where(at){
    if(!D.classList.contains("intro-on") || !scenes.length) return {g:-1, inIntro:false};
    const y=scrollY+(at===undefined ? innerHeight/2 : at);
    for(let i=0;i<scenes.length;i++){ const s=scenes[i], top=s.offsetTop+intro.offsetTop, h=s.offsetHeight;
      if(y<top+h) return {g:i+clamp((y-top)/h,0,1), inIntro:y>=intro.offsetTop, scene:s}; }
    return {g:scenes.length, inIntro:false};
  }
  const toneAt=w=> D.classList.contains("light") || (w && w.inIntro && w.scene && w.scene.dataset.tone==="light") ? "light" : "dark";
  let drawn1=false;
  function countUp(){   // scene 1: the curve draws itself once and the readouts count with it (1.2 s)
    if(drawn1) return; drawn1=true;
    const ro=["heroCmax","heroAuc","heroTin"].map($), at=u=>{ drawU=u; const r=sc.cum[Math.round(u*240)]; ro.forEach((el,j)=>{ if(el) el.textContent=u<1 ? fmt(r[j], j<2 ? 1 : 0) : sc.final[j]; }); paintFrame(1); if(three) three.draw1(u); };
    if(stillQ.matches || !D.classList.contains("hero-anim")){ at(1); D.classList.remove("hero-anim"); return; }
    at(0); D.classList.remove("hero-anim");
    const t0=performance.now(), step=now=>{ const u=Math.min(1, Math.max(0, now-t0)/1200); at(1-Math.pow(1-u,3)); if(u<1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  let lastIn=null, lastTop=null;
  function onScroll(){
    const w=where(), top=toneAt(where(30));
    if(w.inIntro!==lastIn){ lastIn=w.inIntro; D.classList.toggle("in-intro", w.inIntro); setPill(); }
    if(top!==lastTop){ lastTop=top; D.classList.toggle("tone-light", top==="light" && !D.classList.contains("light")); }
    if(w.inIntro && w.g>=4) runChecks();
    if(three) three.scroll(w);
  }

  /* ---------- the pill: the screen's main action ---------- */
  const pill=$("pill");
  const ACTIONS={
    sim:()=> ({label:$("pinBtn").textContent, el:$("pinBtn")}),
    cmp:()=> ({label:"Swap A and B", el:$("swapAB")}),
    ls:()=> ({label:"Start a lesson", el:document.querySelector(".ls-card:not(.done)")||document.querySelector(".ls-card")}),
    cs:()=>{ const b=document.querySelector("#csView .cs-actions .abtn"); return b && b.offsetParent ? {label:b.textContent, el:b} : {label:"Open a case", el:document.querySelector(".cs-card")}; },
    pr:()=> $("prVerdict") && $("prVerdict").textContent ? {label:"Next problem", el:$("prNext")} : {label:"Check the answer", el:$("prCheck")}
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
  function load3d(){
    if(three || threeLoading || !can3d()) return threeLoading;
    return threeLoading=import("three").then(THREE=>{ threeLoading=null; if(!can3d()) return; three=build(THREE); D.classList.add("stage3d"); three.setLive(); onScroll(); three.frame(true); })
      .catch(()=>{ threeLoading=null; D.classList.remove("stage3d"); });
  }
  function build(THREE){
    const host3d=document.createElement("div"); host3d.className="stage-3d"; host3d.setAttribute("aria-hidden","true");
    const canvas=document.createElement("canvas"); host3d.appendChild(canvas);
    const renderer=new THREE.WebGLRenderer({canvas, antialias:true, alpha:true, powerPreference:"high-performance"});
    document.body.appendChild(host3d);
    renderer.setClearColor(0x000000, 0);
    const scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera(34, 1, 0.1, 400);
    scene.add(new THREE.AmbientLight(0xffffff, 1.1)); const key=new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(-4, 9, 7); scene.add(key);
    const col=c=> new THREE.Color(c);
    let tone="dark", P=K;   // the palette of the section the object is in
    const lightTone=()=> tone==="light";
    const XW=12, YH=4, X=(t,T)=> -XW/2+XW*t/T;
    const groups={};
    const disposeGroup=g=>{ if(!g) return; g.traverse(o=>{ if(o.geometry) o.geometry.dispose(); if(o.material) [].concat(o.material).forEach(m=>m.dispose()); }); if(g.parent) g.parent.remove(g); };
    const GRAPHITE="#2C313A";

    // a ribbon: a strip that follows the curve, width along z. Dark: luminous (additive, with a halo of the same shape).
    // Light: solid graphite, lit, with a faint curtain down to the floor
    function ribbon(pts, T, top, color, o={}){
      const g=new THREE.Group(), n=pts.length, y=c=> o.log ? YH*(Math.log10(Math.max(c,o.floor))-Math.log10(o.floor))/(Math.log10(top)-Math.log10(o.floor)) : YH*c/top;
      const strip=(w, mat, z=0)=>{
        const pos=new Float32Array(n*6), idx=[];
        pts.forEach((q,i)=>{ const x=X(q.t,T), yy=y(q.c); pos.set([x,yy,z-w/2, x,yy,z+w/2], i*6); if(i) idx.push(2*i-2,2*i-1,2*i, 2*i-1,2*i+1,2*i); });
        const geo=new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos,3)); geo.setIndex(idx); geo.computeVertexNormals();
        return new THREE.Mesh(geo, mat);
      };
      const basic=(c,op,add)=> new THREE.MeshBasicMaterial({color:col(c), transparent:true, opacity:op, side:THREE.DoubleSide, depthWrite:false, blending:add ? THREE.AdditiveBlending : THREE.NormalBlending});
      const solid=c=> new THREE.MeshStandardMaterial({color:col(c), roughness:.42, metalness:.35, side:THREE.DoubleSide});
      const lit=lightTone(), c=lit && !o.keep ? (o.ghost ? P.ghost : GRAPHITE) : color;
      g.add(strip(o.w||0.3, o.ghost ? basic(c, .45, false) : lit ? solid(c) : basic(c, .95, true), o.z||0));
      if(!o.ghost && !lit) g.add(strip(1.15, basic(color, .16, true), o.z||0));
      if(!o.ghost && o.curtain!==false){
        const pos=new Float32Array(n*6), idx=[];
        pts.forEach((q,i)=>{ const x=X(q.t,T), yy=y(q.c), z=(o.z||0)-0.16; pos.set([x,yy,z, x,0,z], i*6); if(i) idx.push(2*i-2,2*i-1,2*i, 2*i-1,2*i+1,2*i); });
        const geo=new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos,3)); geo.setIndex(idx);
        g.add(new THREE.Mesh(geo, basic(lit ? GRAPHITE : color, .06, false)));
      }
      g.userData.setDraw=u=> g.children.forEach(m=> m.geometry.setDrawRange(0, Math.max(0, Math.round((n-1)*clamp(u,0,1)))*6));
      return g;
    }
    function plane(top, mec, mtc, z=-0.75){
      const g=new THREE.Group(), y=c=> YH*Math.min(c,top)/top;
      if(mtc>mec){ const m=new THREE.Mesh(new THREE.PlaneGeometry(XW, y(mtc)-y(mec)), new THREE.MeshBasicMaterial({color:col(P.band), transparent:true, opacity:lightTone() ? .06 : .075, depthWrite:false, side:THREE.DoubleSide}));
        m.position.set(0, (y(mtc)+y(mec))/2, z); g.add(m); }
      [[mec,P.mec],[mtc,P.mtc]].forEach(([c,cc])=>{ if(c>top) return;
        const l=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-XW/2,y(c),z), new THREE.Vector3(XW/2,y(c),z)]), new THREE.LineDashedMaterial({color:col(cc), dashSize:.22, gapSize:.16, transparent:true, opacity:.9}));
        l.computeLineDistances(); g.add(l); });
      return g;
    }
    function floor(){
      const pts=[];
      for(let x=-8;x<=8;x+=1) pts.push(new THREE.Vector3(x,0,-5), new THREE.Vector3(x,0,5));
      for(let z=-5;z<=5;z+=1) pts.push(new THREE.Vector3(-8,0,z), new THREE.Vector3(8,0,z));
      return new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({color:col(P.line), transparent:true, opacity:lightTone() ? .7 : .55}));
    }
    function rings(times, T, color){
      const g=new THREE.Group();
      times.forEach(t=>{ if(t<0 || t>T) return; const r=new THREE.Mesh(new THREE.RingGeometry(.1,.16,40), new THREE.MeshBasicMaterial({color:col(lightTone() ? GRAPHITE : color), transparent:true, opacity:.95, side:THREE.DoubleSide, depthWrite:false}));
        r.rotation.x=-Math.PI/2; r.position.set(X(t,T), .01, 0); r.userData.t=t; g.add(r); });
      return g;
    }

    /* the live scenario: what the chart shows */
    let liveKey="", pulseAt=0;
    function setLive(){
      if(!live) return;
      disposeGroup(groups.live); const g=groups.live=new THREE.Group(); scene.add(g);
      const [T0,T1]=live.T, T=T1-T0, cvs=live.curves, phone=phoneQ.matches;
      const top=Math.max(live.mtc, ...cvs.map(cv=> Math.max(...cv.pts.map(q=>q.c))))*1.1 || 1;
      cvs.forEach(cv=>{ const pts=cv.pts.filter((q,i)=> i%2===0).map(q=>({t:q.t-T0, c:q.c}));
        g.add(ribbon(pts, T, top, cv.ghost ? P.ghost : cv.id==="b" ? P.b : P.accent, {ghost:cv.ghost, keep:cv.id==="b", z:cv.id==="b" ? 1.1 : cv.ghost ? -0.35 : 0, curtain:!phone && !cv.ghost})); });
      if(!phone){
        g.add(plane(top, live.mec, live.mtc)); g.add(floor());
        const lead=cvs.find(cv=>!cv.ghost), sched=lead && lead.p && lead.p.dosing!=="single" ? PK.doseSchedule(lead.p).filter(d=>!d.missed).map(d=>d.t-T0) : [];
        const r=rings(sched, T, P.accent); r.name="rings"; g.add(r);
        const keyNow=sched.join(","); if(keyNow!==liveKey){ liveKey=keyNow; if(sched.length && !stillQ.matches) pulseAt=performance.now(); }
      }
      g.visible=mode!=="intro";
      frame();
    }

    /* the sequence's objects, placed along the x axis; the camera travels between them */
    const SX=[0,40,80,120,160];
    function buildIntro(){
      ["s1","s3","s4","s5","s6"].forEach(k=>{ disposeGroup(groups[k]); delete groups[k]; });
      const g1=groups.s1=new THREE.Group(); scene.add(g1);
      const r1=ribbon(sc.c1, sc.T1, 14, P.accent, {curtain:!phoneQ.matches}); r1.name="r"; g1.add(r1); r1.userData.setDraw(drawU);
      if(phoneQ.matches){ setVis(); return; }   // phones: the single ribbon; the other scenes keep their SVG frames
      g1.add(plane(14, V0.mec, V0.mtc)); g1.add(floor());
      const top2=Math.max(...sc.c2.map(q=>q.c))*1.1, g3=groups.s3=new THREE.Group(); g3.position.x=SX[1]; scene.add(g3);
      const r3=ribbon(sc.c2, sc.T2, top2, P.accent); r3.name="r"; g3.add(r3); g3.add(plane(top2, V0.mec, V0.mtc)); g3.add(floor());
      const rg=rings(sc.d2, sc.T2, P.accent); rg.name="rings"; g3.add(rg);
      const g4=groups.s4=new THREE.Group(); g4.position.x=SX[2]; scene.add(g4);
      { const n=sc.pop[0].length, pos=new Float32Array(200*(n-1)*6), from=new Float32Array(200*(n-1)*6);
        sc.pop.forEach((c,j)=>{ for(let i=0;i<n-1;i++) from.set([X(c[i].t,24), YH*c[i].c/16, (j%20-9.5)*.05, X(c[i+1].t,24), YH*c[i+1].c/16, (j%20-9.5)*.05], (j*(n-1)+i)*6); });
        pos.set(from); const geo=new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos,3));
        const cloud=new THREE.LineSegments(geo, new THREE.LineBasicMaterial({color:col(lightTone() ? GRAPHITE : P.accent), transparent:true, opacity:.22, blending:lightTone() ? THREE.NormalBlending : THREE.AdditiveBlending, depthWrite:false}));
        cloud.name="cloud"; cloud.userData.from=from; g4.add(cloud);
        const med=ribbon(sc.med, 24, 16, lightTone() ? GRAPHITE : P.text, {curtain:false, keep:true}); med.name="med"; g4.add(med); g4.add(plane(16, V0.mec, V0.mtc)); g4.add(floor()); }
      const g5=groups.s5=new THREE.Group(); g5.position.x=SX[3]; scene.add(g5);
      { const o={log:true, floor:sc.c4[sc.c4.length-1].c*0.5, curtain:false}, top=sc.c4[0].c*1.5;
        g5.add(ribbon(sc.c4, sc.T4, top, P.accent, o)); const a=ribbon(sc.pa, sc.T4, top, P.mic, Object.assign({keep:true},o)), b=ribbon(sc.pb, sc.T4, top, P.band, Object.assign({keep:true},o)); a.name="a"; b.name="b"; g5.add(a, b); g5.add(floor()); }
      const g6=groups.s6=new THREE.Group(); g6.position.set(SX[4], 2.4, 0); scene.add(g6);
      { const pts=sphere(sc.nChecks), pos=new Float32Array(pts.length*3), cols=new Float32Array(pts.length*3), off=col(P.line);
        pts.forEach(([x,y,z],i)=>{ pos.set([3*x,3*y,3*z], i*3); cols.set([off.r,off.g,off.b], i*3); });
        const geo=new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos,3)); geo.setAttribute("color", new THREE.BufferAttribute(cols,3));
        const pts3=new THREE.Points(geo, new THREE.PointsMaterial({size:.085, vertexColors:true, transparent:true, opacity:.95, depthWrite:false})); pts3.name="pts"; g6.add(pts3);
        g6.add(new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(2.98, 3)), new THREE.LineBasicMaterial({color:col(P.line), transparent:true, opacity:.22}))); }
      setVis(); light6();
    }
    let k6=0;
    function light6(){
      const p=groups.s6 && groups.s6.getObjectByName("pts"); if(!p) return;
      const upto=Math.round(k6*sc.nChecks), on=col(P.band), off=col(P.line), bad=col(P.mtc), a=p.geometry.attributes.color;
      for(let i=0;i<a.count;i++){ const c=i<Math.min(upto, sc.checks.length) ? (sc.checks[i] ? on : bad) : off; a.setXYZ(i, c.r, c.g, c.b); }
      a.needsUpdate=true; frame();
    }

    /* the camera: keyframes per scene in the sequence, a framing per tab in the app */
    const V=(x,y,z)=> new THREE.Vector3(x,y,z);
    const KF=[ // per scene: [camera, target] entering and leaving
      [[V(0,1.8,15.5),V(0,1.7,0)],[V(-3.5,4.4,17),V(0,1.5,0)]],
      [[V(-10,3.4,10.5),V(-5,1.5,0)],[V(7.5,3.6,10.5),V(4.5,1.3,0)]],
      [[V(SX[1]-9,3.2,15),V(SX[1]-2.5,1.7,0)],[V(SX[1]+3,3.2,15),V(SX[1]+3.5,1.7,0)]],
      [[V(SX[2]-9.5,5,19),V(SX[2]-3.6,1.5,0)],[V(SX[2]-8,2.8,14.5),V(SX[2]-3.4,1.5,0)]],
      [[V(SX[3]-7,3.4,18),V(SX[3]+1.7,2.3,0)],[V(SX[3]+4.5,5.2,18),V(SX[3]+1.5,2.1,0)]],
      [[V(SX[4],2.6,11.5),V(SX[4],2.3,0)],[V(SX[4],3.6,10),V(SX[4],2.3,0)]],
      [[V(-2,2.4,24),V(0,-2.3,0)],[V(-2,2.4,24),V(0,-2.3,0)]]];
    const FR={sim:[V(-7.5,4.6,16),V(-0.6,2.6,0)], cmp:[V(-9.5,6.2,17),V(-0.8,1.5,0.4)], ls:[V(-5.2,1.4,10.5),V(0,2,0)],
      cs:[V(0.6,16,4.5),V(0.6,0,-0.3)], pr:[V(-3,2.6,26),V(0,1.4,0)]};
    // a phone in portrait sees a narrow slice: the camera stands back so the whole ribbon shows
    const PH=[V(0,3.4,42),V(0,-3.6,0)];
    let mode="app", camFrom=null, camTo=null, camT0=0, camDur=900, scrollS=0, lastW=null;
    const camNow={p:V(0,0,0), l:V(0,0,0)};
    function target(){
      if(phoneQ.matches && innerWidth<innerHeight) return {p:PH[0].clone(), l:PH[1].clone()};
      if(mode==="intro" && lastW){
        const i=clamp(Math.floor(lastW.g),0,6), f=lastW.g-i, k=KF[i], u=smooth(f);
        return {p:k[0][0].clone().lerp(k[1][0],u), l:k[0][1].clone().lerp(k[1][1],u)};
      }
      const f=FR[tab]||FR.sim, d=scrollS;
      return {p:f[0].clone().add(V(1.2*d,-0.9*d,0.8*d)), l:f[1].clone().add(V(1.2*d,-0.2*d,0))};
    }
    function moveTo(){ camFrom={p:camNow.p.clone(), l:camNow.l.clone()}; camTo=target(); camT0=performance.now(); frame(); }
    function setTone(t){
      if(t===tone) return; tone=t; P=t==="light" ? tokensOf(document.querySelector(".scene.ed")||D) : K;
      if(D.classList.contains("intro-on")) buildIntro(); setLive(); if(lastW) scroll(lastW, true);
    }
    function scroll(w, quiet){
      lastW=w; const was=mode;
      mode=w.inIntro ? "intro" : "app";
      setTone(toneAt(w));
      resize();
      const max=Math.max(1, D.scrollHeight-innerHeight), start=w.inIntro ? 0 : (D.classList.contains("intro-on") ? intro.offsetHeight : 0);
      scrollS=clamp((scrollY-start)/Math.max(1,max-start),0,1);
      if(was!==mode && !quiet){ setVis(); moveTo(); return; }
      if(mode==="intro"){
        const i=Math.floor(w.g), f=w.g-i;
        if(phoneQ.matches) canvas.style.opacity=w.g<1 ? 1 : 0;
        if(i===0 && f>0.15) countUp();
        if(groups.s3 && i===2) groups.s3.getObjectByName("r").userData.setDraw(smooth(f*1.25));
        if(groups.s4 && i===3){ const cloud=groups.s4.getObjectByName("cloud"), pos=cloud.geometry.attributes.position.array, from=cloud.userData.from, k=smooth((f-.15)/.7), n=sc.med.length;
          for(let j=0;j<200;j++) for(let s=0;s<n-1;s++){ const o=(j*(n-1)+s)*6;
            pos[o+1]=lerp(from[o+1], YH*sc.med[s].c/16, k); pos[o+4]=lerp(from[o+4], YH*sc.med[s+1].c/16, k); pos[o+2]=lerp(from[o+2],0,k); pos[o+5]=lerp(from[o+5],0,k); }
          cloud.geometry.attributes.position.needsUpdate=true; cloud.material.opacity=lerp(.22, .06, k); }
        if(groups.s5 && i===4){ const k=smooth(f*1.3); groups.s5.getObjectByName("a").position.z=1.6*k; groups.s5.getObjectByName("b").position.z=-1.6*k; }
        if(groups.s6 && i===5){ k6=smooth(f*1.5); light6(); groups.s6.rotation.y=f*Math.PI*.9; }
      } else canvas.style.opacity="";
      camTo=target(); camFrom=null; frame();
    }
    function setVis(){
      const intro=mode==="intro";
      ["s1","s3","s4","s5","s6"].forEach(k=>{ if(groups[k]) groups[k].visible=intro; });
      if(groups.live) groups.live.visible=!intro;
    }
    // render on demand: while the camera eases, the first scene draws, or doses pulse
    let raf=0;
    function frame(force){ if(!raf) raf=requestAnimationFrame(render); if(force){ const t=target(); camNow.p.copy(t.p); camNow.l.copy(t.l); } }
    function render(now){
      raf=0; let busy=false;
      if(camFrom && camTo){ const u=stillQ.matches ? 1 : clamp((now-camT0)/camDur,0,1), e=ease(u);
        camNow.p.copy(camFrom.p).lerp(camTo.p,e); camNow.l.copy(camFrom.l).lerp(camTo.l,e); if(u<1) busy=true; else camFrom=null; }
      else if(camTo){ const a=stillQ.matches ? 1 : .2; camNow.p.lerp(camTo.p,a); camNow.l.lerp(camTo.l,a); if(camNow.p.distanceTo(camTo.p)>1e-3) busy=true; }
      camera.position.copy(camNow.p); camera.lookAt(camNow.l);
      const rg=groups.live && groups.live.getObjectByName("rings");   // the app: the new schedule's doses pulse in order
      if(rg && pulseAt){ const e=(now-pulseAt)/1000; rg.children.forEach((r,i)=>{ const a=clamp(e-i*0.12,0,1), s=a<1 ? 1+a*1.8 : 1; r.scale.set(s,s,s); r.material.opacity=a<1 ? .95-.6*a : .95; });
        if(e<rg.children.length*0.12+1) busy=true; else pulseAt=0; }
      if(mode==="intro" && lastW && Math.floor(lastW.g)===2 && groups.s3){   // the sequence: each dose pulses as the curve reaches it
        const tc=sc.T2*smooth((lastW.g-2)*1.25);
        groups.s3.getObjectByName("rings").children.forEach(r=>{ const a=clamp((tc-r.userData.t)/3,0,1), s=a>0 && a<1 ? 1+a*2.2 : 1; r.scale.set(s,s,s); r.material.opacity=a<=0 ? .25 : a<1 ? 1-.7*a : .9; });
      }
      renderer.render(scene, camera);
      if(busy) frame();
    }
    let offset=null;
    function resize(){
      const w=innerWidth, h=innerHeight, off=w>760 && mode!=="intro" ? -w*0.24 : 0, k=w+"x"+h+"x"+off;
      if(k===offset) return; offset=k;
      renderer.setPixelRatio(Math.min(devicePixelRatio, phoneQ.matches ? 1.5 : 1.75)); renderer.setSize(w,h,false);
      camera.aspect=w/h; camera.fov=w<h ? 46 : 34;
      // in the app the picture sits right of centre, clear of the controls; in the sequence it crosses the middle
      if(off) camera.setViewOffset(w, h, off, 0, w, h); else camera.clearViewOffset();
      camera.updateProjectionMatrix(); frame();
    }
    addEventListener("resize", ()=>{ offset=null; resize(); }); resize();
    scene.fog=new THREE.Fog(col(K.page), 24, 70);
    if(D.classList.contains("intro-on")) buildIntro();
    return {
      setLive, scroll:w=>scroll(w), frame, light6,
      draw1:u=>{ if(groups.s1) groups.s1.getObjectByName("r").userData.setDraw(u); frame(); },
      view:()=>{ if(mode==="app") moveTo(); },
      intro:()=>{ buildIntro(); },
      retheme:()=>{ K=tokensOf(D); scene.fog.color=col(K.page); tone=""; setTone(toneAt(lastW||where())); },
      dispose:()=>{ Object.values(groups).forEach(disposeGroup); renderer.dispose(); host3d.remove(); }
    };
  }

  /* ---------- wiring ---------- */
  let scrollRaf=0;
  addEventListener("scroll",()=>{ if(!scrollRaf) scrollRaf=requestAnimationFrame(()=>{ scrollRaf=0; onScroll(); }); }, {passive:true});
  const prep=()=>{ if(D.classList.contains("intro-on")){ paintFrames(); if(!D.classList.contains("fx-off") && !phoneQ.matches) setTimeout(runChecks, 2500); } };
  prep(); onScroll(); setPill();
  // scene 1 draws itself once, in 3D when Three.js arrives within 2.5 s, else in its SVG frame
  const loading=load3d();
  if(D.classList.contains("intro-on")) (loading ? Promise.race([loading, new Promise(r=>setTimeout(r,2500))]) : Promise.resolve()).then(()=>{ if(where().g<1) countUp(); });

  return {
    set(data){ live=data; cssPath(); if(three) three.setLive(); setPill(); },
    view(t){ tab=t; if(three) three.view(); setPill(); },
    pill(){ setPill(); if(!action || !action.el) return false; action.el.click(); setTimeout(setPill, 50); return true; },
    theme(){ K=tokensOf(D); cssPath(); scenes.forEach(s=>{ const v=s.querySelector(".scene-vis svg"); if(v) v.textContent=""; }); prep(); lastTop=null; onScroll(); if(three) three.retheme(); },
    fx(){ if(can3d()) load3d(); else if(three){ three.dispose(); three=null; D.classList.remove("stage3d"); if(D.classList.contains("intro-on")) paintFrames(); } },
    intro(){ prep(); if(three) three.intro(); else load3d(); onScroll(); countUp(); setPill(); }
  };
}
