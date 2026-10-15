(function () {
  "use strict";

  const data = globalThis.PRESENTATION_DATA;
  const engine = globalThis.Viterbi;
  const model = data.model;
  const states = model.states;
  const weather = {
    Cerah: { icon: "sun", className: "sunny", color: "#d7a32b" },
    Berawan: { icon: "cloud", className: "cloudy", color: "#8e9da4" },
    Hujan: { icon: "cloud-rain", className: "rainy", color: "#307bc0" },
  };
  const activities = { jalan: "Jalan", belanja: "Belanja", di_rumah: "Di rumah" };
  const byId = (id) => document.getElementById(id);
  const icon = (name) => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const number = (value, digits = 3) => value.toLocaleString("id-ID", { maximumFractionDigits: digits });
  const probability = (value) => {
    if (value === 0) return "0";
    if (!Number.isFinite(value)) return value < 0 ? "-inf" : "-";
    return value < 0.0001 ? value.toExponential(4).replace(".", ",") : number(value, 9);
  };
  const stateLabel = (state) => `<span class="state-label">${icon(weather[state].icon)}${state}</span>`;
  const refreshIcons = () => lucide.createIcons({ attrs: { "aria-hidden": "true" } });
  const renderMath = (element, expression) => katex.render(expression, element, { throwOnError: false, output: "htmlAndMathml" });
  const baselineFive = engine.decode(data.pattern.slice(0, 5), model, { arithmetic: "probability", trace: true });

  function renderStaticContent() {
    byId("opening-path").innerHTML = baselineFive.path.map((state, day) => `<div class="opening-day"><span class="day-label">H${day + 1}</span><span class="weather-icon ${weather[state].className}">${icon(weather[state].icon)}</span><strong>${state}</strong><span class="activity-name">${activities[data.pattern[day]]}</span></div>`).join("");
    byId("opening-probability").textContent = probability(baselineFive.probability);
    byId("backtrack-probability").textContent = probability(baselineFive.probability);
    byId("initial-table").innerHTML = states.map((state) => `<div class="initial-probability">${stateLabel(state)}<strong>${number(model.initial[state], 1)}</strong></div>`).join("");
    for (const [id, matrix, columns, label] of [
      ["transition-table", model.transition, states, "Dari / ke"],
      ["emission-table", model.emission, Object.keys(activities), "Cuaca / aktivitas"],
    ]) {
      byId(id).innerHTML = `<table><thead><tr><th scope="col">${label}</th>${columns.map((column) => `<th scope="col">${activities[column] || column}</th>`).join("")}</tr></thead><tbody>${states.map((state) => `<tr><th scope="row">${stateLabel(state)}</th>${columns.map((column) => `<td class="number probability-cell" style="--cell-fill:${matrix[state][column] * 20}%">${number(matrix[state][column], 1)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    }
    byId("initial-calculation").innerHTML = states.map((state) => `<div class="calculation-item"><div class="calculation-state"><span class="${weather[state].className}">${icon(weather[state].icon)}</span><strong>${state}</strong></div><p class="operation mono">${number(model.initial[state], 1)} &times; ${number(model.emission[state].jalan, 1)}</p><span class="calculated-score">${number(baselineFive.trace[0].scores[state], 2)}</span></div>`).join("");
    byId("environment-summary").textContent = `Python ${data.environment.python} · Matplotlib ${data.environment.matplotlib} · ${data.environment.machine} · Seed ${data.environment.seed_order} · ${data.environment.repeats} pengulangan per konfigurasi.`;
    document.querySelectorAll("[data-math]").forEach((element) => renderMath(element, element.dataset.math));
    renderRecurrence();
    renderLogExample();
  }

  function renderRecurrence() {
    const state = byId("recurrence-state").value;
    const cell = baselineFive.trace[1].cells[state];
    byId("recurrence-table").innerHTML = `<table><thead><tr><th scope="col">Asal</th><th scope="col">Skor hari 1</th><th scope="col">Transisi</th><th scope="col">Kandidat</th></tr></thead><tbody>${states.map((origin) => `<tr class="${origin === cell.predecessor ? "winning-row" : ""}"><th scope="row">${stateLabel(origin)}${origin === cell.predecessor ? '<br><span class="winner-label">MAKSIMUM</span>' : ""}</th><td class="number">${number(cell.previousScores[origin], 3)}</td><td class="number">${number(model.transition[origin][state], 1)}</td><td class="number">${number(cell.candidates[origin], 4)}</td></tr>`).join("")}</tbody></table>`;
    byId("recurrence-score").textContent = number(cell.score, 4);
    byId("recurrence-operation").textContent = `${number(cell.candidates[cell.predecessor], 4)} × ${number(cell.emission, 1)} = ${number(cell.score, 4)}`;
    byId("recurrence-predecessor").innerHTML = `${icon(weather[cell.predecessor].icon)}${cell.predecessor}`;
    refreshIcons();
  }

  function renderLogExample() {
    const length = Number(byId("log-length").value);
    const result = engine.decode(engine.repeatedObservations(length, data.pattern), model);
    byId("float-probability").textContent = probability(result.probability);
    byId("float-probability").classList.toggle("underflow", result.probability === 0);
    byId("underflow-status").textContent = result.probability === 0 ? "Nol akibat underflow, bukan jalur mustahil." : "Masih dapat direpresentasikan.";
    byId("log-probability").textContent = number(result.logProbability, 6);
  }

  function renderTrellis(host, result, { selected = null, revealed = new Map(), available = () => true,
    interactive = false, reverse = false } = {}) {
    const focused = host.contains(document.activeElement) ? { ...document.activeElement.dataset } : null;
    const scrollPosition = host.scrollLeft;
    const width = Math.max(host.clientWidth, result.trace.length * 144 + 24);
    const columnWidth = width / result.trace.length;
    const center = (day) => columnWidth * (day + 0.5);
    const top = (state) => 63 + states.indexOf(state) * 73;
    const edges = [];
    for (let day = 1; day < result.trace.length; day += 1) {
      for (const origin of states) {
        for (const state of states) {
          const isPath = revealed.get(day - 1) === origin && revealed.get(day) === state;
          const isSelected = selected && selected.day === day && selected.state === state
            && result.trace[day].cells[state].predecessor === origin && available(day, state);
          edges.push(`<line x1="${center(day - 1) + 53}" y1="${top(origin) + 27}" x2="${center(day) - 53}" y2="${top(state) + 27}" class="${isPath ? "active-edge" : isSelected ? "selected-edge" : ""}" ${isPath ? `marker-${reverse ? "start" : "end"}="url(#arrow-${host.id})"` : ""}/>`);
        }
      }
    }
    const nodes = result.trace.map((day) => `<div class="trellis-day" style="left:${center(day.day) - 55}px">HARI ${day.day + 1}<span>${activities[day.observation]}</span></div>${states.map((state) => {
      const visible = available(day.day, state);
      const chosen = selected && selected.day === day.day && selected.state === state;
      const tag = interactive ? "button" : "div";
      const score = visible ? (result.arithmetic === "log" ? number(day.scores[state], 4) : probability(day.scores[state])) : "...";
      return `<${tag} class="trellis-node ${visible ? "" : "is-future"} ${revealed.get(day.day) === state ? "is-path" : ""} ${chosen ? "is-selected" : ""}" data-day="${day.day}" data-state="${state}" style="left:${center(day.day) - 53}px;top:${top(state)}px" ${interactive ? `${visible ? "" : "disabled"} aria-pressed="${Boolean(chosen)}" aria-label="Hari ${day.day + 1}, ${state}, ${visible ? `skor ${score}` : "belum dihitung"}"` : ""}><span class="node-title">${icon(weather[state].icon)}${state}</span><span class="node-score">${score}</span></${tag}>`;
    }).join("")}`).join("");
    host.innerHTML = `<div class="trellis" style="width:${width}px"><svg class="trellis-edges" viewBox="0 0 ${width} 286" aria-hidden="true"><defs><marker id="arrow-${host.id}" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto-start-reverse"><path d="M0,0 L5,2.5 L0,5" fill="#0b6e60"/></marker></defs>${edges.join("")}</svg>${nodes}</div>`;
    host.scrollLeft = scrollPosition;
    refreshIcons();
    if (focused && focused.day !== undefined) {
      host.querySelector(`[data-day="${focused.day}"][data-state="${focused.state}"]`)?.focus({ preventScroll: true });
    }
  }

  function playingButton(id, playing, name) {
    const button = byId(id);
    button.innerHTML = icon(playing ? "pause" : "play");
    button.setAttribute("aria-label", `${playing ? "Jeda" : "Putar"} ${name}`);
    button.title = `${playing ? "Jeda" : "Putar"} ${name}`;
  }

  let backtrackCount = 1;
  let backtrackTimer = null;
  function stopBacktracking() {
    clearInterval(backtrackTimer);
    backtrackTimer = null;
    playingButton("backtrack-play", false, "backtracking");
    refreshIcons();
  }

  function renderBacktracking() {
    const revealed = new Map(baselineFive.backtracking.slice(0, backtrackCount).map((step) => [step.day, step.state]));
    renderTrellis(byId("backtrack-graph"), baselineFive, { revealed, reverse: true });
    const current = baselineFive.backtracking[backtrackCount - 1];
    byId("backtrack-progress").textContent = backtrackCount === 1
      ? `Terminasi: skor terbesar di hari 5 berakhir pada ${current.state}.`
      : `Backtracking ${backtrackCount} / 5: hari ${current.day + 1} = ${current.state}.`;
    byId("backtrack-result").innerHTML = baselineFive.path.map((state, day) =>
      `${day ? icon("arrow-right") : ""}<span class="${revealed.has(day) ? "" : "unrevealed"}">${revealed.has(day) ? stateLabel(state) : `Hari ${day + 1}: ...`}</span>`).join("");
    byId("backtrack-prev").disabled = backtrackCount === 1;
    byId("backtrack-next").disabled = backtrackCount === 5;
    if (backtrackCount === 5) stopBacktracking();
    refreshIcons();
  }

  const demo = { preset: 5, observations: data.pattern.slice(0, 5), cursor: 0,
    logarithmic: false, selected: { day: 0, state: "Cerah" }, steps: [], timer: null };

  function stopDemo() {
    clearInterval(demo.timer);
    demo.timer = null;
    playingButton("demo-play", false, "perhitungan");
    refreshIcons();
  }

  function renderObservationInputs() {
    byId("observation-inputs").innerHTML = demo.observations.map((observation, day) =>
      `<label><span>H${day + 1}</span><select data-observation-day="${day}" aria-label="Aktivitas hari ${day + 1}">${Object.entries(activities).map(([symbol, label]) => `<option value="${symbol}" ${observation === symbol ? "selected" : ""}>${label}</option>`).join("")}</select></label>`).join("");
  }

  function recomputeDemo(reset = true) {
    stopDemo();
    try {
      demo.result = engine.decode(demo.observations, model, {
        arithmetic: demo.logarithmic ? "log" : "probability", trace: true,
      });
      demo.steps = [{ phase: "initial", day: 0, state: states[0] }];
      for (let day = 1; day < demo.observations.length; day += 1) {
        for (const state of states) demo.steps.push({ phase: "recursion", day, state });
      }
      demo.steps.push({ phase: "terminal", day: demo.observations.length - 1, state: demo.result.terminal });
      for (const step of demo.result.backtracking.slice(1)) demo.steps.push({ ...step, phase: "backtrack" });
      demo.steps.push({ phase: "complete", day: 0, state: demo.result.path[0] });
      demo.cursor = reset ? 0 : Math.min(demo.cursor, demo.steps.length - 1);
      demo.selected = { day: demo.steps[demo.cursor].day, state: demo.steps[demo.cursor].state };
      byId("demo-error").hidden = true;
      renderDemo();
    } catch (error) {
      demo.result = null;
      byId("demo-error").textContent = error.message;
      byId("demo-error").hidden = false;
      byId("demo-graph").replaceChildren();
      byId("inspector-calculation").replaceChildren();
      byId("demo-result-path").textContent = "Jalur tidak tersedia.";
      byId("demo-result-probability").textContent = "-";
      for (const id of ["demo-play", "demo-prev", "demo-next"]) byId(id).disabled = true;
    }
  }

  function renderInspector() {
    const { day, state } = demo.selected;
    const cell = demo.result.trace[day].cells[state];
    const formatScore = demo.logarithmic ? (value) => number(value, 5) : probability;
    byId("inspector-title").textContent = `Hari ${day + 1} / ${state}`;
    byId("inspector-observation").textContent = `Observasi: ${activities[demo.observations[day]].toLowerCase()}`;
    if (day === 0) {
      byId("inspector-calculation").innerHTML = `<div class="inspector-calculation-row"><span>Peluang awal</span><span class="mono">${number(cell.initial, 1)}</span></div><div class="inspector-calculation-row"><span>Emisi</span><span class="mono">${number(cell.emission, 1)}</span></div><div class="inspector-equation">${demo.logarithmic ? `log(${number(cell.initial, 1)}) + log(${number(cell.emission, 1)})` : `${number(cell.initial, 1)} &times; ${number(cell.emission, 1)}`}</div><div class="inspector-final">Skor: <strong class="mono">${formatScore(cell.score)}</strong></div>`;
    } else {
      byId("inspector-calculation").innerHTML = states.map((origin) => `<div class="inspector-calculation-row ${origin === cell.predecessor ? "is-winner" : ""}"><span>${origin}${origin === cell.predecessor ? " *" : ""}</span><span class="mono">${formatScore(cell.candidates[origin])}</span></div>`).join("")
        + `<div class="inspector-equation">max = ${formatScore(cell.candidates[cell.predecessor])}<br>${demo.logarithmic ? `+ log(${number(cell.emission, 1)})` : `&times; emisi ${number(cell.emission, 1)}`}<br>= ${formatScore(cell.score)}</div><div class="inspector-final">Pendahulu: <strong>${cell.predecessor}</strong></div>`;
    }
  }

  function renderDemo() {
    if (!demo.result) return;
    const step = demo.steps[demo.cursor];
    const available = (day, state) => {
      if (["terminal", "backtrack", "complete"].includes(step.phase)) return true;
      if (day < step.day) return true;
      if (day > step.day) return false;
      return step.phase === "initial" || states.indexOf(state) <= states.indexOf(step.state);
    };
    const revealed = new Map();
    if (["terminal", "backtrack", "complete"].includes(step.phase)) {
      const first = step.phase === "complete" ? 0 : step.day;
      demo.result.path.forEach((state, day) => { if (day >= first) revealed.set(day, state); });
    }
    const titles = { initial: "Inisialisasi", recursion: `Rekursi H${step.day + 1} / ${step.state}`,
      terminal: "Terminasi", backtrack: `Backtracking H${step.day + 1}`, complete: "Jalur selesai" };
    byId("demo-stage").textContent = `${demo.cursor + 1}/${demo.steps.length} · ${titles[step.phase]}`;
    byId("demo-prev").disabled = demo.cursor === 0;
    byId("demo-next").disabled = demo.cursor === demo.steps.length - 1;
    byId("demo-play").disabled = false;
    renderTrellis(byId("demo-graph"), demo.result, { selected: demo.selected, revealed,
      available, interactive: true, reverse: ["backtrack", "complete"].includes(step.phase) });
    renderInspector();
    byId("demo-result-path").textContent = revealed.size ? demo.result.path.map((state, day) =>
      revealed.has(day) ? state : "...").join(" → ") : "Menunggu terminasi dan backtracking.";
    byId("demo-result-probability").textContent = revealed.size ? probability(demo.result.probability) : "...";
    if (demo.cursor === demo.steps.length - 1) stopDemo();
  }

  function moveDemo(delta) {
    demo.cursor = Math.max(0, Math.min(demo.cursor + delta, demo.steps.length - 1));
    const step = demo.steps[demo.cursor];
    demo.selected = { day: step.day, state: step.state };
    renderDemo();
    const host = byId("demo-graph");
    const node = host.querySelector(`[data-day="${step.day}"][data-state="${step.state}"]`);
    if (node) host.scrollTo({ left: node.offsetLeft - host.clientWidth / 2 + 53, behavior: "instant" });
  }

  let timingGroup = "pendek";
  let chartRevision = 0;
  function renderTiming() {
    const rows = data.timing.filter((row) => row.group === timingGroup);
    const viterbi = data.timing.find((row) => row.algorithm === "Viterbi" && row.days === 10);
    const enumeration = data.timing.find((row) => row.algorithm === "Enumerasi" && row.days === 10);
    byId("speed-ratio").textContent = `${number(enumeration.mean_ms / viterbi.mean_ms, 0)}×`;
    byId("viterbi-time").textContent = `${number(viterbi.mean_ms, 4)} ms`;
    byId("enumeration-time").textContent = `${number(enumeration.mean_ms, 2)} ms`;
    byId("timing-caption").textContent = timingGroup === "pendek"
      ? "Sumbu waktu logaritmik. Enumerasi dibatasi hingga 10 hari." : "Sumbu waktu linear. Hanya Viterbi; enumerasi tidak dijalankan pada rentang ini.";
    byId("timing-table").innerHTML = `<table><caption>Waktu pengukuran Python, bukan simulasi browser</caption><thead><tr><th scope="col">Hari</th><th scope="col">Algoritma</th><th scope="col">Rata-rata (ms)</th><th scope="col">SD sampel (ms)</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${row.days}</td><th scope="row">${row.algorithm}</th><td class="number">${number(row.mean_ms, 6)}</td><td class="number">${number(row.sd_ms, 6)}</td></tr>`).join("")}</tbody></table>`;
    if (deck.getCurrentSlide()?.id !== "waktu") return;
    const host = byId("timing-chart");
    const revision = ++chartRevision;
    host.dataset.ready = "false";
    const traces = ["Viterbi", "Enumerasi"].map((algorithm) => {
      const selected = rows.filter((row) => row.algorithm === algorithm);
      return { type: "scatter", mode: "lines+markers", name: algorithm,
        x: selected.map((row) => row.days), y: selected.map((row) => row.mean_ms),
        error_y: { type: "data", array: selected.map((row) => row.sd_ms), visible: true, thickness: 1, width: 4 },
        line: { color: algorithm === "Viterbi" ? "#0b6e60" : "#bd4e42", width: 2 },
        marker: { size: 7, symbol: algorithm === "Viterbi" ? "circle" : "diamond" },
        customdata: selected.map((row) => [row.sd_ms, row.runs]),
        hovertemplate: "%{x} hari<br>%{y:.6f} ms<br>SD: %{customdata[0]:.6f} ms<br>%{customdata[1]} run<extra>%{fullData.name}</extra>" };
    }).filter((trace) => trace.x.length);
    Plotly.react(host, traces, {
      autosize: true, margin: { l: 62, r: 18, t: 34, b: 48 },
      paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
      font: { family: "Plex Sans, sans-serif", size: 12, color: "#60716d" },
      separators: ",.", hovermode: "closest", dragmode: false,
      xaxis: { title: { text: "Panjang observasi (hari)", standoff: 8 }, gridcolor: "#e4eae5",
        zeroline: false, fixedrange: true, ...(timingGroup === "pendek" ? { tickvals: [1, 2, 4, 5, 6, 8, 10] } : {}) },
      yaxis: { title: { text: "Waktu (ms)", standoff: 8 }, gridcolor: "#e4eae5", zeroline: false,
        type: timingGroup === "pendek" ? "log" : "linear", fixedrange: true, rangemode: "tozero" },
      legend: { orientation: "h", x: 0, y: 1.18, font: { size: 11 } },
    }, { displayModeBar: false, responsive: false, displaylogo: false }).then(() => {
      if (revision === chartRevision) host.dataset.ready = "true";
    }).catch((error) => {
      host.textContent = "Grafik tidak tersedia. Nilai lengkap ada di tabel data.";
      console.error(error);
    });
  }

  let sensitivityParameter = "alpha";
  let sensitivityCase = data.sensitivity[0];
  function drawStrip(id, path) {
    const canvas = byId(id);
    const density = devicePixelRatio || 1;
    canvas.width = Math.max(500, Math.round(canvas.clientWidth * density));
    canvas.height = Math.round(22 * density);
    const context = canvas.getContext("2d");
    path.split("").forEach((state, day) => {
      context.fillStyle = weather[states[Number(state)]].color;
      context.fillRect(Math.floor(day * canvas.width / 500), 0, Math.ceil(canvas.width / 500) + 1, canvas.height);
    });
    const day = Number(byId("inspect-day").value) - 1;
    context.fillStyle = "#202c2a";
    context.fillRect(Math.floor(day * canvas.width / 500), 0, Math.max(2, density), canvas.height);
  }

  function renderDayDetail() {
    const day = Math.max(1, Math.min(500, Math.round(Number(byId("inspect-day").value) || 1)));
    byId("inspect-day").value = day;
    const baseline = states[Number(data.baselinePath[day - 1])];
    const selected = states[Number(sensitivityCase.path[day - 1])];
    byId("path-day-detail").textContent = `${activities[data.pattern[(day - 1) % 10]]} · Baseline: ${baseline} · Terpilih: ${selected}`;
    drawStrip("baseline-strip", data.baselinePath);
    drawStrip("selected-strip", sensitivityCase.path);
  }

  function renderSensitivity() {
    const value = Math.round(Number(byId("parameter-value").value) * 4) / 4;
    sensitivityCase = data.sensitivity.find((row) => row.group === sensitivityParameter && row[sensitivityParameter] === value);
    const alpha = sensitivityParameter === "alpha";
    const name = alpha ? "Alpha" : "Beta";
    byId("parameter-name").textContent = name;
    byId("parameter-output").textContent = value.toLocaleString("id-ID", { minimumFractionDigits: 2 });
    byId("parameter-value").setAttribute("aria-valuetext", `${name} ${number(value, 2)}`);
    byId("fixed-parameter").textContent = `${alpha ? "Beta" : "Alpha"} = 0 · T = 500 · Peluang awal tetap`;
    renderMath(byId("sensitivity-formula"), alpha ? "A_{\\alpha}=(1-\\alpha)A+\\alpha I" : "B_{\\beta}=(1-\\beta)B+\\beta U");
    byId("sensitivity-description").textContent = alpha ? "Makin besar alpha, makin kuat kecenderungan bertahan pada cuaca yang sama." : "Makin besar beta, emisi makin seragam dan aktivitas makin kurang informatif.";
    byId("changed-labels").textContent = `${number(sensitivityCase.changed_labels_pct, 1)}%`;
    byId("state-switches").textContent = number(sensitivityCase.switches, 0);
    byId("score-per-day").textContent = number(sensitivityCase.log_probability_per_day, 4);
    byId("selected-strip-label").textContent = `${name} ${number(value, 2)}`;
    byId("baseline-strip").setAttribute("aria-label", "Baseline 500 hari, 300 perpindahan cuaca. Rincian tersedia melalui pemilih hari.");
    byId("selected-strip").setAttribute("aria-label", `${name} ${value}, ${sensitivityCase.changed_labels_pct}% label berubah, ${sensitivityCase.switches} perpindahan cuaca. Rincian tersedia melalui pemilih hari.`);
    renderDayDetail();
  }

  byId("backtrack-prev").addEventListener("click", () => { stopBacktracking(); backtrackCount = Math.max(1, backtrackCount - 1); renderBacktracking(); });
  byId("backtrack-next").addEventListener("click", () => { stopBacktracking(); backtrackCount = Math.min(5, backtrackCount + 1); renderBacktracking(); });
  byId("backtrack-reset").addEventListener("click", () => { stopBacktracking(); backtrackCount = 1; renderBacktracking(); });
  byId("backtrack-play").addEventListener("click", () => {
    if (backtrackTimer) { stopBacktracking(); return; }
    if (backtrackCount === 5) { backtrackCount = 1; renderBacktracking(); }
    playingButton("backtrack-play", true, "backtracking");
    refreshIcons();
    backtrackTimer = setInterval(() => { backtrackCount += 1; renderBacktracking(); }, 850);
  });
  byId("observation-inputs").addEventListener("change", (event) => {
    const day = event.target.dataset.observationDay;
    if (day === undefined) return;
    demo.observations[Number(day)] = event.target.value;
    recomputeDemo();
  });
  document.querySelectorAll("[data-preset]").forEach((button) => button.addEventListener("click", () => {
    demo.preset = Number(button.dataset.preset);
    demo.observations = data.pattern.slice(0, demo.preset);
    document.querySelectorAll("[data-preset]").forEach((option) => option.setAttribute("aria-pressed", String(option === button)));
    renderObservationInputs();
    recomputeDemo();
  }));
  byId("demo-reset").addEventListener("click", () => {
    demo.observations = data.pattern.slice(0, demo.preset);
    renderObservationInputs();
    recomputeDemo();
  });
  byId("demo-prev").addEventListener("click", () => { stopDemo(); moveDemo(-1); });
  byId("demo-next").addEventListener("click", () => { stopDemo(); moveDemo(1); });
  byId("demo-play").addEventListener("click", () => {
    if (demo.timer) { stopDemo(); return; }
    if (demo.cursor === demo.steps.length - 1) { demo.cursor = 0; demo.selected = { day: 0, state: states[0] }; renderDemo(); }
    playingButton("demo-play", true, "perhitungan");
    refreshIcons();
    demo.timer = setInterval(() => moveDemo(1), 700);
  });
  byId("log-toggle").addEventListener("change", (event) => { demo.logarithmic = event.target.checked; recomputeDemo(false); });
  byId("demo-graph").addEventListener("click", (event) => {
    const node = event.target.closest("button[data-day]");
    if (!node || node.disabled) return;
    stopDemo();
    demo.selected = { day: Number(node.dataset.day), state: node.dataset.state };
    renderDemo();
  });
  document.querySelectorAll("[data-timing]").forEach((button) => button.addEventListener("click", () => {
    timingGroup = button.dataset.timing;
    document.querySelectorAll("[data-timing]").forEach((option) => option.setAttribute("aria-pressed", String(option === button)));
    renderTiming();
  }));
  document.querySelectorAll("[data-parameter]").forEach((button) => button.addEventListener("click", () => {
    sensitivityParameter = button.dataset.parameter;
    document.querySelectorAll("[data-parameter]").forEach((option) => option.setAttribute("aria-pressed", String(option === button)));
    renderSensitivity();
  }));
  byId("parameter-value").addEventListener("input", renderSensitivity);
  byId("inspect-day").addEventListener("change", renderDayDetail);
  for (const id of ["baseline-strip", "selected-strip"]) {
    byId(id).addEventListener("pointerdown", (event) => {
      const rectangle = event.currentTarget.getBoundingClientRect();
      byId("inspect-day").value = Math.min(500, Math.floor(500 * (event.clientX - rectangle.left) / rectangle.width) + 1);
      renderDayDetail();
    });
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { stopDemo(); stopBacktracking(); }
  });

  let toastTimer;
  function toast(message) {
    clearTimeout(toastTimer);
    byId("toast").textContent = message;
    byId("toast").hidden = false;
    toastTimer = setTimeout(() => { byId("toast").hidden = true; }, 4000);
  }

  const sections = [...document.querySelectorAll(".slides > section")];
  byId("slide-select").innerHTML = sections.map((section, index) => `<option value="${index}">${String(index + 1).padStart(2, "0")} · ${section.dataset.title}</option>`).join("");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const deck = new Reveal(byId("main"), {
    embedded: true, disableLayout: true, center: false, controls: false, progress: false,
    hash: true, history: true, overview: false, help: false, touch: false,
    transition: reducedMotion.matches ? "none" : "fade", transitionSpeed: "fast",
    keyboardCondition: (event) => !event.target.closest("input, select, button, textarea, summary, a, [contenteditable]"),
    slideNumber: false, scrollActivationWidth: null, respondToHashChanges: true,
  });

  function updateNavigation() {
    const index = deck.getIndices().h;
    const section = sections[index];
    byId("slide-select").value = String(index);
    byId("slide-counter").textContent = `${String(index + 1).padStart(2, "0")} / 12`;
    byId("chapter-label").textContent = section.dataset.title;
    byId("slide-source").textContent = section.dataset.source;
    byId("deck-progress-bar").style.width = `${100 * (index + 1) / sections.length}%`;
    byId("deck-prev").disabled = index === 0;
    byId("deck-next").disabled = index === sections.length - 1;
  }

  byId("slide-select").addEventListener("change", (event) => deck.slide(Number(event.target.value)));
  byId("deck-prev").addEventListener("click", () => deck.prev());
  byId("deck-next").addEventListener("click", () => deck.next());
  byId("recurrence-state").addEventListener("change", renderRecurrence);
  byId("log-length").addEventListener("change", renderLogExample);
  byId("fullscreen").addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else toast("Layar penuh tidak tersedia di browser ini.");
    } catch {
      toast("Browser tidak mengizinkan layar penuh. Presentasi tetap dapat digunakan.");
    }
  });
  document.addEventListener("fullscreenchange", () => {
    const active = Boolean(document.fullscreenElement);
    byId("fullscreen").innerHTML = icon(active ? "minimize" : "maximize");
    byId("fullscreen").setAttribute("aria-label", active ? "Keluar layar penuh" : "Layar penuh");
    byId("fullscreen").title = active ? "Keluar layar penuh" : "Layar penuh";
    refreshIcons();
  });
  reducedMotion.addEventListener("change", () => deck.configure({ transition: reducedMotion.matches ? "none" : "fade" }));
  function renderVisibleSlide() {
    const id = deck.getCurrentSlide()?.id;
    if (id === "simulasi") renderDemo();
    if (id === "backtracking") renderBacktracking();
    if (id === "waktu") renderTiming();
    if (id === "sensitivitas") renderSensitivity();
  }
  deck.on("slidechanged", () => {
    stopDemo();
    stopBacktracking();
    updateNavigation();
    requestAnimationFrame(renderVisibleSlide);
  });
  let resizeFrame;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(renderVisibleSlide);
  });
  renderStaticContent();
  renderObservationInputs();
  recomputeDemo();
  renderBacktracking();
  renderSensitivity();
  deck.initialize().then(() => {
    updateNavigation();
    renderVisibleSlide();
    refreshIcons();
    document.documentElement.dataset.ready = "true";
  });
  globalThis.Presentation = { deck };
})();