# 🚀 Work Tracker & Jira Cycle Time App (`apicahayatracker`)

Aplikasi pelacak jam kerja otomatis (8 Jam Harian) dan analitik metrik **Jira Sprint & Cycle Time** berbasis web, terintegrasi langsung dengan **Git Repositories Lokal**, **Google Calendar / iCal**, dan **Jira Cloud API**.

Didesain khusus untuk software engineer dan engineering lead untuk melacak produktivitas kerja secara objektif, otomatis, dan akurat tanpa input manual yang melelahkan.

---

## ✨ Fitur Utama

1. **⏱️ Jira Sprint & Cycle Time Breakdown (Dev In Progress ➔ QA ➔ Done):**
   - Menghitung durasi riil **Fase 1 (Coding)**, **Review Wait Time (Waktu Tunggu Reviewer)**, **Fase 2 (Prep QA / Fix)**, dan **QA Testing** langsung dari riwayat pergeseran tiket (*Jira Changelog*).
   - **Working Hours Calendar Engine:** Otomatis mengecualikan weekend (Sabtu & Minggu), jam non-kerja malam hari (18:00 - 09:00), dan jam istirahat siang (12:00 - 13:00) agar angka *cycle time* realistis dan tidak meledak.
   - Dilengkapi tombol **"▼ Detail & History"** untuk melihat bukti kronologis menit dan nama penggeser status tiket.
   - **One-Click Export:** Tombol *"Copy Rekap Jira untuk Lead"* untuk menyalin tabel rekap sprint dalam format tabel Markdown rapi.

2. **🤖 Otomatisasi Git Activity & Reflog Session Engine:**
   - Memindai seluruh repositori Git lokal di folder `~/documents`.
   - Melacak sesi kerja aktif developer berdasarkan perpindahan branch (*git reflog checkout*) dan riwayat commit.
   - **Time Interval Merging:** Menggabungkan commit-commit dalam sesi yang sama untuk mencegah duplikasi durasi jam kerja (*no double counting*).
   - **Deleted Branch Recovery:** Mampu mengenali branch dan nomor tiket Jira meskipun branch aslinya sudah di-merge dan dihapus dari Git.

3. **📅 Kalender Meeting & Deduplikasi Cerdas:**
   - Sinkronisasi jadwal meeting dari file iCal / Calendar.
   - Otomatis menghitung jam **Project Standby** ($8.0\text{ jam} - (\text{Dev} + \text{Meeting})$) agar total log harian pas 8.0 jam.
   - Penggabungan otomatis tiket Jira dan sesi Git lokal tanpa item ganda.

4. **📊 Visual Analytics Dashboard:**
   - Grafik distribusi rasio alokasi waktu kerja: *Development*, *Meetings*, dan *Standby*.

---

## 🚀 Cara Menjalankan di Laptop Masing-Masing

### 1. Prasyarat
- **Node.js** (versi 18 ke atas)
- **Git** terpasang di komputer

### 2. Clone & Install Dependencies
```bash
git clone <URL_REPOSITORY_INI>
cd work-tracker-app
npm install
```

### 3. Jalankan Aplikasi
Jalankan backend server dan frontend UI:

- **Terminal 1 (Backend Server & Git API Scanner):**
  ```bash
  npm run server
  ```
- **Terminal 2 (Frontend Client Vite):**
  ```bash
  npm run dev
  ```

Buka browser di: **`http://localhost:5173`**

---

## ⚙️ Menghubungkan Jira (Opsional / Sekali Konfigurasi)

1. Buka tab **"Jira Integration"** di sidebar kanan atau tab **"⏱️ Jira Cycle Time (Sprint)"**.
2. Masukkan URL Jira Domain (misal: `https://perusahaan.atlassian.net`), Email, dan Jira API Token.
   *(API Token dapat dibuat gratis di: [Atlassian API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens))*
3. Token tersimpan aman di `localStorage` browser Anda. Klik **"Refresh Jira"** untuk memuat tiket sprint aktif dan menghitung cycle time secara instan!

---

## 📄 Lisensi & Kontribusi
Dibuat untuk kebutuhan produktivitas internal tim engineering. Silakan lakukan fork, kontribusi, atau penyesuaian sesuai workflow tim Anda! 🚀
