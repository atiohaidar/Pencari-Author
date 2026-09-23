# Pencari Author SINTA, GARUDA & Scopus (Chrome Extension)

Ekstensi Google Chrome (Manifest V3) dengan dashboard tab penuh untuk mencari, mencocokkan kemiripan nama, dan mengumpulkan data profil author dari:
1. **SINTA Kemdiktisaintek** (Pangkalan Data Author & Kinerja Nasional)
2. **GARUDA Kemdiktisaintek** (Garba Rujukan Digital Nasional)
3. **SCOPUS Elsevier** (Pangkalan Data Publikasi & Sitasi Internasional)

> **Zero-Install (Cross-Platform Windows & macOS):**
> Tidak perlu instal Python, Node.js, atau pustaka tambahan apa pun. Cukup gunakan browser Google Chrome atau Microsoft Edge.

---

## Fitur Utama

1. **Mode Pencarian Gabungan (All-in-One: SINTA + GARUDA + SCOPUS)**:
   * **1 Nama = 1 Baris Lengkap**: Memproses pencarian ke SINTA, GARUDA, dan SCOPUS secara bersamaan dalam satu baris tabel.
   * **Pemilihan Kandidat Mandiri per Sumber**: Jika ada kandidat nama mirip di SINTA, GARUDA, atau SCOPUS, masing-masing kolom memiliki tombol pilih/ganti tersendiri yang tidak saling mengganggu.
   * **Ekspor Gabungan Sekali Klik**: Sekali unduh CSV atau salin tabel, seluruh data ketiga basis data langsung tertata rapi dalam satu baris per orang di Microsoft Excel / Google Sheets.

2. **Reverse Lookup via Scopus Author ID (Fitur Baru)**:
   * Masukkan daftar **Scopus Author ID** (misal: `60611357400`) atau tautan URL profil Scopus.
   * Ekstensi akan otomatis membuka profil author di Scopus, membaca nama lengkap asli (mengonversi format `LastName, FirstName` menjadi `FirstName LastName`), afiliasi kampus, jumlah dokumen, dan h-index.
   * Ekstensi kemudian **langsung mencari profil author tersebut di SINTA dan GARUDA secara otomatis**!
   * Hasilnya dipadukan dalam 1 baris gabungan lengkap (SINTA + GARUDA + SCOPUS).

3. **Tab Sumber Mandiri (SINTA Saja / GARUDA Saja / SCOPUS Saja)**:
   * Tetap menyediakan tab pencarian satuan jika hanya ingin mencari ke salah satu basis data secara cepat.

4. **Tanpa Masalah Pemblokiran & Anti-Bot**:
   * Berjalan langsung di dalam sesi peramban Google Chrome asli, sehingga permintaan data diizinkan secara sah tanpa terhalang Cloudflare atau CORS.

5. **Pembersih Gelar & Pemisahan Nama Otomatis**:
   * Gelar depan (*Prof, Dr, Ir, dr, Ns*) dan belakang (*S.T., M.Kom., Ph.D., S.Pd.*) dibersihkan otomatis agar query pencarian akurat.
   * Untuk Scopus, nama otomatis dipisahkan menjadi *First Name* dan *Last Name*.

6. **Hapus Duplikat Otomatis**:
   * Menghilangkan entri nama atau Scopus ID ganda sebelum pencarian diproses.

7. **Salin Tabel & Ekspor CSV**:
   * **Salin Tabel**: Menyalin data tabel berformat TSV yang langsung rapi saat ditempel (Ctrl+V / Cmd+V) ke Microsoft Excel atau Google Sheets.
   * **Unduh CSV**: Mengunduh file berformat UTF-8 BOM yang langsung terbaca dengan benar di Microsoft Excel.

---

## Cara Memasang Ekstensi (macOS & Windows)

Pemasangan hanya dilakukan sekali:

### Langkah 1: Unduh & Ekstrak File
- Unduh file ZIP dari GitHub: `https://github.com/atiohaidar/Pencari-Author/archive/refs/heads/main.zip`
- Ekstrak file ZIP ke folder lokal Anda.

### Langkah 2: Muat ke Google Chrome
1. Buka browser **Google Chrome** (atau Microsoft Edge).
2. Di bilah alamat (address bar), ketik: `chrome://extensions` lalu tekan Enter.
3. Di sudut kanan atas, aktifkan sakelar **Developer mode** (Mode pengembang).
4. Di sudut kiri atas, klik tombol **Load unpacked** (Muat yang belum dibongkar).
5. Pilih folder hasil ekstrak (`Pencari-Author-main`).
6. Ekstensi sudah aktif dan siap digunakan.

---

## Cara Menggunakan

1. Klik ikon **Extensions** pada toolbar Google Chrome, lalu klik **Pencari Author SINTA, GARUDA & Scopus** (dapat di-pin agar selalu terlihat).
2. Tab dashboard pencarian akan terbuka secara otomatis.
3. Pilih metode input data:
   * **Berdasarkan Nama Author**: Masukkan daftar nama $\rightarrow$ cari ke SINTA, GARUDA, dan SCOPUS.
   * **Reverse via Scopus ID**: Masukkan Scopus ID atau URL profil $\rightarrow$ ambil data Scopus $\rightarrow$ otomatis cari ke SINTA & GARUDA.
4. Klik tombol **Mulai Pencarian** / **Mulai Reverse Lookup**.
5. Jika terdapat kandidat dengan kemiripan bertingkat, pilih atau konfirmasi kartu profil yang sesuai.
6. Setelah selesai, klik **Salin Tabel** untuk paste ke Excel / Google Sheets, atau klik **Unduh CSV**.

---

## Akses Panduan Online (GitHub Pages)

Panduan instalasi dan link download online dapat diakses langsung melalui:
```
https://atiohaidar.github.io/Pencari-Author/
```
