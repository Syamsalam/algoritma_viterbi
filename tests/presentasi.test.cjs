const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createHash } = require("node:crypto");

const root = path.resolve(__dirname, "..");
for (const filename of ["data.js", "viterbi.js"]) {
  vm.runInThisContext(fs.readFileSync(path.join(root, "presentasi/assets", filename), "utf8"), { filename });
}
const data = globalThis.PRESENTATION_DATA;
const engine = globalThis.Viterbi;
const model = data.model;
const close = (actual, expected) => assert.ok(
  Math.abs(actual - expected) <= 1e-12 * Math.max(1, Math.abs(expected)),
  `${actual} berbeda dari ${expected}`,
);

function enumerateBest(observations, parameters) {
  const states = Object.keys(parameters.initial);
  let bestScore = -Infinity;
  function visit(candidate) {
    if (candidate.length === observations.length) {
      let score = Math.log(parameters.initial[candidate[0]]);
      for (let day = 0; day < candidate.length; day += 1) {
        score += Math.log(parameters.emission[candidate[day]][observations[day]]);
        if (day) score += Math.log(parameters.transition[candidate[day - 1]][candidate[day]]);
      }
      bestScore = Math.max(score, bestScore);
      return;
    }
    for (const state of states) visit([...candidate, state]);
  }
  visit([]);
  return bestScore;
}

test("Snapshot berasal dari berkas sumber yang belum berubah", () => {
  for (const [filename, expected] of Object.entries(data.sources)) {
    assert.equal(createHash("sha256").update(fs.readFileSync(path.join(root, filename))).digest("hex"), expected);
  }
  assert.equal(data.timing.length, 19);
  assert.equal(data.sensitivity.length, 10);
  assert.equal(data.environment.executable, undefined);
});

for (const [length, expectedPath, probability] of [
  [1, ["Cerah"], 0.35],
  [5, ["Cerah", "Berawan", "Hujan", "Hujan", "Berawan"], 0.00046305],
  [10, ["Cerah", "Berawan", "Hujan", "Hujan", "Berawan", "Berawan", "Berawan", "Hujan", "Berawan", "Cerah"], 7.3513818e-8],
]) {
  test(`Kasus ${length} hari cocok dengan notebook dalam kedua mode`, () => {
    const observations = data.pattern.slice(0, length);
    for (const arithmetic of ["log", "probability"]) {
      const result = engine.decode(observations, model, { arithmetic, trace: true });
      assert.deepEqual(result.path, expectedPath);
      close(result.probability, probability);
      close(result.logProbability, Math.log(probability));
      close(engine.pathLogScore(result.path, observations, model), result.logProbability);
      assert.deepEqual(result.backtracking.map((step) => step.state).reverse(), result.path);
      assert.equal(result.trace.length, length);
    }
  });
}

test("Jejak inisialisasi dan rekursi mempertahankan kandidat sebelum emisi", () => {
  const result = engine.decode(data.pattern.slice(0, 5), model, { arithmetic: "probability", trace: true });
  close(result.trace[0].scores.Cerah, 0.35);
  close(result.trace[0].scores.Berawan, 0.09);
  close(result.trace[0].scores.Hujan, 0.02);
  const cell = result.trace[1].cells.Berawan;
  close(cell.candidates.Cerah, 0.07);
  close(cell.candidates.Berawan, 0.036);
  close(cell.candidates.Hujan, 0.006);
  close(cell.emission, 0.5);
  close(cell.score, 0.035);
  assert.equal(cell.predecessor, "Cerah");
});

test("Skor optimal cocok dengan enumerasi independen pada tujuh ukuran pendek", () => {
  for (const length of [1, 2, 4, 5, 6, 8, 10]) {
    const observations = data.pattern.slice(0, length);
    close(engine.decode(observations, model).logProbability, enumerateBest(observations, model));
  }
});

test("Setiap preset dihitung ulang, bukan memotong jalur sepuluh hari", () => {
  const prefix = engine.decode(data.pattern.slice(0, 2), model).path;
  const full = engine.decode(data.pattern, model).path.slice(0, 2);
  assert.deepEqual(prefix, ["Cerah", "Cerah"]);
  assert.notDeepEqual(prefix, full);
});

test("Urutan kosong memiliki probabilitas satu dan log-probabilitas nol", () => {
  const result = engine.decode([], model);
  assert.deepEqual(result.path, []);
  assert.equal(result.logProbability, 0);
  assert.equal(result.probability, 1);
});

test("Skor sama persis memilih state pertama", () => {
  const tied = structuredClone(model);
  tied.initial = Object.fromEntries(model.states.map((state) => [state, 1 / 3]));
  for (const state of model.states) {
    tied.transition[state] = { Cerah: 1 / 3, Berawan: 1 / 3, Hujan: 1 / 3 };
    tied.emission[state] = { jalan: 1 / 3, belanja: 1 / 3, di_rumah: 1 / 3 };
  }
  for (const arithmetic of ["log", "probability"]) {
    assert.deepEqual(engine.decode(data.pattern, tied, { arithmetic }).path, Array(10).fill("Cerah"));
  }
});

test("Peluang nol valid; jalur mustahil dan simbol asing ditolak dengan jelas", () => {
  const fixed = engine.variedParameters(model, 1, 0);
  assert.equal(engine.pathMetrics(engine.decode(data.pattern, fixed).path, Array(10).fill("Cerah")).switches, 0);
  const impossible = structuredClone(model);
  for (const state of model.states) impossible.emission[state] = { jalan: 0, belanja: 0.5, di_rumah: 0.5 };
  assert.throws(() => engine.decode(["jalan"], impossible), /Tidak ada jalur/);
  assert.throws(() => engine.decode(["asing"], model), /Observasi tidak dikenal/);
  assert.throws(() => engine.variedParameters(model, -0.1, 0), /Alpha dan beta/);
  const invalid = structuredClone(model);
  invalid.initial.Cerah = 0.9;
  assert.throws(() => engine.decode(["jalan"], invalid), /distribusi/);
});

test("Masukan dan parameter tidak dimutasi", () => {
  const original = JSON.stringify(model);
  const observations = [...data.pattern];
  engine.decode(observations, model, { trace: true });
  engine.variedParameters(model, 0.25, 0.5);
  assert.equal(JSON.stringify(model), original);
  assert.deepEqual(observations, data.pattern);
});

test("Sepuluh jalur dan metrik sensitivitas 500 hari cocok dengan hasil Python", () => {
  const observations = engine.repeatedObservations(500, data.pattern);
  const baseline = data.baselinePath.split("").map((index) => model.states[Number(index)]);
  for (const row of data.sensitivity) {
    const parameters = engine.variedParameters(model, row.alpha, row.beta);
    const result = engine.decode(observations, parameters);
    assert.equal(result.path.map((state) => model.states.indexOf(state)).join(""), row.path);
    close(result.logProbability, row.mean_log_probability);
    const metrics = engine.pathMetrics(result.path, baseline);
    close(metrics.changedLabelsPct, row.changed_labels_pct);
    assert.equal(metrics.switches, row.switches);
    close(engine.decode(data.pattern.slice(0, 5), parameters).logProbability,
      enumerateBest(data.pattern.slice(0, 5), parameters));
  }
  assert.equal(engine.pathMetrics(baseline, baseline).switches, 300);
});

test("Log-probabilitas tetap terhingga hingga 5000 hari", () => {
  for (const length of [500, 5000]) {
    const result = engine.decode(engine.repeatedObservations(length, data.pattern), model);
    const measured = data.timing.find((row) => row.days === length);
    assert.ok(Number.isFinite(result.logProbability));
    assert.equal(result.path.length, length);
    close(result.logProbability, measured.mean_log_probability);
    assert.equal(result.probability, 0);
    assert.equal(result.trace.length, 0);
  }
});