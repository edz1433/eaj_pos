import { Head, usePage, Link } from "@inertiajs/react";
import AdminLayout from "@/layouts/AdminLayout";
import { routes } from "@/routes";
import { cn } from "@/lib/utils";
import {
    ArrowLeft, Banknote, Smartphone, CreditCard, Tag,
    CheckCircle2, XCircle, AlertTriangle, Clock, Receipt,
} from "lucide-react";
import { formatDistanceStrict } from "date-fns";
import { fmtDate } from "@/lib/date";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Session {
    id: number;
    session_number: string;
    status: "open" | "closed";
    opening_cash: number;
    expected_cash: number | null;
    counted_cash: number | null;
    over_short: number | null;
    over_short_status: "pending" | "balanced" | "over" | "short";
    cashier: string;
    notes: string | null;
    opened_at: string;
    closed_at: string | null;
    formatted_opening_cash: string;
    formatted_expected_cash: string;
    formatted_counted_cash: string;
    formatted_over_short: string;
}

interface Summary {
    total_sales: number;
    total_count: number;
    cash_total: number;
    gcash_total: number;
    card_total: number;
    others_total: number;
    discount_total: number;
    voided_count: number;
}

interface SaleRow {
    id: number;
    receipt_number: string;
    total: number;
    payment_method: string;
    customer_name: string | null;
    status: string;
    created_at: string;
}

interface PageProps {
    session: Session;
    summary: Summary;
    sales: SaleRow[];
    app: { currency: string };
    [key: string]: unknown;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number, currency = "₱") =>
    `${currency}${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const methodMeta: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
    cash:   { icon: Banknote,   color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" },
    gcash:  { icon: Smartphone, color: "text-blue-600 dark:text-blue-400",       bg: "bg-blue-500/10"    },
    card:   { icon: CreditCard, color: "text-purple-600 dark:text-purple-400",   bg: "bg-purple-500/10"  },
    others: { icon: Tag,        color: "text-muted-foreground",                  bg: "bg-muted/30"       },
};

const overShortCls = (s: string) => ({
    balanced: "text-emerald-600 dark:text-emerald-400",
    over:     "text-amber-500",
    short:    "text-destructive",
    pending:  "text-muted-foreground",
}[s] ?? "text-muted-foreground");

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CashSessionsShow() {
    const { session, summary, sales, app } = usePage<PageProps>().props;
    const currency  = app?.currency ?? "₱";
    const isOpen    = session.status === "open";
    const duration  = session.closed_at
        ? formatDistanceStrict(new Date(session.closed_at), new Date(session.opened_at))
        : null;

    const payBreakdown = [
        { key: "cash",   label: "Cash",   val: summary.cash_total   },
        { key: "gcash",  label: "GCash",  val: summary.gcash_total  },
        { key: "card",   label: "Card",   val: summary.card_total   },
        { key: "others", label: "Others", val: summary.others_total },
    ].filter(p => p.val > 0);

    return (
        <AdminLayout>
            <Head title={`Session ${session.session_number}`} />

            <div className="space-y-6 max-w-[1000px] mx-auto">

                {/* Back + header */}
                <div className="flex items-start gap-4">
                    <Link href={routes.cashSessions.index()}
                        className="mt-0.5 h-9 w-9 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0">
                        <ArrowLeft className="h-4 w-4" />
                    </Link>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                            <h1 className="text-xl font-bold text-foreground font-mono">{session.session_number}</h1>
                            <span className={cn("text-[10px] font-bold px-2.5 py-1 rounded-full",
                                isOpen ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                       : "bg-muted text-muted-foreground")}>
                                {isOpen ? "● Open" : "Closed"}
                            </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {session.cashier} · {fmtDate(session.opened_at, "MMMM d, yyyy")}
                            {duration && <span className="ml-1 opacity-60">· {duration}</span>}
                        </p>
                    </div>
                </div>

                {/* Cash reconciliation card */}
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                        { label: "Opening Cash",  val: session.formatted_opening_cash,
                          sub: `Opened ${fmtDate(session.opened_at, "h:mm a")}`, color: "text-foreground" },
                        { label: "Cash Sales",    val: fmt(summary.cash_total, currency),
                          sub: `${summary.total_count} transactions`, color: "text-emerald-600 dark:text-emerald-400" },
                        { label: "Expected Cash", val: session.expected_cash !== null ? session.formatted_expected_cash : fmt(summary.cash_total + session.opening_cash, currency),
                          sub: "Opening + cash sales", color: "text-primary" },
                        { label: "Counted Cash",  val: session.counted_cash !== null ? session.formatted_counted_cash : "—",
                          sub: session.over_short !== null
                                ? (session.over_short === 0 ? "✓ Balanced"
                                  : session.over_short > 0  ? `Over ${session.formatted_over_short}` : `Short ${session.formatted_over_short}`)
                                : "Not yet counted",
                          color: session.over_short !== null ? overShortCls(session.over_short_status) : "text-muted-foreground" },
                    ].map(c => (
                        <div key={c.label} className="bg-card border border-border rounded-2xl p-5">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">{c.label}</p>
                            <p className={cn("text-2xl font-black tabular-nums", c.color)}>{c.val}</p>
                            <p className="text-xs text-muted-foreground mt-1">{c.sub}</p>
                        </div>
                    ))}
                </div>

                {/* Over/short alert */}
                {session.over_short !== null && session.over_short !== 0 && (
                    <div className={cn("flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium",
                        session.over_short_status === "over"
                            ? "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400"
                            : "bg-destructive/10 border-destructive/30 text-destructive")}>
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <span>
                            {session.over_short_status === "over"
                                ? `Session is over by ${session.formatted_over_short}`
                                : `Session is short by ${session.formatted_over_short}`}
                            {session.notes && <span className="ml-2 opacity-70 font-normal">· {session.notes}</span>}
                        </span>
                    </div>
                )}

                {/* Payment breakdown */}
                {payBreakdown.length > 0 && (
                    <div>
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Payment Breakdown</p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {payBreakdown.map(p => {
                                const meta = methodMeta[p.key] ?? methodMeta.others;
                                const Icon = meta.icon;
                                return (
                                    <div key={p.key} className={cn("rounded-2xl p-4 flex items-center gap-3", meta.bg)}>
                                        <Icon className={cn("h-5 w-5 shrink-0", meta.color)} />
                                        <div>
                                            <p className="text-[11px] text-muted-foreground">{p.label}</p>
                                            <p className={cn("text-base font-black tabular-nums", meta.color)}>{fmt(p.val, currency)}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        {summary.discount_total > 0 && (
                            <p className="text-xs text-muted-foreground mt-2">
                                Total discounts given: <span className="font-medium text-foreground">{fmt(summary.discount_total, currency)}</span>
                                {summary.voided_count > 0 && <span className="ml-3">{summary.voided_count} voided transaction{summary.voided_count > 1 ? "s" : ""}</span>}
                            </p>
                        )}
                    </div>
                )}

                {/* Sales list */}
                <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">
                        Transactions ({summary.total_count})
                    </p>
                    <div className="bg-card border border-border rounded-xl overflow-hidden">
                        {sales.length === 0 ? (
                            <div className="py-12 text-center text-muted-foreground">
                                <Receipt className="h-8 w-8 mx-auto mb-2 opacity-20" />
                                <p className="text-sm">No transactions in this session</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-border bg-muted/30">
                                            <th className="px-4 py-3 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Receipt</th>
                                            <th className="px-4 py-3 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-widest hidden sm:table-cell">Customer</th>
                                            <th className="px-4 py-3 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-widest hidden md:table-cell">Time</th>
                                            <th className="px-4 py-3 text-center text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Method</th>
                                            <th className="px-4 py-3 text-right text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Total</th>
                                            <th className="px-4 py-3 text-center text-[10px] font-bold text-muted-foreground uppercase tracking-widest hidden sm:table-cell">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {sales.map(s => {
                                            const meta    = methodMeta[s.payment_method] ?? methodMeta.others;
                                            const Icon    = meta.icon;
                                            const isVoided = s.status === "voided";
                                            return (
                                                <tr key={s.id} className={cn("hover:bg-muted/20 transition-colors", isVoided && "opacity-50")}>
                                                    <td className="px-4 py-3">
                                                        <p className="font-mono text-xs font-semibold text-foreground">{s.receipt_number}</p>
                                                    </td>
                                                    <td className="px-4 py-3 hidden sm:table-cell text-sm text-muted-foreground">
                                                        {s.customer_name ?? "Walk-in"}
                                                    </td>
                                                    <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">
                                                        {fmtDate(s.created_at, "h:mm a")}
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <div className="flex items-center justify-center gap-1">
                                                            <Icon className={cn("h-3.5 w-3.5", meta.color)} />
                                                            <span className={cn("text-xs font-medium capitalize", meta.color)}>{s.payment_method}</span>
                                                        </div>
                                                    </td>
                                                    <td className={cn("px-4 py-3 text-right tabular-nums font-bold", isVoided ? "line-through text-muted-foreground" : "text-foreground")}>
                                                        {fmt(s.total, currency)}
                                                    </td>
                                                    <td className="px-4 py-3 text-center hidden sm:table-cell">
                                                        <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full",
                                                            isVoided ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400")}>
                                                            {isVoided ? "Voided" : "Paid"}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>

                                    {/* Footer totals */}
                                    <tfoot className="border-t-2 border-border">
                                        <tr className="bg-primary/5">
                                            <td colSpan={4} className="px-4 py-3 font-bold text-sm text-foreground">Total Sales</td>
                                            <td className="px-4 py-3 text-right font-black text-primary text-base tabular-nums">
                                                {fmt(summary.total_sales, currency)}
                                            </td>
                                            <td className="hidden sm:table-cell" />
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                {/* Session notes */}
                {session.notes && (
                    <div className="bg-muted/20 border border-border rounded-xl px-4 py-3">
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">Notes</p>
                        <p className="text-sm text-foreground">{session.notes}</p>
                    </div>
                )}

            </div>
        </AdminLayout>
    );
}