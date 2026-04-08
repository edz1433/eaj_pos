import { useState } from "react";
import { Head, usePage, router, Link } from "@inertiajs/react";
import AdminLayout from "@/layouts/AdminLayout";
import { routes } from "@/routes";
import { cn } from "@/lib/utils";
import {
    Plus, X, Lock, Unlock, Eye, AlertTriangle, RefreshCw,
    Banknote, Smartphone, CreditCard, Tag, TrendingUp,
    CheckCircle2, XCircle, Clock, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { fmtDate } from "@/lib/date";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CashSession {
    id: number;
    session_number: string;
    status: "open" | "closed";
    opening_cash: number;
    expected_cash: number | null;
    counted_cash: number | null;
    over_short: number | null;
    over_short_status: "pending" | "balanced" | "over" | "short";
    notes: string | null;
    opened_at: string;
    closed_at: string | null;
    cashier: string;
    // full=true extras
    cash_sales_total?: number;
    total_sales?: number;
    sale_count?: number;
    computed_expected?: number;
    // formatted
    formatted_opening_cash: string;
    formatted_expected_cash: string;
    formatted_counted_cash: string;
    formatted_over_short: string;
}

interface PaginatedHistory {
    data: CashSession[];
    current_page: number;
    last_page: number;
    total: number;
    from: number | null;
    to: number | null;
    links: { url: string | null; label: string; active: boolean }[];
}

interface PageProps {
    open_session:     CashSession | null;
    history:          PaginatedHistory;
    require_count:    boolean;
    over_short_alert: number;
    is_admin:         boolean;
    app:              { currency: string };
    flash?:           { message?: { type: string; text: string } | null };
    [key: string]: unknown;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number, currency = "₱") =>
    `${currency}${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const inp = "w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-all";

const overShortCls = (status: string) => ({
    balanced: "text-emerald-600 dark:text-emerald-400",
    over:     "text-amber-500",
    short:    "text-destructive",
    pending:  "text-muted-foreground",
}[status] ?? "text-muted-foreground");

// ─── Open Session Modal ───────────────────────────────────────────────────────

function OpenSessionModal({ currency, onClose }: { currency: string; onClose: () => void }) {
    const [amount,  setAmount]  = useState("");
    const [notes,   setNotes]   = useState("");
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState("");

    const val      = parseFloat(amount) || 0;
    const append   = (v: string) => setAmount(p => (p === "0" || p === "") ? v : p + v);
    const bksp     = ()          => setAmount(p => p.slice(0, -1) || "");

    const handleOpen = () => {
        if (val < 0) { setError("Enter a valid amount."); return; }
        setLoading(true); setError("");
        router.post(routes.cashSessions.open(), { opening_cash: val, notes: notes || null }, {
            preserveScroll: true,
            onSuccess: () => { setLoading(false); onClose(); },
            onError: e  => { setError(Object.values(e)[0] as string ?? "Failed."); setLoading(false); },
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm shadow-2xl">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                    <div>
                        <p className="font-bold text-foreground flex items-center gap-2">
                            <Unlock className="h-4 w-4 text-emerald-500" /> Open Cash Session
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">Enter physical cash in the drawer</p>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-md hover:bg-muted text-muted-foreground"><X className="h-4 w-4" /></button>
                </div>

                <div className="p-5 space-y-4">
                    {/* Big display */}
                    <div className="bg-background border-2 border-primary/20 rounded-2xl px-5 py-4 text-center">
                        <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Opening Cash</p>
                        <p className="text-4xl font-black text-foreground tabular-nums">
                            {currency}{val.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                        </p>
                    </div>

                    {error && <p className="text-xs text-destructive flex items-center gap-1.5"><AlertTriangle className="h-3 w-3" />{error}</p>}

                    {/* Quick amounts */}
                    <div className="grid grid-cols-4 gap-1.5">
                        {[500, 1000, 2000, 5000].map(v => (
                            <button key={v} onClick={() => setAmount(String(v))}
                                className={cn("py-2 rounded-xl border text-xs font-bold transition-all",
                                    val === v ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/40 hover:bg-accent")}>
                                {currency}{v.toLocaleString()}
                            </button>
                        ))}
                    </div>

                    {/* Numpad */}
                    <div className="grid grid-cols-3 gap-2">
                        {["7","8","9","4","5","6","1","2","3","00","0","⌫"].map(k => (
                            <button key={k} onClick={() => k === "⌫" ? bksp() : append(k)}
                                className="h-12 rounded-xl border border-border text-base font-semibold hover:bg-accent hover:border-primary/30 active:scale-95 transition-all">
                                {k}
                            </button>
                        ))}
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Notes (optional)</label>
                        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                            placeholder="e.g. Morning shift, petty cash breakdown…"
                            className={inp + " resize-none"} />
                    </div>
                </div>

                <div className="px-5 pb-5 flex gap-3">
                    <Button variant="outline" className="flex-1 h-10" onClick={onClose} disabled={loading}>Cancel</Button>
                    <Button className="flex-1 h-10 gap-2 font-bold" onClick={handleOpen} disabled={loading || val < 0}>
                        {loading && <span className="h-3.5 w-3.5 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />}
                        <Unlock className="h-4 w-4" /> Open Session
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ─── Close Session Modal ──────────────────────────────────────────────────────

function CloseSessionModal({ session, requireCount, overShortAlert, currency, onClose }: {
    session: CashSession;
    requireCount: boolean;
    overShortAlert: number;
    currency: string;
    onClose: () => void;
}) {
    const [counted, setCounted] = useState("");
    const [notes,   setNotes]   = useState(session.notes ?? "");
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState("");

    const expected   = session.computed_expected ?? 0;
    const countedNum = parseFloat(counted) || 0;
    const overShort  = counted ? countedNum - expected : null;
    const isAlert    = overShort !== null && Math.abs(overShort) > overShortAlert;
    const append     = (v: string) => setCounted(p => (p === "0" || p === "") ? v : p + v);
    const bksp       = ()          => setCounted(p => p.slice(0, -1) || "");

    const handleClose = () => {
        if (requireCount && !counted.trim()) { setError("Enter the counted cash amount."); return; }
        setLoading(true); setError("");
        router.post(routes.cashSessions.close(session.id), {
            counted_cash: requireCount ? countedNum : undefined,
            notes: notes || null,
        }, {
            preserveScroll: true,
            onSuccess: () => { setLoading(false); onClose(); },
            onError: e  => { setError(Object.values(e)[0] as string ?? "Failed."); setLoading(false); },
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl flex flex-col max-h-[92vh]">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
                    <div>
                        <p className="font-bold text-foreground flex items-center gap-2">
                            <Lock className="h-4 w-4 text-amber-500" /> Close Session
                        </p>
                        <p className="font-mono text-xs text-muted-foreground mt-0.5">{session.session_number}</p>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-md hover:bg-muted text-muted-foreground"><X className="h-4 w-4" /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {/* Summary card */}
                    <div className="bg-muted/30 rounded-2xl p-4 space-y-2 text-sm">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Session Summary</p>
                        {[
                            { label: "Opening cash",  val: fmt(session.opening_cash, currency) },
                            { label: "Cash sales",    val: fmt(session.cash_sales_total ?? 0, currency), em: true },
                            { label: "Total sales",   val: fmt(session.total_sales ?? 0, currency) },
                            { label: "Transactions",  val: String(session.sale_count ?? 0) },
                        ].map(r => (
                            <div key={r.label} className="flex justify-between">
                                <span className="text-muted-foreground">{r.label}</span>
                                <span className={cn("tabular-nums font-medium", r.em ? "text-emerald-600 dark:text-emerald-400" : "text-foreground")}>{r.val}</span>
                            </div>
                        ))}
                        <div className="flex justify-between border-t border-border pt-2 mt-1">
                            <span className="font-bold text-foreground">Expected cash</span>
                            <span className="tabular-nums font-black text-primary">{fmt(expected, currency)}</span>
                        </div>
                    </div>

                    {/* Count cash */}
                    {requireCount ? (
                        <div className="space-y-3">
                            <div className={cn("border-2 rounded-2xl px-5 py-4 text-center transition-all",
                                overShort === null ? "border-border bg-background"
                                : overShort === 0  ? "border-emerald-500/40 bg-emerald-500/5"
                                : isAlert          ? "border-destructive/40 bg-destructive/5"
                                : "border-amber-500/40 bg-amber-500/5")}>
                                <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Counted Cash</p>
                                <p className={cn("text-4xl font-black tabular-nums",
                                    overShort === null ? "text-foreground"
                                    : overShort === 0  ? "text-emerald-600 dark:text-emerald-400"
                                    : isAlert          ? "text-destructive"
                                    : "text-amber-500")}>
                                    {currency}{countedNum.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                                </p>
                                {overShort !== null && (
                                    <p className={cn("text-sm font-bold mt-1 tabular-nums",
                                        overShort === 0 ? "text-emerald-600 dark:text-emerald-400"
                                        : overShort > 0 ? "text-amber-500" : "text-destructive")}>
                                        {overShort === 0 ? "✓ Balanced"
                                        : overShort > 0 ? `+${fmt(overShort, currency)} over`
                                        : `${fmt(overShort, currency)} short`}
                                    </p>
                                )}
                            </div>

                            {isAlert && (
                                <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-600 dark:text-amber-400">
                                    <AlertTriangle className="h-4 w-4 shrink-0" />
                                    Over/short exceeds the ₱{overShortAlert.toFixed(2)} alert threshold. Please recount or add a note.
                                </div>
                            )}

                            {error && <p className="text-xs text-destructive">{error}</p>}

                            <button onClick={() => setCounted(expected.toFixed(2))}
                                className="w-full py-2 rounded-xl border border-primary/30 text-primary text-xs font-semibold hover:bg-primary/5 transition-colors">
                                Fill expected amount ({fmt(expected, currency)})
                            </button>

                            <div className="grid grid-cols-3 gap-2">
                                {["7","8","9","4","5","6","1","2","3","00","0","⌫"].map(k => (
                                    <button key={k} onClick={() => k === "⌫" ? bksp() : append(k)}
                                        className="h-11 rounded-xl border border-border text-sm font-semibold hover:bg-accent hover:border-primary/30 active:scale-95 transition-all">
                                        {k}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 text-xs text-muted-foreground">
                            Cash count not required — session will close with expected cash recorded automatically.
                        </div>
                    )}

                    {/* Notes */}
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Notes (optional)</label>
                        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                            placeholder="e.g. Short due to price adjustment…"
                            className={inp + " resize-none"} />
                    </div>
                </div>

                <div className="px-5 pb-5 pt-3 border-t border-border flex gap-3 shrink-0">
                    <Button variant="outline" className="flex-1 h-10" onClick={onClose} disabled={loading}>Cancel</Button>
                    <Button
                        className={cn("flex-1 h-10 gap-2 font-bold",
                            isAlert ? "bg-amber-500 hover:bg-amber-600 text-white border-amber-500" : "")}
                        onClick={handleClose}
                        disabled={loading || (requireCount && !counted)}>
                        {loading && <span className="h-3.5 w-3.5 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />}
                        <Lock className="h-4 w-4" /> Close Session
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ─── Active Session Panel ─────────────────────────────────────────────────────

function ActiveSessionPanel({ session, requireCount, overShortAlert, currency }: {
    session: CashSession;
    requireCount: boolean;
    overShortAlert: number;
    currency: string;
}) {
    const [showClose, setShowClose] = useState(false);
    const ago = formatDistanceToNow(new Date(session.opened_at), { addSuffix: false });

    const stats = [
        { label: "Opening Cash",  val: session.formatted_opening_cash,           color: "text-foreground",                          icon: Banknote },
        { label: "Cash Sales",    val: fmt(session.cash_sales_total ?? 0, currency), color: "text-emerald-600 dark:text-emerald-400",  icon: TrendingUp },
        { label: "Total Sales",   val: fmt(session.total_sales ?? 0, currency),   color: "text-foreground",                          icon: TrendingUp },
        { label: "Transactions",  val: String(session.sale_count ?? 0),           color: "text-foreground",                          icon: CheckCircle2 },
    ];

    return (
        <>
            <div className="bg-emerald-500/5 border border-emerald-500/25 rounded-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-emerald-500/15">
                    <div className="flex items-center gap-3">
                        <div className="relative h-3 w-3">
                            <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-50" />
                            <span className="relative block h-3 w-3 rounded-full bg-emerald-500" />
                        </div>
                        <div>
                            <p className="font-bold text-foreground">Session Open</p>
                            <p className="text-xs font-mono text-muted-foreground">{session.session_number}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => router.reload({ preserveScroll: true })}
                            className="h-8 w-8 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                            <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                        <Link href={routes.cashSessions.show(session.id)}>
                            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                                <Eye className="h-3.5 w-3.5" /> Details
                            </Button>
                        </Link>
                        <Button size="sm" className="h-8 gap-1.5 text-xs bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                            onClick={() => setShowClose(true)}>
                            <Lock className="h-3.5 w-3.5" /> Close
                        </Button>
                    </div>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-emerald-500/10">
                    {stats.map(s => {
                        const Icon = s.icon;
                        return (
                            <div key={s.label} className="px-5 py-4 text-center">
                                <Icon className="h-4 w-4 text-muted-foreground mx-auto mb-1.5" />
                                <p className={cn("text-xl font-black tabular-nums", s.color)}>{s.val}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wide">{s.label}</p>
                            </div>
                        );
                    })}
                </div>

                {/* Footer */}
                <div className="px-5 py-3 border-t border-emerald-500/15 flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        {ago} · {session.cashier} · Opened {fmtDate(session.opened_at, "h:mm a, MMM d")}
                    </span>
                    <span>
                        Expected: <strong className="text-foreground">{fmt(session.computed_expected ?? session.opening_cash, currency)}</strong>
                    </span>
                </div>
            </div>

            {showClose && (
                <CloseSessionModal
                    session={session}
                    requireCount={requireCount}
                    overShortAlert={overShortAlert}
                    currency={currency}
                    onClose={() => setShowClose(false)}
                />
            )}
        </>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CashSessionsIndex() {
    const { open_session, history, require_count, over_short_alert, app, flash } =
        usePage<PageProps>().props;

    const currency = app?.currency ?? "₱";
    const [showOpen, setShowOpen] = useState(false);
    const [toast,    setToast]    = useState(flash?.message ?? null);

    return (
        <AdminLayout>
            <Head title="Cash Sessions" />

            {/* Toast */}
            {toast && (
                <div className={cn(
                    "fixed top-4 right-4 z-[9999] flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-2xl border text-sm font-medium max-w-sm",
                    toast.type === "success" ? "bg-[#0b1a10] border-emerald-500/40 text-emerald-300"
                    : toast.type === "warning" ? "bg-[#1a150b] border-amber-500/40 text-amber-300"
                    : "bg-[#1a0b0b] border-red-500/40 text-red-300"
                )}>
                    {toast.type === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" />
                     : toast.type === "warning" ? <AlertTriangle className="h-4 w-4 shrink-0" />
                     : <XCircle className="h-4 w-4 shrink-0" />}
                    <span className="flex-1">{toast.text}</span>
                    <button onClick={() => setToast(null)} className="opacity-50 hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
                </div>
            )}

            <div className="space-y-6 max-w-[1100px] mx-auto">

                {/* Page header */}
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <h1 className="text-xl font-bold text-foreground">Cash Sessions</h1>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            {open_session ? "Session is currently open" : "No active session — open one to start the day"}
                        </p>
                    </div>
                    {!open_session && (
                        <Button className="gap-2 h-9 font-semibold" onClick={() => setShowOpen(true)}>
                            <Plus className="h-4 w-4" /> Open Session
                        </Button>
                    )}
                </div>

                {/* Active session or empty state */}
                {open_session ? (
                    <ActiveSessionPanel
                        session={open_session}
                        requireCount={require_count}
                        overShortAlert={over_short_alert}
                        currency={currency}
                    />
                ) : (
                    <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl px-6 py-8 flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left">
                        <div className="p-4 rounded-2xl bg-amber-500/10 shrink-0">
                            <Banknote className="h-7 w-7 text-amber-500" />
                        </div>
                        <div className="flex-1">
                            <p className="font-bold text-foreground text-base">No open session</p>
                            <p className="text-sm text-muted-foreground mt-1">Open a cash session to begin tracking sales and cash flow for today.</p>
                        </div>
                        <Button className="gap-2 shrink-0" onClick={() => setShowOpen(true)}>
                            <Unlock className="h-4 w-4" /> Open Session
                        </Button>
                    </div>
                )}

                {/* Session history */}
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-bold text-foreground">
                            Session History
                            <span className="ml-2 font-normal text-muted-foreground text-xs">{history.total} total</span>
                        </h2>
                    </div>

                    <div className="bg-card border border-border rounded-xl overflow-hidden">
                        {history.data.length === 0 ? (
                            <div className="py-16 text-center text-muted-foreground">
                                <Clock className="h-8 w-8 mx-auto mb-2 opacity-20" />
                                <p className="text-sm">No sessions yet</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-border bg-muted/30">
                                            <th className="px-4 py-3 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Session</th>
                                            <th className="px-4 py-3 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-widest hidden sm:table-cell">Date</th>
                                            <th className="px-4 py-3 text-right text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Opening</th>
                                            <th className="px-4 py-3 text-right text-[10px] font-bold text-muted-foreground uppercase tracking-widest hidden md:table-cell">Expected</th>
                                            <th className="px-4 py-3 text-right text-[10px] font-bold text-muted-foreground uppercase tracking-widest hidden md:table-cell">Counted</th>
                                            <th className="px-4 py-3 text-right text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Over/Short</th>
                                            <th className="px-4 py-3 text-center text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Status</th>
                                            <th className="w-10" />
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {history.data.map(s => {
                                            const isOpen = s.status === "open";
                                            const durationStr = s.closed_at ? (() => {
                                                const mins = Math.round(
                                                    (new Date(s.closed_at).getTime() - new Date(s.opened_at).getTime()) / 60000
                                                );
                                                return mins >= 60 ? `${Math.floor(mins/60)}h ${mins%60}m` : `${mins}m`;
                                            })() : null;

                                            return (
                                                <tr key={s.id} className="hover:bg-muted/20 transition-colors group">
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-2">
                                                            <span className={cn("h-2 w-2 rounded-full shrink-0",
                                                                isOpen ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/20")} />
                                                            <span className="font-mono text-xs font-bold text-foreground">{s.session_number}</span>
                                                        </div>
                                                        <p className="text-[11px] text-muted-foreground mt-0.5 pl-4">{s.cashier}</p>
                                                    </td>
                                                    <td className="px-4 py-3 hidden sm:table-cell">
                                                        <p className="text-sm text-foreground">{fmtDate(s.opened_at, "MMM d, yyyy")}</p>
                                                        <p className="text-[11px] text-muted-foreground">
                                                            {fmtDate(s.opened_at, "h:mm a")}
                                                            {durationStr && <span className="ml-1 opacity-60">· {durationStr}</span>}
                                                        </p>
                                                    </td>
                                                    <td className="px-4 py-3 text-right tabular-nums text-sm font-medium text-foreground">
                                                        {s.formatted_opening_cash}
                                                    </td>
                                                    <td className="px-4 py-3 hidden md:table-cell text-right tabular-nums text-sm text-muted-foreground">
                                                        {s.expected_cash !== null ? s.formatted_expected_cash : "—"}
                                                    </td>
                                                    <td className="px-4 py-3 hidden md:table-cell text-right tabular-nums text-sm text-muted-foreground">
                                                        {s.counted_cash !== null ? s.formatted_counted_cash : "—"}
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        {s.over_short !== null ? (
                                                            <span className={cn("text-sm font-bold tabular-nums", overShortCls(s.over_short_status))}>
                                                                {s.formatted_over_short}
                                                            </span>
                                                        ) : (
                                                            <span className="text-muted-foreground text-xs">—</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <span className={cn("text-[10px] font-bold px-2.5 py-1 rounded-full",
                                                            isOpen
                                                                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                                                : "bg-muted text-muted-foreground")}>
                                                            {isOpen ? "● Open" : "Closed"}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        <Link href={routes.cashSessions.show(s.id)}
                                                            className="h-7 w-7 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors opacity-0 group-hover:opacity-100">
                                                            <ChevronRight className="h-3.5 w-3.5" />
                                                        </Link>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Pagination */}
                        {history.last_page > 1 && (
                            <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/10">
                                <p className="text-xs text-muted-foreground">
                                    {history.from}–{history.to} of {history.total}
                                </p>
                                <div className="flex items-center gap-1">
                                    {history.links.map((link, i) => (
                                        <button key={i} disabled={!link.url}
                                            onClick={() => link.url && router.get(link.url, {}, { preserveState: true })}
                                            className={cn(
                                                "h-7 min-w-[28px] px-2 text-xs rounded-md border font-medium transition-all",
                                                link.active
                                                    ? "bg-primary text-primary-foreground border-primary"
                                                    : "border-border text-muted-foreground hover:bg-muted disabled:opacity-30"
                                            )}
                                            dangerouslySetInnerHTML={{ __html: link.label }}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

            </div>

            {showOpen && <OpenSessionModal currency={currency} onClose={() => setShowOpen(false)} />}
        </AdminLayout>
    );
}