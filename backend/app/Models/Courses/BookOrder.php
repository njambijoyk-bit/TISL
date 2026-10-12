<?php

namespace App\Models\Courses;

use Illuminate\Database\Eloquent\Model;

/** One sale of a book. */
class BookOrder extends Model
{
    public const STATUSES = ['pending' => 'Waiting for payment', 'paid' => 'Paid', 'fulfilled' => 'Delivered', 'cancelled' => 'Cancelled', 'refunded' => 'Refunded'];
    public const FULFIL = ['digital' => 'Download', 'delivery' => 'Delivery', 'pickup' => 'Collect'];

    protected $table = 'course_book_orders';

    protected $guarded = [];

    protected $casts = ['unit_price' => 'decimal:2', 'total' => 'decimal:2', 'paid_total' => 'decimal:2', 'expires_at' => 'datetime', 'delivered_at' => 'datetime', 'cancelled_at' => 'datetime'];

    public function balance(): float
    {
        return max(0.0, round((float) $this->total - (float) $this->paid_total, 2));
    }
}
