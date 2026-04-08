<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\CashSession;
use App\Models\SystemSetting;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

class CashSessionController extends Controller
{
    // ─── Index ────────────────────────────────────────────────────────────────

    public function index(): Response
    {
        $user     = Auth::user();
        $branchId = $user->branch_id;
        $isAdmin  = $user->isAdmin();

        // Currently open session for this branch
        $openSession = CashSession::with(['user:id,fname,lname'])
            ->where('branch_id', $branchId)
            ->open()
            ->latest()
            ->first();

        // Session history — latest first, paginated
        $history = CashSession::with(['user:id,fname,lname'])
            ->where('branch_id', $branchId)
            ->orderByDesc('opened_at')
            ->paginate(20)
            ->withQueryString();

        $requireCount   = (bool)  SystemSetting::get('cash.require_count_on_close', $branchId, true);
        $overShortAlert = (float) SystemSetting::get('cash.over_short_alert',        $branchId, 100);

        return Inertia::render('CashSessions/Index', [
            'open_session'     => $openSession ? $this->mapSession($openSession, full: true) : null,
            'history'          => $history->through(fn ($s) => $this->mapSession($s)),
            'require_count'    => $requireCount,
            'over_short_alert' => $overShortAlert,
            'is_admin'         => $isAdmin,
        ]);
    }

    // ─── Open session ─────────────────────────────────────────────────────────

    public function open(Request $request): RedirectResponse
    {
        $user     = Auth::user();
        $branchId = $user->branch_id;

        if (! $branchId) {
            return back()->withErrors(['error' => 'No branch assigned to your account.']);
        }

        // One open session per branch at a time
        if (CashSession::where('branch_id', $branchId)->open()->exists()) {
            return back()->withErrors(['error' => 'A cash session is already open for this branch. Close it first.']);
        }

        $validated = $request->validate([
            'opening_cash' => ['required', 'numeric', 'min:0'],
            'notes'        => ['nullable', 'string', 'max:500'],
        ]);

        $session = CashSession::create([
            'user_id'      => $user->id,
            'branch_id'    => $branchId,
            'opening_cash' => $validated['opening_cash'],
            'notes'        => $validated['notes'] ?? null,
            'status'       => 'open',
            'opened_at'    => now(),
        ]);

        ActivityLog::create([
            'user_id'      => $user->id,
            'action'       => 'cash_session_opened',
            'subject_type' => CashSession::class,
            'subject_id'   => $session->id,
            'properties'   => [
                'session_number' => $session->session_number,
                'opening_cash'   => (float) $validated['opening_cash'],
                'branch_id'      => $branchId,
                'ip'             => $request->ip(),
            ],
        ]);

        return back()->with('message', [
            'type' => 'success',
            'text' => "Session {$session->session_number} opened — Opening cash: ₱" . number_format($validated['opening_cash'], 2),
        ]);
    }

    // ─── Close session ────────────────────────────────────────────────────────

    public function close(Request $request, CashSession $session): RedirectResponse
    {
        $user = Auth::user();

        if ($session->branch_id !== $user->branch_id && ! $user->isAdmin()) {
            abort(403, 'Unauthorized.');
        }

        if ($session->isClosed()) {
            return back()->withErrors(['error' => 'This session is already closed.']);
        }

        $requireCount = (bool) SystemSetting::get('cash.require_count_on_close', $session->branch_id, true);

        $validated = $request->validate([
            'counted_cash' => $requireCount
                ? ['required', 'numeric', 'min:0']
                : ['nullable', 'numeric', 'min:0'],
            'notes'        => ['nullable', 'string', 'max:1000'],
        ]);

        $session->loadMissing(['sales', 'expenses.pettyCashVoucher']);

        $expected  = $session->computeExpectedCash();
        $counted   = isset($validated['counted_cash']) ? (float) $validated['counted_cash'] : $expected;
        $overShort = round($counted - $expected, 2);

        $session->update([
            'expected_cash' => $expected,
            'counted_cash'  => $counted,
            'over_short'    => $overShort,
            'status'        => 'closed',
            'closed_at'     => now(),
            'notes'         => $validated['notes'] ?? $session->notes,
        ]);

        ActivityLog::create([
            'user_id'      => $user->id,
            'action'       => 'cash_session_closed',
            'subject_type' => CashSession::class,
            'subject_id'   => $session->id,
            'properties'   => [
                'session_number' => $session->session_number,
                'opening_cash'   => (float) $session->opening_cash,
                'expected_cash'  => $expected,
                'counted_cash'   => $counted,
                'over_short'     => $overShort,
                'ip'             => $request->ip(),
            ],
        ]);

        $overMsg = $overShort == 0
            ? 'Cash balanced ✓'
            : ($overShort > 0
                ? 'Over by ₱' . number_format(abs($overShort), 2)
                : 'Short by ₱' . number_format(abs($overShort), 2));

        return back()->with('message', [
            'type' => $overShort == 0 ? 'success' : 'warning',
            'text' => "Session closed. {$overMsg}",
        ]);
    }

    // ─── Show ─────────────────────────────────────────────────────────────────

    public function show(CashSession $session): Response
    {
        $user = Auth::user();

        if ($session->branch_id !== $user->branch_id && ! $user->isAdmin()) {
            abort(403, 'Unauthorized.');
        }

        $session->load([
            'user:id,fname,lname',
            'sales' => fn ($q) => $q->orderByDesc('created_at'),
        ]);

        $sales        = $session->sales->where('status', '!=', 'voided');
        $cashSales    = $sales->where('payment_method', 'cash');
        $gcashSales   = $sales->where('payment_method', 'gcash');
        $cardSales    = $sales->where('payment_method', 'card');
        $otherSales   = $sales->whereNotIn('payment_method', ['cash', 'gcash', 'card']);

        return Inertia::render('CashSessions/Show', [
            'session' => $this->mapSession($session, full: true),
            'summary' => [
                'total_sales'    => (float) $sales->sum('total'),
                'total_count'    => $sales->count(),
                'cash_total'     => (float) $cashSales->sum('total'),
                'gcash_total'    => (float) $gcashSales->sum('total'),
                'card_total'     => (float) $cardSales->sum('total'),
                'others_total'   => (float) $otherSales->sum('total'),
                'discount_total' => (float) $sales->sum('discount_amount'),
                'voided_count'   => $session->sales->where('status', 'voided')->count(),
            ],
            'sales' => $session->sales->map(fn ($s) => [
                'id'             => $s->id,
                'receipt_number' => $s->receipt_number,
                'total'          => (float) $s->total,
                'payment_method' => $s->payment_method,
                'customer_name'  => $s->customer_name,
                'status'         => $s->status,
                'created_at'     => $s->created_at?->toIso8601String(),
            ])->values(),
        ]);
    }

    // ─── Helper ───────────────────────────────────────────────────────────────

    private function mapSession(CashSession $s, bool $full = false): array
    {
        $base = [
            'id'             => $s->id,
            'session_number' => $s->session_number,
            'status'         => $s->status,
            'opening_cash'   => (float) $s->opening_cash,
            'expected_cash'  => $s->expected_cash  !== null ? (float) $s->expected_cash  : null,
            'counted_cash'   => $s->counted_cash   !== null ? (float) $s->counted_cash   : null,
            'over_short'     => $s->over_short     !== null ? (float) $s->over_short     : null,
            'over_short_status' => $s->over_short_status,
            'notes'          => $s->notes,
            'opened_at'      => $s->opened_at?->toIso8601String(),
            'closed_at'      => $s->closed_at?->toIso8601String(),
            'cashier'        => $s->user ? trim("{$s->user->fname} {$s->user->lname}") : '—',
            'formatted_opening_cash'  => $s->formatted_opening_cash,
            'formatted_expected_cash' => $s->formatted_expected_cash,
            'formatted_counted_cash'  => $s->formatted_counted_cash,
            'formatted_over_short'    => $s->formatted_over_short,
        ];

        if ($full) {
            $base['cash_sales_total']  = $s->cash_sales_total;
            $base['total_sales']       = (float) $s->sales()->where('status', '!=', 'voided')->sum('total');
            $base['sale_count']        = $s->sales()->where('status', '!=', 'voided')->count();
            $base['computed_expected'] = $s->computeExpectedCash();
        }

        return $base;
    }
}