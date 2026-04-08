"use client";

import { useState } from "react";
import { Head, router, usePage } from "@inertiajs/react";
import AdminLayout from "@/Layouts/AdminLayout";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

import { Plus, Minus, Calculator, CheckCircle2, AlertTriangle, DollarSign } from "lucide-react";

interface CashCount {
    id: number;
    cash_session_id: number;
    count_type: string;
    system_total: number;
    expected_cash: number;
    counted_total: number;
    over_short: number;
    notes?: string;
    created_at: string;
    cashSession?: {
        session_number: string;
        opened_at: string;
    };
}

interface Denomination {
    denomination: number;
    quantity: number;
    subtotal: number;
    type: 'bill' | 'coin';
}

const COMMON_BILLS = [1000, 500, 200, 100, 50, 20];
const COMMON_COINS = [20, 10, 5, 1, 0.25, 0.10, 0.05];

// Helper to format currency with thousands commas for display only
const formatCurrency = (amount: number): string => {
    return amount.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
};

export default function CashCountsIndex() {
    const { cash_counts, open_sessions } = usePage().props as any;

    const [selectedSession, setSelectedSession] = useState<number | null>(null);
    const [countType, setCountType] = useState<"closing" | "midshift">("closing");
    const [notes, setNotes] = useState("");

    const [denominations, setDenominations] = useState<Denomination[]>([
        ...COMMON_BILLS.map(d => ({ denomination: d, quantity: 0, subtotal: 0, type: 'bill' as const })),
        ...COMMON_COINS.map(d => ({ denomination: d, quantity: 0, subtotal: 0, type: 'coin' as const })),
    ]);

    const totalCounted = denominations.reduce((sum, d) => sum + d.subtotal, 0);

    const selectedSessionData = open_sessions.find((s: any) => s.id === selectedSession);
    const expectedCash = selectedSessionData?.expected_cash || 0;
    const overShort = totalCounted - expectedCash;

    const updateQuantity = (index: number, change: number) => {
        const newDenoms = [...denominations];
        const newQty = Math.max(0, newDenoms[index].quantity + change);
        newDenoms[index].quantity = newQty;
        newDenoms[index].subtotal = newDenoms[index].denomination * newQty;
        setDenominations(newDenoms);
    };

    const quickAdd = (denom: number, qty: number) => {
        const index = denominations.findIndex(d => d.denomination === denom);
        if (index !== -1) {
            updateQuantity(index, qty);
        }
    };

    const resetCount = () => {
        setDenominations(denominations.map(d => ({ ...d, quantity: 0, subtotal: 0 })));
        setNotes("");
    };

    const handleSubmit = () => {
        if (!selectedSession) return;

        const payloadDenoms = denominations
            .filter(d => d.quantity > 0)
            .map(d => ({
                denomination: d.denomination,
                quantity: d.quantity,
            }));

        router.post("/cash-counts", {
            cash_session_id: selectedSession,
            count_type: countType,
            denominations: payloadDenoms,
            notes,
        }, {
            onSuccess: () => resetCount(),
        });
    };

    return (
        <AdminLayout>
            <Head title="Cash Counts" />

            <div className="max-w-7xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold tracking-tight">Cash Counts</h1>
                    <p className="text-muted-foreground">Count bills and coins for the selected session</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                    {/* LEFT SIDE: New Cash Count Form */}
                    <div className="lg:col-span-3">
                        <Card className="shadow-lg h-full">
                            <CardHeader>
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                                        <DollarSign className="h-5 w-5 text-primary" />
                                    </div>
                                    <div>
                                        <CardTitle>New Cash Count</CardTitle>
                                        <CardDescription>Count bills and coins for the selected session</CardDescription>
                                    </div>
                                </div>
                            </CardHeader>

                            <CardContent className="space-y-8">
                                {/* Session & Type */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <Label>Open Cash Session</Label>
                                        <Select 
                                            value={selectedSession?.toString() || ""} 
                                            onValueChange={(v) => setSelectedSession(Number(v))}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select an open session" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {open_sessions.map((s: any) => (
                                                    <SelectItem key={s.id} value={s.id.toString()}>
                                                        {s.session_number} — {new Date(s.opened_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Count Type</Label>
                                        <Select value={countType} onValueChange={(v: "closing" | "midshift") => setCountType(v)}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="closing">Closing Count</SelectItem>
                                                <SelectItem value="midshift">Mid-shift Count</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <Separator />

                                {/* Compact Denomination Rows */}
                                <div className="space-y-3">
                                    <Label className="text-lg font-medium">Denominations</Label>
                                    
                                    {denominations.map((denom, index) => (
                                        <div 
                                            key={index} 
                                            className="flex items-center justify-between bg-muted/50 rounded-xl px-5 py-4 hover:bg-muted transition-colors"
                                        >
                                            {/* Left: Denomination */}
                                            <div className="flex items-center gap-4">
                                                <div className="w-14 text-right">
                                                    <span className="text-2xl font-semibold tabular-nums">₱{denom.denomination}</span>
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                    {denom.type === 'bill' ? 'Bill' : 'Coin'}
                                                </div>
                                            </div>

                                            {/* Center: Current Count */}
                                            <div className="text-center min-w-[80px]">
                                                <div className="text-2xl font-mono font-bold tabular-nums">
                                                    {denom.quantity}
                                                </div>
                                                <div className="text-xs text-muted-foreground">pcs</div>
                                            </div>

                                            {/* Right: +/- Buttons + Subtotal */}
                                            <div className="flex items-center gap-3">
                                                <Button
                                                    variant="outline"
                                                    size="icon"
                                                    className="h-9 w-9"
                                                    onClick={() => updateQuantity(index, -1)}
                                                    disabled={denom.quantity === 0}
                                                >
                                                    <Minus className="h-4 w-4" />
                                                </Button>

                                                <Button
                                                    variant="outline"
                                                    size="icon"
                                                    className="h-9 w-9"
                                                    onClick={() => updateQuantity(index, 1)}
                                                >
                                                    <Plus className="h-4 w-4" />
                                                </Button>

                                                <div className="min-w-[100px] text-right font-mono text-sm font-medium">
                                                    ₱{denom.subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Running Total */}
                                <div className="bg-card border-2 border-primary/30 rounded-2xl p-6">
                                    <div className="flex justify-between items-end">
                                        <div>
                                            <div className="text-sm text-muted-foreground">TOTAL COUNTED</div>
                                            <div className="text-5xl font-mono font-bold tracking-tighter text-primary">
                                                ₱{totalCounted.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                            </div>
                                        </div>

                                        {selectedSession && (
                                            <div className="text-right">
                                                <div className="text-sm text-muted-foreground">EXPECTED</div>
                                                <div className="text-3xl font-mono">
                                                    ₱{expectedCash.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                                </div>
                                                <div className={`text-xl font-semibold mt-1 ${overShort >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                    {overShort >= 0 ? '+' : ''}₱{Math.abs(overShort).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Notes */}
                                <div className="space-y-2">
                                    <Label>Notes / Observations</Label>
                                    <Input
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        placeholder="Discrepancies, remarks, or special notes..."
                                    />
                                </div>

                                {/* Action Buttons */}
                                <div className="flex gap-4 pt-4">
                                    <Button 
                                        onClick={resetCount} 
                                        variant="outline" 
                                        className="flex-1 h-12"
                                    >
                                        Clear All
                                    </Button>
                                    <Button 
                                        onClick={handleSubmit} 
                                        disabled={!selectedSession || totalCounted === 0}
                                        className="flex-1 h-12 text-lg"
                                    >
                                        <Calculator className="mr-2 h-5 w-5" />
                                        Save Cash Count
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* RIGHT SIDE: Recent Cash Counts */}
                    <div className="lg:col-span-2">
                        <Card className="h-full shadow-lg">
                            <CardHeader>
                                <CardTitle>Recent Cash Counts</CardTitle>
                                <CardDescription>History of previous counts</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4 max-h-[700px] overflow-y-auto pr-2">
                                    {cash_counts.data.length === 0 ? (
                                        <div className="text-center py-12 text-muted-foreground">
                                            No cash counts recorded yet.
                                        </div>
                                    ) : (
                                        cash_counts.data.map((count: CashCount) => (
                                            <div 
                                                key={count.id} 
                                                className="flex items-center justify-between p-5 border rounded-2xl hover:bg-muted/50 transition-all"
                                            >
                                                <div>
                                                    <div className="font-medium">{count.cashSession?.session_number}</div>
                                                    <div className="text-sm text-muted-foreground">
                                                        {new Date(count.created_at).toLocaleDateString("en-PH", { timeZone: "Asia/Manila" })} • {count.count_type}
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="font-mono text-lg">
                                                        ₱{count.counted_total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                                    </div>
                                                    <Badge 
                                                        variant={count.over_short === 0 ? "success" : count.over_short > 0 ? "default" : "destructive"}
                                                    >
                                                        {count.over_short === 0 
                                                            ? "Balanced" 
                                                            : count.over_short > 0 
                                                                ? `+₱${count.over_short.toLocaleString('en-US', { minimumFractionDigits: 2 })}` 
                                                                : `-₱${Math.abs(count.over_short).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                                                        }
                                                    </Badge>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
}