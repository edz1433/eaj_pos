<?php

namespace App\Http\Controllers;

use App\Models\CashSession;
use App\Models\Category;
use App\Models\DiningTable;
use App\Models\Product;
use App\Models\ProductBundle;
use App\Models\RecipeIngredient;
use App\Models\ProductStock;
use App\Models\Promo;
use App\Models\Sale;
use App\Models\SystemSetting;
use App\Models\TableOrder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class PosController extends Controller
{
    private function authorizeSale(Sale $sale): void
    {
        $user = Auth::user();
        if ($user->isSuperAdmin() || $user->isAdministrator()) return;
        if ($sale->branch_id !== $user->branch_id) abort(403, 'Unauthorized access to this sale.');
    }

    // ─── POS Screen ───────────────────────────────────────────────────────────

    public function index(): Response
    {
        $user     = Auth::user();
        $branchId = $user->branch_id;

        if (! $branchId && ! $user->isSuperAdmin()) abort(403, 'No branch assigned.');

        $session = CashSession::where('branch_id', $branchId)
            ->where('status', 'open')->latest()->first();

        // ── Load products for the POS screen ──────────────────────────────────
        //
        // Inclusion rules per product type:
        //   standard      → must have stock > 0 in this branch
        //   bundle        → always include (stock is virtual; components are checked at sale time)
        //   made_to_order → always include (ingredients are deducted at sale time, not the product itself)
        //
        // Variant products: a standard product whose base stock is 0 but whose
        //   variants have stock should still appear so the cashier can pick a variant.
        //   We include it and let the variant picker handle availability.

        $products = Product::query()
            ->with([
                'category:id,name',
                // Load stock without the >0 filter so we always get the price/capital row
                'stocks'                               => fn ($q) => $q->where('branch_id', $branchId),
                'variants'                             => fn ($q) => $q->where('is_available', true)->orderBy('sort_order'),
                'bundle.items.componentProduct:id,name',
                'bundle.items.componentVariant:id,name',
                'recipeIngredients.ingredient:id,name',
            ])
            ->where(fn ($q) => $q
                // Standard products: own stock > 0 in this branch
                ->where(fn ($inner) => $inner
                    ->where('product_type', 'standard')
                    ->whereHas('stocks', fn ($s) => $s
                        ->where('branch_id', $branchId)
                        ->where('stock', '>', 0)
                    )
                )
                // Variant products: base stock may be 0 — include if any available variant exists
                // (variant stock is tracked at sale; we show the product so the cashier can pick)
                ->orWhere(fn ($inner) => $inner
                    ->where('product_type', 'standard')
                    ->whereHas('variants', fn ($v) => $v->where('is_available', true))
                    // Still require a stock record so we have a price
                    ->whereHas('stocks', fn ($s) => $s->where('branch_id', $branchId))
                )
                // Bundle products: always show — stock deducted from components at sale time
                ->orWhere('product_type', 'bundle')
                // Made-to-order: always show — ingredients deducted from recipe at sale time
                ->orWhere('product_type', 'made_to_order')
            )
            ->where('product_type', '!=', 'ingredient')
            ->whereHas('stocks', fn ($q) => $q->where('branch_id', $branchId))  // must have a price row
            ->latest()->get()
            ->map(fn (Product $p) => $this->mapProduct($p, $branchId))
            ->values();

        $categories = Category::select('id', 'name')
            ->where('is_active', true)->orderBy('name')->get();

        $promos = Promo::tableExists()
            ? Promo::with(['products:id', 'categories:id'])->active()->get()
                ->map(fn (Promo $p) => [
                    'id'               => $p->id,
                    'name'             => $p->name,
                    'code'             => $p->code,
                    'discount_type'    => $p->discount_type,
                    'discount_value'   => (float) $p->discount_value,
                    'applies_to'       => $p->applies_to,
                    'minimum_purchase' => $p->minimum_purchase ? (float) $p->minimum_purchase : null,
                    'product_ids'      => $p->products->pluck('id')->values(),
                    'category_ids'     => $p->categories->pluck('id')->values(),
                    'expires_at'       => $p->expires_at?->toIso8601String(),
                ])->values()
            : collect();

        $openTableOrders = [];
        $diningTables    = [];

        if ($user->branch?->usesTableOrdering()) {
            $openTableOrders = TableOrder::with('table:id,table_number,section')
                ->where('branch_id', $branchId)->whereIn('status', ['open', 'billed'])->get()
                ->map(fn ($to) => [
                    'id' => $to->id, 'table_id' => $to->table_id,
                    'table_number' => $to->table?->table_number,
                    'section' => $to->table?->section,
                    'label' => $to->table?->label ?? "Table {$to->table?->table_number}",
                    'status' => $to->status, 'total' => (float) $to->total,
                    'customer_name' => $to->customer_name,
                ])->values();

            $diningTables = DiningTable::where('branch_id', $branchId)->where('is_active', true)
                ->orderBy('section')->orderBy('table_number')
                ->get(['id', 'table_number', 'section', 'capacity', 'status'])
                ->map(fn ($t) => [
                    'id' => $t->id, 'table_number' => $t->table_number, 'section' => $t->section,
                    'label' => $t->label ?? "Table {$t->table_number}", 'capacity' => $t->capacity, 'status' => $t->status,
                ])->values();
        }

        return Inertia::render('Pos/Index', [
            'products'          => $products,
            'categories'        => $categories,
            'promos'            => $promos,
            'session'           => $session ? [
                'id' => $session->id, 'opening_cash' => (float) $session->opening_cash,
                'opened_at' => $session->opened_at?->toIso8601String(), 'status' => $session->status,
            ] : null,
            'branch'            => $user->branch ? [
                'id' => $user->branch->id, 'name' => $user->branch->name,
                'business_type' => $user->branch->business_type, 'feature_flags' => $user->branch->feature_flags,
            ] : null,
            'open_table_orders' => $openTableOrders,
            'dining_tables'     => $diningTables,
            'preferred_layout'  => $user->pos_layout ?? 'grid',
        ]);
    }

    // ─── Stock helpers ────────────────────────────────────────────────────────

    /**
     * Deduct stock for one product (standard, bundle, or MTO).
     * All relations must already be eager-loaded with lockForUpdate().
     */
    private function deductProductStock(Product $product, int $qty, int $branchId, bool $allowNeg): void
    {
        if ($product->product_type === 'bundle' && $product->bundle) {
            foreach ($product->bundle->items->where('is_required', true) as $bi) {
                $comp   = $bi->componentProduct;
                $cs     = $comp?->stocks->firstWhere('branch_id', $branchId);
                $needed = $bi->quantity * $qty;
                if (! $cs) throw new \RuntimeException("Bundle component \"{$comp?->name}\" has no stock in this branch.");
                if (! $allowNeg && $cs->stock < $needed) throw new \RuntimeException("Insufficient stock for bundle component \"{$comp?->name}\". Need {$needed}, have {$cs->stock}.");
                $cs->decrement('stock', $needed);
            }
        } elseif ($product->product_type === 'made_to_order') {
            $recipes = $product->recipeIngredients;
            if ($recipes->isNotEmpty()) {
                foreach ($recipes as $recipe) {
                    $ing      = $recipe->ingredient;
                    $ingStock = $ing?->stocks->firstWhere('branch_id', $branchId);
                    $needed   = $recipe->quantityNeededFor($qty);
                    if (! $ingStock) throw new \RuntimeException("Ingredient \"{$ing?->name}\" has no stock in this branch.");
                    if (! $allowNeg && $ingStock->stock < $needed) throw new \RuntimeException("Insufficient stock for ingredient \"{$ing?->name}\". Need {$needed}, have {$ingStock->stock}.");
                    $ingStock->decrement('stock', $needed);
                }
            } else {
                $stock = $product->stocks->firstWhere('branch_id', $branchId) ?? $product->stocks->first();
                if (! $stock) throw new \RuntimeException("Product \"{$product->name}\" has no stock in this branch.");
                if (! $allowNeg && $stock->stock < $qty) throw new \RuntimeException("Insufficient stock for \"{$product->name}\". Only {$stock->stock} left.");
                $stock->decrement('stock', $qty);
            }
        } else {
            $stock = $product->stocks->firstWhere('branch_id', $branchId) ?? $product->stocks->first();
            if (! $stock) throw new \RuntimeException("Product \"{$product->name}\" has no stock in this branch.");
            if (! $allowNeg && $stock->stock < $qty) throw new \RuntimeException("Insufficient stock for \"{$product->name}\". Only {$stock->stock} left.");
            $stock->decrement('stock', $qty);
        }
    }

    /**
     * Restore stock for a set of sale items — mirrors deductProductStock.
     * Items must be loaded with: product.stocks, product.bundle.items.componentProduct.stocks,
     * product.recipeIngredients.ingredient.stocks
     */
    private function restoreStockForItems(\Illuminate\Database\Eloquent\Collection $items, int $branchId): void
    {
        foreach ($items as $item) {
            $product = $item->product;
            if (! $product) continue;

            if ($product->product_type === 'bundle' && $product->bundle) {
                foreach ($product->bundle->items->where('is_required', true) as $bi) {
                    $cs = $bi->componentProduct?->stocks->firstWhere('branch_id', $branchId);
                    if ($cs) $cs->increment('stock', $bi->quantity * $item->quantity);
                }
            } elseif ($product->product_type === 'made_to_order') {
                $recipes = $product->recipeIngredients;
                if ($recipes->isNotEmpty()) {
                    foreach ($recipes as $recipe) {
                        $ingStock = $recipe->ingredient?->stocks->firstWhere('branch_id', $branchId);
                        if ($ingStock) $ingStock->increment('stock', $recipe->quantityNeededFor($item->quantity));
                    }
                } else {
                    $stock = $product->stocks->firstWhere('branch_id', $branchId);
                    if ($stock) $stock->increment('stock', $item->quantity);
                }
            } else {
                $stock = $product->stocks->firstWhere('branch_id', $branchId);
                if ($stock) $stock->increment('stock', $item->quantity);
            }
        }
    }

    // ─── Store (checkout) ─────────────────────────────────────────────────────

    public function store(Request $request): RedirectResponse
    {
        $user     = Auth::user();
        $branchId = $user->branch_id;

        if (! $branchId) return back()->withErrors(['error' => 'No branch assigned.']);

        // Enforce cash session requirement
        $requireSession = (bool) SystemSetting::get('pos.require_cash_session', $branchId, true);
        if ($requireSession) {
            $openSession = \App\Models\CashSession::where('branch_id', $branchId)->open()->first();
            if (! $openSession) {
                return back()->withErrors(['error' => 'No open cash session. Please open a cash session before processing sales.']);
            }
        }

        $validated = $request->validate([
            'items'              => ['required', 'array', 'min:1'],
            'items.*.id'         => ['required', 'exists:products,id'],
            'items.*.qty'        => ['required', 'integer', 'min:1'],
            'items.*.variant_id' => ['nullable', 'exists:product_variants,id'],
            'payment_method'     => ['required', 'in:cash,gcash,card,others,installment'],
            'payment_amount'     => ['nullable', 'numeric', 'min:0'],
            'customer_name'      => ['nullable', 'string', 'max:80'],
            'discount_percent'   => ['nullable', 'numeric', 'between:0,100'],
            'promo_id'           => ['nullable', 'exists:promos,id'],
            'cash_session_id'    => ['nullable', 'exists:cash_sessions,id'],
            'table_order_id'     => ['nullable', 'exists:table_orders,id'],
            // Installment fields (required when payment_method = installment)
            'installment_customer_phone'  => ['nullable', 'string', 'max:30'],
            'installment_down_payment'    => ['nullable', 'numeric', 'min:0'],
            'installments_count'          => ['nullable', 'integer', 'between:2,24'],
            'installment_interval'        => ['nullable', 'in:monthly,biweekly,weekly'],
            'installment_notes'           => ['nullable', 'string', 'max:500'],
        ]);

        // Extra validation for installment payment
        if ($validated['payment_method'] === 'installment') {
            if (empty($validated['customer_name'])) {
                return back()->withErrors(['error' => 'Customer name is required for installment sales.']);
            }
            if (empty($validated['installments_count'])) {
                return back()->withErrors(['error' => 'Number of installments is required.']);
            }
        }

        try {
            $result = DB::transaction(function () use ($validated, $user, $branchId) {
                $settings     = SystemSetting::allForBranch($branchId);
                $allowNeg     = (bool) ($settings['inventory.allow_negative_stock'] ?? false);
                $subtotal     = 0;
                $saleItems    = [];

                foreach ($validated['items'] as $item) {
                    $product = Product::with([
                        'variants',
                        'stocks'                                => fn ($q) => $q->where('branch_id', $branchId)->lockForUpdate(),
                        'bundle.items.componentProduct.stocks'  => fn ($q) => $q->where('branch_id', $branchId)->lockForUpdate(),
                        'recipeIngredients.ingredient.stocks'   => fn ($q) => $q->where('branch_id', $branchId)->lockForUpdate(),
                    ])->findOrFail($item['id']);

                    $stock     = $product->stocks->first();
                    $unitPrice = (float) ($stock?->price ?? 0);
                    $saleQty   = (int) $item['qty'];

                    // ── Resolve variant price add-on ───────────────────────
                    if (! empty($item['variant_id'])) {
                        $v = $product->variants->firstWhere('id', $item['variant_id']);
                        if ($v) $unitPrice += (float) $v->extra_price;
                    }

                    // ── Deduct stock based on product type ─────────────────
                    $this->deductProductStock($product, $saleQty, $branchId, $allowNeg);

                    $line      = round($unitPrice * $saleQty, 2);
                    $subtotal += $line;
                    $saleItems[] = [
                        'product_id'         => $item['id'],
                        'product_variant_id' => $item['variant_id'] ?? null,
                        'quantity'           => $saleQty,
                        'price'              => $unitPrice,
                        'total'              => $line,
                    ];
                }

                // Percentage discount
                $maxDisc  = (float) ($settings['pos.max_discount_percent'] ?? 100);
                $discPct  = min((float) ($validated['discount_percent'] ?? 0), $maxDisc);
                $discAmt  = round($subtotal * ($discPct / 100), 2);

                // Promo discount
                $promoAmt   = 0;
                $promoLabel = null;
                if (! empty($validated['promo_id'])) {
                    $promo = Promo::find($validated['promo_id']);
                    if ($promo && $promo->isValid()) {
                        $promoAmt   = $promo->computeDiscount($subtotal - $discAmt);
                        $promoLabel = "{$promo->name}" . ($promo->code ? " [{$promo->code}]" : '');
                        $promo->increment('uses_count');
                    }
                }

                $afterDisc = round($subtotal - $discAmt - $promoAmt, 2);

                // VAT
                $vatEnabled  = (bool)  ($settings['tax.vat_enabled']   ?? false);
                $vatRate     = (float) ($settings['tax.vat_rate']      ?? 0);
                $vatInclusive= (bool)  ($settings['tax.vat_inclusive'] ?? true);
                $vatAmt      = ($vatEnabled && $vatRate > 0 && ! $vatInclusive)
                    ? round($afterDisc * ($vatRate / 100), 2) : 0;

                $totalDue       = $afterDisc + $vatAmt;
                $isInstallment  = $validated['payment_method'] === 'installment';
                $downPayment    = $isInstallment ? (float) ($validated['installment_down_payment'] ?? 0) : null;
                $paid           = $isInstallment ? ($downPayment ?? 0) : (float) ($validated['payment_amount'] ?? $totalDue);
                $change         = $isInstallment ? 0 : max(0, round($paid - $totalDue, 2));

                $notes = implode(' | ', array_filter([
                    $discPct > 0   ? "Discount {$discPct}% (−₱" . number_format($discAmt, 2) . ")"        : null,
                    $promoAmt > 0  ? "Promo {$promoLabel}: −₱" . number_format($promoAmt, 2)              : null,
                    $vatAmt > 0    ? "VAT {$vatRate}%: ₱" . number_format($vatAmt, 2)                     : null,
                ]));

                $sale = Sale::create([
                    'receipt_number'  => $this->generateReceiptNumber($branchId),
                    'user_id'         => $user->id,
                    'branch_id'       => $branchId,
                    'cash_session_id' => $validated['cash_session_id'] ?? null,
                    'table_order_id'  => $validated['table_order_id']  ?? null,
                    'payment_method'  => $validated['payment_method'],
                    'payment_amount'  => $paid,
                    'change_amount'   => $change,
                    'discount_amount' => $discAmt + $promoAmt,
                    'customer_name'   => $validated['customer_name'] ?? null,
                    'status'          => 'completed',
                    'total'           => $totalDue,
                    'notes'           => $notes ?: null,
                ]);

                foreach ($saleItems as $data) $sale->items()->create($data);

                if (! empty($validated['table_order_id'])) {
                    TableOrder::where('id', $validated['table_order_id'])
                        ->update(['status' => 'closed', 'sale_id' => $sale->id]);
                }

                // ── Create installment plan if payment method is installment ──
                $installmentPlanId = null;
                if ($isInstallment) {
                    $balance      = round($totalDue - ($downPayment ?? 0), 2);
                    $instCount    = (int) ($validated['installments_count'] ?? 1);
                    $instAmount   = $instCount > 0 ? round($balance / $instCount, 2) : $balance;
                    $interval     = $validated['installment_interval'] ?? 'monthly';
                    $nextDueDate  = \App\Models\InstallmentPlan::computeNextDue($interval);

                    $plan = \App\Models\InstallmentPlan::create([
                        'sale_id'            => $sale->id,
                        'branch_id'          => $branchId,
                        'user_id'            => $user->id,
                        'customer_name'      => $validated['customer_name'],
                        'customer_phone'     => $validated['installment_customer_phone'] ?? null,
                        'total_amount'       => $totalDue,
                        'down_payment'       => $downPayment ?? 0,
                        'balance'            => $balance,
                        'installment_amount' => $instAmount,
                        'total_paid'         => 0,
                        'installments_count' => $instCount,
                        'paid_count'         => 0,
                        'interval'           => $interval,
                        'next_due_date'      => $balance > 0 ? $nextDueDate : null,
                        'status'             => $balance > 0 ? 'active' : 'completed',
                        'notes'              => $validated['installment_notes'] ?? null,
                    ]);

                    $installmentPlanId = $plan->id;
                }

                return [
                    'sale_id'            => $sale->id,
                    'receipt_number'     => $sale->receipt_number,
                    'total'              => $totalDue,
                    'change'             => $change,
                    'discount_amount'    => $discAmt,
                    'promo_discount'     => $promoAmt,
                    'promo_name'         => $promoLabel,
                    'vat_amount'         => $vatAmt,
                    'installment_plan_id'=> $installmentPlanId,
                    'is_installment'     => $isInstallment,
                    'down_payment'       => $isInstallment ? ($downPayment ?? 0) : null,
                ];
            });

            return back()->with('pos_result', $result);

        } catch (\Throwable $e) {
            return back()->withErrors(['error' => $e->getMessage() ?: 'Checkout failed.']);
        }
    }

    // ─── Show ─────────────────────────────────────────────────────────────────

    public function show(Sale $sale): Response
    {
        $this->authorizeSale($sale);
        $sale->load(['items.product', 'items.variant', 'user', 'branch', 'cashSession', 'tableOrder.table']);
        return Inertia::render('Pos/Show', ['sale' => $this->mapSale($sale)]);
    }

    // ─── History ──────────────────────────────────────────────────────────────

    public function history(Request $request): Response
    {
        $user     = Auth::user();
        $branchId = $user->branch_id;
        $isAdmin  = $user->isAdmin();
        $today    = today()->toDateString();

        // Cashiers are always locked to today; admins default to today on first visit
        $from = $isAdmin ? ($request->input('from') ?? $today) : $today;
        $to   = $isAdmin ? ($request->input('to')   ?? $today) : $today;

        $search = $request->input('search');
        $status = $request->input('status');
        $method = $request->input('payment_method');

        $query = Sale::with(['items.product', 'items.variant', 'user', 'tableOrder.table'])
            ->where('branch_id', $branchId)
            ->whereDate('created_at', '>=', $from)
            ->whereDate('created_at', '<=', $to)
            ->orderByDesc('created_at');

        if ($search) $query->where(fn ($q) => $q->where('receipt_number', 'like', "%{$search}%")->orWhere('customer_name', 'like', "%{$search}%"));
        if ($status) $query->where('status', $status);
        if ($method) $query->where('payment_method', $method);

        $sales = $query->paginate(25)->withQueryString();

        $base = Sale::where('branch_id', $branchId)->completed()
            ->whereDate('created_at', '>=', $from)
            ->whereDate('created_at', '<=', $to);

        $branch = Auth::user()->branch;

        return Inertia::render('Pos/History', [
            'sales'    => $sales->through(fn ($s) => $this->mapSale($s, brief: true)),
            'summary'  => [
                'total_sales'    => (float) $base->sum('total'),
                'total_count'    => $base->count(),
                'cash_total'     => (float) (clone $base)->where('payment_method', 'cash')->sum('total'),
                'gcash_total'    => (float) (clone $base)->where('payment_method', 'gcash')->sum('total'),
                'card_total'     => (float) (clone $base)->where('payment_method', 'card')->sum('total'),
                'discount_total' => (float) (clone $base)->sum('discount_amount'),
            ],
            'filters'  => [
                'search'         => $search,
                'status'         => $status,
                'payment_method' => $method,
                'from'           => $from,
                'to'             => $to,
            ],
            'branch'   => $branch ? [
                'id'            => $branch->id,
                'name'          => $branch->name,
                'business_type' => $branch->business_type,
            ] : null,
            'is_admin' => $isAdmin,
        ]);
    }

    // ─── Edit ─────────────────────────────────────────────────────────────────

    public function edit(Sale $sale): Response
    {
        $this->authorizeSale($sale);
        $user = Auth::user();
        if ($sale->created_at->isBefore(today()) && ! $user->isAdmin()) abort(403, 'You can only edit sales made today.');

        $sale->load(['items.product', 'items.variant']);
        $branchId = $user->branch_id;

        $products = Product::query()
            ->with(['category:id,name', 'stocks' => fn ($q) => $q->where('branch_id', $branchId), 'variants' => fn ($q) => $q->where('is_available', true)->orderBy('sort_order')])
            ->whereHas('stocks', fn ($q) => $q->where('branch_id', $branchId))
            ->get()->map(fn ($p) => $this->mapProduct($p, $branchId))->values();

        return Inertia::render('Pos/Edit', ['sale' => $this->mapSale($sale), 'products' => $products]);
    }

    // ─── Update ───────────────────────────────────────────────────────────────

    public function update(Request $request, Sale $sale): RedirectResponse
    {
        $this->authorizeSale($sale);
        $user     = Auth::user();
        $branchId = $user->branch_id;

        if ($sale->created_at->isBefore(today()) && ! $user->isAdmin()) return back()->withErrors(['error' => "Only today's sales can be edited."]);

        $validated = $request->validate([
            'items'              => ['required', 'array', 'min:1'],
            'items.*.id'         => ['required', 'exists:products,id'],
            'items.*.qty'        => ['required', 'integer', 'min:1'],
            'items.*.variant_id' => ['nullable', 'exists:product_variants,id'],
            'payment_method'     => ['required', 'in:cash,gcash,card,others'],
            'payment_amount'     => ['nullable', 'numeric', 'min:0'],
            'customer_name'      => ['nullable', 'string', 'max:80'],
            'discount_percent'   => ['nullable', 'numeric', 'between:0,100'],
        ]);

        try {
            DB::transaction(function () use ($sale, $validated, $branchId) {
                $settings = SystemSetting::allForBranch($branchId);
                $allowNeg = (bool) ($settings['inventory.allow_negative_stock'] ?? false);

                // Restore old stock (type-aware for bundles and MTO)
                $sale->load([
                    'items.product.stocks',
                    'items.product.bundle.items.componentProduct.stocks',
                    'items.product.recipeIngredients.ingredient.stocks',
                ]);
                $this->restoreStockForItems($sale->items, $branchId);
                $sale->items()->delete();

                $subtotal = 0;
                $saleItems = [];

                foreach ($validated['items'] as $item) {
                    $product = Product::with([
                        'variants',
                        'stocks'                               => fn ($q) => $q->where('branch_id', $branchId)->lockForUpdate(),
                        'bundle.items.componentProduct.stocks' => fn ($q) => $q->where('branch_id', $branchId)->lockForUpdate(),
                        'recipeIngredients.ingredient.stocks'  => fn ($q) => $q->where('branch_id', $branchId)->lockForUpdate(),
                    ])->findOrFail($item['id']);

                    $stock     = $product->stocks->firstWhere('branch_id', $branchId) ?? $product->stocks->first();
                    $unitPrice = (float) ($stock?->price ?? 0);
                    $saleQty   = (int) $item['qty'];

                    if (! empty($item['variant_id'])) {
                        $v = $product->variants->firstWhere('id', $item['variant_id']);
                        if ($v) $unitPrice += (float) $v->extra_price;
                    }

                    $this->deductProductStock($product, $saleQty, $branchId, $allowNeg);

                    $lt = round($unitPrice * $saleQty, 2);
                    $subtotal += $lt;
                    $saleItems[] = ['product_id' => $item['id'], 'product_variant_id' => $item['variant_id'] ?? null, 'quantity' => $saleQty, 'price' => $unitPrice, 'total' => $lt];
                }

                $discPct = (float) ($validated['discount_percent'] ?? 0);
                $discAmt = round($subtotal * ($discPct / 100), 2);
                $total   = round($subtotal - $discAmt, 2);
                $paid    = (float) ($validated['payment_amount'] ?? $total);

                $sale->update([
                    'payment_method' => $validated['payment_method'], 'payment_amount' => $paid,
                    'change_amount'  => max(0, round($paid - $total, 2)), 'discount_amount' => $discAmt,
                    'customer_name'  => $validated['customer_name'] ?? null, 'total' => $total,
                    'notes'          => $discPct > 0 ? "Discount {$discPct}% (−₱" . number_format($discAmt, 2) . ")" : null,
                ]);

                foreach ($saleItems as $data) {
                    $sale->items()->create($data);
                }
            });

            return redirect()->route('pos.show', $sale->id)->with('success', 'Sale updated.');

        } catch (\Throwable $e) {
            return back()->withErrors(['error' => $e->getMessage()]);
        }
    }

    // ─── Void ─────────────────────────────────────────────────────────────────

    public function void(Request $request, Sale $sale): RedirectResponse
    {
        $this->authorizeSale($sale);
        if ($sale->isVoided()) return back()->withErrors(['error' => 'Already voided.']);

        $user = Auth::user();
        if ($sale->created_at->isBefore(today()) && ! $user->isAdmin()) return back()->withErrors(['error' => "Only today's sales can be voided."]);

        DB::transaction(function () use ($sale, $user, $request) {
            $branchId = $sale->branch_id;

            // Load items with all relations needed for type-aware stock restore
            $sale->load([
                'items.product.stocks',
                'items.product.bundle.items.componentProduct.stocks',
                'items.product.recipeIngredients.ingredient.stocks',
            ]);

            $this->restoreStockForItems($sale->items, $branchId);

            if ($sale->table_order_id) {
                TableOrder::where('id', $sale->table_order_id)->where('sale_id', $sale->id)->update(['status' => 'open', 'sale_id' => null]);
            }
            $sale->update(['status' => 'voided', 'notes' => trim(($sale->notes ?? '') . ' | Voided: ' . ($request->input('reason', 'No reason provided')))]);
        });

        return back()->with('success', 'Sale voided and stock restored.');
    }

    // ─── Barcode lookup ───────────────────────────────────────────────────────

    public function lookupBarcode(Request $request): JsonResponse
    {
        $barcode  = $request->string('barcode');
        $branchId = Auth::user()->branch_id;

        $product = Product::with([
            'stocks'   => fn ($q) => $q->where('branch_id', $branchId),
            'variants' => fn ($q) => $q->where('is_available', true),
            'category:id,name',
            'bundle.items.componentProduct:id,name',
            'recipeIngredients.ingredient:id,name',
        ])->where('barcode', $barcode)->first();

        if (! $product) return response()->json(['found' => false, 'message' => 'Product not found.'], 404);

        return response()->json(['found' => true, 'product' => $this->mapProduct($product, $branchId)]);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private function mapProduct(Product $p, int $branchId): array
    {
        $stock = $p->stocks->firstWhere('branch_id', $branchId) ?? $p->stocks->first();

        // ── Determine the effective "stock" number shown on the POS card ──────
        //
        // standard   → own stock count in this branch
        // bundle     → 999 (virtual; components checked at checkout)
        // made_to_order → 999 (ingredients checked at checkout; no own stock row)
        // variant product → sum of available variant stocks (approximate; real
        //                   variant stock lives in product_variant_stocks but we
        //                   use the base stock row as a price anchor)
        $displayStock = match ($p->product_type) {
            'bundle', 'made_to_order' => 999,
            default                   => (int) ($stock?->stock ?? 0),
        };

        return [
            'id'           => $p->id,
            'name'         => $p->name,
            'barcode'      => $p->barcode,
            'product_img'  => $p->product_img ? asset('storage/' . $p->product_img) : null,
            'product_type' => $p->product_type,
            'price'        => (float) ($stock?->price ?? 0),
            'stock'        => $displayStock,
            'category'     => $p->category ? ['id' => $p->category->id, 'name' => $p->category->name] : null,
            'variants'     => $p->variants->map(fn ($v) => [
                'id'          => $v->id,
                'name'        => $v->name,
                'extra_price' => (float) $v->extra_price,
                'attributes'  => $v->attributes ?? [],
                'is_available'=> $v->is_available,
            ])->values(),
            'has_variants' => $p->variants->count() > 0,
            // Bundle components — info shown on POS card
            'bundle_items' => $p->bundle
                ? $p->bundle->items->map(fn ($i) => [
                    'name'     => $i->componentProduct?->name ?? '?',
                    'qty'      => $i->quantity,
                    'required' => $i->is_required,
                ])->values()
                : null,
            // Recipe ingredients — info shown for MTO products
            'recipe_items' => $p->recipeIngredients?->count() > 0
                ? $p->recipeIngredients->map(fn ($r) => [
                    'name'     => $r->ingredient?->name ?? '?',
                    'quantity' => $r->quantity,
                    'unit'     => $r->unit,
                ])->values()
                : null,
        ];
    }

    private function mapSale(Sale $sale, bool $brief = false): array
    {
        $base = [
            'id'              => $sale->id,
            'receipt_number'  => $sale->receipt_number,
            'status'          => $sale->status,
            'payment_method'  => $sale->payment_method,
            'payment_amount'  => (float) $sale->payment_amount,
            'change_amount'   => (float) $sale->change_amount,
            'discount_amount' => (float) $sale->discount_amount,
            'total'           => (float) $sale->total,
            'customer_name'   => $sale->customer_name,
            'notes'           => $sale->notes,
            'created_at'      => $sale->created_at?->toIso8601String(),
            'cashier'         => $sale->user ? trim("{$sale->user->fname} {$sale->user->lname}") : 'Unknown',
            'table_order_id'  => $sale->table_order_id,
            'table_label'     => $sale->tableOrder?->table?->label,
        ];

        $base['items'] = $brief
            ? $sale->items->map(fn ($i) => ['product_name' => $i->product?->name ?? '(deleted)', 'variant_name' => $i->variant?->name, 'quantity' => (int) $i->quantity, 'price' => (float) $i->price])->values()
            : $sale->items->map(fn ($i) => ['id' => $i->id, 'product_id' => $i->product_id, 'product_name' => $i->product?->name ?? '(deleted)', 'variant_name' => $i->variant?->name, 'quantity' => (int) $i->quantity, 'price' => (float) $i->price, 'total' => (float) $i->total])->values();

        if ($brief) $base['item_count'] = $sale->items->count();
        return $base;
    }

    private function generateReceiptNumber(int $branchId): string
    {
        $code  = Auth::user()->branch?->code ?? 'POS';
        $date  = now()->format('ymd');
        $count = Sale::where('branch_id', $branchId)->whereDate('created_at', today())->count() + 1;
        return strtoupper("{$code}-{$date}-" . str_pad($count, 4, '0', STR_PAD_LEFT));
    }
}