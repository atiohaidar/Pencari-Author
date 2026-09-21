# Pencari Author SINTA (SINTA Author Matcher & Resolver)

Aplikasi web modern, ringan, dan sederhana (*light mode*) untuk mencari, mencocokkan kemiripan, dan mengumpulkan data profil author dari portal resmi SINTA (Science and Technology Index Kemdiktisaintek).

---

## Fitur Utama

1. **Pembersih Gelar Akademik Otomatis**:
   - Mendeteksi dan menghapus gelar depan (*Prof., Dr., Dra., Drs., Ir., dr., Ns.*, dll.) dan gelar belakang (*S.T., M.Kom., Ph.D., S.Pd., M.Si.*, dll.) agar pencarian SINTA akurat.
   - Nama asli tetap tersimpan di tabel hasil dan file CSV.

2. **Pencari & Perata Derajat Kemiripan (Fuzzy Matching)**:
   - Menghitung persentase kemiripan nama input vs nama kandidat yang ditemukan di SINTA.
   - Mengurutkan kandidat secara otomatis dari yang paling mirip.

3. **Resolusi Kandidat Interaktif (Review Manual)**:
   - Jika ditemukan lebih dari satu kandidat (atau kemiripan nama bervariasi), Anda dapat memilih sendiri author yang benar melalui kartu profil visual lengkap dengan:
     - Foto avatar
     - Nama & ID SINTA
     - Afiliasi / Kampus & Program Studi
     - SINTA Score 3Yr & Overall
     - Scopus & Scholar H-Index
     - Bidang minat / Subjects
   - Tersedia opsi *"Tidak Ada yang Benar"* jika semua kandidat bukan orang yang dimaksud.
   - Tombol cepat *"Pilih Rekomendasi Teratas untuk Semua"*.

4. **Jeda Waktu Pencarian (Anti Rate-Limit)**:
   - Dilengkapi pengaturan delay (800ms – 3000ms) untuk mencegah pemblokiran IP saat memproses banyak nama.
   - Kontrol *Jeda (Pause)* dan *Lanjutkan (Resume)* saat proses berlangsung.

5. **Ekspor CSV (Excel Compatible)**:
   - Hasil pencarian dapat diunduh ke file `.csv` dengan standar UTF-8 BOM, sehingga langsung rapi saat dibuka di Microsoft Excel.

---

## Cara Menjalankan

### Cara 1: Sekali Klik (Windows)
Cukup klik ganda file **`run.bat`**. Browser akan otomatis terbuka ke alamat `http://localhost:8000`.

### Cara 2: Lewat Terminal / PowerShell
```bash
python server.py
```
Lalu buka browser Anda ke `http://localhost:8000`.

---

## Struktur File
* `index.html` : Tampilan antarmuka web (light mode minimalis).
* `style.css` : Lembar gaya desain antarmuka, kartu kandidat, dan tabel.
* `app.js` : Logika pembersih gelar, pencocokan string, parser HTML, modal review, dan export CSV.
* `server.py` : Server lokal zero-dependency (pustaka standar Python) untuk bypass CORS browser dan AWS WAF.
* `run.bat` : Launcher Windows 1-klik.
