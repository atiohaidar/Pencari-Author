# Pencari Author SINTA & Scopus (Chrome Extension)

Ekstensi Google Chrome (Manifest V3) dengan **Dashboard Tab Penuh** bernuansa *light mode* untuk mencari, mencocokkan kemiripan, dan mengumpulkan data author dari:
1. **SINTA Kemdiktisaintek** (Portal Nasional)
2. **SCOPUS Elsevier** (Database Internasional)

> **⚡ 100% Zero-Install (Cross-Platform Windows & MacBook):**
> Tidak perlu instal Python, Node.js, atau software tambahan apa pun! Cukup gunakan browser Google Chrome atau Microsoft Edge.

---

## Fitur Utama

1. **Dua Sumber Data dalam Satu Dashboard**:
   * Tab **[ 🏛️ SINTA ]**: Mencari profil author SINTA, skor 3 tahun, total skor, Scopus H-index, Scholar H-index, WOS H-index, serta bidang keahlian.
   * Tab **[ 🔬 SCOPUS ]**: Mencari profil author Scopus, Scopus Author ID, afiliasi kampus/organisasi, kota, negara, jumlah dokumen, dan h-index Scopus.

2. **Bypass Cloudflare & Anti-Bot Scopus**:
   * Menggunakan konsep **Chrome Extension**: berjalan langsung di dalam Google Chrome asli dengan sesi browser yang valid, sehingga tidak dicegat oleh Cloudflare ataupun SSO Elsevier.

3. **Pembersih Gelar & Pemisahan Nama Cerdas**:
   * Gelar depan (*Prof, Dr, Ir, dr, Ns*) dan gelar belakang (*S.T., M.Kom., Ph.D., S.Pd.*) otomatis dibersihkan.
   * Untuk Scopus, nama otomatis dipecah menjadi **First Name** dan **Last Name** (contoh: `Dr. Tio Haidar Hanif, M.Kom.` $\rightarrow$ First: `Tio Haidar`, Last: `Hanif`).

4. **Hapus Duplikat Otomatis**:
   * Menghilangkan nama ganda/duplikat sebelum pencarian berjalan.

5. **Resolusi Kandidat Interaktif**:
   * Jika ditemukan lebih dari satu kandidat di SINTA atau Scopus, kartu profil visual akan ditampilkan untuk memilih author yang benar atau menandai *"Tidak Ada yang Benar"*.

6. **Salin Tabel & Ekspor CSV**:
   * **`📋 Salin Tabel`**: Menyalin data dalam format TSV yang langsung rapi saat di-paste (**Ctrl+V** atau **Cmd+V**) ke Microsoft Excel atau Google Sheets.
   * **`📥 Unduh CSV`**: Mengunduh file CSV dengan format standar UTF-8 BOM.

---

## Cara Memasang Ekstensi (MacBook & Windows)

Pemasangan hanya dilakukan **sekali saja** dan memakan waktu kurang dari 1 menit:

### Langkah 1: Siapkan Folder Ekstensi
- Jika Anda menerima file `.zip`, cukup klik kanan lalu **Extract / Uncompress** file zip tersebut ke folder biasa (misalnya di folder *Downloads* atau *Documents*).

### Langkah 2: Muat ke Google Chrome
1. Buka browser **Google Chrome** di MacBook atau Windows Anda.
2. Di address bar (kolom alamat), ketik: **`chrome://extensions`** lalu tekan Enter.
3. Di pojok kanan atas layar, aktifkan toggle **Developer mode** (Mode pengembang).
4. Di pojok kiri atas, klik tombol **Load unpacked** (Muat yang belum dibongkar).
5. Pilih folder ekstensi ini.
6. **Selesai!** Ekstensi **"Pencari Author SINTA & Scopus"** sudah aktif dan siap digunakan.

---

## Cara Menggunakan

1. Klik icon **Puzzle** (Ekstensi) di pojok kanan atas toolbar Google Chrome, lalu klik icon **Pencari Author SINTA & Scopus** (bisa di-pin agar selalu terlihat).
2. Tab baru dashboard pencarian akan otomatis terbuka.
3. Pilih tab sumber yang ingin dicari: **[ SINTA ]** atau **[ SCOPUS ]**.
4. Masukkan daftar nama pada kolom teks (satu nama per baris), atau klik *"Gunakan Contoh Nama"*.
5. Klik **"▶ Mulai Pencarian"**.
6. Jika ada nama dengan beberapa kandidat mirip, klik kartu kandidat yang sesuai.
7. Setelah selesai, klik **"📋 Salin Tabel"** untuk paste ke Excel / Google Sheets, atau **"📥 Unduh CSV"**.

---

## Cara Mengaktifkan GitHub Pages (Untuk Landing Page & Download Online)

1. Push repositori ini ke GitHub Anda.
2. Buka halaman repository di GitHub $\rightarrow$ klik tab **Settings**.
3. Pada menu sebelah kiri, klik **Pages**.
4. Di bagian **Build and deployment**:
   - **Source**: Pilih *Deploy from a branch*.
   - **Branch**: Pilih `main` dan folder `/ (root)`.
   - Klik **Save**.
5. Tunggu 1 menit, web panduan Anda akan online di:
   ```
   https://<username>.github.io/<nama-repo>/
   ```
6. Siapa pun (termasuk teman MacBook Anda) bisa langsung membuka link tersebut untuk membaca tutorial dan men-download file ekstensi `.zip` secara langsung!
