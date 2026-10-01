"""DoseCurve validation: an independent reference implementation.

Written from the model's equations, not translated from pk-engine.js. It integrates the one- and two-compartment
models with scipy's solve_ivp (DOP853, rtol 1e-11) piecewise between doses, with an extra state that accumulates the
area under the curve, and writes validation/reference-results.json. tests/validation.test.js runs DoseCurve's
engine on the same scenarios and compares.

    python3 -m pip install numpy scipy
    python3 validation/reference.py

The model:
    gut amount   dAg/dt = -ka*Ag                         (oral doses add F*S*dose to Ag)
    body amount  dA/dt  = ka*Ag + R(t) - elimination(A)   (IV boluses add S*dose to A; infusions add R = S*dose/T)
    two compartments: A is the central amount (volume V), and a peripheral amount Ap exchanges with it,
                 dA/dt gains - k12*A + k21*Ap, and dAp/dt = k12*A - k21*Ap
    elimination  ke*A  (first-order), or Vmax*C/(Km + C) with C = A/V (Michaelis-Menten)
    effect site  dCe/dt = ke0*(C - Ce), ke0 = ln 2 / teq  (scenarios with an effect-site delay are read at the
                 effect site: its peak, trough, area and time in window)
    antimicrobial indices: a regimen run until it repeats itself (30 terminal half-lives), then its last interval
                 read for the time the unbound level fu*C is above the MIC, the peak over the MIC, and the area over
                 the interval scaled to 24 h over the MIC
    V = V70 * weight / 70
    clearance factor: simple mode, organ function % / 100; clinical mode, (1 - fe) + fe * CrCl / 120, where
    CrCl = (140 - age) * weight / (72 * SCr), * 0.85 for women (Cockcroft-Gault)
    first-order: ke = ln 2 / t_half * factor;  saturable: Vmax (per hour) = vmax_per_kg_per_day * weight / 24 * factor
"""
import json, math, datetime, sys
import numpy as np
from scipy.integrate import solve_ivp

T_END = 96.0          # every scenario is read over 0-96 h
MEC, MTC = 4.0, 12.0  # the window for time-in-window
SAMPLE = 0.0005       # h, grid for peaks and window crossings (refined further by bisection)

def crcl_cg(age, wt, scr, sex):
    return (140 - age) * wt / (72 * scr) * (0.85 if sex == "F" else 1.0)

def factor(p):
    if p.get("pm") == "clinical":
        crcl = crcl_cg(p["age"], p["wt"], p["scr"], p["sex"])
        return (1 - p["fe"]) + p["fe"] * crcl / 120.0
    return p.get("clFn", 100) / 100.0

def doses(p):
    """Every dose given: (time, amount, route, infusion hours)."""
    route, tinf = p["route"], p.get("tinf", 1.0)
    if p["dosing"] == "single":
        return [(0.0, p["D"], route, tinf)]
    if p["dosing"] == "repeated":
        out = []
        for i in range(p["nDoses"]):
            if p.get("missed", 1) > 1 and i + 1 == p["missed"]:
                continue
            mg = p["D"] * (p.get("loadMult", 1) if i == 0 else 1)
            out.append((i * p["tau"], mg, route, tinf))
        return out
    return [(e["t"], e["mg"], e.get("route", route), e.get("dur", tinf)) for e in p["events"] if e.get("status", "given") == "given"]

def simulate(p, t_end=T_END):
    V = p["V"] * p["wt"] / 70.0
    fac, S, F, ka = factor(p), p.get("S", 1.0), p.get("F", 1.0), p.get("ka", 1.0)
    mm = p.get("kin") == "mm"
    ke = math.log(2) / p["thalf"] * fac if not mm else None
    vmax_h = p.get("vmax", 7) * p["wt"] / 24.0 * fac if mm else None
    km = p.get("km", 4.0)
    k12, k21 = (p["k12"], p["k21"]) if p.get("cmt") == 2 and not mm else (0.0, 0.0)
    ke0 = math.log(2) / p["teq"] if p.get("teq", 0) > 0 and not mm else None
    ds = doses(p)
    cuts = sorted({0.0, t_end} | {t for t, *_ in ds if t < t_end} | {t + d for t, _, r, d in ds if r == "inf" and t + d < t_end})

    def rate(t):
        return sum(S * mg / d for t0, mg, r, d in ds if r == "inf" and t0 <= t < t0 + d)

    def rhs(t, y, R):
        ag, a, _, ap = y[:4]
        c = max(a, 0.0) / V
        el = vmax_h * c / (km + c) if mm else ke * a
        out = [-ka * ag, ka * ag + R - el - k12 * a + k21 * ap, c, k12 * a - k21 * ap]
        if ke0 is not None:   # the effect-site level and its area
            out += [ke0 * (c - y[4]), y[4]]
        return out

    y = np.zeros(6 if ke0 is not None else 4)
    pieces = []
    for s0, s1 in zip(cuts[:-1], cuts[1:]):
        for t0, mg, r, d in ds:
            if abs(t0 - s0) < 1e-12:
                if r == "iv":
                    y[1] += S * mg
                elif r == "oral":
                    y[0] += F * S * mg
        sol = solve_ivp(rhs, (s0, s1), y, args=(rate(s0),), method="DOP853", rtol=1e-11, atol=1e-13, dense_output=True)
        pieces.append((s0, s1, sol.sol))
        y = sol.y[:, -1].copy()
    effect = ke0 is not None
    auc = y[5] if effect else y[2]
    level = (lambda z: z[4]) if effect else (lambda z: np.maximum(z[1], 0.0) / V)

    def conc(t):
        for s0, s1, f in pieces:
            if s0 <= t < s1 or (t == s1 == t_end):
                return level(f(t))
        return level(y)

    return conc, auc, pieces, level

def metrics(p):
    conc, auc, pieces, level = simulate(p)
    grid = np.arange(0.0, T_END + SAMPLE / 2, SAMPLE)
    cs = np.empty_like(grid)
    for s0, s1, f in pieces:
        m = (grid >= s0) & (grid < s1)
        cs[m] = np.maximum(level(f(grid[m])), 0)
    cs[-1] = conc(T_END)
    # peak: the grid maximum, refined by golden-section search next to it
    i = int(np.argmax(cs))
    lo, hi = grid[max(i - 1, 0)], grid[min(i + 1, len(grid) - 1)]
    for _ in range(80):
        a, b = lo + (hi - lo) * 0.382, lo + (hi - lo) * 0.618
        if conc(a) < conc(b): lo = a
        else: hi = b
    peak = max(cs[i], conc((lo + hi) / 2))
    # time in window: crossings located by bisection between grid points
    def cross(t0, t1, level):
        c0 = conc(t0) - level
        for _ in range(60):
            tm = (t0 + t1) / 2
            if (conc(tm) - level) * c0 > 0: t0, c0 = tm, conc(tm) - level
            else: t1 = tm
        return (t0 + t1) / 2
    inside = (cs >= MEC) & (cs <= MTC)
    t_in = 0.0
    start = 0.0 if inside[0] else None
    for k in range(1, len(grid)):
        if inside[k] != inside[k - 1]:
            c0, c1 = cs[k - 1], cs[k]
            level = MEC if (min(c0, c1) < MEC <= max(c0, c1)) else MTC
            # a jump (an IV bolus) crosses at the dose time itself
            tc = grid[k] if abs(c1 - c0) > 0.5 * (MTC - MEC) else cross(grid[k - 1], grid[k], level)
            if inside[k]: start = tc
            else:
                t_in += tc - start; start = None
    if start is not None: t_in += T_END - start
    trough_t = p["nDoses"] * p["tau"] if p["dosing"] == "repeated" else T_END
    return {"peak": peak, "trough": conc(trough_t - 1e-9), "auc": auc, "tin_pct": 100 * t_in / T_END}

# ---------------- the scenario matrix ----------------
DRUGS = {
    "linear": {"kin": "linear", "thalf": 6.0, "V": 40.0, "F": 0.8, "ka": 1.0, "fe": 0.7, "S": 1.0},
    "salt":   {"kin": "linear", "thalf": 9.0, "V": 30.0, "F": 0.95, "ka": 0.6, "fe": 0.9, "S": 0.8},
    "mm":     {"kin": "mm", "thalf": 22.0, "V": 49.0, "F": 1.0, "ka": 0.4, "fe": 0.05, "S": 0.92, "vmax": 7.0, "km": 4.0},
    # two compartments: V is the central volume, the half-life is that of k10, and exchange is uneven
    "twocmt": {"kin": "linear", "cmt": 2, "k12": 0.6, "k21": 0.25, "thalf": 3.0, "V": 20.0, "F": 0.85, "ka": 1.2, "fe": 0.8, "S": 1.0},
}
DOSE = {"linear": 400.0, "salt": 450.0, "mm": 300.0, "twocmt": 250.0}
PATIENTS = {
    "normal":  {"pm": "simple", "clFn": 100, "wt": 70},
    "reduced": {"pm": "clinical", "age": 75, "sex": "F", "wt": 60, "ht": 160, "scr": 1.8, "wtm": "actual", "alb": 4},
}
def regimens(route, D):
    tau = 12
    base = {"route": route, "tinf": 1.0, "tau": tau}
    ev = [{"t": 0, "mg": D}, {"t": 7, "mg": D / 2}, {"t": 20, "mg": D}, {"t": 26, "mg": D, "status": "missed"}, {"t": 40, "mg": 1.5 * D, "dur": 2.0}, {"t": 61.5, "mg": D}]
    return {
        "single":   dict(base, dosing="single", D=D),
        "repeated": dict(base, dosing="repeated", D=D, nDoses=7),
        "loading":  dict(base, dosing="repeated", D=D, nDoses=7, loadMult=2),
        "missed":   dict(base, dosing="repeated", D=D, nDoses=7, missed=3),
        "custom":   dict(base, dosing="custom", events=ev),
    }

def matrix():
    out = []
    for dname, drug in DRUGS.items():
        for route in ["oral", "iv", "inf"]:
            for rname, reg in regimens(route, DOSE[dname]).items():
                for pname, pat in PATIENTS.items():
                    p = dict(drug); p.update(pat); p.update(reg)
                    out.append({"id": f"{dname}-{route}-{rname}-{pname}", "drug": dname, "route": route, "regimen": rname, "patient": pname, "scenario": p})
    # one mixed-route schedule: an IV bolus, an infusion and oral doses
    mixed = {"route": "oral", "dosing": "custom", "tinf": 1.0, "events": [
        {"t": 0, "mg": 300, "route": "iv"}, {"t": 6, "mg": 600, "route": "inf", "dur": 3}, {"t": 18, "mg": 400, "route": "oral"}, {"t": 30, "mg": 400, "route": "oral"}]}
    for dname in ["linear", "mm", "twocmt"]:
        for pname, pat in PATIENTS.items():
            p = dict(DRUGS[dname]); p.update(pat); p.update(mixed)
            out.append({"id": f"{dname}-mixed-custom-{pname}", "drug": dname, "route": "mixed", "regimen": "custom", "patient": pname, "scenario": p})
    # an effect-site delay, read at the effect site: first-order drugs, every route, three regimens and the mixed schedule
    for dname, teq in [("linear", 1.5), ("twocmt", 3.0)]:
        for route in ["oral", "iv", "inf"]:
            for rname in ["single", "loading", "custom"]:
                p = dict(DRUGS[dname]); p.update(PATIENTS["normal"]); p.update(regimens(route, DOSE[dname])[rname]); p["teq"] = teq
                out.append({"id": f"{dname}-{route}-{rname}-effect", "drug": dname, "route": route, "regimen": rname, "patient": "normal", "site": "effect", "scenario": p})
        p = dict(DRUGS[dname]); p.update(PATIENTS["reduced"]); p.update(mixed); p["teq"] = teq / 2
        out.append({"id": f"{dname}-mixed-custom-effect", "drug": dname, "route": "mixed", "regimen": "custom", "patient": "reduced", "site": "effect", "scenario": p})
    return out

# ---------------- antimicrobial PK/PD indices ----------------
# Steady state by brute force: enough doses for 30 terminal half-lives (checked to repeat to 1e-9), then the final
# interval sampled every tau/20000 h, each crossing of MIC/fu refined by bisection on the dense ODE solution, the peak
# by golden-section search, and the area from the solver's accumulated-area state.
def pkpd_reference(p, mic):
    fac = factor(p)
    ke = math.log(2) / p["thalf"] * fac
    if p.get("cmt") == 2:   # the slowest of the two exponentials sets how long steady state takes
        a, b = ke + p["k12"] + p["k21"], ke * p["k21"]
        ke = (a - math.sqrt(a * a - 4 * b)) / 2
    tau = p["tau"]
    n = int(math.ceil(30 * math.log(2) / ke / tau)) + 2
    q = dict(p, dosing="repeated", nDoses=n, loadMult=1, missed=1)
    t_end = n * tau
    conc, _, pieces, level = simulate(q, t_end)
    t0, t1 = (n - 1) * tau, t_end
    assert abs(conc(t0 - 1e-9) - conc(t0 - tau - 1e-9)) <= 1e-9 * max(1.0, conc(t0 - 1e-9)), "not yet at steady state"
    fu, thr = p.get("fu", 1.0), mic / p.get("fu", 1.0)
    grid = np.linspace(t0, t1, 20001)
    cs = np.array([conc(t) for t in grid[:-1]] + [conc(t1 - 1e-12)])
    def cross(a, b):
        up = conc(a) < thr
        for _ in range(80):
            m = (a + b) / 2
            if (conc(m) >= thr) == up: b = m
            else: a = m
        return (a + b) / 2
    above = 0.0
    for k in range(1, len(grid)):
        c0, c1 = cs[k - 1], cs[k]
        if c0 >= thr and c1 >= thr: above += grid[k] - grid[k - 1]
        elif c0 < thr <= c1: above += grid[k] - cross(grid[k - 1], grid[k])
        elif c1 < thr <= c0: above += cross(grid[k - 1], grid[k]) - grid[k - 1]
    i = int(np.argmax(cs))
    lo, hi = grid[max(i - 1, 0)], grid[min(i + 1, len(grid) - 1)]
    for _ in range(80):
        a, b = lo + (hi - lo) * 0.382, lo + (hi - lo) * 0.618
        if conc(a) < conc(b): lo = a
        else: hi = b
    cmax = max(cs[i], conc((lo + hi) / 2))
    def area_at(t):
        for s0, s1, f in pieces:
            if s0 <= t <= s1: return f(t)[2]
    auc24 = (area_at(t1) - area_at(t0)) * 24 / tau
    return {"ft_pct": 100 * above / tau, "cmax_mic": cmax / mic, "auc24_mic": auc24 / mic}

def pkpd_matrix():
    base = {"wt": 70, "dosing": "repeated", "loadMult": 1, "missed": 1}
    pip = dict(route="inf", D=3000, tau=6, thalf=0.84, V=15.1, fu=0.7)
    rows = [
        ("piperacillin 3 g q6h over 30 min, MIC 16", dict(pip, tinf=0.5), 16),
        ("piperacillin 3 g q6h over 3 h, MIC 16", dict(pip, tinf=3), 16),
        ("piperacillin 3 g q6h continuous (6 h), MIC 16", dict(pip, tinf=6), 16),
        ("piperacillin 3 g q8h over 4 h, MIC 16", dict(pip, tinf=4, tau=8), 16),
        ("piperacillin 2 g q6h over 30 min, CrCl 31, MIC 16", dict(pip, D=2000, tinf=0.5, wt=62, pm="clinical", age=72, sex="F", scr=1.6, fe=0.68), 16),
        ("meropenem 1 g q8h over 30 min, MIC 2", dict(route="inf", D=1000, tau=8, tinf=0.5, thalf=1, V=17, fu=0.98), 2),
        ("gentamicin 160 mg q8h over 30 min, MIC 1", dict(route="inf", D=160, tau=8, tinf=0.5, thalf=2.5, V=18, fu=0.85), 1),
        ("gentamicin 480 mg q24h over 30 min, MIC 1", dict(route="inf", D=480, tau=24, tinf=0.5, thalf=2.5, V=18, fu=0.85), 1),
        ("vancomycin 1 g q12h over 1 h, MIC 8", dict(route="inf", D=1000, tau=12, tinf=1, thalf=4.8, V=28, fu=0.45), 8),
        ("oral 500 mg q8h (F 0.9, ka 1), MIC 1", dict(route="oral", D=500, tau=8, F=0.9, ka=1.0, thalf=1, V=27, fu=0.8), 1),
        ("IV bolus 1 g q8h, MIC 4", dict(route="iv", D=1000, tau=8, thalf=2, V=20, fu=0.6), 4),
        ("two compartments, 1 g q12h over 1 h, MIC 16", dict(route="inf", D=1000, tau=12, tinf=1, thalf=3, V=14, cmt=2, k12=0.5, k21=0.3, fu=0.9), 16),
    ]
    return [{"name": n, "mic": mic, "scenario": dict(base, **sc)} for n, sc, mic in rows]

# ---------------- Bayesian (MAP) individualization ----------------
# Written from the method's statement in pk-bayes.js, not translated from it: the prior is log-normal around the
# patient model's CL and V (omega = sqrt(ln(1 + CV^2))), each level has error SD sqrt((prop*c)^2 + add^2), and the
# estimate minimises sum(((c - pred) / sd)^2) + (eta_CL / omega_CL)^2 + (eta_V / omega_V)^2, with predictions from
# the ODE solver above and scipy's Nelder-Mead (restarted until it stops moving).
from scipy.optimize import minimize

def dose_times(p):
    return [t for t, *_ in doses(p)]

def model_cl_v(p):
    V = p["V"] * p["wt"] / 70.0
    return math.log(2) / p["thalf"] * factor(p) * V, V

def level_conc(p, CL, V, times):
    q = dict(p); q["V"] = V * 70.0 / p["wt"]; q["thalf"] = math.log(2) * V / CL * factor(p)
    conc, _, _, _ = simulate(q)
    return [conc(t) for t in times]

def map_estimate(p, levels, opts):
    CL0, V0 = model_cl_v(p)
    w = lambda cv: math.sqrt(math.log(1 + (cv / 100.0) ** 2))
    wCL, wV = w(opts["cvCL"]), w(opts["cvV"])
    dt = dose_times(p)
    times = [dt[l["n"] - 1] + l["dt"] for l in levels]
    ys = [l["c"] for l in levels]
    sds = [math.sqrt((opts["prop"] * y) ** 2 + opts["add"] ** 2) for y in ys]
    def ofv(x):
        f = level_conc(p, math.exp(x[0]), math.exp(x[1]), times)
        return sum(((y - fi) / sd) ** 2 for y, fi, sd in zip(ys, f, sds)) + ((x[0] - math.log(CL0)) / wCL) ** 2 + ((x[1] - math.log(V0)) / wV) ** 2
    x = np.array([math.log(CL0), math.log(V0)])
    for _ in range(4):
        r = minimize(ofv, x, method="Nelder-Mead", options={"xatol": 1e-9, "fatol": 1e-12, "maxiter": 4000})
        if np.max(np.abs(r.x - x)) < 1e-8: x = r.x; break
        x = r.x
    return {"CL": math.exp(x[0]), "V": math.exp(x[1]), "ofv": float(ofv(x)), "priorCL": CL0, "priorV": V0}

def map_matrix():
    """20 scenarios: routes, single and repeated dosing, normal and reduced kidney function, one to three levels,
    each level drawn from a 'true' patient (the model's CL and V times the factors below) and perturbed by a fixed
    measurement error, then rounded to 0.01."""
    out = []
    base = {"linear": DRUGS["linear"], "salt": DRUGS["salt"]}
    specs = [
        # (drug, route, regimen, patient, true CL x, true V x, levels as (dose number, hours after), errors, prior CVs, MEC)
        ("linear", "iv", "single", "normal", 0.7, 1.2, [(1, 2), (1, 8)], [0.05, -0.04], (30, 20), 2.0),
        ("linear", "iv", "repeated", "normal", 1.4, 0.9, [(5, 1)], [0.03], (30, 20), 2.0),
        ("linear", "iv", "repeated", "reduced", 0.8, 1.1, [(4, 0.5), (4, 11)], [-0.05, 0.06], (30, 20), 1.0),
        ("linear", "inf", "repeated", "normal", 0.6, 1.3, [(3, 1.5), (3, 11.5)], [0.02, 0.02], (30, 20), 4.0),
        ("linear", "inf", "repeated", "reduced", 1.3, 0.8, [(6, 11.9)], [0.0], (30, 20), 4.0),
        ("linear", "oral", "single", "normal", 0.9, 1.1, [(1, 2), (1, 6), (1, 12)], [0.04, -0.03, 0.05], (30, 20), 2.0),
        ("linear", "oral", "repeated", "normal", 1.2, 1.0, [(4, 11.5)], [-0.02], (30, 20), 2.0),
        ("linear", "oral", "repeated", "reduced", 0.75, 0.85, [(5, 3), (7, 11)], [0.05, 0.05], (50, 30), 2.0),
        ("linear", "iv", "repeated", "normal", 1.0, 1.0, [(2, 6)], [0.1], (10, 10), 2.0),
        ("linear", "inf", "single", "normal", 1.6, 1.4, [(1, 1.5), (1, 5)], [0.0, -0.02], (30, 20), 2.0),
        ("salt", "iv", "single", "normal", 0.8, 0.9, [(1, 1), (1, 10)], [-0.03, 0.07], (30, 20), 1.0),
        ("salt", "oral", "repeated", "reduced", 1.1, 1.2, [(6, 2), (6, 11.5)], [0.02, -0.05], (30, 20), 1.0),
        ("salt", "inf", "repeated", "normal", 0.9, 0.7, [(3, 1.2)], [0.04], (40, 25), 3.0),
        ("salt", "iv", "repeated", "reduced", 0.65, 1.0, [(2, 0.25), (2, 11.75), (5, 6)], [0.01, -0.01, 0.02], (30, 20), 1.0),
        ("linear", "iv", "loading", "normal", 1.25, 1.15, [(1, 4), (3, 11)], [-0.04, 0.03], (30, 20), 2.0),
        ("linear", "oral", "loading", "reduced", 0.85, 0.95, [(2, 10)], [0.06], (30, 20), 2.0),
        ("linear", "inf", "missed", "normal", 1.0, 1.3, [(4, 2), (4, 11)], [0.0, 0.08], (30, 20), 3.0),
        ("linear", "iv", "missed", "reduced", 0.7, 0.8, [(2, 3), (4, 1)], [-0.06, 0.04], (30, 20), 1.0),
        ("salt", "oral", "single", "reduced", 1.3, 1.25, [(1, 4), (1, 24)], [0.03, -0.03], (30, 20), 1.0),
        ("linear", "inf", "repeated", "reduced", 0.55, 1.2, [(5, 1.1), (5, 6), (5, 11.9)], [0.02, -0.02, 0.03], (30, 20), 4.0),
    ]
    for i, (dname, route, rname, pname, fcl, fv, lv, errs, cvs, mec) in enumerate(specs):
        p = dict(base[dname]); p.update(PATIENTS[pname]); p.update(regimens(route, DOSE[dname])[rname])
        CL0, V0 = model_cl_v(p)
        dt = dose_times(p)
        true_c = level_conc(p, CL0 * fcl, V0 * fv, [dt[n - 1] + h for n, h in lv])
        levels = [{"n": n, "dt": h, "c": round(c * (1 + e), 2)} for (n, h), c, e in zip(lv, true_c, errs)]
        p["lv"] = levels
        opts = {"cvCL": cvs[0], "cvV": cvs[1], "prop": 0.10, "add": mec / 10.0, "mec": mec}
        out.append({"id": f"map-{i+1:02d}-{dname}-{route}-{rname}-{pname}", "scenario": p, "opts": opts, "truth": {"CLx": fcl, "Vx": fv}})
    return out

def main():
    pkpd = [dict(s, reference=pkpd_reference(s["scenario"], s["mic"])) for s in pkpd_matrix()]
    maps = []
    for s in map_matrix():
        m = map_estimate(s["scenario"], s["scenario"]["lv"], s["opts"])
        maps.append(dict(s, reference=m))
    rows = []
    for s in matrix():
        m = metrics(s["scenario"])
        rows.append(dict(s, reference=m, nonlinear=s["scenario"].get("kin") == "mm"))
    doc = {
        "about": "Independent reference results for DoseCurve's engine, from validation/reference.py (scipy solve_ivp, DOP853).",
        "generated": datetime.date.today().isoformat(),
        "python": sys.version.split()[0], "numpy": np.__version__, "scipy": __import__("scipy").__version__,
        "window": {"T": T_END, "mec": MEC, "mtc": MTC},
        "tolerance": {"linear": 0.005, "nonlinear": 0.01, "tin_pp_linear": 0.5, "tin_pp_nonlinear": 1.0},
        "sites": {"effect": "the effect-site level Ce, for scenarios with an effect-site delay (teq)"},
        "metrics": {"peak": "highest concentration in 0-96 h", "trough": "concentration just before the next dose would be due (repeated) or at 96 h",
                    "auc": "area under the curve 0-96 h", "tin_pct": "% of 0-96 h between MEC 4 and MTC 12"},
        "scenarios": rows,
        "map": {"about": "Bayesian (MAP) estimates of CL (L/h) and V (L) for 20 scenarios with measured levels (scipy Nelder-Mead on ODE predictions).",
                "tolerance": 0.005, "scenarios": maps},
        "pkpd": {"about": "fT>MIC (% of a steady-state interval with the unbound level above the MIC), Cmax/MIC and AUC24/MIC for 12 regimens, each run to steady state in the ODE solver.",
                 "tolerance": {"ft_pp": 0.01, "ratio": 0.0001}, "scenarios": pkpd},
    }
    with open(__file__.replace("reference.py", "reference-results.json"), "w") as f:
        json.dump(doc, f, indent=1)
    print(f"{len(rows)} scenarios, {len(maps)} MAP scenarios and {len(pkpd)} PK/PD scenarios written")

if __name__ == "__main__":
    main()
