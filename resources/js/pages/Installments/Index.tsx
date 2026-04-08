import { useState } from "react";
import { Head, Link, router, usePage } from "@inertiajs/react";
import AdminLayout from "@/layouts/AdminLayout";
import { cn } from "@/lib/utils";
import {
    CalendarClock, Phone, User, CheckCircle2, AlertTriangle,
    XCircle, ChevronRight, Clock, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Sale {
    id: number;
    receipt_number: string;
    created_at: string;
}

interface Cashier {
    id: number;
    fname: string;
    lname: string;
}

interface Plan {
    id: number;
    sale: Sale;
    user: Cashier;
    customer_name: string;
    customer_phone: string | null;
    total_amount: string;
    down_payment: string;
    balance: string;
    installment_amount: string;
    total_paid: string;
    installments_count: number;
    paid_count: number;
    interval: string;
    next_due_date: string | null;
    status: "active" | "completed" | "cancelled";
    notes: string | null;
    created_at: string;
}

interface PageProps {
    plans: {
        data: Plan[];
        current_page: number;
        last_page: number;
        per_page: number;
        total: number;
        links: { url: string | null; label: string; active: boolean }[];
    };
    counts: { active: number; completed: number; cancelled: number; overdue: number };
    filters: { status: string };
    app: { currency: string };
    [key: string]: unknown;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMoney(v: number | string, currency = "₱") {
    return currency + Number(v).toLocaleString("en-PH", { minimumFractionDigits: 2 });
}

function fmtDate(s: string | null) {
    if (!s) return "—";
    return new Date(s).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

function intervalLabel(v: string) {
    if (v === "biweekly") return "Bi-weekly";
    if (v === "weekly")   return "Weekly";
    return "Monthly";
}

function StatusBadge({ status, overdue }: { status: Plan["status"]; overdue?: boolean }) {
    if (status === "completed") return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-green-600 dark:text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-full">
            <CheckCircle2 className="h-3 w-3" /> Paid
        </span>
    );
    if (status === "cancelled") return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground bg-muted border border-border px-2 py-0.5 rounded-full">
            <XCircle className="h-3 w-3" /> Cancelled
        </span>
    );
    if (overdue) return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full">
            <AlertTriangle className="h-3 w-3" /> Overdue
        </span>
    );
    return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">
            <Clock className="h-3 w-3" /> Active
        </span>
    );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InstallmentsIndex() {
    const { plans, counts, filters, app } = usePage<PageProps>().props;
    const [statusFilter, setStatusFilter] = useState(filters.status ?? "active");
    const currency = app.currency ?? "₱";

    const applyFilter = (s: string) => {
        setStatusFilter(s);
        router.get("/installments", { status: s }, { preserveState: true, replace: true });
    };

    const tabs = [
        { value: "active",    label: "Active",    count: counts.active    },
        { value: "completed", label: "Completed", count: counts.completed },
        { value: "cancelled", label: "Cancelled", count: counts.cancelled },
        { value: "all",       label: "All",       count: counts.active + counts.completed + counts.cancelled },
    ];

    return (
        <AdminLayout>
            <Head title="Installments" />
            <div className="space-y-5">

                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
                            <CalendarClock className="h-5 w-5 text-primary" /> Installment Plans
                        </h1>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            Track and collect installment payments from customers.
                        </p>
                    </div>

                    {counts.overdue > 0 && (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm font-medium">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            {counts.overdue} overdue plan{counts.overdue > 1 ? "s" : ""}
                        </div>
                    )}
                </div>

                {/* Tabs */}
                <div className="flex gap-1 border-b border-border">
                    {tabs.map(t => (
                        <button key={t.value} onClick={() => applyFilter(t.value)}
                            className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                                statusFilter === t.value
                                    ? "border-primary text-primary"
                                    : "border-transparent text-muted-foreground hover:text-foreground")}>
                            {t.label}
                            <span className={cn("ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                                statusFilter === t.value ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                                {t.count}
                            </span>
                        </button>
                    ))}
                </div>

                {/* Plans list */}
                {plans.data.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <CalendarClock className="h-12 w-12 text-muted-foreground/30 mb-4" />
                        <p className="text-muted-foreground font-medium">No installment plans found</p>
                        <p className="text-sm text-muted-foreground/60 mt-1">
                            Installment plans are created at the POS when a customer pays via installment.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {plans.data.map(plan => {
                            const remaining  = Math.max(0, parseFloat(plan.balance) - parseFloat(plan.total_paid));
                            const paidPct    = plan.balance > "0"
                                ? Math.min(100, (parseFloat(plan.total_paid) / parseFloat(plan.balance)) * 100)
                                : 100;
                            const isOverdue  = plan.status === "active" && !!plan.next_due_date
                                && new Date(plan.next_due_date) < new Date();

                            return (
                                <Link key={plan.id} href={`/installments/${plan.id}`}
                                    className="block bg-card border border-border rounded-2xl p-4 hover:border-primary/40 hover:bg-accent/30 transition-all group">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-semibold text-foreground">{plan.customer_name}</span>
                                                <StatusBadge status={plan.status} overdue={isOverdue} />
                                            </div>
                                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                                                {plan.customer_phone && (
                                                    <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{plan.customer_phone}</span>
                                                )}
                                                <span className="flex items-center gap-1">
                                                    <RefreshCw className="h-3 w-3" />{plan.paid_count}/{plan.installments_count} · {intervalLabel(plan.interval)}
                                                </span>
                                                {plan.next_due_date && plan.status === "active" && (
                                                    <span className={cn("flex items-center gap-1", isOverdue && "text-red-500 dark:text-red-400 font-medium")}>
                                                        <Clock className="h-3 w-3" />Due {fmtDate(plan.next_due_date)}
                                                    </span>
                                                )}
                                                <span className="font-mono text-[10px] opacity-60">#{plan.sale?.receipt_number}</span>
                                            </div>

                                            {/* Progress bar */}
                                            <div className="mt-2.5">
                                                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                                    <div className={cn("h-full rounded-full transition-all",
                                                        plan.status === "completed" ? "bg-green-500" : isOverdue ? "bg-red-500" : "bg-primary")}
                                                        style={{ width: `${paidPct}%` }} />
                                                </div>
                                                <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                                                    <span>Paid {fmtMoney(plan.total_paid, currency)}</span>
                                                    <span>Remaining {fmtMoney(remaining, currency)}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex flex-col items-end gap-1 shrink-0">
                                            <p className="text-base font-bold text-foreground">{fmtMoney(plan.total_amount, currency)}</p>
                                            <p className="text-xs text-muted-foreground">{fmtMoney(plan.installment_amount, currency)}/{intervalLabel(plan.interval).toLowerCase()}</p>
                                            <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary mt-1 transition-colors" />
                                        </div>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}

                {/* Pagination */}
                {plans.last_page > 1 && (
                    <div className="flex justify-center gap-1 pt-2">
                        {plans.links.map((link, i) => (
                            <button key={i} disabled={!link.url || link.active}
                                onClick={() => link.url && router.get(link.url, {}, { preserveState: true })}
                                className={cn("px-3 py-1.5 text-sm rounded-lg transition-colors",
                                    link.active ? "bg-primary text-primary-foreground font-semibold"
                                        : link.url ? "hover:bg-accent text-foreground" : "text-muted-foreground cursor-default")}
                                dangerouslySetInnerHTML={{ __html: link.label }} />
                        ))}
                    </div>
                )}

            </div>
        </AdminLayout>
    );
}
