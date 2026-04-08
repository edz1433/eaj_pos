<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InstallmentPayment extends Model
{
    protected $fillable = [
        'installment_plan_id',
        'received_by_user_id',
        'sequence',
        'amount',
        'payment_date',
        'payment_method',
        'notes',
    ];

    protected $casts = [
        'amount'       => 'decimal:2',
        'payment_date' => 'date',
    ];

    // ── Relationships ───────────────────────────────────────────────

    public function plan(): BelongsTo     { return $this->belongsTo(InstallmentPlan::class, 'installment_plan_id'); }
    public function receiver(): BelongsTo { return $this->belongsTo(User::class, 'received_by_user_id'); }
}
