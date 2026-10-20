<?php

namespace App\Console\Commands;

use App\Models\Extras\VendorPrequalification;
use App\Models\Notification;
use App\Models\User;
use App\Services\Notify\Notifier;
use Illuminate\Console\Command;

/** Tells a vendor, and the staff who manage pre-qualification, 30 days before a pre-qualification runs out. Once per record. */
class PrequalificationReminders extends Command
{
    protected $signature = 'tenders:pq-reminders {--days=30}';

    protected $description = 'Remind vendors and staff that a pre-qualification is about to expire';

    public function handle(Notifier $notifier): int
    {
        $days = (int) $this->option('days');
        $due = VendorPrequalification::with('vendor')->current()
            ->whereNotNull('valid_until')->where('valid_until', '<=', now()->addDays($days)->toDateString())->whereNull('reminded_at')->get();

        foreach ($due as $pq) {
            $vendor = $pq->vendor;
            if (! $vendor) {
                continue;
            }
            $left = max(0, (int) now()->startOfDay()->diffInDays($pq->valid_until->startOfDay(), false));
            $when = $left === 0 ? 'today' : "in {$left} day" . ($left === 1 ? '' : 's');
            if ($vendor->user_id && ($user = User::find($vendor->user_id))) {
                $notifier->send($user, 'prequalification_expiring', 'Your pre-qualification is about to expire',
                    ucfirst($pq->category) . " pre-qualification expires {$when} (" . $pq->valid_until->format('j M Y') . '). Send us your renewal documents to stay pre-qualified.',
                    ['action_url' => '/vendor-portal/pq', 'action_text' => 'See my pre-qualification', 'subject' => 'Your pre-qualification is about to expire']);
            }
            foreach (User::withPermission('prequalification.manage')->get() as $staff) {
                Notification::createFor($staff, 'prequalification_expiring_staff', "{$vendor->company_name}: pre-qualification expires {$when}",
                    ucfirst($pq->category) . ' until ' . $pq->valid_until->format('j M Y') . '.', '/admin/prequalification/submissions', 'Open pre-qualification', ['vendor_id' => $vendor->id], ['database']);
            }
            $pq->forceFill(['reminded_at' => now()])->save();
        }

        $this->info("{$due->count()} reminder(s) sent.");

        return self::SUCCESS;
    }
}
