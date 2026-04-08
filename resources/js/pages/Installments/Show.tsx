import { useState } from "react";
import { Head, Link, router, usePage } from "@inertiajs/react";
import AdminLayout from "@/layouts/AdminLayout";
import { cn } from "@/lib/utils";
import {
    CalendarClock, Phone, User, CheckCircle2, AlertTriangle,
    XCircle, Clock, ArrowLeft, Banknote, Smartphone, CreditCard,
    Plus, RefreshCw, Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Payment {
    id: number;
    sequence: number;
    amount: string;
    payment_date: string;
    payment_method: string;
    notes: string | null;
    receiver: { id: number; fname: string; lname: string } | null;
    created_at: string;
}

interface Plan {
    id: number;
    sale: { id: number; receipt_number: string; created_at: string; total: string; payment_method: string };
    user: { id: number; fname: string; lname: string };
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
    payments: Payment[];
}

interface PageProps {
    plan: Plan;
    app: { currency: string };
    flash?: { message?: { type: string; text: string } | null };
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

function PayMethodIcon({ method }: { method: string }) {
    if (method === "gcash") return <Smartphone className="h-3.5 w-3.5" />;
    if (method === "card")  return <CreditCard className="h-3.5 w-3.5" />;
    return <Banknote className="h-3.5 w-3.5" />;
}

// ── Record Payment Modal ──────────────────────────────────────────────────────

function RecordPaymentModal({ plan, currency, onClose }: { plan: Plan; currency: string; onClose: () => void }) {
    const remaining = Math.max(0, parseFloat(plan.balance) - parseFloat(plan.total_paid));
    const [amount,  setAmount]  = useState(Math.min(parseFloat(plan.installment_amount), remaining).toFixed(2));
    const [date,    setDate]    = useState(new Date().toISOString().slice(0, 10));
    const [method,  setMethod]  = useState<"cash" | "gcash" | "card">("cash");
    const [notes,   setNotes]   = useState("");
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState("");

    const amtN = parseFloat(amount) || 0;
    const canSubmit = amtN > 0 && amtN <= remaining + 0.01 && date;

    const submit = () => {
        if (!canSubmit) return;
        setLoading(true); setError("");
        router.post(`/installments/${plan.id}/pay`, {
            amount, payment_date: date, payment_method: method, notes: notes || null,
        }, {
            preserveScroll: true,
            onSuccess: () => { setLoading(false); onClose(); },
            onError: (errs) => { setError(Object.values(errs)[0] as string ?? "Failed to record payment."); setLoading(false); },
        });
    };

    const PMETHODS = [
        { value: "cash" as const,  label: "Cash",  icon: Banknote    },
        { value: "gcash" as const, label: "GCash", icon: Smartphone  },
        { value: "card" as const,  label: "Card",  icon: CreditCard  },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm shadow-2xl">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                    <p className="font-bold">Record Payment</p>
                    <button onClick={onClose} className="p-1 rounded-md hover:bg-muted text-muted-foreground">✕</button>
                </div>
                <div className="p-5 space-y-4">

                    {/* Remaining balance */}
                    <div className="bg-muted/30 rounded-xl p-3 text-center">
                        <p className="text-xs text-muted-foreground">Remaining balance</p>
                        <p className="text-2xl font-black text-foreground">{fmtMoney(remaining, currency)}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Suggested: {fmtMoney(parseFloat(plan.installment_amount), currency)} / {intervalLabel(plan.interval).toLowerCase()}
                        </p>
                    </div>

                    {/* Amount */}
                    <div>
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1.5">Amount</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{currency}</span>
                            <input value={amount} onChange={e => setAmount(e.target.value)}
                                type="number" min="0.01" max={remaining + 0.01} step="0.01"
                                className="w-full h-11 pl-8 pr-3 text-sm bg-background border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-primary text-foreground" />
                        </div>
                        <div className="flex gap-2 mt-1.5">
                            <button onClick={() => setAmount(Math.min(parseFloat(plan.installment_amount), remaining).toFixed(2))}
                                className="text-[10px] text-primary hover:underline">Suggested amount</button>
                            <button onClick={() => setAmount(remaining.toFixed(2))}
                                className="text-[10px] text-primary hover:underline">Full balance</button>
                        </div>
                    </div>

                    {/* Date */}
                    <div>
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1.5">Payment Date</label>
                        <input type="date" value={date} onChange={e => setDate(e.target.value)}
                            className="w-full h-11 px-3 text-sm bg-background border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-primary text-foreground" />
                    </div>

                    {/* Payment method */}
                    <div>
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1.5">Payment Method</label>
                        <div className="grid grid-cols-3 gap-1.5">
                            {PMETHODS.map(m => { const Icon = m.icon; return (
                                <button key={m.value} onClick={() => setMethod(m.value)}
                                    className={cn("flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-semibold transition-all",
                                        method === m.value ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/40 hover:bg-accent text-foreground")}>
                                    <Icon className="h-4 w-4" />{m.label}
                                </button>
                            ); })}
                        </div>
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1.5">Notes (optional)</label>
                        <input value={notes} onChange={e => setNotes(e.target.value)}
                            placeholder="Optional note…"
                            className="w-full h-9 px-3 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground" />
                    </div>

                    {error && <p className="text-xs text-destructive flex items-center gap-1.5"><AlertTriangle className="h-3 w-3" />{error}</p>}
                </div>
                <div className="px-5 pb-5">
                    <Button className="w-full h-11 font-bold gap-2" disabled={!canSubmit || loading} onClick={submit}>
                        {loading ? <span className="h-4 w-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" /> : <><Plus className="h-4 w-4" />Record {fmtMoney(amtN, currency)}</>}
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function InstallmentsShow() {
    const { plan, app } = usePage<PageProps>().props;
    const currency  = app.currency ?? "₱";
    const [showPay, setShowPay] = useState(false);

    const remaining = Math.max(0, parseFloat(plan.balance) - parseFloat(plan.total_paid));
    const paidPct   = plan.balance > "0"
        ? Math.min(100, (parseFloat(plan.total_paid) / parseFloat(plan.balance)) * 100)
        : 100;
    const isOverdue = plan.status === "active" && !!plan.next_due_date
        && new Date(plan.next_due_date) < new Date();

    const handleCancel = () => {
        if (!confirm("Cancel this installment plan? This cannot be undone.")) return;
        router.post(`/installments/${plan.id}/cancel`, {}, { preserveScroll: true });
    };

    return (
        <AdminLayout>
            <Head title={`Installment — ${plan.customer_name}`} />
            <div className="max-w-2xl mx-auto space-y-5">

                {/* Back */}
                <Link href="/installments" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                    <ArrowLeft className="h-4 w-4" /> Back to Installments
                </Link>

                {/* Summary card */}
                <div className="bg-card border border-border rounded-2xl overflow-hidden">

                    {/* Header */}
                    <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3">
                        <div>
                            <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
                                <User className="h-4 w-4 text-muted-foreground" />
                                {plan.customer_name}
                            </h1>
                            {plan.customer_phone && (
                                <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                                    <Phone className="h-3.5 w-3.5" />{plan.customer_phone}
                                </p>
                            )}
                        </div>

                        <div className="flex flex-col items-end gap-2">
                            {plan.status === "completed" ? (
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-green-600 dark:text-green-400 bg-green-500/10 border border-green-500/20 px-2.5 py-1 rounded-full">
                                    <CheckCircle2 className="h-3.5 w-3.5" /> Fully Paid
                                </span>
                            ) : plan.status === "cancelled" ? (
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground bg-muted border border-border px-2.5 py-1 rounded-full">
                                    <XCircle className="h-3.5 w-3.5" /> Cancelled
                                </span>
                            ) : isOverdue ? (
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-1 rounded-full">
                                    <AlertTriangle className="h-3.5 w-3.5" /> Overdue
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-primary bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-full">
                                    <Clock className="h-3.5 w-3.5" /> Active
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Details grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-border">
                        {[
                            { label: "Total Amount",    value: fmtMoney(plan.total_amount, currency) },
                            { label: "Down Payment",    value: fmtMoney(plan.down_payment, currency) },
                            { label: "Balance",         value: fmtMoney(plan.balance, currency) },
                            { label: "Per Installment", value: fmtMoney(plan.installment_amount, currency) },
                            { label: "Interval",        value: intervalLabel(plan.interval) },
                            { label: "Payments",        value: `${plan.paid_count} of ${plan.installments_count}` },
                        ].map(d => (
                            <div key={d.label} className="bg-card px-4 py-3">
                                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{d.label}</p>
                                <p className="text-sm font-bold text-foreground mt-0.5">{d.value}</p>
                            </div>
                        ))}
                    </div>

                    {/* Progress */}
                    <div className="px-5 py-4 border-t border-border">
                        <div className="flex justify-between text-sm mb-2">
                            <span className="text-muted-foreground">Total paid</span>
                            <span className="font-bold text-foreground">{fmtMoney(plan.total_paid, currency)} / {fmtMoney(plan.balance, currency)}</span>
                        </div>
                        <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                            <div className={cn("h-full rounded-full transition-all",
                                plan.status === "completed" ? "bg-green-500" : isOverdue ? "bg-red-500" : "bg-primary")}
                                style={{ width: `${paidPct}%` }} />
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground mt-1.5">
                            <span>{Math.round(paidPct)}% paid</span>
                            <span>Remaining {fmtMoney(remaining, currency)}</span>
                        </div>

                        {plan.next_due_date && plan.status === "active" && (
                            <p className={cn("text-sm mt-3 flex items-center gap-1.5 font-medium",
                                isOverdue ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                                <Clock className="h-4 w-4 shrink-0" />
                                {isOverdue ? "Was due" : "Next payment due"}: {fmtDate(plan.next_due_date)}
                            </p>
                        )}
                    </div>

                    {/* Sale reference + notes */}
                    <div className="px-5 pb-4 flex items-center justify-between gap-3">
                        <Link href={`/pos/${plan.sale?.id}`}
                            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
                            <Receipt className="h-3.5 w-3.5" />
                            Receipt #{plan.sale?.receipt_number}
                        </Link>
                        {plan.notes && (
                            <p className="text-xs text-muted-foreground italic truncate max-w-[60%]">"{plan.notes}"</p>
                        )}
                    </div>
                </div>

                {/* Action buttons */}
                {plan.status === "active" && (
                    <div className="flex gap-2">
                        <Button className="flex-1 h-11 gap-2 font-semibold" onClick={() => setShowPay(true)}>
                            <Plus className="h-4 w-4" /> Record Payment
                        </Button>
                        <Button variant="outline" size="default" className="h-11 text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10" onClick={handleCancel}>
                            Cancel Plan
                        </Button>
                    </div>
                )}

                {/* Payment history */}
                <div className="space-y-2">
                    <h2 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                        <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" /> Payment History
                    </h2>

                    {/* Down payment (always shown if > 0) */}
                    {parseFloat(plan.down_payment) > 0 && (
                        <div className="bg-card border border-border rounded-xl p-3.5">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <div className="p-1.5 rounded-lg bg-primary/10">
                                        <Banknote className="h-3.5 w-3.5 text-primary" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-foreground">Down Payment</p>
                                        <p className="text-xs text-muted-foreground">{fmtDate(plan.created_at)} · At POS</p>
                                    </div>
                                </div>
                                <p className="font-bold text-foreground">{fmtMoney(plan.down_payment, currency)}</p>
                            </div>
                        </div>
                    )}

                    {plan.payments.length === 0 && parseFloat(plan.down_payment) === 0 && (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                            No payments recorded yet.
                        </div>
                    )}

                    {plan.payments.map(p => (
                        <div key={p.id} className="bg-card border border-border rounded-xl p-3.5">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <div className="p-1.5 rounded-lg bg-muted">
                                        <PayMethodIcon method={p.payment_method} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-foreground">
                                            Payment #{p.sequence}
                                            <span className="text-xs font-normal text-muted-foreground ml-1.5 capitalize">{p.payment_method}</span>
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {fmtDate(p.payment_date)}
                                            {p.receiver && ` · ${p.receiver.fname} ${p.receiver.lname}`}
                                        </p>
                                        {p.notes && <p className="text-xs text-muted-foreground/70 italic mt-0.5">"{p.notes}"</p>}
                                    </div>
                                </div>
                                <p className="font-bold text-foreground">{fmtMoney(p.amount, currency)}</p>
                            </div>
                        </div>
                    ))}
                </div>

            </div>

            {showPay && <RecordPaymentModal plan={plan} currency={currency} onClose={() => setShowPay(false)} />}
        </AdminLayout>
    );
}
