"""Menggambar diagram arsitektur dan ERD dari skema yang terverifikasi.

Hanya memakai Pillow (sudah tersedia) dan font Times New Roman bawaan Windows.
Semua tabel/kolom di sini dibaca dari supabase/migrations/0001_schema.sql dan
migration berikutnya; tidak ada tabel yang direka.
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets"
ASSETS.mkdir(parents=True, exist_ok=True)

S = 3  # skala render supaya tajam saat dicetak
FONTS = Path(r"C:\Windows\Fonts")
INK = (26, 32, 29)
LINE = (90, 102, 94)
TITLE_BG = (222, 238, 227)
FIELD_BG = (252, 252, 250)
ACCENT_BG = (253, 243, 221)
ACCENT_BORDER = (198, 150, 42)


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS / name), size * S)


F_TITLE = font("timesbd.ttf", 13)
F_FIELD = font("times.ttf", 11)
F_EDGE = font("timesi.ttf", 10)
F_NOTE = font("timesi.ttf", 10)
F_HEAD = font("timesbd.ttf", 15)


def canvas(w: int, h: int):
    img = Image.new("RGB", (w * S, h * S), "white")
    return img, ImageDraw.Draw(img)


def r(draw, box, fill, outline, width=1, radius=4):
    x1, y1, x2, y2 = [v * S for v in box]
    draw.rounded_rectangle([x1, y1, x2, y2], radius=radius * S, fill=fill,
                           outline=outline, width=max(1, width * S // 2))


def text(draw, pos, value, fnt, fill=INK, anchor="la"):
    draw.text((pos[0] * S, pos[1] * S), value, font=fnt, fill=fill, anchor=anchor)


def line(draw, points, fill=LINE, width=1):
    draw.line([(x * S, y * S) for x, y in points], fill=fill,
              width=max(1, width * S // 2), joint="curve")


def arrow(draw, point, direction, fill=LINE, size=5):
    x, y = point[0] * S, point[1] * S
    s = size * S // 2
    if direction == "e":
        pts = [(x, y), (x - s, y - s * 0.6), (x - s, y + s * 0.6)]
    elif direction == "w":
        pts = [(x, y), (x + s, y - s * 0.6), (x + s, y + s * 0.6)]
    elif direction == "s":
        pts = [(x, y), (x - s * 0.6, y - s), (x + s * 0.6, y - s)]
    else:
        pts = [(x, y), (x - s * 0.6, y + s), (x + s * 0.6, y + s)]
    draw.polygon(pts, fill=fill)


class Entity:
    """Kotak tabel dengan judul dan daftar kolom terpilih."""

    ROW = 17
    HEAD = 23

    def __init__(self, name, x, y, w, fields, accent=False):
        self.name, self.x, self.y, self.w = name, x, y, w
        self.fields, self.accent = fields, accent
        self.h = self.HEAD + self.ROW * len(fields)

    def draw(self, d):
        bg = ACCENT_BG if self.accent else TITLE_BG
        border = ACCENT_BORDER if self.accent else (120, 150, 128)
        r(d, (self.x, self.y, self.x + self.w, self.y + self.h), FIELD_BG, border, 2)
        r(d, (self.x, self.y, self.x + self.w, self.y + self.HEAD), bg, border, 2)
        text(d, (self.x + 8, self.y + 6), self.name, F_TITLE)
        for i, f in enumerate(self.fields):
            fy = self.y + self.HEAD + i * self.ROW + 3
            text(d, (self.x + 8, fy), f, F_FIELD)
            if i:
                line(d, [(self.x + 2, fy - 3), (self.x + self.w - 2, fy - 3)],
                     (232, 234, 230), 1)

    def anchor(self, side):
        cx, cy = self.x + self.w / 2, self.y + self.h / 2
        return {
            "n": (cx, self.y), "s": (cx, self.y + self.h),
            "w": (self.x, cy), "e": (self.x + self.w, cy),
        }[side]

    def at(self, side, frac):
        if side in ("n", "s"):
            y = self.y if side == "n" else self.y + self.h
            return (self.x + self.w * frac, y)
        x = self.x if side == "w" else self.x + self.w
        return (x, self.y + self.h * frac)


def path(d, points, head, label="1:N", label_at=None):
    """Rute manual dengan titik-titik eksplisit, untuk edge yang rawan bertabrakan."""
    line(d, points, LINE, 2)
    arrow(d, points[-1], head)
    if label:
        lx, ly = label_at or points[len(points) // 2]
        text(d, (lx, ly), label, F_EDGE, LINE)


def connect(d, p1, s1, p2, s2, label="1:N", gap=14):
    """Rute ortogonal sederhana antar dua titik tepi."""
    x1, y1 = p1
    x2, y2 = p2
    if s1 in ("e", "w") and s2 in ("e", "w"):
        mx = (x1 + x2) / 2 if abs(x2 - x1) > gap else x1 + (gap if s1 == "e" else -gap)
        pts = [(x1, y1), (mx, y1), (mx, y2), (x2, y2)]
        head = "w" if s2 == "w" else "e"
    elif s1 in ("n", "s") and s2 in ("n", "s"):
        my = (y1 + y2) / 2
        pts = [(x1, y1), (x1, my), (x2, my), (x2, y2)]
        head = "n" if s2 == "n" else "s"
    else:
        pts = [(x1, y1), (x2, y1), (x2, y2)] if s1 in ("e", "w") else [(x1, y1), (x1, y2), (x2, y2)]
        head = {"n": "n", "s": "s", "e": "e", "w": "w"}[s2]
    line(d, pts, LINE, 2)
    arrow(d, (x2, y2), head)
    if label:
        mid = pts[len(pts) // 2]
        text(d, (mid[0] + 4, mid[1] - 13), label, F_EDGE, LINE)


def architecture():
    img, d = canvas(900, 470)
    text(d, (450, 12), "Arsitektur Laris", F_HEAD, INK, "ma")

    lanes = [
        (24, 206, "Klien (peramban)"),
        (250, 330, "Server Next.js 15 (App Router)"),
        (608, 268, "Layanan terkelola"),
    ]
    for x, w, name in lanes:
        r(d, (x, 44, x + w, 436), (250, 251, 249), (196, 204, 198), 1, 6)
        text(d, (x + w / 2, 52), name, F_TITLE, LINE, "ma")

    boxes = [
        Entity("Workspace UI", 40, 80, 174, ["React 19 + Tailwind 4",
                                             "Sesi terautentikasi"]),
        Entity("Mode /demo", 40, 168, 174, ["Data fiktif lokal",
                                            "localStorage peramban",
                                            "Parser deterministik"], accent=True),
        Entity("Pengenalan suara", 40, 290, 174, ["Web Speech API",
                                                  "Opsional, ada fallback"]),
        Entity("Server Components", 266, 80, 190, ["Guard sesi",
                                                   "Muat snapshot kerja"]),
        Entity("Server Actions", 266, 156, 190, ["Validasi Zod",
                                                 "Pemeriksaan peran",
                                                 "Panggil RPC"]),
        Entity("Route AI", 266, 250, 190, ["/api/ai/parse-order",
                                           "/api/ai/scan-receipt",
                                           "/api/ai/ask",
                                           "Rate limit + deadline"]),
        Entity("Middleware", 266, 364, 190, ["Refresh sesi",
                                             "Proteksi rute"]),
        Entity("Supabase Auth", 624, 80, 236, ["Email + sesi",
                                               "Reset password"]),
        Entity("PostgreSQL", 624, 156, 236, ["RLS per business",
                                             "Fungsi SECURITY DEFINER",
                                             "complete_sale, record_purchase"]),
        Entity("Storage", 624, 258, 236, ["Bucket gambar menu",
                                          "Unggah lewat server"]),
        Entity("Google Gemini", 624, 334, 236, ["Parsing, OCR, Tanya Laris",
                                                "Hanya mode cloud",
                                                "Kunci hanya di server"], accent=True),
    ]
    by = {b.name: b for b in boxes}
    for b in boxes:
        b.draw(d)

    connect(d, by["Workspace UI"].anchor("e"), "e",
            by["Server Components"].at("w", 0.4), "w", "render")
    connect(d, by["Workspace UI"].at("e", 0.8), "e",
            by["Server Actions"].at("w", 0.3), "w", "mutasi")
    connect(d, by["Pengenalan suara"].anchor("e"), "e",
            by["Route AI"].at("w", 0.75), "w", "teks")
    connect(d, by["Server Components"].anchor("e"), "e",
            by["Supabase Auth"].anchor("w"), "w", "verifikasi")
    connect(d, by["Server Actions"].anchor("e"), "e",
            by["PostgreSQL"].at("w", 0.35), "w", "RPC atomik")
    connect(d, by["Route AI"].anchor("e"), "e",
            by["Google Gemini"].anchor("w"), "w", "prompt")
    connect(d, by["Server Actions"].at("e", 0.8), "e",
            by["Storage"].at("w", 0.25), "w", "unggah")

    text(d, (24, 446),
         "Setiap permintaan halaman melewati middleware untuk penyegaran sesi. Mode demo "
         "lokal tidak memanggil Gemini dan tidak menulis ke Supabase; bantuan AI hanya "
         "menyarankan, sedangkan penulisan ledger tetap melalui RPC terverifikasi.",
         F_NOTE, LINE)
    img.save(ASSETS / "architecture.png")


def erd_commerce():
    img, d = canvas(900, 560)
    text(d, (450, 12), "ERD inti: penjualan, menu, resep, bahan", F_HEAD, INK, "ma")

    boxes = [
        Entity("business", 30, 48, 190, ["id uuid PK", "name, type", "settings jsonb"]),
        Entity("product", 30, 150, 190, ["id uuid PK", "business_id FK", "code unique",
                                         "name, category", "is_active bool"]),
        Entity("product_variant", 30, 288, 190, ["id uuid PK", "product_id FK",
                                                 "name, price bigint", "is_default bool"]),
        Entity("recipe_line", 30, 409, 190, ["variant_id FK", "inventory_item_id FK",
                                             "qty numeric(14,3)"]),
        Entity("inventory_item", 268, 409, 196, ["id uuid PK", "business_id FK",
                                                 "code, name, unit", "cost_per_unit numeric",
                                                 "reorder_level numeric"]),
        Entity("customer", 268, 48, 196, ["id uuid PK", "business_id FK",
                                          "name, phone", "visits int",
                                          "total_spend bigint", "points_balance bigint"]),
        Entity("sales_order", 520, 48, 230, ["id uuid PK", "business_id FK",
                                             "outlet_id FK", "customer_id FK null",
                                             "subtotal, tax, total bigint",
                                             "channel, status", "idempotency_key text"],
               accent=True),
        Entity("order_item", 520, 215, 230, ["id uuid PK", "order_id FK",
                                             "variant_id FK null", "product_code, name",
                                             "unit_price bigint", "unit_cost numeric(14,4)",
                                             "quantity numeric", "note text"], accent=True),
        Entity("payment", 520, 400, 230, ["id uuid PK", "order_id FK",
                                          "method, amount bigint", "cash_received, change"]),
    ]
    by = {b.name: b for b in boxes}
    for b in boxes:
        b.draw(d)

    connect(d, by["business"].anchor("s"), "s", by["product"].anchor("n"), "n")
    connect(d, by["product"].anchor("s"), "s", by["product_variant"].anchor("n"), "n")
    connect(d, by["product_variant"].anchor("s"), "s", by["recipe_line"].anchor("n"), "n")
    connect(d, by["recipe_line"].anchor("e"), "e", by["inventory_item"].anchor("w"), "w", "N:1")
    connect(d, by["sales_order"].anchor("s"), "s", by["order_item"].anchor("n"), "n")
    connect(d, by["customer"].anchor("e"), "e", by["sales_order"].at("w", 0.3), "w", "0..1:N")
    connect(d, by["product_variant"].at("e", 0.25), "e",
            by["order_item"].at("w", 0.2), "w", "0..1:N")
    path(d, [(750, 119), (806, 119), (806, 446), (750, 446)], "w", "1:N", (810, 270))

    text(d, (30, 536),
         "Kolom terpilih; relasi business yang berulang tidak digambar ulang. Tabel "
         "order_item menyimpan harga dan biaya saat transaksi, sehingga struk dan laporan "
         "lama tidak berubah ketika menu diperbarui.",
         F_NOTE, LINE)
    img.save(ASSETS / "erd-commerce.png")


def erd_operations():
    img, d = canvas(900, 510)
    text(d, (450, 12), "ERD operasional: identitas, pembelian, ledger stok", F_HEAD, INK, "ma")

    boxes = [
        Entity("auth.users", 30, 48, 176, ["id uuid PK", "email"]),
        Entity("membership", 30, 130, 176, ["business_id PK/FK", "user_id PK/FK",
                                            "role enum", "display_name"], accent=True),
        Entity("business", 30, 246, 176, ["id uuid PK", "name, type",
                                          "settings jsonb"]),
        Entity("outlet", 30, 345, 176, ["id uuid PK", "business_id FK",
                                        "name, address"]),
        Entity("supplier", 268, 48, 200, ["id uuid PK", "business_id FK",
                                          "name, phone", "note"]),
        Entity("purchase", 268, 164, 200, ["id uuid PK", "business_id FK",
                                           "outlet_id FK", "supplier_id FK null",
                                           "total bigint", "idempotency_key text"]),
        Entity("purchase_line", 268, 314, 200, ["id uuid PK", "purchase_id FK",
                                                "inventory_item_id FK", "qty numeric",
                                                "unit_cost numeric(14,4)"]),
        Entity("inventory_item", 528, 48, 204, ["id uuid PK", "code, name, unit",
                                                "cost_per_unit numeric",
                                                "reorder_level numeric"]),
        Entity("stock_movement", 528, 190, 204, ["id uuid PK", "outlet_id FK",
                                                 "inventory_item_id FK",
                                                 "qty_delta numeric", "type enum",
                                                 "ref_id uuid (logis)",
                                                 "unit_cost numeric"], accent=True),
        Entity("expense", 766, 48, 112, ["id uuid PK", "category",
                                         "amount bigint", "date"]),
        Entity("audit_log", 766, 190, 112, ["id uuid PK", "actor_id",
                                            "action, entity", "payload jsonb"]),
    ]
    by = {b.name: b for b in boxes}
    for b in boxes:
        b.draw(d)

    connect(d, by["auth.users"].anchor("s"), "s", by["membership"].anchor("n"), "n", "1:N")
    connect(d, by["business"].anchor("n"), "n", by["membership"].anchor("s"), "s", "1:N")
    connect(d, by["business"].anchor("s"), "s", by["outlet"].anchor("n"), "n")
    connect(d, by["supplier"].anchor("s"), "s", by["purchase"].anchor("n"), "n", "0..1:N")
    connect(d, by["purchase"].anchor("s"), "s", by["purchase_line"].anchor("n"), "n")
    connect(d, by["purchase_line"].at("e", 0.3), "e",
            by["inventory_item"].at("w", 0.85), "w", "N:1")
    connect(d, by["inventory_item"].anchor("s"), "s", by["stock_movement"].anchor("n"), "n")
    path(d, [(206, 382), (237, 382), (237, 452), (500, 452), (500, 311), (528, 311)],
         "w", "1:N", (330, 436))

    text(d, (30, 482),
         "Stok saat ini dihitung dari penjumlahan qty_delta pada stock_movement. Kolom "
         "ref_id menautkan pergerakan ke dokumen sumber secara logis, bukan sebagai "
         "foreign key yang dideklarasikan.",
         F_NOTE, LINE)
    img.save(ASSETS / "erd-operations.png")


if __name__ == "__main__":
    architecture()
    erd_commerce()
    erd_operations()
    for name in ("architecture", "erd-commerce", "erd-operations"):
        p = ASSETS / f"{name}.png"
        print(name, Image.open(p).size, f"{p.stat().st_size // 1024} KB")
