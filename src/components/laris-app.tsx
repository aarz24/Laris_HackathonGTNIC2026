"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowDownToLine, ArrowRight, ArrowUpRight, Banknote, Bell, BookOpen,
  CalendarDays, ChartNoAxesCombined, Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight,
  CircleHelp, ClipboardList, Cloud, Coffee, FileText, Gift, Grid2X2,
  Landmark, Leaf, LoaderCircle, LogOut, Menu, Mic, Minus, Package, Plus, Printer, ReceiptText,
  Search, Settings2, ShieldCheck, ShoppingBag, ShoppingBasket, SlidersHorizontal,
  Sparkles, Sprout, Store, Target, Trash2, TrendingUp, Upload, Users, Wallet, X,
  type LucideIcon,
} from "lucide-react";
import {
  createInitialState, products, inventory, currency, getStock, getCartTotal, completeSale,
  recordPurchase, parseOrder, exportSalesCsv, DEMO_DATE,
  type BusinessState, type CartItem, type Sale, type Product,
} from "@/lib/laris-data";
import {
  completeSaleAction, recordPurchaseAction, addExpenseAction,
  addCustomerAction, updateSettingsAction,
} from "@/app/actions";
import { signOutAction } from "@/app/login/actions";
import type { Role } from "@/lib/repo";
import { AiBadge, CafeIllustration, EmptyState, LarisMark, RevenueChart, ScoreRing, Sparkline, Trend } from "./laris-visuals";

export interface LarisAppProps {
  mode?: "cloud" | "local";
  initialState?: BusinessState;
  today?: string;
  user?: { email: string; role: Role };
  notice?: string;
}

type View = "overview" | "pos" | "transactions" | "products" | "inventory" | "purchases" | "customers" | "storefront" | "finance" | "team";
type ModalName = "assistant" | "voice" | "checkout" | "receipt" | "purchase" | "expense" | "settings" | "guide" | "notifications" | "search" | "recipe" | "forecast" | "customer" | null;
const navigation: { label?: string; items: { id: View; label: string; icon: LucideIcon; badge?: string }[] }[] = [
  { items: [{ id: "overview", label: "Ringkasan", icon: Grid2X2 }, { id: "pos", label: "Kasir", icon: ShoppingBasket }, { id: "transactions", label: "Transaksi", icon: ReceiptText }] },
  { label: "OPERASIONAL", items: [{ id: "products", label: "Produk & resep", icon: Coffee }, { id: "inventory", label: "Stok bahan", icon: Package, badge: "3" }, { id: "purchases", label: "Pembelian", icon: ShoppingBag }] },
  { label: "KEMBANGKAN USAHA", items: [{ id: "customers", label: "Pelanggan", icon: Users }, { id: "storefront", label: "Etalase online", icon: Store }, { id: "finance", label: "Keuangan", icon: ChartNoAxesCombined }, { id: "team", label: "Tim & akses", icon: ShieldCheck }] },
];
const pageNames = Object.fromEntries(navigation.flatMap(group => group.items.map(item => [item.id, item.label]))) as Record<View, string>;
const STORAGE_KEY = "laris-kopi-senja-v1";
const shortDate = (date: string) => new Date(date).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
const time = (date: string) => new Date(date).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
const initials = (name: string) => name.split(" ").slice(0, 2).map(part => part[0]).join("").toUpperCase();
const sum = (sales: Sale[]) => sales.reduce((total, sale) => total + sale.total, 0);
const costs = (sales: Sale[]) => sales.reduce((total, sale) => total + sale.items.reduce((cost, item) => cost + (products.find(product => product.id === item.productId)?.cost || 0) * item.quantity, 0), 0);

function Modal({ title, description, children, onClose, wide = false }: { title: string; description?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key !== "Tab") return;
      const elements = ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea, select, a[href], [tabindex="0"]');
      const visible = Array.from(elements || []).filter(element => element.offsetParent !== null);
      const first = visible[0], last = visible[visible.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", onKey); previous?.focus(); };
  }, []);
  return <div className="modal-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}><div ref={ref} tabIndex={-1} className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><h2 id="modal-title">{title}</h2>{description && <p>{description}</p>}</div><button className="icon-button" aria-label="Tutup dialog" onClick={onClose}><X size={20}/></button></div>{children}</div></div>;
}

function Badge({ children, tone = "green" }: { children: ReactNode; tone?: string }) { return <span className={`badge ${tone}`}>{children}</span>; }
function SectionHeading({ title, subtitle, action, onAction }: { title: string; subtitle?: string; action?: string; onAction?: () => void }) { return <div className="section-heading"><div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>{action && <button className="text-button" onClick={onAction}>{action}<ArrowUpRight size={14}/></button>}</div>; }

export default function LarisApp({ mode = "local", initialState, today, user, notice }: LarisAppProps = {}) {
  const activeToday = today || DEMO_DATE;
  const day = (offset: number) => { const date = new Date(`${activeToday}T12:00:00`); date.setDate(date.getDate() + offset); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; };
  const [state, setState] = useState<BusinessState>(() => initialState ?? createInitialState(activeToday));
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [modal, setModal] = useState<ModalName>(null);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [period, setPeriod] = useState("today");
  const [chartPeriod, setChartPeriod] = useState("week");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Semua menu");
  const [payment, setPayment] = useState<Sale["payment"]>("QRIS");
  const [cash, setCash] = useState("");
  const [discount, setDiscount] = useState(0);
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [voiceText, setVoiceText] = useState("");
  const [parsed, setParsed] = useState<ReturnType<typeof parseOrder> | null>(null);
  const [recording, setRecording] = useState(false);
  const [assistantInput, setAssistantInput] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product>(products[0]);
  const [purchaseItem, setPurchaseItem] = useState("milk");
  const [segment, setSegment] = useState("Semua");
  const [notificationsRead, setNotificationsRead] = useState(false);
  const [guideStep, setGuideStep] = useState(0);
  const [transactionPage, setTransactionPage] = useState(0);
  const [transactionMethod, setTransactionMethod] = useState("Semua");
  const [photoName, setPhotoName] = useState("");
  const [pendingCheckout, setPendingCheckout] = useState(false);
  const [pendingAi, setPendingAi] = useState(false);
  const [pendingScan, setPendingScan] = useState(false);
  const [scanHikeAlert, setScanHikeAlert] = useState<{ rawName: string; name: string; oldCost: number; unitCost: number; diffPercent: number } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speech = useRef<{ stop: () => void } | null>(null);

  const notify = useCallback((text: string) => { setToast(text); if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(""), 4500); }, []);
  const go = useCallback((next: View) => { setView(next); setQuery(""); setSidebarOpen(false); setError(""); window.history.replaceState(null, "", `#${next}`); window.scrollTo({ top: 0, behavior: "instant" }); }, []);
  const open = (next: ModalName) => { setError(""); setModal(next); };
  const close = () => { speech.current?.stop(); setRecording(false); setModal(null); setError(""); setScanHikeAlert(null); };

  useEffect(() => {
    if (mode === "cloud") {
      const hash = window.location.hash.slice(1) as View;
      if (pageNames[hash]) setView(hash);
      setReady(true);
      return () => { if (toastTimer.current) clearTimeout(toastTimer.current); speech.current?.stop(); };
    }
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved) as BusinessState;
        if (data.version === 1 && Array.isArray(data.sales) && Array.isArray(data.stockMovements) && Array.isArray(data.customers) && Array.isArray(data.expenses) && Array.isArray(data.purchases) && data.business?.name && Number.isFinite(data.dayTarget)) setState(data);
      }
    } catch { notify("Data tersimpan tidak dapat dibaca. Data demo dimuat kembali."); }
    const hash = window.location.hash.slice(1) as View;
    if (pageNames[hash]) setView(hash);
    setReady(true);
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); speech.current?.stop(); };
  }, [notify, mode]);

  useEffect(() => {
    if (ready && mode === "local") { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { notify("Penyimpanan browser penuh. Perubahan hanya tersedia di sesi ini."); } }
  }, [state, ready, notify, mode]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "k") { event.preventDefault(); setModal("search"); setQuery(""); }
      if (event.key === "Escape") setSidebarOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const todaySales = useMemo(() => state.sales.filter(sale => sale.createdAt.slice(0, 10) === activeToday), [state.sales, activeToday]);
  const rangeDays = period === "today" ? 1 : period === "week" ? 7 : 30;
  const rangeSales = state.sales.filter(sale => sale.createdAt.slice(0, 10) >= day(1 - rangeDays) && sale.createdAt.slice(0, 10) <= activeToday);
  const previousSales = state.sales.filter(sale => sale.createdAt.slice(0, 10) >= day(1 - rangeDays * 2) && sale.createdAt.slice(0, 10) < day(1 - rangeDays));
  const revenue = sum(rangeSales), previousRevenue = sum(previousSales), gross = revenue - costs(rangeSales);
  const average = Math.round(revenue / Math.max(rangeSales.length, 1));
  const growth = previousRevenue ? ((revenue - previousRevenue) / previousRevenue) * 100 : 0;
  const lowStock = inventory.filter(item => getStock(state, item.id) <= item.reorderPoint);
  const topProducts = products.map(product => ({ ...product, count: rangeSales.reduce((total, sale) => total + sale.items.filter(item => item.productId === product.id).reduce((count, item) => count + item.quantity, 0), 0) })).sort((a, b) => b.count - a.count);
  const cartSubtotal = getCartTotal(cart).subtotal;
  const appliedDiscount = Math.min(discount, cartSubtotal);
  const cartTotal = getCartTotal(cart, appliedDiscount, taxEnabled);
  const cartCount = cart.reduce((total, item) => total + item.quantity, 0);
  const chartDates = chartPeriod === "week" ? Array.from({ length: 7 }, (_, i) => day(i - 6)) : Array.from({ length: 7 }, (_, i) => day(-30 + i * 5));
  const chartValues = chartDates.map(date => sum(state.sales.filter(sale => sale.createdAt.slice(0, 10) >= date && sale.createdAt.slice(0, 10) <= (chartPeriod === "week" ? date : day(Math.min(0, Math.round((new Date(date).getTime() - new Date(activeToday).getTime()) / 86400000) + 4))))));
  const chartPrevious = chartDates.map(date => { const offset = Math.round((new Date(date).getTime() - new Date(activeToday).getTime()) / 86400000); return sum(state.sales.filter(sale => sale.createdAt.slice(0, 10) >= day(offset - (chartPeriod === "week" ? 7 : 35)) && sale.createdAt.slice(0, 10) <= day(offset - (chartPeriod === "week" ? 7 : 35) + (chartPeriod === "week" ? 0 : 4)))); });
  const filteredProducts = products.filter(product => (category === "Semua menu" || product.category === category) && product.name.toLowerCase().includes(query.toLowerCase()));

  function addProduct(product: Product) {
    setCart(current => { const found = current.find(item => item.productId === product.id); return found ? current.map(item => item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item) : [...current, { productId: product.id, quantity: 1 }]; });
  }
  function updateQuantity(id: string, amount: number) { setCart(current => current.map(item => item.productId === id ? { ...item, quantity: item.quantity + amount } : item).filter(item => item.quantity > 0)); }

  async function checkout(event: FormEvent) {
    event.preventDefault(); setError("");
    if (mode === "cloud") {
      setPendingCheckout(true);
      try {
        const res = await completeSaleAction({
          items: cart.map(i => ({ productId: i.productId, quantity: i.quantity, ...(i.note ? { note: i.note } : {}) })),
          payment,
          cashReceived: payment === "Tunai" ? Number(cash) : cartTotal.total,
          customerName: customerName.trim() || undefined,
          customerPhone: customerPhone.trim() || undefined,
          discount: appliedDiscount,
          taxEnabled,
          channel: view === "storefront" ? "Etalase" : "Kasir",
          idempotencyKey: crypto.randomUUID(),
        });
        if (!res.ok) {
          setError(res.error);
          setPendingCheckout(false);
          return;
        }
        setState(current => ({
          ...current,
          sales: [...current.sales, res.data.sale],
          stockMovements: [...current.stockMovements, ...res.data.stockMovements],
          customers: res.data.customer
            ? (current.customers.some(c => c.id === res.data.customer!.id)
                ? current.customers.map(c => c.id === res.data.customer!.id ? res.data.customer! : c)
                : [...current.customers, res.data.customer!])
            : current.customers,
        }));
        setReceipt(res.data.sale); setCart([]); setDiscount(0); setTaxEnabled(false); setCash(""); setCustomerName(""); setCustomerPhone(""); setModal("receipt"); notify("Transaksi tersimpan di cloud Supabase. Stok bahan otomatis diperbarui.");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Transaksi belum dapat disimpan.");
      } finally {
        setPendingCheckout(false);
      }
      return;
    }

    try {
      const result = completeSale(state, { items: cart, payment, cashReceived: payment === "Tunai" ? Number(cash) : cartTotal.total, customerName: customerName.trim() || undefined, customerPhone: customerPhone.trim() || undefined, discount: appliedDiscount, taxEnabled, channel: view === "storefront" ? "Etalase" : "Kasir" });
      setState(result.state); setReceipt(result.sale); setCart([]); setDiscount(0); setTaxEnabled(false); setCash(""); setCustomerName(""); setCustomerPhone(""); setModal("receipt"); notify("Transaksi tercatat. Stok bahan otomatis diperbarui.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Transaksi belum dapat disimpan."); }
  }

  function downloadCsv() {
    const blob = new Blob(["\uFEFF", exportSalesCsv(state)], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `Laris-penjualan-${activeToday}.csv`; link.click(); URL.revokeObjectURL(link.href); notify("Laporan CSV diunduh. Dapat dibuka di Excel.");
  }

  async function askAssistant(question: string) {
    if (!question.trim()) return;
    const userMsg = question.trim();
    setAssistantInput("");
    setMessages(current => [...current, { role: "user", text: userMsg }]);
    setPendingAi(true);

    try {
      const res = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: userMsg, history: messages }),
      });
      if (!res.ok) throw new Error("Gagal menghubungi Tanya Laris.");
      const data = await res.json();
      setMessages(current => [...current, { role: "assistant", text: data.answer }]);
    } catch {
      const text = userMsg.toLowerCase();
      let answer = "Saya bisa membantu membaca omzet, produk terlaris, stok bahan, dan keuntungan dari data demo Kopi Senja. Coba tanyakan: ‘Menu apa yang paling laris hari ini?’";
      if (/stok|belanja|bahan|susu/.test(text)) answer = `Ada ${lowStock.length} bahan yang perlu diperhatikan: ${lowStock.map(item => `${item.name} tersisa ${getStock(state, item.id).toLocaleString("id-ID")} ${item.unit}`).join(", ")}. Prioritaskan belanja bahan ini sebelum kedai kembali ramai. Buka Stok bahan untuk mencatat pembelian.`;
      else if (/untung|margin|laba/.test(text)) answer = `Dari ${rangeSales.length} transaksi pada periode terpilih, omzetmu ${currency(revenue)} dengan HPP ${currency(costs(rangeSales))}. Jadi, untung kotornya ${currency(gross)} (margin ${revenue ? (gross / revenue * 100).toFixed(1) : 0}%). Ini belum dikurangi biaya operasional. Lihat Keuangan untuk rincian.`;
      else if (/menu|laris|produk/.test(text)) answer = `${topProducts[0].name} jadi favorit pelanggan dengan ${topProducts[0].count} porsi terjual, menyumbang ${currency(topProducts[0].count * topProducts[0].price)} sebelum diskon. Disusul ${topProducts[1].name} (${topProducts[1].count} porsi). Coba tawarkan paket kopi + pastry untuk meningkatkan nilai setiap pesanan.`;
      else if (/omzet|penjualan|sabtu|turun|hari|ringkas/.test(text)) answer = `Omzet periode ini ${currency(revenue)}, ${growth >= 0 ? "naik" : "turun"} ${Math.abs(growth).toFixed(1)}% dibanding periode sebelumnya, dari ${rangeSales.length} transaksi. Rata-rata belanja ${currency(average)}. Data ini menunjukkan perubahan penjualan, tetapi belum cukup untuk memastikan penyebabnya. Periksa tren harian dan ketersediaan menu.`;
      setMessages(current => [...current, { role: "assistant", text: answer }]);
    } finally {
      setPendingAi(false);
    }
  }

  async function handleVoiceParse(text: string) {
    if (!text.trim()) return;
    setError("");
    setPendingAi(true);
    try {
      const res = await fetch("/api/ai/parse-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error("Gagal mengurai pesanan.");
      const data = await res.json();
      setParsed({
        items: data.items,
        payment: data.payment,
        unknown: data.unknown || [],
      });
      if (data.source === "gemini") {
        notify("Pesanan diuraikan oleh Gemini AI ✨");
      }
    } catch {
      setParsed(parseOrder(text));
    } finally {
      setPendingAi(false);
    }
  }

  function startVoice() {
    type SpeechResult = { results: { 0: { 0: { transcript: string } } } };
    type Recognition = { lang: string; interimResults: boolean; onresult: (event: SpeechResult) => void; onerror: () => void; onend: () => void; start: () => void; stop: () => void };
    const browser = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Constructor = browser.SpeechRecognition || browser.webkitSpeechRecognition;
    if (!Constructor) { setError("Browser ini belum mendukung input suara. Ketik pesanan di bawah, ya."); return; }
    try {
      const recognition = new Constructor(); recognition.lang = "id-ID"; recognition.interimResults = false;
      recognition.onresult = event => {
        const transcript = event.results[0][0].transcript;
        setVoiceText(transcript);
        handleVoiceParse(transcript);
      };
      recognition.onerror = () => { setRecording(false); setError("Mikrofon tidak tersedia atau izin belum diberikan. Gunakan input teks."); };
      recognition.onend = () => setRecording(false);
      speech.current = recognition; recognition.start(); setRecording(true);
    } catch { setError("Input suara tidak tersedia. Silakan ketik pesanan."); }
  }

  async function handleReceiptScan(file: File) {
    setPhotoName(file.name);
    setPendingScan(true);
    setError("");
    setScanHikeAlert(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/ai/scan-receipt", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Gagal membaca nota.");
      const data = await res.json();
      if (data.lines && data.lines.length > 0) {
        const item = data.lines[0];
        setPurchaseItem(item.matchedCode || "milk");
        const qtyEl = document.querySelector<HTMLInputElement>('input[name="quantity"]');
        const totalEl = document.querySelector<HTMLInputElement>('input[name="total"]');
        if (qtyEl) qtyEl.value = String(item.quantity);
        if (totalEl) totalEl.value = String(item.total);

        if (item.priceHike) {
          setScanHikeAlert(item);
        }
        notify(`Nota dipindai (${data.source === "gemini" ? "Gemini AI" : "OCR"}): ${item.name} (${item.quantity} ${item.unit}) - ${currency(item.total)}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memindai nota.");
    } finally {
      setPendingScan(false);
    }
  }

  async function submitPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const itemId = String(form.get("itemId"));
    const quantity = Number(form.get("quantity"));
    const total = Number(form.get("total"));

    if (mode === "cloud") {
      try {
        const res = await recordPurchaseAction({
          lines: [{ itemId, quantity, total }],
          source: photoName ? "scan" : "manual",
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setState(current => ({
          ...current,
          purchases: [...current.purchases, ...res.data.purchases],
          stockMovements: [...current.stockMovements, ...res.data.stockMovements],
        }));
        close();
        notify("Pembelian disimpan di cloud dan stok bahan bertambah.");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Pembelian gagal disimpan.");
      }
      return;
    }

    try { setState(recordPurchase(state, { itemId, quantity, total })); close(); notify("Pembelian dicatat dan stok bahan bertambah."); } catch (caught) { setError(caught instanceof Error ? caught.message : "Pembelian gagal disimpan."); }
  }

  async function submitExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const amount = Number(form.get("amount"));
    const description = String(form.get("description")).trim();
    const expCategory = String(form.get("category"));
    if (!Number.isSafeInteger(amount) || amount <= 0 || !description) {
      setError("Isi keperluan dan jumlah rupiah bulat yang lebih dari nol.");
      return;
    }
    if (mode === "cloud") {
      const res = await addExpenseAction({ description, category: expCategory, amount });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setState(current => ({ ...current, expenses: [...current.expenses, res.data] }));
      close();
      notify("Pengeluaran berhasil dicatat di cloud.");
      return;
    }
    setState(current => ({ ...current, expenses: [...current.expenses, { id: crypto.randomUUID(), description, category: expCategory, amount, createdAt: `${activeToday}T12:00:00.000Z` }] }));
    close();
    notify("Pengeluaran berhasil dicatat.");
  }

  async function submitCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name")).trim();
    const phone = String(form.get("phone")).trim();
    if (!name || !/^\+?\d{8,15}$/.test(phone)) {
      setError("Isi nama dan nomor telepon 8–15 digit yang valid.");
      return;
    }
    if (mode === "cloud") {
      const res = await addCustomerAction({ name, phone });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setState(current => ({ ...current, customers: [...current.customers, res.data] }));
      close();
      notify("Pelanggan baru berhasil ditambahkan di cloud.");
      return;
    }
    if (state.customers.some(customer => customer.phone === phone)) {
      setError("Nomor ini sudah terdaftar sebagai pelanggan.");
      return;
    }
    setState(current => ({ ...current, customers: [...current.customers, { id: crypto.randomUUID(), name, phone, visits: 0, totalSpent: 0, lastVisit: `${activeToday}T12:00:00.000Z`, segment: "Potensial", points: 0 }] }));
    close();
    notify("Pelanggan baru berhasil ditambahkan.");
  }

  async function submitSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name")).trim();
    const owner = String(form.get("owner")).trim();
    const outlet = String(form.get("outlet")).trim();
    const dayTarget = Number(form.get("target"));
    if (!name || !owner || !outlet || !Number.isSafeInteger(dayTarget) || dayTarget <= 0) {
      setError("Lengkapi profil dan target penjualan yang valid.");
      return;
    }
    if (mode === "cloud") {
      const res = await updateSettingsAction({ name, owner, outlet, dayTarget });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setState(current => ({ ...current, business: { name, owner, outlet }, dayTarget }));
      close();
      notify("Pengaturan usaha berhasil diperbarui di cloud.");
      return;
    }
    setState(current => ({ ...current, business: { name, owner, outlet }, dayTarget }));
    close();
    notify("Profil usaha diperbarui.");
  }

  const renderTransactions = (compact = false) => {
    const transactions = [...(compact ? todaySales : state.sales)].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).filter(sale => (transactionMethod === "Semua" || sale.payment === transactionMethod) && `${sale.id} ${sale.customerName}`.toLowerCase().includes(query.toLowerCase()));
    const displayed = compact ? transactions.slice(0, 4) : transactions.slice(transactionPage * 12, transactionPage * 12 + 12);
    return <><div className="table-scroll"><table><thead><tr><th>Transaksi</th><th>Pelanggan</th><th>Metode</th><th>Total</th><th>Status</th><th aria-label="Detail"/></tr></thead><tbody>{displayed.map(sale => <tr key={sale.id}><td><strong className="transaction-id">#{sale.id.slice(-6).toUpperCase()}</strong><small>{compact ? time(sale.createdAt) : `${shortDate(sale.createdAt)} · ${time(sale.createdAt)}`}</small></td><td>{sale.customerName || "Pelanggan umum"}</td><td><span className="payment-label">{sale.payment === "QRIS" ? <Grid2X2 size={13}/> : sale.payment === "Tunai" ? <Banknote size={14}/> : <Landmark size={13}/>}{sale.payment}</span></td><td><strong>{currency(sale.total)}</strong></td><td><Badge><span className="status-dot"/>Lunas</Badge></td><td><button className="icon-button" aria-label={`Lihat transaksi ${sale.id}`} onClick={() => { setReceipt(sale); open("receipt"); }}><ChevronRight size={16}/></button></td></tr>)}</tbody></table></div>{displayed.length === 0 && <EmptyState title="Belum ada transaksi" description="Coba kata kunci lain atau catat transaksi pertamamu."/>}{!compact && <div className="table-pagination"><span>{transactions.length.toLocaleString("id-ID")} transaksi · Halaman {transactionPage + 1}</span><div><button className="button secondary small" disabled={transactionPage === 0} onClick={() => setTransactionPage(p => p - 1)}><ChevronLeft size={15}/>Sebelumnya</button><button className="button secondary small" disabled={(transactionPage + 1) * 12 >= transactions.length} onClick={() => setTransactionPage(p => p + 1)}>Berikutnya<ChevronRight size={15}/></button></div></div>}</>;
  };

  const renderProductCards = (shop = false) => <div className={`product-grid ${shop ? "shop-grid" : ""}`}>{filteredProducts.map(product => {
    const available = product.recipe.every(line => getStock(state, line.itemId) >= line.quantity);
    return <article className="product-card" key={product.id}><div className="product-photo"><Image src={product.image} alt={product.name} width={400} height={400}/>{product.id === "kopi-susu" && <span className="product-tag"><TrendingUp size={11}/>Terlaris</span>}{!available && <span className="product-unavailable">Stok habis</span>}</div><div className="product-info"><small>{product.category}</small><h3>{product.name}</h3><div><strong>{currency(product.price)}</strong><button disabled={!available} className="add-product" aria-label={`Tambah ${product.name}`} onClick={() => { addProduct(product); if (shop) notify(`${product.name} ditambahkan ke pesanan.`); }}><Plus size={18}/></button></div></div></article>;
  })}{filteredProducts.length === 0 && <EmptyState title="Menu tidak ditemukan" description="Coba cari dengan nama menu yang lain."/>}</div>;

  return <div className="app-shell">
    {sidebarOpen && <button className="sidebar-overlay" onClick={() => setSidebarOpen(false)} aria-label="Tutup navigasi"/>}
    <aside className={`sidebar ${sidebarOpen ? "open" : ""}`} aria-label="Navigasi utama">
      <button className="brand" onClick={() => go("overview")} aria-label="Laris beranda"><LarisMark/><span>laris<span className="brand-period">.</span></span></button>
      <button className="business-switcher" onClick={() => open("settings")}><span className="business-avatar"><Coffee size={20}/></span><span><strong>{state.business.name}</strong><small><span className="status-dot"/> {state.business.outlet}</small></span><ChevronDown size={15}/></button>
      <nav>{navigation.map((group, i) => <div className="nav-group" key={i}>{group.label && <p>{group.label}</p>}{group.items.map(item => <button key={item.id} className={`nav-item ${view === item.id ? "active" : ""}`} onClick={() => go(item.id)} aria-current={view === item.id ? "page" : undefined}><item.icon size={18} strokeWidth={1.7}/><span>{item.label}</span>{item.badge && lowStock.length > 0 && <span className="nav-badge">{lowStock.length}</span>}{item.id === "storefront" && <ArrowUpRight className="nav-external" size={13}/>}</button>)}</div>)}</nav>
      <div className="sidebar-bottom"><button className="growth-card" onClick={() => open("guide")}><span className="growth-icon"><Sprout size={22}/></span><strong>Usaha tumbuh, bareng Laris.</strong><span>Mulai langkah kecil hari ini.</span><b>Jelajahi panduan <ArrowUpRight size={14}/></b></button><button className="nav-item" onClick={() => open("settings")}><Settings2 size={18} strokeWidth={1.7}/><span>Pengaturan</span></button><button className="nav-item" onClick={() => open("guide")}><CircleHelp size={18} strokeWidth={1.7}/><span>Bantuan & panduan</span><ArrowUpRight size={13}/></button>{mode === "cloud" ? <div className="sidebar-footer" style={{ color: "var(--green)" }}><Cloud size={13}/><span>Cloud · {user?.role || "online"}</span></div> : <div className="sidebar-footer"><span className="status-dot"/> Mode demo lokal <span>v0.1</span></div>}</div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Buka navigasi"><Menu size={22}/></button><span className="breadcrumb-home"><Store size={16}/><span>Workspace</span><ChevronRight size={13}/></span><strong>{pageNames[view]}</strong></div><div className="topbar-actions"><button className="global-search" onClick={() => { setQuery(""); open("search"); }}><Search size={15}/><span>Cari apa saja...</span><kbd>⌘K</kbd></button>{mode === "cloud" ? <span className="demo-badge"><Cloud size={13}/> Cloud Supabase</span> : <span className="demo-badge"><span className="status-dot"/>Demo interaktif</span>}<span className="topbar-divider"/><button className="notification-button icon-button" aria-label="Notifikasi" onClick={() => { open("notifications"); setNotificationsRead(true); }}><Bell size={19}/>{!notificationsRead && <i/>}</button><button className="profile-button" aria-label={`Pengaturan profil ${state.business.owner}`} onClick={() => open("settings")}>{initials(state.business.owner || "Laris")}<span/></button>{mode === "cloud" && <form action={signOutAction} style={{ display: "inline-flex" }}><button className="icon-button" type="submit" aria-label="Keluar akun" title={`Keluar (${user?.email || ""})`}><LogOut size={16}/></button></form>}</div></header>
      {notice && <div className="notice amber" style={{ margin: "16px 24px 0" }}><ShieldCheck size={18}/><span>{notice}</span></div>}
      <main id="main-content" className={`main-content ${view === "pos" ? "pos-main" : ""}`}>
        <div className="page-heading"><div><div className="eyebrow">{view === "overview" ? (activeToday === DEMO_DATE ? "MINGGU, 18 OKTOBER 2026" : new Date(`${activeToday}T12:00:00`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).toUpperCase()) : "KOPI SENJA · WORKSPACE"}</div><h1>{view === "overview" ? <>Selamat pagi, {state.business.owner.split(" ")[0]} <span className="greeting-sun">✳</span></> : view === "pos" ? "Bikin hari ini makin laris." : pageNames[view]}</h1><p>{({ overview: "Usahamu hari ini, dalam satu pandangan. Yuk, buat hari yang baik.", pos: "Pesanan lancar, pelanggan senang. Siap melayani?", transactions: "Setiap transaksi tercatat. Tidak ada yang terlewat.", products: "Menu andalan, resep terjaga, keuntungan terencana.", inventory: "Kenali bahanmu. Cegah kehabisan sebelum terjadi.", purchases: "Belanja lebih terencana, stok selalu terjaga.", customers: "Kenali yang datang. Beri alasan untuk kembali.", storefront: "Etalase Kopi Senja — pratinjau pemesanan pelanggan.", finance: "Tahu uangmu ke mana. Tahu usahamu bertumbuh.", team: "Orang-orang hebat di balik setiap cangkir." })[view]}</p></div><div className="heading-actions">{view === "overview" ? <><button className="button secondary" onClick={() => go("finance")}><ArrowDownToLine size={15}/>Lihat laporan</button><button className="button primary" onClick={() => go("pos")}><Plus size={17}/>Transaksi baru</button></> : view === "purchases" || view === "inventory" ? <button className="button primary" onClick={() => open("purchase")}><Plus size={17}/>Catat pembelian</button> : view === "finance" ? <><button className="button secondary" onClick={downloadCsv}><ArrowDownToLine size={16}/>Ekspor CSV</button><button className="button primary" onClick={() => open("expense")}><Plus size={16}/>Catat pengeluaran</button></> : view === "transactions" ? <button className="button secondary" onClick={downloadCsv}><ArrowDownToLine size={16}/>Ekspor transaksi</button> : view === "customers" ? <button className="button primary" onClick={() => open("customer")}><Plus size={16}/>Tambah pelanggan</button> : view === "pos" ? <button className="button voice-button" onClick={() => { setParsed(null); setVoiceText(""); open("voice"); }}><Mic size={17}/>Catat pakai suara<AiBadge/></button> : null}</div></div>

        {view === "overview" && <>
          <section className="welcome-banner"><div className="welcome-copy"><span className="banner-eyebrow"><span className="tiny-spark"><Sparkles size={12}/></span> PARTNER USAHA, SETIAP HARI</span><h2>Fokus bikin pelanggan senang.<br/>Ribetnya, biar Laris yang bantu.</h2><p>Dari catat penjualan sampai tahu kapan harus belanja.<br className="desktop-break"/> Lebih tenang mengelola, lebih semangat berkembang.</p><button className="banner-button" onClick={() => open("assistant")}><Sparkles size={15}/>Tanya Laris<ArrowUpRight size={15}/></button></div><CafeIllustration/><div className="banner-caption"><span className="status-dot"/> Usaha kecil, mimpi besar.</div></section>
          <div className="overview-section-title"><h2>Gimana usahamu hari ini?</h2><div className="date-filter"><CalendarDays size={14}/><select aria-label="Periode ringkasan" value={period} onChange={event => setPeriod(event.target.value)}><option value="today">Hari ini, 18 Okt 2026</option><option value="week">7 hari terakhir</option><option value="month">30 hari terakhir</option></select><ChevronDown size={13}/></div></div>
          <section className="kpi-grid" aria-label="Ringkasan kinerja">{[
            { label: "Total penjualan", value: currency(revenue), icon: Wallet, change: growth, color: "green", detail: "Penjualan kotor tercatat" },
            { label: "Total transaksi", value: rangeSales.length.toLocaleString("id-ID"), icon: ReceiptText, change: previousSales.length ? (rangeSales.length - previousSales.length) / previousSales.length * 100 : 0, color: "orange", detail: "Pesanan berhasil dilayani" },
            { label: "Rata-rata belanja", value: currency(average), icon: ShoppingBag, change: previousSales.length && previousRevenue ? (average / (previousRevenue / previousSales.length) - 1) * 100 : 0, color: "purple", detail: "Di setiap transaksi" },
            { label: "Untung kotor", value: currency(gross), icon: ChartNoAxesCombined, change: previousRevenue - costs(previousSales) ? (gross / (previousRevenue - costs(previousSales)) - 1) * 100 : 0, color: "blue", detail: `Margin ${revenue ? (gross / revenue * 100).toFixed(1).replace(".", ",") : 0}%` },
          ].map((metric, i) => <article className={`kpi-card kpi-${metric.color}`} key={metric.label}><div className="kpi-top"><span>{metric.label}</span><span className={`metric-icon ${metric.color}`}><metric.icon size={16} strokeWidth={1.7}/></span></div><div className="kpi-value-row"><strong>{metric.value}</strong><Sparkline variant={i} color={metric.color === "orange" || metric.color === "blue" ? "var(--saffron)" : "var(--green)"}/></div><div className="kpi-bottom"><Trend value={metric.change}/><span>{metric.detail}</span></div></article>)}</section>
          <div className="dashboard-columns"><div className="dashboard-primary">
            <section className="panel revenue-panel"><div className="section-heading"><div><h3>Grafik penjualan</h3><p>Langkah kecilmu, terlihat di sini.</p></div><div className="segmented"><button className={chartPeriod === "week" ? "selected" : ""} onClick={() => setChartPeriod("week")}>Minggu ini</button><button className={chartPeriod === "month" ? "selected" : ""} onClick={() => setChartPeriod("month")}>Bulan ini</button></div></div><div className="chart-summary"><strong>{currency(chartValues.reduce((total, value) => total + value, 0))}</strong><span className="chart-legend"><i/>Periode ini <i className="previous"/>Periode lalu</span></div><RevenueChart values={chartValues} previous={chartPrevious} labels={chartDates.map(date => chartPeriod === "week" ? new Date(`${date}T12:00:00`).toLocaleDateString("id-ID", { weekday: "short" }) : shortDate(date))}/><div className="chart-footer"><span><span className="mini-insight"><TrendingUp size={13}/></span>Setiap transaksi adalah langkah maju. Terus bertumbuh!</span><button className="text-button" onClick={() => go("transactions")}>Lihat detail<ArrowRight size={14}/></button></div></section>
            <section className="panel bestsellers-panel"><SectionHeading title="Menu paling dicintai" subtitle="Favorit pelanggan yang bikin kasir sibuk." action="Semua menu" onAction={() => go("products")}/><div className="table-scroll"><table className="bestsellers-table"><thead><tr><th>Nama menu</th><th>Terjual</th><th>Penjualan</th><th>Kontribusi</th></tr></thead><tbody>{topProducts.slice(0, 4).map((product, i) => <tr key={product.id}><td><div className="table-product"><span className="product-rank">{String(i + 1).padStart(2, "0")}</span><Image src={product.image} alt="" width={39} height={39}/><div><strong>{product.name}</strong><small>{product.category}</small></div>{i === 0 && <span className="tiny-best"><TrendingUp size={12}/></span>}</div></td><td>{product.count}<span className="muted"> porsi</span></td><td><strong>{currency(product.count * product.price)}</strong></td><td><div className="contribution"><div><span style={{ width: `${Math.min(100, product.count * product.price / Math.max(revenue, 1) * 100)}%` }}/></div><span>{Math.round(product.count * product.price / Math.max(revenue, 1) * 100)}%</span></div></td></tr>)}</tbody></table></div></section>
          </div><div className="dashboard-secondary">
            <section className="insight-card"><div className="insight-title"><span><Sparkles size={17}/>Catatan kecil dari Laris</span><AiBadge/></div><h3>Menu andalanmu lagi dicari.</h3><p><strong>{topProducts[0].name}</strong> terjual {topProducts[0].count} porsi {period === "today" ? "hari ini" : "di periode ini"}. Coba pasangkan dengan pastry untuk tambah untung.</p><button onClick={() => { open("assistant"); askAssistant("Menu apa yang paling laris hari ini?"); }}>Cari peluang lainnya<ArrowUpRight size={14}/></button><span className="insight-decor"><Sparkles size={65} strokeWidth={.7}/></span></section>
            <section className="panel stock-panel"><SectionHeading title="Stok perlu perhatian"/><p className="stock-subtitle"><span className="amber-dot"/>{lowStock.length} bahan mulai menipis</p><div className="stock-list">{lowStock.slice(0, 3).map((item, i) => <div key={item.id} className="stock-item"><span className={`stock-item-icon stock-${i}`}><Package size={18} strokeWidth={1.5}/></span><div><strong>{item.name}</strong><small>Tersisa {getStock(state, item.id).toLocaleString("id-ID")} {item.unit}</small></div><Badge tone={getStock(state, item.id) < item.reorderPoint / 2 ? "red" : "amber"}>{getStock(state, item.id) < item.reorderPoint / 2 ? "Segera isi" : "Menipis"}</Badge></div>)}</div><button className="button secondary stock-action" onClick={() => go("inventory")}>Cek stok bahan<ArrowRight size={14}/></button></section>
            <section className="panel target-panel"><div className="target-heading"><span className="target-icon"><Target size={18}/></span><h3>Sedikit lagi, sampai target!</h3></div><div className="target-values"><strong>{currency(sum(todaySales))}</strong><span>/ {currency(state.dayTarget)}</span></div><div className="target-progress"><span style={{ width: `${Math.min(100, sum(todaySales) / state.dayTarget * 100)}%` }}/></div><p><strong>{Math.round(sum(todaySales) / state.dayTarget * 100)}% tercapai.</strong> {sum(todaySales) >= state.dayTarget ? "Target terlampaui, kerja bagus!" : "Semangat, masih ada waktu!"}</p></section>
          </div></div>
          <div className="dashboard-bottom"><section className="panel transactions-panel"><SectionHeading title="Transaksi terbaru" subtitle="Rezeki yang datang, tercatat dengan rapi." action="Lihat semua" onAction={() => go("transactions")}/>{renderTransactions(true)}</section><section className="panel capital-card"><span className="capital-eyebrow"><Leaf size={14}/>SIAP NAIK KELAS</span><div className="capital-content"><ScoreRing small/><div><h3>Usaha sehat.<br/>Peluang lebih besar.</h3><p>Kenali kesiapan usahamu<br/>untuk akses modal.</p></div></div><button className="text-button" onClick={() => go("finance")}>Lihat kesiapan modal<ArrowUpRight size={14}/></button><small>Penilaian mandiri, bukan skor kredit.</small></section></div>
          <div className="dashboard-footer"><span><LarisMark small/>Dibuat untuk usaha yang punya mimpi besar.</span><span>Data demo · Tersimpan di browser ini <ShieldCheck size={12}/></span></div>
        </>}

        {view === "pos" && <div className="pos-layout"><section><div className="pos-toolbar"><label className="search-input"><Search size={17}/><input placeholder="Cari kopi, pastry, atau menu lainnya..." value={query} onChange={event => setQuery(event.target.value)}/></label><span className="menu-count">{products.length} menu tersedia</span></div><div className="category-tabs">{["Semua menu", "Kopi", "Non-kopi", "Pastry"].map(item => <button className={category === item ? "active" : ""} onClick={() => setCategory(item)} key={item}>{item === "Kopi" && <Coffee size={15}/>} {item}</button>)}</div>{renderProductCards()}</section><aside className="panel cart-panel"><div className="section-heading"><div><h3>Pesanan baru <span className="count-badge">{cartCount}</span></h3><p>Takeaway · Kasir demo</p></div><button className="icon-button" disabled={!cart.length} aria-label="Kosongkan keranjang" onClick={() => { setCart([]); setDiscount(0); }}><Trash2 size={17}/></button></div><div className="cart-items">{cart.length === 0 ? <EmptyState title="Mau pesan apa hari ini?" description="Pilih menu di sebelah atau catat dengan suara."/> : cart.map(item => { const product = products.find(p => p.id === item.productId)!; return <div className="cart-item" key={item.productId}><Image src={product.image} alt="" width={49} height={49}/><div className="cart-item-info"><strong>{product.name}</strong><span>{currency(product.price)}</span><input aria-label={`Catatan ${product.name}`} placeholder="Tambah catatan..." value={item.note || ""} onChange={event => setCart(current => current.map(line => line.productId === item.productId ? { ...line, note: event.target.value } : line))}/></div><div className="quantity-control"><button aria-label={`Kurangi ${product.name}`} onClick={() => updateQuantity(product.id, -1)}><Minus size={12}/></button><span>{item.quantity}</span><button aria-label={`Tambah jumlah ${product.name}`} onClick={() => updateQuantity(product.id, 1)}><Plus size={12}/></button></div></div>; })}</div><div className="cart-totals"><div><span>Subtotal</span><strong>{currency(cartTotal.subtotal)}</strong></div><div><label htmlFor="discount">Diskon (Rp)</label><input id="discount" type="number" min="0" max={cartTotal.subtotal} value={discount || ""} placeholder="0" onChange={event => setDiscount(Math.max(0, Number(event.target.value)))}/></div><div><label className="checkbox-label"><input type="checkbox" checked={taxEnabled} onChange={event => setTaxEnabled(event.target.checked)}/> Pajak 10% (demo)</label><span>{currency(cartTotal.tax)}</span></div><div className="grand-total"><strong>Total pesanan</strong><strong>{currency(cartTotal.total)}</strong></div><button className="button primary checkout-button" disabled={!cart.length || discount > cartTotal.subtotal} onClick={() => open("checkout")}>Lanjut pembayaran<ArrowRight size={17}/></button><p className="secure-note"><ShieldCheck size={12}/>Tidak ada pembayaran uang asli.</p></div></aside></div>}

        {view === "transactions" && <section className="panel"><div className="list-toolbar"><label className="search-input"><Search size={16}/><input placeholder="Cari nomor transaksi atau pelanggan" value={query} onChange={event => { setQuery(event.target.value); setTransactionPage(0); }}/></label><label className="select-label"><SlidersHorizontal size={15}/><select aria-label="Filter metode pembayaran" value={transactionMethod} onChange={event => { setTransactionMethod(event.target.value); setTransactionPage(0); }}><option>Semua</option><option>QRIS</option><option>Tunai</option><option>Transfer</option></select></label></div>{renderTransactions()}</section>}

        {view === "products" && <><div className="notice green"><BookOpen size={20}/><div><strong>Resep yang konsisten, margin yang terjaga.</strong><p>Setiap transaksi otomatis mengurangi bahan sesuai resep. Pilih menu untuk melihat komposisinya.</p></div></div><div className="recipe-grid">{products.map(product => <button className="panel recipe-card" key={product.id} onClick={() => { setSelectedProduct(product); open("recipe"); }}><Image src={product.image} alt={product.name} width={120} height={120}/><div><Badge tone="neutral">{product.category}</Badge><h3>{product.name}</h3><p>{currency(product.price)} <span>· {product.recipe.length} bahan</span></p><span className="recipe-margin">Margin {Math.round((product.price - product.cost) / product.price * 100)}%<ArrowUpRight size={14}/></span></div></button>)}</div></>}

        {view === "inventory" && <><div className="inventory-stats"><div className="panel stat-block"><Package size={22}/><div><span>Total bahan baku</span><strong>{inventory.length} bahan</strong></div></div><div className="panel stat-block amber"><Bell size={22}/><div><span>Perlu dibeli lagi</span><strong>{lowStock.length} bahan</strong></div></div><button className="panel stat-block forecast-shortcut" onClick={() => open("forecast")}><Sparkles size={22}/><div><span>Rencanakan kebutuhanmu</span><strong>Lihat belanja besok<ArrowUpRight size={17}/></strong></div></button></div><section className="panel"><SectionHeading title="Persediaan bahan" subtitle="Stok awal demo + setiap pergerakan bahan yang tercatat."/><div className="table-scroll"><table><thead><tr><th>Bahan baku</th><th>Stok saat ini</th><th>Batas minimum</th><th>Supplier</th><th>Status</th><th/></tr></thead><tbody>{inventory.map(item => { const stock = getStock(state, item.id); return <tr key={item.id}><td><div className="table-name"><span className="table-icon"><Package size={17}/></span><strong>{item.name}</strong></div></td><td><strong>{stock.toLocaleString("id-ID")}</strong> {item.unit}</td><td>{item.reorderPoint.toLocaleString("id-ID")} {item.unit}</td><td>{item.supplier}</td><td><Badge tone={stock <= item.reorderPoint ? "amber" : "green"}>{stock <= item.reorderPoint ? "Stok menipis" : "Stok aman"}</Badge></td><td><button className="text-button" onClick={() => { setPurchaseItem(item.id); open("purchase"); }}>Tambah<Plus size={13}/></button></td></tr>; })}</tbody></table></div></section><section className="panel ledger-panel"><SectionHeading title="Pergerakan stok terbaru" subtitle="Semua perubahan disimpan sebagai catatan, bukan menimpa jumlah stok."/>{state.stockMovements.length === 0 ? <EmptyState title="Stok awal siap digunakan" description="Penjualan dan pembelian barumu akan tampil di sini."/> : <div className="table-scroll"><table><thead><tr><th>Bahan</th><th>Jenis</th><th>Jumlah</th><th>Waktu</th></tr></thead><tbody>{state.stockMovements.slice(-10).reverse().map(movement => <tr key={movement.id}><td>{inventory.find(item => item.id === movement.itemId)?.name}</td><td>{movement.type === "sale" ? "Penjualan" : movement.type === "purchase" ? "Pembelian" : "Penyesuaian"}</td><td><Badge tone={movement.quantity > 0 ? "green" : "amber"}>{movement.quantity > 0 ? "+" : ""}{movement.quantity.toLocaleString("id-ID")}</Badge></td><td>{shortDate(movement.createdAt)} · {time(movement.createdAt)}</td></tr>)}</tbody></table></div>}</section></>}

        {view === "purchases" && <><div className="purchase-banner"><span className="purchase-banner-icon"><ReceiptText size={30}/></span><div><h2>Nota rapi. Stok terisi.</h2><p>Simpan detail pembelian bahan dari supplier dalam satu tempat.</p></div><button className="button secondary" onClick={() => open("purchase")}><Upload size={16}/>Catat dari nota</button></div><section className="panel"><SectionHeading title="Riwayat pembelian" subtitle="Pembelian yang dicatat otomatis menambah persediaan."/>{state.purchases.length === 0 ? <EmptyState title="Belum ada pembelian baru" description="Klik Catat pembelian untuk mulai menambah stok bahan."/> : <div className="table-scroll"><table><thead><tr><th>No. pembelian</th><th>Bahan</th><th>Jumlah</th><th>Total</th><th>Tanggal</th><th>Status</th></tr></thead><tbody>{[...state.purchases].reverse().map(purchase => <tr key={purchase.id}><td>#{purchase.id.slice(-6).toUpperCase()}</td><td><strong>{inventory.find(item => item.id === purchase.itemId)?.name}</strong></td><td>{purchase.quantity.toLocaleString("id-ID")} {inventory.find(item => item.id === purchase.itemId)?.unit}</td><td>{currency(purchase.total)}</td><td>{shortDate(purchase.createdAt)}</td><td><Badge>Diterima</Badge></td></tr>)}</tbody></table></div>}</section><section className="panel supplier-panel"><SectionHeading title="Partner supplier" subtitle="Orang-orang yang menjaga dapurmu tetap berjalan."/><div className="supplier-grid">{Array.from(new Set(inventory.map(item => item.supplier))).map((supplier, i) => <div key={supplier}><span className={`avatar avatar-${i % 4}`}>{initials(supplier)}</span><div><strong>{supplier}</strong><small>{inventory.filter(item => item.supplier === supplier).map(item => item.name).join(", ")}</small></div><button className="icon-button" aria-label={`Lihat kebutuhan dari ${supplier}`} onClick={() => open("forecast")}><ClipboardList size={17}/></button></div>)}</div></section></>}

        {view === "customers" && <><div className="customer-summary"><div><span className="customer-summary-icon"><Users size={26}/></span><div><strong>{state.customers.length}</strong><p>Pelanggan sudah jadi bagian cerita kita.</p></div></div><div><span className="customer-summary-icon"><Gift size={26}/></span><div><strong>{state.customers.reduce((total, customer) => total + customer.points, 0).toLocaleString("id-ID")}</strong><p>Poin loyalitas yang terkumpul.</p></div></div></div><section className="panel"><div className="customer-filters"><div className="category-tabs">{["Semua", "Juara", "Setia", "Potensial", "Berisiko", "Hilang"].map(item => <button key={item} className={segment === item ? "active" : ""} onClick={() => setSegment(item)}>{item}</button>)}</div><label className="search-input"><Search size={16}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Cari pelanggan..."/></label></div><div className="table-scroll"><table><thead><tr><th>Pelanggan</th><th>Segmen demo</th><th>Kunjungan</th><th>Total belanja</th><th>Poin</th><th>Kunjungan terakhir</th></tr></thead><tbody>{state.customers.filter(customer => (segment === "Semua" || customer.segment === segment) && `${customer.name} ${customer.phone}`.toLowerCase().includes(query.toLowerCase())).map((customer, i) => <tr key={customer.id}><td><div className="table-name"><span className={`avatar avatar-${i % 4}`}>{initials(customer.name)}</span><div><strong>{customer.name}</strong><small>{customer.phone}</small></div></div></td><td><Badge tone={customer.segment === "Berisiko" || customer.segment === "Hilang" ? "amber" : customer.segment === "Juara" ? "purple" : "green"}>{customer.segment}</Badge></td><td>{customer.visits} kali</td><td><strong>{currency(customer.totalSpent)}</strong></td><td>{customer.points}</td><td>{shortDate(customer.lastVisit)}</td></tr>)}</tbody></table></div>{!state.customers.some(customer => (segment === "Semua" || customer.segment === segment) && `${customer.name} ${customer.phone}`.toLowerCase().includes(query.toLowerCase())) && <EmptyState title="Belum ada pelanggan di sini" description="Coba segmen atau kata kunci lainnya."/>}</section><p className="page-disclaimer">Data pelanggan fiktif. Segmen awal merupakan contoh, bukan hasil pemrosesan RFM terjadwal.</p></>}

        {view === "storefront" && <><div className="storefront-cover"><div><span><Coffee size={17}/>EST. 2024 · BANDUNG</span><h2>Kopi yang baik.<br/>Hari yang lebih baik.</h2><p>Dibuat sepenuh hati, untuk teman menjalani hari.</p><Badge><span className="status-dot"/>Buka · 08.00 – 21.00</Badge></div><Image src="/images/kopi-susu.webp" alt="Es Kopi Susu andalan Kopi Senja" width={380} height={380}/><div className="storefront-name">{state.business.name}<small>Kopi, cerita, dan sedikit senja.</small></div></div><div className="notice neutral"><Store size={18}/><p>Pratinjau lokal. Pesanan di sini masuk ke transaksi demo, bukan pesanan publik atau realtime lintas perangkat.</p></div><div className="storefront-tools"><div className="category-tabs">{["Semua menu", "Kopi", "Non-kopi", "Pastry"].map(item => <button className={category === item ? "active" : ""} key={item} onClick={() => setCategory(item)}>{item}</button>)}</div><button className="button primary" disabled={!cart.length} onClick={() => open("checkout")}><ShoppingBasket size={17}/>{cartCount} item · {currency(cartTotal.total)}<ArrowRight size={15}/></button></div>{renderProductCards(true)}</>}

        {view === "finance" && <><div className="finance-top"><section className="panel profit-panel"><SectionHeading title="Laba rugi sederhana" subtitle="18 Oktober 2026 · Data demo harian" action="Cetak laporan" onAction={() => window.print()}/><div className="profit-line"><span>Pendapatan penjualan</span><strong>{currency(sum(todaySales))}</strong></div><div className="profit-line"><span>Harga pokok penjualan (HPP)</span><span>− {currency(costs(todaySales))}</span></div><div className="profit-line subtotal"><strong>Untung kotor</strong><strong>{currency(sum(todaySales) - costs(todaySales))}</strong></div><div className="profit-line"><span>Biaya operasional hari ini</span><span>− {currency(state.expenses.filter(expense => expense.createdAt.startsWith(DEMO_DATE)).reduce((total, expense) => total + expense.amount, 0))}</span></div><div className="net-profit"><span>Untung bersih<strong>{currency(sum(todaySales) - costs(todaySales) - state.expenses.filter(expense => expense.createdAt.startsWith(DEMO_DATE)).reduce((total, expense) => total + expense.amount, 0))}</strong></span><ChartNoAxesCombined size={34}/></div><p className="page-disclaimer">Ringkasan manajemen, belum merupakan laporan SAK EMKM lengkap.</p></section><section className="panel readiness-panel"><SectionHeading title="Skor Siap Modal" subtitle="Langkah kecil menuju peluang yang lebih besar."/><div className="readiness-score"><ScoreRing/><div><Badge>Fondasi yang baik</Badge><h3>Usahamu punya potensi.</h3><p>Lengkapi legalitas dan konsisten mencatat untuk makin siap.</p></div></div>{[{ name: "Konsistensi pencatatan", value: 90 }, { name: "Kesehatan margin", value: 85 }, { name: "Kelengkapan dokumen", value: 45 }].map(item => <div className="readiness-line" key={item.name}><span>{item.name}</span><div><span style={{ width: `${item.value}%` }}/></div><strong>{item.value}%</strong></div>)}<div className="notice neutral"><ShieldCheck size={17}/><p>Contoh penilaian mandiri, bukan skor kredit, persetujuan KUR, atau rekomendasi lembaga keuangan.</p></div></section></div><section className="panel"><SectionHeading title="Catatan pengeluaran" subtitle="Pisahkan uang pribadi dan usaha, mulai dari hal kecil." action="Tambah pengeluaran" onAction={() => open("expense")}/><div className="table-scroll"><table><thead><tr><th>Keperluan</th><th>Kategori</th><th>Tanggal</th><th>Jumlah</th></tr></thead><tbody>{[...state.expenses].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 15).map(expense => <tr key={expense.id}><td><div className="table-name"><span className="table-icon"><ArrowUpRight size={17}/></span><strong>{expense.description}</strong></div></td><td><Badge tone="neutral">{expense.category}</Badge></td><td>{shortDate(expense.createdAt)}</td><td><strong>{currency(expense.amount)}</strong></td></tr>)}</tbody></table></div></section></>}

        {view === "team" && <><div className="notice neutral"><ShieldCheck size={19}/><div><strong>Pratinjau peran tim</strong><p>Akses di demo ini belum menggunakan autentikasi. Izin berikut adalah rancangan, bukan pembatasan keamanan aktif.</p></div></div><div className="team-grid">{[{ name: state.business.owner, role: "Owner", detail: "Semua laporan dan pengaturan usaha", initials: "R", shift: "Akses penuh" }, { name: "Aulia Putri", role: "Manager", detail: "Operasional, stok, dan laporan outlet", initials: "AP", shift: "08.00 – 17.00" }, { name: "Dimas Pratama", role: "Kasir", detail: "Transaksi dan pelayanan pelanggan", initials: "DP", shift: "08.00 – 16.00" }, { name: "Nadia Safira", role: "Dapur", detail: "Persiapan pesanan dan bahan baku", initials: "NS", shift: "13.00 – 21.00" }].map((member, i) => <article className="panel team-card" key={member.name}><span className={`avatar large avatar-${i}`}>{member.initials}</span><h3>{member.name}</h3><Badge tone={i === 0 ? "green" : "neutral"}>{member.role}</Badge><p>{member.detail}</p><div><span className="status-dot"/>{member.shift}</div></article>)}</div><section className="panel"><SectionHeading title="Aktivitas demo" subtitle="Perubahan terbaru yang tercatat di browser ini."/>{state.sales.filter(sale => !sale.id.startsWith("seed")).slice(-5).reverse().map(sale => <div className="audit-line" key={sale.id}><span className="table-icon"><CheckCheck size={18}/></span><div><strong>Transaksi #{sale.id.slice(-6).toUpperCase()} dicatat</strong><p>{sale.channel} · {currency(sale.total)} · {time(sale.createdAt)}</p></div><Badge>Lunas</Badge></div>)}<p className="page-disclaimer">Aktivitas lokal bukan audit log keamanan yang terverifikasi.</p></section></>}
      </main>
      <button className="floating-assistant" onClick={() => open("assistant")}><Sparkles size={18}/><span>Tanya Laris</span><span className="assistant-dot"/></button>
    </div>
    {toast && <div className="toast" role="status"><span><Check size={17}/></span>{toast}<button aria-label="Tutup pemberitahuan" onClick={() => setToast("")}><X size={15}/></button></div>}

    {modal === "assistant" && <Modal title="Ada Laris, ada jalan." description={mode === "cloud" ? "Asisten AI · Didukung Gemini 2.5 dengan akses analitik data usaha." : "Asisten demo · Jawaban dihitung dari data lokal, tanpa LLM."} onClose={close}><div className="assistant-welcome"><LarisMark/><h3>Halo, {state.business.owner.split(" ")[0]}. Mau cari tahu apa?</h3><p>Dari angka penjualan sampai bahan yang perlu dibeli,<br/>kita lihat bareng-bareng.</p></div><div className="chat-messages" aria-live="polite">{messages.map((message, i) => <div key={i} className={`chat-message ${message.role}`}>{message.role === "assistant" && <Sparkles size={16}/>}<p>{message.text}</p></div>)}{pendingAi && <div className="chat-message assistant"><Sparkles size={16}/><p style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><LoaderCircle size={14} className="spin"/>Laris sedang berpikir...</p></div>}</div><div className="prompt-chips">{["Menu apa yang paling laris?", "Stok apa yang perlu dibeli?", "Berapa untung hari ini?"].map(prompt => <button key={prompt} onClick={() => askAssistant(prompt)}>{prompt}<ArrowUpRight size={12}/></button>)}</div><form className="chat-input" onSubmit={event => { event.preventDefault(); askAssistant(assistantInput); }}><input aria-label="Pertanyaan untuk Laris" value={assistantInput} onChange={event => setAssistantInput(event.target.value)} placeholder="Tanya tentang usahamu..."/><button className="button primary" aria-label="Kirim pertanyaan" disabled={!assistantInput.trim() || pendingAi}>{pendingAi ? <LoaderCircle size={16} className="spin"/> : <ArrowRight size={18}/>}</button></form></Modal>}

    {modal === "voice" && <Modal title="Catat cukup ngomong." description="Pengenal suara browser + Gemini AI / Parser Bahasa Indonesia." onClose={close}><div className="voice-mic"><button className={recording ? "recording" : ""} onClick={recording ? () => { speech.current?.stop(); setRecording(false); } : startVoice} aria-label={recording ? "Hentikan rekaman" : "Mulai rekam pesanan"}><Mic size={32}/></button><p>{recording ? "Laris sedang mendengarkan..." : "Tekan mikrofon atau ketik pesananmu."}</p></div><form onSubmit={event => { event.preventDefault(); handleVoiceParse(voiceText); }}><label className="field"><span>Pesanan pelanggan</span><textarea rows={3} placeholder="Dua es kopsu less sugar, satu croissant, bayar QRIS" value={voiceText} onChange={event => { setVoiceText(event.target.value); setParsed(null); }}/></label><button type="button" className="sample-prompt" onClick={() => { const sample = "dua es kopsu less sugar, satu croissant, bayar QRIS"; setVoiceText(sample); handleVoiceParse(sample); }}>Coba contoh: 2 kopsu + 1 croissant<ArrowUpRight size={13}/></button><button className="button secondary full-width" disabled={!voiceText.trim() || pendingAi}>{pendingAi ? <><LoaderCircle size={16} className="spin"/>Menganalisis dengan Gemini AI...</> : <><Sparkles size={16}/>Baca pesanan</>}</button></form>{parsed && <div className="voice-preview"><h3>Cek dulu, sudah sesuai?</h3>{parsed.items.map(item => <div key={item.productId}><span>{item.quantity}× {products.find(product => product.id === item.productId)?.name}<small>{item.note}</small></span><strong>{currency((products.find(product => product.id === item.productId)?.price || 0) * item.quantity)}</strong></div>)}<p>Metode pembayaran: <strong>{parsed.payment}</strong></p>{parsed.unknown.length > 0 && <div className="form-error">Belum dikenali: {parsed.unknown.join(", ")}. Perbaiki pesanan sebelum melanjutkan.</div>}<button className="button primary full-width" disabled={!parsed.items.length || parsed.unknown.length > 0} onClick={() => { setCart(current => { const next = [...current]; for (const item of parsed.items) { const found = next.findIndex(line => line.productId === item.productId); if (found >= 0) next[found] = { ...next[found], quantity: next[found].quantity + item.quantity, note: item.note || next[found].note }; else next.push(item); } return next; }); setPayment(parsed.payment); go("pos"); close(); notify("Pesanan ditambahkan. Periksa lalu lanjutkan pembayaran."); }}><Check size={17}/>Konfirmasi ke keranjang</button></div>}{error && <p className="form-error" role="alert">{error}</p>}</Modal>}

    {modal === "checkout" && <Modal title="Satu langkah lagi." description="Periksa pesanan dan catat pembayaran." onClose={close}><form onSubmit={checkout}><div className="checkout-summary">{cart.map(item => <div key={item.productId}><span>{item.quantity}× {products.find(product => product.id === item.productId)?.name}</span><strong>{currency((products.find(product => product.id === item.productId)?.price || 0) * item.quantity)}</strong><button type="button" className="icon-button" aria-label={`Hapus ${products.find(product => product.id === item.productId)?.name}`} onClick={() => { setCart(current => current.filter(line => line.productId !== item.productId)); setDiscount(0); }}><X size={13}/></button></div>)}<div className="checkout-total"><span>Total pembayaran</span><strong>{currency(cartTotal.total)}</strong></div></div><div className="payment-options">{(["Tunai", "QRIS", "Transfer"] as const).map(method => <button key={method} type="button" className={payment === method ? "selected" : ""} onClick={() => setPayment(method)}>{method === "Tunai" ? <Banknote size={22}/> : method === "QRIS" ? <Grid2X2 size={22}/> : <Landmark size={22}/>} {method}{payment === method && <Check size={13}/>}</button>)}</div>{payment === "Tunai" ? <><label className="field"><span>Uang diterima (Rp)</span><input autoComplete="off" type="number" min={cartTotal.total} required value={cash} onChange={event => setCash(event.target.value)} placeholder="Masukkan jumlah uang tunai"/></label><div className="quick-cash">{Array.from(new Set([cartTotal.total, Math.ceil(cartTotal.total / 50000) * 50000, Math.ceil(cartTotal.total / 100000) * 100000])).map(amount => <button type="button" key={amount} onClick={() => setCash(String(amount))}>{currency(amount)}</button>)}</div>{Number(cash) >= cartTotal.total && <div className="cash-change">Kembalian<strong>{currency(Number(cash) - cartTotal.total)}</strong></div>}</> : <div className="notice amber"><ShieldCheck size={20}/><p><strong>Simulasi {payment}, bukan pembayaran asli.</strong><br/>Belum terhubung ke Midtrans atau bank. Tidak ada dana yang dipindahkan.</p></div>}<div className="form-grid"><label className="field"><span>Nama pelanggan <small>(opsional)</small></span><input maxLength={80} value={customerName} onChange={event => setCustomerName(event.target.value)} placeholder="Pelanggan umum"/></label><label className="field"><span>No. telepon <small>(opsional)</small></span><input type="tel" value={customerPhone} onChange={event => setCustomerPhone(event.target.value)} placeholder="08xxxxxxxxxx" pattern="\+?[0-9]{8,15}"/></label></div><p className="field-hint">Nomor telepon dipakai untuk profil dan poin pelanggan, bukan pemasaran.</p>{error && <p className="form-error" role="alert">{error}</p>}<button className="button primary full-width" disabled={!cart.length || (payment === "Tunai" && Number(cash) < cartTotal.total) || pendingCheckout}>{pendingCheckout ? <LoaderCircle size={17} className="spin"/> : <Check size={17}/>}{payment === "Tunai" ? "Selesaikan transaksi" : `Simulasikan pembayaran ${payment}`}</button></form></Modal>}

    {modal === "receipt" && receipt && <Modal title="Satu pesanan, satu senyuman." description={mode === "cloud" ? "Transaksi berhasil dicatat di cloud Supabase." : "Transaksi berhasil dicatat di perangkat ini."} onClose={close}><div className="receipt-paper" id="print-receipt"><div className="receipt-check"><CheckCheck size={27}/></div><h3>{state.business.name}</h3><p>{state.business.outlet}</p><small>STRUK {mode === "cloud" ? "CLOUD" : "DEMO"} · #{receipt.id.slice(-6).toUpperCase()}</small><div className="receipt-meta"><span>{shortDate(receipt.createdAt)} · {time(receipt.createdAt)}</span><span>{receipt.customerName}</span></div>{receipt.items.map(item => <div className="receipt-line" key={item.productId}><span>{item.quantity}× {products.find(product => product.id === item.productId)?.name}{item.note && <small>{item.note}</small>}</span><strong>{currency((products.find(product => product.id === item.productId)?.price || 0) * item.quantity)}</strong></div>)}{receipt.discount > 0 && <div className="receipt-line"><span>Diskon</span><span>−{currency(receipt.discount)}</span></div>}{receipt.tax > 0 && <div className="receipt-line"><span>Pajak</span><span>{currency(receipt.tax)}</span></div>}<div className="receipt-total"><strong>Total</strong><strong>{currency(receipt.total)}</strong></div><div className="receipt-line"><span>{receipt.payment}</span><Badge>Lunas {mode === "cloud" ? "(Cloud)" : "(demo)"}</Badge></div>{receipt.payment === "Tunai" && <div className="receipt-line"><span>Kembalian</span><strong>{currency(receipt.cashReceived - receipt.total)}</strong></div>}<p className="receipt-thanks">Terima kasih sudah jadi bagian cerita kami.<br/>Sampai jumpa di cangkir berikutnya.</p><LarisMark small/></div><div className="modal-actions"><button className="button secondary" onClick={() => window.print()}><Printer size={16}/>Cetak struk</button><button className="button primary" onClick={() => { close(); go("pos"); }}><Plus size={16}/>Pesanan berikutnya</button></div></Modal>}

    {modal === "purchase" && <Modal title="Stok aman, hati tenang." description="Catat pembelian bahan dan otomatis perbarui persediaan." onClose={close}><form onSubmit={submitPurchase}><label className="upload-area"><Upload size={24}/><strong>{pendingScan ? "Memindai nota dengan Gemini AI..." : photoName || "Lampirkan foto nota (AI Scan)"}</strong><span>{pendingScan ? "Membaca teks nota dan mencocokkan bahan baku..." : "Pindai foto nota belanja · Otomatis membaca bahan, kuantitas & deteksi kenaikan harga"}</span><input type="file" accept="image/*" onChange={event => { const f = event.target.files?.[0]; if (f) handleReceiptScan(f); }}/></label>{scanHikeAlert && <div className="notice amber" style={{ margin: "12px 0" }}><Bell size={18}/><div><strong>Peringatan Kenaikan Harga! (PRD M4.4)</strong><p>Bahan <strong>{scanHikeAlert.name}</strong> naik {scanHikeAlert.diffPercent}% dari Rp{scanHikeAlert.oldCost.toLocaleString("id-ID")} menjadi Rp{scanHikeAlert.unitCost.toLocaleString("id-ID")}/satuan.</p></div></div>}<label className="field"><span>Bahan yang dibeli</span><select name="itemId" value={purchaseItem} onChange={event => setPurchaseItem(event.target.value)}>{inventory.map(item => <option value={item.id} key={item.id}>{item.name} ({item.unit})</option>)}</select></label><div className="form-grid"><label className="field"><span>Jumlah ({inventory.find(item => item.id === purchaseItem)?.unit})</span><input name="quantity" type="number" min="0.001" step="0.001" required placeholder="Contoh: 5000"/></label><label className="field"><span>Total harga (Rp)</span><input name="total" type="number" min="1" step="1" required placeholder="Contoh: 95000"/></label></div><div className="notice green"><Package size={18}/><p>Stok saat ini: <strong>{getStock(state, purchaseItem).toLocaleString("id-ID")} {inventory.find(item => item.id === purchaseItem)?.unit}</strong>. Bahan akan bertambah setelah dikonfirmasi.</p></div>{error && <p className="form-error" role="alert">{error}</p>}<button className="button primary full-width"><Check size={16}/>Konfirmasi pembelian</button></form></Modal>}

    {modal === "expense" && <Modal title="Catat pengeluaran" description="Biar setiap rupiah punya cerita yang jelas." onClose={close}><form onSubmit={submitExpense}><label className="field"><span>Keperluan</span><input name="description" required maxLength={150} placeholder="Contoh: beli gas untuk dapur"/></label><label className="field"><span>Kategori</span><select name="category"><option>Operasional</option><option>Sewa</option><option>Gaji</option><option>Listrik & air</option><option>Pemasaran</option><option>Lainnya</option></select></label><label className="field"><span>Jumlah (Rp)</span><input name="amount" type="number" step="1" min="1" required placeholder="22000"/></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button primary full-width"><Check size={16}/>Simpan pengeluaran</button></form></Modal>}

    {modal === "recipe" && <Modal title={selectedProduct.name} description="Resep standar dan gambaran margin menu." onClose={close}><div className="recipe-detail"><Image src={selectedProduct.image} alt={selectedProduct.name} width={130} height={130}/><div><Badge>{selectedProduct.category}</Badge><h3>{currency(selectedProduct.price)}</h3><p>HPP demo {currency(selectedProduct.cost)}</p><strong className="green-text">Margin {Math.round((selectedProduct.price - selectedProduct.cost) / selectedProduct.price * 100)}%</strong></div></div><table><thead><tr><th>Bahan</th><th>Per porsi</th><th>Stok tersedia</th></tr></thead><tbody>{selectedProduct.recipe.map(line => { const item = inventory.find(ingredient => ingredient.id === line.itemId)!; return <tr key={line.itemId}><td>{item.name}</td><td>{line.quantity} {item.unit}</td><td>{getStock(state, item.id).toLocaleString("id-ID")} {item.unit}</td></tr>; })}</tbody></table><div className="notice green"><BookOpen size={18}/><p>Stok berkurang sesuai resep saat penjualan selesai. Harga dan resep adalah katalog demo tetap.</p></div><button className="button primary full-width" onClick={() => { addProduct(selectedProduct); close(); go("pos"); }}><Plus size={16}/>Tambahkan ke pesanan</button></Modal>}

    {modal === "forecast" && <Modal title="Belanja besok, lebih tenang." description="Saran restok sederhana berdasarkan batas minimum bahan." onClose={close}><div className="notice amber"><Sparkles size={18}/><p>Demo ini menggunakan aturan stok minimum, bukan prediksi AI, kalender, atau model permintaan terlatih.</p></div>{lowStock.length === 0 ? <EmptyState title="Semua stok aman" description="Belum ada bahan di bawah batas minimum."/> : lowStock.map(item => <div className="forecast-item" key={item.id}><span className="table-icon"><Package size={20}/></span><div><strong>{item.name}</strong><p>{item.supplier} · Tambah {Math.max(0, item.reorderPoint * 2 - getStock(state, item.id)).toLocaleString("id-ID")} {item.unit}</p></div><button className="button secondary small" onClick={() => { setPurchaseItem(item.id); open("purchase"); }}>Catat beli<Plus size={13}/></button></div>)}<button className="button secondary full-width" disabled={!lowStock.length} onClick={async () => { const text = `Daftar belanja ${state.business.name}:\n${lowStock.map(item => `- ${item.name}: ${Math.max(0, item.reorderPoint * 2 - getStock(state, item.id))} ${item.unit} (${item.supplier})`).join("\n")}`; try { await navigator.clipboard.writeText(text); notify("Daftar belanja disalin. Siap ditempel ke WhatsApp supplier."); } catch { setError("Browser tidak mengizinkan clipboard. Salin detail bahan secara manual."); } }}><ClipboardList size={16}/>Salin daftar untuk WhatsApp</button>{error && <p className="form-error" role="alert">{error}</p>}</Modal>}

    {modal === "customer" && <Modal title="Kenalan dulu, yuk." description="Simpan pelanggan baru untuk pencatatan kunjungan." onClose={close}><form onSubmit={submitCustomer}><label className="field"><span>Nama pelanggan</span><input name="name" required maxLength={80} placeholder="Nama lengkap"/></label><label className="field"><span>Nomor telepon</span><input name="phone" required type="tel" pattern="\+?[0-9]{8,15}" placeholder="08xxxxxxxxxx"/></label><p className="field-hint">Pastikan pelanggan setuju untuk menyimpan datanya. Tidak ada pesan pemasaran yang dikirim.</p>{error && <p className="form-error" role="alert">{error}</p>}<button className="button primary full-width"><Plus size={16}/>Simpan pelanggan</button></form></Modal>}

    {modal === "settings" && <Modal title="Ruang untuk usahamu." description={mode === "cloud" ? "Pengaturan usaha tersimpan di Supabase Cloud." : "Pengaturan disimpan lokal di browser ini."} onClose={close}><form onSubmit={submitSettings}><label className="field"><span>Nama usaha</span><input name="name" defaultValue={state.business.name} maxLength={60} required/></label><div className="form-grid"><label className="field"><span>Nama pemilik</span><input name="owner" defaultValue={state.business.owner} maxLength={50} required/></label><label className="field"><span>Outlet</span><input name="outlet" defaultValue={state.business.outlet} maxLength={60} required/></label></div><label className="field"><span>Target penjualan harian (Rp)</span><input name="target" type="number" min="1" step="1" defaultValue={state.dayTarget} required/></label>{mode === "cloud" ? <div className="notice green"><ShieldCheck size={19}/><p>Data profil dan target tersimpan aman di database Supabase dengan Row Level Security.</p></div> : <div className="notice neutral"><ShieldCheck size={19}/><p>Demo lokal tanpa sinkronisasi cloud. Masuk dengan akun Supabase untuk multi-perangkat.</p></div>}{error && <p className="form-error" role="alert">{error}</p>}<button className="button primary full-width"><Check size={16}/>Simpan pengaturan</button></form></Modal>}

    {modal === "notifications" && <Modal title="Kabar untuk usahamu." description="Hal-hal kecil yang jangan sampai terlewat." onClose={close}>{lowStock.map(item => <button className="notification-item" key={item.id} onClick={() => { close(); go("inventory"); }}><span className="metric-icon orange"><Package size={20}/></span><div><strong>{item.name} mulai menipis</strong><p>Tersisa {getStock(state, item.id).toLocaleString("id-ID")} {item.unit}. Yuk, rencanakan belanja.</p><small>Peringatan stok saat ini</small></div><ChevronRight size={17}/></button>)}<button className="notification-item" onClick={() => { close(); go("finance"); }}><span className="metric-icon green"><FileText size={20}/></span><div><strong>Laporan usahamu sudah siap</strong><p>Penjualan dan keuntungan, terangkum dalam satu halaman.</p><small>Data demo · 18 Oktober 2026</small></div><ChevronRight size={17}/></button></Modal>}

    {modal === "search" && <Modal title="Mau ke mana hari ini?" description="Cari halaman atau menu Kopi Senja." onClose={close}><label className="search-input command-search"><Search size={19}/><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Cari kasir, stok, kopi..."/></label><div className="search-results">{navigation.flatMap(group => group.items).filter(item => item.label.toLowerCase().includes(query.toLowerCase())).map(item => <button key={item.id} onClick={() => { close(); go(item.id); }}><item.icon size={19}/><span>{item.label}</span><ArrowUpRight size={15}/></button>)}{query && products.filter(product => product.name.toLowerCase().includes(query.toLowerCase())).map(product => <button key={product.id} onClick={() => { setSelectedProduct(product); open("recipe"); }}><Coffee size={19}/><span>{product.name}</span><small>{currency(product.price)}</small></button>)}</div></Modal>}

    {modal === "guide" && <Modal title="Selamat datang di Laris." description="7 langkah kecil untuk kenalan dengan partner usahamu." onClose={close}><div className="guide-progress">{Array.from({ length: 7 }, (_, i) => <span key={i} className={i <= guideStep ? "done" : ""}/>)}</div><div className="guide-content"><span className="guide-number">0{guideStep + 1}</span><h3>{["Lihat cerita di balik angka.", "Catat cukup ngomong.", "Selesaikan satu transaksi.", "Bahan berkurang otomatis.", "Belanja tanpa menebak.", "Kenali pelanggan setiamu.", "Tahu untung, siap tumbuh."][guideStep]}</h3><p>{["Ringkasan menampilkan penjualan, menu favorit, dan bahan yang perlu perhatian dalam satu pandangan.", "Di Kasir, pilih Catat pakai suara. Coba ‘dua es kopsu, satu croissant, bayar QRIS’. Periksa sebelum konfirmasi.", "Tambah menu ke keranjang, pilih pembayaran, lalu simulasikan transaksi. Tidak ada uang asli yang digunakan.", "Buka Stok bahan setelah transaksi. Susu, kopi, gula, dan cup berkurang sesuai resep menu.", "Lihat Belanja besok, salin daftar untuk supplier, lalu catat pembelian untuk mengisi stok.", "Lihat profil dan segmen pelanggan demo. Nomor telepon saat checkout menghubungkan transaksi dengan pelanggan.", "Buka Keuangan untuk ringkasan laba rugi dan ekspor CSV. Tanya Laris untuk membaca data. Demo ini tersimpan lokal; layanan cloud dan AI belum terhubung."][guideStep]}</p></div><div className="modal-actions"><button className="button secondary" disabled={guideStep === 0} onClick={() => setGuideStep(step => step - 1)}><ChevronLeft size={16}/>Kembali</button><button className="button primary" onClick={() => { if (guideStep < 6) setGuideStep(step => step + 1); else { close(); go("pos"); setGuideStep(0); } }}>{guideStep < 6 ? "Berikutnya" : "Yuk, mulai jualan"}<ArrowRight size={16}/></button></div></Modal>}
  </div>;
}
