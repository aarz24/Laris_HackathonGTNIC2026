# Laris

**Catat cukup ngomong. Stok aman. Pelanggan balik lagi.**

Laris adalah workspace operasional untuk UMKM F&B Indonesia. Satu alur menghubungkan kasir, voice-to-cart Bahasa Indonesia, stok berbasis resep, pembelian, pelanggan, laporan keuangan, dan asisten AI dalam satu pengalaman yang bisa dicoba langsung.

Repository hackathon: [aarz24/Laris_HackathonGTNIC2026](https://github.com/aarz24/Laris_HackathonGTNIC2026)

## Mulai Cepat

Node.js **22.18+** diperlukan untuk menjalankan script TypeScript native.

```bash
npm install
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000). Tanpa environment variable pun aplikasi langsung berjalan dalam **mode demo lokal** dengan data Kopi Senja yang tersimpan di browser.

## Alur Demo Untuk Juri

Golden path ini menunjukkan fitur utama dalam sekitar 3 menit:

1. Buka **Kasir** lalu klik **Catat pakai suara**.
2. Masukkan contoh: `dua es kopsu less sugar, satu croissant, bayar QRIS`.
3. Periksa hasil parsing, konfirmasi ke keranjang, lalu simulasikan pembayaran.
4. Buka **Stok bahan** untuk melihat pengurangan bahan sesuai resep.
5. Buka **Pembelian**, catat pembelian bahan, dan lihat ledger stok bertambah.
6. Buka **Tanya Laris** dan coba: `Stok apa yang perlu dibeli?` atau `Berapa untung hari ini?`.
7. Buka **Keuangan** untuk laba rugi sederhana dan ekspor CSV.

Semua pembayaran pada demo adalah simulasi. Tidak ada dana asli yang dipindahkan.

## Fitur Yang Dinilai

| Area | Implementasi | Bukti di repository |
|---|---|---|
| POS | Checkout QRIS, tunai, transfer, diskon, pajak, struk | `src/components/laris-app.tsx` |
| AI lokal + cloud | Parser Bahasa Indonesia dengan fallback deterministik dan endpoint Gemini | `src/lib/laris-data.ts`, `src/app/api/ai/` |
| Stok | Ledger bahan, resep, batas minimum, restock | `src/lib/laris-data.ts`, `supabase/migrations/0003_functions.sql` |
| Multi-tenant | Supabase Auth, membership, RLS, transaksi atomik | `supabase/migrations/0001_schema.sql`, `0002_rls.sql`, `0003_functions.sql` |
| Insight usaha | Tanya Laris, tren omzet, margin, pelanggan, kesiapan modal | `src/components/laris-app.tsx` |
| Graceful degradation | Tanpa cloud/AI, demo tetap bisa dipakai secara lokal | `src/app/page.tsx` |

## Mode Cloud Supabase (Opsional)

Mode lokal adalah jalur tercepat untuk penjurian. Untuk mengaktifkan login, database, RLS, dan AI:

1. Buat project Supabase region Singapore.
2. Salin `.env.example` menjadi `.env` dan isi nilainya.
3. Jalankan tiga migration SQL secara berurutan dari folder `supabase/migrations/`.
4. Salin `.env` ke `.env.local` bila menjalankan web app dengan konfigurasi yang sama.
5. Seed tenant demo dan akun juri:

```bash
npm run db:seed
npm run dev
```

Setelah cloud aktif, halaman login menyediakan tombol **Masuk sebagai Juri**. Kredensial tidak ditulis di repository; tombol tersebut memakai `LARIS_DEMO_EMAIL` dan `LARIS_DEMO_PASSWORD` di server.

## Environment Variable

Lihat [.env.example](.env.example). Jangan commit `.env`, `.env.local`, service-role key, atau API key.

| Variable | Wajib untuk | Keterangan |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Cloud | URL project Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` atau `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cloud | Key publik Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Seed/RLS test | Server-side saja, tidak boleh masuk browser |
| `LARIS_DEMO_EMAIL` | Judge login/seed | Email akun juri |
| `LARIS_DEMO_PASSWORD` | Judge login/seed | Password akun juri, minimal 8 karakter |
| `GOOGLE_GENERATIVE_AI_API_KEY` | AI cloud | Opsional; fallback lokal tetap tersedia |
| `LARIS_AI_MODEL_FAST` | AI cloud | Default `gemini-3.8-flash` |
| `LARIS_AI_MODEL_SMART` | AI cloud | Default `gemini-3.8-flash` |

## Quality Checks

```bash
npm run lint
npm test
npm run eval:voice
npm run build
```

`eval:voice` menjalankan benchmark 50 utterance Bahasa Indonesia dengan target exact match minimal 90%. `test:rls` membutuhkan project Supabase yang sudah di-seed dan env server lengkap.

## Struktur Penting

```text
src/app/page.tsx                 Entry point dan cloud/local fallback
src/components/laris-app.tsx    Workspace POS dan seluruh alur demo
src/lib/laris-data.ts            Domain model, seed lokal, parser suara
src/app/api/ai/                  Endpoint parse order, scan nota, Tanya Laris
src/lib/repo.ts                  Mapping snapshot Supabase ke UI
supabase/migrations/             Schema, RLS, dan transaksi atomik
scripts/                         Seed demo, evaluasi voice, dan test RLS
evals/voice.jsonl                Dataset benchmark voice-to-cart
PRD_Laris_GTNIC2026.md           Product requirements dan acceptance criteria
```

## Prinsip Produk

- **Demo tetap hidup saat layanan gagal:** mode lokal dan fallback parser menjaga golden path tetap dapat dimainkan.
- **Data usaha terisolasi:** setiap tabel tenant memiliki `business_id` dan policy RLS.
- **Transaksi dapat dipercaya:** checkout cloud menggunakan RPC atomik; harga dan stok dihitung server-side.
- **AI membantu, bukan mengambil alih:** hasil voice/scan selalu melewati konfirmasi manusia.
