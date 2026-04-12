"use client";
import { lazy, Suspense, useState, useEffect, useRef, useCallback, useMemo } from "react";
import { usePage, router } from "@inertiajs/react";
import AdminLayout from "@/layouts/AdminLayout";
import ReceiptTemplate, { fmtMoney, ReceiptData } from "./ReceiptTemplate";
import { routes } from "@/routes";
import { cn } from "@/lib/utils";
import {
    Search, X, Plus, Minus, Trash2, ShoppingCart, Tag,
    CreditCard, Banknote, Smartphone, CheckCircle2,
    AlertTriangle, Package, History, ScanLine,
    RefreshCw, Zap, User, ChevronDown, Wallet, CalendarClock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Product, CartItem, Category, TableOrder, DiningTable, ActivePromo } from "./posTypes";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Session  { id: number; opening_cash: number; opened_at: string; status: string; }
interface Branch   { id: number; name: string; business_type: string; feature_flags: Record<string, boolean>; }
interface PageProps {
    auth: { user: { fname: string; lname: string; role_label: string; is_cashier: boolean } | null };
    settings: {
        allow_discount: boolean; max_discount_percent: number;
        default_payment: string; vat_enabled: boolean;
        vat_rate: number; vat_inclusive: boolean; require_cash_session: boolean;
        enable_installments: boolean;
    } | null;
    app: { currency: string };
    products: Product[];
    categories: Category[];
    session: Session | null;
    branch: Branch | null;
    open_table_orders: TableOrder[];
    dining_tables: DiningTable[];
    preferred_layout: string;
    promos: ActivePromo[];
    [key: string]: unknown;
}
type PayMethod   = "cash" | "gcash" | "card" | "others" | "installment";
type LayoutMode  = "grid" | "tablet" | "grocery" | "restaurant" | "cafe" | "salon" | "kiosk" | "mobile";

const METHODS: { value: PayMethod; label: string; icon: React.ElementType }[] = [
    { value: "cash",        label: "Cash",        icon: Banknote    },
    { value: "gcash",       label: "GCash",       icon: Smartphone  },
    { value: "card",        label: "Card",        icon: CreditCard  },
    { value: "others",      label: "Others",      icon: Tag         },
    { value: "installment", label: "Installment", icon: CalendarClock },
];

// ─── Lazy-loaded layout chunks (each downloads only when that layout is used) ─
const GridLayout       = lazy(() => import("./layouts/GridLayout"));
const TabletLayout     = lazy(() => import("./layouts/TabletLayout"));
const GroceryLayout    = lazy(() => import("./layouts/GroceryLayout"));
const CafeLayout       = lazy(() => import("./layouts/CafeLayout"));
const RestaurantLayout = lazy(() => import("./layouts/RestaurantLayout"));
const SalonLayout      = lazy(() => import("./layouts/SalonLayout"));
const KioskLayout      = lazy(() => import("./layouts/KioskLayout"));
const MobileLayout     = lazy(() => import("./layouts/MobileLayout"));

function LayoutSpinner() {
    return (
        <div className="flex items-center justify-center h-full">
            <span className="h-6 w-6 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
        </div>
    );
}

// ─── CategoryDropdown ─────────────────────────────────────────────────────────
function CategoryDropdown({ categories, activeCat, onChange }: {
    categories: Category[]; activeCat: number | null; onChange: (id: number | null) => void;
}) {
    if (!categories.length) return null;
    return (
        <div className="relative shrink-0">
            <select
                value={activeCat ?? ""}
                onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
                className={cn(
                    "h-9 pl-3 pr-7 text-sm bg-background border rounded-xl appearance-none focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer min-w-[130px] max-w-[170px] truncate transition-colors",
                    activeCat !== null
                        ? "border-primary/60 text-foreground font-medium"
                        : "border-border text-muted-foreground",
                )}
            >
                <option value="">All categories</option>
                {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            {activeCat !== null && (
                <button
                    onClick={() => onChange(null)}
                    className="absolute right-6 top-1/2 -translate-y-1/2 text-primary hover:text-foreground transition-colors"
                    title="Clear filter"
                >
                    <X className="h-3 w-3" />
                </button>
            )}
        </div>
    );
}

// ─── VariantPicker ────────────────────────────────────────────────────────────
function VariantPicker({ product, currency, onSelect, onClose }: {
    product: Product; currency: string;
    onSelect: (id: number | null, name: string | null) => void;
    onClose: () => void;
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
                <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-border">
                    <div className="min-w-0 flex-1 pr-3">
                        <p className="font-semibold text-foreground leading-snug">{product.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Choose a variant</p>
                    </div>
                    <button onClick={onClose} className="shrink-0 p-1 rounded-md hover:bg-muted text-muted-foreground"><X className="h-4 w-4" /></button>
                </div>
                <div className="p-4 grid grid-cols-2 gap-2 max-h-72 overflow-y-auto">
                    <button onClick={() => onSelect(null, null)}
                        className="flex flex-col items-start gap-1 p-3 rounded-xl border border-border bg-background hover:border-primary/50 hover:bg-primary/5 transition-all text-left">
                        <span className="text-sm font-semibold text-foreground">Base</span>
                        <span className="text-xs text-muted-foreground">{fmtMoney(product.price, currency)}</span>
                    </button>
                    {product.variants.filter(v => v.is_available).map(v => (
                        <button key={v.id} onClick={() => onSelect(v.id, v.name)}
                            className="flex flex-col items-start gap-1 p-3 rounded-xl border border-border bg-background hover:border-primary/50 hover:bg-primary/5 transition-all text-left">
                            <span className="text-sm font-semibold text-foreground">{v.name}</span>
                            <span className="text-xs text-muted-foreground">
                                {v.extra_price > 0 ? `+${fmtMoney(v.extra_price, currency)}` : fmtMoney(product.price, currency)}
                            </span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ─── PaymentModal ─────────────────────────────────────────────────────────────
function PaymentModal({ subtotal, settings, currency, customerNameRequired, promos, cart, onConfirm, onClose, loading, serverError }: {
    subtotal: number; settings: PageProps["settings"]; currency: string;
    customerNameRequired?: boolean; promos: ActivePromo[]; cart: CartItem[];
    onConfirm: (d: {
        payment_method: PayMethod; payment_amount: number; customer_name: string;
        discount_percent: number; promo_id: number | null;
        installment_provider?: string; installment_reference?: string;
        installment_customer_phone?: string; installment_down_payment?: number;
        installments_count?: number; installment_notes?: string;
    }) => void;
    onClose: () => void; loading: boolean; serverError?: string | null;
}) {
    const enableInstallments = settings?.enable_installments ?? false;
    const [method,       setMethod]       = useState<PayMethod>((settings?.default_payment ?? "cash") as PayMethod);
    const [tender,       setTender]       = useState("");
    const [customer,     setCustomer]     = useState("");
    const [discPct,      setDiscPct]      = useState("");
    const [promoCode,    setPromoCode]    = useState("");
    const [appliedPromo, setAppliedPromo] = useState<ActivePromo | null>(null);
    const [promoError,   setPromoError]   = useState("");
    const [showPromos,   setShowPromos]   = useState(false);
    // Financing / installment fields
    const [instProvider,   setInstProvider]   = useState<"home_credit"|"skyro"|"other">("home_credit");
    const [instReference,  setInstReference]  = useState("");
    const [instPhone,      setInstPhone]      = useState("");
    const [instDown,       setInstDown]       = useState("0");
    const [instCount,      setInstCount]      = useState("6");
    const [instNotes,      setInstNotes]      = useState("");

    const isInstallment = method === "installment";

    const r2 = (v: number) => Math.round(v * 100) / 100; // round to 2 decimal places — matches PHP round($v, 2)

    const disc      = Math.min(parseFloat(discPct) || 0, settings?.max_discount_percent ?? 100);
    const discAmt   = r2(subtotal * disc / 100);
    const afterDisc = r2(subtotal - discAmt);

    const promoAppliesToCart = (p: ActivePromo) => {
        if (p.applies_to === 'all') return true;
        if (p.applies_to === 'specific_products') return cart.some(i => p.product_ids.includes(i.product_id));
        return p.category_ids.length > 0;
    };
    const computePromoAmt = (p: ActivePromo | null) => {
        if (!p) return 0;
        if (p.minimum_purchase && afterDisc < p.minimum_purchase) return 0;
        return p.discount_type === 'percent'
            ? r2(afterDisc * p.discount_value / 100)
            : Math.min(r2(p.discount_value), afterDisc);
    };
    const promoAmt   = computePromoAmt(appliedPromo);
    const afterPromo = r2(afterDisc - promoAmt);
    const vatRate    = (settings?.vat_enabled && !settings?.vat_inclusive) ? (settings.vat_rate ?? 0) : 0;
    const vatAmt     = r2(afterPromo * vatRate / 100);
    const total      = afterPromo + vatAmt;
    const tenderN    = parseFloat(tender) || 0;
    const change     = Math.max(0, tenderN - total);
    const isCash     = method === "cash";
    const downN      = parseFloat(instDown) || 0;
    const canPay     = total > 0
        && (!isCash || tenderN >= total)
        && (!customerNameRequired || customer.trim().length > 0)
        && (!isInstallment || (customer.trim().length > 0 && !!instProvider && parseInt(instCount) >= 1 && downN >= 0));
    const append     = (v: string) => setTender(p => (p === "0" || p === "") ? v : p + v);
    const backspace  = () => setTender(p => p.slice(0, -1));

    const eligiblePromos  = promos.filter(promoAppliesToCart);
    const noCodePromos    = eligiblePromos.filter(p => !p.code);
    const codePromos      = eligiblePromos.filter(p => !!p.code);

    const applyPromoCode = () => {
        setPromoError("");
        const code = promoCode.trim().toUpperCase();
        if (!code) return;
        const found = promos.find(p => p.code?.toUpperCase() === code);
        if (!found) { setPromoError("Promo code not found or expired."); return; }
        if (!promoAppliesToCart(found)) { setPromoError("This promo does not apply to any item in the cart."); return; }
        if (found.minimum_purchase && afterDisc < found.minimum_purchase) {
            setPromoError("Minimum purchase of " + fmtMoney(found.minimum_purchase, currency) + " required."); return;
        }
        if (computePromoAmt(found) <= 0) { setPromoError("This promo gives no discount on the current cart total."); return; }
        setAppliedPromo(found); setPromoError(""); setShowPromos(false);
    };
    const applyDirect = (p: ActivePromo) => {
        if (p.minimum_purchase && afterDisc < p.minimum_purchase) {
            setPromoError("Minimum purchase of " + fmtMoney(p.minimum_purchase, currency) + " required for " + p.name + "."); return;
        }
        setAppliedPromo(p); setPromoError(""); setShowPromos(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl flex flex-col max-h-[92vh]">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
                    <p className="font-bold text-foreground">Checkout</p>
                    <button onClick={onClose} className="p-1 rounded-md hover:bg-muted text-muted-foreground"><X className="h-4 w-4" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* Order summary */}
                    <div className="bg-muted/30 rounded-xl p-3.5 space-y-1.5 text-sm">
                        <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{fmtMoney(subtotal, currency)}</span></div>
                        {disc > 0 && <div className="flex justify-between text-emerald-600 dark:text-emerald-400"><span>Discount ({disc}%)</span><span>−{fmtMoney(discAmt, currency)}</span></div>}
                        {promoAmt > 0 && (
                            <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                                <span className="flex items-center gap-1.5"><Tag className="h-3 w-3" />{appliedPromo?.name}</span>
                                <span>−{fmtMoney(promoAmt, currency)}</span>
                            </div>
                        )}
                        {vatAmt > 0 && <div className="flex justify-between text-muted-foreground"><span>VAT ({vatRate}%)</span><span>+{fmtMoney(vatAmt, currency)}</span></div>}
                        <div className="flex justify-between font-bold text-base text-foreground border-t border-border pt-2 mt-1"><span>Total</span><span>{fmtMoney(total, currency)}</span></div>
                    </div>

                    {/* Discount */}
                    {settings?.allow_discount && (
                        <div>
                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1.5">Discount %</label>
                            <div className="flex gap-2 flex-wrap">
                                <input value={discPct} onChange={e => setDiscPct(e.target.value)} placeholder="0" type="number" min="0" max={settings.max_discount_percent}
                                    className="h-9 w-20 px-3 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground" />
                                {[5, 10, 20].filter(v => v <= (settings.max_discount_percent ?? 100)).map(v => (
                                    <button key={v} onClick={() => setDiscPct(String(v))}
                                        className={cn("h-9 px-3 rounded-lg border text-sm font-medium transition-all", disc === v ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/40")}>
                                        {v}%
                                    </button>
                                ))}
                                {disc > 0 && <button onClick={() => setDiscPct("")} className="h-9 px-2 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted">Clear</button>}
                            </div>
                        </div>
                    )}

                    {/* Promos */}
                    {eligiblePromos.length > 0 && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                    Promo {!appliedPromo && <span className="ml-2 text-emerald-600 dark:text-emerald-400">{eligiblePromos.length} available</span>}
                                </label>
                                {!appliedPromo && <button onClick={() => setShowPromos(v => !v)} className="text-[10px] text-primary hover:underline">{showPromos ? "Hide" : "Browse promos"}</button>}
                            </div>
                            {appliedPromo ? (
                                <div className="flex items-center gap-2 px-3 py-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
                                    <Tag className="h-4 w-4 text-emerald-500 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{appliedPromo.name}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {appliedPromo.discount_type === 'percent' ? `${appliedPromo.discount_value}% off` : `₱${appliedPromo.discount_value.toFixed(2)} off`}
                                            {appliedPromo.code && <span className="ml-1.5 font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded">{appliedPromo.code}</span>}
                                        </p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">−{fmtMoney(promoAmt, currency)}</p>
                                        <button onClick={() => { setAppliedPromo(null); setPromoCode(""); setPromoError(""); }} className="text-[10px] text-muted-foreground hover:text-destructive">Remove</button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                            <input value={promoCode}
                                                onChange={e => { setPromoCode(e.target.value.toUpperCase()); setPromoError(""); }}
                                                onKeyDown={e => e.key === 'Enter' && applyPromoCode()}
                                                placeholder="Enter promo code…"
                                                className="w-full h-9 pl-9 pr-3 text-sm font-mono tracking-wider bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground uppercase placeholder:normal-case placeholder:font-sans placeholder:tracking-normal" />
                                        </div>
                                        <button onClick={applyPromoCode} disabled={!promoCode.trim()}
                                            className="h-9 px-4 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors shrink-0">
                                            Apply
                                        </button>
                                    </div>
                                    {promoError && <p className="text-xs text-destructive flex items-center gap-1.5"><AlertTriangle className="h-3 w-3 shrink-0" />{promoError}</p>}
                                    {noCodePromos.length > 0 && (
                                        <div className="space-y-1">
                                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Available promos</p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {noCodePromos.map(p => {
                                                    const amt    = computePromoAmt(p);
                                                    const locked = !!(p.minimum_purchase && afterDisc < p.minimum_purchase);
                                                    return (
                                                        <button key={p.id} onClick={() => !locked && applyDirect(p)} disabled={locked}
                                                            className={cn("flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-xl border transition-all",
                                                                locked ? "border-border text-muted-foreground/50 cursor-not-allowed"
                                                                    : "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10")}>
                                                            <Tag className="h-3 w-3 shrink-0" />
                                                            <span>{p.name}</span>
                                                            {amt > 0 && <span className="font-bold">−{fmtMoney(amt, currency)}</span>}
                                                            {locked && <span className="text-[9px] opacity-60">min {fmtMoney(p.minimum_purchase!, currency)}</span>}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                    {showPromos && codePromos.length > 0 && (
                                        <div className="border border-border rounded-xl overflow-hidden">
                                            <p className="px-3 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider bg-muted/30">Code-required promos</p>
                                            <div className="divide-y divide-border">
                                                {codePromos.map(p => {
                                                    const amt    = computePromoAmt(p);
                                                    const locked = !!(p.minimum_purchase && afterDisc < p.minimum_purchase);
                                                    return (
                                                        <div key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm font-semibold text-foreground">{p.name}</p>
                                                                <div className="flex items-center gap-2 mt-0.5">
                                                                    <span className="font-mono text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">{p.code}</span>
                                                                    <span className="text-xs text-muted-foreground">{p.discount_type === 'percent' ? `${p.discount_value}%` : `₱${p.discount_value.toFixed(2)}`} off</span>
                                                                    {p.minimum_purchase && <span className="text-xs text-muted-foreground/60">min {fmtMoney(p.minimum_purchase, currency)}</span>}
                                                                </div>
                                                            </div>
                                                            {amt > 0 && !locked && <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 shrink-0">−{fmtMoney(amt, currency)}</span>}
                                                            {locked && <span className="text-xs text-muted-foreground/50 shrink-0">locked</span>}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Customer name */}
                    <div>
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1.5">
                            Customer name {customerNameRequired && <span className="text-destructive">*</span>}
                        </label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <input value={customer} onChange={e => setCustomer(e.target.value)}
                                placeholder={customerNameRequired ? "Required for this service" : "Walk-in customer"}
                                className="w-full h-9 pl-9 pr-3 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground" />
                        </div>
                    </div>

                    {/* Payment method */}
                    <div>
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1.5">Payment method</label>
                        <div className={cn("grid gap-1.5", enableInstallments ? "grid-cols-5" : "grid-cols-4")}>
                            {METHODS.filter(m => m.value !== "installment" || enableInstallments).map(m => { const Icon = m.icon; return (
                                <button key={m.value} onClick={() => setMethod(m.value)}
                                    className={cn("flex flex-col items-center gap-1.5 py-2.5 px-1 rounded-xl border text-[11px] font-semibold transition-all",
                                        method === m.value ? "bg-primary text-primary-foreground border-primary shadow-sm" : "border-border hover:border-primary/40 hover:bg-accent text-foreground")}>
                                    <Icon className="h-4 w-4" />{m.label}
                                </button>
                            ); })}
                        </div>
                    </div>

                    {/* Financing details panel */}
                    {isInstallment && (
                        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3.5 space-y-3">
                            <p className="text-[10px] font-bold text-primary uppercase tracking-widest flex items-center gap-1.5">
                                <CalendarClock className="h-3.5 w-3.5" /> Financing Details
                            </p>

                            {/* Provider — required */}
                            <div>
                                <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block mb-1">
                                    Financing Provider <span className="text-destructive">*</span>
                                </label>
                                <div className="grid grid-cols-3 gap-1.5">
                                    {(["home_credit","skyro","other"] as const).map(p => (
                                        <button key={p} type="button" onClick={() => setInstProvider(p)}
                                            className={cn("h-9 rounded-lg border text-xs font-semibold transition-all",
                                                instProvider === p
                                                    ? "bg-primary text-primary-foreground border-primary"
                                                    : "border-border text-foreground hover:border-primary/40 hover:bg-accent")}>
                                            {p === "home_credit" ? "Home Credit" : p === "skyro" ? "Skyro" : "Other"}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Reference / Application number */}
                            <div>
                                <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block mb-1">Application / Reference No. <span className="text-muted-foreground/50">(optional)</span></label>
                                <input value={instReference} onChange={e => setInstReference(e.target.value)}
                                    placeholder="e.g. HC-2024-XXXXXX"
                                    className="w-full h-9 px-3 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground" />
                            </div>

                            {/* Customer phone */}
                            <div>
                                <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block mb-1">Customer Phone <span className="text-muted-foreground/50">(optional)</span></label>
                                <input value={instPhone} onChange={e => setInstPhone(e.target.value)}
                                    placeholder="e.g. 09XX-XXX-XXXX"
                                    className="w-full h-9 px-3 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground" />
                            </div>

                            {/* Down payment — optional, 0 = no DP */}
                            <div>
                                <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block mb-1">Down Payment <span className="text-muted-foreground/50">(0 = no DP)</span></label>
                                <div className="flex gap-2 items-center">
                                    <div className="relative flex-1">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{currency}</span>
                                        <input value={instDown} onChange={e => setInstDown(e.target.value)}
                                            type="number" min="0" step="0.01"
                                            className="w-full h-9 pl-8 pr-3 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground" />
                                    </div>
                                    <button onClick={() => setInstDown("0")}
                                        className="h-9 px-3 rounded-lg border border-border text-xs font-medium hover:border-primary/40 hover:bg-accent transition-colors whitespace-nowrap">
                                        No DP
                                    </button>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Financed amount: <span className="font-semibold text-foreground">{fmtMoney(Math.max(0, total - downN), currency)}</span>
                                </p>
                            </div>

                            {/* Terms (months) */}
                            <div>
                                <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block mb-1">Terms (months)</label>
                                <div className="grid grid-cols-5 gap-1.5">
                                    {[3, 6, 9, 12, 18, 24, 30, 36].map(n => (
                                        <button key={n} type="button" onClick={() => setInstCount(String(n))}
                                            className={cn("h-9 rounded-lg border text-xs font-semibold transition-all",
                                                instCount === String(n)
                                                    ? "bg-primary text-primary-foreground border-primary"
                                                    : "border-border text-foreground hover:border-primary/40 hover:bg-accent")}>
                                            {n}mo
                                        </button>
                                    ))}
                                </div>
                                {downN < total && parseInt(instCount) > 0 && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                        ≈ {fmtMoney(Math.round((total - downN) / parseInt(instCount) * 100) / 100, currency)}/month
                                    </p>
                                )}
                            </div>

                            {/* Notes */}
                            <div>
                                <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block mb-1">Notes <span className="text-muted-foreground/50">(optional)</span></label>
                                <input value={instNotes} onChange={e => setInstNotes(e.target.value)}
                                    placeholder="e.g. voucher, special terms…"
                                    className="w-full h-9 px-3 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground" />
                            </div>
                        </div>
                    )}

                    {/* Cash numpad */}
                    {isCash && (
                        <div>
                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1.5">Cash tendered</label>
                            <div className="bg-background border border-border rounded-xl px-4 py-3 mb-3 flex items-center justify-between gap-3">
                                <span className="text-3xl font-bold tabular-nums text-foreground">
                                    {currency}{(parseFloat(tender || "0")).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                                </span>
                                {tenderN >= total && total > 0 && (
                                    <div className="text-right shrink-0">
                                        <p className="text-[10px] text-muted-foreground">Change</p>
                                        <p className="text-xl font-bold tabular-nums text-green-600 dark:text-green-400">{fmtMoney(change, currency)}</p>
                                    </div>
                                )}
                            </div>
                            <div className="flex gap-1.5 mb-3 flex-wrap">
                                {[total, 100, 200, 500, 1000].filter((v, i) => i === 0 || v >= total).slice(0, 5).map((v, i) => (
                                    <button key={i} onClick={() => setTender(v.toFixed(2))}
                                        className="px-2.5 py-1 rounded-lg border border-border text-xs font-medium hover:border-primary/40 hover:bg-accent transition-colors">
                                        {i === 0 ? "Exact" : fmtMoney(Math.ceil(v / 100) * 100, currency)}
                                    </button>
                                ))}
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                {["7","8","9","4","5","6","1","2","3","00","0","⌫"].map(k => (
                                    <button key={k} onClick={() => k === "⌫" ? backspace() : append(k)}
                                        className="rounded-xl border h-12 text-base font-semibold transition-all active:scale-95 border-border hover:border-primary/30 hover:bg-accent">
                                        {k}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                <div className="px-4 pb-5 pt-3 border-t border-border shrink-0">
                    {/* Server-side validation errors — shown inside the modal so they're never hidden */}
                    {serverError && (
                        <div className="mb-3 flex items-start gap-2 rounded-xl bg-destructive/10 border border-destructive/30 px-3 py-2.5 text-xs text-destructive">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            <span>{serverError}</span>
                        </div>
                    )}
                    {isInstallment && !customer.trim() && (
                        <p className="text-xs text-destructive mb-2 flex items-center gap-1.5"><AlertTriangle className="h-3 w-3 shrink-0" />Customer name is required for installments.</p>
                    )}
                    <Button className="w-full h-12 text-base font-bold gap-2" disabled={!canPay || loading}
                        onClick={() => onConfirm({
                            payment_method:           method,
                            payment_amount:           isCash ? tenderN : (isInstallment ? downN : total),
                            customer_name:            customer,
                            discount_percent:         disc,
                            promo_id:                 appliedPromo?.id ?? null,
                            ...(isInstallment ? {
                                installment_provider:       instProvider,
                                installment_reference:      instReference || undefined,
                                installment_customer_phone: instPhone || undefined,
                                installment_down_payment:   downN,
                                installments_count:         parseInt(instCount),
                                installment_notes:          instNotes || undefined,
                            } : {}),
                        })}>
                        {loading ? <span className="h-4 w-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" /> : (
                            isInstallment
                                ? <><CalendarClock className="h-4 w-4" />
                                    Record {instProvider === "home_credit" ? "Home Credit" : instProvider === "skyro" ? "Skyro" : "Financing"}
                                    {downN > 0 ? ` · DP ${fmtMoney(downN, currency)}` : " · No DP"}
                                  </>
                                : <><Zap className="h-4 w-4" />Charge {fmtMoney(total, currency)}</>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ─── SaleSuccessModal ─────────────────────────────────────────────────────────
function SaleSuccessModal({ receipt, currency, installmentPlanId, onNewSale }: {
    receipt: ReceiptData; currency: string;
    installmentPlanId?: number | null;
    onNewSale: () => void;
}) {
    const isInstallment = receipt.payment_method === "installment";
    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm shadow-2xl flex flex-col max-h-[92vh]">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
                    <div className={cn("p-1.5 rounded-full", isInstallment ? "bg-primary/10" : "bg-green-100 dark:bg-green-900/40")}>
                        {isInstallment
                            ? <CalendarClock className="h-5 w-5 text-primary" />
                            : <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />}
                    </div>
                    <div>
                        <p className="font-bold text-foreground">
                            {isInstallment ? "Installment plan created" : "Sale completed"}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono">{receipt.receipt_number}</p>
                    </div>
                </div>

                {/* Installment summary banner */}
                {isInstallment && installmentPlanId && (
                    <div className="mx-4 mt-4 p-3.5 rounded-xl bg-primary/5 border border-primary/20 space-y-2">
                        <p className="text-xs font-bold text-primary uppercase tracking-widest flex items-center gap-1.5">
                            <CalendarClock className="h-3.5 w-3.5" /> Installment Plan Active
                        </p>
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Total</span>
                            <span className="font-bold">{fmtMoney(receipt.total, currency)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Down payment collected</span>
                            <span className="font-semibold text-green-600 dark:text-green-400">
                                {fmtMoney(receipt.payment_amount, currency)}
                            </span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Remaining balance</span>
                            <span className="font-bold text-foreground">
                                {fmtMoney(Math.max(0, receipt.total - receipt.payment_amount), currency)}
                            </span>
                        </div>
                        <a href={`/installments/${installmentPlanId}`}
                            className="mt-1 flex items-center justify-center gap-1.5 w-full h-9 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors">
                            <CalendarClock className="h-3.5 w-3.5" /> View Installment Plan
                        </a>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto p-5">
                    <ReceiptTemplate sale={receipt} currency={currency} showActions={true} />
                </div>
                <div className="px-4 pb-5 pt-3 border-t border-border shrink-0">
                    <Button className="w-full h-11 font-bold gap-2" onClick={onNewSale}>
                        <ShoppingCart className="h-4 w-4" />New Sale
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ─── CartPanel ────────────────────────────────────────────────────────────────
function CartPanel({ cart, subtotal, itemCount, currency, error, onUpdateQty, onRemove, onClear, onCharge }: {
    cart: CartItem[]; subtotal: number; itemCount: number; currency: string;
    error: string | null; onUpdateQty: (key: string, d: number) => void;
    onRemove: (key: string) => void; onClear: () => void; onCharge: () => void;
}) {
    return (
        <div className="flex flex-col bg-card h-full">
            <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 text-primary" />
                    <span className="text-sm font-bold">Cart</span>
                    {itemCount > 0 && (
                        <span className="bg-primary text-primary-foreground text-[10px] font-bold rounded-full h-4 min-w-[16px] flex items-center justify-center px-1">{itemCount}</span>
                    )}
                </div>
                {cart.length > 0 && (
                    <button onClick={onClear} className="text-xs text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1">
                        <Trash2 className="h-3 w-3" />Clear
                    </button>
                )}
            </div>
            <div className="flex-1 overflow-y-auto">
                {cart.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground px-4 text-center">
                        <ShoppingCart className="h-10 w-10 opacity-15" />
                        <div>
                            <p className="text-sm font-medium">Cart is empty</p>
                            <p className="text-xs opacity-60 mt-1">Select a product to add it<br />Press F9 to checkout</p>
                        </div>
                    </div>
                ) : (
                    <div className="px-3 py-2">
                        {cart.map(item => (
                            <div key={item.key} className="group flex items-start gap-2 py-2.5 border-b border-border/50 last:border-0">
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-foreground leading-snug break-words">{item.name}</p>
                                    {item.variant_name && <p className="text-[10px] text-muted-foreground mt-0.5">{item.variant_name}</p>}
                                    <p className="text-xs font-bold text-primary tabular-nums mt-0.5">{fmtMoney(item.price, currency)}</p>
                                </div>
                                <div className="shrink-0 flex flex-col items-end gap-1 pt-0.5">
                                    <div className="flex items-center gap-1">
                                        <button onClick={() => onUpdateQty(item.key, -1)}
                                            className="h-6 w-6 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                                            <Minus className="h-3 w-3" />
                                        </button>
                                        <span className="w-6 text-center text-sm font-bold tabular-nums">{item.qty}</span>
                                        <button onClick={() => onUpdateQty(item.key, 1)} disabled={item.qty >= item.stock}
                                            className="h-6 w-6 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30">
                                            <Plus className="h-3 w-3" />
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <span className="text-xs font-bold tabular-nums text-foreground">{fmtMoney(item.price * item.qty, currency)}</span>
                                        <button onClick={() => onRemove(item.key)}
                                            className="h-4 w-4 rounded flex items-center justify-center text-muted-foreground/30 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all">
                                            <X className="h-3 w-3" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            {cart.length > 0 && (
                <div className="shrink-0 border-t border-border p-4 space-y-3">
                    <div className="flex items-end justify-between">
                        <span className="text-xs text-muted-foreground">{itemCount} item{itemCount !== 1 ? "s" : ""}</span>
                        <div className="text-right">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Subtotal</p>
                            <p className="text-2xl font-bold tabular-nums text-foreground">{fmtMoney(subtotal, currency)}</p>
                        </div>
                    </div>
                    <Button className="w-full h-12 text-base font-bold gap-2" onClick={onCharge}>
                        <Zap className="h-4 w-4" />Charge
                        <span className="text-xs opacity-60 ml-auto font-normal">F9</span>
                    </Button>
                    {error && (
                        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{error}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Main POS component ───────────────────────────────────────────────────────
export default function PosIndex() {
    const { props }   = usePage<PageProps>();
    const { products, categories, session, branch, settings, app, open_table_orders, dining_tables } = props;
    const promos      = (props.promos as ActivePromo[]) ?? [];
    const user        = props.auth?.user;
    const currency    = app?.currency ?? "₱";
    const layout      = (props.preferred_layout ?? "grid") as LayoutMode;

    const [cart,               setCart]               = useState<CartItem[]>([]);
    const [search,             setSearch]             = useState("");
    const [activeCat,          setActiveCat]          = useState<number | null>(null);
    const [showPayment,        setShowPayment]        = useState(false);
    const [receipt,            setReceipt]            = useState<ReceiptData | null>(null);
    const [installmentPlanId,  setInstallmentPlanId]  = useState<number | null>(null);
    const [loading,            setLoading]            = useState(false);
    const [error,              setError]              = useState<string | null>(null);
    const [variantFor,         setVariantFor]         = useState<Product | null>(null);
    const [activeTableOrderId, setActiveTableOrderId] = useState<number | null>(null);
    const [pendingTableId,     setPendingTableId]     = useState<number | null>(null);

    const searchRef = useRef<HTMLInputElement>(null);

    // Auto-focus on mount
    useEffect(() => { searchRef.current?.focus(); }, []);

    // When a new table order is created, auto-select it once open_table_orders reloads
    useEffect(() => {
        if (pendingTableId === null) return;
        const newOrder = open_table_orders.find(o => o.table_id === pendingTableId);
        if (newOrder) {
            setActiveTableOrderId(newOrder.id);
            setPendingTableId(null);
        }
    }, [open_table_orders, pendingTableId]);

    const handleStartTableOrder = useCallback((tableId: number, covers: number) => {
        setPendingTableId(tableId);
        router.post(routes.tableOrders.store(), { table_id: tableId, covers }, {
            preserveScroll: true,
            only: ['open_table_orders'],
        });
    }, []);

    // Auto-refocus the search/barcode input after any transient action
    const refocus = useCallback((delay = 0) => {
        setTimeout(() => searchRef.current?.focus(), delay);
    }, []);

    const filtered = useMemo(() => {
        let list = products.filter(p => p.product_type !== 'ingredient');
        if (activeCat)      list = list.filter(p => p.category?.id === activeCat);
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(p => p.name.toLowerCase().includes(q) || (p.barcode ?? "").includes(q));
        }
        return list;
    }, [products, activeCat, search]);

    const subtotal  = useMemo(() => cart.reduce((s, i) => s + i.price * i.qty, 0), [cart]);
    const itemCount = useMemo(() => cart.reduce((s, i) => s + i.qty, 0), [cart]);

    const requireCustomerName = branch?.business_type === "salon";

    const addItem = useCallback((product: Product, variantId: number | null = null, variantName: string | null = null) => {
        const extra     = variantId ? (product.variants.find(v => v.id === variantId)?.extra_price ?? 0) : 0;
        const price     = product.price + extra;
        const key       = `${product.id}-${variantId ?? "base"}`;
        const stockLim  = (product.product_type === 'bundle' || product.product_type === 'made_to_order') ? 999 : product.stock;
        setCart(prev => {
            const ex = prev.find(i => i.key === key);
            if (ex) {
                if (ex.qty >= stockLim) return prev;
                return prev.map(i => i.key === key ? { ...i, qty: i.qty + 1 } : i);
            }
            return [...prev, { key, product_id: product.id, variant_id: variantId, name: product.name, variant_name: variantName, price, qty: 1, stock: stockLim, product_type: product.product_type, bundle_items: product.bundle_items ?? null, recipe_items: product.recipe_items ?? null }];
        });
    }, []);

    const handleProductClick = useCallback((p: Product) => {
        if (sessionRequired && !session) return; // blocked — no open session
        const isBundleMTO = p.product_type === 'bundle' || p.product_type === 'made_to_order';
        if (!isBundleMTO && p.stock <= 0) return;
        if (p.has_variants && p.variants.filter(v => v.is_available).length > 0) {
            setVariantFor(p);
            return;
        }
        addItem(p);
        setSearch("");
        refocus();
    }, [addItem, refocus]);

    // Combined search + instant barcode: if the current value exactly matches a barcode, add it
    const handleSearchOrScan = useCallback((value: string) => {
        setSearch(value);
        const code = value.trim();
        if (!code) return;
        const exact = products.find(p => (p.barcode ?? "").trim() === code);
        if (exact) {
            handleProductClick(exact);
            setSearch("");
        }
    }, [products, handleProductClick]);

    // Enter key: 1) exact barcode match, 2) exact name match, 3) single filtered result
    const handleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const code = search.trim();
        if (!code) return;

        // Priority 1: exact barcode
        const byBarcode = products.find(p => (p.barcode ?? "").trim() === code);
        if (byBarcode) { handleProductClick(byBarcode); setSearch(""); return; }

        // Priority 2: exact product name (case-insensitive)
        const lower    = code.toLowerCase();
        const byName   = products.find(p => p.name.toLowerCase() === lower);
        if (byName)  { handleProductClick(byName); setSearch(""); return; }

        // Priority 3: only one result in the filtered list → treat as unambiguous
        if (filtered.length === 1) { handleProductClick(filtered[0]); setSearch(""); }
    }, [search, products, filtered, handleProductClick]);

    const updateQty    = (key: string, delta: number) =>
        setCart(prev => prev.flatMap(i => {
            if (i.key !== key) return [i];
            const nq = i.qty + delta;
            if (nq <= 0) return [];
            if (nq > i.stock) return [i];
            return [{ ...i, qty: nq }];
        }));

    const removeItem = (key: string) => setCart(prev => prev.filter(i => i.key !== key));
    const clearCart  = () => setCart([]);

    const handleConfirm = (payData: {
        payment_method: PayMethod; payment_amount: number; customer_name: string;
        discount_percent: number; promo_id: number | null;
        installment_provider?: string; installment_reference?: string;
        installment_customer_phone?: string; installment_down_payment?: number;
        installments_count?: number; installment_notes?: string;
    }) => {
        if (!cart.length) return;
        setLoading(true); setError(null);
        router.post(routes.pos.store(), {
            items:            cart.map(i => ({ id: i.product_id, qty: i.qty, variant_id: i.variant_id })),
            payment_method:   payData.payment_method,
            payment_amount:   payData.payment_amount,
            customer_name:    payData.customer_name || null,
            discount_percent: payData.discount_percent,
            promo_id:         payData.promo_id ?? null,
            cash_session_id:  session?.id ?? null,
            table_order_id:   activeTableOrderId ?? null,
            // Financing/installment fields (sent only when method = installment)
            installment_provider:       payData.installment_provider ?? null,
            installment_reference:      payData.installment_reference ?? null,
            installment_customer_phone: payData.installment_customer_phone ?? null,
            installment_down_payment:   payData.installment_down_payment ?? null,
            installments_count:         payData.installments_count ?? null,
            installment_notes:          payData.installment_notes ?? null,
        }, {
            preserveScroll: true,
            onSuccess: page => {
                const flash = (page.props as any).flash ?? {};
                if (!flash.pos_result) {
                    setError(flash.errors?.error ?? "Checkout failed — please try again.");
                    setLoading(false);
                    return;
                }
                const r    = flash.pos_result;
                // Use server-computed values — avoids float drift between UI and DB
                const disc = r.discount_amount ?? 0;
                const pd   = r.promo_discount   ?? 0;
                const activeOrder = activeTableOrderId
                    ? open_table_orders.find(o => o.id === activeTableOrderId)
                    : null;
                setInstallmentPlanId(r.installment_plan_id ?? null);
                setReceipt({
                    receipt_number: r.receipt_number ?? "—",
                    status: "completed",
                    payment_method: payData.payment_method,
                    payment_amount: payData.payment_amount,
                    change_amount:  r.change ?? 0,
                    discount_amount: disc + pd,
                    total:           r.total,
                    customer_name:   payData.customer_name || null,
                    notes: [payData.discount_percent > 0 ? `Discount ${payData.discount_percent}%` : null, r.promo_name ? `Promo: ${r.promo_name}` : null].filter(Boolean).join(' | ') || null,
                    created_at:      new Date().toISOString(),
                    cashier:         user ? `${user.fname} ${user.lname}` : "—",
                    branch_name:     branch?.name,
                    table_label:     activeOrder?.label ?? null,
                    business_type:   branch?.business_type,
                    items:           cart.map(i => ({ product_name: i.name, variant_name: i.variant_name, quantity: i.qty, price: i.price })),
                });
                setShowPayment(false);
                setActiveTableOrderId(null);
                setCart([]);
                setLoading(false);
            },
            onError: errors => {
                setError(Object.values(errors)[0] as string ?? "Transaction failed.");
                setLoading(false);
            },
        });
    };

    // Keyboard shortcuts — F2 and F5 both focus combined search/barcode field
    useEffect(() => {
        const fn = (e: KeyboardEvent) => {
            if (e.key === "F2" || e.key === "F5") { e.preventDefault(); searchRef.current?.focus(); }
            if (e.key === "F9" && cart.length)    { e.preventDefault(); setShowPayment(true); }
            if (e.key === "Escape")               { setShowPayment(false); setVariantFor(null); }
        };
        window.addEventListener("keydown", fn);
        return () => window.removeEventListener("keydown", fn);
    }, [cart]);

    // ── Combined search/barcode input ─────────────────────────────────────────
    const searchInput = (
        <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
                ref={searchRef}
                value={search}
                onChange={e => handleSearchOrScan(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search or scan barcode… (F2)"
                className="w-full h-9 pl-9 pr-8 text-sm bg-background border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
                // Suppress browser floating toolbars (Translate / Clipboard / Web Search)
                // that appear on Android Chrome when text is entered via OTG barcode scanner
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                data-gramm="false"
            />
            {search
                ? <button onClick={() => { setSearch(""); refocus(); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                : <ScanLine className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40 pointer-events-none" />}
        </div>
    );

    // ── Session guard ─────────────────────────────────────────────────────────
    const sessionRequired = settings?.require_cash_session ?? true;
    const sessionBlocked  = sessionRequired && !session;

    // ── No-session overlay — shown on top of any layout ───────────────────────
    const noSessionOverlay = sessionBlocked ? (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-4 p-8 rounded-2xl border border-border bg-card shadow-2xl max-w-sm w-full mx-4 text-center">
                <div className="h-14 w-14 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <AlertTriangle className="h-7 w-7 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                    <p className="font-bold text-foreground text-lg">No Open Cash Session</p>
                    <p className="text-sm text-muted-foreground mt-1">
                        You must open a cash session before you can process sales.
                    </p>
                </div>
                <a
                    href="/cash-sessions"
                    className="w-full h-11 flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
                >
                    <Wallet className="h-4 w-4" />
                    Go to Cash Sessions
                </a>
            </div>
        </div>
    ) : null;

    // ── Kiosk: truly full-screen (no layout wrapper at all) ──────────────────
    if (layout === "kiosk") {
        return (
            <div className="fixed inset-0 flex flex-col overflow-hidden bg-background text-foreground relative">
                {noSessionOverlay}
                {/* Kiosk header */}
                <div className="shrink-0 flex items-center gap-3 bg-primary px-5 py-3.5">
                    <span className="font-black text-primary-foreground text-xl tracking-tight shrink-0">
                        {branch?.name ?? "POS"}
                    </span>
                    {/* Kiosk search — white background for contrast on primary header */}
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                        <input
                            ref={searchRef}
                            value={search}
                            onChange={e => handleSearchOrScan(e.target.value)}
                            onKeyDown={handleSearchKeyDown}
                            placeholder="Search or scan… (F2)"
                            className="w-full h-10 pl-9 pr-8 text-sm bg-white dark:bg-background border-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-white/50 placeholder:text-muted-foreground shadow-sm"
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="none"
                            spellCheck={false}
                            data-gramm="false"
                        />
                        {search
                            ? <button onClick={() => { setSearch(""); refocus(); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                            : <ScanLine className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40 pointer-events-none" />}
                    </div>
                    <CategoryDropdown categories={categories} activeCat={activeCat} onChange={setActiveCat} />
                    <button onClick={() => window.location.reload()}
                        className="h-10 w-10 flex items-center justify-center rounded-xl bg-white/15 hover:bg-white/25 text-primary-foreground transition-colors shrink-0">
                        <RefreshCw className="h-4 w-4" />
                    </button>
                </div>
                {/* Kiosk body */}
                <div className="flex-1 min-h-0 overflow-hidden">
                    <Suspense fallback={<LayoutSpinner />}>
                        <KioskLayout filtered={filtered} cart={cart} currency={currency} onProductClick={handleProductClick}
                            onCharge={() => { setError(null); setShowPayment(true); }}
                            subtotal={subtotal} itemCount={itemCount} onClear={clearCart} />
                    </Suspense>
                </div>

                {variantFor && (
                    <VariantPicker product={variantFor} currency={currency}
                        onSelect={(vid, vname) => { addItem(variantFor, vid, vname); setVariantFor(null); refocus(50); }}
                        onClose={() => { setVariantFor(null); refocus(50); }} />
                )}
                {showPayment && (
                    <PaymentModal subtotal={subtotal} settings={settings} currency={currency}
                        customerNameRequired={requireCustomerName} promos={promos} cart={cart}
                        onConfirm={handleConfirm}
                        onClose={() => { setShowPayment(false); setError(null); refocus(50); }}
                        loading={loading} serverError={error} />
                )}
                {receipt && <SaleSuccessModal receipt={receipt} currency={currency} installmentPlanId={installmentPlanId} onNewSale={() => { setReceipt(null); setInstallmentPlanId(null); refocus(100); }} />}
            </div>
        );
    }

    // ── Mobile: full AdminLayout with sidebar
    // Use dvh (dynamic viewport height) so the cart bar is never hidden behind browser chrome.
    // Falls back gracefully to 100vh on older browsers.
    if (layout === "mobile") {
        return (
            <AdminLayout>
                <div className="relative flex flex-col overflow-hidden -m-6"
                    style={{ height: 'calc(100dvh - 4rem)' }}>
                    {noSessionOverlay}
                    <div className="shrink-0 flex items-center gap-2 border-b border-border bg-card px-4 py-2">
                        {searchInput}
                        <a href={routes.sales.history()}
                            className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0">
                            <History className="h-3.5 w-3.5" />
                        </a>
                    </div>
                    <div className="flex-1 min-h-0 overflow-hidden">
                        <Suspense fallback={<LayoutSpinner />}>
                            <MobileLayout filtered={filtered} cart={cart} currency={currency} onProductClick={handleProductClick}
                                onCharge={() => { setError(null); setShowPayment(true); }}
                                subtotal={subtotal} itemCount={itemCount} onClear={clearCart}
                                onUpdateQty={updateQty} onRemove={removeItem} />
                        </Suspense>
                    </div>
                </div>

                {variantFor && (
                    <VariantPicker product={variantFor} currency={currency}
                        onSelect={(vid, vname) => { addItem(variantFor, vid, vname); setVariantFor(null); refocus(50); }}
                        onClose={() => { setVariantFor(null); refocus(50); }} />
                )}
                {showPayment && (
                    <PaymentModal subtotal={subtotal} settings={settings} currency={currency}
                        customerNameRequired={requireCustomerName} promos={promos} cart={cart}
                        onConfirm={handleConfirm}
                        onClose={() => { setShowPayment(false); setError(null); refocus(50); }}
                        loading={loading} serverError={error} />
                )}
                {receipt && <SaleSuccessModal receipt={receipt} currency={currency} installmentPlanId={installmentPlanId} onNewSale={() => { setReceipt(null); setInstallmentPlanId(null); refocus(100); }} />}
            </AdminLayout>
        );
    }

    // ── Standard layouts ──────────────────────────────────────────────────────
    return (
        <AdminLayout>
            {/* CashierLayout (bottom-nav): header=3rem + nav=4rem = 7rem chrome, no padding */}
            {/* AdminLayout: header=4rem, p-6 padding → -m-6 escape */}
            <div className={cn(
                "relative flex flex-col overflow-hidden",
                user?.is_cashier
                    ? "h-[calc(100vh-7rem)]"
                    : "h-[calc(100vh-4rem)] -m-6"
            )}>
                {noSessionOverlay}
                {/* Top bar with combined search/barcode */}
                <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border bg-card">
                    <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0",
                        session ? "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400"
                                : "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400")}>
                        <span className={cn("h-1.5 w-1.5 rounded-full", session ? "bg-green-500" : "bg-amber-500")} />
                        {session ? "Session open" : "No session"}
                    </div>
                    <span className="text-sm font-bold text-foreground hidden sm:block truncate max-w-[140px]">{branch?.name ?? "POS"}</span>
                    {branch?.business_type && (
                        <span className="hidden md:flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold capitalize">
                            {branch.business_type.replace("_", " ")}
                        </span>
                    )}
                    {/* Combined search + barcode */}
                    {searchInput}
                    {/* Category dropdown — hidden for cafe/restaurant/mobile (they have their own navigation) */}
                    {layout !== "cafe" && layout !== "restaurant" && layout !== "mobile" && (
                        <CategoryDropdown categories={categories} activeCat={activeCat} onChange={setActiveCat} />
                    )}
                    <div className="flex-1" />
                    <a href={routes.sales.history()}
                        className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                        <History className="h-3.5 w-3.5" /><span className="hidden sm:block">History</span>
                    </a>
                    <button onClick={() => window.location.reload()}
                        className="h-8 w-8 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                        <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    <div className="flex-1 flex flex-col overflow-hidden border-r border-border">
                        <div className="flex-1 overflow-y-auto p-3">
                            <Suspense fallback={<LayoutSpinner />}>
                                {layout === "grid"       && <GridLayout       filtered={filtered} cart={cart} currency={currency} onProductClick={handleProductClick} />}
                                {layout === "tablet"     && <TabletLayout     filtered={filtered} cart={cart} currency={currency} onProductClick={handleProductClick} />}
                                {layout === "grocery"    && <GroceryLayout    filtered={filtered} cart={cart} currency={currency} onProductClick={handleProductClick} />}
                                {layout === "cafe"       && <CafeLayout       filtered={filtered} allProducts={products} categories={categories} activeCat={activeCat} onCatChange={setActiveCat} cart={cart} currency={currency} onProductClick={handleProductClick} />}
                                {layout === "restaurant" && <RestaurantLayout filtered={filtered} cart={cart} currency={currency} onProductClick={handleProductClick} openTableOrders={open_table_orders} diningTables={dining_tables} activeTableOrderId={activeTableOrderId} onSelectTable={setActiveTableOrderId} onStartTableOrder={handleStartTableOrder} />}
                                {layout === "salon"      && <SalonLayout      filtered={filtered} cart={cart} currency={currency} onProductClick={handleProductClick} />}
                            </Suspense>
                        </div>
                    </div>

                    {/* Cart sidebar */}
                    <div className="shrink-0 flex flex-col border-l border-border w-72 lg:w-80 xl:w-96">
                        <CartPanel cart={cart} subtotal={subtotal} itemCount={itemCount} currency={currency} error={error}
                            onUpdateQty={updateQty} onRemove={removeItem} onClear={clearCart}
                            onCharge={() => { setError(null); setShowPayment(true); }} />
                    </div>
                </div>
            </div>

            {variantFor && (
                <VariantPicker product={variantFor} currency={currency}
                    onSelect={(vid, vname) => { addItem(variantFor, vid, vname); setVariantFor(null); refocus(50); }}
                    onClose={() => { setVariantFor(null); refocus(50); }} />
            )}
            {showPayment && (
                <PaymentModal subtotal={subtotal} settings={settings} currency={currency}
                    customerNameRequired={requireCustomerName} promos={promos} cart={cart}
                    onConfirm={handleConfirm}
                    onClose={() => { setShowPayment(false); setError(null); refocus(50); }}
                    loading={loading} />
            )}
            {receipt && <SaleSuccessModal receipt={receipt} currency={currency} installmentPlanId={installmentPlanId} onNewSale={() => { setReceipt(null); setInstallmentPlanId(null); refocus(100); }} />}
        </AdminLayout>
    );
}
