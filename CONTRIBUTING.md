# Contributing to DoseCurve

Thank you for helping. DoseCurve is a teaching tool, so two things matter more than anything else: every number it
shows must come from its model and be checked by a test, and nothing it says may read as clinical advice.

## Run it

There is no build step. Serve the folder and open it:

```bash
python3 -m http.server 8000
```

Then visit http://localhost:8000/. (Opening `index.html` as a file works too, without the offline copy.)

## Test it

```bash
node --test tests/
```

Node 20 or later, no dependencies. CI runs the same command on every push and pull request. The validation
reference is regenerated with Python, NumPy and SciPy (`python3 validation/reference.py`) only when a model changes.

## Before you open a pull request

1. **Tests pass**, including a new test for what you changed. A lesson's quantitative claims, a practice kind's
   answer and a case's grading each have a test that recomputes them from the model.
2. **Restamp** if you changed a file the page loads on demand (`pk-*.js`, `cases.js`, `pop-worker.js`, `stage.js`,
   the validation reference): `node tools/stamp.js`.
3. **Sources.** A drug value or a clinical statement names its source (an FDA label on DailyMed, a guideline or a
   paper you have read) or says "typical value, unverified". Don't cite what you haven't read.
4. **Wording.** Plain, descriptive sentences in sentence case. Don't call a regimen safe, unsafe, best or
   recommended; practice and glossary text also avoid "patient". Every clinical surface keeps "Educational model,
   not for clinical dosing."
5. **Accessibility.** Keyboard operation, visible focus, WCAG 2.1 AA contrast in both themes, text alternatives for
   charts. Check with axe; there should be no violations.
6. **Stability.** Old share links keep opening what they opened (add a link version and a decoder test when the
   format changes); the layout doesn't shift as the page loads; the initial script stays within its budget (a test
   says so).
7. **Docs.** Add a CHANGELOG line, and a DECISIONS row for any choice someone might later question.

## Where things live

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains the files and the rules the code keeps;
[docs/DESIGN.md](docs/DESIGN.md) the design system; [docs/DECISIONS.md](docs/DECISIONS.md) why things are the way
they are; [docs/teaching-guide.md](docs/teaching-guide.md) how instructors use it.

## Feedback without code

Use the issue templates: feedback, a bug, or (for instructors) a lesson, case or worksheet you would like.
