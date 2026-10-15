import argparse
import csv
import hashlib
import json
import math
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "presentasi/assets/data.js"
EXPERIMENTS = "output_eksperimen_cuaca/"
FIGURES = ("waktu_vs_ukuran.png", "sebaran_waktu.png", "sensitivitas_parameter.png")
SOURCES = (
    "dataset.json",
    EXPERIMENTS + "ringkasan_waktu.csv",
    EXPERIMENTS + "ringkasan_sensitivitas.csv",
    EXPERIMENTS + "jalur_sensitivitas.csv",
    EXPERIMENTS + "lingkungan.json",
) + tuple(EXPERIMENTS + name for name in FIGURES)
SUMMARY_COLUMNS = {
    "group", "algorithm", "days", "alpha", "beta", "runs", "batch_calls",
    "mean_ms", "sd_ms", "min_ms", "max_ms", "mean_log_probability",
    "sd_log_probability",
}
INTEGER_COLUMNS = {"days", "runs", "batch_calls", "switches"}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read_csv(relative_path, required_columns):
    with (ROOT / relative_path).open(encoding="utf-8", newline="") as source:
        reader = csv.DictReader(source)
        require(required_columns <= set(reader.fieldnames or []),
                f"Kolom tidak lengkap: {relative_path}")
        return list(reader)


def read_summary(relative_path, extra_columns=()):
    rows = read_csv(relative_path, SUMMARY_COLUMNS | set(extra_columns))
    for row in rows:
        for key, value in row.items():
            if key not in {"group", "algorithm"}:
                number = float(value)
                require(math.isfinite(number), f"Nilai tidak valid: {relative_path}, {key}")
                if key in INTEGER_COLUMNS:
                    require(number.is_integer(), f"Bilangan bulat diperlukan: {key}")
                    number = int(number)
                row[key] = number
        require(row["mean_ms"] > 0 and row["sd_ms"] >= 0, "Ringkasan waktu tidak valid.")
    return rows


def make_snapshot():
    model = json.loads((ROOT / "dataset.json").read_text(encoding="utf-8"))
    environment = json.loads((ROOT / SOURCES[4]).read_text(encoding="utf-8"))
    hashes = {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in SOURCES}
    require(hashes["dataset.json"] == environment["dataset_sha256"],
            "Hash dataset berbeda dari eksperimen. Pulihkan dataset yang sesuai atau "
            "perbarui hasil eksperimen secara sengaja sebelum menyiapkan presentasi.")
    states = model["states"]
    require(states == list(model["initial"]) and len(states) == 3,
            "Urutan tiga state harus sama dengan urutan peluang awal.")
    symbols = list(model["emission"][states[0]])
    require(len(symbols) == 3, "Model presentasi memerlukan tiga simbol observasi.")
    require(set(model["transition"]) == set(states) == set(model["emission"]),
            "State pada matriks tidak lengkap.")
    distributions = [model["initial"]]
    for state in states:
        require(list(model["transition"][state]) == states, "Orientasi matriks transisi berubah.")
        require(list(model["emission"][state]) == symbols, "Urutan simbol emisi tidak konsisten.")
        distributions.extend([model["transition"][state], model["emission"][state]])
    for distribution in distributions:
        require(all(isinstance(value, (int, float)) and math.isfinite(value)
                    and 0 <= value <= 1 for value in distribution.values()), "Peluang di luar [0, 1].")
        require(math.isclose(sum(distribution.values()), 1, abs_tol=1e-12),
                "Distribusi peluang tidak ternormalisasi.")
    pattern = model["observations"] + ["belanja", "di_rumah", "belanja", "jalan"]
    require(len(pattern) == 10 and all(symbol in symbols for symbol in pattern),
            "Pola sepuluh hari tidak sesuai dengan model.")
    require(pattern == environment["observation_pattern"], "Pola eksperimen berbeda dari dataset.")
    require(environment["states"] == states, "State eksperimen berbeda dari dataset.")

    timing = read_summary(SOURCES[1])
    expected_timing = {(group, algorithm, days)
                       for group, sizes, algorithms in (
                           ("pendek", environment["short_sizes"], ["Viterbi", "Enumerasi"]),
                           ("panjang", environment["long_sizes"], ["Viterbi"]))
                       for days in sizes for algorithm in algorithms}
    require(len(timing) == 19 and {(row["group"], row["algorithm"], row["days"])
                                  for row in timing} == expected_timing,
            "Diperlukan 19 konfigurasi waktu yang sesuai dengan metadata.")
    sensitivity = read_summary(SOURCES[2], {"changed_labels_pct", "switches", "log_probability_per_day"})
    values = environment["parameter_values"]
    require(values == [0, 0.25, 0.5, 0.75, 1], "Grid sensitivitas tidak sesuai dengan presentasi.")
    expected_cases = {(parameter, value if parameter == "alpha" else 0,
                       value if parameter == "beta" else 0)
                      for parameter in ["alpha", "beta"] for value in values}
    require(len(sensitivity) == 10 and {(row["group"], row["alpha"], row["beta"])
                                      for row in sensitivity} == expected_cases,
            "Diperlukan sepuluh konfigurasi sensitivitas satu parameter pada satu waktu.")
    require(all(row["runs"] == environment["repeats"] == 10 for row in timing + sensitivity),
            "Jumlah pengulangan eksperimen berubah.")
    require(all(row["alpha"] == row["beta"] == 0 for row in timing), "Benchmark bukan model baseline.")
    size = environment["sensitivity_size"]
    require(size == 500, "Sensitivitas presentasi menggunakan 500 hari.")
    path_rows = read_csv(SOURCES[3], {"parameter", "alpha", "beta", "day", "observation",
                                     "baseline_state", "state"})
    paths = {key: [] for key in expected_cases}
    for row in path_rows:
        key = (row["parameter"], float(row["alpha"]), float(row["beta"]))
        require(key in paths, "Konfigurasi jalur tidak dikenal.")
        paths[key].append(row)
    baseline = None
    for case in sensitivity:
        require(case["algorithm"] == "Viterbi" and case["days"] == size,
                "Konfigurasi sensitivitas tidak sesuai.")
        ordered = sorted(paths[(case["group"], case["alpha"], case["beta"])],
                         key=lambda row: int(row["day"]))
        require([int(row["day"]) for row in ordered] == list(range(1, size + 1)),
                "Jalur sensitivitas tidak lengkap atau memiliki hari duplikat.")
        require(all(row["observation"] == pattern[index % len(pattern)]
                    for index, row in enumerate(ordered)), "Observasi sensitivitas tidak sesuai.")
        decoded = [row["state"] for row in ordered]
        reference = [row["baseline_state"] for row in ordered]
        require(all(state in states for state in decoded + reference), "State jalur tidak dikenal.")
        if baseline is None:
            baseline = reference
        require(reference == baseline, "Jalur baseline tidak konsisten.")
        changes = 100 * sum(state != original for state, original in zip(decoded, reference)) / size
        switches = sum(previous != current for previous, current in zip(decoded, decoded[1:]))
        require(math.isclose(changes, case["changed_labels_pct"], abs_tol=1e-12)
                and switches == case["switches"], "Metrik sensitivitas berbeda dari jalur.")
        require(math.isclose(case["mean_log_probability"] / size, case["log_probability_per_day"],
                             abs_tol=1e-12), "Skor per hari tidak konsisten.")
        case["path"] = "".join(str(states.index(state)) for state in decoded)
    metadata_keys = ["os", "machine", "matplotlib", "seed_order", "repeats", "warmup_calls",
                     "target_batch_ms", "max_batch_calls", "timer", "sd", "scope",
                     "sensitivity_size", "parameter_values", "dataset_sha256"]
    metadata = {key: environment[key] for key in metadata_keys}
    metadata["python"] = environment["python"].split()[0]
    return {"model": model, "pattern": pattern, "timing": timing, "sensitivity": sensitivity,
            "baselinePath": "".join(str(states.index(state)) for state in baseline),
            "environment": metadata, "sources": hashes}


def main():
    parser = argparse.ArgumentParser(description="Siapkan snapshot offline presentasi tanpa menjalankan notebook.")
    parser.add_argument("--check", action="store_true", help="Periksa snapshot tanpa menulis berkas.")
    options = parser.parse_args()
    try:
        data = make_snapshot()
        content = "globalThis.PRESENTATION_DATA = " + json.dumps(data, ensure_ascii=True, indent=2) + ";\n"
        if options.check:
            require(OUTPUT.exists() and OUTPUT.read_text(encoding="utf-8") == content,
                    "Snapshot belum ada atau kedaluwarsa. Jalankan skrip ini tanpa --check.")
            for name in FIGURES:
                target = OUTPUT.parent / "figures" / name
                require(target.exists() and target.read_bytes() == (ROOT / EXPERIMENTS / name).read_bytes(),
                        f"Gambar {name} belum sesuai sumber. Jalankan skrip ini tanpa --check.")
            print("Lulus: snapshot sesuai dataset, 19 benchmark, dan 10 jalur sensitivitas.")
        else:
            OUTPUT.parent.mkdir(parents=True, exist_ok=True)
            OUTPUT.write_text(content, encoding="utf-8")
            (OUTPUT.parent / "figures").mkdir(exist_ok=True)
            for name in FIGURES:
                (OUTPUT.parent / "figures" / name).write_bytes((ROOT / EXPERIMENTS / name).read_bytes())
            print(f"Snapshot siap: {OUTPUT.relative_to(ROOT)}")
    except (ValueError, KeyError, TypeError, OSError) as error:
        parser.exit(1, f"Gagal: {error}\n")


if __name__ == "__main__":
    main()