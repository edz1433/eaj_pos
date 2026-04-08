<?php

namespace App\Http\Controllers;

use App\Models\CashCount;
use App\Models\CashCountDenomination;
use App\Models\CashSession;
use App\Models\ActivityLog;
use Illuminate\Http\Request;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;
use Illuminate\Support\Facades\DB;

class CashCountController extends Controller
{
    public function index(): Response
    {
        $user = Auth::user();
        $branchId = $user->branch_id;

        $openSessions = CashSession::where('branch_id', $branchId)
            ->where('status', 'open')
            ->orderBy('opened_at', 'desc')
            ->get()
            ->map(fn ($s) => [
                'id'             => $s->id,
                'session_number' => $s->session_number,
                'opened_at'      => $s->opened_at?->toIso8601String(),
                'expected_cash'  => $s->computeExpectedCash(),
            ]);

        $cashCounts = CashCount::with(['cashSession', 'denominations'])
            ->whereHas('cashSession', fn($q) => $q->where('branch_id', $branchId))
            ->latest()
            ->paginate(15);

        return Inertia::render('CashCounts/Index', [
            'open_sessions' => $openSessions,
            'cash_counts'   => $cashCounts,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $user = Auth::user();

        $validated = $request->validate([
            'cash_session_id' => ['required', 'exists:cash_sessions,id'],
            'count_type'      => ['required', 'in:closing,midshift'],
            'denominations'   => ['required', 'array'],
            'denominations.*.denomination' => ['required', 'numeric'],
            'denominations.*.quantity'     => ['required', 'integer', 'min:0'],
            'notes'           => ['nullable', 'string', 'max:1000'],
        ]);

        // Verify session belongs to user's branch
        $session = CashSession::where('id', $validated['cash_session_id'])
            ->where('branch_id', $user->branch_id)
            ->firstOrFail();

        // Pre-compute values from the session so over/short is accurate
        $session->loadMissing(['sales', 'expenses.pettyCashVoucher']);
        $expectedCash = $session->computeExpectedCash();
        $systemTotal  = (float) $session->sales()
            ->where('payment_method', 'cash')
            ->where('status', '!=', 'voided')
            ->sum('total');

        DB::beginTransaction();

        try {
            // Create or update the cash count record
            $cashCount = CashCount::updateOrCreate(
                [
                    'cash_session_id' => $validated['cash_session_id'],
                    'count_type'      => $validated['count_type'],
                ],
                [
                    'counted_by'    => $user->id,
                    'opening_cash'  => (float) $session->opening_cash,
                    'expected_cash' => $expectedCash,
                    'system_total'  => $systemTotal,
                    'counted_at'    => now(),
                    'notes'         => $validated['notes'] ?? null,
                ]
            );

            // Clear previous denominations for this count to avoid duplicate key error
            CashCountDenomination::where('cash_count_id', $cashCount->id)->delete();

            // Insert new denominations (unique per denomination)
            $denominationData = [];
            foreach ($validated['denominations'] as $denom) {
                if ($denom['quantity'] > 0) {
                    $denominationData[] = [
                        'cash_count_id' => $cashCount->id,
                        'denomination'  => (float) $denom['denomination'],
                        'quantity'      => (int) $denom['quantity'],
                        'subtotal'      => (float) $denom['denomination'] * (int) $denom['quantity'],
                        'type'          => (float) $denom['denomination'] >= 1 ? 'bill' : 'coin',
                        'created_at'    => now(),
                        'updated_at'    => now(),
                    ];
                }
            }

            if (!empty($denominationData)) {
                CashCountDenomination::insert($denominationData);
            }

            // Recalculate totals
            $cashCount->recalculate();

            ActivityLog::create([
                'user_id'      => $user->id,
                'action'       => 'cash_count_created',
                'subject_type' => CashCount::class,
                'subject_id'   => $cashCount->id,
                'properties'   => [
                    'session_id'  => $validated['cash_session_id'],
                    'count_type'  => $validated['count_type'],
                    'total_counted' => $cashCount->counted_total,
                ],
            ]);

            DB::commit();

            return back()->with('message', [
                'type' => 'success',
                'text' => "Cash count for session {$session->session_number} saved successfully.",
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            return back()->withErrors(['error' => 'Failed to save cash count: ' . $e->getMessage()]);
        }
    }

    public function show(CashCount $cashCount): Response
    {
        $cashCount->loadMissing('cashSession');
        $this->authorizeBranch($cashCount->cashSession?->branch_id);
        $cashCount->load(['cashSession', 'denominations']);
        return Inertia::render('CashCounts/Show', ['cashCount' => $cashCount]);
    }
}