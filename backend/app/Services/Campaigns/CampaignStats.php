<?php

namespace App\Services\Campaigns;

use App\Models\Campaign;
use App\Models\CampaignEvent;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A campaign's numbers. Visits come from a small events log (a visit is stored as a hashed key, one view per visitor per day, and staff are not counted).
 * Sales are worked out from the books, not from checkout: posted invoices and cash sales that contain the campaign's featured items, dated inside the
 * campaign's window, less credit notes, in the base currency. Auction items are not counted (an auction is sold through its product).
 */
class CampaignStats
{
    public const EVENTS = ['view', 'click', 'item_click'];

    public function record(Campaign $c, string $event, ?int $sectionId, ?User $user, Request $r): void
    {
        if (! in_array($event, self::EVENTS, true) || ($user && ! ($user->isCustomer() || $user->isApplicant()))) {
            return;   // staff looking at their own campaign must not inflate it
        }
        $who = $user ? 'u' . $user->id : 'ip' . $r->ip() . substr((string) $r->userAgent(), 0, 80);
        $key = sha1($c->id . '|' . $who . ($event === 'view' ? '|' . now()->toDateString() : ''));
        if ($event === 'view' && CampaignEvent::where('campaign_id', $c->id)->where('event', 'view')->where('session_key', $key)->exists()) {
            return;   // one view per visitor per day
        }
        CampaignEvent::create(['campaign_id' => $c->id, 'section_id' => $sectionId, 'event' => $event, 'user_id' => $user?->id, 'session_key' => $key]);
    }

    public function visits(Campaign $c): array
    {
        $by = CampaignEvent::where('campaign_id', $c->id)->selectRaw('event, COUNT(*) as n')->groupBy('event')->pluck('n', 'event');
        $unique = CampaignEvent::where('campaign_id', $c->id)->where('event', 'view')->distinct()->count('session_key');
        $from = now()->subDays(29)->startOfDay();
        $daily = CampaignEvent::where('campaign_id', $c->id)->where('event', 'view')->where('created_at', '>=', $from)->selectRaw('DATE(created_at) as d, COUNT(*) as n')->groupBy('d')->pluck('n', 'd');
        $series = [];
        for ($i = 0; $i < 30; $i++) {
            $d = $from->copy()->addDays($i)->toDateString();
            $series[] = ['date' => $d, 'views' => (int) ($daily[$d] ?? 0)];
        }

        return ['views' => (int) ($by['view'] ?? 0), 'visitors' => $unique, 'clicks' => (int) ($by['click'] ?? 0), 'item_clicks' => (int) ($by['item_click'] ?? 0), 'daily' => $series];
    }

    /** @return array{window:?array,currency:?string,total:float,orders:int,units:float,items:array}|null */
    public function sales(Campaign $c): ?array
    {
        $from = ($c->starts_at ?? $c->published_at)?->copy()->setTimezone(config('app.timezone'))->toDateString();
        if (! $from) {
            return null;   // not started or published: nothing to count yet
        }
        $to = ($c->ends_at && $c->ends_at->isPast() ? $c->ends_at : now())->copy()->setTimezone(config('app.timezone'))->toDateString();
        $currency = DB::table('currencies')->where('is_base', true)->value('code');
        $out = ['window' => ['from' => $from, 'to' => $to], 'currency' => $currency, 'total' => 0.0, 'orders' => 0, 'units' => 0.0, 'items' => []];
        $orders = [];
        foreach ($c->items as $it) {
            $col = ['product' => 'i.product_id', 'service' => 'i.service_id', 'hamper' => 'i.hamper_id'][$it->item_type] ?? null;
            if (! $col) {
                continue;
            }
            $rows = DB::table('voucher_items as i')->join('vouchers as v', 'v.id', '=', 'i.voucher_id')->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id')
                ->where($col, $it->item_id)->when((int) $it->variant_id > 0, fn ($w) => $w->where('i.variant_id', (int) $it->variant_id))->where('v.status', 'posted')->whereIn('t.base_type', ['sales', 'cash_sale', 'credit_note'])->whereBetween('v.date', [$from, $to])
                ->where('i.item_type', '!=', 'charge')->when($it->item_type === 'hamper', fn ($w) => $w->where('i.is_header', true), fn ($w) => $w->where('i.is_header', false)->whereNull('i.parent_item_id'))
                ->get(['i.amount', 'i.quantity', 'v.exchange_rate', 'v.id as voucher_id', 't.base_type']);
            $amount = 0.0;
            $units = 0.0;
            foreach ($rows as $r) {
                $sign = $r->base_type === 'credit_note' ? -1 : 1;
                $amount += $sign * round((float) $r->amount * (float) ($r->exchange_rate ?: 1), 2);
                $units += $sign * (float) $r->quantity;
                if ($sign > 0) {
                    $orders[$r->voucher_id] = true;
                }
            }
            $out['items'][] = ['type' => $it->item_type, 'id' => $it->item_id, 'variant_id' => (int) $it->variant_id, 'amount' => round($amount, 2), 'units' => $units];
            $out['total'] += $amount;
            $out['units'] += $units;
        }
        $out['total'] = round($out['total'], 2);
        $out['orders'] = count($orders);
        $out['attributed'] = $this->attributed($c);

        return $out;
    }

    /**
     * Sales that came through the campaign: invoices and cash sales whose meta says so (a visitor opened one of its featured items in the 7 days before buying),
     * counting only the featured items' lines, less credit notes raised against those invoices. Receipts are not sales and are not counted.
     *
     * @return array{total:float,orders:int,units:float}
     */
    public function attributed(Campaign $c): array
    {
        $out = ['total' => 0.0, 'orders' => 0, 'units' => 0.0];
        $since = $c->created_at?->toDateString() ?? '2000-01-01';
        $metaOf = function ($raw) {
            $m = is_string($raw) ? json_decode($raw, true) : (array) $raw;

            return is_array($m) ? $m : [];
        };
        $orders = [];
        foreach ($c->items as $it) {
            $col = ['product' => 'i.product_id', 'hamper' => 'i.hamper_id'][$it->item_type] ?? null;   // checkout sells products and hampers
            if (! $col) {
                continue;
            }
            $rows = DB::table('voucher_items as i')->join('vouchers as v', 'v.id', '=', 'i.voucher_id')->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id')
                ->where($col, $it->item_id)->when((int) $it->variant_id > 0, fn ($w) => $w->where('i.variant_id', (int) $it->variant_id))->where('v.status', 'posted')->whereIn('t.base_type', ['sales', 'cash_sale', 'credit_note'])->where('v.date', '>=', $since)
                ->where('i.item_type', '!=', 'charge')->when($it->item_type === 'hamper', fn ($w) => $w->where('i.is_header', true), fn ($w) => $w->where('i.is_header', false)->whereNull('i.parent_item_id'))
                ->get(['i.amount', 'i.quantity', 'v.exchange_rate', 'v.id as voucher_id', 'v.meta', 'v.source_voucher_id', 't.base_type']);
            $originals = DB::table('vouchers')->whereIn('id', $rows->where('base_type', 'credit_note')->pluck('source_voucher_id')->filter()->unique()->all())->pluck('meta', 'id');
            foreach ($rows as $r) {
                $credit = $r->base_type === 'credit_note';
                $meta = $metaOf($credit ? ($originals[$r->source_voucher_id] ?? null) : $r->meta);   // a credit note follows the invoice it was raised against
                if ((int) ($meta['attribution']['campaign_id'] ?? 0) !== (int) $c->id) {
                    continue;
                }
                $sign = $credit ? -1 : 1;
                $out['total'] += $sign * round((float) $r->amount * (float) ($r->exchange_rate ?: 1), 2);
                $out['units'] += $sign * (float) $r->quantity;
                if (! $credit) {
                    $orders[$r->voucher_id] = true;
                }
            }
        }
        $out['total'] = round($out['total'], 2);
        $out['orders'] = count($orders);

        return $out;
    }

    /**
     * The pin sections' numbers: the pins a campaign shows (a board's pins, or the pins with a tag), how often customers saved them to their own boards,
     * how often they were downloaded (since script 84; all time), and how many customers' pins are in the gallery. Null when it has no such sections.
     */
    /** The pins a campaign's pin sections show: all of them, the gallery's, and how many sections there are. @return array{pins:int[],gallery:int[],sections:int} */
    private function pinSet(Campaign $c): array
    {
        $feed = app(Feed::class);
        $pinIds = [];
        $gallery = [];
        $sections = 0;
        foreach ($c->sections as $s) {
            $st = $s->settings ?? [];
            if ($s->type === 'pins' && ($st['source'] ?? '') === 'board' && ! empty($st['board_id'])) {
                $sections++;
                $pinIds = array_merge($pinIds, DB::table('campaign_board_pins')->where('board_id', $st['board_id'])->pluck('pin_id')->all());
            } elseif (in_array($s->type, ['pins', 'gallery'], true) && ! empty($st['tag'])) {
                $sections++;
                $q = $feed->publicPins()->where('tags', 'like', '%' . json_encode((string) $st['tag'], JSON_UNESCAPED_UNICODE) . '%')->when($s->type === 'gallery', fn ($w) => $w->where('campaign_pins.source', 'customer'));
                $ids = $q->limit(2000)->pluck('campaign_pins.id')->all();
                $pinIds = array_merge($pinIds, $ids);
                if ($s->type === 'gallery') {
                    $gallery = array_merge($gallery, $ids);
                }
            }
        }

        return ['pins' => array_values(array_unique($pinIds)), 'gallery' => array_values(array_unique($gallery)), 'sections' => $sections];
    }

    public function community(Campaign $c): ?array
    {
        ['pins' => $pinIds, 'gallery' => $gallery, 'sections' => $sections] = $this->pinSet($c);
        if (! $sections) {
            return null;
        }
        $saves = $pinIds ? DB::table('campaign_board_pins as bp')->join('campaign_boards as b', 'b.id', '=', 'bp.board_id')->whereNull('b.deleted_at')->where('b.is_official', false)->whereIn('bp.pin_id', $pinIds)->count() : 0;
        $downloads = $pinIds && Schema::hasColumn('campaign_pins', 'download_count') ? (int) DB::table('campaign_pins')->whereIn('id', $pinIds)->sum('download_count') : null;

        return ['pins' => count($pinIds), 'saves' => $saves, 'downloads' => $downloads, 'gallery_pins' => count($gallery)];
    }

    /**
     * What people did on the campaign itself and on the pins it shows: likes, published comments, and reports (open and all). Null when the Engagement Engine is off
     * or not set up, so the numbers page shows nothing rather than zeros.
     */
    public function engagement(Campaign $c): ?array
    {
        if (! \Illuminate\Support\Facades\Schema::hasTable('engagement_reactions') || ! app(\App\Services\Licensing\LicenseManager::class)->isActive('extras') || ! \App\Models\EngagementSetting::current()->enabled) {
            return null;
        }
        $pins = $this->pinSet($c)['pins'];
        $likes = fn ($type, $ids) => $ids ? (int) DB::table('engagement_reactions')->where('target_type', $type)->whereIn('target_id', $ids)->where('kind', 'like')->count() : 0;
        $comments = fn ($type, $ids) => $ids ? (int) DB::table('engagement_posts')->where('target_type', $type)->whereIn('target_id', $ids)->where('kind', 'comment')->where('status', 'published')->whereNull('deleted_at')->count() : 0;
        $reports = fn ($type, $ids, $open) => $ids ? (int) DB::table('engagement_reports')->where('target_type', $type)->whereIn('target_id', $ids)->when($open, fn ($w) => $w->where('status', 'open'))->count() : 0;

        return ['likes' => $likes('campaign', [$c->id]), 'pin_likes' => $likes('pin', $pins), 'comments' => $comments('campaign', [$c->id]), 'pin_comments' => $comments('pin', $pins),
            'reports' => $reports('campaign', [$c->id], false) + $reports('pin', $pins, false), 'open_reports' => $reports('campaign', [$c->id], true) + $reports('pin', $pins, true)];
    }
}
