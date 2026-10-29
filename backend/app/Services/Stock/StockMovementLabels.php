<?php

namespace App\Services\Stock;

/** What each kind of stock movement is called, in one place for the stock journal and the stock reports (audit L2). */
final class StockMovementLabels
{
    public const ALL = [
        'sales' => 'Sale', 'cash_sale' => 'Cash sale', 'delivery_note' => 'Delivery note', 'credit_note' => 'Customer return', 'purchase' => 'Purchase', 'receipt_note' => 'Goods received',
        'debit_note' => 'Returned to supplier', 'opening_stock' => 'Opening stock', 'write_off' => 'Write-off', 'transfer_out' => 'Transfer out', 'transfer_in' => 'Transfer in',
        'count_loss' => 'Count shortage', 'count_gain' => 'Count surplus', 'production_use' => 'Used in production', 'production_out' => 'Produced', 'job_issue' => 'Issued to a job',
        'job_return' => 'Returned from a job', 'ingredient_use' => 'Used in dishes', 'reversal' => 'Taken back', 'reconcile' => 'Stock reconciled',
    ];

    public static function label(?string $type): string
    {
        return self::ALL[$type] ?? ucfirst(str_replace('_', ' ', (string) $type));
    }
}
