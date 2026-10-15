(function () {
  "use strict";

  function validateModel(model) {
    const states = Object.keys(model.initial);
    if (!states.length || (model.states && model.states.join("|") !== states.join("|"))) {
      throw new Error("Urutan state harus sama dengan urutan peluang awal.");
    }
    const symbols = Object.keys(model.emission[states[0]] || {});
    if (!symbols.length) throw new Error("Matriks emisi kosong.");
    const rows = [model.initial];
    for (const state of states) {
      for (const [matrix, keys] of [[model.transition, states], [model.emission, symbols]]) {
        const row = matrix[state];
        if (!row || Object.keys(row).length !== keys.length || keys.some((key) => !(key in row))) {
          throw new Error("Matriks model tidak lengkap.");
        }
        rows.push(row);
      }
    }
    for (const row of rows) {
      const values = Object.values(row);
      if (values.some((value) => !Number.isFinite(value) || value < 0 || value > 1)
          || Math.abs(values.reduce((total, value) => total + value, 0) - 1) > 1e-12) {
        throw new Error("Peluang harus dalam [0, 1] dan jumlah setiap distribusi harus satu.");
      }
    }
    return { states, symbols };
  }

  function safeLog(value) {
    return value > 0 ? Math.log(value) : -Infinity;
  }

  function bestState(states, scores) {
    let best = states[0];
    for (const state of states.slice(1)) {
      if (scores[state] > scores[best]) best = state;
    }
    return best;
  }

  function decode(observations, model, { arithmetic = "log", trace = false } = {}) {
    if (!Array.isArray(observations)) throw new TypeError("Observasi harus berupa urutan aktivitas.");
    if (!["log", "probability"].includes(arithmetic)) throw new Error("Mode perhitungan tidak dikenal.");
    const logarithmic = arithmetic === "log";
    if (!observations.length) {
      return { path: [], score: logarithmic ? 0 : 1, logProbability: 0, probability: 1,
        trace: [], backtracking: [], arithmetic };
    }
    const { states, symbols } = validateModel(model);
    if (observations.some((symbol) => !symbols.includes(symbol))) {
      throw new Error("Observasi tidak dikenal oleh matriks emisi.");
    }
    const convert = logarithmic ? safeLog : (value) => value;
    const combine = logarithmic ? (previous, next) => previous + next : (previous, next) => previous * next;
    const initial = Object.fromEntries(states.map((state) => [state, convert(model.initial[state])]));
    const transitions = Object.fromEntries(states.map((origin) => [origin,
      Object.fromEntries(states.map((target) => [target, convert(model.transition[origin][target])]))]));
    const emissions = Object.fromEntries(states.map((state) => [state,
      Object.fromEntries(symbols.map((symbol) => [symbol, convert(model.emission[state][symbol])]))]));
    let scores = Object.fromEntries(states.map((state) => [state,
      combine(initial[state], emissions[state][observations[0]])]));
    const days = [];
    if (trace) {
      days.push({ day: 0, observation: observations[0], scores: { ...scores },
        cells: Object.fromEntries(states.map((state) => [state, {
          state, initial: model.initial[state], emission: model.emission[state][observations[0]],
          predecessor: null, candidates: {}, score: scores[state],
        }])) });
    }
    const pointers = [];
    for (let day = 1; day < observations.length; day += 1) {
      const nextScores = {};
      const previous = {};
      const cells = {};
      for (const state of states) {
        const candidates = Object.fromEntries(states.map((origin) => [origin,
          combine(scores[origin], transitions[origin][state])]));
        const best = bestState(states, candidates);
        nextScores[state] = combine(candidates[best], emissions[state][observations[day]]);
        previous[state] = best;
        if (trace) {
          cells[state] = { state, previousScores: { ...scores }, candidates,
            predecessor: best, emission: model.emission[state][observations[day]], score: nextScores[state] };
        }
      }
      scores = nextScores;
      pointers.push(previous);
      if (trace) days.push({ day, observation: observations[day], scores: { ...scores }, cells });
    }
    const last = bestState(states, scores);
    const score = scores[last];
    if (!Number.isFinite(score) || (!logarithmic && score === 0)) {
      throw new RangeError("Tidak ada jalur dengan probabilitas positif. Untuk urutan panjang, gunakan mode log.");
    }
    const reversed = [last];
    const backtracking = [{ day: observations.length - 1, state: last }];
    for (let day = pointers.length - 1; day >= 0; day -= 1) {
      const origin = pointers[day][reversed[reversed.length - 1]];
      reversed.push(origin);
      backtracking.push({ day, state: origin });
    }
    return { path: reversed.reverse(), score, states, terminal: last,
      logProbability: logarithmic ? score : Math.log(score),
      probability: logarithmic ? Math.exp(score) : score,
      trace: days, backtracking, arithmetic };
  }

  function repeatedObservations(length, pattern) {
    if (!Number.isInteger(length) || length < 0 || !Array.isArray(pattern) || !pattern.length) {
      throw new RangeError("Panjang harus bilangan bulat nonnegatif dan pola tidak boleh kosong.");
    }
    return Array.from({ length }, (_, index) => pattern[index % pattern.length]);
  }

  function variedParameters(model, alpha, beta) {
    if (![alpha, beta].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) {
      throw new RangeError("Alpha dan beta harus berada dalam [0, 1].");
    }
    const { states, symbols } = validateModel(model);
    return { ...model, states: [...states], initial: { ...model.initial },
      observations: [...(model.observations || [])],
      transition: Object.fromEntries(states.map((origin) => [origin,
        Object.fromEntries(states.map((target) => [target,
          (1 - alpha) * model.transition[origin][target] + alpha * Number(origin === target)]))])),
      emission: Object.fromEntries(states.map((state) => [state,
        Object.fromEntries(symbols.map((symbol) => [symbol,
          (1 - beta) * model.emission[state][symbol] + beta / symbols.length]))])) };
  }

  function pathLogScore(path, observations, model) {
    if (path.length !== observations.length) throw new Error("Panjang jalur dan observasi harus sama.");
    if (!observations.length) return 0;
    let score = safeLog(model.initial[path[0]]) + safeLog(model.emission[path[0]][observations[0]]);
    for (let day = 1; day < path.length; day += 1) {
      score += safeLog(model.transition[path[day - 1]][path[day]])
        + safeLog(model.emission[path[day]][observations[day]]);
    }
    return score;
  }

  function pathMetrics(path, baseline) {
    if (path.length !== baseline.length) throw new Error("Panjang jalur dan baseline harus sama.");
    const changes = path.filter((state, index) => state !== baseline[index]).length;
    const switches = path.slice(1).filter((state, index) => state !== path[index]).length;
    return { changedLabelsPct: path.length ? 100 * changes / path.length : 0, switches };
  }

  globalThis.Viterbi = Object.freeze({ decode, repeatedObservations, variedParameters, pathLogScore, pathMetrics });
})();