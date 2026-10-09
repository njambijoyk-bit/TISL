<?php

namespace App\Services\Preorders;

use App\Services\Notify\Notifier;
use App\Services\Notify\OrderNotices;
use App\Services\Notify\Staff;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\Cache;

/**
 * Daily: a paid preorder whose promised date has passed with goods still owed. The customer is told (first on the day after the date, then every 14 days, at most
 * 3 times, so nobody is nagged), and the people who deliver get one short note a day saying how many are late. The "Preorders waiting" list also shows how many days late
 * each line is. A late order already being cancelled is left alone.
 */
class PreorderDelayNotices
{
    public const REPEAT_DAYS = 14;
    public const MAX_NOTICES = 3;

    public function __construct(private PreorderService $preorders, private OrderNotices $notices, private Notifier $notifier, private Staff $staff) {}

    /** @return array{late: int, told: int, moved: int, staff_told: int} */
    public function run(CarbonInterface $today, bool $dryRun = false): array
    {
        $moved = $this->tellMoved($today, $dryRun);
        $late = $this->preorders->overdue($today);
        $told = 0;
        foreach ($late as $row) {
            $order = $row['order'];
            $state = $order->meta['delay_notices'] ?? ['count' => 0, 'last_at' => null];
            $due = (int) $state['count'] === 0 || ((int) $state['count'] < self::MAX_NOTICES && $state['last_at'] && \Carbon\Carbon::parse($state['last_at'])->startOfDay()->lte($today->copy()->subDays(self::REPEAT_DAYS)->startOfDay()));
            if (! $due) {
                continue;
            }
            $told++;
            if ($dryRun) {
                continue;
            }
            $meta = $order->meta ?? [];
            $meta['delay_notices'] = ['count' => (int) $state['count'] + 1, 'last_at' => $today->toDateString(), 'promised' => $row['promised']];
            $order->meta = $meta;
            $order->save();
            $this->notices->tell($order, 'preorder_delayed', 'Your preorder ' . $order->voucher_number . ' is taking longer than expected',
                'We expected to deliver preorder ' . $order->voucher_number . ' by ' . $row['promised'] . ' and it is not here yet. We are sorry for the wait. We are still working on it and will deliver as soon as the stock arrives.'
                . ($order->customer_id ? ' If you would rather cancel and be refunded, you can ask from your order page.' : ' If you would rather cancel and be refunded, please contact us.'));
        }

        return ['late' => count($late), 'told' => $told, 'moved' => $moved, 'staff_told' => $dryRun ? 0 : $this->tellStaff(count($late), $today)];
    }

    public const MAX_DATE_NOTICES = 3;

    /**
     * The promise moved LATER (a supplier delay on a linked purchase order): say so once per new date, before anyone is late. At most 3 such notes per order.
     */
    private function tellMoved(CarbonInterface $today, bool $dryRun): int
    {
        $n = 0;
        foreach ($this->preorders->dateChanges() as $row) {
            $order = $row['order'];
            $told = $order->meta['date_notices'] ?? [];
            if (isset($told[$row['to']]) || count($told) >= self::MAX_DATE_NOTICES) {
                continue;
            }
            $n++;
            if ($dryRun) {
                continue;
            }
            $meta = $order->meta ?? [];
            $meta['date_notices'][$row['to']] = $today->toDateString();
            $order->meta = $meta;
            $order->save();
            $this->notices->tell($order, 'preorder_delayed', 'New expected date for preorder ' . $order->voucher_number,
                'Your preorder ' . $order->voucher_number . ' is now expected by ' . $row['to'] . ' (we first said ' . $row['from'] . '). We are sorry for the change; our supplier has told us the stock will arrive later than planned.'
                . ($order->customer_id ? ' If you would rather cancel and be refunded, you can ask from your order page.' : ' If you would rather cancel and be refunded, please contact us.'));
        }

        return $n;
    }

    /** One note a day to everyone who delivers preorders, only when something is late. */
    private function tellStaff(int $late, CarbonInterface $today): int
    {
        if ($late === 0 || ! Cache::add('preorder_delay_digest:' . $today->toDateString(), 1, 90000)) {
            return 0;
        }
        $n = 0;
        foreach ($this->staff->holding('stock.manage') as $staff) {
            $this->notifier->send($staff, 'preorder_delays_staff', $late === 1 ? '1 preorder is past its date' : "{$late} preorders are past their date",
                ($late === 1 ? 'A paid preorder is' : "{$late} paid preorders are") . ' past the expected date and still waiting for stock. See Orders → Preorders waiting.',
                ['action_url' => '/admin/orders?tab=preorders', 'action_text' => 'Open the list']);
            $n++;
        }

        return $n;
    }
}
