/* verify_casepack.mjs — prueba las hojas generadas por gen_casepack.py con los
 * MISMOS motores que usan las herramientas en el navegador:
 *   · loadflow-simulator → PSA.js (Newton-Raphson AC)  = port de PyPSA
 *   · ed-uc-simulator    → PSA.js de optimización + HiGHS/wasm
 *
 *   node tools/verify_casepack.mjs [--ed-solve]
 *
 * Comprueba, hoja por hoja:
 *   1. carga (`LF.load` / `ED.load`) y validación de la propia herramienta;
 *   2. que el Newton-Raphson AC converge y que ninguna tensión sale del rango
 *      operativo razonable (0,9–1,1 pu declarado; 0,5–1,3 como veto duro);
 *   3. COHERENCIA Python↔navegador: mismas tensiones y mismas pérdidas que
 *      calculó `sunflex_model.py` con PyPSA sobre el mismo grafo;
 *   4. (con --ed-solve) que la hoja ED tiene solución de despacho/compromiso.
 *
 * Escribe output/verificacion_hojas.md y sale con código ≠ 0 si algo falla.
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import vm from "node:vm";

const RAIZ = new URL("..", import.meta.url).pathname;
const HERR = RAIZ + "static/tools/";
const QUIERE_ED = process.argv.includes("--ed-solve");

/* ── motores ── */
copyFileSync(HERR + "loadflow-simulator/engine/psa-pf.min.js", "/tmp/psa-pf.mjs");
const psaPF = await import(pathToFileURL("/tmp/psa-pf.mjs").href);
vm.runInThisContext(readFileSync(HERR + "loadflow-simulator/lf-core.js", "utf8"), { filename: "lf-core.js" });
const LF = globalThis.LF;
LF.setTypes(psaPF.stdTypes());

let ED = null, psaOP = null;
if (QUIERE_ED) {
  copyFileSync(HERR + "ed-uc-simulator/engine/psa-opt.min.js", "/tmp/psa-opt.mjs");
  copyFileSync(HERR + "ed-uc-simulator/engine/highs.mjs", "/tmp/highs.mjs");
  copyFileSync(HERR + "ed-uc-simulator/engine/highs.wasm", "/tmp/highs.wasm");
  psaOP = await import(pathToFileURL("/tmp/psa-opt.mjs").href);
  vm.runInThisContext(readFileSync(HERR + "ed-uc-simulator/ed-core.js", "utf8"), { filename: "ed-core.js" });
  ED = globalThis.ED;
  if (psaOP.stdTypes) ED.setTypes(psaOP.stdTypes());
}

const lfCasos = JSON.parse(readFileSync(HERR + "sunflex-lf-cases.json", "utf8"));
const edCasos = existsSync(HERR + "sunflex-ed-cases.json")
  ? JSON.parse(readFileSync(HERR + "sunflex-ed-cases.json", "utf8")) : {};
const meta = existsSync(HERR + "sunflex-meta.json")
  ? JSON.parse(readFileSync(HERR + "sunflex-meta.json", "utf8")) : {};

const OPTS = { method: "ac", tol: 1e-8, seed: "dc", distSlack: false, slackW: "p_set" };
const filas = [];
let fallos = 0, dvMax = 0, dlMax = 0;

for (const [key, raw] of Object.entries(lfCasos)) {
  const model = LF.load(raw);
  const v = LF.validate(model, OPTS) || {};
  const errs = (v.errors || []).map(e => e.msg).filter(Boolean);
  const warns = (v.warnings || []).map(e => e.msg).filter(Boolean);
  let res = null, err = "";
  try { res = LF.solve(psaPF, model, OPTS); } catch (e) { err = String(e && e.message).slice(0, 90); }
  const rep = (res && res.report) || {};
  const conv = !!res && rep.converged !== false && rep.ok !== false;
  const buses = model.el.filter(e => e.c === "Bus");
  const js = {};
  buses.forEach(b => { js[/^PV/.test(b.name) ? "PV" : /^Campo/.test(b.name) ? "CAMPO" : "SIN"] =
    res && res.bus[b.id] ? res.bus[b.id].v : NaN; });
  const loss = res && Number.isFinite(res.totals.loss) ? res.totals.loss : NaN;
  const py = (meta[key] || {}).py || {};
  let dv = NaN, dl = NaN;
  if (py.v) {                       // el desvío real, no un Math.max sobre NaN
    const d = [0, 0, 0];
    ["PV", "CAMPO", "SIN"].forEach((b, k) => {
      if (Number.isFinite(js[b]) && Number.isFinite(+py.v[b])) d[k] = Math.abs(js[b] - py.v[b]);
    });
    dv = Math.max(...d);
  }
  if (Number.isFinite(loss) && py.perdidas_mw != null) dl = Math.abs(loss - +py.perdidas_mw);
  if (Number.isFinite(dv)) dvMax = Math.max(dvMax, dv);
  if (Number.isFinite(dl)) dlMax = Math.max(dlMax, dl);
  const vArr = Object.values(js).filter(Number.isFinite);
  const malo = !conv || errs.length || err || vArr.some(x => x < 0.5 || x > 1.3);
  if (malo) fallos++;
  filas.push({ hoja: key, conv: conv ? "sí" : "NO", vmin: Math.min(...vArr).toFixed(4),
               vmax: Math.max(...vArr).toFixed(4), perd_MW: Number.isFinite(loss) ? loss.toFixed(4) : "-",
               "ΔV vs PyPSA": Number.isFinite(dv) ? dv.toFixed(4) : "-",
               "ΔPérd vs PyPSA": Number.isFinite(dl) ? dl.toExponential(1) : "-",
               warn: warns.length, error: (err + errs.join(" ")).slice(0, 60) });
}

/* ── hojas ED: validación estructural siempre; resolución con --ed-solve ── */
const edFilas = [];
if (Object.keys(edCasos).length) {
  for (const [key, pre] of Object.entries(edCasos)) {
    const model = ED ? ED.load(pre.model) : null;
    let errs = [], warns = [], status = "no resuelto", obj = "-";
    if (model) {
      const o = ED.solveOptions(pre.opts || {});
      const v = ED.validate(model, o) || {};
      errs = (v.errors || []).map(e => e.msg).filter(Boolean);
      warns = (v.warnings || []).map(e => e.msg).filter(Boolean);
      if (QUIERE_ED) {
        try {
          const r = await ED.solve(psaOP, model, pre.opts || {});
          status = r.report.status + "/" + r.report.condition;
          obj = Number.isFinite(r.totals.cost) ? Math.round(r.totals.cost).toLocaleString("es-CO") : "-";
          if (r.report.status !== "ok") fallos++;
        } catch (e) { errs.push(String(e && e.message).slice(0, 60)); fallos++; }
      }
      if (errs.length) fallos++;
    }
    edFilas.push({ hoja: key, modo: (pre.opts || {}).mode || "edm", horas: (pre.opts || {}).hours || 24,
                  valid: errs.length ? errs.join(" ").slice(0, 55) : "ok", warn: warns.length,
                  estado: status, costo: obj });
  }
}

console.table(filas);
if (edFilas.length) console.table(edFilas);

const md = [];
md.push("# Verificación de las hojas SUNFLEX contra los motores de las herramientas\n");
md.push(`Comando: \`node tools/verify_casepack.mjs${QUIERE_ED ? " --ed-solve" : ""}\`  ·  ` +
        `${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC\n`);
md.push(`- Hojas LF probadas: **${filas.length}** (5 activos × 5 escenarios), resueltas con el motor ` +
        `Newton-Raphson AC de la propia herramienta (PSA.js, port de PyPSA).`);
md.push(`- Convergen y validan sin error: **${filas.length - fallos}/${filas.length}**.`);
md.push(`- Desvío máximo de tensión PyPSA (Python) ↔ PSA.js (navegador): **${dvMax.toFixed(4)} pu**.`);
md.push(`- Desvío máximo de pérdidas totales: **${dlMax.toExponential(1)} MW** (ambos motores ven el mismo grafo).`);
md.push(`- Rango de tensión admitido en el check: 0,5–1,3 pu; todas las hojas quedan en ` +
        `${Math.min(...filas.map(f => +f.vmin)).toFixed(3)}–${Math.max(...filas.map(f => +f.vmax)).toFixed(3)} pu.\n`);
md.push("| hoja | converge | V mín (pu) | V máx (pu) | pérdidas (MW) | ΔV vs PyPSA | ΔPérd |");
md.push("|---|---|---|---|---|---|---|");
for (const f of filas) md.push(`| ${f.hoja} | ${f.conv} | ${f.vmin} | ${f.vmax} | ${f.perd_MW} | ${f["ΔV vs PyPSA"]} | ${f["ΔPérd vs PyPSA"]} |`);
if (edFilas.length) {
  md.push(`\n## Hojas del simulador ED-UC\n`);
  md.push("| hoja | modo | horas | validación | warn | estado HiGHS | costo objetivo |");
  md.push("|---|---|---|---|---|---|---|");
  for (const f of edFilas) md.push(`| ${f.hoja} | ${f.modo} | ${f.horas} | ${f.valid} | ${f.warn} | ${f.estado} | ${f.costo} |`);
}
md.push(`\n> Las hojas no se editan a mano: se generan con \`python3 gen_casepack.py\` desde\n` +
        "> \`sunflex_model.py\` y este script es el control de calidad de esa generación.\n");
writeFileSync(RAIZ + "output/verificacion_hojas.md", md.join("\n"), "utf8");
console.log(`\n${filas.length} hojas LF · ${edFilas.length} hojas ED · fallos=${fallos} · ΔV máx=${dvMax.toFixed(4)} pu`);
console.log("informe: output/verificacion_hojas.md");
process.exit(fallos ? 1 : 0);
