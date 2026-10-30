"""Isi proposal GTNIC 2026 untuk karya Laris.

Seluruh klaim di bawah ini mengacu pada kode, migration, dan hasil pemeriksaan
yang benar-benar ada di repositori. Bagian yang belum terverifikasi ditandai
sebagai batasan atau placeholder, bukan ditulis sebagai capaian.
"""

META = {
    "title": "LARIS — Workspace Operasional Terpadu untuk UMKM Food & Beverage",
    "competition": "GARDA TECH NATIONAL INNOVATION COMPETITION (GTNIC) 2026",
    "category": "Kategori Web Development",
    "subtheme": "Subtema: Accelerating Digital Transformation for Business and SMEs",
    "team": "[NAMA TIM]",
    "members": [
        "[Nama Anggota 1] — [Instansi/Perguruan Tinggi] — [NIM/NIS]",
        "[Nama Anggota 2] — [Instansi/Perguruan Tinggi] — [NIM/NIS]",
        "[Nama Anggota 3] — [Instansi/Perguruan Tinggi] — [NIM/NIS]",
    ],
    "links": [
        ("Website live", "[ISI TAUTAN HTTPS PUBLIK SETELAH DEPLOY]"),
        ("Repositori kode", "https://github.com/aarz24/Laris_HackathonGTNIC2026"),
        ("Video demo", "[ISI TAUTAN YOUTUBE/DRIVE AKSES PUBLIK]"),
    ],
    "logo": "gtnic-logo.png",
    "footer_note": "Dokumen kerja — lengkapi placeholder sebelum pengumpulan.",
}

BLOCKS = [
    {"t": "h1", "x": "Ringkasan Eksekutif"},
    {"t": "p", "x": (
        "Laris menghubungkan kasir, resep, stok, pelanggan, dan laporan dalam satu "
        "ruang kerja untuk UMKM F&B. Satu penjualan yang dikonfirmasi mengurangi "
        "bahan sesuai resep dan menyimpan harga serta HPP saat transaksi. Bantuan "
        "pesanan berbahasa Indonesia bersifat opsional; pengguna tetap memegang "
        "kendali sebelum data berubah. Prototipe menyediakan demo lokal serta mode "
        "cloud berbasis akun. Sasaran berikutnya adalah pilot terukur, bukan klaim "
        "efisiensi yang belum dibuktikan."
    )},
    {"t": "h1", "x": "1. Latar Belakang Masalah Operasional UMKM F&B"},
    {"t": "p", "x": (
        "Usaha food and beverage (F&B) skala mikro dan kecil menjalankan beberapa "
        "pencatatan yang sebenarnya berasal dari satu peristiwa yang sama. Saat sebuah "
        "pesanan dibayar, pemilik perlu mengetahui uang yang diterima, bahan baku yang "
        "terpakai, dan sisa stok untuk layanan berikutnya. Pada praktik manual, ketiga "
        "informasi itu biasanya tersimpan di tempat berbeda: catatan pesanan di meja "
        "kasir, lembar stok di dapur, dan rekap pemasukan pada akhir hari."
    )},
    {"t": "p", "x": (
        "Pemisahan tersebut menimbulkan tiga persoalan operasional. Pertama, satuan "
        "produk jual dan bahan baku tidak sama. Satu gelas kopi susu tidak langsung "
        "menjelaskan berapa mililiter susu dan gram biji kopi yang berkurang, sehingga "
        "pengurangan stok mudah terlewat bila tidak ada resep yang menghubungkannya. "
        "Kedua, pekerjaan rekap berulang: peristiwa yang sama dicatat lebih dari sekali, "
        "dan selisih antar catatan baru terlihat ketika stok fisik sudah tidak cocok. "
        "Ketiga, harga beli bahan berubah dari waktu ke waktu, sehingga omzet tidak "
        "cukup untuk menilai laba apabila harga pokok penjualan (HPP) saat transaksi "
        "tidak tersimpan."
    )},
    {"t": "p", "x": (
        "BPS mencatat 4,85 juta usaha penyediaan makanan dan minuman pada 2023, "
        "dengan 9,80 juta pekerja [1]. Angka ini menunjukkan skala sektor, bukan "
        "jumlah calon pelanggan Laris atau bukti bahwa semua usaha mengalami masalah "
        "yang sama. Masalah pencatatan di atas merupakan hipotesis desain yang masih "
        "perlu divalidasi melalui wawancara dan pilot."
    )},

    {"t": "h1", "x": "2. Tujuan, Manfaat, dan Solusi Teknologi"},
    {"t": "h2", "x": "2.1 Tujuan"},
    {"t": "n", "x": (
        "Menyatukan pencatatan penjualan, konsumsi bahan baku, pembelian, pelanggan, "
        "dan ringkasan keuangan dalam satu alur kerja."
    )},
    {"t": "n", "x": (
        "Menjaga ketertelusuran perubahan stok dan biaya melalui ledger bertanda serta "
        "validasi sebelum data tersimpan."
    )},
    {"t": "n", "x": (
        "Menyediakan antarmuka berbahasa Indonesia dengan bantuan pencatatan opsional, "
        "tanpa menjadikan AI sebagai prasyarat operasional."
    )},
    {"t": "h2", "x": "2.2 Solusi teknologi yang ditawarkan"},
    {"t": "p", "x": (
        "Satu checkout yang dikonfirmasi menjadi sumber beberapa catatan sekaligus: "
        "pesanan, metode pembayaran, pengurangan bahan sesuai resep, pembaruan "
        "pelanggan bila nomor telepon diisi, serta catatan audit. Pembelian bahan "
        "menambah stok dan memperbarui biaya rata-rata bergerak (moving average), "
        "sehingga HPP menu mengikuti harga beli terbaru. Laporan penjualan dibaca dari "
        "arsip harga dan biaya saat transaksi, bukan dari katalog yang bisa berubah."
    )},
    {"t": "h2", "x": "2.3 Manfaat yang diharapkan"},
    {"t": "b", "x": (
        "Bagi pemilik: ringkasan penjualan, HPP historis, laba kotor, pengeluaran, dan "
        "ekspor CSV dari data yang sama dengan operasional harian."
    )},
    {"t": "b", "x": (
        "Bagi kasir: pencatatan pesanan yang terarah, validasi uang tunai, dan struk "
        "yang menautkan transaksi ke stok serta pelanggan terkait."
    )},
    {"t": "b", "x": (
        "Bagi tim dapur dan manajer: visibilitas sisa stok dan batas pesan ulang untuk "
        "menentukan prioritas belanja."
    )},
    {"t": "p", "x": (
        "Pilot direncanakan pada 2–3 usaha selama dua minggu: bandingkan waktu "
        "pencatatan untuk pesanan yang sama, jumlah koreksi per 100 transaksi, dan "
        "selisih stok fisik per bahan sebelum serta sesudah penggunaan. Target awal "
        "adalah penurunan median waktu pencatatan 20% tanpa kenaikan kesalahan. "
        "Target ini belum merupakan hasil uji; biaya layanan dan kesediaan membayar "
        "juga akan dievaluasi sebelum menetapkan model berlangganan."
    )},

    {"t": "h1", "x": "3. Target Pengguna dan Pasar Aplikasi"},
    {"t": "p", "x": (
        "Sasaran awal adalah kedai kopi, bakery, warung makan, dan restoran independen "
        "dengan jumlah menu terkelola dan satu outlet utama. Aplikasi mengenali jenis "
        "usaha coffee, restaurant, bakery, bar, dan other pada proses onboarding."
    )},
    {"t": "p", "x": (
        "Peran pengguna di dalam satu workspace dibedakan menjadi empat. Owner mengatur "
        "profil usaha, tarif pajak, target harian, dan keanggotaan tim. Manager "
        "mengelola menu, resep, bahan, serta harga. Kasir mencatat penjualan, "
        "pembelian, pengeluaran, dan data pelanggan sesuai izin. Peran dapur memperoleh "
        "akses lihat saja pada antarmuka saat ini. Pembedaan peran ini diberlakukan di "
        "lapisan basis data, bukan hanya dengan menyembunyikan tombol."
    )},
    {"t": "p", "x": (
        "Pasar yang lebih luas, seperti jaringan multi-outlet dan integrasi pembayaran "
        "pihak ketiga, berada di luar cakupan versi ini dan dicantumkan pada rencana "
        "pengembangan lanjutan."
    )},

    {"t": "h1", "x": "4. Arsitektur Sistem"},
    {"t": "img", "f": "architecture.png", "w": 14.5, "cap": (
        "Gambar 1. Arsitektur Laris. Jalur demo lokal dan jalur cloud terautentikasi "
        "dipisahkan; bantuan AI tidak menulis ledger transaksi secara langsung."
    )},
    {"t": "p", "x": (
        "Laris adalah aplikasi modular di dalam satu deployment Next.js, bukan sistem "
        "microservice. Halaman cloud memeriksa sesi autentikasi lalu memuat snapshot "
        "workspace di sisi server. Perubahan data dijalankan melalui Server Actions "
        "yang memvalidasi masukan dengan skema Zod, kemudian memanggil fungsi "
        "PostgreSQL untuk operasi yang menyentuh beberapa tabel sekaligus."
    )},
    {"t": "p", "x": (
        "Supabase menyediakan Auth, PostgreSQL dengan Row Level Security, fungsi RPC, "
        "serta storage gambar menu. Endpoint AI berada di sisi server pada "
        "/api/ai/parse-order, /api/ai/scan-receipt, dan /api/ai/ask sehingga kunci API "
        "tidak pernah dikirim ke browser. Mode /demo berjalan dengan data fiktif di "
        "penyimpanan browser dan parser deterministik tanpa memanggil Gemini; kegagalan "
        "layanan cloud tidak pernah diganti secara diam-diam dengan data demo."
    )},

    {"t": "h1", "x": "5. Skema Basis Data"},
    {"t": "p", "x": (
        "Diagram berikut menampilkan kolom terpilih, bukan seluruh kolom tabel. PK "
        "menandakan primary key dan FK menandakan foreign key. Tabel tenant membawa "
        "kolom business_id; relasi business yang berulang tidak digambar ulang agar "
        "diagram tetap terbaca. Notasi 1:N berarti satu baris induk dapat memiliki "
        "beberapa baris anak."
    )},
    {"t": "img", "f": "erd-commerce.png", "w": 14.5, "cap": (
        "Gambar 2. Relasi inti penjualan, menu, resep, dan bahan baku."
    )},
    {"t": "p", "x": (
        "Tabel order_item menyimpan arsip product_code, name, unit_price, unit_cost, "
        "quantity, dan note pada saat penjualan terjadi, sehingga struk dan laporan "
        "lama tetap benar meskipun menu diubah atau dihapus. Tabel recipe_line "
        "menghubungkan varian produk ke bahan baku dalam satuan dasar. Nilai uang "
        "memakai BIGINT rupiah, sedangkan kuantitas dan biaya per satuan memakai tipe "
        "NUMERIC agar pembulatan tidak menghilangkan pecahan biaya bahan."
    )},
    {"t": "img", "f": "erd-operations.png", "w": 14.5, "cap": (
        "Gambar 3. Relasi identitas, pembelian, dan ledger stok."
    )},
    {"t": "p", "x": (
        "Tabel membership menautkan auth.users Supabase ke sebuah business beserta "
        "perannya. Outlet menjadi cakupan penjualan, pembelian, dan pergerakan stok. "
        "Stok berjalan sebagai ledger: stock_movement menyimpan qty_delta bertanda "
        "untuk tipe opening, sale, purchase, adjustment, waste, dan opname, sehingga "
        "stok saat ini adalah penjumlahan pergerakan. Kolom ref_id merupakan rujukan "
        "logis ke dokumen sumber, bukan foreign key yang dideklarasikan."
    )},
    {"t": "p", "x": (
        "Expense menyimpan pengeluaran dan audit_log menyimpan jejak tindakan. "
        "Ai_event dan holiday_calendar tidak ditampilkan pada diagram. Tabel kalender "
        "merupakan data referensi, bukan bukti fitur peramalan telah tersedia."
    )},

    {"t": "h1", "x": "6. Teknologi yang Digunakan"},
    {"t": "table", "head": ["Teknologi", "Peran dan alasan pemilihan"], "widths": [5, 9], "rows": [
        ["Next.js 15.5.28; React 19.1.0", "Antarmuka dan server dalam satu repositori; mengurangi koordinasi antar layanan."],
        ["TypeScript 5; Zod 4", "Pemeriksaan tipe saat pengembangan serta validasi masukan saat runtime."],
        ["Tailwind CSS 4; lucide-react", "Token visual bersama, responsivitas, dan ikon konsisten."],
        ["Supabase Auth; PostgreSQL", "Sesi, relasi data, RLS per usaha, transaksi RPC atomik, serta storage terkelola."],
        ["AI SDK 7; Google SDK 4", "Integrasi Gemini di server; bantuan opsional dengan validasi dan batas waktu."],
        ["node --test; ESLint; tsc", "Regresi logika, evaluasi parser, kualitas kode, dan tipe."],
    ], "cap": "Tabel 1. Teknologi dan pertimbangan teknis."},
    {"t": "p", "x": (
        "Trade-off: Supabase mengurangi pekerjaan infrastruktur tetapi memerlukan "
        "koneksi cloud; demo lokal bukan sinkronisasi offline. Struktur monolit "
        "memudahkan deployment awal, tetapi komponen workspace perlu dipisah saat "
        "cakupan tumbuh. Atribusi pustaka tercantum pada bagian 13."
    )},

    {"t": "h1", "x": "7. Fitur Utama dan Keunikan"},
    {"t": "h2", "x": "7.1 Fitur yang telah berjalan"},
    {"t": "b", "x": (
        "Akun dan onboarding: registrasi, konfirmasi email, login, logout, lupa dan "
        "reset password, profil usaha, outlet, target harian, serta katalog awal "
        "opsional."
    )},
    {"t": "b", "x": (
        "Kasir: pencarian menu, filter kategori, kuantitas, catatan item, diskon, pajak "
        "yang dapat dikonfigurasi, metode tunai/QRIS/transfer, validasi uang tunai, dan "
        "struk."
    )},
    {"t": "b", "x": (
        "Menu dan bahan: pengelolaan menu aktif/nonaktif, harga, resep, bahan, "
        "supplier, batas pesan ulang, stok awal, dan stok opname."
    )},
    {"t": "b", "x": (
        "Pembelian: pencatatan manual atau hasil pindai nota yang ditinjau pengguna, "
        "penambahan stok, dan pembaruan biaya rata-rata bergerak."
    )},
    {"t": "b", "x": (
        "Pelanggan: data kontak, jumlah kunjungan, total belanja, poin, dan segmen "
        "berdasarkan kebaruan serta frekuensi kunjungan."
    )},
    {"t": "b", "x": (
        "Keuangan dan tim: riwayat transaksi, omzet, HPP historis, laba kotor, "
        "pengeluaran, ekspor CSV, keanggotaan berbasis peran, dan undangan email."
    )},
    {"t": "b", "x": (
        "Panduan: pengenalan awal, tur yang dapat diulang, dan pencarian bantuan yang "
        "terhubung ke halaman terkait."
    )},
    {"t": "h2", "x": "7.2 Posisi dibanding sistem serupa"},
    {"t": "p", "x": (
        "Keunikan Laris terletak pada gabungan tiga hal dalam satu alur: pencatatan "
        "yang saling terhubung pada tingkat resep, bantuan pencatatan berbahasa "
        "Indonesia, dan perilaku cadangan yang eksplisit ketika layanan AI tidak "
        "tersedia. Dibandingkan alur manual yang memakai catatan pesanan, lembar stok, "
        "dan rekap terpisah, satu checkout di Laris langsung memperbarui catatan "
        "terkait sehingga rekonsiliasi ganda berkurang."
    )},
    {"t": "p", "x": (
        "Sebagai pembanding, dokumentasi Loyverse menjelaskan composite item yang "
        "mengurangi stok komponen dan menghitung biaya dari komponennya [2]. Jadi, "
        "stok berbasis resep bukan penemuan baru. Fokus Laris adalah alur berbahasa "
        "Indonesia yang menggabungkan resep, arsip HPP, dan bantuan AI dengan "
        "konfirmasi serta sumber jawaban yang jelas. Ini merupakan perbandingan "
        "dokumentasi terbatas, bukan benchmark keunggulan terhadap seluruh produk."
    )},
    {"t": "h2", "x": "7.3 Otomasi dengan konfirmasi manusia"},
    {"t": "p", "x": (
        "Parser pesanan memetakan teks Bahasa Indonesia ke item katalog aktif, "
        "kuantitas, metode pembayaran, dan catatan. Item di luar katalog ditandai "
        "sebagai tidak dikenal agar ditinjau. Pengenalan suara peramban dapat mengisi "
        "teks bila didukung, dan pengetikan tetap tersedia. Hasil parsing menyiapkan "
        "pesanan; pembayaran tetap memerlukan konfirmasi pengguna."
    )},
    {"t": "p", "x": (
        "Pada mode cloud terautentikasi, Gemini dapat membaca nota pembelian dan "
        "mencocokkan baris belanja hanya dengan ID bahan yang tersedia. Route "
        "memvalidasi keluaran model, menormalkan satuan yang didukung, dan melewati "
        "baris yang tidak dapat dikonversi dengan aman. Tanpa model, OCR cloud "
        "melaporkan kegagalan dan pencatatan manual tetap dapat dipakai; simulasi OCR "
        "hanya ada di demo lokal dan diberi label simulasi."
    )},
    {"t": "p", "x": (
        "Tanya Laris menjawab pertanyaan dengan tools baca yang telah ditentukan untuk "
        "omzet, laba, stok menipis, menu terlaris, segmen pelanggan, dan pengeluaran. "
        "Bila model tidak tersedia, jawaban aturan lokal diberikan dengan label sumber. "
        "Batas waktu permintaan dan pembatalan mencegah jawaban usang masuk ke dialog "
        "yang sudah ditutup atau berubah."
    )},

    {"t": "h2", "x": "7.4 Alur pengguna dan keputusan UX"},
    {"t": "p", "x": (
        "Skenario desain: kasir memilih menu atau mengetik pesanan, meninjau jumlah "
        "dan catatan, lalu mengonfirmasi pembayaran. Struk mengarahkan pengguna ke "
        "dampak transaksi; pemilik memeriksa stok serta keuangan tanpa mencatat ulang. "
        "Pencarian, label berbahasa Indonesia, validasi, status proses, dan tur bantuan "
        "mendukung pengguna baru. Pada ponsel, akses keranjang tetap terlihat."
    )},
    {"t": "p", "x": (
        "Regresi teknis sebelumnya memandu dua perbaikan: menu yang dihapus tidak "
        "lagi merusak keranjang, dan perubahan harga tidak mengubah struk lama. "
        "Uji kegunaan direncanakan melalui tugas mencari menu, checkout, memeriksa "
        "stok, dan mencatat pembelian; ukur keberhasilan tugas, waktu, serta bantuan "
        "yang diperlukan. Belum ada wawancara pengguna atau skor SUS yang dilaporkan."
    )},

    {"t": "h1", "x": "8. Keamanan dan Integritas Data"},
    {"t": "h2", "x": "8.1 Batas transaksi yang dapat dipercaya"},
    {"t": "p", "x": (
        "Checkout cloud memanggil fungsi complete_sale melalui Server Action "
        "terautentikasi. Fungsi tersebut memeriksa keanggotaan dan peran, status menu "
        "aktif, kuantitas 1–999, batas diskon terhadap subtotal, kecukupan stok bahan "
        "sesuai resep, serta kecukupan uang tunai. Subtotal, pajak, dan total dihitung "
        "di server berdasarkan harga katalog dan tarif pajak usaha, bukan dari nilai "
        "yang dikirim klien."
    )},
    {"t": "p", "x": (
        "Pesanan, arsip item, pembayaran, pengurangan stok, pembaruan pelanggan, dan "
        "audit log ditulis dalam satu transaksi fungsi basis data. Kunci idempotensi "
        "membuat permintaan yang terulang mengembalikan pesanan yang sama, bukan "
        "membuat transaksi ganda. Penulisan katalog dan checkout memakai lock per "
        "business agar harga, resep, dan stok tidak terbaca dari versi katalog yang "
        "berbeda."
    )},
    {"t": "h2", "x": "8.2 Kontrol akses dan validasi"},
    {"t": "b", "x": (
        "Row Level Security diaktifkan dan dipaksa pada tabel tenant; pembacaan dibatasi "
        "keanggotaan, dan tabel ledger tidak menerima penulisan langsung dari klien."
    )},
    {"t": "b", "x": (
        "Mutasi penting berjalan lewat fungsi SECURITY DEFINER yang memeriksa ulang "
        "peran, sehingga pembatasan tidak bergantung pada tampilan antarmuka."
    )},
    {"t": "b", "x": (
        "Service-role key dan kunci AI hanya dipakai di server. Bucket gambar menu "
        "bersifat publik untuk menampilkan foto produk, bukan untuk dokumen rahasia."
    )},
    {"t": "b", "x": (
        "Penghapusan data cloud bersifat soft delete agar riwayat transaksi dan ledger "
        "tetap utuh; bahan yang masih dipakai resep tidak dapat dihapus."
    )},
    {"t": "b", "x": (
        "Ekspor CSV menetralkan potensi injeksi formula spreadsheet, dan unggahan "
        "gambar dibatasi jenis serta ukurannya."
    )},
    {"t": "b", "x": (
        "Permintaan AI dibatasi rate limit per pengguna atau IP, dan telemetri "
        "mencatat keberhasilan serta kegagalan pemanggilan model."
    )},
    {"t": "h2", "x": "8.3 Batas klaim keamanan"},
    {"t": "p", "x": (
        "Kontrol ini bukan sertifikasi keamanan. Deployment tujuan masih memerlukan "
        "uji isolasi tenant, alur email, backup/pemulihan, serta privasi dan retensi "
        "data. Uji cloud tidak dijalankan ulang untuk revisi proposal ini."
    )},

    {"t": "h1", "x": "9. Verifikasi dan Pengujian"},
    {"t": "p", "x": (
        "Pemeriksaan lokal diulang pada 29 Oktober 2026 terhadap aplikasi pada commit "
        "4b3dabc; perubahan proposal tidak mengubah kode aplikasi. Seluruh pemeriksaan "
        "pada Tabel 2 lulus."
    )},
    {"t": "table", "head": ["Pemeriksaan", "Perintah", "Hasil"], "widths": [4, 5, 5], "rows": [
        ["Tipe TypeScript", "npm run typecheck", "Lulus tanpa error"],
        ["Gaya kode", "npm run lint", "Lulus tanpa peringatan"],
        ["Unit dan logika", "npm test", "147 dari 147 pengujian lulus"],
        ["Parser pesanan", "npm run eval:voice", "50 dari 50 utterance cocok persis"],
        ["Build produksi", "npm run build", "Build selesai"],
    ], "cap": "Tabel 2. Hasil pemeriksaan otomatis."},
    {"t": "p", "x": (
        "Cakupan pengujian meliputi ledger stok, alur checkout, validasi masukan, biaya "
        "rata-rata bergerak, HPP historis, keamanan ekspor CSV, pembatalan permintaan "
        "AI, serta konsistensi panduan dan tur dengan antarmuka yang benar-benar ada."
    )},
    {"t": "p", "x": (
        "Angka 50 dari 50 pada eval:voice mengukur akurasi parser teks terhadap 50 "
        "kalimat pesanan Bahasa Indonesia di berkas evals/voice.jsonl dengan target PRD "
        "minimal 90 persen. Angka tersebut bukan akurasi pengenalan suara mikrofon, "
        "bukan uji beban, dan bukan ukuran dampak bisnis. Kualitas pengenalan suara "
        "bergantung pada peramban dan kondisi lingkungan pengguna."
    )},
    {"t": "p", "x": (
        "Tangkapan layar pada bagian 11 diambil dari aplikasi yang berjalan di mode "
        "demo lokal. Pada pengambilan tersebut tidak ditemukan error runtime maupun "
        "pelebaran horizontal pada lebar 1366 dan 390 piksel."
    )},

    {"t": "h1", "x": "10. Batasan Sistem Aplikasi"},
    {"t": "b", "x": (
        "Metode pembayaran dicatat untuk keperluan pembukuan; aplikasi tidak memproses "
        "dana melalui payment gateway dan tidak melakukan rekonsiliasi pembayaran."
    )},
    {"t": "b", "x": (
        "Etalase online merupakan pratinjau pemesanan di dalam workspace, bukan toko "
        "publik yang terintegrasi dengan kanal pembayaran eksternal."
    )},
    {"t": "b", "x": (
        "Alur antarmuka saat ini difokuskan pada satu outlet utama per usaha, meskipun "
        "skema basis data telah menyediakan kolom outlet."
    )},
    {"t": "b", "x": (
        "Fitur AI berbasis Gemini hanya aktif pada mode cloud untuk pengguna yang telah "
        "masuk; mode demo memakai parser lokal dan simulasi berlabel."
    )},
    {"t": "b", "x": (
        "Rate limit AI disimpan di memori per instance server, sehingga batas global "
        "lintas instance memerlukan penyimpanan bersama seperti Redis."
    )},
    {"t": "b", "x": (
        "Mode demo lokal menyimpan data di peramban dan tidak tersambung ke cloud; data "
        "demo tidak dipindahkan menjadi data usaha."
    )},
    {"t": "b", "x": (
        "Audit aksesibilitas, uji beban, perangkat kelas bawah, tablet, serta "
        "pengujian menyeluruh Firefox/Safari/Edge belum diselesaikan. Bukti tangkapan "
        "layar hanya mencakup Chrome pada dua ukuran yang disebutkan."
    )},
    {"t": "b", "x": (
        "Komponen workspace utama masih berukuran besar dalam satu berkas; pemecahan "
        "menjadi modul per fitur menjadi pekerjaan perbaikan kualitas kode."
    )},

    {"t": "h1", "x": "11. Tangkapan Layar Antarmuka yang Telah Diimplementasikan"},
    {"t": "p", "x": (
        "Gambar 4 sampai 7 adalah tangkapan layar apa adanya dari aplikasi yang "
        "berjalan pada mode demo lokal dengan data fiktif Kopi Senja. Tidak ada "
        "transaksi nyata, dana, maupun data pelanggan asli pada gambar-gambar ini."
    )},
    {"t": "img", "f": "overview.png", "w": 14.5, "cap": (
        "Gambar 4. Halaman Ringkasan pada 1366 x 900: ringkasan penjualan, jumlah "
        "transaksi, rata-rata belanja, laba kotor, dan grafik penjualan."
    )},
    {"t": "img", "f": "pos.png", "w": 14.5, "cap": (
        "Gambar 5. Halaman Kasir pada 1366 x 900 dengan satu contoh item di keranjang, "
        "diskon, pajak, dan total pesanan. Pengambilan gambar ini tidak mengirim "
        "pembayaran."
    )},
    {"t": "img", "f": "inventory.png", "w": 14.5, "cap": (
        "Gambar 6. Halaman Stok bahan pada 1366 x 900: sisa stok, satuan dasar, dan "
        "batas pesan ulang."
    )},
    {"t": "img", "f": "pos-mobile.png", "w": 4.2, "cap": (
        "Gambar 7. Halaman Kasir pada 390 x 844: navigasi ringkas dan tombol keranjang "
        "yang tetap terjangkau pada layar ponsel."
    )},

    {"t": "h1", "x": "12. Rencana Pengembangan Lanjutan"},
    {"t": "n", "x": (
        "Pilot bersama dua sampai tiga usaha F&B untuk mengukur waktu pencatatan, "
        "selisih stok, dan kebutuhan laporan secara nyata."
    )},
    {"t": "n", "x": (
        "Dukungan multi-outlet penuh pada antarmuka, termasuk perbandingan kinerja antar "
        "outlet dan transfer stok."
    )},
    {"t": "n", "x": (
        "Integrasi pembayaran QRIS resmi beserta rekonsiliasi, setelah kepatuhan dan "
        "perjanjian penyedia terpenuhi."
    )},
    {"t": "n", "x": (
        "Penyimpanan rate limit bersama dan pemantauan terpusat untuk kesiapan skala."
    )},
    {"t": "n", "x": (
        "Pemecahan komponen workspace menjadi modul per fitur serta penambahan pengujian "
        "antarmuka otomatis."
    )},
    {"t": "n", "x": (
        "Audit aksesibilitas, optimasi perangkat kelas bawah, dan pengujian beban "
        "basis data."
    )},
    {"t": "n", "x": (
        "Laporan tambahan seperti proyeksi kebutuhan belanja berbasis riwayat, setelah "
        "data pilot mencukupi."
    )},

    {"t": "h1", "x": "13. Lisensi dan Atribusi Pihak Ketiga"},
    {"t": "p", "x": (
        "Lisensi paket: Next.js, React, Tailwind CSS, Zod, Vercel AI SDK, dan klien "
        "Supabase memakai MIT; TypeScript memakai Apache-2.0; lucide-react memakai "
        "ISC. Rujukan lisensi adalah metadata dan berkas LICENSE paket terpasang. "
        "Layanan Supabase dan Gemini tunduk pada ketentuan layanan masing-masing."
    )},
    {"t": "placeholder", "x": (
        "[KONFIRMASI SUMBER ASET: asal dan hak penggunaan enam gambar menu WebP "
        "di public/images; keberadaan berkas gambar saja belum membuktikan lisensi]"
    )},
    {"t": "p", "x": (
        "Diagram dibuat dari migration proyek; tangkapan layar berasal dari demo "
        "fiktif. Logo resmi GTNIC diambil tanpa perubahan bentuk atau warna dari "
        "Guide Book Web Dev, halaman 19, untuk identitas kompetisi pada sampul. "
        "Akses publik repositori dan deployment perlu dipastikan sebelum pengumpulan; "
        "rahasia server tidak boleh disertakan."
    )},
    {"t": "h1", "x": "14. Penutup dan Panduan Penjurian"},
    {"t": "p", "x": (
        "Nilai utama Laris adalah keterhubungan data operasional, bukan jumlah fitur "
        "AI. Untuk menilai alur inti, buka /demo dari website pada sampul, pilih "
        "menu, selesaikan checkout simulasi, lalu periksa struk, stok bahan, dan "
        "laporan. Demo tidak memindahkan dana dan tidak membuktikan otorisasi cloud."
    )},
    {"t": "p", "x": (
        "Untuk uji cloud, gunakan workspace khusus berisi data fiktif dan akun uji "
        "owner, manager, kasir, serta dapur. Uji login, perubahan data sesuai peran, "
        "dan penolakan tindakan di luar izin. Akun penjurian tidak boleh memakai "
        "data pelanggan nyata atau kredensial administrator layanan."
    )},
    {"t": "placeholder", "x": (
        "[LENGKAPI AKSES JURI: URL deployment dan akun uji terpisah untuk keempat "
        "peran; isi hanya kredensial demo khusus melalui dokumen pengumpulan]"
    )},
    {"t": "h1", "x": "Daftar Pustaka"},
    {"t": "ref", "x": "[1] Badan Pusat Statistik. (2024). Statistik Penyediaan Makanan dan Minuman 2023. Terbit 23 Desember 2024.",
     "url": "https://www.bps.go.id/id/publication/2024/12/23/f2c7743c4712aaeaa4abf694/statistik-penyediaan-makanan-dan-minuman-2023.html"},
    {"t": "ref", "x": "[2] Loyverse Help Center. How to Create a Composite Item. Diakses 29 Oktober 2026.",
     "url": "https://help.loyverse.com/help/how-create-composite-item"},
]

SUBMISSION_CHECKLIST = """LARIS - SUBMISSION CHECKLIST (not part of the proposal)
Deadline: November 10, 2026, 23:59 WIB. Source: guidebook, page 10.

The generated proposal is a DRAFT until the following are completed:
1. Replace the team name and member/institution/student-ID placeholders.
   Remove unused member rows for an individual or two-person entry.
2. Supply the public HTTPS website and public 3-5 minute video URLs.
3. Supply dedicated fictional-data judge accounts for owner, manager, kasir,
   and dapur in the submission copy; verify permissions and email journeys.
   Never publish service-role/API keys or personal account passwords.
4. Confirm the provenance and usage rights of all six menu images.
5. Confirm all originality statements personally, fill the representative's
   details, date/place, and sign the separate declaration. This is a template,
   not a signed or organizer-approved declaration.
6. Verify public repository/site/video access without your account, all eight
   migrations on the target deployment, seeded demo data, and browser/tablet
   behavior. Automated local tests do not establish deployment readiness.
7. Rebuild after editing content.py, inspect PDF pagination (maximum 15 pages),
   and rename the PDF to GTNIC2026_WebDev_<RegisteredTeamName>.pdf.
   The DOCX is editable; Word pagination can differ from the validated PDF.
8. Submit the site, repository, video, proposal, and signed declaration using
   the organizer's official form. Nothing has been uploaded automatically.

SUGGESTED FOUR-MINUTE VIDEO RUN OF SHOW
0:00-0:25  Introduce the registered team and the operational problem.
0:25-0:50  Explain the owner/cashier scenario and the connected workflow.
0:50-2:10  Show menu selection, order confirmation, and simulated checkout.
2:10-2:50  Follow the same sale into receipt, stock deduction, and finance.
2:50-3:20  Show optional order parsing with its source label and human review.
3:20-3:45  Explain cloud roles, architecture, and honest system limitations.
3:45-4:00  Close with planned pilot metrics and public demo/repository links.
Use only fictional data. Never display private keys or real customer data.
"""

PLEDGE = {
    "title": "SURAT PERNYATAAN KEASLIAN KARYA",
    "intro": (
        "Yang bertanda tangan di bawah ini, selaku perwakilan tim peserta Garda Tech "
        "National Innovation Competition (GTNIC) 2026 kategori Web Development:"
    ),
    "fields": [
        ("Nama Tim", "[NAMA TIM]"),
        ("Nama Ketua", "[NAMA KETUA TIM]"),
        ("Instansi", "[INSTANSI/PERGURUAN TINGGI]"),
        ("Judul Karya", "LARIS — Workspace Operasional Terpadu untuk UMKM Food & Beverage"),
        ("Tautan Repositori", "https://github.com/aarz24/Laris_HackathonGTNIC2026"),
    ],
    "statements": [
        "Karya aplikasi web yang kami kumpulkan merupakan hasil karya orisinal tim kami.",
        "Karya ini belum pernah dipublikasikan atau memenangkan perlombaan lain.",
        "Kami tidak melakukan plagiarisme maupun menyalin kode pihak lain secara utuh "
        "tanpa modifikasi yang signifikan.",
        "Pustaka, framework, dan aset pihak ketiga yang kami gunakan bersifat "
        "open-source atau berlisensi sesuai ketentuan, dan telah kami dokumentasikan "
        "pada proposal.",
        "Karya ini tidak mengandung unsur SARA, pornografi, kekerasan, provokatif, "
        "maupun pelanggaran hukum.",
        "Apabila pernyataan ini terbukti tidak benar, kami bersedia menerima sanksi "
        "berupa diskualifikasi dari perlombaan.",
    ],
    "closing": "Demikian pernyataan ini kami buat dengan sebenar-benarnya.",
    "signature": [
        "[Kota], [Tanggal] [Bulan] 2026",
        "Ketua Tim,",
        "",
        "",
        "([NAMA KETUA TIM])",
    ],
}
