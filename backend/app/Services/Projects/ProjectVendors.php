<?php

namespace App\Services\Projects;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** Vendors and their orders to choose from on the Site tab (stage 10: hired plant, subcontracts). Read from the Vendors module, never copied. */
class ProjectVendors
{
    /** @return array<int, array{id: int, name: string, number: ?string, orders: array}> */
    public function find(string $q): array
    {
        $q = trim($q);
        if (mb_strlen($q) < 2 || ! Schema::hasTable('vendors')) {
            return [];
        }
        $vendors = DB::table('vendors')->whereNull('deleted_at')->where(fn ($w) => $w->where('company_name', 'like', "%{$q}%")->orWhere('contact_name', 'like', "%{$q}%")->orWhere('vendor_number', 'like', "{$q}%"))
            ->orderBy('company_name')->limit(15)->get(['id', 'company_name', 'contact_name', 'vendor_number']);
        $orders = Schema::hasTable('vendor_orders') ? DB::table('vendor_orders')->whereIn('vendor_id', $vendors->pluck('id')->all() ?: [0])->where('status', '!=', 'cancelled')->orderByDesc('id')
            ->get(['id', 'vendor_id', 'po_number', 'status', 'subtotal', 'total'])->groupBy('vendor_id') : collect();

        return $vendors->map(fn ($v) => ['id' => (int) $v->id, 'name' => $v->company_name ?: $v->contact_name, 'number' => $v->vendor_number,
            'orders' => ($orders[$v->id] ?? collect())->take(20)->map(fn ($o) => ['id' => (int) $o->id, 'number' => $o->po_number, 'status' => $o->status])->values()->all()])->all();
    }
}
