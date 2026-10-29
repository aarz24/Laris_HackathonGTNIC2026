"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowDownToLine, ArrowRight, ArrowUpRight, Banknote, Bell, BookOpen,
  CalendarDays, ChartNoAxesCombined, Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight,
  CircleHelp, ClipboardList, Cloud, Coffee, FileText, Gift, Grid2X2,
  Landmark, LoaderCircle, LogOut, Menu, Mic, Minus, Package, Pencil, Plus, Printer, ReceiptText,
  Search, Settings2, ShieldCheck, ShoppingBag, ShoppingBasket, SlidersHorizontal,
  Sparkles, Store, Target, Trash2, TrendingUp, Upload, UserPlus, Users, Wallet, X,
  type LucideIcon,
} from "lucide-react";
import {
  createInitialState, products as demoProducts, inventory as demoInventory, currency, getStock, getCartTotal, completeSale,
  recordPurchase, parseOrder, exportSalesCsv, timestamp, DEMO_DATE,
  reconcileCart, getSaleLines, getSaleItemName, getSalesFinancials, getProductSales,
  deleteProduct, deleteInventoryItem, deleteCustomer, deleteExpense, updateCustomer,
  type BusinessState, type CartItem, type Sale, type Product, type InventoryItem, type Customer, type Expense, type TeamMember,
} from "@/lib/laris-data";
import {
  completeSaleAction, recordPurchaseAction, addExpenseAction, saveProductAction, saveInventoryItemAction,
  addCustomerAction, updateSettingsAction, inviteTeamMemberAction, uploadMenuImageAction,
  deleteProductAction, deleteInventoryItemAction, deleteCustomerAction, deleteExpenseAction,
  updateCustomerAction, removeTeamMemberAction, updateTeamMemberRoleAction,
} from "@/app/actions";
import { signOutAction } from "@/app/login/actions";
import type { Role } from "@/lib/repo";
import { aiFailureReason, createRequestSlot, fetchAiJson } from "@/lib/ai-request";
import { DEMO_STORAGE_KEY, findGuideFeatures, getReceiptActions, getTourFeatures, guideStorageKey, resetDemoSession, type GuideFeature, type ReceiptAction, type ReceiptCustomerLink, type View } from "@/lib/laris-guide";
import { GuidedTour, HelpCenter, WelcomeGuide } from "./laris-help";
import { AiBadge, EmptyState, LarisMark, PageArt, RevenueChart, Sparkline, Trend } from "./laris-visuals";

export interface LarisAppProps {
  mode?: "cloud" | "local";
  initialState?: BusinessState;
  today?: string;
  workspaceId?: string;
  user?: { id: string; email: string; role: Role };
  notice?: string;
}

type ModalName = "assistant" | "voice" | "checkout" | "receipt" | "purchase" | "expense" | "settings" | "guide" | "notifications" | "search" | "recipe" | "forecast" | "customer" | "product-editor" | "inventory-editor" | "invite" | null;
const navigation: { label?: string; items: { id: View; label: string; icon: LucideIcon; badge?: string }[] }[] = [
  { items: [{ id: "overview", label: "Ringkasan", icon: Grid2X2 }, { id: "pos", label: "Kasir", icon: ShoppingBasket }, { id: "transactions", label: "Transaksi", icon: ReceiptText }] },
  { label: "OPERASIONAL", items: [{ id: "products", label: "Produk & resep", icon: Coffee }, { id: "inventory", label: "Stok bahan", icon: Package, badge: "3" }, { id: "purchases", label: "Pembelian", icon: ShoppingBag }] },
  { label: "KEMBANGKAN USAHA", items: [{ id: "customers", label: "Pelanggan", icon: Users }, { id: "storefront", label: "Etalase online", icon: Store }, { id: "finance", label: "Keuangan", icon: ChartNoAxesCombined }, { id: "team", label: "Tim & akses", icon: ShieldCheck }] },
];
const pageNames = Object.fromEntries(navigation.flatMap(group => group.items.map(item => [item.id, item.label]))) as Record<View, string>;
const STORAGE_KEY = DEMO_STORAGE_KEY;
const shortDate = (date: string) => new Date(date).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
const time = (date: string) => new Date(date).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
const greeting = (hour: number) => hour >= 4 && hour < 11 ? "Selamat pagi" : hour >= 11 && hour < 15 ? "Selamat siang" : hour >= 15 && hour < 18 ? "Selamat sore" : "Selamat malam";
const initials = (name: string) => name.split(" ").filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "LA";
const sum = (sales: Sale[]) => sales.reduce((total, sale) => total + sale.total, 0);
const historicalCurrency = (amount: number | null) => amount === null ? "Tidak tersedia" : currency(amount);
const productImage = (product: { image: string }) => product.image || "/images/kopi-susu.webp";
const PRODUCT_IMAGES = Array.from(new Set(demoProducts.map(product => product.image)));
const roleLabels = { owner: "Owner", manager: "Manager", kasir: "Kasir", dapur: "Dapur" } as const;
const roleDetails = { owner: "Semua laporan, tim, dan pengaturan usaha", manager: "Operasional, katalog, stok, dan laporan", kasir: "Transaksi, pembelian, dan pelayanan pelanggan", dapur: "Melihat pesanan, resep, dan persediaan bahan" } as const;
type TeamRole = "manager" | "kasir" | "dapur";
type ConfirmRequest =
  | { kind: "demo-reset" }
  | { kind: "product"; product: Product }
  | { kind: "inventory"; item: InventoryItem }
  | { kind: "customer"; customer: Customer }
  | { kind: "expense"; expense: Expense }
  | { kind: "team-remove"; member: TeamMember }
  | { kind: "team-role"; member: TeamMember; role: TeamRole };

let modalScrollLocks = 0;
let modalOriginalOverflow = "";

function Modal({ title, description, children, onClose, wide = false }: { title: string; description?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [previousFocus] = useState(() => typeof document === "undefined" ? null : document.activeElement as HTMLElement | null);
  const titleId = useId();
  const descriptionId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (modalScrollLocks === 0) modalOriginalOverflow = document.body.style.overflow;
    modalScrollLocks += 1;
    document.body.style.overflow = "hidden";
    const underlying = Array.from(document.querySelectorAll<HTMLElement>(".modal-backdrop .modal")).filter(element => element !== ref.current && !element.inert);
    underlying.forEach(element => { element.inert = true; });
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      // Only the top-most dialog reacts, so a confirmation opened over another dialog doesn't close both.
      const backdrops = document.querySelectorAll(".modal-backdrop");
      if (backdrops[backdrops.length - 1] !== ref.current?.parentElement) return;
      if (event.key === "Escape") closeRef.current();
      if (event.key !== "Tab") return;
      const elements = ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, a[href], [tabindex="0"]');
      const visible = Array.from(elements || []).filter(element => element.checkVisibility({ checkVisibilityCSS: true }));
      const first = visible[0], last = visible[visible.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      modalScrollLocks -= 1;
      if (modalScrollLocks === 0) document.body.style.overflow = modalOriginalOverflow;
      document.removeEventListener("keydown", onKey);
      underlying.forEach(element => { element.inert = false; });
      const activeDialog = Array.from(document.querySelectorAll<HTMLElement>('.modal-backdrop .modal, dialog[open]')).at(-1);
      if (previousFocus?.isConnected && !previousFocus.closest("[inert]") && (!activeDialog || activeDialog.contains(previousFocus))) previousFocus.focus({ preventScroll: true });
    };
  }, [previousFocus]);
  return <div className="modal-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}><div ref={ref} tabIndex={-1} className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined}><div className="modal-heading"><div><h2 id={titleId}>{title}</h2>{description && <p id={descriptionId}>{description}</p>}</div><button className="icon-button" aria-label="Tutup dialog" onClick={onClose}><X size={20}/></button></div>{children}</div></div>;
}

function Badge({ children, tone = "green" }: { children: ReactNode; tone?: string }) { return <span className={`badge ${tone}`}>{children}</span>; }
function SectionHeading({ title, subtitle, action, onAction }: { title: string; subtitle?: string; action?: string; onAction?: () => void }) { return <div className="section-heading"><div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>{action && <button className="text-button" onClick={onAction}>{action}<ArrowUpRight size={14}/></button>}</div>; }

export default function LarisApp({ mode = "local", initialState, today, workspaceId, user, notice }: LarisAppProps = {}) {
  const activeToday = today || DEMO_DATE;
  const day = (offset: number) => { const date = new Date(`${activeToday}T12:00:00`); date.setDate(date.getDate() + offset); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; };
  const [state, setState] = useState<BusinessState>(() => initialState ?? createInitialState(activeToday));
  const products = state.products ?? demoProducts;
  const inventory = state.inventory ?? demoInventory;
  const canManageCatalog = mode === "local" || user?.role === "owner" || user?.role === "manager";
  const canManageBusiness = mode === "local" || user?.role === "owner";
  const canRecordOperations = mode === "local" || user?.role === "owner" || user?.role === "manager" || user?.role === "kasir";
  const canManageCustomers = canRecordOperations;
  // Mirrors the customer_delete RLS policy: cashiers may add/edit customers, only owner/manager remove them.
  const canDeleteCustomers = mode === "local" || user?.role === "owner" || user?.role === "manager";
  const taxRate = state.business.taxRate ?? 10;
  const categories = useMemo(() => ["Semua menu", ...Array.from(new Set(products.map(product => product.category).filter(Boolean)))], [products]);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [modal, setModal] = useState<ModalName>(null);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [period, setPeriod] = useState("today");
  const [chartPeriod, setChartPeriod] = useState("week");
  const [cart, setCart] = useState<CartItem[]>([]);
  const reconciledCart = useMemo(() => reconcileCart(cart, products), [cart, products]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Semua menu");
  const [payment, setPayment] = useState<Sale["payment"]>("QRIS");
  const [cash, setCash] = useState("");
  const [discount, setDiscount] = useState(0);
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [receiptCustomer, setReceiptCustomer] = useState<ReceiptCustomerLink | null>(null);
  const [demoRevision, setDemoRevision] = useState(0);
  const [voiceText, setVoiceText] = useState("");
  const [parsed, setParsed] = useState<ReturnType<typeof parseOrder> | null>(null);
  const [voiceNotice, setVoiceNotice] = useState("");
  const [recording, setRecording] = useState(false);
  const [assistantInput, setAssistantInput] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product>(() => products[0] ?? demoProducts[0]);
  const [recipeDraft, setRecipeDraft] = useState<{ itemId: string; quantity: number }[]>([]);
  const [inventoryEditor, setInventoryEditor] = useState<InventoryItem | null>(null);
  const [purchaseItem, setPurchaseItem] = useState(() => inventory[0]?.id ?? "");
  const [pendingMutation, setPendingMutation] = useState(false);
  const [segment, setSegment] = useState("Semua");
  const [notificationsRead, setNotificationsRead] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [tour, setTour] = useState<{ features: GuideFeature[]; origin: View; scrollY: number } | null>(null);
  const [transactionPage, setTransactionPage] = useState(0);
  const [transactionMethod, setTransactionMethod] = useState("Semua");
  const [photoName, setPhotoName] = useState("");
  const [menuImage, setMenuImage] = useState<{ file: File; preview: string } | null>(null);
  const [pendingCheckout, setPendingCheckout] = useState(false);
  const [pendingAi, setPendingAi] = useState(false);
  const [pendingScan, setPendingScan] = useState(false);
  const [aiRequests] = useState(createRequestSlot);
  const [scanRequests] = useState(createRequestSlot);
  const [customerEditor, setCustomerEditor] = useState<Customer | null>(null);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [confirmError, setConfirmError] = useState("");
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const [scanHikeAlert, setScanHikeAlert] = useState<{ rawName: string; name: string; oldCost: number; unitCost: number; diffPercent: number } | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speech = useRef<{ stop: () => void } | null>(null);
  const purchaseAttempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const checkoutAttempt = useRef<{ fingerprint: string; key: string } | null>(null);

  const notify = useCallback((text: string) => { setToast(text); if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(""), 4500); }, []);
  const go = useCallback((next: View) => {
    setView(next); setQuery(""); setCategory("Semua menu"); setSegment("Semua"); setTransactionPage(0); setSidebarOpen(false); setError("");
    if (window.location.hash !== `#${next}`) window.history.pushState(null, "", `#${next}`);
    window.scrollTo({ top: 0, behavior: "instant" });
    requestAnimationFrame(() => { if (!document.querySelector('[role="dialog"], dialog[open]')) document.getElementById("page-title")?.focus({ preventScroll: true }); });
  }, []);
  const cancelAiRequests = useCallback(() => {
    aiRequests.cancel(); scanRequests.cancel();
    const recognition = speech.current; speech.current = null; recognition?.stop();
    setRecording(false); setPendingAi(false); setPendingScan(false);
  }, [aiRequests, scanRequests]);
  const open = useCallback((next: ModalName) => {
    if (!canRecordOperations && next && ["voice", "checkout", "purchase", "expense", "customer"].includes(next)) { notify("Peran dapur hanya dapat melihat data. Hubungi owner untuk perubahan akses."); return; }
    // Cancel before destination work starts, never in a modal-dependent effect cleanup.
    cancelAiRequests();
    setError(""); setSidebarOpen(false); setModal(next);
  }, [canRecordOperations, cancelAiRequests, notify]);
  const close = useCallback(() => { cancelAiRequests(); setModal(null); setError(""); setVoiceNotice(""); setScanHikeAlert(null); setPhotoName(""); setMenuImage(null); setCustomerEditor(null); }, [cancelAiRequests]);
  const previewTourPage = useCallback((next: View) => { setView(next); setSidebarOpen(false); }, []);
  const startTour = (features = getTourFeatures(user?.role ?? (mode === "local" ? "owner" : "dapur"), mode)) => {
    close();
    try { localStorage.setItem(guideStorageKey(mode, user?.id, workspaceId), "seen"); } catch { /* Tours remain available when browser storage is disabled. */ }
    setTour({ features, origin: view, scrollY: window.scrollY });
  };
  const finishTour = (completed: boolean) => {
    if (!tour) return;
    setView(tour.origin);
    const scrollY = tour.scrollY;
    setTour(null);
    requestAnimationFrame(() => { window.scrollTo({ top: scrollY, behavior: "instant" }); document.querySelector<HTMLElement>('[data-tour="help-entry"]')?.focus({ preventScroll: true }); });
    if (completed) notify("Tur selesai. Buka Bantuan kapan saja untuk mencari fitur atau mengulang tur.");
  };
  const openGuideFeature = (feature: GuideFeature) => {
    close(); go(feature.view);
    if (feature.dialog === "voice") { setVoiceText(""); setParsed(null); }
    if (feature.dialog) open(feature.dialog);
  };
  function resetDemo() {
    const result = resetDemoSession(mode, confirmRequest?.kind === "demo-reset", {
      storage: { removeItem: key => window.localStorage.removeItem(key) },
      cancelPending: cancelAiRequests,
      createFreshState: () => createInitialState(activeToday),
    });
    if (!result) return;
    close();
    setState(result.state); setCart([]); setReceipt(null); setReceiptCustomer(null);
    setDiscount(0); setTaxEnabled(false); setCash(""); setPayment("QRIS"); setCustomerName(""); setCustomerPhone("");
    setVoiceText(""); setParsed(null); setMessages([]); setAssistantInput("");
    setSelectedProduct(result.state.products?.[0] ?? demoProducts[0]); setRecipeDraft([]); setInventoryEditor(null);
    setPurchaseItem(result.state.inventory?.[0]?.id ?? ""); setPeriod("today"); setChartPeriod("week");
    setNotificationsRead(false); setSearchQuery(""); setTransactionMethod("Semua"); setTour(null);
    setPendingMutation(false); setPendingCheckout(false); setConfirmRequest(null); setConfirmError("");
    checkoutAttempt.current = null; purchaseAttempt.current = null;
    setDemoRevision(current => current + 1);
    go("overview");
    notify(result.storageCleared ? "Demo dimulai ulang. Data contoh dan tur siap dicoba; akunmu tidak berubah." : "Demo baru siap di sesi ini. Penyimpanan browser tidak tersedia; data lama mungkin muncul saat dimuat ulang.");
  }
  function openReceiptAction(action: ReceiptAction) {
    close(); go(action.view);
    if (action.query) setQuery(action.query);
  }
  function focusCart() {
    const cartPanel = document.getElementById("pos-cart");
    if (!cartPanel) return;
    const headerHeight = document.querySelector(".workspace-header")?.getBoundingClientRect().height ?? 68;
    window.scrollTo({ top: Math.max(0, window.scrollY + cartPanel.getBoundingClientRect().top - headerHeight - 16), behavior: "instant" });
    document.getElementById("cart-heading")?.focus({ preventScroll: true });
  }
  const openProductEditor = (product?: Product) => {
    const draft = product ?? { id: "", name: "", category: state.business.kind === "coffee" ? "Kopi" : "Menu", price: 0, cost: 0, sold: 0, image: mode === "cloud" ? "" : PRODUCT_IMAGES[0], recipe: [], active: true };
    setSelectedProduct(draft);
    setRecipeDraft(draft.recipe.map(line => ({ ...line })));
    open("product-editor");
  };
  const openInventoryEditor = (item?: InventoryItem) => { setInventoryEditor(item ?? null); open("inventory-editor"); };

  useEffect(() => {
    if (mode === "cloud") {
      const hash = window.location.hash.slice(1) as View;
      if (Object.hasOwn(pageNames, hash)) setView(hash);
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
    if (Object.hasOwn(pageNames, hash)) setView(hash);
    setReady(true);
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); speech.current?.stop(); };
  }, [notify, mode]);

  useEffect(() => {
    if (ready && mode === "local") { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { notify("Penyimpanan browser penuh. Perubahan hanya tersedia di sesi ini."); } }
  }, [state, ready, notify, mode]);

  useEffect(() => {
    setPendingAi(false); setPendingScan(false);
    return () => {
      aiRequests.cancel(); scanRequests.cancel();
      const recognition = speech.current; speech.current = null; recognition?.stop();
    };
  }, [aiRequests, scanRequests, mode, workspaceId, user?.id]);

  useEffect(() => {
    if (mode === "cloud" && initialState) setState(initialState);
  }, [mode, initialState]);

  useEffect(() => {
    if (!reconciledCart.removed.length) return;
    setCart(current => reconcileCart(current, products).items);
    setDiscount(current => Math.min(current, getCartTotal(reconciledCart.items, 0, false, products).subtotal));
    setCash("");
    checkoutAttempt.current = null;
    const removedNames = [...new Set(reconciledCart.removed.map(item => item.name || item.productId))].join(", ");
    notify(`Menu tidak tersedia dikeluarkan dari keranjang: ${removedNames}. Item lainnya tetap tersimpan. Periksa pesanan sebelum membayar.`);
  }, [reconciledCart, products, notify]);

  useEffect(() => {
    if (!inventory.some(item => item.id === purchaseItem)) setPurchaseItem(inventory[0]?.id ?? "");
  }, [inventory, purchaseItem]);

  useEffect(() => {
    if (!categories.includes(category)) setCategory("Semua menu");
  }, [categories, category]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidebarOpen(false);
      const searchShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";
      if (searchShortcut) event.preventDefault();
      if (document.querySelector('[role="dialog"], dialog[open]')) return;
      if (searchShortcut) { setSearchQuery(""); open("search"); }
      const editing = event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]');
      if (event.key === "?" && !editing && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); open("guide"); }
    };
    const onHistory = () => {
      const hash = window.location.hash.slice(1);
      if (hash && !Object.hasOwn(pageNames, hash)) return;
      close(); setTour(null); setConfirmRequest(null);
      setView((hash || "overview") as View); setQuery(""); setCategory("Semua menu"); setSegment("Semua"); setTransactionPage(0); setSidebarOpen(false); setError("");
      requestAnimationFrame(() => document.getElementById("page-title")?.focus({ preventScroll: true }));
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener("popstate", onHistory);
    window.addEventListener("hashchange", onHistory);
    return () => { document.removeEventListener("keydown", onKey); window.removeEventListener("popstate", onHistory); window.removeEventListener("hashchange", onHistory); };
  }, [close, open]);

  useEffect(() => {
    const shell = shellRef.current;
    const header = shell?.querySelector<HTMLElement>(".workspace-header");
    const summary = shell?.querySelector<HTMLElement>(".mobile-cart-summary");
    if (!shell || !header) return;
    const measure = () => {
      shell.style.setProperty("--workspace-header-height", `${header.getBoundingClientRect().height}px`);
      shell.style.setProperty("--mobile-cart-height", `${summary?.getBoundingClientRect().height ?? 0}px`);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    if (summary) observer.observe(summary);
    measure();
    return () => observer.disconnect();
  }, [view, mode]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const sidebar = shellRef.current?.querySelector<HTMLElement>(".sidebar");
    const previous = document.activeElement as HTMLElement | null;
    sidebar?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !sidebar) return;
      const buttons = Array.from(sidebar.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")).filter(button => button.checkVisibility({ checkVisibilityCSS: true }));
      const first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    const onResize = () => { if (window.innerWidth > 768) setSidebarOpen(false); };
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      if (previous?.isConnected && !previous.closest("[inert]")) previous.focus({ preventScroll: true });
    };
  }, [sidebarOpen]);

  const todaySales = useMemo(() => state.sales.filter(sale => sale.createdAt.slice(0, 10) === activeToday), [state.sales, activeToday]);
  const todayExpensesTotal = state.expenses.filter(expense => expense.createdAt.slice(0, 10) === activeToday).reduce((total, expense) => total + expense.amount, 0);
  const rangeDays = period === "today" ? 1 : period === "week" ? 7 : 30;
  const rangeSales = state.sales.filter(sale => sale.createdAt.slice(0, 10) >= day(1 - rangeDays) && sale.createdAt.slice(0, 10) <= activeToday);
  const previousSales = state.sales.filter(sale => sale.createdAt.slice(0, 10) >= day(1 - rangeDays * 2) && sale.createdAt.slice(0, 10) < day(1 - rangeDays));
  const financials = getSalesFinancials(rangeSales);
  const previousFinancials = getSalesFinancials(previousSales);
  const todayFinancials = getSalesFinancials(todaySales);
  const revenue = financials.revenue, previousRevenue = previousFinancials.revenue, gross = financials.grossProfit;
  const receiptLines = receipt ? getSaleLines(receipt, products) : [];
  const receiptActions = receipt ? getReceiptActions(receipt.id, receiptCustomer, state.customers) : [];
  const average = Math.round(revenue / Math.max(rangeSales.length, 1));
  const growth = previousRevenue ? ((revenue - previousRevenue) / previousRevenue) * 100 : 0;
  const lowStock = inventory.filter(item => getStock(state, item.id) <= item.reorderPoint);
  const topProducts = getProductSales(rangeSales, products);
  const cartSubtotal = getCartTotal(reconciledCart.items, 0, false, products).subtotal;
  const appliedDiscount = Math.min(discount, cartSubtotal);
  const cartTotal = getCartTotal(reconciledCart.items, appliedDiscount, taxEnabled, products, taxRate);
  const cartCount = reconciledCart.items.reduce((total, item) => total + item.quantity, 0);
  const chartDates = chartPeriod === "week" ? Array.from({ length: 7 }, (_, i) => day(i - 6)) : Array.from({ length: 7 }, (_, i) => day(-30 + i * 5));
  const chartValues = chartDates.map(date => sum(state.sales.filter(sale => sale.createdAt.slice(0, 10) >= date && sale.createdAt.slice(0, 10) <= (chartPeriod === "week" ? date : day(Math.min(0, Math.round((new Date(date).getTime() - new Date(activeToday).getTime()) / 86400000) + 4))))));
  const chartPrevious = chartDates.map(date => { const offset = Math.round((new Date(date).getTime() - new Date(activeToday).getTime()) / 86400000); return sum(state.sales.filter(sale => sale.createdAt.slice(0, 10) >= day(offset - (chartPeriod === "week" ? 7 : 35)) && sale.createdAt.slice(0, 10) <= day(offset - (chartPeriod === "week" ? 7 : 35) + (chartPeriod === "week" ? 0 : 4)))); });
  const filteredProducts = products.filter(product => product.active !== false && (category === "Semua menu" || product.category === category) && product.name.toLowerCase().includes(query.toLowerCase()));
  const voiceSample = products.length ? `dua ${products[0].name}${products[1] ? `, satu ${products[1].name}` : ""}, bayar QRIS` : "";
  const purchaseInventoryItem = inventory.find(item => item.id === purchaseItem) ?? inventory[0] ?? null;

  function addProduct(product: Product) {
    setCart(current => { const found = current.find(item => item.productId === product.id); return found ? current.map(item => item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item) : [...current, { productId: product.id, quantity: 1 }]; });
  }
  function updateQuantity(id: string, amount: number) { setCart(current => current.map(item => item.productId === id ? { ...item, quantity: item.quantity + amount } : item).filter(item => item.quantity > 0)); }

  async function checkout(event: FormEvent) {
    event.preventDefault(); setError("");
    if (reconciledCart.removed.length) { setError("Katalog berubah. Periksa keranjang sebelum melanjutkan pembayaran."); return; }
    if (mode === "cloud") {
      const items = cart.map(i => ({ productId: i.productId, quantity: i.quantity, ...(i.note ? { note: i.note } : {}) }));
      const cashReceived = payment === "Tunai" ? Number(cash) : cartTotal.total;
      const trimmedCustomerName = customerName.trim() || undefined;
      const trimmedCustomerPhone = customerPhone.trim() || undefined;
      const channel: Sale["channel"] = view === "storefront" ? "Etalase" : "Kasir";
      const fingerprint = JSON.stringify({ items, payment, cashReceived, customerName: trimmedCustomerName, customerPhone: trimmedCustomerPhone, discount: appliedDiscount, taxEnabled, channel });
      if (checkoutAttempt.current?.fingerprint !== fingerprint) {
        checkoutAttempt.current = { fingerprint, key: crypto.randomUUID() };
      }
      setPendingCheckout(true);
      try {
        const res = await completeSaleAction({
          items,
          payment,
          cashReceived,
          customerName: trimmedCustomerName,
          customerPhone: trimmedCustomerPhone,
          discount: appliedDiscount,
          taxEnabled,
          channel,
          idempotencyKey: checkoutAttempt.current.key,
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
        checkoutAttempt.current = null;
        setReceiptCustomer(res.data.customer ? { saleId: res.data.sale.id, customerId: res.data.customer.id } : null);
        setReceipt(res.data.sale); setCart([]); setDiscount(0); setTaxEnabled(false); setCash(""); setCustomerName(""); setCustomerPhone(""); open("receipt"); notify("Transaksi tersimpan di cloud Supabase. Stok bahan otomatis diperbarui.");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Transaksi belum dapat disimpan.");
      } finally {
        setPendingCheckout(false);
      }
      return;
    }

    try {
      const result = completeSale(state, { items: cart, payment, cashReceived: payment === "Tunai" ? Number(cash) : cartTotal.total, customerName: customerName.trim() || undefined, customerPhone: customerPhone.trim() || undefined, discount: appliedDiscount, taxEnabled, channel: view === "storefront" ? "Etalase" : "Kasir" });
      const linkedCustomer = customerPhone.trim() ? result.state.customers.find(customer => customer.phone === customerPhone.trim()) : undefined;
      setReceiptCustomer(linkedCustomer ? { saleId: result.sale.id, customerId: linkedCustomer.id } : null);
      setState(result.state); setReceipt(result.sale); setCart([]); setDiscount(0); setTaxEnabled(false); setCash(""); setCustomerName(""); setCustomerPhone(""); open("receipt"); notify("Transaksi tercatat. Stok bahan otomatis diperbarui.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Transaksi belum dapat disimpan."); }
  }

  function downloadCsv() {
    const blob = new Blob(["\uFEFF", exportSalesCsv(state)], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `Laris-penjualan-${activeToday}.csv`; link.click(); URL.revokeObjectURL(link.href); notify("Laporan CSV diunduh. Dapat dibuka di Excel.");
  }

  async function askAssistant(question: string) {
    if (!question.trim()) return;
    const userMsg = question.trim();
    const request = aiRequests.begin();
    setError("");
    setAssistantInput("");
    setMessages(current => [...current, { role: "user", text: userMsg }]);
    setPendingAi(true);

    const respondLocally = () => {
      const text = userMsg.toLowerCase();
      let answer = `Saya bisa membantu membaca omzet, produk terlaris, stok bahan, dan keuntungan dari data ${state.business.name}. Coba tanyakan: ‘Menu apa yang paling laris hari ini?’`;
      if (/stok|belanja|bahan|susu/.test(text)) answer = lowStock.length ? `Ada ${lowStock.length} bahan yang perlu diperhatikan: ${lowStock.map(item => `${item.name} tersisa ${getStock(state, item.id).toLocaleString("id-ID")} ${item.unit}`).join(", ")}. Prioritaskan belanja bahan ini sebelum operasional berikutnya.` : "Semua bahan masih di atas batas minimum. Belum ada yang perlu dibeli berdasarkan aturan stok saat ini.";
      else if (/untung|margin|laba/.test(text)) answer = gross === null || financials.cost === null
        ? `Omzet periode ini ${currency(revenue)}. HPP historis tidak tersedia untuk ${financials.missingCostLines} baris arsip lama; laba dan margin tidak dapat dihitung. Biaya katalog saat ini tidak dipakai untuk mengganti biaya historis.`
        : `Dari ${rangeSales.length} transaksi pada periode terpilih, omzetmu ${currency(revenue)} dengan HPP saat penjualan ${currency(financials.cost)}. Jadi, untung kotornya ${currency(gross)} (margin ${revenue ? (gross / revenue * 100).toFixed(1) : 0}%). Ini belum dikurangi biaya operasional. Lihat Keuangan untuk rincian.`;
      else if (/menu|laris|produk/.test(text)) answer = topProducts[0]?.count ? `${topProducts[0].name} jadi favorit pelanggan dengan ${topProducts[0].count} item terjual, menyumbang ${historicalCurrency(topProducts[0].revenue)} sebelum diskon (arsip harga penjualan).${topProducts[1] ? ` Disusul ${topProducts[1].name} (${topProducts[1].count} item).` : ""}` : "Belum ada penjualan pada periode ini. Catat transaksi pertama agar kita bisa membandingkan menu yang paling diminati.";
      else if (/omzet|penjualan|sabtu|turun|hari|ringkas/.test(text)) answer = `Omzet periode ini ${currency(revenue)}, ${growth >= 0 ? "naik" : "turun"} ${Math.abs(growth).toFixed(1)}% dibanding periode sebelumnya, dari ${rangeSales.length} transaksi. Rata-rata belanja ${currency(average)}. Data ini menunjukkan perubahan penjualan, tetapi belum cukup untuk memastikan penyebabnya.`;
      if (request.canCommit()) setMessages(current => [...current, { role: "assistant", text: `local-rules · Jawaban aturan lokal. ${answer}` }]);
    };

    try {
      if (mode === "local") {
        respondLocally();
        return;
      }
      const data = await fetchAiJson<{ answer: string; source?: string; notice?: string }>("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: userMsg, history: messages.slice(-12), mode }),
      }, request.signal);
      if (!request.canCommit()) return;
      if (typeof data.answer !== "string" || !data.answer.trim()) throw new Error("Jawaban AI kosong. Gunakan laporan workspace atau coba lagi.");
      const answer = `${data.source ?? "AI"}${data.notice ? ` · ${data.notice}` : ""}\n${data.answer}`;
      setMessages(current => [...current, { role: "assistant", text: answer }]);
    } catch (caught) {
      if (!request.isCurrent()) return;
      setError(aiFailureReason(caught, request.signal) === "timeout" ? "Batas waktu 20 detik tercapai. Coba lagi atau buka laporan workspace." : caught instanceof Error ? caught.message : "Gagal menghubungi Tanya Laris.");
    } finally {
      if (request.finish()) setPendingAi(false);
    }
  }

  async function handleVoiceParse(text: string) {
    if (!text.trim()) return;
    const request = aiRequests.begin();
    setError(""); setParsed(null); setVoiceNotice("");
    setPendingAi(true);
    try {
      if (mode === "local") {
        setParsed(parseOrder(text, products.filter(product => product.active !== false)));
        setVoiceNotice("local-parser · Pengurai teks lokal, bukan hasil model AI. Periksa sebelum konfirmasi.");
        return;
      }
      const data = await fetchAiJson<ReturnType<typeof parseOrder> & { source?: string; notice?: string }>("/api/ai/parse-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, mode }),
      }, request.signal);
      if (!request.canCommit()) return;
      if (!Array.isArray(data.items) || !Array.isArray(data.unknown) || !["Tunai", "QRIS", "Transfer"].includes(data.payment)) throw new Error("Hasil pesanan tidak valid. Isi pesanan secara manual.");
      setParsed({ items: data.items, payment: data.payment, unknown: data.unknown });
      setVoiceNotice(`${data.source ?? "AI"} · ${data.notice ?? "Periksa hasil pesanan sebelum konfirmasi."}`);
    } catch (caught) {
      if (!request.isCurrent()) return;
      setError(aiFailureReason(caught, request.signal) === "timeout" ? "Batas waktu 20 detik tercapai. Ketik ulang atau pilih menu secara manual." : caught instanceof Error ? caught.message : "Gagal mengurai pesanan.");
    } finally {
      if (request.finish()) setPendingAi(false);
    }
  }

  function startVoice() {
    type SpeechResult = { results: { 0: { 0: { transcript: string } } } };
    type Recognition = { lang: string; interimResults: boolean; onresult: (event: SpeechResult) => void; onerror: () => void; onend: () => void; start: () => void; stop: () => void };
    const browser = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Constructor = browser.SpeechRecognition || browser.webkitSpeechRecognition;
    if (!Constructor) { setError("Browser ini belum mendukung input suara. Ketik pesanan di bawah, ya."); return; }
    try {
      cancelAiRequests();
      const recognition = new Constructor(); recognition.lang = "id-ID"; recognition.interimResults = false;
      recognition.onresult = event => {
        if (speech.current !== recognition) return;
        const transcript = event.results[0][0].transcript;
        setVoiceText(transcript);
        handleVoiceParse(transcript);
      };
      recognition.onerror = () => { if (speech.current !== recognition) return; setRecording(false); setError("Mikrofon tidak tersedia atau izin belum diberikan. Gunakan input teks."); };
      recognition.onend = () => { if (speech.current === recognition) setRecording(false); };
      speech.current = recognition; recognition.start(); setRecording(true);
    } catch { setError("Input suara tidak tersedia. Silakan ketik pesanan."); }
  }

  async function handleReceiptScan(file: File) {
    scanRequests.cancel(); setPendingScan(false);
    setError("");
    setScanHikeAlert(null);
    setPhotoName("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError("Gunakan foto nota berformat JPG, PNG, atau WebP."); return; }
    if (file.size > 8 * 1024 * 1024) { setError("Ukuran foto maksimal 8 MB."); return; }
    const request = scanRequests.begin();
    setPendingScan(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mode", mode);
      type ScanLine = { matchedCode: string; rawName: string; name: string; quantity: number; unit: string; total: number; oldCost: number; unitCost: number; priceHike?: { diffPercent: number } };
      const data = await fetchAiJson<{ lines: ScanLine[]; source?: string; notice?: string }>("/api/ai/scan-receipt", { method: "POST", body: formData }, request.signal);
      if (!request.canCommit()) return;
      if (!Array.isArray(data.lines) || data.lines.length === 0) throw new Error("Tidak ada bahan yang terbaca. Isi pembelian secara manual.");
      const item = data.lines[0];
      if (!item || !inventory.some(ingredient => ingredient.id === item.matchedCode) || !Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.total) || item.total <= 0) throw new Error("Hasil nota tidak sesuai katalog atau angka tidak valid. Isi pembelian secara manual.");
      setPhotoName(file.name);
      setPurchaseItem(item.matchedCode);
      const qtyEl = document.querySelector<HTMLInputElement>('input[name="quantity"]');
      const totalEl = document.querySelector<HTMLInputElement>('input[name="total"]');
      if (qtyEl) qtyEl.value = String(item.quantity);
      if (totalEl) totalEl.value = String(item.total);
      if (item.priceHike) setScanHikeAlert({ ...item, diffPercent: item.priceHike.diffPercent });
      if (data.source === "mock-ocr") notify(`${data.notice} Isian contoh: ${item.name}. Periksa sebelum menyimpan.`);
      else notify(`Nota dipindai dengan Gemini AI: ${item.name} (${item.quantity} ${item.unit}) - ${currency(item.total)}. ${data.notice ?? "Periksa sebelum menyimpan."}`);
    } catch (caught) {
      if (!request.isCurrent()) return;
      setError(aiFailureReason(caught, request.signal) === "timeout" ? "Batas waktu 20 detik tercapai. Isi bahan, jumlah, dan total pembelian secara manual." : caught instanceof Error ? caught.message : "Gagal memindai nota. Isi pembelian secara manual.");
    } finally {
      if (request.finish()) setPendingScan(false);
    }
  }

  async function submitPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const itemId = String(form.get("itemId"));
    const quantity = Number(form.get("quantity"));
    const total = Number(form.get("total"));

    if (mode === "cloud") {
      const source = photoName ? "scan" : "manual";
      const fingerprint = JSON.stringify({ itemId, quantity, total, source });
      if (purchaseAttempt.current?.fingerprint !== fingerprint) {
        purchaseAttempt.current = { fingerprint, key: crypto.randomUUID() };
      }
      setPendingMutation(true);
      try {
        const res = await recordPurchaseAction({
          lines: [{ itemId, quantity, total }],
          source,
          idempotencyKey: purchaseAttempt.current.key,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setState(current => ({
          ...current,
          purchases: [...current.purchases, ...res.data.purchases],
          stockMovements: [...current.stockMovements, ...res.data.stockMovements],
          products: res.data.products,
          inventory: res.data.inventory,
        }));
        purchaseAttempt.current = null;
        close();
        notify("Pembelian disimpan di cloud dan stok bahan bertambah.");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Pembelian gagal disimpan.");
      } finally {
        setPendingMutation(false);
      }
      return;
    }

    try { setState(recordPurchase(state, { itemId, quantity, total })); close(); notify("Pembelian dicatat dan stok bahan bertambah."); } catch (caught) { setError(caught instanceof Error ? caught.message : "Pembelian gagal disimpan."); }
  }

  async function submitExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingMutation) return;
    setError("");
    const form = new FormData(event.currentTarget);
    const amount = Number(form.get("amount"));
    const description = String(form.get("description")).trim();
    const expCategory = String(form.get("category"));
    if (!Number.isSafeInteger(amount) || amount <= 0 || !description) {
      setError("Isi keperluan dan jumlah rupiah bulat yang lebih dari nol.");
      return;
    }
    if (mode === "cloud") {
      setPendingMutation(true);
      try {
        const res = await addExpenseAction({ description, category: expCategory, amount });
        if (!res.ok) { setError(res.error); return; }
        setState(current => ({ ...current, expenses: [...current.expenses, res.data] }));
        close();
        notify("Pengeluaran berhasil dicatat di cloud.");
      } catch {
        setError("Pengeluaran belum dapat disimpan. Periksa koneksi lalu coba lagi.");
      } finally {
        setPendingMutation(false);
      }
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
    const editor = customerEditor;
    if (mode === "cloud") {
      if (pendingMutation) return;
      setPendingMutation(true);
      let res: Awaited<ReturnType<typeof addCustomerAction>>;
      try {
        res = editor ? await updateCustomerAction({ id: editor.id, name, phone }) : await addCustomerAction({ name, phone });
      } finally {
        setPendingMutation(false);
      }
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const saved = res.data;
      // A re-added phone can revive a soft-deleted profile; replace by id so it never appears twice.
      setState(current => ({ ...current, customers: current.customers.some(customer => customer.id === saved.id) ? current.customers.map(customer => customer.id === saved.id ? saved : customer) : [...current.customers, saved] }));
      close();
      notify(editor ? "Data pelanggan berhasil diperbarui di cloud." : "Pelanggan baru berhasil ditambahkan di cloud.");
      return;
    }
    if (editor) {
      try {
        setState(updateCustomer(state, { customerId: editor.id, name, phone }));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Perubahan gagal disimpan.");
        return;
      }
      close();
      notify("Data pelanggan berhasil diperbarui.");
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
    if (!canManageBusiness) { setError("Hanya owner yang dapat mengubah pengaturan usaha."); return; }
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name")).trim();
    const owner = String(form.get("owner")).trim();
    const outlet = String(form.get("outlet")).trim();
    const kind = String(form.get("kind") || state.business.kind || "other");
    const dayTarget = Number(form.get("target"));
    const taxRate = Number(form.get("taxRate"));
    const receiptFooter = String(form.get("receiptFooter") || "").trim();
    if (!name || !owner || !outlet || !Number.isSafeInteger(dayTarget) || dayTarget <= 0) {
      setError("Lengkapi profil dan target penjualan yang valid.");
      return;
    }
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
      setError("Pajak harus antara 0 dan 100 persen.");
      return;
    }
    if (mode === "cloud") {
      const res = await updateSettingsAction({ name, owner, outlet, dayTarget, kind: kind as "coffee" | "restaurant" | "bakery" | "bar" | "other", taxRate, receiptFooter });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setState(current => ({ ...current, business: { ...current.business, name, owner, outlet, kind, taxRate, receiptFooter }, dayTarget }));
      close();
      notify("Pengaturan usaha berhasil diperbarui di cloud.");
      return;
    }
    setState(current => ({ ...current, business: { ...current.business, name, owner, outlet, kind, taxRate, receiptFooter }, dayTarget }));
    close();
    notify("Profil usaha diperbarui.");
  }

  async function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const code = String(form.get("code") || "") || null;
    const name = String(form.get("name") || "").trim();
    const categoryName = String(form.get("category") || "").trim();
    const price = Number(form.get("price"));
    const image = String(form.get("image") || "");
    const active = form.get("active") === "on";
    const recipe = recipeDraft.filter(line => line.itemId).map(line => ({ itemId: line.itemId, quantity: Number(line.quantity) }));
    if (!name || !categoryName || !Number.isSafeInteger(price) || price < 0 || recipe.some(line => !Number.isFinite(line.quantity) || line.quantity <= 0)) {
      setError("Lengkapi nama, kategori, harga bulat, dan jumlah bahan yang valid.");
      return;
    }
    if (new Set(recipe.map(line => line.itemId)).size !== recipe.length) {
      setError("Bahan yang sama hanya boleh muncul sekali dalam resep.");
      return;
    }
    if (mode === "cloud") {
      setPendingMutation(true);
      try {
        const urlInput = String(form.get("imageUrl") || "").trim();
        let finalImage = image;
        if (menuImage) {
          const uploadForm = new FormData();
          uploadForm.set("file", menuImage.file);
          const uploaded = await uploadMenuImageAction(uploadForm);
          if (!uploaded.ok) { setError(uploaded.error); return; }
          finalImage = uploaded.data.url;
        } else if (urlInput) {
          finalImage = urlInput;
        }
        const res = await saveProductAction({ code, name, category: categoryName, price, image: finalImage, active, recipe });
        if (!res.ok) { setError(res.error); return; }
        setState(current => ({ ...current, products: res.data.products, inventory: res.data.inventory }));
        const saved = res.data.products.find(product => product.id === code) ?? res.data.products.find(product => product.name === name);
        if (saved) setSelectedProduct(saved);
        close();
        notify(code ? "Menu dan resep berhasil diperbarui." : "Menu baru berhasil ditambahkan.");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Menu gagal disimpan.");
      } finally {
        setPendingMutation(false);
      }
      return;
    }
    const id = code ?? `menu-${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;
    const cost = Math.round(recipe.reduce((total, line) => total + (inventory.find(item => item.id === line.itemId)?.cost ?? 0) * line.quantity, 0));
    const saved: Product = { id, name, category: categoryName, price, cost, sold: selectedProduct.sold, image, active, recipe };
    setState(current => ({ ...current, products: code ? products.map(product => product.id === code ? saved : product) : [...products, saved], inventory }));
    setSelectedProduct(saved);
    close();
    notify(code ? "Menu dan resep berhasil diperbarui." : "Menu baru berhasil ditambahkan.");
  }

  async function submitInventoryItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const code = String(form.get("code") || "") || null;
    const name = String(form.get("name") || "").trim();
    const unit = String(form.get("unit") || "").trim();
    const cost = Number(form.get("cost"));
    const reorderPoint = Number(form.get("reorderPoint"));
    const supplier = String(form.get("supplier") || "").trim();
    const openingStock = Number(form.get("openingStock") || 0);
    const countedRaw = String(form.get("countedStock") || "").trim();
    const countedStock = countedRaw ? Number(countedRaw) : null;
    if (!name || !/^[a-zA-Z][a-zA-Z0-9 ]{0,19}$/.test(unit) || [cost, reorderPoint, openingStock].some(value => !Number.isFinite(value) || value < 0) || (countedStock !== null && (!Number.isFinite(countedStock) || countedStock < 0))) {
      setError("Lengkapi nama, satuan, biaya, dan jumlah stok yang valid.");
      return;
    }
    if (mode === "cloud") {
      setPendingMutation(true);
      try {
        const res = await saveInventoryItemAction({ code, name, unit, cost, reorderPoint, supplier, openingStock, countedStock });
        if (!res.ok) { setError(res.error); return; }
        setState(current => ({
          ...current, products: res.data.products, inventory: res.data.inventory,
          stockMovements: res.data.movement ? [...current.stockMovements, res.data.movement] : current.stockMovements,
        }));
        close();
        notify(countedStock !== null ? "Bahan dan hasil stok opname berhasil disimpan." : code ? "Bahan berhasil diperbarui." : "Bahan baru berhasil ditambahkan.");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Bahan gagal disimpan.");
      } finally {
        setPendingMutation(false);
      }
      return;
    }
    const id = code ?? `item-${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;
    setState(current => {
      const currentInventory = current.inventory ?? inventory;
      const existing = currentInventory.find(item => item.id === id);
      const saved: InventoryItem = { id, name, unit, cost, reorderPoint, supplier: supplier || "Belum diatur", openingStock: existing?.openingStock ?? openingStock };
      const nextInventory = existing ? currentInventory.map(item => item.id === id ? saved : item) : [...currentInventory, saved];
      const currentStock = existing ? getStock(current, id) : 0;
      const delta = countedStock === null ? 0 : countedStock - currentStock;
      const movement = existing && delta !== 0 ? [{ id: `opname-${crypto.randomUUID()}`, itemId: id, quantity: delta, type: "adjustment" as const, reference: "opname", createdAt: timestamp(activeToday) }] : [];
      const nextProducts = (current.products ?? products).map(product => ({
        ...product,
        cost: Math.round(product.recipe.reduce((total, line) => total + (nextInventory.find(item => item.id === line.itemId)?.cost ?? 0) * line.quantity, 0)),
      }));
      return { ...current, inventory: nextInventory, products: nextProducts, stockMovements: [...current.stockMovements, ...movement] };
    });
    close();
    notify(countedStock !== null ? "Bahan dan hasil stok opname berhasil disimpan." : code ? "Bahan berhasil diperbarui." : "Bahan baru berhasil ditambahkan.");
  }

  async function submitInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const role = String(form.get("role")) as "manager" | "kasir" | "dapur";
    setPendingMutation(true);
    try {
      const res = await inviteTeamMemberAction({ email, role });
      if (!res.ok) { setError(res.error); return; }
      setState(current => {
        const members = current.members ?? [];
        return { ...current, members: members.some(member => member.id === res.data.member.id) ? members.map(member => member.id === res.data.member.id ? res.data.member : member) : [...members, res.data.member] };
      });
      close();
      notify(res.data.alreadyMember ? "Anggota sudah menjadi bagian workspace ini." : res.data.invited ? "Undangan email terkirim dan akses anggota sudah disiapkan." : "Anggota berhasil ditambahkan ke workspace.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Undangan gagal diproses.");
    } finally {
      setPendingMutation(false);
    }
  }

  const confirmCopy = (request: ConfirmRequest): { title: string; description: string; action: string } => {
    switch (request.kind) {
      case "demo-reset": return { title: "Mulai ulang demo?", description: "Transaksi, perubahan katalog dan stok, pelanggan, serta keranjang demo di browser ini akan diganti dengan data contoh Kopi Senja. Preferensi tur demo juga diulang. Akun, sesi login, dan data cloud tidak diubah. Tindakan ini tidak bisa dibatalkan.", action: "Ya, mulai ulang demo" };
      case "product": return { title: "Hapus menu ini?", description: `${request.product.name} beserta resepnya akan dihapus dari daftar menu dan barisnya dikeluarkan dari keranjang. Item lainnya dan riwayat transaksi tetap tersimpan.`, action: "Ya, hapus menu" };
      case "inventory": return { title: "Hapus bahan ini?", description: `${request.item.name} akan dihapus dari daftar bahan. Bahan yang masih dipakai resep tidak dapat dihapus.`, action: "Ya, hapus bahan" };
      case "customer": return { title: "Hapus pelanggan ini?", description: `Profil ${request.customer.name} akan dihapus dari daftar pelanggan. Riwayat transaksinya tetap tersimpan.`, action: "Ya, hapus pelanggan" };
      case "expense": return { title: "Hapus catatan pengeluaran?", description: `${request.expense.description} (${currency(request.expense.amount)}) akan dihapus dari rekap keuangan.`, action: "Ya, hapus catatan" };
      case "team-remove": return { title: "Keluarkan anggota ini?", description: `${request.member.name} tidak lagi dapat mengakses workspace ini.`, action: "Ya, keluarkan" };
      case "team-role": return { title: "Ubah peran anggota?", description: `${request.member.name} akan menjadi ${roleLabels[request.role]}.`, action: "Ya, ubah peran" };
    }
  };

  const askConfirm = (request: ConfirmRequest) => { setConfirmError(""); setConfirmRequest(request); };

  async function runConfirm() {
    if (!confirmRequest || pendingConfirm) return;
    const request = confirmRequest;
    setConfirmError("");
    setPendingConfirm(true);
    try {
      if (request.kind === "demo-reset") {
        resetDemo();
      } else if (request.kind === "product") {
        if (mode === "cloud") {
          const res = await deleteProductAction({ code: request.product.id });
          if (!res.ok) { setConfirmError(res.error); return; }
          setState(current => ({ ...current, products: res.data.products, inventory: res.data.inventory }));
        } else {
          setState(deleteProduct(state, request.product.id));
        }
        // The menu detail dialog underneath still shows the deleted menu; close it too.
        if (modal === "recipe") close();
        notify("Menu dan resepnya berhasil dihapus.");
      } else if (request.kind === "inventory") {
        if (mode === "cloud") {
          const res = await deleteInventoryItemAction({ code: request.item.id });
          if (!res.ok) { setConfirmError(res.error); return; }
          setState(current => ({ ...current, products: res.data.products, inventory: res.data.inventory }));
        } else {
          setState(deleteInventoryItem(state, request.item.id));
        }
        notify("Bahan berhasil dihapus.");
      } else if (request.kind === "customer") {
        if (mode === "cloud") {
          const res = await deleteCustomerAction({ id: request.customer.id });
          if (!res.ok) { setConfirmError(res.error); return; }
          setState(current => ({ ...current, customers: current.customers.filter(customer => customer.id !== request.customer.id) }));
        } else {
          setState(deleteCustomer(state, request.customer.id));
        }
        notify("Pelanggan berhasil dihapus. Riwayat transaksinya tetap tersimpan.");
      } else if (request.kind === "expense") {
        if (mode === "cloud") {
          const res = await deleteExpenseAction({ id: request.expense.id });
          if (!res.ok) { setConfirmError(res.error); return; }
          setState(current => ({ ...current, expenses: current.expenses.filter(expense => expense.id !== request.expense.id) }));
        } else {
          setState(deleteExpense(state, request.expense.id));
        }
        notify("Catatan pengeluaran berhasil dihapus.");
      } else if (request.kind === "team-remove") {
        const res = await removeTeamMemberAction({ userId: request.member.id });
        if (!res.ok) { setConfirmError(res.error); return; }
        setState(current => ({ ...current, members: (current.members ?? []).filter(member => member.id !== request.member.id) }));
        notify("Anggota berhasil dikeluarkan dari workspace.");
      } else if (request.kind === "team-role") {
        const res = await updateTeamMemberRoleAction({ userId: request.member.id, role: request.role });
        if (!res.ok) { setConfirmError(res.error); return; }
        setState(current => ({ ...current, members: (current.members ?? []).map(member => member.id === request.member.id ? { ...member, role: request.role } : member) }));
        notify(`Peran ${request.member.name} kini ${roleLabels[request.role]}.`);
      }
      setConfirmRequest(null);
    } catch (caught) {
      setConfirmError(caught instanceof Error ? caught.message : "Perubahan belum dapat diproses.");
    } finally {
      setPendingConfirm(false);
    }
  }

  const renderTransactions = (compact = false) => {
    const transactions = [...(compact ? todaySales : state.sales)]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .filter(
        sale =>
          (transactionMethod === "Semua" || sale.payment === transactionMethod) &&
          `${sale.id} ${sale.customerName}`.toLowerCase().includes(query.toLowerCase())
      );

    const pageSize = 12;
    const totalPages = Math.max(1, Math.ceil(transactions.length / pageSize));
    const displayed = compact
      ? transactions.slice(0, 4)
      : transactions.slice(transactionPage * pageSize, transactionPage * pageSize + pageSize);

    const paymentStyle = (method: Sale["payment"]) => {
      if (method === "QRIS") {
        return "bg-green-light text-green-dark border-green-soft";
      }
      if (method === "Tunai") {
        return "bg-saffron-light text-saffron-heading border-saffron-border";
      }
      return "bg-surface-warm text-foreground border-border";
    };

    const paymentIcon = (method: Sale["payment"]) => {
      if (method === "QRIS") return <Grid2X2 size={13} className="shrink-0" />;
      if (method === "Tunai") return <Banknote size={14} className="shrink-0" />;
      return <Landmark size={13} className="shrink-0" />;
    };

    const formatItemsSummary = (sale: Sale) => {
      const totalQty = sale.items.reduce((acc, item) => acc + item.quantity, 0);
      const firstProduct = sale.items[0] ? getSaleItemName(sale.items[0], products) : "Menu";
      if (sale.items.length > 1) {
        return `${firstProduct} +${sale.items.length - 1} menu (${totalQty} item)`;
      }
      return `${totalQty}× ${firstProduct}`;
    };

    return (
      <>
        {/* Desktop & Tablet Table View */}
        <div className="hidden md:block table-scroll">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-y border-border bg-surface-muted/80 text-[11px] font-semibold uppercase tracking-wider text-muted">
                <th className="py-3.5 pl-6 pr-4">Transaksi</th>
                <th className="px-4 py-3.5">Pelanggan</th>
                {!compact && <th className="px-4 py-3.5">Ringkasan Pesanan</th>}
                <th className="px-4 py-3.5">Metode</th>
                <th className="px-4 py-3.5 text-right">Total</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="py-3.5 pl-4 pr-6 text-right" aria-label="Detail" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70 text-[13px]">
              {displayed.map(sale => (
                <tr
                  key={sale.id}
                  onClick={() => {
                    setReceipt(sale);
                    open("receipt");
                  }}
                  className="group cursor-pointer transition-colors hover:bg-green-light/40"
                >
                  <td className="py-3.5 pl-6 pr-4 align-middle">
                    <div className="flex items-center gap-2">
                      <strong className="transaction-id font-mono text-[13px] font-semibold text-foreground group-hover:text-green-dark">
                        #{sale.id.slice(-6).toUpperCase()}
                      </strong>
                      {!compact && (
                        <span className="rounded-md bg-surface-warm px-1.5 py-0.5 text-[10px] font-medium text-muted">
                          {sale.channel}
                        </span>
                      )}
                    </div>
                    <small className="mt-0.5 block text-[11px] text-muted">
                      {compact ? time(sale.createdAt) : `${shortDate(sale.createdAt)} · ${time(sale.createdAt)}`}
                    </small>
                  </td>

                  <td className="px-4 py-3.5 align-middle">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-saffron-light text-[11px] font-bold text-saffron-heading border border-saffron-border">
                        {initials(sale.customerName || "PU")}
                      </span>
                      <span className="font-medium text-foreground">
                        {sale.customerName || "Pelanggan umum"}
                      </span>
                    </div>
                  </td>

                  {!compact && (
                    <td className="px-4 py-3.5 align-middle text-[12px] text-text-secondary">
                      <span className="block max-w-[240px] truncate">{formatItemsSummary(sale)}</span>
                    </td>
                  )}

                  <td className="px-4 py-3.5 align-middle">
                    <span
                      className={`payment-label inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${paymentStyle(
                        sale.payment
                      )}`}
                    >
                      {paymentIcon(sale.payment)}
                      {sale.payment}
                    </span>
                  </td>

                  <td className="px-4 py-3.5 text-right align-middle tabular-nums">
                    <strong className="text-[13px] font-bold text-foreground">{currency(sale.total)}</strong>
                    {sale.discount > 0 && !compact && (
                      <small className="mt-0.5 block text-[10px] text-green-dark">
                        Hemat {currency(sale.discount)}
                      </small>
                    )}
                  </td>

                  <td className="px-4 py-3.5 align-middle">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-green-soft bg-green-light px-2.5 py-1 text-[11px] font-semibold text-green-dark">
                      <span className="status-dot" />
                      Lunas
                    </span>
                  </td>

                  <td
                    className="py-3.5 pl-4 pr-6 text-right align-middle"
                    onClick={event => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="icon-button inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-text-nav transition-all hover:border-green-soft hover:bg-green-light hover:text-green-dark"
                      aria-label={`Lihat transaksi ${sale.id}`}
                      onClick={() => {
                        setReceipt(sale);
                        open("receipt");
                      }}
                    >
                      <ChevronRight size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Card List View */}
        <div className="grid grid-cols-1 gap-3 p-4 md:hidden">
          {displayed.map(sale => (
            <article
              key={sale.id}
              onClick={() => {
                setReceipt(sale);
                open("receipt");
              }}
              className="group relative flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-xs transition-all active:scale-[0.99] hover:border-green-soft"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <strong className="font-mono text-[13px] font-bold text-foreground">
                      #{sale.id.slice(-6).toUpperCase()}
                    </strong>
                    <span className="rounded-md bg-surface-warm px-1.5 py-0.5 text-[10px] font-medium text-muted">
                      {sale.channel}
                    </span>
                  </div>
                  <span className="mt-0.5 block text-[11px] text-muted">
                    {compact ? time(sale.createdAt) : `${shortDate(sale.createdAt)} · ${time(sale.createdAt)}`}
                  </span>
                </div>

                <span className="inline-flex items-center gap-1.5 rounded-full border border-green-soft bg-green-light px-2.5 py-0.5 text-[11px] font-semibold text-green-dark">
                  <span className="status-dot" />
                  Lunas
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-muted px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-semibold text-foreground">
                    {sale.customerName || "Pelanggan umum"}
                  </p>
                  <p className="truncate text-[11px] text-muted">{formatItemsSummary(sale)}</p>
                </div>
                <span
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${paymentStyle(
                    sale.payment
                  )}`}
                >
                  {paymentIcon(sale.payment)}
                  {sale.payment}
                </span>
              </div>

              <div className="flex items-center justify-between border-t border-border/70 pt-2.5">
                <span className="text-[11px] font-medium text-muted">Total pembayaran</span>
                <div className="flex items-center gap-2">
                  <strong className="text-[15px] font-extrabold tabular-nums text-green-dark">
                    {currency(sale.total)}
                  </strong>
                  <button
                    type="button"
                    className="icon-button inline-flex h-7 w-7 items-center justify-center rounded-lg bg-green-light text-green-dark"
                    aria-label={`Lihat transaksi ${sale.id}`}
                    onClick={event => {
                      event.stopPropagation();
                      setReceipt(sale);
                      open("receipt");
                    }}
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>

        {/* Empty State */}
        {displayed.length === 0 && (
          <EmptyState
            title="Belum ada transaksi"
            description="Coba kata kunci lain atau catat transaksi pertamamu."
          />
        )}

        {/* Full View Pagination Footer */}
        {!compact && (
          <div className="table-pagination flex flex-col items-center justify-between gap-3 border-t border-border bg-surface-paper px-6 py-4 text-[12px] text-muted sm:flex-row">
            <span className="font-medium">
              Menampilkan{" "}
              <strong className="font-semibold text-foreground">
                {transactions.length === 0 ? 0 : transactionPage * pageSize + 1}–
                {Math.min((transactionPage + 1) * pageSize, transactions.length)}
              </strong>{" "}
              dari <strong className="font-semibold text-foreground">{transactions.length.toLocaleString("id-ID")}</strong>{" "}
              transaksi · Halaman {transactionPage + 1} dari {totalPages}
            </span>
            <div className="flex w-full items-center justify-center gap-2 sm:w-auto">
              <button
                type="button"
                className="button secondary small flex-1 sm:flex-initial"
                disabled={transactionPage === 0}
                onClick={() => setTransactionPage(p => p - 1)}
              >
                <ChevronLeft size={15} />
                Sebelumnya
              </button>
              <button
                type="button"
                className="button secondary small flex-1 sm:flex-initial"
                disabled={(transactionPage + 1) * pageSize >= transactions.length}
                onClick={() => setTransactionPage(p => p + 1)}
              >
                Berikutnya
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </>
    );
  };

  const renderProductCards = (shop = false) => <div className={`product-grid ${shop ? "shop-grid" : ""}`}>{filteredProducts.map(product => {
    const available = product.active !== false && product.recipe.every(line => inventory.some(item => item.id === line.itemId) && getStock(state, line.itemId) >= line.quantity);
    return <article className="product-card" key={product.id}><div className="product-photo"><Image src={productImage(product)} alt={product.name} width={400} height={400}/>{topProducts[0]?.id === product.id && topProducts[0]?.count > 0 && <span className="product-tag"><TrendingUp size={11}/>Terlaris</span>}{!available && <span className="product-unavailable">Stok habis</span>}</div><div className="product-info"><small>{product.category}</small><h3>{product.name}</h3><div><strong>{currency(product.price)}</strong><button disabled={!available || !canRecordOperations} className="add-product" aria-label={`Tambah ${product.name}`} onClick={() => { addProduct(product); if (shop) notify(`${product.name} ditambahkan ke pesanan.`); }}><Plus size={18}/></button></div></div></article>;
  })}{filteredProducts.length === 0 && <EmptyState title={products.length ? "Menu tidak ditemukan" : "Belum ada menu aktif"} description={products.length ? "Coba cari dengan nama atau kategori yang lain." : "Tambahkan menu dan resep melalui halaman Produk & resep."}/>}</div>;

  return <div ref={shellRef} className={`app-shell ${view === "pos" ? "is-pos" : ""}`}>
    {sidebarOpen && <button className="sidebar-overlay" onClick={() => setSidebarOpen(false)} aria-label="Tutup navigasi"/>}
    <aside id="app-navigation" className={`sidebar ${sidebarOpen ? "open" : ""}`} aria-label="Navigasi utama" inert={!!modal || !!confirmRequest || !!tour}>
      <button className="icon-button mobile-menu sidebar-close" aria-label="Tutup navigasi" onClick={() => setSidebarOpen(false)}><X size={20}/></button>
      <button className="brand" onClick={() => go("overview")} aria-label="Laris beranda"><LarisMark/><span>laris<span className="brand-period">.</span></span></button>
      <button className="business-switcher" onClick={() => open("settings")}><span className="business-avatar"><Coffee size={20}/></span><span><strong>{state.business.name}</strong><small><span className="status-dot"/> {state.business.outlet}</small></span><ChevronDown size={15}/></button>
      <nav>{navigation.map((group, i) => <div className="nav-group" key={i}>{group.label && <p>{group.label}</p>}{group.items.map(item => <button key={item.id} className={`nav-item ${view === item.id ? "active" : ""}`} onClick={() => go(item.id)} aria-current={view === item.id ? "page" : undefined}><item.icon size={18} strokeWidth={1.7}/><span>{item.label}</span>{item.badge && lowStock.length > 0 && <span className="nav-badge">{lowStock.length}</span>}{item.id === "storefront" && <ArrowUpRight className="nav-external" size={13}/>}</button>)}</div>)}</nav>
      <div className="sidebar-bottom"><button className="nav-item" onClick={() => open("settings")}><Settings2 size={18} strokeWidth={1.7}/><span>Pengaturan</span></button><button className="nav-item" onClick={() => open("guide")}><CircleHelp size={18} strokeWidth={1.7}/><span>Bantuan & panduan</span><ArrowUpRight size={13}/></button>{mode === "cloud" ? <div className="sidebar-footer" style={{ color: "var(--green)" }}><Cloud size={13}/><span>Cloud · {user?.role || "online"}</span></div> : <div className="sidebar-footer"><span className="status-dot"/> Mode demo lokal <span>v0.1</span></div>}</div>
    </aside>
    <div className="workspace" inert={!!modal || !!confirmRequest || !!tour || sidebarOpen}>
      <div className="workspace-header">
      <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Buka navigasi" aria-controls="app-navigation" aria-expanded={sidebarOpen}><Menu size={22}/></button><span className="breadcrumb-home"><Store size={16}/><span>Workspace</span><ChevronRight size={13}/></span><strong>{pageNames[view]}</strong></div><div className="topbar-actions"><button className="global-search" aria-label="Cari fitur atau menu" onClick={() => { setSearchQuery(""); open("search"); }}><Search size={15}/><span>Cari fitur atau menu...</span><kbd>Ctrl/⌘ K</kbd></button><button className="help-entry button secondary small" data-tour="help-entry" onClick={() => open("guide")} aria-label="Bantuan & panduan" title="Bantuan & panduan (?)"><CircleHelp size={18}/><span>Bantuan</span></button>{mode === "cloud" ? <span className="demo-badge"><Cloud size={13}/> Cloud Supabase</span> : null}<span className="topbar-divider"/><button className="notification-button icon-button" aria-label="Notifikasi" onClick={() => { open("notifications"); setNotificationsRead(true); }}><Bell size={19}/>{!notificationsRead && <i/>}</button><button className="profile-button" data-tour="profile-entry" aria-label={`Pengaturan profil ${state.business.owner}`} onClick={() => open("settings")}>{initials(state.business.owner || "Laris")}<span/></button>{mode === "cloud" && <form action={signOutAction} style={{ display: "inline-flex" }}><button className="icon-button" type="submit" aria-label="Keluar akun" title={`Keluar (${user?.email || ""})`}><LogOut size={16}/></button></form>}</div></header>
      {mode === "local" && <section className="demo-toolbar" aria-label="Demo lokal">
        <div className="demo-context"><span className="demo-label"><Coffee size={15}/>Demo lokal</span><p>Data contoh di browser ini · tidak pindah ke akun.</p></div>
        <nav className="demo-actions" aria-label="Akun dan demo"><Link href="/register">Buat akun</Link><Link href="/login">Masuk</Link><button onClick={() => askConfirm({ kind: "demo-reset" })} disabled={!ready}>Mulai ulang demo</button></nav>
      </section>}
      </div>
      {notice && <div className="notice amber" style={{ margin: "16px 24px 0" }}><ShieldCheck size={18}/><span>{notice}</span></div>}
      <main id="main-content" className={`main-content ${view === "pos" ? "pos-main" : ""}`}>
        <div className="page-heading" data-tour="page-heading"><div className="page-title-group"><PageArt view={view}/><div><div className="eyebrow">{view === "overview" ? (activeToday === DEMO_DATE ? "MINGGU, 18 OKTOBER 2026" : new Date(`${activeToday}T12:00:00`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).toUpperCase()) : `${state.business.name.toUpperCase()} · WORKSPACE`}</div><h1 id="page-title" tabIndex={-1}>{view === "overview" ? <>{ready ? greeting(new Date().getHours()) : "Halo"}, {state.business.owner.split(" ")[0]}</> : view === "pos" ? "Kasir" : pageNames[view]}</h1><p>{({ overview: "Penjualan, stok, dan hasil usahamu hari ini.", pos: "Pilih menu, periksa pesanan, lalu catat pembayaran.", transactions: "Riwayat penjualan, metode bayar, dan struk.", products: "Harga jual, resep, dan HPP setiap menu.", inventory: "Sisa stok bahan baku dan batas pesan ulang.", purchases: "Belanja bahan dari pemasok.", customers: "Data pelanggan, kunjungan, dan poin.", storefront: `Etalase ${state.business.name} — pratinjau pemesanan pelanggan.`, finance: "Pendapatan, HPP, pengeluaran, dan laba.", team: "Anggota tim dan hak akses tiap peran." })[view]}</p></div></div><div className="heading-actions">{view === "overview" ? <><button className="button secondary" onClick={() => go("finance")}><ArrowDownToLine size={15}/>Lihat laporan</button><button className="button primary" onClick={() => go("pos")}><Plus size={17}/>Transaksi baru</button></> : view === "purchases" || view === "inventory" ? <>{view === "inventory" && canManageCatalog && <button className="button secondary" onClick={() => openInventoryEditor()}><Plus size={16}/>Tambah bahan</button>}<button className="button primary" disabled={!canRecordOperations} onClick={() => open("purchase")}><Plus size={17}/>Catat pembelian</button></> : view === "products" && canManageCatalog ? <button className="button primary" onClick={() => openProductEditor()}><Plus size={16}/>Tambah menu</button> : view === "team" && mode === "cloud" && user?.role === "owner" ? <button className="button primary" onClick={() => open("invite")}><UserPlus size={16}/>Undang anggota</button> : view === "finance" ? <><button className="button secondary" onClick={downloadCsv}><ArrowDownToLine size={16}/>Ekspor CSV</button><button className="button primary" disabled={!canRecordOperations} onClick={() => open("expense")}><Plus size={16}/>Catat pengeluaran</button></> : view === "transactions" ? <button className="button secondary" onClick={downloadCsv}><ArrowDownToLine size={16}/>Ekspor transaksi</button> : view === "customers" ? <button className="button primary" disabled={!canManageCustomers} onClick={() => open("customer")}><Plus size={16}/>Tambah pelanggan</button> : view === "pos" ? <button className="button voice-button" disabled={!canRecordOperations} onClick={() => { setParsed(null); setVoiceText(""); open("voice"); }}><Mic size={17}/>{mode === "local" ? "Ketik / suara" : "Catat pakai suara"}{mode === "local" ? <span className="ai-badge">Parser lokal</span> : <AiBadge/>}</button> : null}</div></div>

        {ready && !tour && <WelcomeGuide key={`${guideStorageKey(mode, user?.id, workspaceId)}:${demoRevision}`} storageKey={guideStorageKey(mode, user?.id, workspaceId)} mode={mode} onStart={() => startTour()} onHelp={() => open("guide")}/>}
        {!canRecordOperations && <div className="notice neutral"><ShieldCheck size={18}/><p>Mode lihat saja untuk peran dapur. Pencatatan penjualan, pembelian, dan pengeluaran tersedia untuk owner, manager, atau kasir.</p></div>}

        {view === "overview" && <>
          <div className="overview-section-title" data-tour="overview"><h2>Kinerja usaha</h2><div className="date-filter"><CalendarDays size={14}/><select aria-label="Periode ringkasan" value={period} onChange={event => setPeriod(event.target.value)}><option value="today">Hari ini, {new Date(`${activeToday}T12:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</option><option value="week">7 hari terakhir</option><option value="month">30 hari terakhir</option></select><ChevronDown size={13}/></div></div>
          <section className="kpi-grid" aria-label="Ringkasan kinerja">{[
            { label: "Total penjualan", value: currency(revenue), icon: Wallet, change: growth, color: "green", detail: "Penjualan kotor tercatat" },
            { label: "Total transaksi", value: rangeSales.length.toLocaleString("id-ID"), icon: ReceiptText, change: previousSales.length ? (rangeSales.length - previousSales.length) / previousSales.length * 100 : 0, color: "orange", detail: "Pesanan berhasil dilayani" },
            { label: "Rata-rata belanja", value: currency(average), icon: ShoppingBag, change: previousSales.length && previousRevenue ? (average / (previousRevenue / previousSales.length) - 1) * 100 : 0, color: "purple", detail: "Di setiap transaksi" },
            { label: "Untung kotor", value: historicalCurrency(gross), icon: ChartNoAxesCombined, change: gross === null || previousFinancials.grossProfit === null ? null : previousFinancials.grossProfit ? (gross / previousFinancials.grossProfit - 1) * 100 : 0, color: "blue", detail: gross === null ? "HPP arsip lama tidak tersedia" : `Margin ${revenue ? (gross / revenue * 100).toFixed(1).replace(".", ",") : 0}% · HPP saat penjualan` }
          ].map((metric, i) => <article className={`kpi-card kpi-${metric.color}`} key={metric.label}><div className="kpi-top"><span>{metric.label}</span><span className={`metric-icon ${metric.color}`}><metric.icon size={16} strokeWidth={1.7}/></span></div><div className="kpi-value-row"><strong>{metric.value}</strong><Sparkline variant={i} color={metric.color === "orange" || metric.color === "blue" ? "var(--saffron)" : "var(--green)"}/></div><div className="kpi-bottom">{metric.change !== null && <Trend value={metric.change}/>}<span>{metric.detail}</span></div></article>)}</section>
          <div className="dashboard-columns"><div className="dashboard-primary">
            <section className="panel revenue-panel"><div className="section-heading"><div><h3>Grafik penjualan</h3></div><div className="segmented"><button className={chartPeriod === "week" ? "selected" : ""} aria-pressed={chartPeriod === "week"} onClick={() => setChartPeriod("week")}>Minggu ini</button><button className={chartPeriod === "month" ? "selected" : ""} aria-pressed={chartPeriod === "month"} onClick={() => setChartPeriod("month")}>Bulan ini</button></div></div><div className="chart-summary"><strong>{currency(chartValues.reduce((total, value) => total + value, 0))}</strong><span className="chart-legend"><i/>Periode ini <i className="previous"/>Periode lalu</span></div><RevenueChart values={chartValues} previous={chartPrevious} labels={chartDates.map(date => chartPeriod === "week" ? new Date(`${date}T12:00:00`).toLocaleDateString("id-ID", { weekday: "short" }) : shortDate(date))}/><div className="chart-footer"><button className="text-button" onClick={() => go("transactions")}>Lihat detail<ArrowRight size={14}/></button></div></section>
            <section className="panel bestsellers-panel"><SectionHeading title="Menu terlaris" action="Semua menu" onAction={() => go("products")}/><div className="table-scroll"><table className="bestsellers-table"><thead><tr><th>Nama menu</th><th>Terjual</th><th>Penjualan</th><th>Kontribusi</th></tr></thead><tbody>{topProducts.slice(0, 4).map((product, i) => <tr key={product.id}><td><div className="table-product"><span className="product-rank">{String(i + 1).padStart(2, "0")}</span><Image src={productImage(product)} alt="" width={39} height={39}/><div><strong>{product.name}</strong><small>{product.category}</small></div>{i === 0 && <span className="tiny-best"><TrendingUp size={12}/></span>}</div></td><td>{product.count}<span className="muted"> porsi</span></td><td><strong>{historicalCurrency(product.revenue)}</strong></td><td><div className="contribution"><div><span style={{ width: `${product.revenue === null ? 0 : Math.min(100, product.revenue / Math.max(revenue, 1) * 100)}%` }}/></div><span>{product.revenue === null ? "Tidak tersedia" : `${Math.round(product.revenue / Math.max(revenue, 1) * 100)}%`}</span></div></td></tr>)}</tbody></table></div></section>
          </div><div className="dashboard-secondary">
            <section className="insight-card"><div className="insight-title"><span><Sparkles size={15}/>Insight</span></div><h3>{topProducts[0]?.count ? "Menu terlaris periode ini" : "Belum ada penjualan"}</h3><p>{topProducts[0]?.count ? <><strong>{topProducts[0].name}</strong> terjual {topProducts[0].count} item {period === "today" ? "hari ini" : "di periode ini"}. Pastikan stok bahannya cukup.</> : "Belum ada menu yang terjual pada periode ini. Catat pesanan untuk melihat pola favorit pelangganmu."}</p><button onClick={() => { open("assistant"); askAssistant("Menu apa yang paling laris hari ini?"); }}>Cari peluang lainnya<ArrowUpRight size={14}/></button></section>
            <section className="panel stock-panel"><SectionHeading title="Stok perlu perhatian"/><p className="stock-subtitle"><span className="amber-dot"/>{lowStock.length} bahan mulai menipis</p><div className="stock-list">{lowStock.slice(0, 3).map((item, i) => <div key={item.id} className="stock-item"><span className={`stock-item-icon stock-${i}`}><Package size={18} strokeWidth={1.5}/></span><div><strong>{item.name}</strong><small>Tersisa {getStock(state, item.id).toLocaleString("id-ID")} {item.unit}</small></div><Badge tone={getStock(state, item.id) < item.reorderPoint / 2 ? "red" : "amber"}>{getStock(state, item.id) < item.reorderPoint / 2 ? "Segera isi" : "Menipis"}</Badge></div>)}</div><button className="button secondary stock-action" onClick={() => go("inventory")}>Cek stok bahan<ArrowRight size={14}/></button></section>
            <section className="panel target-panel"><div className="target-heading"><span className="target-icon"><Target size={18}/></span><h3>Target harian</h3></div><div className="target-values"><strong>{currency(sum(todaySales))}</strong><span>/ {currency(state.dayTarget)}</span></div><div className="target-progress"><span style={{ width: `${Math.min(100, sum(todaySales) / state.dayTarget * 100)}%` }}/></div><p><strong>{Math.round(sum(todaySales) / state.dayTarget * 100)}% tercapai.</strong> {sum(todaySales) >= state.dayTarget ? "Target terlampaui." : `Kurang ${currency(state.dayTarget - sum(todaySales))} lagi.`}</p></section>
          </div></div>
          <div className="dashboard-bottom"><section className="panel transactions-panel"><SectionHeading title="Transaksi terbaru" action="Lihat semua" onAction={() => go("transactions")}/>{renderTransactions(true)}</section></div>
          <div className="dashboard-footer"><span>{mode === "cloud" ? "Data usaha tersimpan di cloud" : "Data demo · Tersimpan di browser ini"} <ShieldCheck size={12}/></span></div>
        </>}

        {view === "pos" && <div className="pos-layout"><section data-tour="pos-menu"><div className="pos-toolbar"><label className="search-input"><Search size={17}/><input aria-label="Cari menu kasir" placeholder="Cari menu usahamu..." value={query} onChange={event => setQuery(event.target.value)}/></label><span className="menu-count">{products.filter(product => product.active !== false).length} menu tersedia</span></div><div className="category-tabs">{categories.map(item => <button aria-pressed={category === item} className={category === item ? "active" : ""} onClick={() => setCategory(item)} key={item}>{item === "Kopi" && <Coffee size={15}/>} {item}</button>)}</div>{renderProductCards()}</section><aside id="pos-cart" className="panel cart-panel" aria-labelledby="cart-heading"><div className="section-heading"><div><h3 id="cart-heading" tabIndex={-1}>Pesanan baru <span className="count-badge">{cartCount}</span></h3><p>Takeaway · {mode === "cloud" ? roleLabels[user?.role ?? "kasir"] : "Kasir demo"}</p></div><button className="icon-button" disabled={!reconciledCart.items.length || reconciledCart.removed.length > 0} aria-label="Kosongkan keranjang" onClick={() => { setCart([]); setDiscount(0); }}><Trash2 size={17}/></button></div><div className="cart-items">{reconciledCart.items.length === 0 ? <EmptyState title="Mau pesan apa hari ini?" description="Pilih menu, atau gunakan ketik / suara untuk mulai."/> : reconciledCart.items.map(item => { const product = products.find(p => p.id === item.productId); if (!product) return null; return <div className="cart-item" key={item.productId}><Image src={productImage(product)} alt="" width={49} height={49}/><div className="cart-item-info"><strong>{product.name}</strong><span>{currency(product.price)}</span><input aria-label={`Catatan ${product.name}`} maxLength={200} placeholder="Tambah catatan..." value={item.note || ""} onChange={event => setCart(current => current.map(line => line.productId === item.productId ? { ...line, note: event.target.value } : line))}/></div><div className="quantity-control"><button aria-label={`Kurangi ${product.name}`} onClick={() => updateQuantity(product.id, -1)}><Minus size={12}/></button><span>{item.quantity}</span><button aria-label={`Tambah jumlah ${product.name}`} onClick={() => updateQuantity(product.id, 1)}><Plus size={12}/></button></div></div>; })}</div><div className="cart-totals" data-tour="pos-checkout"><div><span>Subtotal</span><strong>{currency(cartTotal.subtotal)}</strong></div><div><label htmlFor="discount">Diskon (Rp)</label><input id="discount" type="number" min="0" max={cartTotal.subtotal} value={discount || ""} placeholder="0" onChange={event => setDiscount(Math.max(0, Number(event.target.value)))}/></div><div><label className="checkbox-label"><input type="checkbox" checked={taxEnabled} onChange={event => setTaxEnabled(event.target.checked)}/> Pajak {taxRate.toLocaleString("id-ID")}%</label><span>{currency(cartTotal.tax)}</span></div><div className="grand-total"><strong>Total pesanan</strong><strong>{currency(cartTotal.total)}</strong></div><button className="button primary checkout-button" disabled={!canRecordOperations || !reconciledCart.items.length || reconciledCart.removed.length > 0 || discount > cartTotal.subtotal} onClick={() => open("checkout")}>Lanjut pembayaran<ArrowRight size={17}/></button><p className="secure-note"><ShieldCheck size={12}/>Pencatatan pembayaran, bukan integrasi pembayaran uang asli.</p></div></aside></div>}

        {view === "transactions" && (() => {
          const matchingSales = state.sales.filter(
            sale =>
              (transactionMethod === "Semua" || sale.payment === transactionMethod) &&
              `${sale.id} ${sale.customerName}`.toLowerCase().includes(query.toLowerCase())
          );
          const filteredTotal = sum(matchingSales);
          const filteredAvg = matchingSales.length ? Math.round(filteredTotal / matchingSales.length) : 0;
          const qrisCount = matchingSales.filter(sale => sale.payment === "QRIS").length;
          const cashCount = matchingSales.filter(sale => sale.payment === "Tunai").length;
          const transferCount = matchingSales.filter(sale => sale.payment === "Transfer").length;

          return (
            <div className="flex flex-col gap-5">
              {/* Summary Metric Badges */}
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
                <div className="panel flex items-center justify-between gap-3 p-4 border-l-4 border-l-green">
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                      Total Nilai Transaksi
                    </span>
                    <strong className="mt-1 block text-[20px] font-extrabold tabular-nums text-foreground">
                      {currency(filteredTotal)}
                    </strong>
                    <span className="mt-0.5 block text-[11px] text-green-dark font-medium">
                      Dari {matchingSales.length.toLocaleString("id-ID")} transaksi tercatat
                    </span>
                  </div>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-light text-green-dark">
                    <Wallet size={19} />
                  </span>
                </div>

                <div className="panel flex items-center justify-between gap-3 p-4 border-l-4 border-l-saffron">
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                      Rata-Rata Keranjang
                    </span>
                    <strong className="mt-1 block text-[20px] font-extrabold tabular-nums text-foreground">
                      {currency(filteredAvg)}
                    </strong>
                    <span className="mt-0.5 block text-[11px] text-saffron-ink font-medium">
                      Nilai belanja per pesanan
                    </span>
                  </div>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-saffron-light text-saffron-dark">
                    <ReceiptText size={19} />
                  </span>
                </div>

                <div className="panel flex items-center justify-between gap-3 p-4">
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                      Pembayaran Non-Tunai
                    </span>
                    <strong className="mt-1 block text-[20px] font-extrabold tabular-nums text-foreground">
                      {(qrisCount + transferCount).toLocaleString("id-ID")}{" "}
                      <span className="text-[12px] font-normal text-muted">pesanan</span>
                    </strong>
                    <span className="mt-0.5 block text-[11px] text-muted">
                      QRIS {qrisCount.toLocaleString("id-ID")} · Transfer {transferCount.toLocaleString("id-ID")}
                    </span>
                  </div>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-light text-green-dark">
                    <Grid2X2 size={19} />
                  </span>
                </div>

                <div className="panel flex items-center justify-between gap-3 p-4">
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                      Pembayaran Tunai
                    </span>
                    <strong className="mt-1 block text-[20px] font-extrabold tabular-nums text-foreground">
                      {cashCount.toLocaleString("id-ID")}{" "}
                      <span className="text-[12px] font-normal text-muted">pesanan</span>
                    </strong>
                    <span className="mt-0.5 block text-[11px] text-muted">
                      {matchingSales.length ? Math.round((cashCount / matchingSales.length) * 100) : 0}% dari pilihan saat ini
                    </span>
                  </div>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-saffron-light text-saffron-dark">
                    <Banknote size={19} />
                  </span>
                </div>
              </div>

              {/* Main Transactions Panel */}
              <section className="panel overflow-hidden">
                <div className="list-toolbar flex flex-col gap-3.5 border-b border-border bg-surface p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
                  {/* Search Input */}
                  <div className="flex flex-1 items-center gap-2.5">
                    <label className="search-input flex w-full max-w-md items-center gap-2.5 rounded-xl border border-border bg-surface-muted px-3.5 py-2.5 focus-within:border-green focus-within:bg-surface">
                      <Search size={16} className="shrink-0 text-muted" />
                      <input
                        className="w-full bg-transparent text-[13px] text-foreground placeholder:text-placeholder focus:outline-none"
                        aria-label="Cari nomor transaksi atau pelanggan"
                        placeholder="Cari nomor transaksi atau pelanggan"
                        value={query}
                        onChange={event => {
                          setQuery(event.target.value);
                          setTransactionPage(0);
                        }}
                      />
                      {query && (
                        <button
                          type="button"
                          aria-label="Hapus pencarian"
                          onClick={() => {
                            setQuery("");
                            setTransactionPage(0);
                          }}
                          className="icon-button text-muted hover:text-foreground"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </label>
                  </div>

                  {/* Quick Payment Method Filter Pills + Accessible Select */}
                  <div className="flex flex-wrap items-center justify-between gap-2.5 sm:justify-end">
                    <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-surface-warm p-1">
                      {(["Semua", "QRIS", "Tunai", "Transfer"] as const).map(method => (
                        <button
                          key={method}
                          aria-pressed={transactionMethod === method}
                          type="button"
                          onClick={() => {
                            setTransactionMethod(method);
                            setTransactionPage(0);
                          }}
                          className={`min-h-11 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all ${
                            transactionMethod === method
                              ? "bg-surface text-green-dark shadow-xs border border-border"
                              : "text-text-secondary hover:text-foreground"
                          }`}
                        >
                          {method}
                        </button>
                      ))}
                    </div>

                    <label className="select-label flex items-center gap-2 text-[12px] text-muted sm:hidden">
                      <SlidersHorizontal size={15} />
                      <select
                        aria-label="Filter metode pembayaran"
                        value={transactionMethod}
                        onChange={event => {
                          setTransactionMethod(event.target.value);
                          setTransactionPage(0);
                        }}
                      >
                        <option>Semua</option>
                        <option>QRIS</option>
                        <option>Tunai</option>
                        <option>Transfer</option>
                      </select>
                    </label>
                  </div>
                </div>

                {renderTransactions()}
              </section>
            </div>
          );
        })()}

        {view === "products" && <><div className="notice green"><BookOpen size={20}/><div><strong>Resep yang konsisten, margin yang terjaga.</strong><p>Setiap transaksi otomatis mengurangi bahan sesuai resep. Pilih menu untuk melihat atau mengubah komposisinya.</p></div>{canManageCatalog && <button className="button primary small" onClick={() => openProductEditor()}><Plus size={15}/>Tambah menu</button>}</div>{products.length === 0 ? <section className="panel"><EmptyState title="Bangun katalog usahamu" description={canManageCatalog ? "Tambahkan menu, harga, dan resep pertama untuk mulai mencatat penjualan." : "Pemilik atau manager belum menambahkan menu ke workspace ini."}/>{canManageCatalog && <button className="button primary" onClick={() => openProductEditor()}><Plus size={16}/>Tambah menu pertama</button>}</section> : <div className="recipe-grid">{products.map(product => <button className="panel recipe-card" key={product.id} onClick={() => { setSelectedProduct(product); open("recipe"); }}><Image src={productImage(product)} alt={product.name} width={120} height={120}/><div><Badge tone={product.active === false ? "amber" : "neutral"}>{product.active === false ? "Nonaktif" : product.category}</Badge><h3>{product.name}</h3><p>{currency(product.price)} <span>· {product.category} · {product.recipe.length} bahan</span></p><span className="recipe-margin">Margin {product.price > 0 ? Math.round((product.price - product.cost) / product.price * 100) : 0}%<ArrowUpRight size={14}/></span></div></button>)}</div>}</>}

        {view === "inventory" && <><div className="inventory-stats"><div className="panel stat-block"><Package size={22}/><div><span>Total bahan baku</span><strong>{inventory.length} bahan</strong></div></div><div className="panel stat-block amber"><Bell size={22}/><div><span>Perlu dibeli lagi</span><strong>{lowStock.length} bahan</strong></div></div><button data-tour="forecast" className="panel stat-block forecast-shortcut" onClick={() => open("forecast")}><Sparkles size={22}/><div><span>Rencanakan kebutuhanmu</span><strong>Lihat belanja besok<ArrowUpRight size={17}/></strong></div></button></div><section className="panel"><SectionHeading title="Persediaan bahan" subtitle="Stok saat ini berasal dari stok awal dan seluruh pergerakan bahan." action={canManageCatalog ? "Tambah bahan" : undefined} onAction={() => openInventoryEditor()}/>{inventory.length === 0 ? <EmptyState title="Belum ada bahan baku" description={canManageCatalog ? "Tambahkan bahan dan stok awal untuk mulai menyusun resep." : "Pemilik atau manager belum menambahkan bahan."}/> : <div className="table-scroll"><table><thead><tr><th>Bahan baku</th><th>Stok saat ini</th><th>Batas minimum</th><th>Supplier</th><th>Status</th><th/></tr></thead><tbody>{inventory.map(item => { const stock = getStock(state, item.id); return <tr key={item.id}><td><div className="table-name"><span className="table-icon"><Package size={17}/></span><div><strong>{item.name}</strong><small>{currency(item.cost)} / {item.unit}</small></div></div></td><td><strong>{stock.toLocaleString("id-ID")}</strong> {item.unit}</td><td>{item.reorderPoint.toLocaleString("id-ID")} {item.unit}</td><td>{item.supplier}</td><td><Badge tone={stock <= item.reorderPoint ? "amber" : "green"}>{stock <= item.reorderPoint ? "Stok menipis" : "Stok aman"}</Badge></td><td><div className="inline-actions">{canManageCatalog && <><button className="text-button" onClick={() => openInventoryEditor(item)}><Pencil size={13}/>Ubah / opname</button><button className="text-button destructive-text" onClick={() => askConfirm({ kind: "inventory", item })}><Trash2 size={13}/>Hapus</button></>}<button className="text-button" disabled={!canRecordOperations} onClick={() => { setPurchaseItem(item.id); open("purchase"); }}>Beli<Plus size={13}/></button></div></td></tr>; })}</tbody></table></div>}</section><section className="panel ledger-panel" data-tour="inventory-ledger"><SectionHeading title="Pergerakan stok terbaru" subtitle="Semua perubahan disimpan sebagai catatan, bukan menimpa jumlah stok."/>{state.stockMovements.length === 0 ? <EmptyState title="Belum ada pergerakan stok" description="Penjualan, pembelian, dan opname barumu akan tampil di sini."/> : <div className="table-scroll"><table><thead><tr><th>Bahan</th><th>Jenis</th><th>Jumlah</th><th>Waktu</th></tr></thead><tbody>{state.stockMovements.slice(-10).reverse().map(movement => <tr key={movement.id}><td>{inventory.find(item => item.id === movement.itemId)?.name ?? movement.itemId}</td><td>{movement.type === "sale" ? "Penjualan" : movement.type === "purchase" ? "Pembelian" : movement.reference === "opening" ? "Stok awal" : "Penyesuaian / opname"}</td><td><Badge tone={movement.quantity > 0 ? "green" : "amber"}>{movement.quantity > 0 ? "+" : ""}{movement.quantity.toLocaleString("id-ID")}</Badge></td><td>{shortDate(movement.createdAt)} · {time(movement.createdAt)}</td></tr>)}</tbody></table></div>}</section></>}

        {view === "purchases" && <><div className="purchase-banner"><span className="purchase-banner-icon"><ReceiptText size={30}/></span><div><h2>Nota rapi. Stok terisi.</h2><p>Simpan detail pembelian bahan dari supplier dalam satu tempat.</p></div><button className="button secondary" disabled={!canRecordOperations} onClick={() => open("purchase")}><Upload size={16}/>Catat dari nota</button></div><section className="panel"><SectionHeading title="Riwayat pembelian" subtitle="Pembelian yang dicatat otomatis menambah persediaan."/>{state.purchases.length === 0 ? <EmptyState title="Belum ada pembelian baru" description="Klik Catat pembelian untuk mulai menambah stok bahan."/> : <div className="table-scroll"><table><thead><tr><th>No. pembelian</th><th>Bahan</th><th>Jumlah</th><th>Total</th><th>Tanggal</th><th>Status</th></tr></thead><tbody>{[...state.purchases].reverse().map(purchase => <tr key={purchase.id}><td>#{purchase.id.slice(-6).toUpperCase()}</td><td><strong>{inventory.find(item => item.id === purchase.itemId)?.name}</strong></td><td>{purchase.quantity.toLocaleString("id-ID")} {inventory.find(item => item.id === purchase.itemId)?.unit}</td><td>{currency(purchase.total)}</td><td>{shortDate(purchase.createdAt)}</td><td><Badge>Diterima</Badge></td></tr>)}</tbody></table></div>}</section><section className="panel supplier-panel"><SectionHeading title="Partner supplier" subtitle="Orang-orang yang menjaga dapurmu tetap berjalan."/><div className="supplier-grid">{Array.from(new Set(inventory.map(item => item.supplier))).map((supplier, i) => <div key={supplier}><span className={`avatar avatar-${i % 4}`}>{initials(supplier)}</span><div><strong>{supplier}</strong><small>{inventory.filter(item => item.supplier === supplier).map(item => item.name).join(", ")}</small></div><button className="icon-button" aria-label={`Lihat kebutuhan dari ${supplier}`} onClick={() => open("forecast")}><ClipboardList size={17}/></button></div>)}</div></section></>}

        {view === "customers" && <><div className="customer-summary" data-tour="customer-activity"><div><span className="customer-summary-icon"><Users size={26}/></span><div><strong>{state.customers.length}</strong><p>Pelanggan sudah jadi bagian cerita kita.</p></div></div><div><span className="customer-summary-icon"><Gift size={26}/></span><div><strong>{state.customers.reduce((total, customer) => total + customer.points, 0).toLocaleString("id-ID")}</strong><p>Poin loyalitas yang terkumpul.</p></div></div></div><section className="panel"><div className="customer-filters"><div className="category-tabs">{["Semua", "Juara", "Setia", "Potensial", "Berisiko", "Hilang"].map(item => <button key={item} aria-pressed={segment === item} className={segment === item ? "active" : ""} onClick={() => setSegment(item)}>{item}</button>)}</div><label className="search-input"><Search size={16}/><input aria-label="Cari pelanggan berdasarkan nama atau telepon" value={query} onChange={event => setQuery(event.target.value)} placeholder="Cari pelanggan..."/></label></div><div className="table-scroll"><table><thead><tr><th>Pelanggan</th><th>Segmen</th><th>Kunjungan</th><th>Total belanja</th><th>Poin</th><th>Kunjungan terakhir</th><th/></tr></thead><tbody>{state.customers.filter(customer => (segment === "Semua" || customer.segment === segment) && `${customer.name} ${customer.phone}`.toLowerCase().includes(query.toLowerCase())).map((customer, i) => <tr key={customer.id}><td><div className="table-name"><span className={`avatar avatar-${i % 4}`}>{initials(customer.name)}</span><div><strong>{customer.name}</strong><small>{customer.phone}</small></div></div></td><td><Badge tone={customer.segment === "Berisiko" || customer.segment === "Hilang" ? "amber" : customer.segment === "Juara" ? "purple" : "green"}>{customer.segment}</Badge></td><td>{customer.visits} kali</td><td><strong>{currency(customer.totalSpent)}</strong></td><td>{customer.points}</td><td>{shortDate(customer.lastVisit)}</td><td><div className="inline-actions">{canManageCustomers && <button className="text-button" onClick={() => { setCustomerEditor(customer); open("customer"); }}><Pencil size={13}/>Ubah</button>}{canDeleteCustomers && <button className="text-button destructive-text" onClick={() => askConfirm({ kind: "customer", customer })}><Trash2 size={13}/>Hapus</button>}</div></td></tr>)}</tbody></table></div>{!state.customers.some(customer => (segment === "Semua" || customer.segment === segment) && `${customer.name} ${customer.phone}`.toLowerCase().includes(query.toLowerCase())) && <EmptyState title="Belum ada pelanggan di sini" description="Coba segmen atau kata kunci lainnya."/>}</section><p className="page-disclaimer">{mode === "local" ? "Data pelanggan fiktif untuk demo. " : ""}Segmen dihitung dari kunjungan dan waktu kunjungan terakhir, bukan skor kredit atau rekomendasi pemasaran.</p></>}

        {view === "storefront" && <><div className="storefront-cover"><div><span><Store size={17}/>ETALASE · {state.business.outlet.toUpperCase()}</span><h2>Menu favoritmu.<br/>Siap dipesan.</h2><p>Pilih menu, periksa pesanan, lalu catat pembayaran pelanggan.</p><Badge><span className="status-dot"/>Pratinjau pemesanan internal</Badge></div><Image src={productImage(products[0] ?? demoProducts[0])} alt={`Menu dari ${state.business.name}`} width={380} height={380}/><div className="storefront-name">{state.business.name}<small>Dibuat sepenuh hati, untuk teman menjalani hari.</small></div></div><div className="notice neutral"><Store size={18}/><p>Ini adalah pratinjau internal, bukan halaman publik. Pesanan yang dikonfirmasi masuk ke transaksi {mode === "cloud" ? "usaha di cloud" : "demo lokal"}.</p></div><div className="storefront-tools"><div className="category-tabs">{categories.map(item => <button aria-pressed={category === item} className={category === item ? "active" : ""} key={item} onClick={() => setCategory(item)}>{item}</button>)}</div><button className="button primary" disabled={!reconciledCart.items.length || reconciledCart.removed.length > 0} onClick={() => open("checkout")}><ShoppingBasket size={17}/>{cartCount} item · {currency(cartTotal.total)}<ArrowRight size={15}/></button></div>{renderProductCards(true)}</>}

        {view === "finance" && <><div className="finance-top"><section className="panel profit-panel" data-tour="finance"><SectionHeading title="Laba rugi sederhana" subtitle={`${new Date(`${activeToday}T12:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })} · Ringkasan harian`} action="Cetak laporan" onAction={() => window.print()}/><div className="profit-line"><span>Pendapatan penjualan</span><strong>{currency(sum(todaySales))}</strong></div><div className="profit-line"><span>Harga pokok penjualan (HPP)</span><span>− {historicalCurrency(todayFinancials.cost)}</span></div><div className="profit-line subtotal"><strong>Untung kotor</strong><strong>{historicalCurrency(todayFinancials.grossProfit)}</strong></div><div className="profit-line"><span>Biaya operasional hari ini</span><span>− {currency(todayExpensesTotal)}</span></div><div className="net-profit"><span>Untung bersih<strong>{historicalCurrency(todayFinancials.grossProfit === null ? null : todayFinancials.grossProfit - todayExpensesTotal)}</strong></span><ChartNoAxesCombined size={34}/></div><p className="page-disclaimer">{todayFinancials.cost === null ? `HPP historis tidak tersedia untuk ${todayFinancials.missingCostLines} baris arsip lama. Laba tidak dapat dihitung; biaya katalog saat ini tidak menggantikan biaya historis.` : "Ringkasan berdasarkan HPP saat penjualan, bukan HPP katalog saat ini."} Belum merupakan laporan SAK EMKM lengkap.</p></section><section className="panel readiness-panel"><SectionHeading title="Kontrol operasional" subtitle="Indikator nyata dari workspace usahamu."/><div className="readiness-score"><span className="metric-icon green"><ChartNoAxesCombined size={28}/></span><div><Badge>Data aktual</Badge><h3>Operasional makin terukur.</h3><p>Jaga resep dan stok agar pencatatan tetap dapat diandalkan.</p></div></div>{[{ name: "Menu dengan resep", value: products.length ? Math.round(products.filter(product => product.recipe.length > 0).length / products.length * 100) : 0 }, { name: "Bahan di atas batas minimum", value: inventory.length ? Math.round((inventory.length - lowStock.length) / inventory.length * 100) : 0 }, { name: "Target penjualan hari ini", value: Math.min(100, Math.round(sum(todaySales) / state.dayTarget * 100)) }].map(item => <div className="readiness-line" key={item.name}><span>{item.name}</span><div><span style={{ width: `${item.value}%` }}/></div><strong>{item.value}%</strong></div>)}<div className="notice neutral"><ShieldCheck size={17}/><p>Indikator internal dari data usaha, bukan skor kredit, persetujuan pembiayaan, atau rekomendasi lembaga keuangan.</p></div></section></div><section className="panel"><SectionHeading title="Catatan pengeluaran" subtitle="Pisahkan uang pribadi dan usaha, mulai dari hal kecil." action={canRecordOperations ? "Tambah pengeluaran" : undefined} onAction={() => open("expense")}/>{state.expenses.length === 0 ? <EmptyState title="Belum ada pengeluaran" description="Catat biaya operasional untuk melihat untung bersih yang lebih lengkap."/> : <div className="table-scroll"><table><thead><tr><th>Keperluan</th><th>Kategori</th><th>Tanggal</th><th>Jumlah</th><th/></tr></thead><tbody>{[...state.expenses].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 15).map(expense => <tr key={expense.id}><td><div className="table-name"><span className="table-icon"><ArrowUpRight size={17}/></span><strong>{expense.description}</strong></div></td><td><Badge tone="neutral">{expense.category}</Badge></td><td>{shortDate(expense.createdAt)}</td><td><strong>{currency(expense.amount)}</strong></td><td><div className="inline-actions">{canManageCatalog && <button className="text-button destructive-text" onClick={() => askConfirm({ kind: "expense", expense })}><Trash2 size={13}/>Hapus</button>}</div></td></tr>)}</tbody></table></div>}</section></>}

        {view === "team" && <><div className={`notice ${mode === "cloud" ? "green" : "neutral"}`}><ShieldCheck size={19}/><div><strong>{mode === "cloud" ? "Akses tim aktif dan terisolasi" : "Pratinjau peran tim"}</strong><p>{mode === "cloud" ? "Setiap anggota masuk dengan akun sendiri. Peran diperiksa oleh server dan Row Level Security." : "Anggota berikut adalah contoh. Masuk ke workspace cloud untuk mengundang tim dengan akun masing-masing."}</p></div>{mode === "cloud" && user?.role === "owner" && <button className="button primary small" onClick={() => open("invite")}><UserPlus size={15}/>Undang anggota</button>}</div><div className="team-grid">{(state.members ?? [{ id: "demo-owner", name: state.business.owner, email: "", role: "owner" as const }, { id: "demo-manager", name: "Aulia Putri", email: "", role: "manager" as const }, { id: "demo-kasir", name: "Dimas Pratama", email: "", role: "kasir" as const }, { id: "demo-dapur", name: "Nadia Safira", email: "", role: "dapur" as const }]).map((member, i) => <article className="panel team-card" key={member.id}><span className={`avatar large avatar-${i % 4}`}>{initials(member.name)}</span><h3>{member.name}</h3><Badge tone={member.role === "owner" ? "green" : "neutral"}>{roleLabels[member.role]}</Badge><p>{roleDetails[member.role]}</p><div><span className="status-dot"/>{member.email || "Anggota demo"}</div>{mode === "cloud" && canManageBusiness && member.role !== "owner" && <div className="team-card-actions"><select aria-label="Ubah peran" value={member.role} onChange={event => askConfirm({ kind: "team-role", member, role: event.target.value as TeamRole })}>{(["manager", "kasir", "dapur"] as const).map(role => <option key={role} value={role}>{roleLabels[role]}</option>)}</select><button className="icon-button destructive-text" aria-label="Keluarkan anggota" onClick={() => askConfirm({ kind: "team-remove", member })}><X size={16}/></button></div>}</article>)}</div>{state.members?.length === 0 && <section className="panel"><EmptyState title="Belum ada anggota tim" description="Undang anggota dengan email untuk berbagi workspace sesuai perannya."/></section>}<section className="panel"><SectionHeading title={mode === "cloud" ? "Aktivitas workspace" : "Aktivitas demo"} subtitle={mode === "cloud" ? "Peristiwa terbaru dari audit log server." : "Transaksi terbaru yang tercatat di browser ini."}/>{state.activities ? state.activities.length ? state.activities.map(activity => <div className="audit-line" key={activity.id}><span className="table-icon"><CheckCheck size={18}/></span><div><strong>{({ "business.create": "Workspace dibuat", "product.save": "Menu atau resep disimpan", "inventory.save": "Bahan atau stok diperbarui", "membership.create": "Anggota tim ditambahkan", "sale.complete": "Transaksi diselesaikan", "purchase.record": "Pembelian dicatat", "product.delete": "Menu dihapus", "inventory.delete": "Bahan dihapus", "customer.delete": "Pelanggan dihapus", "customer.update": "Data pelanggan diperbarui", "expense.delete": "Pengeluaran dihapus", "membership.remove": "Anggota dikeluarkan", "membership.update_role": "Peran anggota diubah" } as Record<string, string>)[activity.action] ?? activity.action}</strong><p>{activity.actorName} · {activity.entity} · {shortDate(activity.createdAt)} {time(activity.createdAt)}</p></div><Badge>Tercatat</Badge></div>) : <EmptyState title={user?.role === "owner" || user?.role === "manager" ? "Belum ada aktivitas" : "Aktivitas terbatas"} description={user?.role === "owner" || user?.role === "manager" ? "Aktivitas workspace akan muncul di sini." : "Audit log hanya tersedia untuk owner dan manager."}/> : <>{state.sales.filter(sale => !sale.id.startsWith("seed")).slice(-5).reverse().map(sale => <div className="audit-line" key={sale.id}><span className="table-icon"><CheckCheck size={18}/></span><div><strong>Transaksi #{sale.id.slice(-6).toUpperCase()} dicatat</strong><p>{sale.channel} · {currency(sale.total)} · {time(sale.createdAt)}</p></div><Badge>Lunas</Badge></div>)}<p className="page-disclaimer">Aktivitas lokal bukan audit log keamanan yang terverifikasi.</p></>}</section></>}
      </main>
      {view === "pos" && <div className="mobile-cart-summary" aria-label="Ringkasan keranjang">
        <div role="status" aria-live="polite" aria-atomic="true"><span>{cartCount} item</span><strong>{currency(cartTotal.total)}</strong></div>
        <button className="button primary" aria-controls="pos-cart" onClick={focusCart}><ShoppingBasket size={18}/>Keranjang & bayar<ArrowRight size={16}/></button>
      </div>}
      <button className="floating-assistant" data-tour="assistant" onClick={() => open("assistant")}><Sparkles size={18}/><span>Tanya Laris</span><span className="assistant-dot"/></button>
    </div>
    {tour && <GuidedTour features={tour.features} onNavigate={previewTourPage} onClose={finishTour}/>}
    {toast && <div className="toast" role="status"><span><Check size={17}/></span>{toast}<button aria-label="Tutup pemberitahuan" onClick={() => setToast("")}><X size={15}/></button></div>}

    {modal === "assistant" && <Modal title="Ada Laris, ada jalan." description={mode === "cloud" ? "Asisten AI dengan konteks data usaha. Jika AI tidak tersedia, jawaban dasar dihitung langsung dari data workspace." : "Asisten demo · Jawaban dihitung dari data lokal, tanpa LLM."} onClose={close}><div className="assistant-welcome"><LarisMark/><h3>Halo, {state.business.owner.split(" ")[0]}. Mau cari tahu apa?</h3><p>Dari angka penjualan sampai bahan yang perlu dibeli,<br/>kita lihat bareng-bareng.</p></div><div className="chat-messages" aria-live="polite">{messages.map((message, i) => <div key={i} className={`chat-message ${message.role}`}>{message.role === "assistant" && <Sparkles size={16}/>}<p>{message.text}</p></div>)}{pendingAi && <div className="chat-message assistant"><Sparkles size={16}/><p style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><LoaderCircle size={14} className="spin"/>Laris sedang berpikir...</p></div>}</div><div className="prompt-chips">{["Menu apa yang paling laris?", "Stok apa yang perlu dibeli?", "Berapa untung hari ini?"].map(prompt => <button key={prompt} onClick={() => askAssistant(prompt)}>{prompt}<ArrowUpRight size={12}/></button>)}</div>{error && <p className="form-error" role="alert">{error}</p>}<form className="chat-input" onSubmit={event => { event.preventDefault(); askAssistant(assistantInput); }}><input aria-label="Pertanyaan untuk Laris" value={assistantInput} onChange={event => setAssistantInput(event.target.value)} placeholder="Tanya tentang usahamu..."/><button className="button primary" aria-label="Kirim pertanyaan" disabled={!assistantInput.trim() || pendingAi}>{pendingAi ? <LoaderCircle size={16} className="spin"/> : <ArrowRight size={18}/>}</button></form></Modal>}

    {modal === "voice" && <Modal title="Catat cukup ngomong." description={mode === "cloud" ? "Pengenal suara browser + Gemini AI / Parser Bahasa Indonesia." : "Pengenal suara browser + parser Bahasa Indonesia dengan katalog demo di perangkat ini."} onClose={close}><div className="voice-mic"><button className={recording ? "recording" : ""} onClick={recording ? () => { speech.current?.stop(); setRecording(false); } : startVoice} aria-label={recording ? "Hentikan rekaman" : "Mulai rekam pesanan"}><Mic size={32}/></button><p>{recording ? "Laris sedang mendengarkan..." : "Tekan mikrofon atau ketik pesananmu."}</p></div><form onSubmit={event => { event.preventDefault(); handleVoiceParse(voiceText); }}><label className="field"><span>Pesanan pelanggan</span><textarea rows={3} placeholder={voiceSample || "Tulis pesanan pelanggan"} value={voiceText} onChange={event => { aiRequests.cancel(); setPendingAi(false); setVoiceText(event.target.value); setParsed(null); setVoiceNotice(""); }}/></label><button type="button" className="sample-prompt" disabled={!voiceSample} onClick={() => { setVoiceText(voiceSample); handleVoiceParse(voiceSample); }}>Coba contoh dari katalog<ArrowUpRight size={13}/></button><button className="button secondary full-width" disabled={!voiceText.trim() || pendingAi}>{pendingAi ? <><LoaderCircle size={16} className="spin"/>Membaca pesanan...</> : <><Sparkles size={16}/>Baca pesanan</>}</button></form>{voiceNotice && <p className="field-hint" role="status">{voiceNotice}</p>}{parsed && <div className="voice-preview"><h3>Cek dulu, sudah sesuai?</h3>{parsed.items.map(item => <div key={item.productId}><span>{item.quantity}× {products.find(product => product.id === item.productId)?.name}<small>{item.note}</small></span><strong>{currency((products.find(product => product.id === item.productId)?.price || 0) * item.quantity)}</strong></div>)}<p>Metode pembayaran: <strong>{parsed.payment}</strong></p>{parsed.unknown.length > 0 && <div className="form-error">Belum dikenali: {parsed.unknown.join(", ")}. Perbaiki pesanan sebelum melanjutkan.</div>}<button className="button primary full-width" disabled={!parsed.items.length || parsed.unknown.length > 0} onClick={() => { setCart(current => { const next = [...current]; for (const item of parsed.items) { const found = next.findIndex(line => line.productId === item.productId); if (found >= 0) next[found] = { ...next[found], quantity: next[found].quantity + item.quantity, note: item.note || next[found].note }; else next.push(item); } return next; }); setPayment(parsed.payment); go("pos"); close(); notify("Pesanan ditambahkan. Periksa lalu lanjutkan pembayaran."); }}><Check size={17}/>Konfirmasi ke keranjang</button></div>}{error && <p className="form-error" role="alert">{error}</p>}</Modal>}

    {modal === "checkout" && <Modal title="Satu langkah lagi." description="Periksa pesanan dan catat pembayaran." onClose={close}><form onSubmit={checkout}><div className="checkout-summary">{reconciledCart.items.map(item => <div key={item.productId}><span>{item.quantity}× {products.find(product => product.id === item.productId)?.name}</span><strong>{currency((products.find(product => product.id === item.productId)?.price || 0) * item.quantity)}</strong><button type="button" className="icon-button" aria-label={`Hapus ${products.find(product => product.id === item.productId)?.name}`} onClick={() => { setCart(current => current.filter(line => line.productId !== item.productId)); setDiscount(0); }}><X size={13}/></button></div>)}<div className="checkout-total"><span>Total pembayaran</span><strong>{currency(cartTotal.total)}</strong></div></div><div className="payment-options">{(["Tunai", "QRIS", "Transfer"] as const).map(method => <button key={method} type="button" aria-pressed={payment === method} className={payment === method ? "selected" : ""} onClick={() => setPayment(method)}>{method === "Tunai" ? <Banknote size={22}/> : method === "QRIS" ? <Grid2X2 size={22}/> : <Landmark size={22}/>} {method}{payment === method && <Check size={13}/>}</button>)}</div>{payment === "Tunai" ? <><label className="field"><span>Uang diterima (Rp)</span><input autoComplete="off" type="number" min={cartTotal.total} required value={cash} onChange={event => setCash(event.target.value)} placeholder="Masukkan jumlah uang tunai"/></label><div className="quick-cash">{Array.from(new Set([cartTotal.total, Math.ceil(cartTotal.total / 50000) * 50000, Math.ceil(cartTotal.total / 100000) * 100000])).map(amount => <button type="button" key={amount} onClick={() => setCash(String(amount))}>{currency(amount)}</button>)}</div>{Number(cash) >= cartTotal.total && <div className="cash-change">Kembalian<strong>{currency(Number(cash) - cartTotal.total)}</strong></div>}</> : <div className="notice amber"><ShieldCheck size={20}/><p><strong>Simulasi {payment}, bukan pembayaran asli.</strong><br/>Belum terhubung ke Midtrans atau bank. Tidak ada dana yang dipindahkan.</p></div>}<div className="form-grid"><label className="field"><span>Nama pelanggan <small>(opsional)</small></span><input maxLength={80} value={customerName} onChange={event => setCustomerName(event.target.value)} placeholder="Pelanggan umum"/></label><label className="field"><span>No. telepon <small>(opsional)</small></span><input type="tel" aria-describedby="checkout-customer-hint" value={customerPhone} onChange={event => setCustomerPhone(event.target.value)} placeholder="08xxxxxxxxxx" pattern="\+?[0-9]{8,15}"/></label></div><p id="checkout-customer-hint" className="field-hint">{mode === "local" ? "Gunakan kontak fiktif untuk demo. " : "Dengan izin pelanggan, "}nomor telepon menghubungkan profil, kunjungan, dan poin. Nama saja tidak menghubungkan profil.</p>{error && <p className="form-error" role="alert">{error}</p>}<button className="button primary full-width" disabled={!reconciledCart.items.length || reconciledCart.removed.length > 0 || (payment === "Tunai" && Number(cash) < cartTotal.total) || pendingCheckout}>{pendingCheckout ? <LoaderCircle size={17} className="spin"/> : <Check size={17}/>}{payment === "Tunai" ? "Selesaikan transaksi" : `Simulasikan pembayaran ${payment}`}</button></form></Modal>}

    {modal === "receipt" && receipt && <Modal title="Satu pesanan, satu senyuman." description={mode === "cloud" ? "Transaksi berhasil dicatat di cloud Supabase." : "Transaksi berhasil dicatat di perangkat ini."} onClose={close}><div className="receipt-paper" id="print-receipt"><div className="receipt-check"><CheckCheck size={27}/></div><h3>{state.business.name}</h3><p>{state.business.outlet}</p><small>STRUK {mode === "cloud" ? "CLOUD" : "DEMO"} · #{receipt.id.slice(-6).toUpperCase()}</small><div className="receipt-meta"><span>{shortDate(receipt.createdAt)} · {time(receipt.createdAt)}</span><span>{receipt.customerName}</span></div>{receiptLines.map((item, index) => <div className="receipt-line" key={`${item.productId}-${index}`}><span>{item.quantity}× {item.name}{item.note && <small>{item.note}</small>}{item.priceSource === "subtotal" && <small>Harga dipulihkan dari subtotal arsip</small>}</span><strong>{historicalCurrency(item.lineTotal)}</strong></div>)}{receiptLines.some(item => item.priceSource === "unavailable") && <p className="page-disclaimer">Rincian harga arsip lama tidak tersedia. Subtotal dan total asli tetap ditampilkan; harga katalog saat ini tidak digunakan.</p>}<div className="receipt-line"><span>Subtotal</span><strong>{currency(receipt.subtotal)}</strong></div>{receipt.discount > 0 && <div className="receipt-line"><span>Diskon</span><span>−{currency(receipt.discount)}</span></div>}{receipt.tax > 0 && <div className="receipt-line"><span>Pajak</span><span>{currency(receipt.tax)}</span></div>}<div className="receipt-total"><strong>Total</strong><strong>{currency(receipt.total)}</strong></div><div className="receipt-line"><span>{receipt.payment}</span><Badge>Lunas {mode === "cloud" ? "(Cloud)" : "(demo)"}</Badge></div>{receipt.payment === "Tunai" && <div className="receipt-line"><span>Kembalian</span><strong>{currency(receipt.cashReceived - receipt.total)}</strong></div>}<p className="receipt-thanks">{state.business.receiptFooter || "Terima kasih sudah berkunjung."}</p><LarisMark small/></div><section className="receipt-impact" aria-labelledby="receipt-impact-title"><h3 id="receipt-impact-title">Satu transaksi, catatan tersambung.</h3><p>Penjualan masuk ke laporan. Menu dengan resep mencatat pemakaian bahan.{receiptActions.some(action => action.view === "customers") ? " Kunjungan dan poin pelanggan juga tercatat." : " Tidak ada profil pelanggan terhubung yang dapat ditampilkan untuk struk ini."}</p><div>{receiptActions.map(action => <button key={action.view} className="button secondary small" onClick={() => openReceiptAction(action)}>{action.label}<ArrowUpRight size={14}/></button>)}</div><small>Opsional · Keuangan menampilkan hari ini; ekspor CSV mencakup semua tanggal.</small></section><div className="modal-actions"><button className="button secondary" onClick={() => window.print()}><Printer size={16}/>Cetak struk</button><button className="button primary" onClick={() => { close(); go("pos"); }}><Plus size={16}/>Pesanan berikutnya</button></div></Modal>}

    {modal === "purchase" && <Modal title="Stok aman, hati tenang." description="Catat pembelian bahan dan otomatis perbarui persediaan." onClose={close}>{!purchaseInventoryItem ? <><EmptyState title="Tambahkan bahan terlebih dahulu" description="Pembelian harus dikaitkan dengan bahan baku agar stok dan biayanya tercatat dengan benar."/>{canManageCatalog && <button className="button primary full-width" onClick={() => openInventoryEditor()}><Plus size={16}/>Tambah bahan baku</button>}</> : <form onSubmit={submitPurchase} onChange={event => { if (!(event.target instanceof HTMLInputElement && event.target.type === "file")) { scanRequests.cancel(); setPendingScan(false); setPhotoName(""); setScanHikeAlert(null); } }}><label className="upload-area"><Upload size={24}/><strong>{pendingScan ? (mode === "local" ? "Menyiapkan isian contoh..." : "Memindai nota...") : photoName || (mode === "local" ? "Coba simulasi nota" : "Lampirkan foto nota (AI Scan)")}</strong><span>{mode === "local" ? "OCR demo memakai isian contoh, bukan membaca fotomu. Isi manual kapan saja. JPG, PNG, WebP · maks 8 MB." : "JPG, PNG, atau WebP hingga 8 MB. Gemini jika tersedia; isi manual dan periksa sebelum menyimpan."}</span><input type="file" accept="image/jpeg,image/png,image/webp" disabled={pendingScan} onChange={event => { const f = event.target.files?.[0]; if (f) handleReceiptScan(f); }}/></label>{scanHikeAlert && <div className="notice amber" style={{ margin: "12px 0" }}><Bell size={18}/><div><strong>Periksa perubahan harga</strong><p>Bahan <strong>{scanHikeAlert.name}</strong> berubah {scanHikeAlert.diffPercent}% dari Rp{scanHikeAlert.oldCost.toLocaleString("id-ID")} menjadi Rp{scanHikeAlert.unitCost.toLocaleString("id-ID")}/satuan.</p></div></div>}<label className="field"><span>Bahan yang dibeli</span><select name="itemId" value={purchaseInventoryItem.id} onChange={event => setPurchaseItem(event.target.value)}>{inventory.map(item => <option value={item.id} key={item.id}>{item.name} ({item.unit})</option>)}</select></label><div className="form-grid"><label className="field"><span>Jumlah ({purchaseInventoryItem.unit})</span><input name="quantity" type="number" min="0.001" step="0.001" required placeholder="Contoh: 5000"/></label><label className="field"><span>Total harga (Rp)</span><input name="total" type="number" min="1" step="1" required placeholder="Contoh: 95000"/></label></div><div className="notice green"><Package size={18}/><p>Stok saat ini: <strong>{getStock(state, purchaseInventoryItem.id).toLocaleString("id-ID")} {purchaseInventoryItem.unit}</strong>. Bahan akan bertambah setelah dikonfirmasi.</p></div>{error && <p className="form-error" role="alert">{error}</p>}<button className="button primary full-width" disabled={pendingMutation || pendingScan}>{pendingMutation ? <LoaderCircle size={16} className="spin"/> : <Check size={16}/>}Konfirmasi pembelian</button></form>}</Modal>}

    {modal === "expense" && <Modal title="Catat pengeluaran" description="Biar setiap rupiah punya cerita yang jelas." onClose={close}><form onSubmit={submitExpense}><label className="field"><span>Keperluan</span><input name="description" required maxLength={150} placeholder="Contoh: beli gas untuk dapur"/></label><label className="field"><span>Kategori</span><select name="category"><option>Operasional</option><option>Sewa</option><option>Gaji</option><option>Listrik & air</option><option>Pemasaran</option><option>Lainnya</option></select></label><label className="field"><span>Jumlah (Rp)</span><input name="amount" type="number" step="1" min="1" required placeholder="22000"/></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button primary full-width" disabled={pendingMutation || !canRecordOperations}>{pendingMutation ? <LoaderCircle size={16} className="spin"/> : <Check size={16}/>}{pendingMutation ? "Menyimpan..." : "Simpan pengeluaran"}</button></form></Modal>}

    {modal === "recipe" && <Modal title={selectedProduct.name} description="Resep standar dan gambaran margin menu." onClose={close}><div className="recipe-detail"><Image src={productImage(selectedProduct)} alt={selectedProduct.name} width={130} height={130}/><div><Badge tone={selectedProduct.active === false ? "amber" : "green"}>{selectedProduct.active === false ? "Nonaktif" : selectedProduct.category}</Badge><h3>{currency(selectedProduct.price)}</h3><p>HPP {currency(selectedProduct.cost)}</p><strong className="green-text">Margin {selectedProduct.price > 0 ? Math.round((selectedProduct.price - selectedProduct.cost) / selectedProduct.price * 100) : 0}%</strong></div></div>{selectedProduct.recipe.length === 0 ? <EmptyState title="Belum ada resep" description="Menu ini dapat dijual tanpa mengurangi stok bahan. Tambahkan resep jika ingin stok berkurang otomatis."/> : <div className="table-scroll"><table><thead><tr><th>Bahan</th><th>Per porsi</th><th>Stok tersedia</th></tr></thead><tbody>{selectedProduct.recipe.map(line => { const item = inventory.find(ingredient => ingredient.id === line.itemId); if (!item) return null; return <tr key={line.itemId}><td>{item.name}</td><td>{line.quantity} {item.unit}</td><td>{getStock(state, item.id).toLocaleString("id-ID")} {item.unit}</td></tr>; })}</tbody></table></div>}<div className="notice green"><BookOpen size={18}/><p>Stok berkurang sesuai resep saat penjualan selesai. Perubahan biaya bahan otomatis memperbarui HPP menu.</p></div><div className="modal-actions">{canManageCatalog && <><button className="button secondary destructive-text" onClick={() => askConfirm({ kind: "product", product: selectedProduct })}><Trash2 size={16}/>Hapus</button><button className="button secondary" onClick={() => openProductEditor(selectedProduct)}><Pencil size={16}/>Ubah menu & resep</button></>}<button className="button primary" disabled={!canRecordOperations || selectedProduct.active === false} onClick={() => { addProduct(selectedProduct); close(); go("pos"); }}><Plus size={16}/>Tambahkan ke pesanan</button></div></Modal>}

    {modal === "product-editor" && <Modal wide title={selectedProduct.id ? "Ubah menu & resep" : "Tambah menu baru"} description="Atur harga, ketersediaan, dan bahan yang digunakan per porsi." onClose={close}><form key={selectedProduct.id || "new-product"} onSubmit={submitProduct}><input type="hidden" name="code" value={selectedProduct.id}/><div className="form-grid"><label className="field"><span>Nama menu</span><input name="name" defaultValue={selectedProduct.name} required maxLength={80} placeholder="Contoh: Nasi goreng spesial" autoFocus/></label><label className="field"><span>Kategori</span><input name="category" defaultValue={selectedProduct.category} required maxLength={40} placeholder="Contoh: Makanan"/></label></div><div className="form-grid"><label className="field"><span>Harga jual (Rp)</span><input name="price" type="number" min="0" step="1" defaultValue={selectedProduct.price} required/></label><div className="field"><span id="product-image-label">Gambar</span>{mode === "cloud" ? <><input type="hidden" name="image" defaultValue={selectedProduct.image}/><div className="menu-image-row"><label className="menu-image-upload"><Upload size={17}/><strong>{menuImage ? menuImage.file.name : "Unggah foto menu"}</strong><span>JPG, PNG, WebP, atau GIF · maks 5 MB</span><input type="file" aria-label="Unggah foto menu" accept="image/jpeg,image/png,image/webp,image/gif" onChange={event => { const file = event.target.files?.[0]; if (!file) return; if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) { setError("Format gambar harus JPG, PNG, WebP, atau GIF."); return; } if (file.size > 5 * 1024 * 1024) { setError("Ukuran gambar maksimal 5 MB."); return; } setError(""); setMenuImage({ file, preview: URL.createObjectURL(file) }); }}/></label>{(menuImage || selectedProduct.image) && <Image unoptimized={menuImage ? true : selectedProduct.image.startsWith("http")} src={menuImage ? menuImage.preview : selectedProduct.image} width={88} height={88} alt="Pratinjau gambar menu" className="menu-image-preview"/>}</div><input name="imageUrl" maxLength={1000} placeholder="Atau tempel tautan gambar (https://...)" aria-label="Tautan gambar menu"/></> : <select name="image" aria-labelledby="product-image-label" defaultValue={selectedProduct.image}>{Array.from(new Set([...PRODUCT_IMAGES, selectedProduct.image].filter(Boolean))).map(image => <option value={image} key={image}>{image.split("/").pop()?.replace(".webp", "")}</option>)}</select>}</div></div><label className="checkbox-label editor-active"><input type="checkbox" name="active" defaultChecked={selectedProduct.active !== false}/>Menu aktif dan dapat dijual</label><div className="recipe-editor"><div className="section-heading"><div><h3>Resep per porsi</h3><p>HPP dan stok dihitung dari daftar ini.</p></div><button type="button" className="button secondary small" disabled={!inventory.length || recipeDraft.length >= 100} onClick={() => setRecipeDraft(current => [...current, { itemId: inventory[0]?.id ?? "", quantity: 1 }])}><Plus size={14}/>Tambah bahan</button></div>{inventory.length === 0 ? <div className="notice amber"><Package size={18}/><p>Belum ada bahan. Menu tetap bisa disimpan, lalu tambahkan bahan melalui halaman Stok bahan untuk menyusun resep.</p></div> : recipeDraft.length === 0 ? <p className="field-hint">Belum ada bahan dalam resep. Penjualan menu ini tidak akan mengurangi stok.</p> : recipeDraft.map((line, index) => <div className="recipe-editor-row" key={index}><select aria-label={`Bahan resep ${index + 1}`} value={line.itemId} onChange={event => setRecipeDraft(current => current.map((entry, i) => i === index ? { ...entry, itemId: event.target.value } : entry))}>{inventory.map(item => <option value={item.id} key={item.id}>{item.name} ({item.unit})</option>)}</select><input aria-label={`Jumlah bahan ${index + 1}`} type="number" min="0.001" step="0.001" value={line.quantity} onChange={event => setRecipeDraft(current => current.map((entry, i) => i === index ? { ...entry, quantity: Number(event.target.value) } : entry))} required/><span>{inventory.find(item => item.id === line.itemId)?.unit}</span><button type="button" className="icon-button" aria-label={`Hapus bahan ${index + 1}`} onClick={() => setRecipeDraft(current => current.filter((_, i) => i !== index))}><Trash2 size={16}/></button></div>)}</div>{error && <p className="form-error" role="alert">{error}</p>}<button className="button primary full-width" disabled={pendingMutation}>{pendingMutation ? <LoaderCircle size={16} className="spin"/> : <Check size={16}/>}Simpan menu & resep</button></form></Modal>}

    {modal === "inventory-editor" && <Modal title={inventoryEditor ? "Ubah bahan & opname" : "Tambah bahan baku"} description={inventoryEditor ? "Perbarui detail bahan atau sesuaikan stok berdasarkan hitungan fisik." : "Simpan satuan, biaya, supplier, dan stok awal bahan."} onClose={close}><form key={inventoryEditor?.id ?? "new-inventory"} onSubmit={submitInventoryItem}>{inventoryEditor && <input type="hidden" name="code" value={inventoryEditor.id}/>}<label className="field"><span>Nama bahan</span><input name="name" defaultValue={inventoryEditor?.name} required maxLength={100} placeholder="Contoh: Beras premium" autoFocus/></label><div className="form-grid"><label className="field"><span>Satuan dasar</span><input name="unit" defaultValue={inventoryEditor?.unit ?? "kg"} required maxLength={20} pattern="[a-zA-Z][a-zA-Z0-9 ]{0,19}"/><small className="field-hint">Contoh: g, ml, pcs, kg, porsi</small></label><label className="field"><span>Biaya per satuan (Rp)</span><input name="cost" type="number" min="0" max="9999999999" step="0.0001" defaultValue={inventoryEditor?.cost ?? 0} required/></label></div><div className="form-grid"><label className="field"><span>Batas minimum</span><input name="reorderPoint" type="number" min="0" step="0.001" defaultValue={inventoryEditor?.reorderPoint ?? 0} required/></label><label className="field"><span>Supplier</span><input name="supplier" defaultValue={inventoryEditor?.supplier === "Belum diatur" ? "" : inventoryEditor?.supplier} maxLength={100} placeholder="Nama supplier"/></label></div>{inventoryEditor ? <label className="field"><span>Stok hasil hitung fisik <small>(opsional)</small></span><input name="countedStock" type="number" min="0" step="0.001" placeholder={String(getStock(state, inventoryEditor.id))}/><small className="field-hint">Stok tercatat saat ini {getStock(state, inventoryEditor.id).toLocaleString("id-ID")} {inventoryEditor.unit}. Kosongkan jika tidak melakukan opname.</small></label> : <label className="field"><span>Stok awal</span><input name="openingStock" type="number" min="0" step="0.001" defaultValue={0} required/></label>}{error && <p className="form-error" role="alert">{error}</p>}<button className="button primary full-width" disabled={pendingMutation}>{pendingMutation ? <LoaderCircle size={16} className="spin"/> : <Check size={16}/>}Simpan bahan</button></form></Modal>}

    {modal === "invite" && <Modal title="Undang anggota tim" description="Berikan akses ke workspace ini sesuai tanggung jawab anggota." onClose={close}><form onSubmit={submitInvitation}><label className="field"><span>Email anggota</span><input name="email" type="email" required maxLength={200} autoComplete="email" placeholder="anggota@usaha.id" autoFocus/></label><label className="field"><span>Peran</span><select name="role" defaultValue="kasir"><option value="manager">Manager — operasional dan katalog</option><option value="kasir">Kasir — transaksi dan pelanggan</option><option value="dapur">Dapur — melihat operasional</option></select></label><div className="notice green"><ShieldCheck size={18}/><p>Jika email belum memiliki akun, Laris akan mengirim undangan pendaftaran. Anggota hanya dapat mengakses workspace ini sesuai perannya.</p></div>{error && <p className="form-error" role="alert">{error}</p>}<button className="button primary full-width" disabled={pendingMutation}>{pendingMutation ? <LoaderCircle size={16} className="spin"/> : <UserPlus size={16}/>}Kirim undangan & tambahkan</button></form></Modal>}

    {modal === "forecast" && <Modal title="Belanja besok, lebih tenang." description="Saran restok sederhana berdasarkan batas minimum bahan." onClose={close}><div className="notice amber"><Sparkles size={18}/><p>Saran ini menggunakan aturan stok minimum, bukan prediksi AI, kalender, atau model permintaan terlatih.</p></div>{inventory.length === 0 ? <EmptyState title="Belum ada bahan" description="Tambahkan bahan dan batas minimum untuk mendapatkan saran belanja."/> : lowStock.length === 0 ? <EmptyState title="Semua stok aman" description="Belum ada bahan di bawah batas minimum."/> : lowStock.map(item => <div className="forecast-item" key={item.id}><span className="table-icon"><Package size={20}/></span><div><strong>{item.name}</strong><p>{item.supplier} · Tambah {Math.max(0, item.reorderPoint * 2 - getStock(state, item.id)).toLocaleString("id-ID")} {item.unit}</p></div><button className="button secondary small" disabled={!canRecordOperations} onClick={() => { setPurchaseItem(item.id); open("purchase"); }}>Catat beli<Plus size={13}/></button></div>)}<button className="button secondary full-width" disabled={!lowStock.length} onClick={async () => { const text = `Daftar belanja ${state.business.name}:\n${lowStock.map(item => `- ${item.name}: ${Math.max(0, item.reorderPoint * 2 - getStock(state, item.id))} ${item.unit} (${item.supplier})`).join("\n")}`; try { await navigator.clipboard.writeText(text); notify("Daftar belanja disalin. Siap ditempel ke WhatsApp supplier."); } catch { setError("Browser tidak mengizinkan clipboard. Salin detail bahan secara manual."); } }}><ClipboardList size={16}/>Salin daftar untuk WhatsApp</button>{error && <p className="form-error" role="alert">{error}</p>}</Modal>}

    {modal === "customer" && <Modal title={customerEditor ? "Ubah data pelanggan" : "Kenalan dulu, yuk."} description={customerEditor ? "Perbaiki nama atau nomor telepon. Riwayat kunjungan dan poin tetap tersimpan." : "Simpan pelanggan baru untuk pencatatan kunjungan."} onClose={close}><form key={customerEditor?.id ?? "new-customer"} onSubmit={submitCustomer}><label className="field"><span>Nama pelanggan</span><input name="name" required maxLength={80} defaultValue={customerEditor?.name} placeholder="Nama lengkap" autoFocus/></label><label className="field"><span>Nomor telepon</span><input name="phone" required type="tel" pattern="\+?[0-9]{8,15}" defaultValue={customerEditor?.phone} placeholder="08xxxxxxxxxx"/></label><p className="field-hint">Pastikan pelanggan setuju untuk menyimpan datanya. Tidak ada pesan pemasaran yang dikirim.</p>{error && <p className="form-error" role="alert">{error}</p>}<button className="button primary full-width" disabled={pendingMutation}>{customerEditor ? <Check size={16}/> : <Plus size={16}/>}{customerEditor ? "Simpan perubahan" : "Simpan pelanggan"}</button></form></Modal>}

    {modal === "settings" && <Modal title="Ruang untuk usahamu." description={mode === "cloud" ? "Pengaturan usaha tersimpan di Supabase Cloud." : "Pengaturan disimpan lokal di browser ini."} onClose={close}><form onSubmit={submitSettings}><label className="field"><span>Nama usaha</span><input name="name" defaultValue={state.business.name} maxLength={80} required/></label><div className="form-grid"><label className="field"><span>Nama pemilik</span><input name="owner" defaultValue={state.business.owner} maxLength={80} required/></label><label className="field"><span>Outlet</span><input name="outlet" defaultValue={state.business.outlet} maxLength={80} required/></label></div><div className="form-grid"><label className="field"><span>Jenis usaha</span><select name="kind" defaultValue={state.business.kind ?? "other"}><option value="coffee">Kedai kopi</option><option value="restaurant">Restoran / rumah makan</option><option value="bakery">Bakery</option><option value="bar">Bar / kedai minuman</option><option value="other">F&B lainnya</option></select></label><label className="field"><span>Target harian (Rp)</span><input name="target" type="number" min="1" step="1" defaultValue={state.dayTarget} required/></label></div><div className="form-grid"><label className="field"><span>Pajak (%)</span><input name="taxRate" type="number" min="0" max="100" step="0.1" defaultValue={state.business.taxRate ?? 10} required/></label><label className="field"><span>Catatan struk (footer)</span><input name="receiptFooter" defaultValue={state.business.receiptFooter} maxLength={200} placeholder="Contoh: Terima kasih!"/></label></div>{mode === "cloud" ? <div className={`notice ${canManageBusiness ? "green" : "amber"}`}><ShieldCheck size={19}/><p>{canManageBusiness ? "Data profil dan target tersimpan di database dengan Row Level Security." : "Hanya owner yang dapat mengubah pengaturan usaha."}</p></div> : <div className="notice neutral"><ShieldCheck size={19}/><p>Demo lokal tanpa sinkronisasi cloud. Masuk dengan akun untuk penggunaan multi-perangkat.</p></div>}{error && <p className="form-error" role="alert">{error}</p>}<button className="button primary full-width" disabled={!canManageBusiness || pendingMutation}><Check size={16}/>Simpan pengaturan</button></form></Modal>}

    {modal === "notifications" && <Modal title="Kabar untuk usahamu." description="Hal-hal kecil yang jangan sampai terlewat." onClose={close}>{lowStock.map(item => <button className="notification-item" key={item.id} onClick={() => { close(); go("inventory"); }}><span className="metric-icon orange"><Package size={20}/></span><div><strong>{item.name} mulai menipis</strong><p>Tersisa {getStock(state, item.id).toLocaleString("id-ID")} {item.unit}. Yuk, rencanakan belanja.</p><small>Peringatan stok saat ini</small></div><ChevronRight size={17}/></button>)}<button className="notification-item" onClick={() => { close(); go("finance"); }}><span className="metric-icon green"><FileText size={20}/></span><div><strong>Laporan usahamu sudah siap</strong><p>Penjualan dan keuntungan, terangkum dalam satu halaman.</p><small>{new Date(`${activeToday}T12:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</small></div><ChevronRight size={17}/></button></Modal>}

    {modal === "search" && (() => {
      const features = findGuideFeatures(searchQuery);
      const matchingProducts = searchQuery.trim() ? products.filter(product => product.name.toLowerCase().includes(searchQuery.trim().toLowerCase())) : [];
      return <Modal title="Mau ke mana hari ini?" description="Cari fitur dengan kata sehari-hari, atau temukan menu usahamu." onClose={close}>
        <label className="search-input command-search"><Search size={19}/><input autoFocus aria-label="Cari fitur atau menu" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="Coba: struk, pajak, opname, kopi..."/></label>
        <div className="search-results">
          {features.map(feature => <button key={feature.id} onClick={() => openGuideFeature(feature)}><BookOpen size={19}/><span><strong>{feature.title}</strong><small className="search-result-location">{feature.location}</small></span><ArrowUpRight size={15}/></button>)}
          {matchingProducts.map(product => <button key={product.id} onClick={() => { setSelectedProduct(product); open("recipe"); }}><Coffee size={19}/><span>{product.name}</span><small>{currency(product.price)}</small></button>)}
          {!features.length && !matchingProducts.length && <EmptyState title="Tidak ada hasil" description="Coba kata seperti struk, bahan, atau nama menu. Panduan lengkap tetap tersedia di bawah."/>}
        </div>
        <button className="button secondary full-width" onClick={() => open("guide")}><CircleHelp size={16}/>Buka semua panduan & tutorial</button>
      </Modal>;
    })()}

    {modal === "guide" && <Modal wide title="Bantuan & panduan" description="Lupa letak fitur? Cari tujuannya, lihat langkahnya, lalu buka langsung." onClose={close}><HelpCenter view={view} mode={mode} onOpen={openGuideFeature} onTour={startTour}/></Modal>}
    {confirmRequest && (() => {
      const copy = confirmCopy(confirmRequest);
      return <Modal title={copy.title} description={copy.description} onClose={() => setConfirmRequest(null)}>
        {confirmError && <div className="form-error" role="alert">{confirmError}</div>}
        <div className="modal-actions">
          <button autoFocus className="button secondary" onClick={() => setConfirmRequest(null)} disabled={pendingConfirm}>Batal</button>
          <button className="button destructive" onClick={runConfirm} disabled={pendingConfirm}>
            {pendingConfirm ? <LoaderCircle size={16} className="spin"/> : <Trash2 size={16}/>}{copy.action}
          </button>
        </div>
      </Modal>;
    })()}
  </div>;
}
