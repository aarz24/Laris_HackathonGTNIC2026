# Laris

**Catat cukup ngomong. Stok aman. Pelanggan balik lagi.**

Laris adalah workspace operasional untuk UMKM F&B Indonesia. Satu alur menghubungkan akun usaha, kasir, voice-to-cart Bahasa Indonesia, resep dan stok, pembelian, pelanggan, laporan keuangan, tim, dan asisten AI.

Repository hackathon: [aarz24/Laris_HackathonGTNIC2026](https://github.com/aarz24/Laris_HackathonGTNIC2026)

## Menjalankan Aplikasi

Node.js **22.18+** diperlukan untuk menjalankan script TypeScript native.

```bash
npm install
npm run dev
```

- Buka `/demo` untuk demo lokal dengan data fiktif Kopi Senja. Perubahan hanya tersimpan di browser tersebut.
- Buka `/login` untuk masuk atau membuat akun usaha cloud.
- Tanpa konfigurasi Supabase, halaman login menampilkan petunjuk setup dan akses demo; aplikasi tidak berpura-pura tersambung ke cloud.

Semua pembayaran pada demo adalah simulasi. Tidak ada dana asli yang dipindahkan.

## Fitur

| Area | Implementasi |
|---|---|
| Akun | Registrasi, konfirmasi email, login, logout, lupa dan reset password |
| Onboarding | Profil usaha F&B, jenis usaha, outlet, target harian, dan katalog awal opsional |
| POS | Checkout tunai, QRIS, transfer, diskon, pajak, struk, dan idempotensi checkout cloud |
| Katalog | Menu aktif/nonaktif, harga, resep, bahan, supplier, biaya, stok awal, dan stok opname |
| Stok | Ledger bertanda tangan, agregasi resep, pembelian, moving-average cost, dan HPP otomatis |
| Pelanggan & tim | Riwayat pelanggan, segmen RFM, membership owner/manager/kasir/dapur, dan undangan email |
| AI | Parser pesanan lokal/Gemini, Tanya Laris dengan tools data workspace, dan OCR nota |
| Keuangan | Omzet, estimasi HPP dan laba kotor, pengeluaran, target, serta ekspor CSV |

## Menyiapkan Cloud Supabase

Mode cloud diperlukan untuk akun dan data usaha persisten.

1. Buat project Supabase.
2. Salin `.env.example` menjadi `.env` dan isi URL serta publishable/anon key. Next.js dan script membaca `.env`; `.env.local` dapat dipakai untuk override lokal.
3. Isi `NEXT_PUBLIC_APP_URL` dengan origin aplikasi. Untuk lokal, gunakan `http://localhost:3000`; untuk produksi, gunakan origin HTTPS publik.
4. Terapkan seluruh migration di `supabase/migrations/` secara berurutan: `0001_schema.sql`, `0002_rls.sql`, `0003_functions.sql`, `0004_workspaces.sql`, `0005_production_hardening.sql`, `0006_storage.sql`, `0007_soft_delete_and_edit.sql` (hapus/ubah menu, bahan, pelanggan, pengeluaran, dan anggota tim), lalu `0008_configurable_tax.sql` (tarif pajak dari Pengaturan). Jangan hanya menerapkan migration terbaru pada database kosong. Migration 0007 dan 0008 aman dijalankan ulang.
5. Di Supabase Auth, atur Site URL ke origin aplikasi dan tambahkan `<origin>/auth/callback` ke redirect URLs.
6. Isi `SUPABASE_SERVICE_ROLE_KEY` hanya di environment server (seperti `.env` lokal atau variabel rahasia di platform hosting). **Key ini sangat sensitif** dan tidak pernah dikirim ke browser. Laris membutuhkannya untuk fitur administratif seperti mengundang anggota tim baru melalui email dan mengunggah gambar menu ke storage. Jika key ini tidak diisi, fitur tersebut akan menampilkan pesan error yang informatif alih-alih gagal tanpa penjelasan.
7. Jalankan aplikasi, buka `/register`, konfirmasi email, lalu selesaikan `/onboarding`. Usaha baru tidak diisi transaksi atau pelanggan fiktif.

## Keamanan & AI

- **Isolasi Data**: Laris menggunakan Supabase Row Level Security (RLS) secara ketat pada setiap tabel. Pengguna hanya dapat membaca dan menulis data milik `business_id` mereka sendiri.
- **Mutasi Terproteksi**: Semua perubahan data penting (transaksi, stok, keuangan) dilakukan melalui database functions (RPC) dengan `SECURITY DEFINER` untuk menjamin integritas data dan pengecekan peran (owner/manager/kasir).
- **Audit Log**: Setiap tindakan administratif dicatat dalam tabel audit log untuk transparansi operasional.
- **AI Authentication**: Permintaan AI mode cloud (`/api/ai/*`) wajib memiliki sesi login dan keanggotaan workspace. Mode `/demo` tidak memerlukan login, tetapi tidak pernah memanggil Gemini. Semua endpoint AI dibatasi rate limit per pengguna/IP (in-memory per instance server; gunakan Redis/Upstash bila butuh batas global lintas instance).
- **Gemini & Billable API**: Fitur AI yang menggunakan Gemini API (Tanya Laris dengan LLM, OCR Nota, Pesanan Suara) hanya aktif pada mode cloud untuk pengguna yang sudah masuk. Mode `/demo` lokal menggunakan logika berbasis aturan (rule-based) dan parser lokal agar tidak mengonsumsi kuota API secara tidak perlu.
- **Koreksi data**: Menu, bahan, pelanggan, dan pengeluaran dihapus secara *soft delete* sehingga riwayat transaksi dan ledger stok tetap utuh. Bahan yang masih dipakai resep tidak dapat dihapus.

Untuk kebutuhan demo cloud, jalankan `npm run db:seed` pada **project pengembangan**, bukan database produksi. Jika `LARIS_DEMO_EMAIL` dan `LARIS_DEMO_PASSWORD` diisi, halaman login menampilkan tombol **Masuk sebagai Juri** saat development. Pada build produksi tombol ini tersembunyi kecuali `LARIS_ALLOW_DEMO_LOGIN=true`; aktifkan hanya pada deployment khusus penjurian, bukan deployment untuk pelanggan nyata.

## Perilaku AI dan Offline

- Tanpa Gemini, pesanan teks tetap diproses parser deterministik menggunakan katalog workspace yang aktif.
- Tanya Laris tetap dapat menjawab ringkasan berbasis aturan dari data workspace yang sama.
- OCR nota cloud memerlukan `GOOGLE_GENERATIVE_AI_API_KEY`; tanpa key, gunakan pembelian manual. Cloud tidak pernah mengganti hasil OCR dengan nota fiktif.
- Simulasi OCR hanya tersedia di `/demo` dan ditandai jelas sebagai simulasi.
- Kegagalan layanan cloud tidak pernah diam-diam mengganti data usaha dengan Kopi Senja.

## Environment Variables

Lihat [.env.example](.env.example). Jangan commit `.env`, `.env.local`, service-role key, atau API key.

| Variable | Wajib untuk | Keterangan |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Cloud | URL project Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` atau `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cloud | Key publik Supabase |
| `NEXT_PUBLIC_APP_URL` | Auth cloud | Origin aplikasi untuk redirect konfirmasi dan recovery |
| `SUPABASE_SERVICE_ROLE_KEY` | Undangan anggota baru, seed, RLS test | Server-side saja; tidak boleh masuk browser |
| `LARIS_DEMO_EMAIL` | Judge login/seed opsional | Email akun demo cloud |
| `LARIS_DEMO_PASSWORD` | Judge login/seed opsional | Password akun demo cloud, minimal 8 karakter |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini dan OCR cloud | Opsional untuk fitur non-OCR |
| `LARIS_AI_MODEL_FAST` | AI | Default `gemini-2.5-flash` |
| `LARIS_AI_MODEL_SMART` | AI | Default `gemini-2.5-flash` |

## Verifikasi

```bash
npx tsc --noEmit
npm run lint
npm test
npm run eval:voice
npm run build
```

`npm test` mencakup ledger, checkout, validasi, katalog custom, moving-average cost, HPP, parser, dan keamanan ekspor CSV. `eval:voice` menjalankan 50 utterance Bahasa Indonesia dengan target exact match minimal 90%.

`npm run test:rls` adalah integrasi terhadap Supabase dan membuat akun/tenant uji. Jalankan hanya pada project pengembangan yang sudah menerima semua migration dan seed, dengan env server lengkap.

### Checklist Sebelum Produksi

- Terapkan migration pada staging terlebih dahulu dan jalankan test RLS serta alur registrasi–onboarding–checkout.
- Verifikasi bahwa setiap tenant hanya melihat datanya dan setiap peran hanya dapat melakukan aksi yang diizinkan.
- Uji konfirmasi email, recovery, undangan tim, stok opname, pembelian, dan kegagalan AI menggunakan akun nyata pada staging.
- Gunakan HTTPS, nonaktifkan kredensial demo, batasi service-role key ke server, dan siapkan backup database.
- Jalankan seluruh pemeriksaan di atas pada commit yang akan dirilis.

## Struktur Penting

```text
src/app/page.tsx                 Workspace cloud terautentikasi
src/app/demo/page.tsx            Demo lokal yang eksplisit
src/components/laris-app.tsx    Workspace POS dan alur operasional
src/lib/laris-data.ts            Domain model, seed lokal, dan parser
src/app/api/ai/                  Endpoint parse order, scan nota, dan Tanya Laris
src/lib/repo.ts                  Mapping snapshot Supabase per workspace
supabase/migrations/             Schema, RLS, dan transaksi atomik
scripts/                         Seed demo, evaluasi voice, dan test RLS
evals/voice.jsonl                Dataset benchmark voice-to-cart
PRD_Laris_GTNIC2026.md           Product requirements dan acceptance criteria
```

## Prinsip Produk

- **Data usaha terisolasi:** setiap tabel tenant memiliki `business_id` dan policy RLS; RPC memeriksa membership dan peran.
- **Transaksi dapat dipercaya:** checkout cloud menggunakan RPC atomik; harga, penerimaan kas, dan stok dihitung server-side.
- **Demo tidak menyamar sebagai cloud:** mode lokal selalu eksplisit dan tidak menjadi fallback setelah kegagalan cloud.
- **AI membantu, bukan mengambil alih:** hasil voice dan scan melewati konfirmasi manusia sebelum mengubah ledger.
