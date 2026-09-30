// Run with: node --test
// Release files: CI, license, citation metadata, issue templates, the README's claims, and analytics that stay
// off (and out of the offline cache) unless the site owner turns them on.
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const PK=require("../pk-engine.js");
const C=require("../cases.js");

const root=path.join(__dirname,"..");
const read=f=> fs.readFileSync(path.join(root,f),"utf8");

test("CI runs the whole suite on every push and pull request", ()=>{
  const wf=read(".github/workflows/test.yml");
  assert.match(wf, /on:\s*\n\s*push:\s*\n\s*pull_request:/);
  assert.match(wf, /node --test tests\//);
  assert.match(read("README.md"), /actions\/workflows\/test\.yml\/badge\.svg/);
});

test("license, citation and Zenodo metadata agree", ()=>{
  assert.match(read("LICENSE"), /^MIT License/);
  const cff=read("CITATION.cff"), zen=JSON.parse(read(".zenodo.json"));
  assert.match(cff, /cff-version: 1\.2\.0/); assert.match(cff, /license: MIT/);
  const v=cff.match(/^version: (.+)$/m)[1];
  assert.equal(zen.version, v); assert.equal(zen.license, "MIT"); assert.equal(zen.upload_type, "software");
  assert.equal(zen.creators[0].name, "Maati, Saif"); assert.match(cff, /family-names: Maati/);
  assert.match(read("README.md"), /\[MIT\]\(LICENSE\)/);
});

test("issue templates exist, and the app links to the feedback template", ()=>{
  ["bug_report.md","feedback.md","educator.md","config.yml"].forEach(f=> assert.ok(fs.existsSync(path.join(root,".github/ISSUE_TEMPLATE",f)), f));
  assert.match(read("index.html"), /issues\/new\?template=feedback\.md/);
});

test("the README's first line positions DoseCurve, and its numbers are the app's", ()=>{
  const md=read("README.md"), first=md.split("\n").find(l=>l.startsWith("**"));
  assert.match(first, /pharmacokinetics and PK\/PD simulator for pharmacy education/);
  assert.match(md, /IC50/);
  assert.ok(md.includes(`${PK.LESSONS.length} guided lessons`), "lessons");
  assert.ok(md.includes(`${PK.TEMPLATES.length} one-click comparisons`), "comparisons");
  assert.ok(md.includes(`${PK.PRACTICE.length} kinds of generated practice problems`), "practice kinds");
  assert.ok(md.includes(`${PK.GLOSSARY.length}-term glossary`), "glossary");
  assert.ok(md.includes(`${C.CASES.length} clinical cases`), "cases");
  assert.ok(md.includes(`${PK.DRUGS.length === 9 ? "nine" : PK.DRUGS.length} teaching profiles`), "drugs");
  const REF=require("../validation/reference-results.json");
  assert.ok(md.includes(`runs ${REF.scenarios.length} scenarios`) && md.includes(`All ${4*REF.scenarios.length} comparisons`));
  ["docs/img/saturable-lesson.png","docs/img/case-gentamicin.png","docs/img/validation.png","docs/img/clinical-crcl.png"].forEach(f=>{
    assert.ok(md.includes(f), f); assert.ok(fs.existsSync(path.join(root,f)), f);
  });
});

test("visit counting is off by default, sends only the page path, and is never cached offline", ()=>{
  const page=read("index.html");
  assert.match(page, /const ANALYTICS_SITE_ID="";/);
  assert.match(page, /count\(\{path:location\.pathname\}\)/, "only the path: never the # part with a scenario's settings");
  assert.ok(!/<script[^>]+gc\.zgo\.at/.test(page), "no counting script in the markup");
  assert.match(page, /Visit counting: <span id="anaState">off<\/span>/);
  assert.ok(!read("sw.js").includes("zgo.at") && !read("sw.js").includes("goatcounter"), "the service worker leaves it alone");
});

test("NEEDS-SAIF lists the steps that need an account", ()=>{
  const n=read("docs/NEEDS-SAIF.md");
  ["Zenodo","GoatCounter","v1.0.0","license"].forEach(w=> assert.ok(n.includes(w), w));
});
