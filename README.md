# Algoritma Viterbi untuk Inferensi Cuaca

Implementasi manual algoritma Viterbi pada Hidden Markov Model (HMM) untuk
menentukan urutan cuaca paling mungkin dari urutan aktivitas. Notebook
menampilkan perhitungan langkah demi langkah untuk 1, 5, dan 10 hari,
visualisasi, pembanding enumerasi, benchmark, dan analisis sensitivitas.

Penulis: **Syamsul Alam**, NIM D082261032, Teknik Informatika,
Universitas Hasanuddin, Kabupaten Gowa, Indonesia.

## Isi Repositori

Ketiga berkas utama berada dalam satu folder:

```text
algoritma_viterbi/
|-- 02_cuaca.ipynb
|-- contoh.json
`-- README.md
```

- [02_cuaca.ipynb](02_cuaca.ipynb): program, penjelasan matematis, validasi,
	visualisasi, dan eksperimen.
- [contoh.json](contoh.json): dataset serta parameter HMM yang dibaca program.
- [README.md](README.md): penjelasan algoritma dan panduan menjalankan program.

Notebook dibagikan tanpa keluaran eksekusi lama. Tabel dan gambar akan muncul
setelah sel dijalankan. Laporan Word/PDF, lingkungan Python, dan hasil
pengukuran lokal tidak disertakan dalam tiga berkas ini.

## Dataset

Data bersifat **sintetis untuk pembelajaran**, bukan catatan cuaca nyata.
Parameter ditentukan manual, tidak dilatih dari data. Kabupaten Gowa adalah
lokasi afiliasi penulis, bukan lokasi pengambilan data.

| Kunci JSON | Isi |
|---|---|
| `states` | Cerah, Berawan, Hujan |
| `initial` | Peluang awal: 0.5, 0.3, 0.2 |
| `transition` | Peluang berpindah dari keadaan asal ke keadaan tujuan |
| `emission` | Peluang aktivitas `jalan`, `belanja`, atau `di_rumah` pada setiap keadaan |
| `observations` | Enam aktivitas awal yang diamati |

Urutan dalam JSON adalah `jalan, belanja, di_rumah, di_rumah, belanja, jalan`.
Untuk contoh sepuluh hari, program menambahkan empat observasi sintetis:
`belanja, di_rumah, belanja, jalan`. JSON asli tidak diubah. Kasus satu dan
lima hari menggunakan awalan urutan yang sama; setiap kasus dihitung ulang
dari peluang awal yang sama. Untuk benchmark panjang, pola sepuluh aktivitas
tersebut diulang dan dipotong sesuai panjang masukan.

Jumlah peluang awal dan jumlah setiap baris matriks transisi maupun emisi
harus bernilai satu. Semua peluang harus berada dalam rentang nol sampai
satu, dan simbol observasi harus tersedia pada matriks emisi.

## Cara Kerja Viterbi

Viterbi menggunakan pemrograman dinamis. Untuk setiap hari dan keadaan
tujuan, program hanya menyimpan skor awalan lintasan terbaik yang berakhir
pada keadaan tersebut, beserta keadaan pendahulunya. Tidak semua lintasan
lengkap perlu dicoba satu per satu.

Misalkan $o_t$ adalah observasi pada hari $t$, $\pi_s$ peluang awal keadaan
$s$, $a_{rs}$ peluang transisi dari $r$ ke $s$, dan $b_s(o_t)$ peluang emisi.

### 1. Inisialisasi

$$\delta_1(s)=\pi_s b_s(o_1)$$

Untuk observasi pertama `jalan`, skor Cerah adalah `0.5 * 0.7 = 0.35`,
Berawan `0.3 * 0.3 = 0.09`, dan Hujan `0.2 * 0.1 = 0.02`.

### 2. Rekursi

$$\delta_t(s)=\max_r[\delta_{t-1}(r)a_{rs}]b_s(o_t)$$

$$\psi_t(s)=\operatorname*{arg\,max}_r[\delta_{t-1}(r)a_{rs}]$$

Untuk setiap keadaan tujuan, bandingkan seluruh kandidat pendahulu,
ambil skor terbesar, lalu kalikan dengan peluang emisi hari itu. Simpan
pendahulu pemenang dalam `backpointer`. Contoh Berawan pada hari kedua:
`max(0.35*0.2, 0.09*0.4, 0.02*0.3) * 0.5 = 0.035`.

### 3. Terminasi

$$P^*=\max_s\delta_T(s),\qquad q_T^*=\operatorname*{arg\,max}_s\delta_T(s)$$

Pilih keadaan terakhir dengan skor terbesar setelah seluruh observasi diproses.

### 4. Backtracking

$$q_{t-1}^*=\psi_t(q_t^*)$$

Ikuti pendahulu dari keadaan terakhir menuju hari pertama, kemudian balik
urutan hasilnya. Memilih skor terbesar pada setiap hari secara terpisah
bukan pengganti proses ini. Jika skor sama persis, implementasi memilih
keadaan pertama sesuai urutan pada `initial`.

Fungsi `viterbi(...)` mengembalikan `(path, probability)`. Probabilitasnya
adalah probabilitas gabungan lintasan dan observasi, **bukan akurasi** dan
bukan posterior cuaca yang sudah dinormalisasi. Untuk urutan kosong, hasilnya
`([], 1.0)`. Jika tidak ada lintasan dengan probabilitas positif, fungsi
melaporkan `ValueError`.

Untuk urutan panjang, `viterbi_log(...)` menggunakan penjumlahan log-peluang
agar tidak mengalami underflow akibat perkalian bilangan sangat kecil.
Peluang nol direpresentasikan sebagai negatif tak hingga. Keluaran keduanya
tidak boleh dibandingkan langsung: versi biasa mengembalikan probabilitas,
sedangkan versi log mengembalikan log-probabilitas.

Untuk $T$ observasi dan $N$ keadaan, rekursi padat memerlukan waktu $O(TN^2)$.
Skor aktif memerlukan ruang $O(N)$, sementara pendahulu untuk merekonstruksi
lintasan memerlukan $O(TN)$. Pembanding `exhaustive_log(...)` mengevaluasi
$N^T$ lintasan dengan biaya $O(TN^T)$ dan dibatasi maksimal sepuluh hari.

## Persiapan

Disarankan Python 3.11 atau lebih baru. Paket ini diuji menggunakan Python
3.14.7. Matplotlib dipakai untuk grafik, IPython untuk tampilan HTML, dan
JupyterLab/ipykernel untuk menjalankan notebook. Inti Viterbi tidak memakai
pustaka HMM atau operasi NumPy.

Unduh repositori sebagai ZIP dan ekstrak, atau gunakan Git:

```powershell
git clone https://github.com/Syamsalam/algoritma_viterbi.git
cd algoritma_viterbi
```

### Windows PowerShell

Jalankan perintah berikut dari folder yang berisi ketiga berkas:

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install jupyterlab matplotlib ipython ipykernel
.\.venv\Scripts\python.exe -m jupyterlab
```

Aktivasi virtual environment tidak diperlukan karena perintah menggunakan
interpreter di dalam `.venv` secara langsung. Jika perintah `py` tidak
tersedia, gunakan `python -m venv .venv`.

### Linux atau macOS

```bash
python3 -m venv .venv
.venv/bin/python -m pip install jupyterlab matplotlib ipython ipykernel
.venv/bin/python -m jupyterlab
```

## Menjalankan Program

1. Buka [02_cuaca.ipynb](02_cuaca.ipynb) melalui JupyterLab yang baru dijalankan.
2. Pilih kernel Python dari environment tersebut.
3. Pilih **Run > Run All Cells** dan tunggu semua sel selesai.
4. Periksa tabel parameter, ringkasan jalur, grafik, serta pesan validasi.
5. Buka panel **Kasus 1/5/10 hari** dan **Perhitungan matematis lengkap**
	 untuk melihat rincian setiap tahap.

Alternatif di VS Code: buka folder repositori, pasang ekstensi Python dan
Jupyter dari Microsoft, buka notebook, pilih kernel `.venv`, lalu **Run All**.
Pastikan direktori kerja kernel adalah folder yang berisi `contoh.json`.
Notebook bukan skrip yang dijalankan dengan `python 02_cuaca.ipynb`.

Untuk hanya mempelajari tiga contoh, jalankan sampai sel keenam. Sel ketujuh
menjelaskan metode eksperimen, sel kedelapan mendefinisikan decoder log-space
dan memvalidasinya dengan enumerasi, sel kesembilan menjalankan benchmark,
dan sel kesepuluh menjalankan sensitivitas serta membuat laporan hasil.
Jalankan sel berurutan; **Restart Kernel and Run All** dapat digunakan untuk
menghindari variabel lama saat parameter diubah.

### Hasil Contoh yang Diharapkan

| Hari | Jalur terbaik | Probabilitas gabungan |
|---:|---|---:|
| 1 | Cerah | 0.35 |
| 5 | Cerah, Berawan, Hujan, Hujan, Berawan | 0.00046305 |
| 10 | Cerah, Berawan, Hujan, Hujan, Berawan, Berawan, Berawan, Hujan, Berawan, Cerah | 7.3513818e-08 |

Nilai tersebut berlaku untuk dataset dan parameter bawaan. Mengubah parameter
dapat mengubah jalur. Nilai probabilitas dari panjang urutan berbeda tidak
boleh ditafsirkan sebagai perbandingan akurasi.

## Eksperimen dan Keluaran

- Pembanding Viterbi versus enumerasi: `T = [1, 2, 4, 5, 6, 8, 10]`.
- Viterbi untuk urutan panjang: `T = [20, 100, 500, 1000, 5000]`.
- Sepuluh pengulangan setiap konfigurasi: 19 konfigurasi waktu menghasilkan
	190 sampel batch. Satu sampel adalah waktu batch dibagi jumlah panggilan.
- Dua warm-up, kalibrasi batch sekitar 10 ms, maksimum 1000 panggilan per
	batch, timer `perf_counter_ns`, dan seed urutan `20261011`.
- Sensitivitas pada `T = 500`: alpha mengubah persistensi transisi dan beta
	mengaburkan emisi menuju distribusi seragam. Nilai masing-masing parameter
	adalah `[0, 0.25, 0.5, 0.75, 1]`, diuji satu per satu dengan parameter lain
	nol dan peluang awal tetap.
- Sepuluh konfigurasi sensitivitas menghasilkan 100 sampel, sehingga total
	bawaan adalah 290 sampel. Grafik menunjukkan rata-rata dan SD sampel,
	bukan interval kepercayaan.

Menjalankan dua sel terakhir otomatis membuat subfolder
`output_eksperimen_cuaca/` di folder notebook, berisi CSV mentah/ringkasan,
kurva teori, jalur sensitivitas, tiga gambar PNG, metadata lingkungan, dan
laporan `hasil_eksperimen.md`. Subfolder ini adalah hasil runtime, bukan
berkas keempat yang harus diunduh atau disiapkan terlebih dahulu.

Waktu bergantung pada komputer dan keadaan sistem, sehingga tidak harus
sama dengan pengukuran sebelumnya. Menjalankan ulang sel eksperimen akan
menimpa keluaran dalam subfolder tersebut, tetapi tidak mengubah JSON.
Simpan hasil yang ingin dipertahankan sebelum mengulangi pengukuran.

## Pemecahan Masalah

- `contoh.json tidak ditemukan`: jalankan Jupyter dari folder notebook dan
	pastikan JSON belum dipindahkan atau diganti namanya.
- `ModuleNotFoundError`: ulangi pemasangan dependensi menggunakan interpreter
	yang sama dengan kernel notebook.
- `NameError`: jalankan sel dari awal karena sel eksperimen memakai fungsi
	dan variabel yang didefinisikan sebelumnya.
- Panel HTML tidak tampil: jalankan kembali sel visualisasi di JupyterLab;
	tampilan pratinjau GitHub tidak menjalankan notebook.
- `AssertionError` setelah mengubah data: periksa normalisasi matriks dan
	konsistensi simbol; jangan menghapus validasi hanya agar eksekusi lanjut.
- Pengukuran terasa lama: jalankan enam sel pertama untuk demonstrasi saja.
	Jangan menaikkan batas enumerasi karena jumlah lintasan tumbuh eksponensial.

## Batas Interpretasi

Model hanya contoh pembelajaran dengan satu pola sintetis, tiga keadaan,
dan tiga simbol observasi. Tidak tersedia label cuaca acuan sehingga tidak
dilaporkan akurasi, generalisasi, atau kemampuan prakiraan cuaca nyata.
Perubahan label pada sensitivitas dibandingkan terhadap baseline model,
bukan terhadap kebenaran cuaca.