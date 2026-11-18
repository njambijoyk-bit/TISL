<?php

namespace App\Services\Projects\Links;

use App\Services\Projects\ProjectLinkTypes;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Core's records that can be attached to a piece of work (docs/PROJECTS_STAGE7_SPEC.md, build 7.2): support tickets, bookings, products and
 * services, vendors and their orders, tenders and customers' quotation requests. Each behind its own module's permission; tenders come with the
 * Extras module. Everything shown is read from the record each time.
 */
class CoreLinks
{
    public static function register(ProjectLinkTypes $types): void
    {
        self::type($types, 'support.ticket', null, 'Support ticket', 'Support tickets', 'tickets.manage', 'tickets', ['ticket_number', 'subject'], true,
            ['id', 'ticket_number', 'subject', 'status', 'priority'],
            fn ($r) => ['title' => trim("{$r->ticket_number} · {$r->subject}"), 'detail' => ucfirst((string) $r->priority) . ' priority', 'url' => "/admin/tickets/{$r->id}", 'state' => $r->status],
            ['open' => ['Open', 'info'], 'in_progress' => ['In progress', 'info'], 'waiting_customer' => ['Waiting for the customer', 'warning'], 'resolved' => ['Resolved', 'good'], 'closed' => ['Closed', null]],
            'related');

        self::type($types, 'bookings.booking', null, 'Booking', 'Bookings', 'bookings.manage', 'bookings', ['number'], false,
            ['id', 'number', 'starts_at', 'people', 'status'],
            fn ($r) => ['title' => 'Booking ' . ($r->number ?: "#{$r->id}"), 'detail' => trim(substr((string) $r->starts_at, 0, 16) . ($r->people ? " · {$r->people} people" : '')), 'url' => "/admin/bookings?id={$r->id}", 'state' => $r->status],
            ['pending' => ['Waiting', 'warning'], 'confirmed' => ['Confirmed', 'good'], 'completed' => ['Done', 'good'], 'cancelled' => ['Cancelled', 'problem'], 'no_show' => ['Did not come', 'problem']],
            'related');

        self::type($types, 'catalogue.product', null, 'Product or service', 'Products and services', 'catalogue.view', 'products', ['name', 'sku'], true,
            ['id', 'name', 'sku', 'type'],
            fn ($r) => ['title' => $r->name, 'detail' => implode(' · ', array_filter([$r->sku, $r->type ? ucfirst((string) $r->type) : null])) ?: null, 'url' => "/admin/products/{$r->id}/edit"],
            [], 'deliverable');

        self::type($types, 'vendors.vendor', null, 'Vendor', 'Vendors', 'vendors.view', 'vendors', ['company_name', 'vendor_number', 'contact_name'], true,
            ['id', 'vendor_number', 'company_name', 'contact_name', 'status'],
            fn ($r) => ['title' => $r->company_name, 'detail' => implode(' · ', array_filter([$r->vendor_number, $r->contact_name])) ?: null, 'url' => "/admin/vendors/{$r->id}", 'state' => $r->status],
            ['active' => ['Active', 'good'], 'pending_approval' => ['Waiting for approval', 'warning'], 'suspended' => ['Suspended', 'problem'], 'inactive' => ['Not active', null]],
            'supplier');

        self::type($types, 'vendors.order', null, 'Vendor order', 'Vendor orders', 'vendors.view', 'vendor_orders', ['po_number'], true,
            ['id', 'po_number', 'vendor_id', 'status', 'currency', 'total'],
            fn ($r) => ['title' => "Order {$r->po_number}", 'detail' => self::vendorName((int) $r->vendor_id), 'url' => "/admin/vendors/{$r->vendor_id}", 'state' => $r->status,
                'amount' => $r->total === null ? null : (float) $r->total, 'currency' => $r->currency ?: null],
            ['draft' => ['Draft', null], 'sent' => ['Sent', 'info'], 'confirmed' => ['Confirmed', 'info'], 'partially_received' => ['Partly received', 'warning'], 'received' => ['Received', 'good'], 'cancelled' => ['Cancelled', 'problem']],
            'supplier');

        self::type($types, 'tenders.tender', 'extras', 'Tender', 'Tenders', 'tenders.view', 'tenders', ['tender_number', 'title'], false,
            ['id', 'tender_number', 'title', 'status'],
            fn ($r) => ['title' => "{$r->tender_number} · {$r->title}", 'detail' => null, 'url' => "/admin/tenders/{$r->id}", 'state' => $r->status],
            ['draft' => ['Draft', null], 'published' => ['Published', 'info'], 'closed' => ['Closed', null], 'evaluating' => ['Being evaluated', 'warning'], 'awarded' => ['Awarded', 'good'], 'cancelled' => ['Cancelled', 'problem']],
            'related', '/admin/tenders/new');

        self::type($types, 'quotes.request', null, 'Quotation request', 'Quotation requests', 'quotes.view', 'quote_requests', ['request_number', 'request_title'], false,
            ['id', 'request_number', 'request_title', 'status'],
            fn ($r) => ['title' => "{$r->request_number} · {$r->request_title}", 'detail' => null, 'url' => "/admin/quotes/{$r->id}", 'state' => $r->status],
            ['pending' => ['Waiting', 'warning'], 'reviewing' => ['Being looked at', 'info'], 'quoted' => ['Quoted', 'good'], 'rejected' => ['Turned down', 'problem'], 'expired' => ['Expired', null]],
            'related');
    }

    /**
     * One link type over one table. @param string[] $find columns searched @param string[] $cols columns read
     * @param callable(object): array<string, mixed> $shape @param array<string, array{0: string, 1: ?string}> $states
     */
    public static function type(ProjectLinkTypes $types, string $key, ?string $module, string $label, string $plural, string $permission, string $table, array $find, bool $soft,
        array $cols, callable $shape, array $states = [], ?string $role = null, ?string $newPath = null): void
    {
        $base = function () use ($table, $soft) {
            $q = DB::table($table);

            return $soft && Schema::hasColumn($table, 'deleted_at') ? $q->whereNull('deleted_at') : $q;
        };
        $read = function ($query) use ($cols, $table, $shape) {
            $have = array_values(array_filter($cols, fn ($c) => Schema::hasColumn($table, $c)));

            return $query->get($have)->map(fn ($r) => ['id' => (int) $r->id] + $shape((object) ((array) $r + array_fill_keys($cols, null))));
        };
        $types->register($key, ['module' => $module, 'label' => $label, 'plural' => $plural, 'permission' => $permission, 'states' => $states, 'role' => $role,
            ...($newPath ? ['create' => fn (object $project): array => [['label' => $label, 'url' => "{$newPath}?for_project={$project->id}"]]] : []),
            'search' => function (string $q) use ($table, $find, $base, $read): array {
                if (! Schema::hasTable($table)) {
                    return [];
                }
                $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\%', '\_'], trim($q)) . '%';
                $find = array_values(array_filter($find, fn ($c) => Schema::hasColumn($table, $c)));

                return $read($base()->when(trim($q) !== '' && $find, fn ($w) => $w->where(fn ($x) => array_map(fn ($c) => $x->orWhere($c, 'like', $like), $find)))->orderByDesc('id')->limit(20))
                    ->map(fn ($r) => ['id' => $r['id'], 'title' => $r['title'], 'detail' => $r['detail'] ?? null])->values()->all();
            },
            'describe' => fn (array $ids): array => Schema::hasTable($table) ? $read(DB::table($table)->whereIn('id', $ids))->keyBy('id')->all() : [],
        ]);
    }

    private static function vendorName(int $id): ?string
    {
        return Schema::hasTable('vendors') ? DB::table('vendors')->where('id', $id)->value('company_name') : null;
    }
}
