// Restamps every file the pages load on demand with its content hash: node tools/stamp.js
// A page names each lazily loaded file as name?v=<first 10 hex of its SHA-256>, so a new release never runs with an
// older cached copy; tests/release.test.js fails until the stamps match the files.
const fs=require("fs"), path=require("path"), crypto=require("crypto");
const root=path.join(__dirname,".."), read=f=> fs.readFileSync(path.join(root,f),"utf8");
const hash=f=> crypto.createHash("sha256").update(fs.readFileSync(path.join(root,f))).digest("hex").slice(0,10);
const esc=s=> s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
function stamp(file, into){
  const h=hash(file), re=new RegExp(esc(file)+"\\?v=[0-9a-f]{10}","g");
  into.forEach(t=>{ const p=path.join(root,t), s=fs.readFileSync(p,"utf8"), n=s.replace(re, `${file}?v=${h}`); if(n!==s) fs.writeFileSync(p,n); });
  console.log(file.padEnd(36), h);
}
const PAGES=["index.html","sw.js","validation.html"];
["pk-engine.js","cases.js","pop-worker.js","pk-glossary.js","pk-math.js","pk-practice.js","pk-lessons.js","pk-bayes.js","pk-idr.js",
 "pk-sources.js","pk-hd.js","pk-sens.js","pk-tdm.js","pk-explain.js","ui-chartfx.js","ui-effect.js","ui-worksheet.js","ui-panels.js","ui-chart3d.js","validation-worker.js","validation/reference-results.json"].forEach(f=> stamp(f, PAGES));
// stage.js carries the reference data's and the dialysis module's stamps itself, so it is stamped after them
stamp("validation/reference-results.json", ["stage.js"]);
stamp("pk-hd.js", ["stage.js"]);
stamp("stage.js", PAGES);
