// Run with: node --test
// The name (2.21): DoseCurve, wherever a reader sees it (2.20.0 called it MaatiRx; only its history and one README
// line say so), and its founder, stated on the site and in what search engines read.
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {execSync}=require("node:child_process");

const root=path.join(__dirname,"..");
const read=f=> fs.readFileSync(path.join(root,f),"utf8");
const PAGES=["index.html","validation.html","methods.html","educators.html","404.html"];

test("the name is DoseCurve: README, page titles, install name, wordmarks, opening screen, citation files", ()=>{
  assert.equal(read("README.md").split("\n")[0], "# DoseCurve");
  PAGES.forEach(f=> assert.match(read(f), /<title>DoseCurve[ :—]/, f));
  const site=JSON.parse(read("site.webmanifest"));
  assert.equal(site.short_name, "DoseCurve"); assert.match(site.name, /^DoseCurve /);
  const page=read("index.html");
  assert.ok((page.match(/Dose<em>Curve<\/em>/g)||[]).length>=2, "the top bar and the footer");
  assert.match(page, /<span>Dose<\/span><span>Curve<\/span>/, "the opening screen's split headline");
  assert.match(page, /<meta property="og:title" content="DoseCurve/);
  assert.match(read("CITATION.cff"), /^title: "DoseCurve: /m);
  assert.match(JSON.parse(read(".zenodo.json")).title, /^DoseCurve: /);
});

test("the 2.20 name appears in no file a reader is served, and in the README only where it says 2.20 used it", ()=>{
  const served=execSync("git ls-files", {cwd:root}).toString().split("\n")
    .filter(f=> /\.(html|js|webmanifest|json|cff|txt|xml)$/.test(f) && !f.startsWith("tests/") && fs.existsSync(path.join(root,f)));
  assert.ok(served.length>20);
  assert.deepEqual(served.filter(f=> /MaatiR[xX]/.test(read(f))), []);
  const lines=read("README.md").split("\n").filter(l=> /MaatiR[xX]/.test(l));
  assert.equal(lines.length, 1);
  assert.match(lines[0], /release 2\.20\.0 briefly called it MaatiRx/);
});

test("the founder is stated on the site and for search engines, under the name in CITATION.cff", ()=>{
  const cff=read("CITATION.cff"), name=`${cff.match(/given-names: (.+)/)[1].trim()} ${cff.match(/family-names: (.+)/)[1].trim()}`;
  assert.equal(name, "Saif Maati");
  const page=read("index.html"), foot=page.slice(page.indexOf('<footer class="foot">'), page.indexOf("</footer>"));
  // the footer's first line, with a separator in its text (a hairline on screen)
  assert.match(foot, new RegExp(`<span>Dose<em>Curve</em></span><span class="sr-only"> — </span><span class="foot-by">Founded by ${name}</span>`));
  assert.match(page, new RegExp(`<meta name="description" content="DoseCurve, founded by ${name}, is `));
  assert.match(page, new RegExp(`<meta name="author" content="${name}">`));
  // structured data: the founder, the project he founded, and the app he made
  const ld=JSON.parse(page.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]), g=ld["@graph"], byId=id=> g.find(n=> n["@id"]===id);
  const person=g.find(n=> n["@type"]==="Person"), org=g.find(n=> n["@type"]==="Organization"), app=g.find(n=> n["@type"]==="WebApplication");
  assert.equal(person.name, name); assert.match(person.jobTitle, /Founder of DoseCurve/);
  assert.equal(org.name, "DoseCurve"); assert.equal(byId(org.founder["@id"]), person);
  assert.equal(app.name, "DoseCurve"); assert.equal(app.url, "https://maatirx.com/");
  assert.equal(byId(app.author["@id"]), person); assert.equal(byId(app.creator["@id"]), person); assert.equal(byId(app.publisher["@id"]), org);
  // and the other pages
  assert.ok(read("educators.html").includes(`founded by ${name}`));
  ["methods.html","tools/methods.py"].forEach(f=> assert.ok(read(f).includes(`<p>DoseCurve was founded by ${name}.</p>`), f));
  assert.ok(read("README.md").includes(`Founded by **${name}**.`));
  // the sitemap lists the pages that carry it
  const map=read("sitemap.xml");
  ["","educators.html","methods.html","validation.html"].forEach(p=> assert.ok(map.includes(`<loc>https://maatirx.com/${p}</loc>`), p||"the app"));
});
