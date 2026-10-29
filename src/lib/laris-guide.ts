export type View = "overview" | "pos" | "transactions" | "products" | "inventory" | "purchases" | "customers" | "storefront" | "finance" | "team";
export type GuideDialog = "settings" | "assistant" | "voice" | "forecast";

export interface GuideFeature {
  id: string;
  title: string;
  description: string;
  location: string;
  view: View;
  target: string;
  keywords: string;
  steps: string[];
  access?: string;
  note?: string;
  dialog?: GuideDialog;
}

export const guideFeatures: GuideFeature[] = [
  {
    id: "overview", title: "Lihat kondisi usaha", view: "overview", target: "overview",
    description: "Penjualan, menu terlaris, target harian, dan stok yang perlu perhatian.",
    location: "Ringkasan", keywords: "dashboard beranda omzet pendapatan ringkasan penjualan target",
    steps: ["Buka Ringkasan dari navigasi.", "Pilih Hari ini, 7 hari terakhir, atau 30 hari terakhir untuk melihat angka periode tersebut.", "Cek stok yang menipis dan gunakan Cek stok bahan untuk menindaklanjuti."],
  },
  {
    id: "inventory", title: "Siapkan bahan baku", view: "inventory", target: "page-heading",
    description: "Mulai dari bahan, satuan, biaya, dan stok awal sebelum menyusun resep.",
    location: "Stok bahan → Tambah bahan", keywords: "bahan baku inventory persediaan tambah supplier satuan biaya stok awal",
    access: "Tambah dan ubah bahan: owner atau manager.",
    steps: ["Buka Stok bahan, lalu pilih Tambah bahan.", "Isi nama, satuan dasar (misalnya g atau ml), biaya per satuan, batas minimum, dan supplier.", "Isi Stok awal sesuai jumlah fisik, lalu Simpan bahan. Gunakan satuan yang sama dalam resep dan pembelian."],
  },
  {
    id: "products", title: "Atur menu & resep", view: "products", target: "page-heading",
    description: "Tambahkan harga jual dan komposisi per porsi agar stok berkurang otomatis.",
    location: "Produk & resep → Tambah menu", keywords: "produk katalog menu resep harga hpp margin foto gambar tambah jual nonaktif",
    access: "Tambah dan ubah menu: owner atau manager.",
    steps: ["Siapkan bahan terlebih dahulu di Stok bahan jika menu menggunakan resep.", "Buka Produk & resep → Tambah menu. Isi nama, kategori, dan harga jual.", "Tambahkan bahan dan jumlah per porsi, centang Menu aktif, lalu Simpan menu & resep.", "Untuk mengubah menu, pilih kartu menu → Ubah menu & resep."],
    note: "Menu tanpa resep tetap bisa dijual, tetapi tidak mengurangi stok bahan. Unggah foto sendiri tersedia di mode cloud.",
  },
  {
    id: "pos", title: "Catat penjualan", view: "pos", target: "pos-menu",
    description: "Pilih menu, periksa keranjang, lalu catat pembayaran pelanggan.",
    location: "Kasir → Lanjut pembayaran", keywords: "kasir pos jual transaksi pesanan checkout bayar tunai qris transfer diskon pajak cashier payment",
    access: "Mencatat penjualan: owner, manager, atau kasir.",
    steps: ["Buka Kasir, cari menu dan tekan tombol + untuk memasukkannya ke keranjang.", "Periksa jumlah, catatan, diskon, dan pajak sebelum memilih Lanjut pembayaran.", "Pilih metode pembayaran. Untuk tunai, isi uang diterima; kembalian dihitung otomatis.", "Konfirmasi hanya jika pesanan benar. Transaksi dan pergerakan stok baru dicatat setelah konfirmasi."],
    note: "QRIS dan transfer masih simulasi, bukan integrasi bank. Tidak ada dana yang dipindahkan oleh Laris.",
  },
  {
    id: "voice", title: "Catat pesanan dengan suara", view: "pos", target: "page-heading", dialog: "voice",
    description: "Ucapkan atau ketik pesanan, lalu periksa hasil sebelum masuk keranjang.",
    location: "Kasir → Ketik / suara (demo) atau Catat pakai suara (cloud)", keywords: "suara voice mikrofon mic ngomong parser ketik pesanan",
    access: "Mencatat penjualan: owner, manager, atau kasir.",
    steps: ["Di Kasir, pilih Ketik / suara (demo) atau Catat pakai suara (cloud).", "Tekan mikrofon dan izinkan akses browser, atau ketik pesanan jika mikrofon tidak tersedia.", "Pilih Baca pesanan, lalu perbaiki bagian yang belum dikenali.", "Pilih Konfirmasi ke keranjang dan periksa pesanan sebelum pembayaran."],
    note: "Demo memakai parser lokal, bukan Gemini. Cloud dapat memakai Gemini jika tersedia; input ketik dan pemeriksaan manual tetap tersedia.",
  },
  {
    id: "transactions", title: "Cari transaksi & cetak struk", view: "transactions", target: "page-heading",
    description: "Temukan penjualan sebelumnya tanpa membuat transaksi baru.",
    location: "Transaksi → Lihat transaksi", keywords: "riwayat history transaksi struk receipt cetak print nomor pelanggan pembayaran",
    steps: ["Buka Transaksi dan cari nomor transaksi atau nama pelanggan.", "Gunakan filter QRIS, Tunai, atau Transfer bila perlu.", "Pilih Lihat transaksi untuk membuka struk, lalu Cetak struk. Membuka struk tidak mencatat penjualan baru."],
  },
  {
    id: "stock-count", title: "Koreksi stok / opname", view: "inventory", target: "page-heading",
    description: "Sesuaikan catatan persediaan dengan hasil hitung fisik.",
    location: "Stok bahan → Ubah / opname", keywords: "opname stok stock koreksi hitung fisik sesuaikan selisih salah ubah",
    access: "Opname: owner atau manager.",
    steps: ["Di Stok bahan, cari bahan lalu pilih Ubah / opname.", "Isi Stok hasil hitung fisik dengan jumlah sebenarnya, bukan selisihnya. Kosongkan jika hanya mengubah detail bahan.", "Simpan bahan, lalu periksa Pergerakan stok terbaru untuk catatan penyesuaian."],
  },
  {
    id: "purchases", title: "Restok & catat nota belanja", view: "purchases", target: "page-heading",
    description: "Catat bahan yang dibeli untuk menambah persediaan secara otomatis.",
    location: "Pembelian → Catat pembelian", keywords: "pembelian beli belanja restok restock nota scan ocr supplier stok tambah",
    access: "Mencatat pembelian: owner, manager, atau kasir.",
    steps: ["Pastikan bahan sudah terdaftar di Stok bahan.", "Buka Pembelian → Catat pembelian dan pilih bahan.", "Isi jumlah dalam satuan bahan dan total harga. Foto nota dapat membantu mengisi data; selalu periksa hasilnya.", "Pilih Konfirmasi pembelian. Stok bertambah dan riwayat pembelian tercatat."],
    note: "Demo OCR hanya mengisi contoh, bukan membaca foto. Pindai nota cloud memerlukan konfigurasi Gemini. Pengisian manual tetap tersedia tanpa AI.",
  },
  {
    id: "forecast", title: "Lihat saran belanja", view: "inventory", target: "forecast", dialog: "forecast",
    description: "Cari bahan menipis dan salin daftar untuk supplier.",
    location: "Stok bahan → Lihat belanja besok", keywords: "saran belanja besok forecast prediksi supplier whatsapp salin minimum menipis habis",
    steps: ["Buka Stok bahan → Lihat belanja besok.", "Tinjau bahan di bawah batas minimum dan jumlah restok yang disarankan.", "Salin daftar untuk WhatsApp atau catat pembelian setelah bahan diterima."],
    note: "Saran berasal dari batas minimum stok, bukan prediksi AI. Daftar tidak dikirim ke supplier secara otomatis.",
  },
  {
    id: "customers", title: "Kelola pelanggan & poin", view: "customers", target: "page-heading",
    description: "Simpan kontak dengan izin pelanggan dan temukan riwayat kunjungannya.",
    location: "Pelanggan", keywords: "pelanggan customer kontak telepon poin loyalitas kunjungan segmen rfm",
    access: "Tambah dan ubah: owner, manager, atau kasir. Hapus: owner atau manager.",
    steps: ["Buka Pelanggan → Tambah pelanggan dan isi nama serta nomor telepon dengan izin pelanggan.", "Gunakan nomor yang sama saat checkout untuk menghubungkan transaksi dan poin.", "Cari nama atau nomor telepon, atau pilih segmen untuk meninjau pelanggan. Pilih Ubah untuk memperbaiki kontak."],
  },
  {
    id: "finance", title: "Lihat laba & catat pengeluaran", view: "finance", target: "finance",
    description: "Pantau pendapatan, HPP, dan biaya operasional hari ini.",
    location: "Keuangan → Catat pengeluaran", keywords: "keuangan finance laba untung rugi pengeluaran biaya operasional uang laporan profit hpp",
    access: "Mencatat pengeluaran: owner, manager, atau kasir.",
    steps: ["Buka Keuangan untuk melihat ringkasan harian.", "Pilih Catat pengeluaran, isi keperluan, kategori, dan jumlah, lalu simpan.", "Periksa biaya operasional dan untung bersih yang diperbarui. Gunakan Cetak laporan bila diperlukan."],
    note: "HPP memakai biaya saat penjualan. Jika biaya historis arsip lama tidak tersedia, HPP dan laba ditandai tidak tersedia, bukan dianggap nol. Ini ringkasan manajemen, bukan laporan akuntansi lengkap.",
  },
  {
    id: "export", title: "Unduh laporan penjualan", view: "transactions", target: "page-heading",
    description: "Ekspor transaksi sebagai CSV untuk dibuka di spreadsheet.",
    location: "Transaksi → Ekspor transaksi", keywords: "ekspor export csv excel unduh download laporan penjualan spreadsheet",
    steps: ["Buka Transaksi → Ekspor transaksi, atau Keuangan → Ekspor CSV.", "Simpan file CSV dari browser dan buka di aplikasi spreadsheet.", "Ekspor berisi seluruh transaksi workspace, bukan hanya hasil filter yang sedang terlihat."],
  },
  {
    id: "team", title: "Undang tim & atur akses", view: "team", target: "page-heading",
    description: "Berikan akun terpisah untuk manager, kasir, dan dapur.",
    location: "Tim & akses → Undang anggota", keywords: "tim team anggota undang invite akses peran role manager kasir dapur akun",
    access: "Undangan dan perubahan akses: hanya owner, di mode cloud.",
    steps: ["Masuk sebagai owner ke workspace cloud, lalu buka Tim & akses → Undang anggota.", "Masukkan email dan pilih peran sesuai tanggung jawab anggota.", "Kirim undangan. Anggota baru mengikuti email pendaftaran; anggota yang sudah punya akun dapat masuk dengan akunnya."],
    note: "Mode demo hanya menampilkan contoh tim dan tidak mengirim undangan.",
  },
  {
    id: "settings", title: "Ubah profil, pajak & target", view: "overview", target: "profile-entry", dialog: "settings",
    description: "Ubah nama usaha, outlet, tarif pajak, target harian, dan catatan struk.",
    location: "Pengaturan / avatar profil", keywords: "pengaturan settings profil nama usaha outlet pajak tax target harian footer struk",
    access: "Menyimpan pengaturan: hanya owner.",
    steps: ["Buka Pengaturan di navigasi, atau tekan avatar profil di kanan atas.", "Ubah profil, target harian, tarif pajak, atau catatan struk.", "Pilih Simpan pengaturan. Pajak baru diterapkan pada pesanan saat opsi Pajak di keranjang dicentang."],
  },
  {
    id: "assistant", title: "Tanya Laris tentang usahamu", view: "overview", target: "assistant", dialog: "assistant",
    description: "Tanyakan penjualan, menu favorit, atau bahan yang perlu dibeli.",
    location: "Tombol Tanya Laris di kanan bawah", keywords: "tanya laris asisten assistant ai gemini chat analisis bantuan",
    steps: ["Tekan Tanya Laris di kanan bawah halaman.", "Pilih contoh pertanyaan atau ketik pertanyaan tentang usahamu.", "Periksa jawaban dengan data workspace sebelum mengambil keputusan."],
    note: "Demo menggunakan perhitungan lokal. Cloud dapat menggunakan Gemini jika dikonfigurasi; AI tidak mengubah data secara otomatis.",
  },
  {
    id: "storefront", title: "Pratinjau etalase menu", view: "storefront", target: "page-heading",
    description: "Lihat tampilan menu dari sudut pandang pemesan di dalam workspace.",
    location: "Etalase online", keywords: "etalase online toko storefront shop publik pelanggan pesan",
    steps: ["Buka Etalase online untuk melihat pratinjau menu aktif.", "Untuk mencatat pesanan, pilih menu dan periksa item sebelum konfirmasi pembayaran.", "Pesanan yang dikonfirmasi benar-benar masuk ke catatan workspace yang sedang digunakan."],
    note: "Etalase masih pratinjau internal, bukan tautan publik untuk dibagikan ke pelanggan.",
  },
];

const fillerWords = new Set(["di", "mana", "dimana", "cara", "bagaimana", "gimana", "saya", "aku", "mau", "ingin", "untuk", "yang", "dan", "the", "how", "do", "i", "where", "to"]);

export function findGuideFeatures(query: string): GuideFeature[] {
  const words = query.toLocaleLowerCase("id-ID").trim().split(/[^\p{L}\p{N}]+/u).filter(word => word && !fillerWords.has(word));
  if (!words.length) return guideFeatures;
  return guideFeatures.map(feature => {
    const primary = `${feature.title} ${feature.location} ${feature.keywords}`.toLocaleLowerCase("id-ID");
    const content = `${primary} ${feature.description} ${feature.steps.join(" ")}`.toLocaleLowerCase("id-ID");
    return { feature, score: words.every(word => content.includes(word)) ? words.reduce((score, word) => score + (primary.includes(word) ? 2 : 1), 0) : 0 };
  }).filter(result => result.score > 0).sort((a, b) => b.score - a.score).map(result => result.feature);
}

const demoTour: GuideFeature[] = [
  {
    id: "demo-overview", title: "Kenali kedai contohmu", view: "overview", target: "overview",
    location: "Ringkasan · demo Kopi Senja", keywords: "demo ringkasan",
    description: "Angka ini berasal dari data contoh di browser, bukan usaha sungguhan. Tur hanya menunjukkan alur; kamu bebas mencoba setelahnya.",
    steps: ["Mulai dari omzet dan jumlah transaksi. Data demo tidak dipindahkan ke akun saat kamu mendaftar."],
  },
  {
    id: "demo-pos", title: "Pilih menu, ketik, atau ucapkan", view: "pos", target: "pos-menu",
    location: "Kasir · menu & input pesanan", keywords: "demo kasir ketik suara",
    description: "Tambahkan menu dengan tombol +. Pilihan Ketik / suara juga menerima pesanan tertulis jika mikrofon tidak tersedia; demo memakai parser lokal, bukan Gemini.",
    steps: ["Setelah tur, coba satu menu atau ketik pesanan lewat Ketik / suara, periksa hasilnya, lalu konfirmasi ke keranjang."],
  },
  {
    id: "demo-checkout", title: "Periksa dulu, baru konfirmasi", view: "pos", target: "pos-checkout",
    location: "Kasir → keranjang → Lanjut pembayaran", keywords: "demo checkout bayar",
    description: "Periksa jumlah, diskon, dan pajak. Di pembayaran, nomor telepon opsional menghubungkan kunjungan serta poin pelanggan. QRIS dan transfer hanya simulasi, tanpa perpindahan dana.",
    steps: ["Di ponsel, tombol Keranjang & bayar membawamu ke pesanan di bawah menu. Tidak perlu melakukan checkout untuk menyelesaikan tur."],
  },
  {
    id: "demo-inventory", title: "Penjualan tersambung ke bahan", view: "inventory", target: "inventory-ledger",
    location: "Stok bahan → Pergerakan stok terbaru", keywords: "demo stok resep",
    description: "Sesudah konfirmasi penjualan, bahan berkurang sesuai resep dan tercatat di pergerakan stok. Menu tanpa resep tidak mengurangi bahan.",
    steps: ["Setelah mencoba penjualan, buka Lihat stok dari struk untuk memeriksa perubahan. Data di sini masih contoh selama tur."],
  },
  {
    id: "demo-customers", title: "Kenali pelanggan yang kembali", view: "customers", target: "customer-activity",
    location: "Pelanggan → kunjungan & poin", keywords: "demo pelanggan poin",
    description: "Checkout dengan nomor telepon mencatat profil, kunjungan, total belanja, dan poin. Nama saja atau pelanggan umum tidak menghubungkan profil.",
    steps: ["Gunakan kontak fiktif saat mencoba demo. Struk menawarkan Aktivitas pelanggan hanya jika transaksi benar-benar terhubung ke profil."],
  },
  {
    id: "demo-finance", title: "Lihat hasilnya di laporan", view: "finance", target: "finance",
    location: "Keuangan · laporan harian", keywords: "demo laporan keuangan",
    description: "Penjualan tercatat dalam pendapatan dan HPP saat transaksi. Keuangan merangkum hari ini; seluruh transaksi bisa diekspor sebagai CSV.",
    steps: ["Selesai? Coba alurnya sendiri. Bantuan selalu tersedia untuk mencari fitur atau mengulang tur; Mulai ulang demo mengembalikan data contoh tanpa menyentuh akun."],
  },
];

export function getTourFeatures(role: "owner" | "manager" | "kasir" | "dapur", mode: "local" | "cloud" = "cloud"): GuideFeature[] {
  if (mode === "local") return demoTour;
  const ids = role === "dapur"
    ? ["overview", "products", "inventory", "forecast", "transactions"]
    : role === "kasir"
      ? ["overview", "pos", "voice", "transactions", "purchases", "customers", "finance"]
      : ["overview", "inventory", "products", "pos", "transactions", "purchases", "finance", "team"];
  return ids.map(id => guideFeatures.find(feature => feature.id === id)!);
}

export function guideStorageKey(mode: "local" | "cloud", userId?: string, businessId?: string): string {
  return mode === "local" ? "laris-guide-v1:demo" : `laris-guide-v1:cloud:${userId ?? "unknown"}:${businessId ?? "unknown"}`;
}

export const DEMO_STORAGE_KEY = "laris-kopi-senja-v1";

/** Only the confirmed local demo may reset; account preferences and auth are never touched. */
export function resetDemoSession<T>(mode: "local" | "cloud", confirmed: boolean, options: {
  storage: { removeItem: (key: string) => void };
  cancelPending: () => void;
  createFreshState: () => T;
}): { state: T; storageCleared: boolean } | null {
  if (mode !== "local" || !confirmed) return null;
  options.cancelPending();
  const state = options.createFreshState();
  let storageCleared = true;
  for (const key of [DEMO_STORAGE_KEY, guideStorageKey("local")]) {
    try { options.storage.removeItem(key); } catch { storageCleared = false; }
  }
  return { state, storageCleared };
}

export interface ReceiptCustomerLink { saleId: string; customerId: string }
export interface ReceiptAction { view: "inventory" | "customers" | "finance"; label: string; query?: string }

/** An explicit checkout association is required; names are not customer identifiers. */
export function getReceiptActions(saleId: string, link: ReceiptCustomerLink | null, customers: readonly { id: string; phone: string }[]): ReceiptAction[] {
  const customer = link?.saleId === saleId ? customers.find(entry => entry.id === link.customerId) : undefined;
  return [
    { view: "inventory", label: "Lihat stok" },
    ...(customer ? [{ view: "customers" as const, label: "Aktivitas pelanggan", query: customer.phone }] : []),
    { view: "finance", label: "Laporan keuangan" },
  ];
}
