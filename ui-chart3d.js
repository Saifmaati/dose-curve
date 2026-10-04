/* MaatiRX: the chart in 3D (2.18)
   A 3D mode for the chart panel, for exploring and presenting; the 2D chart stays the precise instrument and the
   default. Five views, each drawn from the engine's own numbers:
   - Curve in space: the concentration–time ribbon, the window as a glass slab, the doses as beads on the time axis.
     Hover reads time and level, a drag along the ribbon moves the page's time cursor, a dose's bead selects it.
   - Dose surface: time × dose × level. The window slab cuts through it; the current dose is a lit ribbon on the
     surface, and dragging it changes the simulator's dose, snapping to practical strengths.
   - Regimen map: dose × interval × a steady-state target (AUC24, trough, peak, or fT>MIC with a MIC entered), the
     target range as a translucent band; a marker picks the regimen and drives the simulator.
   - Population: the virtual patients of population mode (same seed, same patients) as curves in depth, ordered by
     clearance, the median lit and the 5th–95th percentile band as glass. Hover names a patient's clearance and volume.
   - Compartments (two compartments only): the central level against the peripheral level against time, a trajectory
     whose loop is the distribution phase.
   Three.js is the stage's own pinned copy (the page's import map). The materials, tokens, light and tiers follow the
   stage's recipes: tier 2 (a capable desktop) has the studio environment and transmission glass, tier 1 and phones
   the plain translucent plate. Labels are HTML placed by projection, so text stays sharp at any angle. The page
   loads this file on the first press of 3D and calls DCChart3D.mount(THREE, ctx); the pure functions at the top are
   tested in Node. Educational model, not for clinical dosing. */
(function(root, factory){
  const api=factory();
  if(typeof module==="object" && module.exports) module.exports=api;
  else root.DCChart3D=api;
})(typeof self!=="undefined" ? self : this, function(){
  "use strict";
  const clamp=(v,a,b)=> Math.min(b, Math.max(a, v)), lerp=(a,b,u)=> a+(b-a)*u;
  // the page's own easing, cubic-bezier(0.22, 1, 0.36, 1), solved for its time
  function bezier(x1, y1, x2, y2){
    const A=(a,b)=> 1-3*b+3*a, B=(a,b)=> 3*b-6*a, C=a=> 3*a;
    const at=(t,a,b)=> ((A(a,b)*t+B(a,b))*t+C(a))*t, slope=(t,a,b)=> 3*A(a,b)*t*t+2*B(a,b)*t+C(a);
    return x=>{ if(x<=0) return 0; if(x>=1) return 1; let t=x;
      for(let i=0;i<10;i++){ const s=slope(t,x1,x2); if(Math.abs(s)<1e-7) break; t-=(at(t,x1,x2)-x)/s; t=clamp(t,0,1); }
      return at(t,y1,y2); };
  }
  const EASE=bezier(.22, 1, .36, 1);

  /* ================= the model's numbers (pure: tests/chart3d.test.js) ================= */
  // Intervals a regimen snaps to, within the simulator's own range (2–24 h)
  const TAUS=[4, 6, 8, 12, 24];
  const niceStep=x=>{ const e=Math.pow(10, Math.floor(Math.log10(x))), f=x/e; return (f<1.5 ? 1 : f<2.25 ? 2 : f<3.5 ? 2.5 : f<7.5 ? 5 : 10)*e; };
  const nearest=(v, list)=> list.reduce((b,x)=> Math.abs(x-v)<Math.abs(b-v) ? x : b, list[0]);
  // Practical doses in [lo, hi]: a library drug's own (any sum of up to three of its strengths, or its rounding step
  // for an injection), else steps that suit the dose's size (a tenth of it, rounded to 1, 2, 2.5 or 5).
  function doseSteps(lo, hi, drug, around){
    let out=[];
    const st=drug && drug.strengths;
    if(st && st.round){ for(let v=st.round; v<=hi+1e-9; v+=st.round) if(v>=lo-1e-9) out.push(+v.toFixed(6)); }
    else if(st && st.mg && st.mg.length){
      const m=[0, ...st.mg], s=new Set();
      m.forEach(a=> m.forEach(b=> m.forEach(c=>{ const v=+(a+b+c).toFixed(6); if(v>0) s.add(v); })));
      out=[...s].filter(v=> v>=lo-1e-9 && v<=hi+1e-9);
    }
    if(out.length<3){
      const step=niceStep(Math.max(around||((lo+hi)/2), 1e-6)/8);
      out=[]; for(let v=Math.ceil(lo/step-1e-9)*step; v<=hi+1e-9; v+=step) if(v>0) out.push(+v.toFixed(6));
    }
    return out.sort((a,b)=>a-b);
  }
  const linspace=(a,b,n)=> Array.from({length:n},(_,i)=> a+(b-a)*i/(n-1));
  // The library drug whose strengths a dragged dose snaps to: only while the scenario is still that drug (its units,
  // half-life, volume, Vmax and Km as the library gives them); the dose itself may change.
  const drugFor=(drug, p)=> drug && drug.s && drug.units===p.unit && ["thalf","V","vmax","km"].every(k=> drug.s[k]===undefined || drug.s[k]===p[k]) ? drug : null;
  // The level over [T0, T1] for each dose: the scenario with only its dose changed.
  function doseGrid(PK, p, T0, T1, doses, nt){
    const ts=linspace(T0, T1, nt);
    const c=doses.map(D=>{ const q=PK.normalizeScenario(Object.assign({}, p, {D})), ev=PK.doseEvents(q); return ts.map(t=> PK.conc(q, t, ev)); });
    return {ts, doses, c};
  }
  // A regimen: the scenario as a regular regimen of D every τ (no loading dose, nothing missed)
  const regimenOf=(PK, p, D, tau)=> PK.normalizeScenario(Object.assign({}, p, {dosing:"repeated", D, tau, nDoses:Math.max(2, p.nDoses||2), loadMult:1, missed:1}));
  // A steady-state target: AUC24, trough, peak, or fT>MIC (%); null where a saturable regimen never settles
  function ssMetric(PK, q, metric, mic){
    // fT>MIC only where the regimen settles: a saturable regimen past Vmax has no steady state to read
    if(metric==="ft"){ if(!(mic>0)) return null; const m=PK.micStats(q, mic, 24); return m && m.ss ? m.ft : null; }
    if(q.kin==="mm"){ const m=PK.mmSteady(q); if(m.none) return null; return metric==="auc" ? m.avg*24 : metric==="trough" ? m.trough : m.peak; }
    if(metric==="auc") return (q.route==="oral" ? PK.fOf(q) : 1)*PK.saltOf(q)*q.D/PK.derived(q).CL*24/q.tau;
    const s=PK.ssPeakTrough(q);
    return metric==="trough" ? s.trough : s.peak;
  }
  function regimenGrid(PK, p, doses, taus, metric, mic){
    return {doses, taus, v:taus.map(tau=> doses.map(D=> ssMetric(PK, regimenOf(PK, p, D, tau), metric, mic)))};
  }
  // The peripheral compartment of a two-compartment drug, from the central level the engine gives:
  // dA2/dt = k12·A1 − k21·A2 with A1 = C·V (Runge–Kutta, with steps that meet every dose and infusion end), and the
  // peripheral level C2 = A2 / V2, V2 = V·k12/k21, so that the two levels are equal at equilibrium.
  function periphCourse(PK, p, ts){
    const V=PK.vOf(p), k12=p.k12, k21=p.k21, V2=V*k12/k21, ev=PK.doseEvents(p);
    const cuts=ev.map(e=> e.t).concat(ev.filter(e=> e.route==="inf").map(e=> e.t+e.dur));
    const c1=ts.map(t=> PK.conc(p, t, ev)), c2=[0], h0=Math.min(0.05, 0.1/(k12+k21));
    let A2=0;
    for(let i=1;i<ts.length;i++){
      const a=ts[i-1], b=ts[i], inner=[a, ...cuts.filter(t=> t>a && t<b).sort((x,y)=>x-y), b];
      for(let s=0;s<inner.length-1;s++){
        const s0=inner[s], s1=inner[s+1], n=Math.max(1, Math.ceil((s1-s0)/h0)), h=(s1-s0)/n;
        // within a step the level is read inside it: a dose at its end belongs to the next step
        const C=t=> PK.conc(p, clamp(t, s0+1e-9, s1-1e-9), ev), f=(t,A)=> k12*V*C(t)-k21*A;
        for(let k=0;k<n;k++){ const t=s0+k*h, k1=f(t,A2), k2=f(t+h/2,A2+h/2*k1), k3=f(t+h/2,A2+h/2*k2), k4=f(t+h,A2+h*k3); A2+=h/6*(k1+2*k2+2*k3+k4); }
      }
      c2.push(A2/V2);
    }
    return {c1, c2, V2};
  }
  // Population mode's virtual patients (pop-worker.js's own generator: same seed, same patients), each with its curve,
  // ordered by clearance (by Vmax with saturable elimination), and the 5th, 50th and 95th percentiles at each time.
  function popCurves(PK, Pop, p, o, ts){
    const ev=PK.doseEvents(p), mm=p.kin==="mm";
    const list=Pop.patients(PK, p, o).map((q,i)=>{
      let c;
      if(mm){ const st=PK.hdOn(q) && PK.hd ? PK.hd.mmSteps(q, ts[ts.length-1]+PK.MM_STEP) : PK.mmIntegrate(q, ev, ts[ts.length-1]+PK.MM_STEP), V=PK.vOf(q); c=ts.map(t=> PK.mmAmount(st, t)/V); }
      else c=ts.map(t=> PK.conc(q, t, ev));
      return {n:i+1, CL:mm ? null : PK.derived(q).CL, V:PK.vOf(q), vmax:mm ? q.vmax : null, c};
    });
    // equal clearances (the liver model's, the same for everyone up to rounding) fall back to the volume
    list.sort((a,b)=>{ if(mm) return a.vmax-b.vmax; const d=a.CL-b.CL; return Math.abs(d)>1e-9*Math.max(a.CL, b.CL) ? d : a.V-b.V; });
    const q=f=> ts.map((_,j)=> Pop.quantile(list.map(x=> x.c[j]).sort((a,b)=>a-b), f));
    return {list, q05:q(.05), q50:q(.5), q95:q(.95)};
  }

  /* ================= the 3D view ================= */
  function mount(THREE, ctx){
    const {PK, fmt, trim}=ctx, DOC=document.documentElement, box=ctx.box;
    const still=()=> matchMedia("(prefers-reduced-motion: reduce)").matches, phone=()=> matchMedia("(max-width:760px)").matches;
    const tierOf=()=>{ let f=null; try{ f=localStorage.getItem("maatirx.fxtier"); }catch(e){} if(f==="1" || f==="2") return +f;
      const n=navigator; return !DOC.classList.contains("fx-off") && !phone() && !!window.WebGL2RenderingContext && (n.hardwareConcurrency||4)>=6 && !(n.deviceMemory<8) ? 2 : 1; };
    const tier=tierOf();
    const VIEWS=[["curve","Curve"],["dose","Dose surface"],["regimen","Regimen map"],["pop","Population"],["cmt","Compartments"]];
    // on a phone the names shorten (the words after the first stay for screen readers)
    const vname=n=>{ const [a,...b]=n.split(" "); return b.length ? `${a}<span class="w"> ${b.join(" ")}</span>` : n; };
    const METRICS=[["auc","AUC24"],["trough","Trough"],["peak","Peak"],["ft","fT>MIC"]];

    /* ---------- the panel ---------- */
    if(!document.getElementById("c3dCss")){ const st=document.createElement("style"); st.id="c3dCss"; st.textContent=CSS; document.head.appendChild(st); }
    const host=document.createElement("div"); host.className="c3d"; host.hidden=true;
    host.innerHTML=`<button type="button" class="c3d-skip">Skip the 3D view</button>
      <canvas tabindex="0" role="application" aria-roledescription="3D chart" aria-describedby="plotSummary"></canvas>
      <div class="c3d-lbl" aria-hidden="true"></div>
      <div class="c3d-chip" aria-hidden="true" hidden></div>
      <div class="c3d-top"><div class="mini-seg c3d-views" role="radiogroup" aria-label="3D view">${VIEWS.map(([id,name])=>`<button type="button" role="radio" data-v="${id}" aria-checked="false">${vname(name)}</button>`).join("")}</div>
        <div class="c3d-right"><div class="mini-seg c3d-met" role="radiogroup" aria-label="Regimen map target" hidden>${METRICS.map(([id,name])=>`<button type="button" role="radio" data-m="${id}" aria-checked="false">${name}</button>`).join("")}</div>
        <div class="mini-seg c3d-cams" role="group" aria-label="Camera"><button type="button" data-cam="front">Front</button><button type="button" data-cam="iso">Isometric</button><button type="button" data-cam="top">Top</button></div></div></div>
      <div class="c3d-foot"><div class="c3d-legend"></div><p class="c3d-note">Educational model, not for clinical dosing.</p></div>`;
    const canvas=host.querySelector("canvas"), lblLayer=host.querySelector(".c3d-lbl"), chip=host.querySelector(".c3d-chip"), legendEl=host.querySelector(".c3d-legend");
    // announcements go to a status line outside the host, which is shown and hidden
    const live=document.createElement("p"); live.className="sr-only"; live.setAttribute("role", "status");
    const say=t=> requestAnimationFrame(()=>{ live.textContent=t; });
    const viewsEl=host.querySelector(".c3d-views"), metEl=host.querySelector(".c3d-met");

    const renderer=new THREE.WebGLRenderer({canvas, antialias:true, alpha:true, powerPreference:"high-performance"});
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    box.appendChild(host); box.appendChild(live);   // only once a renderer exists: a failed start leaves nothing behind
    const scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera(30, 1, 0.05, 400), FOV=30;
    const world=new THREE.Group(); scene.add(world);
    const col=c=> new THREE.Color(c);
    // the stage's light: a warm key, a cool rim and a soft fill, and in tier 2 its studio environment
    const key=new THREE.DirectionalLight(0xfff1df, 2.4); key.position.set(-6, 10, 8);
    const rim=new THREE.DirectionalLight(0x8fc4ff, 1.5); rim.position.set(7, 4, -9);
    const fill=new THREE.HemisphereLight(0xd6deff, 0x07090e, 0.55);
    scene.add(key, rim, fill);
    const envs={};
    function envOf(lit){
      if(tier!==2) return null;
      const t=lit ? "light" : "dark"; if(envs[t]) return envs[t];
      const pm=new THREE.PMREMGenerator(renderer), es=new THREE.Scene();
      es.add(new THREE.Mesh(new THREE.BoxGeometry(30,30,30), new THREE.MeshBasicMaterial({side:THREE.BackSide, color:col(lit ? "#c9ced6" : "#04060b")})));
      const panel=(w,h,c,i,x,y,z)=>{ const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h), new THREE.MeshBasicMaterial({color:col(c).multiplyScalar(i), side:THREE.DoubleSide})); m.position.set(x,y,z); m.lookAt(0,0,0); es.add(m); };
      panel(10,5,"#fff0dc", lit ? 2.6 : 5, -7,9,7); panel(2.4,12,"#86bcff", lit ? 1.1 : 3.4, 9,3,-8); panel(14,2.5,"#ffffff", lit ? 1.2 : .5, 0,-8,5); panel(6,3,"#ffb36b", lit ? .5 : 1.4, 10,6,9);
      envs[t]=pm.fromScene(es, 0.04).texture;
      es.traverse(o=>{ if(o.geometry) o.geometry.dispose(); if(o.material) o.material.dispose(); }); pm.dispose();
      return envs[t];
    }

    /* ---------- tokens and materials (the stage's recipes) ---------- */
    let K={}, M=null, lit=false;
    const TOK="accent band mec mtc mic b ghost text muted surface line".split(" ");
    function readTokens(){ const s=getComputedStyle(box); TOK.forEach(n=> K[n]=s.getPropertyValue("--c-"+n).trim()); lit=ctx.paperK(); }
    // emissive light that follows the vertex colours: the dark theme's luminous core, coloured by state
    const vertexGlow=m=>{ m.onBeforeCompile=sh=>{ sh.fragmentShader=sh.fragmentShader.replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vColor.rgb;"); }; m.customProgramCacheKey=()=> "dc-vglow"; return m; };
    function makeMats(){
      if(M) Object.values(M).forEach(m=> m.dispose());
      const env=envOf(lit); scene.environment=env;
      M={};
      M.core=new THREE.MeshStandardMaterial({vertexColors:true, roughness:lit ? .45 : .32, metalness:lit ? .1 : .2, side:THREE.DoubleSide, envMapIntensity:1});
      if(!lit){ M.core.emissive=col("#ffffff"); M.core.emissiveIntensity=tier===2 ? .9 : .75; vertexGlow(M.core); }
      // the therapeutic window: frosted glass with transmission (tier 2), or a quiet translucent plate
      M.glass=tier===2 ? new THREE.MeshPhysicalMaterial({color:col(K.band), transmission:1, roughness:.42, thickness:.4, ior:1.42, metalness:0, clearcoat:.5, clearcoatRoughness:.25,
          attenuationColor:col(K.band), attenuationDistance:4, transparent:true, opacity:lit ? .16 : .22, depthWrite:false, envMapIntensity:.7, side:THREE.DoubleSide})
        : new THREE.MeshStandardMaterial({color:col(K.band), transparent:true, opacity:lit ? .1 : .12, roughness:.4, depthWrite:false, side:THREE.DoubleSide});
      // the population band: a translucent plate (transmission would draw before, and never show, the patients' lines)
      M.band=new THREE.MeshStandardMaterial({color:col(K.accent), transparent:true, opacity:lit ? .1 : .12, roughness:.4, depthWrite:false, side:THREE.DoubleSide});
      M.none=new THREE.MeshBasicMaterial({color:col(K.muted), transparent:true, opacity:lit ? .22 : .2, depthWrite:false, side:THREE.DoubleSide});
      M.hair=new THREE.LineBasicMaterial({color:col(K.text), transparent:true, opacity:lit ? .16 : .12, depthWrite:false});
      M.hairS=new THREE.LineBasicMaterial({color:col(K.text), transparent:true, opacity:lit ? .38 : .3, depthWrite:false});
      M.mec=new THREE.LineBasicMaterial({color:col(K.mec), transparent:true, opacity:.9});
      M.mtc=new THREE.LineBasicMaterial({color:col(K.mtc), transparent:true, opacity:.9});
      M.lines=new THREE.LineBasicMaterial({vertexColors:true, transparent:true, opacity:lit ? .34 : .22, depthWrite:false});
      M.pick=new THREE.LineBasicMaterial({color:col(K.accent), transparent:true, opacity:1});
      M.bead=new THREE.MeshStandardMaterial({color:col(K.accent), emissive:col(K.accent), emissiveIntensity:lit ? .12 : 1.2, roughness:.3, metalness:.2});
      // the selected thing (this dose, the median): the accent, lit
      M.lit=new THREE.MeshStandardMaterial({color:col(K.accent), emissive:col(K.accent), emissiveIntensity:lit ? .18 : 1.25, roughness:.3, metalness:lit ? .4 : .2, side:THREE.DoubleSide});
      // opaque in tier 2, so the transmission glass refracts it (transparent things draw after the glass and never show in it)
      M.ghost=new THREE.MeshStandardMaterial({color:col(K.ghost), roughness:.5, metalness:.1, transparent:tier!==2, opacity:tier===2 ? 1 : .7, side:THREE.DoubleSide});
      M.halo=new THREE.MeshBasicMaterial({color:col(K.accent), transparent:true, opacity:.5, depthWrite:false, side:THREE.DoubleSide});
    }
    const states=c=> ctx.chartStates(c, lit);
    // A surface or ribbon coloured by its height, which is its level: dim and cool below the MEC, the accent in the
    // window, hot past the MTC, the edges crisp at any zoom; with lines, a hairline in each threshold's colour where it
    // crosses the MEC and the MTC. Without a band (grad), a plain ramp from cool to the accent.
    let viewMats=[], retired=[];
    const own=m=>{ m.userData.own=true; return m; };
    function stateMat(lo, hi, S, o){
      o=o||{};
      const m=new THREE.MeshStandardMaterial({roughness:o.rough!=null ? o.rough : .42, metalness:o.metal!=null ? o.metal : .08, side:THREE.DoubleSide, transparent:(o.opacity||1)<1, opacity:o.opacity||1, envMapIntensity:.7});
      if(!lit){ m.emissive=col("#ffffff"); m.emissiveIntensity=o.glow!=null ? o.glow : .2; }
      const U={uLo:{value:lo}, uHi:{value:hi}, uTop:{value:o.top||1}, uGrad:{value:o.grad ? 1 : 0}, uLines:{value:o.lines ? 1 : 0},
        uDim:{value:col(S.dim)}, uCool:{value:col(S.cool)}, uIn:{value:col(o.inCol || S.lum)}, uHot:{value:col(S.hot)}, uMec:{value:col(K.mec)}, uMtc:{value:col(K.mtc)}};
      m.onBeforeCompile=sh=>{
        Object.assign(sh.uniforms, U);
        sh.vertexShader=sh.vertexShader.replace("#include <common>", "#include <common>\nvarying float vH;").replace("#include <begin_vertex>", "#include <begin_vertex>\n\tvH = position.y;");
        sh.fragmentShader=sh.fragmentShader.replace("#include <common>", `#include <common>
varying float vH;
uniform float uLo, uHi, uTop, uGrad, uLines;
uniform vec3 uDim, uCool, uIn, uHot, uMec, uMtc;
vec3 stateOf(float h){
  if(uGrad > .5) return mix(uCool, uIn, clamp(h/uTop, 0., 1.));
  float w = fwidth(h)*1.2;
  vec3 c = mix(mix(uDim, uCool, smoothstep(0., max(uLo, 1e-4), h)), uIn, smoothstep(uLo - w, uLo + w, h));
  return mix(c, uHot, smoothstep(uHi - w, uHi + w, h));
}`).replace("vec4 diffuseColor = vec4( diffuse, opacity );", "vec3 sc = stateOf(vH);\n\tvec4 diffuseColor = vec4( sc, opacity );")
          .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
	totalEmissiveRadiance *= sc;
	if(uLines > .5){ float w = fwidth(vH)*1.4; float a = 1. - smoothstep(0., w, abs(vH - uLo)); float b = 1. - smoothstep(0., w, abs(vH - uHi));
		diffuseColor.rgb = mix(mix(diffuseColor.rgb, uMec, a), uMtc, b); totalEmissiveRadiance = mix(mix(totalEmissiveRadiance, uMec*.7, a), uMtc*.7, b); }`);
      };
      m.customProgramCacheKey=()=> "dc-state";
      viewMats.push(m); return m;
    }
    // a level's colour by state, as on the 2D chart: cool below the MEC, luminous in the window, hot past the MTC
    function stateCol(c, S, mec, mtc){
      if(c>mtc) return col(S.hot);
      if(c>=mec) return col(S.lum);
      return col(S.cool).lerp(col(S.dim), clamp(1-c/Math.max(mec,1e-9), 0, 1)*.6);
    }

    /* ---------- geometry: the stage's ribbon (a rounded profile swept along the curve) ---------- */
    const PROF=(()=>{ const hw=.17, ht=.052, r=.044, seg=3, out=[];
      [[ht-r, hw-r, 0],[-(ht-r), hw-r, Math.PI/2],[-(ht-r), -(hw-r), Math.PI],[ht-r, -(hw-r), 1.5*Math.PI]].forEach(([cn,cz,a0])=>{
        for(let s=0;s<=seg;s++){ const a=a0+(Math.PI/2)*s/seg, nn=Math.cos(a), nz=Math.sin(a); out.push([cn+r*nn, cz+r*nz, nn, nz]); } });
      return out; })();
    function ribbonGeo(xs, ys, zs, scale, colors){
      const N=xs.length, NP=PROF.length, pos=new Float32Array(N*NP*3), nor=new Float32Array(N*NP*3), cl=new Float32Array(N*NP*3), idx=[];
      for(let i=0;i<N-1;i++) for(let j=0;j<NP;j++){ const a=i*NP+j, b=i*NP+(j+1)%NP, c=(i+1)*NP+j, d=(i+1)*NP+(j+1)%NP; idx.push(a,c,b, b,c,d); }
      for(let i=0;i<N;i++){
        const i0=Math.max(0,i-1), i1=Math.min(N-1,i+1); let tx=xs[i1]-xs[i0], ty=ys[i1]-ys[i0]; const l=Math.hypot(tx,ty)||1; tx/=l; ty/=l;
        const nx=-ty, ny=tx, cc=colors[i];
        for(let j=0;j<NP;j++){ const [pn,pz,cn,cz]=PROF[j], o=(i*NP+j)*3;
          pos[o]=xs[i]+nx*pn*scale; pos[o+1]=ys[i]+ny*pn*scale; pos[o+2]=zs[i]+pz*scale; nor[o]=nx*cn; nor[o+1]=ny*cn; nor[o+2]=cz;
          cl[o]=cc.r; cl[o+1]=cc.g; cl[o+2]=cc.b; }
      }
      const g=new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos,3)); g.setAttribute("normal", new THREE.BufferAttribute(nor,3)); g.setAttribute("color", new THREE.BufferAttribute(cl,3)); g.setIndex(idx);
      return g;
    }
    function segs(list, mat){ const pos=[]; list.forEach(([a,b])=> pos.push(a[0],a[1],a[2], b[0],b[1],b[2])); const g=new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos,3)); return new THREE.LineSegments(g, mat); }
    function slab(x0,x1,y0,y1,z0,z1, mat){ const m=new THREE.Mesh(new THREE.BoxGeometry(Math.max(1e-3,x1-x0), Math.max(1e-3,y1-y0), Math.max(1e-3,z1-z0)), mat); m.position.set((x0+x1)/2, (y0+y1)/2, (z0+z1)/2); m.renderOrder=2; return m; }
    // a smooth surface over a grid of points P[r][c] = [x, y, z], coloured per vertex; a null point leaves its quads out
    function surface(P, C, mat){
      const R=P.length, Cn=P[0].length, pos=new Float32Array(R*Cn*3), cl=new Float32Array(R*Cn*3), idx=[];
      P.forEach((row,r)=> row.forEach((p,c)=>{ const o=(r*Cn+c)*3; if(p) pos.set(p,o); cl[o]=C[r][c].r; cl[o+1]=C[r][c].g; cl[o+2]=C[r][c].b; }));
      for(let r=0;r<R-1;r++) for(let c=0;c<Cn-1;c++){ if(!P[r][c] || !P[r][c+1] || !P[r+1][c] || !P[r+1][c+1]) continue; const a=r*Cn+c, b=a+1, d=a+Cn, e=d+1; idx.push(a,d,b, b,d,e); }
      const g=new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos,3)); g.setAttribute("color", new THREE.BufferAttribute(cl,3)); g.setIndex(idx); g.computeVertexNormals();
      return new THREE.Mesh(g, mat);
    }
    const bead=(x,y,z,r)=>{ const m=new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), M.bead); m.position.set(x,y,z); return m; };

    /* ---------- labels: HTML, placed by projection ---------- */
    let labels=[];
    function setLabels(list){
      lblLayer.textContent=""; labels=list.map(l=>{ const el=document.createElement("span"); el.textContent=l.text; if(l.cls) el.className=l.cls; lblLayer.appendChild(el); return Object.assign({el, v:new THREE.Vector3(...l.at)}, l); });
    }
    const tmp=new THREE.Vector3();
    function toScreen(v, out){ tmp.copy(v).applyMatrix4(world.matrixWorld).project(camera); out.x=(tmp.x+1)/2*cw; out.y=(1-tmp.y)/2*ch; out.z=tmp.z; return out; }
    const scr={x:0,y:0,z:0};
    const ALIGN={b:"-50%,6px", l:"calc(-100% - 8px),-50%", r:"8px,-50%", t:"-50%,calc(-100% - 6px)", c:"-50%,-50%"};
    function placeLabels(){
      for(const l of labels){ toScreen(l.v, scr); const vis=scr.z<1 && scr.x>-40 && scr.x<cw+40 && scr.y>-20 && scr.y<ch+20;
        l.el.style.visibility=vis ? "" : "hidden"; if(vis) l.el.style.transform=`translate(${scr.x.toFixed(1)}px,${scr.y.toFixed(1)}px) translate(${ALIGN[l.al||"c"]})`; }
    }

    /* ---------- camera: orbit with inertia, eased moves, the flat pose that matches the 2D chart ---------- */
    let cw=1, ch=1, W=12, H=5, DZ=5;
    const pose={az:0, el:0, dist:12, tx:0, ty:2, tz:0, m:1}, vel={az:0, el:0};
    let anim=null, raf=0, touched=false, idleAt=0, needs=true, lastT=0, inView=true;
    function applyPose(){
      const {az, el, dist}=pose, ce=Math.cos(el);
      camera.position.set(pose.tx+dist*ce*Math.sin(az), pose.ty+dist*Math.sin(el), pose.tz+dist*ce*Math.cos(az));
      camera.lookAt(pose.tx, pose.ty, pose.tz);
      world.scale.z=lerp(.015, 1, pose.m); world.updateMatrixWorld();
    }
    // the pose in which the 3D plane lies exactly where the 2D chart's plotting area is on screen
    function flatPose(){
      const A=ctx.geom, svg=ctx.svg.getBoundingClientRect(), hb=host.getBoundingClientRect();
      const s=Math.min(svg.width/A.PW, svg.height/A.PH), ox=svg.left-hb.left+(svg.width-A.PW*s)/2, oy=svg.top-hb.top+(svg.height-A.PH*s)/2;
      const left=ox+A.M.l*s, top=oy+A.M.t*s, w=(A.PW-A.M.l-A.M.r)*s, h=(A.PH-A.M.t-A.M.b)*s, ppu=w/W;
      const dist=ch/(2*Math.tan(FOV*Math.PI/360)*ppu);
      return {az:0, el:0, dist, tx:(cw/2-(left+w/2))/ppu, ty:H/2-(ch/2-(top+h/2))/ppu, tz:0, m:0};
    }
    // the distance at which the view's box, seen from (az, el), fills the panel between its top and bottom bars
    let topH=5;
    const cam2=new THREE.PerspectiveCamera(FOV, 1, .05, 400), corner=new THREE.Vector3();
    function fitDist(az, el){
      if(az===undefined){ az=pose.az; el=pose.el; }
      cam2.aspect=cw/ch; cam2.updateProjectionMatrix();
      const ty=topH/2, ce=Math.cos(el), ok=d=>{ cam2.position.set(d*ce*Math.sin(az), ty+d*Math.sin(el), d*ce*Math.cos(az)); cam2.lookAt(0, ty, 0); cam2.updateMatrixWorld();
        for(const x of [-W/2, W/2]) for(const y of [0, topH]) for(const z of [-DZ/2, DZ/2]){ corner.set(x, y, z).project(cam2); if(corner.z>1 || Math.abs(corner.x)>.9 || corner.y>.76 || corner.y<(phone() ? -.62 : -.8)) return false; }
        return true; };
      let lo=.5, hi=300; for(let i=0;i<28;i++){ const m=(lo+hi)/2; if(ok(m)) hi=m; else lo=m; }
      return hi;
    }
    const CAMS={front:[0, .02], iso:[-.62, .46], top:[0, 1.42]};
    let home={az:-.55, el:.32};
    const homePose=(a=home)=> ({az:a.az, el:a.el, dist:fitDist(a.az, a.el), tx:0, ty:topH/2, tz:0, m:1});
    function animate(to, dur, done){
      if(still()) dur=0;
      anim={from:Object.assign({}, pose), to, t0:performance.now(), dur, done}; vel.az=vel.el=0; kick();
    }
    function step(now){
      raf=0;
      if(host.hidden || !inView) return;
      const dt=lastT ? Math.min(64, now-lastT) : 16; lastT=now;
      let moving=false;
      if(anim){
        const u=anim.dur ? clamp((now-anim.t0)/anim.dur, 0, 1) : 1, e=EASE(u);
        // the shorter way round
        let da=anim.to.az-anim.from.az; da=Math.atan2(Math.sin(da), Math.cos(da));
        pose.az=anim.from.az+da*e; ["el","dist","tx","ty","tz","m"].forEach(k=>{ if(anim.to[k]!==undefined) pose[k]=lerp(anim.from[k], anim.to[k], e); });
        moving=true;
        if(u>=1){ const d=anim.done; anim=null; idleAt=now; if(d) d(); }
      } else if(Math.abs(vel.az)>1e-4 || Math.abs(vel.el)>1e-4){
        pose.az+=vel.az; pose.el=clamp(pose.el+vel.el, -.2, 1.45); vel.az*=.9; vel.el*=.9; moving=true;
      } else if(!touched && !still() && view && pose.m>=1 && now-idleAt>1800){
        pose.az+=0.044*dt/1000; moving=true;   // a slow turn (2.5° a second) until the first touch
      }
      if(pulseUntil>now){ pulses.forEach((h,i)=>{ const f=((now/1600)+i*.13)%1; h.scale.setScalar(1+f*1.6); h.material.opacity=(1-f)*.45; }); moving=true; }
      else if(pulses.length && pulses[0].material.opacity!==0){ pulses.forEach(h=>{ h.material.opacity=0; }); needs=true; }
      if(moving || needs){ applyPose(); renderer.render(scene, camera); placeLabels(); if(chipAt) placeChip(); needs=false;
        // materials replaced by a rebuild go only now, once their successors have drawn: they share one program, which a
        // dispose before then would delete and the next frame recompile
        if(retired.length){ retired.forEach(m=> m.dispose()); retired=[]; } }
      if(moving) kick(); else lastT=0;
    }
    const kick=()=>{ if(!raf && !host.hidden) raf=requestAnimationFrame(step); };
    const redraw=()=>{ needs=true; kick(); };
    function size(){
      cw=Math.max(1, host.clientWidth); ch=Math.max(1, host.clientHeight);
      renderer.setPixelRatio(Math.min(devicePixelRatio||1, tier===2 ? 2 : phone() ? 1.5 : 1.75));
      renderer.setSize(cw, ch, false); camera.aspect=cw/ch; camera.updateProjectionMatrix(); redraw();
    }
    const ro=new ResizeObserver(()=>{ if(!host.hidden) size(); }); ro.observe(host);
    // nothing is drawn while the panel is off screen
    new IntersectionObserver(es=>{ inView=es[0].isIntersecting; if(inView){ lastT=0; redraw(); } }).observe(host);

    /* ---------- the views ---------- */
    let view=null, content=null, hits=null, pulses=[], pulseUntil=0, regMetric="auc", doseRange=null, regRange=null, dragKind=null, lastKey="";
    const pdata={};   // cached data per view, keyed by what it depends on
    const primary=()=>{ const cs=ctx.plotCurves, ed=ctx.mode==="cmp" ? cs.find(c=> c.id===ctx.cmpEdit) : cs.find(c=> !c.ghost); return (ed || cs[0]).p; };
    const unit=()=> ctx.U();
    function available(id){
      const p=primary();
      if(id==="dose") return p.dosing!=="custom";
      if(id==="regimen") return p.dosing!=="custom" && !PK.hdOn(p);
      if(id==="cmt") return p.cmt===2 && p.kin!=="mm";
      return true;
    }
    function syncPicker(){
      viewsEl.querySelectorAll("button").forEach(b=>{ const id=b.dataset.v, ok=available(id), on=id===view;
        b.hidden=id==="cmt" && !ok; b.disabled=!ok; b.title=ok ? "" : id==="regimen" && PK.hdOn(primary()) ? "Not with dialysis" : "For a single dose or a regular regimen";
        b.classList.toggle("on", on); b.setAttribute("aria-checked", on); b.tabIndex=on ? 0 : -1; });
      metEl.hidden=view!=="regimen";
      metEl.querySelectorAll("button").forEach(b=>{ const id=b.dataset.m, ok=id!=="ft" || ctx.state.mic>0, on=id===regMetric; b.hidden=!ok; b.classList.toggle("on", on); b.setAttribute("aria-checked", on); b.tabIndex=on ? 0 : -1; });
    }
    function clearContent(){
      if(content){ content.traverse(o=>{ if(o.geometry) o.geometry.dispose(); if(o.material && o.material.userData.own) retired.push(o.material); }); world.remove(content); }
      content=new THREE.Group(); world.add(content); pulses=[]; hits=null;
      retired.push(...viewMats); viewMats=[];
    }
    // The heavy grids (the dose surface, the regimen map, the population): computed at once when nothing has changed for
    // a moment, but while a setting moves frame after frame the last grid stays up and the new one follows when it stops.
    // A change of range (hard) is computed at once.
    const slow={};
    function cached(name, hard, soft, compute){
      const c=slow[name] || (slow[name]={}), key=hard+"#"+soft, now=performance.now();
      if(c.key===key) return c.data;
      if(c.data!==undefined && c.hard===hard && (now-c.at<180 || dragKind)){
        c.at=now; clearTimeout(c.t); c.t=setTimeout(()=>{ c.at=0; if(open){ lastKey=""; rebuild(); } }, 200);
        return c.data;
      }
      c.key=key; c.hard=hard; c.at=now; c.data=compute(); return c.data;
    }
    // ticks: the 2D chart's own (nice numbers, or decades on a log axis)
    const ticksOf=(lo, hi, n)=> ctx.ticksRange(lo, hi, n).filter(v=> v>=lo-1e-9 && v<=hi+1e-9);
    function axisY(top, isLog, floor){
      const Y=isLog ? c=> H*clamp((Math.log10(Math.max(c,floor))-Math.log10(floor))/(Math.log10(top)-Math.log10(floor)), 0, 1.3) : c=> H*clamp(c/top, 0, 1.3);
      const ticks=isLog ? (()=>{ const o=[]; for(let e=Math.ceil(Math.log10(floor)); e<=Math.floor(Math.log10(top)); e++) o.push(Math.pow(10,e)); return o; })() : ticksOf(0, top, phone() ? 4 : 6);
      return {Y, ticks};
    }
    const lab=(text, at, al, cls)=> ({text, at, al, cls});
    // the box's hairline grid: a back wall (x–y), a floor (x–z) and a side wall (y–z)
    function gridBox(xt, yt, zt, X, Y, Z, x0, x1, y1, z0, z1){
      const L=[];
      xt.forEach(v=>{ const x=X(v); L.push([[x,0,z0],[x,y1,z0]], [[x,0,z0],[x,0,z1]]); });
      yt.forEach(v=>{ const y=Y(v); L.push([[x0,y,z0],[x1,y,z0]], [[x0,y,z0],[x0,y,z1]]); });
      zt.forEach(v=>{ const z=Z(v); L.push([[x0,0,z],[x1,0,z]], [[x0,0,z],[x0,y1,z]]); });
      content.add(segs(L, M.hair));
      content.add(segs([[[x0,0,z1],[x1,0,z1]], [[x0,0,z0],[x0,0,z1]], [[x0,0,z1],[x0,y1,z1]]], M.hairS));
    }

    // 1. the curve in space
    function buildCurve(){
      const A=ctx.axes, curves=ctx.plotCurves, T0=A.T0, T1=A.T1, st=ctx.state;
      DZ=2.4; home=cw/ch>1.9 ? {az:-.4, el:.22} : {az:-.55, el:.3}; topH=H*1.08;
      const X=t=> -W/2+W*(t-T0)/(T1-T0), {Y, ticks}=axisY(A.yTop, A.isLog, A.yFloor), z0=-DZ/2, z1=DZ/2;
      const xt=ticksOf(T0, T1, phone() ? 5 : 7), L=[];
      gridBox(xt, ticks, [], X, Y, null, -W/2, W/2, H, z0, z1);
      xt.forEach(v=> L.push(lab(trim(v), [X(v), 0, z1], "b")));
      ticks.forEach(v=> L.push(lab(ctx.fmtAxis(v), [-W/2, Y(v), z1], "l")));
      L.push(lab("Time (h)", [0, 0, z1+.55], "b", "ax"), lab(`Concentration (${unit().conc})`, [-W/2, H*1.08, z1], "t", "ax"));
      // the window as a glass slab, its edges in the thresholds' colours
      const yl=Y(st.mec), yh=Math.min(Y(st.mtc), H*1.06);
      if(st.mtc>st.mec && yh>yl){ content.add(slab(-W/2, W/2, yl, yh, z0, z1, M.glass));
        content.add(segs([[[-W/2,yl,z1],[W/2,yl,z1]],[[W/2,yl,z0],[W/2,yl,z1]]], M.mec), segs([[[-W/2,yh,z1],[W/2,yh,z1]],[[W/2,yh,z0],[W/2,yh,z1]]], M.mtc));
        L.push(lab("MEC", [W/2, yl, z1], "r"), lab("MTC", [W/2, yh, z1], "r")); }
      // the curves: the live one in front, a baseline or the other side behind
      const ordered=curves.slice().sort((a,b)=> (a.ghost?1:0)-(b.ghost?1:0)), read=[];
      ordered.forEach((cv,k)=>{
        const z=cv.ghost ? z0+.45 : ctx.mode==="cmp" ? (cv.id==="a" ? .35 : -.35) : 0;
        const base=cv.ghost ? K.ghost : cv.id==="b" ? K.b : K.accent, S=states(base), pts=cv.pts.filter(q=> q.t>=T0-1e-9 && q.t<=T1+1e-9);
        const xs=pts.map(q=> X(q.t)), ys=pts.map(q=> Y(q.c)), zs=pts.map(()=> z);
        const cs=pts.map(()=> col(base));
        const mat=cv.ghost ? M.ghost : stateMat(Y(st.mec), st.mtc>st.mec ? Y(st.mtc) : 1e9, S, {glow:.85, rough:lit ? .45 : .32, metal:lit ? .1 : .2});
        const mesh=new THREE.Mesh(ribbonGeo(xs, ys, zs, cv.ghost ? .55 : .8, cs), mat); content.add(mesh);
        if(!cv.ghost) read.push({id:cv.id, tag:ctx.mode==="cmp" ? cv.tag : "", pts:pts.map((q,i)=>({t:q.t, c:q.c, v:new THREE.Vector3(xs[i], ys[i], z)}))});
      });
      read.forEach(r=> r.pts.forEach(q=>{ q.tag=r.tag; }));
      const edited=read.find(r=> ctx.mode==="cmp" ? r.id===ctx.cmpEdit : true) || read[0];
      hits={kind:"curve", pts:edited ? edited.pts : [], all:read.flatMap(r=> r.pts)};
      // the doses: beads on the time axis at the front, with a faint stem
      const p=primary(), all=PK.doseEvents(p);
      const beads=[];
      all.forEach((e,i)=>{ if(e.t<T0-1e-9 || e.t>T1+1e-9) return; const x=X(e.t), b=bead(x, 0, z1, .085); content.add(b); beads.push({i, n:e.n || i+1, t:e.t, mg:e.mg, route:e.route, v:new THREE.Vector3(x, 0, z1)});
        const h=new THREE.Mesh(new THREE.RingGeometry(.1, .13, 32), own(M.halo.clone())); h.position.set(x, .002, z1); h.rotation.x=-Math.PI/2; h.material.opacity=0; content.add(h); pulses.push(h); });
      hits.beads=beads; hits.custom=p.dosing==="custom";
      // the time cursor, when there is one
      cursorBead=bead(0, 0, 0, .1); cursorBead.visible=false; content.add(cursorBead); syncCursor();
      setLabels(L);
      legend([["line", K.accent, "Concentration"], ["box", K.band, "Window (MEC–MTC)"], ["dot", K.accent, "Dose"]].concat(curves.some(c=> c.ghost) ? [["line", K.ghost, "Baseline"]] : ctx.mode==="cmp" ? [["line", K.b, "B (behind A)"]] : []));
      pulseUntil=performance.now()+(still() ? 0 : 4800);
      return `Concentration over ${trim(T0)}–${trim(T1)} h as a ribbon in 3D, the window as a glass slab and each dose as a bead on the time axis.`;
    }
    let cursorBead=null;
    function syncCursor(){
      if(!cursorBead || !hits || view!=="curve") return;
      const t=ctx.cursorT; if(t===null || t===undefined){ cursorBead.visible=false; redraw(); return; }
      // shown only where the 2D chart shows its cursor: inside the window
      const P=hits.pts; if(!P.length || t<P[0].t-1e-9 || t>P[P.length-1].t+1e-9){ cursorBead.visible=false; redraw(); return; }
      let i=P.findIndex(q=> q.t>=t); if(i<0) i=P.length-1; if(i>0 && t-P[i-1].t<P[i].t-t) i--;
      cursorBead.position.copy(P[i].v); cursorBead.visible=true; redraw();
    }

    // 2. the dose surface
    function buildDose(){
      const A=ctx.axes, T0=A.T0, T1=A.T1, st=ctx.state, p=primary(), D=p.D, drug=drugFor(ctx.drug, p), R=PK.RANGES.D;
      DZ=6; home={az:-.9, el:.44}; topH=H*1.1;
      if(!doseRange || (dragKind!=="dose" && (D<doseRange[0] || D>doseRange[1] || doseRange[2]!==drugKey(drug)))){
        const lo=Math.max(R[0], D/4), hi=Math.min(R[1], Math.max(D*2.5, lo*4));
        doseRange=[lo, hi, drugKey(drug)];
      }
      const [lo, hi]=doseRange, nd=phone() ? 16 : 26, nt=phone() ? 60 : 110;
      const G=cached("dose", [T0, T1, lo, hi, nd, nt].join("|"), PK.encodeScenario(Object.assign({}, p, {D:500}))+"|"+!!PK.hdModule, ()=> doseGrid(PK, p, T0, T1, linspace(lo, hi, nd), nt));
      const cur=doseGrid(PK, p, T0, T1, [D], nt).c[0];
      const top=Math.max(st.mtc, ...G.c.map(r=> Math.max(...r)), ...cur)*1.08 || 1;
      const X=t=> -W/2+W*(t-T0)/(T1-T0), Y=c=> H*clamp(c/top, 0, 1.2), Z=d=> DZ/2-DZ*(d-lo)/(hi-lo), S=states(K.accent);
      const P=G.doses.map((d,r)=> G.ts.map((t,c)=> [X(t), Y(G.c[r][c]), Z(d)])), C=G.doses.map((d,r)=> G.c[r].map(c=> stateCol(c, S, st.mec, st.mtc)));
      const surf=surface(P, C, stateMat(Y(st.mec), st.mtc>st.mec ? Y(st.mtc) : 1e9, S, {inCol:K.accent, glow:.14, rough:.55, opacity:tier===2 ? 1 : .92, lines:true})); content.add(surf);
      const steps=doseSteps(lo, hi, drug, D), dt=ticksOf(lo, hi, 4).filter(v=> v>0);
      const xt=ticksOf(T0, T1, phone() ? 5 : 7), yt=ticksOf(0, top, 5), L=[];
      gridBox(xt, yt, dt, X, Y, Z, -W/2, W/2, H, -DZ/2, DZ/2);
      const yl=Y(st.mec), yh=Math.min(Y(st.mtc), H*1.1);
      if(st.mtc>st.mec && yh>yl){ content.add(slab(-W/2, W/2, yl, yh, -DZ/2, DZ/2, M.glass));
        content.add(segs([[[-W/2,yl,DZ/2],[W/2,yl,DZ/2]],[[W/2,yl,-DZ/2],[W/2,yl,DZ/2]]], M.mec), segs([[[-W/2,yh,DZ/2],[W/2,yh,DZ/2]],[[W/2,yh,-DZ/2],[W/2,yh,DZ/2]]], M.mtc)); }
      // the current dose: a lit ribbon on the surface, the handle the dose is dragged by
      const xs=G.ts.map(X), ys=cur.map(c=> Y(c)+.05), zs=G.ts.map(()=> Z(D)), cs=cur.map(()=> col(K.accent));
      const lead=new THREE.Mesh(ribbonGeo(xs, ys, zs, dragKind==="dose" ? 1.25 : 1, cs), M.lit); content.add(lead);
      hits={kind:"dose", surf, p, lead:G.ts.map((t,i)=> ({t, c:cur[i], v:new THREE.Vector3(xs[i], ys[i], zs[i])})), steps, lo, hi, D, T0, T1, Z, X, Y, G, top};
      xt.forEach(v=> L.push(lab(trim(v), [X(v), 0, DZ/2], "b")));
      dt.forEach(v=> L.push(lab(`${trim(v)}`, [W/2+.15, 0, Z(v)], "r")));
      yt.forEach(v=> L.push(lab(ctx.fmtAxis(v), [-W/2, Y(v), -DZ/2], "l")));
      L.push(lab("Time (h)", [0, 0, DZ/2+.6], "b", "ax"), lab(`Dose (${unit().dose})`, [W/2+.9, 0, 0], "r", "ax"), lab(`Concentration (${unit().conc})`, [-W/2, H*1.12, -DZ/2], "t", "ax"),
        lab(`${trim(D)} ${unit().dose}`, [X(T1), ys[ys.length-1], Z(D)], "r", "hot"));
      setLabels(L);
      legend([["sheet", K.accent, "Level at each dose"], ["box", K.band, "Window (MEC–MTC)"], ["line", K.accent, "This dose: drag it"]]);
      return `The level over ${trim(T0)}–${trim(T1)} h for doses from ${trim(+lo.toPrecision(3))} to ${trim(+hi.toPrecision(3))} ${unit().dose} as a surface, the window cutting through it; the current dose, ${trim(D)} ${unit().dose}, is the lit line.`;
    }
    const drugKey=d=> d ? d.id : "";

    // 3. the regimen map
    function regimenTarget(){
      const st=ctx.state;
      if(regMetric==="ft") return {lo:null, hi:null, note:"No fT>MIC target is shown: none was verified"};
      if(regMetric==="auc") return st.phi>st.plo && st.plo>0 ? {lo:st.plo, hi:st.phi, note:`Target AUC24 ${trim(st.plo)}–${trim(st.phi)} (Population's)`}
        : {lo:st.mec*24, hi:st.mtc*24, note:"Band: the window's MEC–MTC held for 24 h"};
      return {lo:st.mec, hi:st.mtc, note:`Band: the window, ${trim(st.mec)}–${trim(st.mtc)} ${unit().conc}`};
    }
    function buildRegimen(){
      // a single dose is shown as a regimen of the scenario's own interval, and said to be a stand-in
      const st=ctx.state, p=primary(), drug=drugFor(ctx.drug, p), R=PK.RANGES.D, D=p.D, tau=p.tau, stand=p.dosing!=="repeated";
      DZ=6; home={az:-.66, el:.5}; topH=H*1.15;
      if(regMetric==="ft" && !(st.mic>0)) regMetric="auc";
      if(!regRange || (dragKind!=="reg" && (D<regRange[0] || D>regRange[1] || regRange[2]!==drugKey(drug)))){
        const lo=Math.max(R[0], D/4), hi=Math.min(R[1], Math.max(D*2.5, lo*4)); regRange=[lo, hi, drugKey(drug)];
      }
      const [lo, hi]=regRange, nd=phone() ? 14 : 24, taus=phone() ? [2,3,4,6,8,10,12,16,20,24] : linspace(2, 24, 23);
      const G=cached("reg", [regMetric, lo, hi, nd, taus.length].join("|"), PK.encodeScenario(Object.assign({}, p, {D:500, tau:8, dosing:"repeated", nDoses:6, loadMult:1, missed:1}))+"|"+st.mic,
        ()=> regimenGrid(PK, p, linspace(lo, hi, nd), taus, regMetric, st.mic));
      const tg=regimenTarget(), vals=G.v.flat().filter(v=> v!=null && isFinite(v));
      const srt=vals.slice().sort((a,b)=>a-b), q85=srt[Math.floor(srt.length*.85)]||0;
      const top=(regMetric==="ft" ? 100 : Math.min(srt[srt.length-1]||1, Math.max((tg.hi||0)*1.8, q85)))*1.1 || 1, curV=ssMetric(PK, regimenOf(PK, p, D, tau), regMetric, st.mic);
      const X=d=> -W/2+W*(d-lo)/(hi-lo), Y=v=> H*clamp((v==null ? 0 : v)/top, 0, 1.15), Z=t=> DZ/2-DZ*(t-2)/22, S=states(K.accent);
      const colOf=v=> v==null ? col(K.muted).multiplyScalar(.6) : tg.lo==null ? col(S.cool).lerp(col(S.lum), clamp(v/100, 0, 1)) : v<tg.lo ? col(S.cool) : v>tg.hi ? col(S.hot) : col(S.lum);
      const surf=surface(G.taus.map((t,r)=> G.doses.map((d,c)=> G.v[r][c]==null ? null : [X(d), Y(G.v[r][c]), Z(t)])), G.v.map(row=> row.map(colOf)),
        stateMat(tg.lo==null ? 0 : Y(tg.lo), tg.lo==null ? 1e9 : Y(tg.hi), S, {inCol:K.accent, glow:.14, rough:.55, opacity:tier===2 ? 1 : .92, lines:tg.lo!=null, grad:tg.lo==null, top:H}));
      content.add(surf);
      // regimens with no steady state (a saturable drug given faster than its Vmax): a muted plate on the floor
      const none=[];
      for(let r=0;r<G.taus.length-1;r++) for(let c=0;c<G.doses.length-1;c++) if([G.v[r][c], G.v[r][c+1], G.v[r+1][c], G.v[r+1][c+1]].some(v=> v==null)){
        const x0=X(G.doses[c]), x1=X(G.doses[c+1]), z0=Z(G.taus[r]), z1=Z(G.taus[r+1]); none.push(x0,.004,z0, x1,.004,z0, x0,.004,z1, x1,.004,z0, x1,.004,z1, x0,.004,z1); }
      if(none.length){ const g=new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(none, 3)); content.add(new THREE.Mesh(g, M.none)); }
      if(tg.lo!=null){ const a=Y(tg.lo), b=Math.min(Y(tg.hi), H*1.12); if(b>a){ content.add(slab(-W/2, W/2, a, b, -DZ/2, DZ/2, M.glass));
        content.add(segs([[[-W/2,a,DZ/2],[W/2,a,DZ/2]],[[W/2,a,-DZ/2],[W/2,a,DZ/2]]], M.mec), segs([[[-W/2,b,DZ/2],[W/2,b,DZ/2]],[[W/2,b,-DZ/2],[W/2,b,DZ/2]]], M.mtc)); } }
      const steps=doseSteps(lo, hi, drug, D), nl=phone() ? 3 : 6, dt=steps.length>nl+1 ? steps.filter((_,i)=> i%Math.ceil(steps.length/nl)===0) : steps, yt=ticksOf(0, top, phone() ? 4 : 5), L=[];
      gridBox(dt, yt, TAUS, X, Y, Z, -W/2, W/2, H, -DZ/2, DZ/2);
      content.add(segs(yt.map(v=> [[W/2, Y(v), -DZ/2], [W/2, Y(v), -DZ/2+.15]]).concat([[[W/2,0,-DZ/2],[W/2,H,-DZ/2]]]), M.hairS));
      // the marker: the simulator's regimen, a bead with a stem down to its place on the floor
      const mx=X(D), my=Y(curV), mz=Z(tau), m=bead(mx, my, mz, dragKind==="reg" ? .17 : .14); content.add(m);
      content.add(segs([[[mx,0,mz],[mx,my,mz]]], M.pick));
      const ring=new THREE.Mesh(new THREE.RingGeometry(.2, .24, 40), own(M.halo.clone())); ring.rotation.x=-Math.PI/2; ring.position.set(mx, .003, mz); ring.material.opacity=.7; content.add(ring);
      hits={kind:"regimen", surf, p, marker:new THREE.Vector3(mx, my, mz), floor:new THREE.Vector3(mx, 0, mz), steps, lo, hi, X, Y, Z, G, tg, top};
      dt.forEach(v=> L.push(lab(trim(v), [X(v), 0, DZ/2], "b")));
      (phone() ? [4, 12, 24] : TAUS).forEach(t=> L.push(lab(`q${t}h`, [-W/2, 0, Z(t)], "l")));
      const name=METRICS.find(x=> x[0]===regMetric)[1], u=regMetric==="auc" ? unit().auc : regMetric==="ft" ? "%" : unit().conc;
      yt.filter(v=> v>0).forEach(v=> L.push(lab(ctx.fmtAxis(v), [W/2, Y(v), -DZ/2], "r")));
      L.push(lab(`Dose (${unit().dose})`, [0, 0, DZ/2+.6], "b", "ax"), lab("Interval", [-W/2-1.1, 0, 0], "l", "ax"), lab(`${name} at steady state (${u})`, [W/2, H*1.2, -DZ/2], "t", "ax"),
        lab(`${trim(D)} ${unit().dose} q${trim(tau)}h${stand ? " (as a regimen)" : ""} · ${curV==null ? "no steady state" : fmt(curV, regMetric==="auc" ? 0 : regMetric==="ft" ? 0 : ctx.cdp(1))+(regMetric==="ft" ? "%" : "")}`, [mx, my, mz], "t", "hot"));
      setLabels(L);
      legend((tg.lo==null ? [["sheet", S.cool, `${name} lower`], ["sheet", K.accent, `${name} higher`]] : [["sheet", K.accent, `${name}: in the band`], ["sheet", S.cool, "below"], ["sheet", S.hot, "above"]])
        .concat(none.length ? [["sheet", K.muted, "No steady state: the level keeps rising"]] : [], [["dot", K.accent, stand ? "A single dose, shown as a regimen: drag it" : "This regimen: drag it"], ["note", null, tg.note]]));
      return `${name} at steady state for doses ${trim(+lo.toPrecision(3))}–${trim(+hi.toPrecision(3))} ${unit().dose} and intervals of 2–24 h as a surface. ${tg.note}.${none.length ? " Regimens with no steady state, where the level keeps rising, are a flat plate on the floor." : ""} `+
        (stand ? `The simulator gives a single dose; the marker shows it as ${trim(D)} ${unit().dose} every ${trim(tau)} h for comparison. Dragging it chooses a regimen.` : `The marker is the simulator's regimen, ${trim(D)} ${unit().dose} every ${trim(tau)} h.`);
    }

    // 4. the population cloud
    let popGen=0;
    function buildPop(){
      const A=ctx.axes, T0=A.T0, T1=A.T1, st=ctx.state, p=primary(), N0=st.popn||200;
      // a saturable drug on a fast dialyzer in a small body needs short steps for every patient: drawn on the page, the
      // cloud then keeps to the first patients (the same ones, by the same seed) that fit about 1.5 million steps
      const V0=PK.vOf(p), stepH=p.kin==="mm" && PK.hdOn(p) ? Math.min(PK.MM_STEP, 0.5/(PK.vmaxOf(p)/(p.km*V0)+p.hdcl/V0+(p.ka||0))) : PK.MM_STEP;
      const n=p.kin==="mm" && PK.hdOn(p) ? Math.max(20, Math.min(N0, Math.floor(1.5e6*stepH/Math.max(T1, 1)))) : N0, o={n, cvCL:st.pcl, cvV:st.pv, seed:st.pseed};
      DZ=5; home={az:-.7, el:.24}; topH=H*1.1;
      const nt=phone() ? 70 : 120;
      if(!ctx.pop()){ const g=++popGen; ctx.loadPop().then(()=>{ if(g===popGen && view==="pop"){ lastKey=""; rebuild(); } }).catch(()=>{}); setLabels([]); legend([["note", null, "Loading the virtual patients…"]]); return "Loading the virtual patients."; }
      const ts=linspace(T0, T1, nt), Pd=cached("pop", [T0, T1, nt].join("|"), PK.encodeScenario(p)+"|"+JSON.stringify(o)+"|"+!!PK.hdModule, ()=> popCurves(PK, ctx.pop(), p, o, ts));
      const top=Math.max(st.mtc, ...Pd.q95)*1.18 || 1, N=Pd.list.length, hep=PK.hepOn(p);
      const X=t=> -W/2+W*(t-T0)/(T1-T0), Y=c=> H*clamp(c/top, 0, 1.25), Z=r=> DZ/2-DZ*r/(N-1);
      const pos=[], cl=[], a0=col(states(K.accent).cool), a1=col(K.accent);
      Pd.list.forEach((pt,r)=>{ const z=Z(r), cc=a0.clone().lerp(a1, r/(N-1));
        for(let j=0;j<ts.length-1;j++){ pos.push(X(ts[j]), Y(pt.c[j]), z, X(ts[j+1]), Y(pt.c[j+1]), z); cl.push(cc.r,cc.g,cc.b, cc.r,cc.g,cc.b); } });
      const lg=new THREE.BufferGeometry(); lg.setAttribute("position", new THREE.Float32BufferAttribute(pos,3)); lg.setAttribute("color", new THREE.Float32BufferAttribute(cl,3));
      content.add(new THREE.LineSegments(lg, M.lines));
      // the band as glass: its top and bottom across the cloud's depth, closed at the front and back
      const top95=ts.map((t,j)=> [X(t), Y(Pd.q95[j])]), bot05=ts.map((t,j)=> [X(t), Y(Pd.q05[j])]);
      const sheet=(a, z0, z1)=> surface([a.map(([x,y])=> [x,y,z0]), a.map(([x,y])=> [x,y,z1])], [a.map(()=> col(K.accent)), a.map(()=> col(K.accent))], M.band);
      content.add(sheet(top95, -DZ/2-.2, DZ/2+.2), sheet(bot05, -DZ/2-.2, DZ/2+.2));
      content.add(segs(top95.slice(1).map(([x,y],i)=> [[top95[i][0], top95[i][1], DZ/2+.2], [x, y, DZ/2+.2]]).concat(bot05.slice(1).map(([x,y],i)=> [[bot05[i][0], bot05[i][1], DZ/2+.2], [x, y, DZ/2+.2]])), M.hairS));
      // the median, lit, through the middle of the cloud
      const S=states(K.accent), xs=ts.map(X), ys=Pd.q50.map(Y), zs=ts.map(()=> 0);
      content.add(new THREE.Mesh(ribbonGeo(xs, ys.map(y=> y+.02), zs, .8, Pd.q50.map(()=> col(K.accent))), M.lit));
      const pick=new THREE.Line(new THREE.BufferGeometry(), M.pick); pick.visible=false; pick.renderOrder=5; content.add(pick);
      hits={kind:"pop", list:Pd.list, ts, X, Y, Z, pick};
      const xt=ticksOf(T0, T1, phone() ? 5 : 7), yt=ticksOf(0, top, 5), L=[];
      gridBox(xt, yt, [], X, Y, null, -W/2, W/2, H, -DZ/2, DZ/2);
      xt.forEach(v=> L.push(lab(trim(v), [X(v), 0, DZ/2], "b")));
      yt.forEach(v=> L.push(lab(ctx.fmtAxis(v), [-W/2, Y(v), DZ/2], "l")));
      // with the liver model the patients share one clearance (population mode varies the half-life, which the liver model
      // replaces), so they are ordered by volume, and the text says so
      const mm=p.kin==="mm", by=mm ? "Vmax" : hep ? "volume" : "clearance";
      L.push(lab("Time (h)", [0, 0, DZ/2+.6], "b", "ax"), lab(`Concentration (${unit().conc})`, [-W/2, H*1.1, DZ/2], "t", "ax"),
        lab(hep ? "Smaller volume" : `Lower ${by}`, [W/2+.2, 0, DZ/2], "r"), lab(hep ? "Larger volume" : `Higher ${by}`, [W/2+.2, 0, -DZ/2], "r"));
      setLabels(L);
      legend([["line", K.text, N<N0 ? `${N} of ${N0} virtual patients` : `${N} virtual patients`], ["line", K.accent, "Median"], ["box", K.accent, "5th–95th percentile"]].concat(N<N0 ? [["note", null, `The first ${N} patients: with this dialysis setting each course takes long to work out`]] : []));
      return `${N} virtual patients (${mm ? "Vmax" : "clearance"} CV ${trim(st.pcl)}%, volume CV ${trim(st.pv)}%) as curves in depth, ordered by ${by}, the median lit and the 5th–95th percentile band as glass.`+
        (hep ? " With the liver model every patient's clearance is the model's own, so only the volume varies here." : "")+
        (N<N0 ? ` Only the first ${N} of ${N0} patients are drawn: with this dialysis setting each course takes long to work out, and the band is theirs.` : "");
    }

    // 5. the two compartments
    function buildCmt(){
      const A=ctx.axes, T0=A.T0, T1=A.T1, p=primary();
      DZ=7; home={az:-.78, el:.36}; topH=H*1.08;
      const nt=phone() ? 160 : 320, ts=linspace(T0, T1, nt), k=PK.encodeScenario(p)+"|"+T0+"|"+T1+"|"+nt+"|"+!!PK.hdModule;
      if(pdata.cmtKey!==k){ pdata.cmtKey=k; pdata.cmt=periphCourse(PK, p, linspace(0, T1, Math.max(nt, Math.ceil(T1*8)))); pdata.cmtT=linspace(0, T1, Math.max(nt, Math.ceil(T1*8))); }
      const R=pdata.cmt, all=pdata.cmtT, idx=ts.map(t=> Math.min(all.length-1, Math.round(t/T1*(all.length-1))));
      const c1=idx.map(i=> R.c1[i]), c2=idx.map(i=> R.c2[i]), top=Math.max(...c1, ...c2)*1.08 || 1;
      // both level axes run from 0 to the same top, so the line of equal levels is the box's diagonal
      const X=c=> -W/2+W*c/top, Yc=c=> H*c/top, Z=t=> DZ/2-DZ*(t-T0)/(T1-T0);
      const S=states(K.accent), into=col(K.accent), back=col(S.cool);
      const xs=c1.map(X), ys=c2.map(Yc), zs=ts.map(Z), cs=c1.map((c,i)=> c>=c2[i] ? into : back);
      content.add(new THREE.Mesh(ribbonGeo(xs, ys, zs, .6, cs), M.core));
      // the plane of equal levels: where the two would sit at equilibrium
      const e0=[-W/2, 0], e1=[W/2, H];
      content.add(surface([[[e0[0],e0[1],DZ/2],[e1[0],e1[1],DZ/2]],[[e0[0],e0[1],-DZ/2],[e1[0],e1[1],-DZ/2]]], [[col(K.text),col(K.text)],[col(K.text),col(K.text)]], M.glass));
      content.add(segs([[[e0[0],e0[1],DZ/2],[e1[0],e1[1],DZ/2]]], M.hairS));
      const xt=ticksOf(0, top, 5), zt=ticksOf(T0, T1, phone() ? 4 : 6), L=[];
      gridBox(xt, xt.filter(v=> Yc(v)<=H*1.01), zt, X, Yc, Z, -W/2, W/2, H, -DZ/2, DZ/2);
      xt.forEach(v=> L.push(lab(ctx.fmtAxis(v), [X(v), 0, DZ/2], "b")));
      xt.filter(v=> Yc(v)<=H*1.01).forEach(v=> L.push(lab(ctx.fmtAxis(v), [-W/2, Yc(v), DZ/2], "l")));
      zt.forEach(v=> L.push(lab(`${trim(v)} h`, [W/2, 0, Z(v)], "r")));
      L.push(lab(`Central level (${unit().conc})`, [0, 0, DZ/2+.6], "b", "ax"), lab(`Peripheral level (${unit().conc})`, [-W/2, H*1.08, DZ/2], "t", "ax"), lab("Time", [W/2+.3, 0, -DZ/2-1.1], "r", "ax"),
        lab("Equal levels", [e1[0], e1[1], DZ/2], "r"));
      hits={kind:"cmt", pts:ts.map((t,i)=>({t, c1:c1[i], c2:c2[i], v:new THREE.Vector3(xs[i], ys[i], zs[i])}))};
      setLabels(L);
      legend([["line", K.accent, "Central above peripheral: drug moving into the tissues"], ["line", S.cool, "Below: drug coming back out"], ["box", K.text, "Equal levels"]]);
      return `The central level against the peripheral level over ${trim(T0)}–${trim(T1)} h, time running into depth. The path's loop away from the plane of equal levels is the distribution phase.`;
    }

    function legend(items){
      legendEl.innerHTML=items.map(([k,c,t])=> k==="note" ? `<span class="n">${ctx.esc(t)}</span>` : `<span><i class="${k}" style="--k:${c}"></i>${ctx.esc(t)}</span>`).join("");
    }
    const BUILD={curve:buildCurve, dose:buildDose, regimen:buildRegimen, pop:buildPop, cmt:buildCmt};
    function rebuild(){
      if(!M) return;
      if(!available(view)) view="curve";
      // the plane's height follows the 2D chart's plotting area, so the flat pose lies exactly on it
      const g=ctx.geom; H=W*(g.PH-g.M.t-g.M.b)/(g.PW-g.M.l-g.M.r);
      clearContent(); hideChip();
      const told=BUILD[view]();
      canvas.setAttribute("aria-label", `3D view, ${VIEWS.find(v=> v[0]===view)[1]}: ${told} Arrow keys turn it, plus and minus zoom, Escape returns to the 2D chart. Every number is in the readouts and the dose schedule.`);
      syncPicker(); lastKey=keyNow(); redraw();
    }
    // everything a view reads: an app render that changes none of it redraws nothing
    function keyNow(){
      const st=ctx.state;
      return [view, regMetric, lit, phone(), cw, ch, dragKind, JSON.stringify(ctx.axes), ctx.mode, ctx.cmpEdit, ctx.plotCurves.map(c=> c.id+(c.ghost ? "g" : "")+":"+PK.encodeScenario(c.p)).join("|"),
        st.mec, st.mtc, st.mic, st.popn, st.pcl, st.pv, st.pseed, st.plo, st.phi, !!PK.hdModule, !!PK.idrModule, !!ctx.pop()].join("~");
    }

    /* ---------- hover, scrub and drag ---------- */
    let chipAt=null;
    function showChip(html, v){ chip.innerHTML=html; chip.hidden=false; chipAt=v; placeChip(); }
    function placeChip(){ toScreen(chipAt, scr); const w=chip.offsetWidth, h=chip.offsetHeight; let x=scr.x+14, y=scr.y-h-12; if(x+w>cw-6) x=scr.x-w-14; if(y<4) y=scr.y+14; chip.style.transform=`translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`; }
    function hideChip(){ chip.hidden=true; chipAt=null; }
    const near=(list, x, y, max, get)=>{ let best=null, bd=max*max; for(const q of list){ toScreen(get(q), scr); if(scr.z>1) continue; const d=(scr.x-x)**2+(scr.y-y)**2; if(d<bd){ bd=d; best=q; } } return best; };
    const stateWord=c=> c>ctx.state.mtc ? "above the MTC" : c>=ctx.state.mec ? "in the window" : "below the MEC";
    const ray=new THREE.Raycaster(), ndc=new THREE.Vector2();
    function raySurface(x, y){
      ndc.set(x/cw*2-1, -(y/ch)*2+1); ray.setFromCamera(ndc, camera);
      const m=hits && hits.surf; if(!m) return null;
      const h=ray.intersectObject(m, false)[0]; if(!h) return null;
      return world.worldToLocal(h.point.clone());
    }
    function floorPoint(x, y){
      ndc.set(x/cw*2-1, -(y/ch)*2+1); ray.setFromCamera(ndc, camera);
      const plane=new THREE.Plane(new THREE.Vector3(0,1,0), 0), out=new THREE.Vector3();
      return ray.ray.intersectPlane(plane, out) ? world.worldToLocal(out) : null;
    }
    function hover(x, y){
      if(!hits){ hideChip(); return; }
      const u=unit(), cd=ctx.cdp(2);
      canvas.classList.remove("pt", "ns");
      if(hits.kind==="curve"){
        const b=hits.beads && near(hits.beads, x, y, 14, q=> q.v);
        if(b){ canvas.classList.add("pt"); showChip(`Dose ${b.n} · ${trim(b.t)} h · <b>${trim(b.mg)} ${u.dose}</b> ${b.route==="inf" ? "infusion" : b.route==="iv" ? "IV bolus" : "oral"}<br><span>${hits.custom ? "Select it in the schedule" : "Move the time cursor to it"}</span>`, b.v); return; }
        const q=near(hits.all, x, y, 26, q=> q.v);
        if(q){ canvas.classList.add("ns"); showChip(`${q.tag ? q.tag+" · " : ""}${fmt(q.t,1)} h · <b>${fmt(q.c, cd)} ${u.conc}</b><br><span>${stateWord(q.c)}; drag along it to move the cursor</span>`, q.v); return; }
      } else if(hits.kind==="dose"){
        if(near(hits.lead, x, y, 16, q=> q.v)){ canvas.classList.add("ns"); const q=near(hits.lead, x, y, 16, q=> q.v); showChip(`<b>${trim(hits.D)} ${u.dose}</b> · ${fmt(q.t,1)} h · ${fmt(q.c, cd)} ${u.conc}<br><span>Drag along the dose axis to change the dose</span>`, q.v); return; }
        const pt=raySurface(x, y);
        // the hit gives the dose and the time; the level is the engine's for them
        if(pt){ const t=clamp(hits.T0+(pt.x+W/2)/W*(hits.T1-hits.T0), hits.T0, hits.T1), d=clamp(hits.lo+(DZ/2-pt.z)/DZ*(hits.hi-hits.lo), hits.lo, hits.hi);
          const q=PK.normalizeScenario(Object.assign({}, hits.p, {D:d})), c=PK.conc(q, t, PK.doseEvents(q));
          showChip(`${trim(+d.toPrecision(3))} ${u.dose} · ${fmt(t,1)} h · <b>${fmt(c, cd)} ${u.conc}</b><br><span>${stateWord(c)}</span>`, pt); return; }
      } else if(hits.kind==="regimen"){
        toScreen(hits.marker, scr);
        if((scr.x-x)**2+(scr.y-y)**2<18*18){ canvas.classList.add("pt"); showChip(`<b>This regimen</b><br><span>Drag it across the floor to choose another</span>`, hits.marker); return; }
        const pt=raySurface(x, y);
        // the hit gives the dose and the interval; the value is the engine's steady state for them
        if(pt){ const d=clamp(hits.lo+(pt.x+W/2)/W*(hits.hi-hits.lo), hits.lo, hits.hi), tau=clamp(2+(DZ/2-pt.z)/DZ*22, 2, 24), tg=hits.tg, name=METRICS.find(m=> m[0]===regMetric)[1];
          const v=ssMetric(PK, regimenOf(PK, hits.p, d, tau), regMetric, ctx.state.mic);
          const where=v==null || tg.lo==null ? "" : v<tg.lo ? "below the band" : v>tg.hi ? "above the band" : "in the band";
          showChip(`${trim(+d.toPrecision(3))} ${u.dose} every ${fmt(tau,1)} h<br><b>${v==null ? "No steady state: the level keeps rising" : `${name} ${fmt(v, regMetric==="auc" || regMetric==="ft" ? 0 : ctx.cdp(1))}${regMetric==="ft" ? "%" : ""}`}</b>${where ? ` · ${where}` : ""}`, pt); return; }
      } else if(hits.kind==="pop"){
        const H2=hits; let best=null, bd=10*10;
        H2.list.forEach((pt,r)=>{ const z=H2.Z(r); for(let j=0;j<H2.ts.length;j+=3){ tmp.set(H2.X(H2.ts[j]), H2.Y(pt.c[j]), z); toScreen(tmp, scr); const d=(scr.x-x)**2+(scr.y-y)**2; if(d<bd){ bd=d; best={pt, r, j}; } } });
        if(best){ const {pt, r, j}=best, z=H2.Z(r), g=new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(H2.ts.flatMap((t,i)=> [H2.X(t), H2.Y(pt.c[i]), z]), 3));
          H2.pick.geometry.dispose(); H2.pick.geometry=g; H2.pick.visible=true; redraw();
          showChip(`Patient ${pt.n} of ${H2.list.length}<br><b>${pt.CL!=null ? `CL ${fmt(pt.CL, 2)} L/h` : `Vmax ${fmt(pt.vmax, 2)} ${u.amount}/kg/day`}</b> · V ${fmt(pt.V, 1)} L`, new THREE.Vector3(H2.X(H2.ts[j]), H2.Y(pt.c[j]), z)); return; }
        if(H2.pick.visible){ H2.pick.visible=false; redraw(); }
      } else if(hits.kind==="cmt"){
        const q=near(hits.pts, x, y, 22, q=> q.v);
        if(q){ showChip(`${fmt(q.t,1)} h<br>central <b>${fmt(q.c1, cd)}</b> · peripheral <b>${fmt(q.c2, cd)}</b> ${u.conc}`, q.v); return; }
      }
      hideChip();
    }
    // the dose dragged along the surface's dose axis, measured on screen along that axis's direction
    let drag=null;
    function startDrag(kind, x, y){
      touched=true;
      if(kind==="dose"){ const a=new THREE.Vector3(0, 0, hits.Z(hits.lo)), b=new THREE.Vector3(0, 0, hits.Z(hits.hi)), sa={...toScreen(a, {x:0,y:0,z:0})}, sb={...toScreen(b, {x:0,y:0,z:0})};
        drag={kind, x, y, D:hits.D, ax:sb.x-sa.x, ay:sb.y-sa.y, steps:hits.steps, lo:hits.lo, hi:hits.hi, last:hits.D}; }
      else drag={kind, x, y, steps:hits.steps, last:null};
      dragKind=kind==="dose" ? "dose" : "reg"; canvas.classList.add("grab"); hideChip(); rebuild();
    }
    let pend=null, pendRaf=0;
    const push=o=>{ pend=o; if(!pendRaf) pendRaf=requestAnimationFrame(()=>{ pendRaf=0; const v=pend; pend=null; ctx.setKeys(v); }); };
    function moveDrag(x, y){
      if(!drag) return;
      if(drag.kind==="dose"){
        const L2=drag.ax*drag.ax+drag.ay*drag.ay||1, f=((x-drag.x)*drag.ax+(y-drag.y)*drag.ay)/L2, v=nearest(clamp(drag.D+f*(drag.hi-drag.lo), drag.lo, drag.hi), drag.steps);
        if(v!==drag.last){ drag.last=v; push({D:v}); say(`Dose ${trim(v)} ${unit().dose}`); }
      } else {
        const pt=floorPoint(x, y); if(!pt) return;
        const d=nearest(clamp(hits.lo+(pt.x+W/2)/W*(hits.hi-hits.lo), hits.lo, hits.hi), drag.steps), tau=nearest(2+(DZ/2-pt.z)/DZ*22, TAUS), k=d+"|"+tau;
        if(k!==drag.last){ drag.last=k; const o={D:d, tau}; if(primary().dosing!=="repeated") o.dosing="repeated"; push(o); say(`${trim(d)} ${unit().dose} every ${tau} h`); }
      }
    }
    function endDrag(){ drag=null; dragKind=null; canvas.classList.remove("grab"); rebuild(); }

    const ptrs=new Map();
    let mode=null, last=null, downAt=null, pinch=0;
    // every gesture stops here when 3D is turned off or the browser takes the pointer
    function endPointer(){ ptrs.forEach((_,id)=>{ try{ canvas.releasePointerCapture(id); }catch(e){} }); ptrs.clear(); mode=null; drag=null; dragKind=null; canvas.classList.remove("grab"); }
    canvas.addEventListener("contextmenu", e=> e.preventDefault());
    canvas.addEventListener("pointerdown", e=>{
      if(busy) return;   // nothing interrupts the morph in or out
      const r=canvas.getBoundingClientRect(), x=e.clientX-r.left, y=e.clientY-r.top;
      canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, {x, y}); touched=true; anim=null;
      if(ptrs.size===2){ const [a,b]=[...ptrs.values()]; pinch=Math.hypot(a.x-b.x, a.y-b.y); mode="pinch"; if(drag) endDrag(); return; }
      downAt={x, y, t:performance.now()}; last={x, y, t:performance.now()}; vel.az=vel.el=0;
      if(e.button===2 || e.shiftKey || e.button===1){ mode="pan"; return; }
      if(hits && hits.kind==="dose" && near(hits.lead, x, y, 16, q=> q.v)){ mode="drag"; startDrag("dose", x, y); return; }
      if(hits && hits.kind==="regimen"){ toScreen(hits.marker, scr); if((scr.x-x)**2+(scr.y-y)**2<20*20){ mode="drag"; startDrag("reg", x, y); return; } }
      if(hits && hits.kind==="curve" && !(hits.beads && near(hits.beads, x, y, 14, q=> q.v)) && near(hits.all, x, y, 14, q=> q.v)){ mode="scrub"; canvas.classList.add("grab"); scrub(x, y); return; }
      mode="orbit"; canvas.classList.add("grab");
    });
    function scrub(x, y){ if(!hits || !hits.all) return; const q=near(hits.all, x, y, 1e4, q=> q.v); if(q){ ctx.setCursor(q.t); syncCursor(); showChip(`${q.tag ? q.tag+" · " : ""}${fmt(q.t,1)} h · <b>${fmt(q.c, ctx.cdp(2))} ${unit().conc}</b>`, q.v); } }
    canvas.addEventListener("pointermove", e=>{
      const r=canvas.getBoundingClientRect(), x=e.clientX-r.left, y=e.clientY-r.top;
      if(!ptrs.has(e.pointerId)){ if(e.pointerType==="mouse" && !busy) hover(x, y); return; }
      ptrs.set(e.pointerId, {x, y});
      if(mode==="pinch" && ptrs.size===2){ const [a,b]=[...ptrs.values()], d=Math.hypot(a.x-b.x, a.y-b.y); if(pinch>0) zoomBy(pinch/d); pinch=d; return; }
      const dx=x-last.x, dy=y-last.y, now=performance.now(), dt=Math.max(1, now-last.t); last={x, y, t:now};
      if(mode==="drag"){ moveDrag(x, y); return; }
      if(mode==="scrub"){ scrub(x, y); return; }
      if(mode==="pan"){ const s=pose.dist*Math.tan(FOV*Math.PI/360)*2/ch, az=pose.az; pose.tx-=(dx*Math.cos(az))*s; pose.tz-=(-dx*Math.sin(az))*s; pose.ty+=dy*s; redraw(); return; }
      if(mode==="orbit"){ const kx=-dx*.0085, ky=dy*.0065; pose.az+=kx; pose.el=clamp(pose.el+ky, -.2, 1.45); if(!still()){ vel.az=kx*16/dt*.9; vel.el=ky*16/dt*.9; } redraw(); }
    });
    canvas.addEventListener("pointerup", e=>{
      if(!ptrs.has(e.pointerId)) return;
      ptrs.delete(e.pointerId); canvas.classList.remove("grab");
      const tap=downAt && Math.hypot(last.x-downAt.x, last.y-downAt.y)<(e.pointerType==="mouse" ? 4 : 8);
      if(mode==="drag") endDrag();
      if(mode==="orbit" && tap && hits && hits.kind==="curve" && hits.beads){
        const b=near(hits.beads, downAt.x, downAt.y, 14, q=> q.v); if(b){ vel.az=vel.el=0; ctx.selectDose(b.i); say(`Dose ${b.n} selected`); }
      }
      // a tap reads the point under it, as hover does for a mouse
      if(e.pointerType!=="mouse" && tap && (mode==="orbit" || mode==="scrub")) hover(downAt.x, downAt.y);
      if(mode==="orbit" && performance.now()-last.t>80){ vel.az=vel.el=0; }
      if(ptrs.size<2 && mode==="pinch") mode=null; if(!ptrs.size) mode=null;
      kick();
    });
    // the browser took the gesture (a page scroll began): it ends without selecting or flinging anything
    canvas.addEventListener("pointercancel", e=>{ ptrs.delete(e.pointerId); if(mode==="drag") endDrag(); if(!ptrs.size){ mode=null; canvas.classList.remove("grab"); } vel.az=vel.el=0; kick(); });
    canvas.addEventListener("pointerleave", e=>{ if(!ptrs.size && e.pointerType==="mouse"){ hideChip(); if(hits && hits.pick && hits.pick.visible){ hits.pick.visible=false; redraw(); } } });
    function zoomBy(f){ const d=fitDist(home.az, home.el); pose.dist=clamp(pose.dist*f, d*.35, d*2.6); touched=true; redraw(); }
    // the wheel zooms once the chart has focus (a click gives it), and always on a trackpad pinch; otherwise, and at the
    // zoom's limits, the page scrolls as usual
    canvas.addEventListener("wheel", e=>{
      if(busy || (!e.ctrlKey && document.activeElement!==canvas)) return;
      const d=fitDist(home.az, home.el), next=clamp(pose.dist*Math.exp(e.deltaY*(e.deltaMode===1 ? .05 : .0016)), d*.35, d*2.6);
      if(Math.abs(next-pose.dist)<1e-6) return;
      e.preventDefault(); anim=null; pose.dist=next; touched=true; redraw();
    }, {passive:false});
    canvas.addEventListener("dblclick", ()=>{ if(busy) return; touched=true; animate(homePose(), 700); });
    canvas.addEventListener("keydown", e=>{
      if(e.ctrlKey || e.metaKey || e.altKey) return;   // the browser's own shortcuts (page zoom, back) stay the browser's
      const k=e.key; let done=true;
      if(k==="Escape"){ e.preventDefault(); e.stopPropagation(); ctx.leave3d(); return; }   // leaves 3D only, not Present or Focus
      if(busy) return;
      touched=true;
      if(k==="ArrowLeft" || k==="ArrowRight"){ anim=null; pose.az+=(k==="ArrowLeft" ? 1 : -1)*.17; redraw(); }
      else if(k==="ArrowUp" || k==="ArrowDown"){ anim=null; pose.el=clamp(pose.el+(k==="ArrowUp" ? .1 : -.1), -.2, 1.45); redraw(); }
      else if(k==="+" || k==="=") zoomBy(.86); else if(k==="-" || k==="_") zoomBy(1/.86);
      else if(k==="Home"){ animate(homePose(), 700); }
      else done=false;
      if(done) e.preventDefault();
    });
    host.querySelector(".c3d-cams").addEventListener("click", e=>{ const b=e.target.closest("button"); if(!b || busy) return; touched=true; const [az, el]=CAMS[b.dataset.cam]; animate(Object.assign(homePose(), {az, el}), 700); });
    host.querySelector(".c3d-skip").addEventListener("click", ()=>{ const r=document.getElementById("readouts"); if(r){ if(!r.hasAttribute("tabindex")) r.tabIndex=-1; r.focus(); } });
    // the views and the regimen map's target: radio groups (arrow keys move between them)
    function radios(el, attr, pick){
      el.addEventListener("click", e=>{ const b=e.target.closest("button"); if(b && !b.disabled && !busy) pick(b.dataset[attr]); });
      el.addEventListener("keydown", e=>{ if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)) return; e.preventDefault(); if(busy) return;
        const bs=[...el.querySelectorAll("button")].filter(b=> !b.hidden && !b.disabled), i=bs.indexOf(document.activeElement), j=(i+(e.key==="ArrowLeft" || e.key==="ArrowUp" ? -1 : 1)+bs.length)%bs.length;
        pick(bs[j].dataset[attr]); bs[j].focus(); });
    }
    radios(viewsEl, "v", id=> setView(id));
    radios(metEl, "m", id=>{ regMetric=id; rebuild(); });
    // a view switch fades the canvas out, rebuilds and eases the camera in; the radio is checked at once
    function setView(id, auto){
      if(id===view || (busy && !auto)) return;
      view=id; if(!auto){ lastView=id; touched=true; } syncPicker();
      if(still()){ rebuild(); Object.assign(pose, homePose()); redraw(); return; }
      canvas.style.opacity="0"; lblLayer.style.opacity="0";
      later(()=>{ rebuild(); const h=homePose(); Object.assign(pose, h, {az:h.az+.25, dist:h.dist*1.12}); animate(homePose(), 520); canvas.style.opacity=""; lblLayer.style.opacity=""; }, 170);
    }

    /* ---------- in and out of 3D: the morph ---------- */
    // busy while the chart morphs in or out: input waits. Every timer belongs to the turn (gen) that set it, and a new
    // turn (show or hide) cancels the last one's, so quick presses can never strand the panel half-way.
    let open=false, busy=false, gen=0, timers=[], lastView="curve";
    const later=(fn, ms)=>{ const g=gen; timers.push(setTimeout(()=>{ if(g===gen) fn(); }, ms)); };
    const newTurn=()=>{ gen++; timers.forEach(clearTimeout); timers=[]; };
    function show(){
      if(open) return; newTurn(); open=true; busy=true; touched=false; endPointer(); hideChip();
      readTokens(); makeMats();
      canvas.style.opacity=""; lblLayer.style.opacity="";
      host.hidden=false; size();
      view="curve"; rebuild();
      Object.assign(pose, flatPose()); applyPose();
      renderer.render(scene, camera); placeLabels();
      // the 2D chart hands over to its 3D copy where they coincide, then the plane tilts and depth arrives
      const g=gen;
      requestAnimationFrame(()=>{ if(g!==gen) return; host.classList.add("on"); box.classList.add("is3d");
        animate(homePose(), 600, ()=>{ busy=false; idleAt=performance.now(); if(lastView!=="curve" && available(lastView)) setView(lastView, true); }); });
      say("3D view on");
    }
    function hide(done){
      if(!open){ if(done) done(); return; }
      newTurn(); open=false; busy=true; endPointer(); hideChip();
      const land=()=> animate(flatPose(), 600, ()=>{
        box.classList.remove("is3d"); host.classList.remove("on"); say("2D chart"); if(done) done();
        later(()=>{ host.hidden=true; busy=false; }, still() ? 0 : 220); });
      if(view!=="curve"){ view="curve"; canvas.style.opacity="0"; later(()=>{ rebuild(); Object.assign(pose, homePose()); canvas.style.opacity=""; land(); }, still() ? 0 : 170); }
      else land();
    }
    function update(){
      if(!open) return;
      if(ctx.paperK()!==lit){ readTokens(); makeMats(); lastKey=""; }
      if(keyNow()===lastKey){ syncCursor(); return; }
      rebuild();
    }
    new MutationObserver(()=>{ if(open && ctx.paperK()!==lit){ readTokens(); makeMats(); lastKey=""; rebuild(); } }).observe(DOC, {attributes:true, attributeFilter:["class"]});
    document.addEventListener("visibilitychange", kick);
    // where a view's targets are on screen (for automated checks of the interactions)
    host.probe=k=>{ if(!hits) return null; const at=v=>{ toScreen(v, scr); return {x:scr.x, y:scr.y}; };
      if(k==="peak" && hits.pts){ const lv=q=> q.c!=null ? q.c : q.c1, q=hits.pts.reduce((a,b)=> lv(b)>lv(a) ? b : a); return at(q.v); }
      if(k==="bead" && hits.beads && hits.beads.length) return at(hits.beads[0].v);
      if(k==="lead" && hits.lead) return at(hits.lead[Math.floor(hits.lead.length*.6)].v);
      if(k==="marker" && hits.marker) return at(hits.marker);
      if(k==="axis" && hits.kind==="dose"){ const a=at(new THREE.Vector3(0,0,hits.Z(hits.lo))), b=at(new THREE.Vector3(0,0,hits.Z(hits.hi))); return {x:b.x-a.x, y:b.y-a.y}; }
      return null; };
    return {show, hide, update, cursor:syncCursor, get open(){ return open; }, has:el=> host.contains(el)};
  }

  const CSS=`
.plot-box .c3d{position:absolute;inset:0;z-index:4;opacity:0;transition:opacity .16s cubic-bezier(.22,1,.36,1)}
.plot-box .c3d.on{opacity:1}
.plot-box.is3d #plot,.plot-box.is3d #plotFx,.plot-box.is3d #tooltip{opacity:0;pointer-events:none}
.plot-box.is3d #plot{visibility:hidden;transition:visibility 0s .16s}
.plot-box #plot{transition:opacity .16s cubic-bezier(.22,1,.36,1)}
.c3d canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y;cursor:grab;outline:none;transition:opacity .17s}
.c3d canvas.grab{cursor:grabbing}.c3d canvas.pt{cursor:pointer}.c3d canvas.ns{cursor:col-resize}
.c3d canvas:focus-visible{box-shadow:inset 0 0 0 2px var(--c-accent);border-radius:12px}
.c3d-lbl{position:absolute;inset:0;pointer-events:none;overflow:hidden;font:500 11px/1 Inter,system-ui,sans-serif;font-variant-numeric:tabular-nums;color:var(--c-muted);transition:opacity .17s}
.c3d-lbl span{position:absolute;left:0;top:0;white-space:nowrap;will-change:transform;text-shadow:0 0 6px var(--c-page),0 0 2px var(--c-page)}
.c3d-lbl .ax{color:var(--c-text-2);font-size:11.5px;letter-spacing:.01em}
.c3d-lbl .hot{color:var(--c-text);font-weight:600}
.c3d-chip{position:absolute;left:0;top:0;z-index:3;pointer-events:none;padding:7px 10px;border-radius:10px;font:500 12px/1.4 Inter,system-ui,sans-serif;font-variant-numeric:tabular-nums;color:var(--c-text);
  background:color-mix(in srgb,var(--c-surface) 72%,transparent);-webkit-backdrop-filter:blur(14px) saturate(1.3);backdrop-filter:blur(14px) saturate(1.3);border:1px solid color-mix(in srgb,var(--c-text) 18%,transparent);box-shadow:var(--shadow-2);white-space:nowrap}
.c3d-chip b{font-weight:600}.c3d-chip span{color:var(--c-muted);font-size:11px}
.c3d-top{position:absolute;left:10px;right:10px;top:6px;display:flex;justify-content:space-between;align-items:flex-start;gap:6px;flex-wrap:wrap;pointer-events:none;z-index:2}
.c3d-top>*{pointer-events:auto}.c3d-right{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.c3d-right>[hidden]{display:none}
.c3d .mini-seg{background:color-mix(in srgb,var(--c-surface) 66%,transparent);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);border-radius:999px;padding:2px;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c-text) 12%,transparent)}
.c3d .mini-seg button{min-height:28px;padding:3px 10px;font-size:12px}
.c3d .mini-seg button[hidden]{display:none}
.c3d .mini-seg button:disabled{opacity:.42;cursor:not-allowed}
.c3d-foot{position:absolute;left:10px;right:10px;bottom:6px;display:flex;justify-content:space-between;align-items:flex-end;gap:8px;pointer-events:none;z-index:2;font:500 11px/1.3 Inter,system-ui,sans-serif;color:var(--c-muted)}
.c3d-legend{display:flex;gap:5px;flex-wrap:wrap}
.c3d-legend span{display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border-radius:999px;border:1px solid color-mix(in srgb,var(--c-text) 16%,transparent);background:color-mix(in srgb,var(--c-surface) 60%,transparent);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}
.c3d-legend span.n{border-style:dashed}
.c3d-legend i{display:inline-block;width:14px;height:2px;border-radius:2px;background:var(--k)}
.c3d-legend i.box,.c3d-legend i.sheet{height:9px;width:12px;border-radius:2px;background:color-mix(in srgb,var(--k) 35%,transparent);box-shadow:inset 0 0 0 1px var(--k)}
.c3d-legend i.dot{width:8px;height:8px;border-radius:50%}
.c3d-note{margin:0;text-align:right;padding:3px 8px;border-radius:999px;background:color-mix(in srgb,var(--c-surface) 60%,transparent)}
.c3d-skip{position:absolute;left:10px;top:44px;z-index:5;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.c3d-skip:focus{width:auto;height:auto;clip:auto;padding:6px 12px;border-radius:999px;font:500 12px Inter,system-ui,sans-serif;background:var(--c-surface);color:var(--c-text);border:1px solid var(--c-line)}
@media (max-width:760px){.c3d-cams{display:none}.c3d-note{font-size:10px;white-space:nowrap;padding:2px 6px}
  .c3d-foot{flex-direction:column;align-items:flex-start;gap:3px}.c3d-legend span{padding:2px 7px;font-size:10.5px}.c3d-legend span:nth-child(n+4){display:none}
  .c3d-top{flex-wrap:wrap}.c3d-views{overflow-x:auto;scrollbar-width:none;max-width:100%}.c3d-views::-webkit-scrollbar{display:none}
  .c3d .mini-seg button{padding:3px 9px;font-size:11.5px;min-height:30px}.c3d-views .w{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
  .c3d-right{flex:0 0 auto}.c3d-met button{padding:3px 7px}}
@media (prefers-reduced-motion:reduce){.plot-box .c3d,.c3d canvas,.c3d-lbl,.plot-box #plot{transition:none}}
@media print{.plot-box .c3d{display:none}.plot-box.is3d #plot{visibility:visible;opacity:1}}
`;
  return {mount, bezier, EASE, TAUS, doseSteps, nearest, drugFor, doseGrid, regimenOf, ssMetric, regimenGrid, periphCourse, popCurves};
});
