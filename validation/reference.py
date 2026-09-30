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

def simulate(p):
    V = p["V"] * p["wt"] / 70.0
    fac, S, F, ka = factor(p), p.get("S", 1.0), p.get("F", 1.0), p.get("ka", 1.0)
    mm = p.get("kin") == "mm"
    ke = math.log(2) / p["thalf"] * fac if not mm else None
    vmax_h = p.get("vmax", 7) * p["wt"] / 24.0 * fac if mm else None
    km = p.get("km", 4.0)
    k12, k21 = (p["k12"], p["k21"]) if p.get("cmt") == 2 and not mm else (0.0, 0.0)
    ke0 = math.log(2) / p["teq"] if p.get("teq", 0) > 0 and not mm else None
    ds = doses(p)
    cuts = sorted({0.0, T_END} | {t for t, *_ in ds if t < T_END} | {t + d for t, _, r, d in ds if r == "inf" and t + d < T_END})

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
            if s0 <= t < s1 or (t == s1 == T_END):
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

def main():
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
    }
    with open(__file__.replace("reference.py", "reference-results.json"), "w") as f:
        json.dump(doc, f, indent=1)
    print(f"{len(rows)} scenarios written")

if __name__ == "__main__":
    main()
