# Builds methods.html (Model and methods): validation.html's head, tokens and header, and every equation the
# simulator solves as MathML. Run after changing the model or validation.html: python3 tools/methods.py
# MathML helpers: each returns a MathML string.
def mi(x, normal=False): return f'<mi mathvariant="normal">{x}</mi>' if normal else f'<mi>{x}</mi>'
def mn(x): return f'<mn>{x}</mn>'
def mo(x, **a):
    attrs="".join(f' {k}="{v}"' for k,v in a.items())
    return f'<mo{attrs}>{x}</mo>'
def row(*xs): return "<mrow>"+"".join(xs)+"</mrow>"
def frac(a,b): return f"<mfrac>{a}{b}</mfrac>"
def sup(a,b): return f"<msup>{a}{b}</msup>"
def sub(a,b): return f"<msub>{a}{b}</msub>"
def subsup(a,b,c): return f"<msubsup>{a}{b}{c}</msubsup>"
def sqrt(a): return f"<msqrt>{a}</msqrt>"
def paren(*xs): return row(mo("("), *xs, mo(")"))
def brack(*xs): return row(mo("["), *xs, mo("]"))
def txt(s): return f"<mtext>{s}</mtext>"
def sp(): return '<mspace width="0.5em"/>'
times=mo("×"); minus=mo("−"); plus=mo("+"); eq=mo("="); cdot=mo("·")
def e(power): return sup(mi("e",True), row(*power) if isinstance(power,(list,tuple)) else power)
def k(s): return sub(mi("k"), mi(s,True) if len(s)>1 else mi(s))
def math(*xs, label=None):
    lab=f' aria-label="{label}"' if label else ""
    return f'<math display="block"{lab}>'+row(*xs)+"</math>"

import re, os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
V=open("validation.html").read()
style=V[V.index("<style>")+7:V.index("</style>")]
# keep the shared part of validation's styles (tokens, type, bar, main, headings, notes, pre); drop the sphere and tables
keep=[]
for line in style.split("\n"):
    if any(s in line for s in [".vhero",".vword",".vsphere",".vcap","html.v3d",".summary",".big{",".scroll{","thead th","table{","th,td","td{",".ok{"]): continue
    keep.append(line)
style="\n".join(keep)+'''
  .lede{font-size:17px;line-height:1.6;color:var(--c-text-2);max-width:46em}
  nav.toc{display:flex;flex-wrap:wrap;gap:6px 18px;margin:18px 0 8px;font-size:14px}
  nav.toc a{color:var(--c-muted)} nav.toc a:hover{color:var(--c-text)}
  .eqn{margin:10px 0 4px;padding:12px 16px;background:var(--c-surface);border:1px solid var(--c-line);border-radius:8px;overflow-x:auto;color:var(--c-text)}
  .eqn math{font-size:17px}
  .eqn + p.where{margin-top:4px;font-size:14px;color:var(--c-muted)}
  p,li{max-width:46em}
  .disc{border-left:2px solid var(--c-line-strong);padding:2px 0 2px 14px;color:var(--c-text)}
  .bar nav{display:flex;gap:18px;font-size:14px;font-weight:500} .bar nav a{color:var(--c-muted);text-decoration:none} .bar nav a:hover{color:var(--c-text)}
  @media (max-width:600px){ .bar nav a:first-child{display:none} .eqn math{font-size:15px} }
'''
head=V[:V.index("<style>")]
head=head.replace("<title>DoseCurve validation</title>","<title>DoseCurve model and methods</title>")
head=re.sub(r'<meta name="description" content="[^"]*">','<meta name="description" content="DoseCurve\'s model and methods: every equation the simulator solves, how routes and schedules are modelled, what the tests cover, the disclaimer, and the privacy, effects and visit-counting statements.">',head)
head=re.sub(r'\s*<script type="importmap">.*?</script>','',head, flags=re.S)
# the 3D-related comment and fx-off test are harmless; keep the theme script as is
brand=V[V.index('<header class="bar">'):V.index('</header>')+9]
brand=brand.replace('<a href="methods.html">Model and methods</a>','<a href="validation.html">Validation</a>')
assert 'href="validation.html"' in brand

def eqn(m, where=None):
    return f'<div class="eqn">{m}</div>'+(f'<p class="where">{where}</p>' if where else "")
C=mi("C"); t=mi("t"); D=mi("D"); V_=mi("V"); F=mi("F"); S=mi("S"); A=mi("A"); B=mi("B")
ka=k("a"); ke=k("e"); k10=k("10"); k12=k("12"); k21=k("21")
Ct=row(C, paren(t))
ln2=row(mi("ln",True), mn("2"))
body=[]
B_=body.append
B_('<main>')
B_('<h1>Model and methods</h1>')
B_('<p class="note">Educational model, not for clinical dosing. This page states the model DoseCurve solves. Its <a href="validation.html">validation</a> checks that the model is solved correctly; it does not show that the model predicts real patients.</p>')
B_('<nav class="toc" aria-label="On this page"><a href="#one">One compartment</a><a href="#routes">Routes and schedules</a><a href="#two">Two compartments</a><a href="#mm">Saturable elimination</a><a href="#effect">Effect</a><a href="#patient">Patients</a><a href="#organs">Liver and dialysis</a><a href="#variability">Variability and levels</a><a href="#abx">Antimicrobial indices</a><a href="#tests">Tests</a><a href="#disclaimer">Disclaimer</a><a href="#privacy">Privacy</a><a href="#cite">Citing</a></nav>')

B_('<h2 id="one">One compartment, first-order</h2>')
B_('<p>The drug spreads through one volume <i>V</i> and is eliminated in proportion to its concentration, with rate constant <i>k</i><sub>e</sub>. For a single dose <i>D</i> (times the salt factor <i>S</i>, the fraction of the dose that is active drug):</p>')
B_(eqn(math(ke, eq, frac(ln2, sub(mi("t"), mn("½"))), sp(), sp(), mi("CL"), eq, ke, cdot, V_, sp(), sp(), V_, eq, sub(V_, mn("70")), cdot, frac(mi("WT"), mn("70")), label="k e equals ln 2 over t half; CL equals k e times V; V equals V 70 times weight over 70"),
   "The volume scales with body weight; the half-life is the drug's (or, for a patient, the one their clearance gives)."))
B_(eqn(math(row(sub(C, txt("IV bolus")), paren(t)), eq, frac(row(S, cdot, D), V_), cdot, e([minus, ke, t]), label="IV bolus: C of t equals S D over V times e to the minus k e t")))
B_(eqn(math(row(sub(C, txt("oral")), paren(t)), eq, frac(row(F, cdot, S, cdot, D, cdot, ka), row(V_, paren(ka, minus, ke))), cdot, paren(e([minus, ke, t]), minus, e([minus, ka, t])), label="Oral: C of t equals F S D k a over V times k a minus k e, times e to the minus k e t minus e to the minus k a t"),
   "<i>F</i> is the bioavailability and <i>k</i><sub>a</sub> the first-order absorption rate constant (when <i>k</i><sub>a</sub> = <i>k</i><sub>e</sub> the exact limit, <i>k</i><sub>a</sub>·<i>t</i>·e<sup>−<i>k</i><sub>a</sub><i>t</i></sup>, is used)."))
R0=sub(mi("R"), mn("0")); Ti=sub(mi("T"), txt("inf"))
B_(eqn(math(row(sub(C, txt("infusion")), paren(t)), eq, frac(R0, row(ke, V_)), cdot, paren(mn("1"), minus, e([minus, ke, t])), sp(), txt("for t ≤ "), Ti, txt(",  then first-order decay;  "), R0, eq, frac(row(S, cdot, D), Ti), label="Infusion: C of t equals R 0 over k e V times 1 minus e to the minus k e t during the infusion, then first-order decay; R 0 equals S D over T inf")))
B_('<p>Every regimen is the sum of its doses (superposition): each dose contributes its own single-dose curve from the moment it is given, by its own route, amount and duration.</p>')
B_(eqn(math(Ct, eq, row("<munder>"+mo("∑")+mi("i")+"</munder>", sub(C, mn("1")), paren(t, minus, sub(t, mi("i")), mo(";"), sub(D, mi("i")), mo(","), sub(txt("route"), mi("i")))), sp(), sp(), sub(mi("R"), txt("ac")), eq, frac(mn("1"), row(mn("1"), minus, e([minus, ke, mi("τ")]))), label="C of t is the sum over doses of each dose's single-dose curve; the accumulation ratio is 1 over 1 minus e to the minus k e tau"),
   "At steady state a regular regimen's levels are the infinite sum of earlier doses, summed exactly as geometric series; <i>R</i><sub>ac</sub> is the accumulation ratio for an interval <i>τ</i>."))

B_('<h2 id="routes">How routes and schedules are modelled</h2>')
B_('<ul><li><b>Oral:</b> first-order absorption from the gut at <i>k</i><sub>a</sub>, with bioavailability <i>F</i>.</li><li><b>IV bolus:</b> the whole dose enters the plasma at once.</li><li><b>IV infusion:</b> a constant rate <i>R</i><sub>0</sub> for its duration (zero-order input), then first-order decay.</li><li><b>Regimens:</b> a single dose; a regular regimen of <i>n</i> doses every <i>τ</i> hours, with an optional loading dose (1.5× or 2× the first dose) and an optional missed dose (left out of the sum); or a custom schedule in which every dose has its own time, amount and route.</li><li><b>Units:</b> mg, mcg or mEq, with the concentration unit to match; a salt factor <i>S</i> scales a dose given as a salt.</li></ul>')

B_('<h2 id="two">Two compartments</h2>')
al=mi("α"); be=mi("β")
B_('<p>The dose enters a central volume <i>V</i> that exchanges with a peripheral one at <i>k</i><sub>12</sub> and <i>k</i><sub>21</sub>; elimination, <i>k</i><sub>10</sub> = <i>k</i><sub>e</sub>, is from the centre, so clearance is still <i>k</i><sub>10</sub>·<i>V</i>. After an IV bolus:</p>')
B_(eqn(math(Ct, eq, A, cdot, e([minus, al, t]), plus, B, cdot, e([minus, be, t]), label="C of t equals A e to the minus alpha t plus B e to the minus beta t"), "where α and β are the roots of"))
B_(eqn(math(sup(mi("s"), mn("2")), minus, paren(k10, plus, k12, plus, k21), mi("s"), plus, k10, k21, eq, mn("0"), label="s squared minus k10 plus k12 plus k21 times s plus k10 k21 equals 0")))
B_(eqn(math(A, eq, frac(row(S, D, paren(al, minus, k21)), row(paren(al, minus, be), V_)), mo(","), sp(), B, eq, frac(row(S, D, paren(k21, minus, be)), row(paren(al, minus, be), V_)), label="A equals S D times alpha minus k21 over alpha minus beta times V; B equals S D times k21 minus beta over alpha minus beta times V"),
   "Oral doses and infusions follow from the same two exponentials. The terminal half-life is ln 2 / β."))

B_('<h2 id="mm">Saturable (Michaelis–Menten) elimination</h2>')
Am=mi("A"); Vm=sub(mi("V"), txt("max")); Km=sub(mi("K"), mi("m",True))
B_(eqn(math(frac(row(mi("d"), Am), row(mi("d"), t)), eq, row(ka, sub(Am, txt("gut"))), plus, mi("R"), paren(t), minus, frac(row(Vm, cdot, C), row(Km, plus, C)), mo(","), sp(), C, eq, frac(Am, V_), label="d A over d t equals k a A gut plus R of t minus V max C over K m plus C, with C equals A over V"),
   "Superposition no longer holds, so the amount is integrated by the classical Runge–Kutta method on 0.05 h steps that meet every dose and infusion end. The predicted steady state is <i>C</i><sub>ss</sub> = <i>K</i><sub>m</sub>·<i>R</i> / (<i>V</i><sub>max</sub> − <i>R</i>) for an average input rate <i>R</i> below <i>V</i><sub>max</sub>."))

B_('<h2 id="effect">Effect</h2>')
E=mi("E"); E0=sub(E, mn("0")); Emax=sub(E, txt("max")); n=mi("n"); EC50=sub(mi("EC",True), mn("50")); EC50n=subsup(mi("EC",True), mn("50"), n); Ce=sub(C, mi("e",True)); ke0=sub(mi("k"), txt("e0"))
B_(eqn(math(E, eq, E0, plus, frac(row(Emax, cdot, sup(C, n)), row(EC50n, plus, sup(C, n))), label="E equals E 0 plus E max C to the n over EC50 to the n plus C to the n"),
   "The sigmoid Emax model, driven by the plasma level or, with an effect-site delay, by the effect-site level:"))
B_(eqn(math(frac(row(mi("d"), Ce), row(mi("d"), t)), eq, ke0, paren(C, minus, Ce), mo(","), sp(), ke0, eq, frac(ln2, sub(mi("t"), txt("½,eq"))), label="d C e over d t equals k e0 times C minus C e; k e0 equals ln 2 over the equilibration half-life"),
   "solved in closed form for every route. Indirect responses (Dayneka, Garg and Jusko 1993) change how fast a response <i>R</i> is made (<i>k</i><sub>in</sub>) or lost (<i>k</i><sub>out</sub>):"))
fC=row(mi("f"), paren(C)); kin=sub(mi("k"), txt("in")); kout=sub(mi("k"), txt("out")); Imax=sub(mi("I"), txt("max")); Smax=sub(mi("S"), txt("max")); R=mi("R")
dR=frac(row(mi("d"), R), row(mi("d"), t))
B_(eqn('<math display="block" aria-label="The four indirect response types"><mtable columnalign="left">'+
  "".join(f"<mtr><mtd>{row(*cells)}</mtd></mtr>" for cells in [
    [txt("Type 1:"), sp(), dR, eq, kin, paren(mn("1"), minus, Imax, fC), minus, kout, R],
    [txt("Type 2:"), sp(), dR, eq, kin, minus, kout, paren(mn("1"), minus, Imax, fC), R],
    [txt("Type 3:"), sp(), dR, eq, kin, paren(mn("1"), plus, Smax, fC), minus, kout, R],
    [txt("Type 4:"), sp(), dR, eq, kin, minus, kout, paren(mn("1"), plus, Smax, fC), R],
    [fC, eq, frac(sup(C, n), row(EC50n, plus, sup(C, n))), mo(","), sp(), kout, eq, frac(ln2, sub(mi("t"), txt("½,out")))]])+'</mtable></math>',
  "<i>R</i> is shown as a percentage of its baseline <i>k</i><sub>in</sub>/<i>k</i><sub>out</sub> and integrated by the Runge–Kutta method on steps that meet every dose."))

B_('<h2 id="patient">Patients</h2>')
B_('<p><b>Simple:</b> an organ-function setting scales clearance. <b>Clinical:</b> creatinine clearance by Cockcroft and Gault (1976), with actual, ideal (Devine) or adjusted body weight, and the drug\'s renal fraction <i>f</i><sub>e</sub> scaled by it against a reference of 120 mL/min:</p>')
fe=sub(mi("f"), mi("e",True)); WT=mi("WT"); CrCl=mi("CrCl")
B_(eqn(math(CrCl, eq, frac(row(paren(mn("140"), minus, mi("age")), times, WT), row(mn("72"), times, mi("SCr"))), sp(), txt("(× 0.85 for women)"), label="CrCl equals 140 minus age times weight over 72 times serum creatinine, times 0.85 for women")))
B_(eqn(math(mi("IBW"), eq, mn("50"), txt(" (45.5) "), plus, mn("2.3"), paren(sub(mi("ht"), txt("in")), minus, mn("60")), mo(","), sp(), mi("AdjBW"), eq, mi("IBW"), plus, mn("0.4"), paren(WT, minus, mi("IBW")), label="IBW equals 50 or 45.5 plus 2.3 times height in inches minus 60; AdjBW equals IBW plus 0.4 times weight minus IBW")))
B_(eqn(math(mi("CL"), eq, sub(mi("CL"), txt("ref")), cdot, brack(paren(mn("1"), minus, fe), plus, fe, cdot, frac(CrCl, mn("120"))), label="CL equals CL ref times 1 minus fe plus fe times CrCl over 120")))
MF=mi("MF"); PMA=mi("PMA")
B_('<p><b>Child:</b> renal function from very premature neonates to adults (Rhodin et al., <i>Pediatr Nephrol</i> 2009;24:67–76): glomerular filtration standardized to 70 kg with a ¾-power size model and a sigmoid maturation with postmenstrual age (gestational age at birth plus postnatal age), half the adult value at 47.7 weeks with a Hill coefficient of 3.40.</p>')
B_(eqn(math(mi("GFR"), eq, mn("121.2"), cdot, sup(paren(frac(WT, mn("70"))), mn("0.75")), cdot, MF, mo(","), sp(), MF, eq, frac(sup(PMA, mn("3.4")), row(sup(mn("47.7"), mn("3.4")), plus, sup(PMA, mn("3.4")))), label="GFR equals 121.2 times weight over 70 to the 0.75 times MF; MF equals PMA to the 3.4 over 47.7 to the 3.4 plus PMA to the 3.4")))
B_(eqn(math(mi("CL"), eq, sub(mi("CL"), txt("70 kg adult")), cdot, sup(paren(frac(WT, mn("70"))), mn("0.75")), cdot, brack(paren(mn("1"), minus, fe), plus, fe, cdot, MF), label="CL equals the 70 kg adult clearance times weight over 70 to the 0.75 times 1 minus fe plus fe times MF"),
   "The non-renal part is scaled by size alone: how it matures depends on the enzymes that clear the drug, which this model doesn't include. The volume scales with weight. Phenytoin levels can be read with the Sheiner–Tozer albumin adjustment, <i>C</i><sub>adj</sub> = <i>C</i> / (0.2·albumin + 0.1)."))

B_('<h2 id="organs">Liver and dialysis</h2>')
fu=sub(mi("f"), mi("u",True)); CLint=sub(mi("CL"), txt("int")); Q=mi("Q"); Eh=mi("E")
B_(eqn(math(Eh, eq, frac(row(fu, cdot, CLint), row(Q, plus, fu, cdot, CLint)), mo(","), sp(), sub(mi("CL"), mi("H",True)), eq, Q, cdot, Eh, mo(","), sp(), F, eq, sub(mi("f"), txt("abs")), cdot, paren(mn("1"), minus, Eh), label="Well-stirred liver: E equals fu CLint over Q plus fu CLint; CL H equals Q E; F equals f abs times 1 minus E"),
   "The well-stirred liver model: hepatic blood flow <i>Q</i>, the unbound fraction in blood and the intrinsic clearance give the extraction ratio, hepatic clearance and the first pass."))
CLd=sub(mi("CL"), mi("d",True))
B_(eqn(math(row(mi("k"), txt(" (in a session)")), eq, ke, plus, frac(CLd, V_), label="During a dialysis session k equals k e plus CL d over V"),
   "Hemodialysis adds the dialyzer's clearance while each session runs. Between events (a dose, an infusion's end, a session's start or end) the rates are constant, so the amounts are carried exactly from one event to the next; with two compartments, through the system's two eigenvalues, and the level rebounds after each session as drug returns from the tissues."))

B_('<h2 id="variability">Variability and measured levels</h2>')
eta=sub(mi("η"), txt("CL")); etaV=sub(mi("η"), mi("V")); om=mi("ω")
B_(eqn(math(sub(mi("CL"), mi("i")), eq, mi("CL"), cdot, e(eta), mo(","), sp(), sub(V_, mi("i")), eq, V_, cdot, e(etaV), mo(","), sp(), mi("η"), mo("∼"), mi("N",True), paren(mn("0"), mo(","), sup(om, mn("2"))), mo(","), sp(), sup(om, mn("2")), eq, row(mi("ln",True), paren(mn("1"), plus, sup(mi("CV"), mn("2")))), label="Population: CL i equals CL e to the eta CL; V i equals V e to the eta V; eta normal with variance omega squared equals ln of 1 plus CV squared"),
   "Population mode draws virtual patients this way (the scenario's values are the medians), reproducibly from a seed. The CVs are teaching assumptions."))
yj=sub(mi("y"), mi("j")); yh=sub(mi("ŷ"), mi("j")); sj=sub(mi("σ"), mi("j"))
B_(eqn(math(row(txt("minimize  "), "<munder>"+mo("∑")+mi("j")+"</munder>", sup(paren(frac(row(yj, minus, yh), sj)), mn("2")), plus, sup(paren(frac(eta, sub(om, txt("CL")))), mn("2")), plus, sup(paren(frac(etaV, sub(om, mi("V")))), mn("2"))), label="Bayesian MAP: minimize the sum of squared standardized residuals plus the squared standardized deviations of eta CL and eta V"),
   "Individualizing from levels: the maximum a posteriori estimate (the approach of Sheiner et al. 1979) weighs each measured level against the patient model's prediction, each by its error σ<sub><i>j</i></sub> = √((0.1·<i>y</i><sub><i>j</i></sub>)² + <i>a</i>²), with a proportional 10% and an additive part <i>a</i> of a tenth of the MEC."))

B_('<h2 id="abx">Antimicrobial indices</h2>')
B_('<p>fT&gt;MIC is the share of time the unbound level, <i>f</i><sub>u</sub>·<i>C</i>, stays above the MIC, with <i>f</i><sub>u</sub> taken as constant; Cmax/MIC and AUC<sub>24</sub>/MIC use the total level. A regular regimen is read at steady state over one interval, with AUC<sub>24</sub> = AUC<sub>τ</sub> × 24/τ.</p>')

B_('<h2 id="tests">What the tests cover</h2>')
B_('<p>An automated suite (<code>node --test tests/</code>) runs on every push. It covers closed-form results (the equations above and their limits), the clinical, child and saturable models, two compartments, the effect site and indirect responses, the liver model, dialysis (with exact mass balance), population mode, the Bayesian estimate, regimen edge cases (loading and missed doses, custom schedules), the share-link format across every version, every quantitative claim each lesson makes, every practice answer against a simulation of its own scenario, every case and its grading, the page\'s accessibility commitments, its script budget and the offline cache. It is also compared with an independent solver on 146 scenarios, and on its Bayesian estimates, antimicrobial indices, indirect responses and dialysis sessions: see <a href="validation.html">Validation</a>, which reruns that comparison in your browser.</p>')

B_('<h2 id="disclaimer">Disclaimer</h2>')
B_('<p class="disc"><b>Educational simulation.</b> DoseCurve models idealized one- or two-compartment pharmacokinetics (first-order, or saturable in one compartment) and a sigmoid Emax concentration–effect relationship for learning and demonstration. Drug library values name their source (an FDA label or a paper) or are marked unverified; they are not prescribing information. Its validation checks that it solves its own model correctly, not that the model predicts real patients: it is not clinical software and must not be used to make dosing decisions for real patients.</p>')

B_('<h2 id="privacy">Privacy, effects and visit counting</h2>')
B_('<p><b>Privacy.</b> DoseCurve runs in your browser, and after one visit it also opens offline. Your progress and saved scenarios stay in this browser. Shared links encode scenario settings in the URL; a case or assignment an instructor writes travels in its link the same way. Assignment progress and completion codes are made in this browser with the class key, which never leaves it. Do not enter patient-identifying information, or a student\'s name as an identifier.</p>')
B_('<p><b>Effects.</b> The fonts come from this site. With Effects on, the 3D stage loads Three.js, a pinned and hash-checked copy, from cdnjs.cloudflare.com; that request is the only one to another site, and it carries nothing you enter. Turn Effects off in the top bar and it is never made.</p>')
B_('<p><b>Visit counting: <span id="anaState">off</span>.</b> When the site owner turns it on, DoseCurve counts page visits with GoatCounter, which works without cookies and doesn\'t store IP addresses. It sends only the page\'s path; GoatCounter keeps aggregate numbers of visits, referring sites, browsers, screen sizes and countries. It never receives the part of a link after #, where a scenario\'s settings live, or anything you enter.</p>')

B_('<h2 id="cite">Citing DoseCurve</h2>')
B_('<p>Zenodo archives every release. <a href="https://doi.org/10.5281/zenodo.23082408">doi:10.5281/zenodo.23082408</a> always resolves to the newest version; each release also has its own DOI, listed there. The source, MIT-licensed, is <a href="https://github.com/Saifmaati/dose-curve">on GitHub</a>.</p>')
B_('</main>')
# visit counting: the same switch as the app's (docs/NEEDS-SAIF.md, step 4)
B_('<script>\n  // visit counting: the same switch as the app\'s (docs/NEEDS-SAIF.md, step 4); off unless the site owner sets an id\n  const ANALYTICS_SITE_ID="";\n  if(ANALYTICS_SITE_ID) document.getElementById("anaState").textContent="on";\n</script>')
html=head+"<style>"+style+"</style>\n</head>\n<body>\n"+brand+"\n"+"\n".join(body)+"\n</body>\n</html>\n"
open("methods.html","w").write(html)
print(len(html), "bytes")
