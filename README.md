# Pencari Author SINTA & Scopus (Chrome Extension & Dashboard)

Ekstensi Google Chrome (Manifest V3) dengan **Dashboard Tab Penuh** bernuansa *light mode* untuk mencari, mencocokkan kemiripan, dan mengumpulkan data author dari:
1. **SINTA Kemdiktisaintek** (Portal Nasional)
2. **SCOPUS Elsevier** (Database Internasional)

---

## Fitur Utama

1. **Dua Sumber Data dalam Satu Dashboard**:
   * Tab **[ 🏛️ SINTA ]**: Mencari profil author SINTA, skor 3 tahun, total skor, Scopus H-index, Scholar H-index, WOS H-index, serta bidang keahlian.
   * Tab **[ 🔬 SCOPUS ]**: Mencari profil author Scopus, Scopus Author ID, afiliasi kampus/organisasi, kota, negara, jumlah dokumen, dan h-index Scopus.

2. **Bypass Cloudflare & Anti-Bot Scopus**:
   * Menggunakan konsep **Chrome Extension**: berjalan langsung di dalam Google Chrome asli dengan sesi login yang valid, sehingga tidak dicegat oleh Cloudflare ataupun SSO Elsevier.

3. **Pembersih Gelar & Pemisahan Nama Cerdas**:
   * Gelar depan (*Prof, Dr, Ir, dr, Ns*) dan gelar belakang (*S.T., M.Kom., Ph.D., S.Pd.*) otomatis dibersihkan.
   * Untuk Scopus, nama otomatis dipecah menjadi **First Name** dan **Last Name** (contoh: `Dr. Tio Haidar Hanif, M.Kom.` $\rightarrow$ First: `Tio Haidar`, Last: `Hanif`).

4. **Hapus Duplikat Otomatis**:
   * Menghilangkan nama ganda/duplikat sebelum pencarian berjalan.

5. **Resolusi Kandidat Interaktif**:
   * Jika ditemukan lebih dari satu kandidat di SINTA atau Scopus, kartu profil visual akan ditampilkan untuk memilih author yang benar atau menandai *"Tidak Ada yang Benar"*.

6. **Salin Tabel & Ekspor CSV**:
   * **`📋 Salin Tabel`**: Menyalin data dalam format TSV yang langsung rapi saat di-paste (**Ctrl+V**) ke Microsoft Excel atau Google Sheets.
   * **`📥 Unduh CSV`**: Mengunduh file CSV dengan format standar UTF-8 BOM.

---

## Cara Memasang Ekstensi di Google Chrome (Hanya 1 Menit)

1. Buka browser **Google Chrome**.
2. Masuk ke alamat: **`chrome://extensions`** (ketik di address bar).
3. Aktifkan toggle **Developer mode** (di pojok kanan atas).
4. Klik tombol **Load unpacked** (di pojok kiri atas).
5. Pilih folder proyek ini:
   ```
   c:\Users\Tio Haidar Hanif\Kode\Pencari Author Sinta
   ```
6. Ekstensi **"Pencari Author SINTA & Scopus"** siap digunakan!

---

## Cara Menggunakan

1. Klik icon ekstensi di toolbar Google Chrome (atau buka file `index.html`).
2. Pilih tab yang ingin dicari: **[ SINTA ]** atau **[ SCOPUS ]**.
3. Masukkan daftar nama (atau klik *"Gunakan Contoh Nama"*).
4. Klik **"▶ Mulai Pencarian"**.
5. Jika ada kandidat yang perlu konfirmasi, tentukan kandidat yang sesuai.
6. Klik **"📋 Salin Tabel"** atau **"📥 Unduh CSV"** untuk mengambil hasilnya.
