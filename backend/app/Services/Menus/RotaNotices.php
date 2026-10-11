<?php

namespace App\Services\Menus;

use App\Models\Menus\Chef;
use App\Models\Menus\DayOff;
use App\Models\Menus\Shift;
use App\Models\Menus\Swap;
use App\Models\User;
use App\Services\Notify\Notifier;
use App\Services\Notify\Staff;
use Illuminate\Support\Collection;

/** Tells a chef about their shifts and days off, and the managers about requests. Never raises: a problem telling someone must not undo what just happened. */
class RotaNotices
{
    public function __construct(private Notifier $notifier, private Staff $staff)
    {
    }

    private function line(Shift $s): string
    {
        return $s->shift_date->format('D j M').' '.substr((string) $s->starts_at, 0, 5).'–'.substr((string) $s->ends_at, 0, 5);
    }

    private function tell(?int $chefUserId, string $type, string $title, string $message): void
    {
        if ($chefUserId && ($u = User::find($chefUserId))) {
            $this->notifier->send($u, $type, $title, $message, ['action_url' => '/admin/menus/rota', 'action_text' => 'Open the rota']);
        }
    }

    /** A week was published: each chef gets their own shifts in one message. @param Collection<int, Shift> $shifts */
    public function published(Collection $shifts): void
    {
        $this->safely(function () use ($shifts) {
            foreach ($shifts->groupBy('chef_id') as $chefId => $mine) {
                if ($chef = Chef::find($chefId)) {
                    $this->tell($chef->user_id, 'menu_rota_published', 'Your shifts', $mine->sortBy(fn ($s) => $s->shift_date->format('Y-m-d').$s->starts_at)->map(fn ($s) => $this->line($s))->implode(', ').'.');
                }
            }
        });
    }

    /** A shift the chef already knew about was changed or taken away. */
    public function changed(Shift $s, string $what): void
    {
        $this->safely(function () use ($s, $what) {
            if ($chef = Chef::find($s->chef_id)) {
                $this->tell($chef->user_id, 'menu_rota_changed', "Your shift was {$what}", $what === 'cancelled' ? "{$this->line($s)} is cancelled." : "Now {$this->line($s)}.");
            }
        });
    }

    public function requested(DayOff $d, Chef $c): void
    {
        $this->safely(function () use ($d, $c) {
            foreach ($this->staff->holding('menus.manage') as $u) {
                $this->notifier->send($u, 'menu_dayoff_requested', "{$c->display_name} asks for time off", $this->span($d).($d->reason ? ": {$d->reason}" : '.'), ['action_url' => '/admin/menus/rota', 'action_text' => 'Decide']);
            }
        });
    }

    public function decided(DayOff $d, Chef $c, int $shiftsRemoved): void
    {
        $this->safely(fn () => $this->tell($c->user_id, 'menu_dayoff_decided', $d->status === 'approved' ? 'Your time off is approved' : 'Your time off was not approved',
            $this->span($d).($d->status === 'approved' ? '.' : ($d->decision_note ? ": {$d->decision_note}" : '.')).($shiftsRemoved ? " {$shiftsRemoved} shift(s) in that time were taken off your rota." : '')));
    }

    // ── swaps ─────────────────────────────────────────────────────────────

    public function swapAsked(Swap $w, Shift $s, Chef $from, Chef $to, ?Shift $back): void
    {
        $this->safely(fn () => $this->tell($to->user_id, 'menu_swap_asked', "{$from->display_name} asks you to take a shift",
            $this->line($s).($back ? ", in return for your {$this->line($back)}" : '').($w->note ? " ({$w->note})" : '').'. Answer on the rota page.'));
    }

    public function swapAnswered(Swap $w, bool $accepted): void
    {
        $this->safely(function () use ($w, $accepted) {
            $from = Chef::find($w->from_chef_id);
            $to = Chef::find($w->to_chef_id);
            if ($from) {
                $this->tell($from->user_id, 'menu_swap_answered', $accepted ? "{$to?->display_name} agreed to the swap" : "{$to?->display_name} can not take the shift", $accepted ? 'It now waits for a manager to approve it.' : 'The shift stays yours.');
            }
        });
    }

    public function swapNeedsApproval(Swap $w, Shift $s): void
    {
        $this->safely(function () use ($w, $s) {
            $from = Chef::find($w->from_chef_id);
            $to = Chef::find($w->to_chef_id);
            foreach ($this->staff->holding('menus.manage') as $u) {
                $this->notifier->send($u, 'menu_swap_needs_approval', 'A shift swap needs approval', "{$from?->display_name} to {$to?->display_name}: {$this->line($s)}.", ['action_url' => '/admin/menus/rota', 'action_text' => 'Decide']);
            }
        });
    }

    public function swapDecided(Swap $w, bool $approved): void
    {
        $this->safely(function () use ($w, $approved) {
            foreach ([$w->from_chef_id, $w->to_chef_id] as $id) {
                if ($c = Chef::find($id)) {
                    $this->tell($c->user_id, 'menu_swap_decided', $approved ? 'The shift swap is done' : 'The shift swap was not approved', $approved ? 'Your rota has changed. Open the rota to see it.' : ($w->decision_note ?: 'The shifts stay as they were.'));
                }
            }
        });
    }

    // ── attendance and patterns ───────────────────────────────────────────

    /** A rostered chef has not signed in (or did not come): the managers are told once per shift. */
    public function notIn(Shift $s, Chef $c, string $state): void
    {
        $this->safely(function () use ($s, $c, $state) {
            foreach ($this->staff->holding('menus.manage') as $u) {
                $this->notifier->send($u, 'menu_rota_not_in', $state === 'no_show' ? "{$c->display_name} did not come" : "{$c->display_name} has not signed in",
                    "Rostered {$this->line($s)}".($state === 'no_show' ? ' and the shift is over.' : ' and the shift has started.'), ['action_url' => '/admin/menus/rota', 'action_text' => 'Open the rota']);
            }
        });
    }

    /** Shifts were planned from the weekly patterns as drafts: the managers should look and publish. */
    public function planned(int $n): void
    {
        $this->safely(function () use ($n) {
            foreach ($this->staff->holding('menus.manage') as $u) {
                $this->notifier->send($u, 'menu_rota_planned', "{$n} shift(s) planned from the weekly patterns", 'They are drafts: check them and publish the week so each chef is told.', ['action_url' => '/admin/menus/rota', 'action_text' => 'Open the rota']);
            }
        });
    }

    private function span(DayOff $d): string
    {
        return $d->from_date->eq($d->to_date) ? $d->from_date->format('D j M') : $d->from_date->format('D j M').' to '.$d->to_date->format('D j M');
    }

    private function safely(callable $fn): void
    {
        try {
            $fn();
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
