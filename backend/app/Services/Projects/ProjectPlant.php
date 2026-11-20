<?php

namespace App\Services\Projects;

use App\Models\Inventory\InventoryAssignment;
use App\Models\Inventory\InventoryInstance;
use App\Models\User;
use App\Services\Inventory\InventoryTransactionService;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Plant on a piece of work (docs/PROJECTS_STAGE10_SPEC.md, build 10.2). Owned plant is equipment in Inventory: issued to the work and returned
 * through Inventory's own service, with the work as the holder, so the asset register always says where a piece is. Bookings ahead are kept
 * here and a booking that overlaps another work's is warned about, not refused. Hired plant is what, from whom, from and to, and the vendor
 * order that holds its cost (Projects stores none).
 */
class ProjectPlant
{
    public const HOLDER = 'project';

    public function __construct(private ProjectAccess $access, private InventoryTransactionService $inventory) {}

    /** @return array<string, mixed> */
    public function page(object $project, User $user): array
    {
        $this->access->authorize($user, 'open', $project);
        if (! ProjectsSetup::site()) {
            return ['ready' => false];
        }
        $inventory = Schema::hasTable('inventory_assignments') && Schema::hasTable('inventory_items');
        $holding = $inventory ? DB::table('inventory_assignments as a')->join('inventory_items as i', 'i.id', '=', 'a.item_id')->leftJoin('inventory_instances as n', 'n.id', '=', 'a.instance_id')
            ->where('a.assignee_type', self::HOLDER)->where('a.assignee_id', $project->id)->whereIn('a.status', ['active', 'overdue'])->orderBy('i.name')
            ->get(['a.id', 'a.item_id', 'a.instance_id', 'a.quantity', 'a.issued_at', 'a.expected_return_date', 'a.issue_condition', 'a.status', 'i.name', 'n.asset_tag', 'n.serial_number']) : collect();
        $bookings = DB::table('project_plant_bookings')->where('project_id', $project->id)->where('state', 'booked')->where('ends_on', '>=', now()->subDays(30)->toDateString())->orderBy('starts_on')->get();
        $items = $inventory ? DB::table('inventory_items')->whereIn('id', $bookings->pluck('item_id')->all() ?: [0])->pluck('name', 'id') : collect();
        $tags = $inventory && Schema::hasTable('inventory_instances') ? DB::table('inventory_instances')->whereIn('id', $bookings->pluck('instance_id')->filter()->all() ?: [0])->pluck('asset_tag', 'id') : collect();
        $hires = DB::table('project_plant_hires')->where('project_id', $project->id)->where('state', '!=', 'cancelled')->orderByRaw("CASE state WHEN 'on_hire' THEN 0 ELSE 1 END")->orderByDesc('starts_on')->get();
        $vendors = Schema::hasTable('vendors') ? DB::table('vendors')->whereIn('id', $hires->pluck('vendor_id')->filter()->all() ?: [0])->pluck('company_name', 'id') : collect();
        $orders = Schema::hasTable('vendor_orders') ? DB::table('vendor_orders')->whereIn('id', $hires->pluck('vendor_order_id')->filter()->all() ?: [0])->get(['id', 'po_number', 'status'])->keyBy('id') : collect();

        return ['ready' => true, 'inventory' => $inventory,
            'holding' => $holding->map(fn ($a) => ['id' => (int) $a->id, 'name' => $a->name, 'tag' => $a->asset_tag ?: $a->serial_number, 'quantity' => (float) $a->quantity, 'since' => $a->issued_at,
                'back_by' => $a->expected_return_date ? substr((string) $a->expected_return_date, 0, 10) : null, 'late' => $a->status === 'overdue' || ($a->expected_return_date && substr((string) $a->expected_return_date, 0, 10) < now()->toDateString()), 'condition' => $a->issue_condition])->all(),
            'bookings' => $bookings->map(fn ($b) => ['id' => (int) $b->id, 'item_id' => (int) $b->item_id, 'instance_id' => $b->instance_id ? (int) $b->instance_id : null, 'name' => $items[$b->item_id] ?? "Item {$b->item_id}",
                'tag' => $b->instance_id ? ($tags[$b->instance_id] ?? null) : null, 'quantity' => (float) $b->quantity, 'starts_on' => $b->starts_on, 'ends_on' => $b->ends_on, 'note' => $b->note,
                'clashes' => $this->clashes((int) $b->item_id, $b->instance_id ? (int) $b->instance_id : null, $b->starts_on, $b->ends_on, (int) $project->id)])->all(),
            'hires' => $hires->map(fn ($h) => ['id' => (int) $h->id, 'what' => $h->what, 'vendor' => $vendors[$h->vendor_id] ?? null, 'vendor_id' => $h->vendor_id ? (int) $h->vendor_id : null, 'starts_on' => $h->starts_on, 'ends_on' => $h->ends_on,
                'state' => $h->state, 'order' => $h->vendor_order_id && isset($orders[$h->vendor_order_id]) ? ['id' => (int) $h->vendor_order_id, 'number' => $orders[$h->vendor_order_id]->po_number, 'status' => $orders[$h->vendor_order_id]->status] : null, 'note' => $h->note])->all(),
            'can' => ['book' => $this->access->decide($user, 'plant', $project)['allowed'], 'issue' => $this->mayIssue($user, $project)]];
    }

    /** Equipment to choose from, with what is free now. @return array<int, array<string, mixed>> */
    public function find(string $q): array
    {
        $q = trim($q);
        if (mb_strlen($q) < 2 || ! Schema::hasTable('inventory_items')) {
            return [];
        }
        $items = DB::table('inventory_items')->where('is_active', 1)->where(fn ($w) => $w->where('name', 'like', "%{$q}%")->orWhere('model', 'like', "%{$q}%")->orWhere('brand', 'like', "%{$q}%"))->orderBy('name')->limit(15)
            ->get(['id', 'name', 'brand', 'model', 'is_serialized', 'available_qty']);
        $instances = Schema::hasTable('inventory_instances') ? DB::table('inventory_instances')->whereIn('item_id', $items->where('is_serialized', 1)->pluck('id')->all() ?: [0])->where('is_obsolete', 0)
            ->orderBy('asset_tag')->get(['id', 'item_id', 'asset_tag', 'serial_number', 'status'])->groupBy('item_id') : collect();

        return $items->map(fn ($i) => ['id' => (int) $i->id, 'name' => $i->name, 'detail' => trim("{$i->brand} {$i->model}") ?: null, 'serialized' => (bool) $i->is_serialized, 'available' => (float) $i->available_qty,
            'pieces' => ($instances[$i->id] ?? collect())->map(fn ($n) => ['id' => (int) $n->id, 'tag' => $n->asset_tag ?: $n->serial_number, 'free' => $n->status === 'available'])->values()->all()])->all();
    }

    /** @param array<string, mixed> $d item_id, instance_id, quantity, starts_on, ends_on, note @return array{id: int, clashes: array} */
    public function book(object $project, array $d, User $by): array
    {
        $this->access->authorize($by, 'plant', $project);
        $this->needSite();
        $item = (int) ($d['item_id'] ?? 0);
        $instance = ! empty($d['instance_id']) ? (int) $d['instance_id'] : null;
        $name = Schema::hasTable('inventory_items') ? DB::table('inventory_items')->where('id', $item)->value('name') : null;
        $name || throw new ProjectException('Choose the equipment from the asset register.');
        if ($instance && ! DB::table('inventory_instances')->where('id', $instance)->where('item_id', $item)->exists()) {
            throw new ProjectException('That piece is not one of these.');
        }
        [$from, $to] = [$this->date($d['starts_on'] ?? null, 'Choose the first day.'), $this->date($d['ends_on'] ?? null, 'Choose the last day.')];
        $to >= $from || throw new ProjectException('The last day cannot be before the first.');
        $qty = $instance ? 1.0 : max(0.01, round((float) ($d['quantity'] ?? 1), 2));
        $id = DB::table('project_plant_bookings')->insertGetId(['project_id' => $project->id, 'item_id' => $item, 'instance_id' => $instance, 'quantity' => $qty, 'starts_on' => $from, 'ends_on' => $to,
            'state' => 'booked', 'note' => ! empty($d['note']) ? mb_substr(trim((string) $d['note']), 0, 300) : null, 'booked_by' => $by->id, 'created_at' => now(), 'updated_at' => now()]);
        $clashes = $this->clashes($item, $instance, $from, $to, (int) $project->id);
        ProjectLog::record((int) $project->id, $by, 'plant.booked', 'plant_booking', $id, null, ['item' => $name, 'from' => $from, 'to' => $to, 'clashes' => count($clashes)]);

        return ['id' => $id, 'clashes' => $clashes];
    }

    public function cancelBooking(object $project, int $id, User $by): void
    {
        $this->access->authorize($by, 'plant', $project);
        DB::table('project_plant_bookings')->where('id', $id)->where('project_id', $project->id)->where('state', 'booked')->update(['state' => 'cancelled', 'updated_at' => now()]) || throw new ProjectException('That booking is not on this work.', 404);
        ProjectLog::record((int) $project->id, $by, 'plant.booking_cancelled', 'plant_booking', $id, null, null);
    }

    /** Issue a piece (or a number of a bulk item) to the work through Inventory. @param array<string, mixed> $d instance_id | item_id + quantity, back_by, condition, note */
    public function issue(object $project, array $d, User $by): void
    {
        $this->mayIssue($by, $project) || throw new ProjectException('Issuing plant needs Projects plant and the asset register.', 403);
        in_array($project->state, ['open', 'on_hold'], true) || throw new ProjectException('This work is closed. Nothing more can be issued to it.');
        Schema::hasTable('inventory_assignments') || throw new ProjectException('The asset register is not here.', 409);
        $data = ['assignee_type' => self::HOLDER, 'assignee_id' => (int) $project->id, 'assignee_label' => mb_substr("{$project->number} {$project->title}", 0, 255), 'issued_by' => $by->id,
            'expected_return_date' => ! empty($d['back_by']) ? $this->date($d['back_by'], 'Choose the day it comes back.') : null, 'issue_notes' => ! empty($d['note']) ? mb_substr(trim((string) $d['note']), 0, 500) : null]
            + (! empty($d['condition']) ? ['issue_condition' => in_array($d['condition'], ['new', 'excellent', 'good', 'fair', 'poor', 'damaged'], true) ? $d['condition'] : throw new ProjectException('Choose its condition.')] : []);
        try {
            if (! empty($d['instance_id'])) {
                $a = $this->inventory->issueInstance(InventoryInstance::findOrFail((int) $d['instance_id']), $data);
            } else {
                $qty = round((float) ($d['quantity'] ?? 0), 2);
                $qty > 0 || throw new ProjectException('Say how many.');
                $a = $this->inventory->issueBulk($data + ['item_id' => (int) ($d['item_id'] ?? 0), 'quantity' => $qty]);
            }
        } catch (\RuntimeException|\LogicException $e) {
            throw new ProjectException($this->words($e->getMessage()));
        } catch (\Illuminate\Database\Eloquent\ModelNotFoundException) {
            throw new ProjectException('Choose the equipment from the asset register.');
        }
        ProjectLog::record((int) $project->id, $by, 'plant.issued', 'inventory_assignment', (int) $a->id, null, ['item' => DB::table('inventory_items')->where('id', $a->item_id)->value('name'), 'quantity' => (float) $a->quantity]);
    }

    /** It comes back off the work, with the condition it is in. */
    public function giveBack(object $project, int $assignmentId, ?string $condition, ?string $note, User $by): void
    {
        $this->mayIssue($by, $project) || throw new ProjectException('Returning plant needs Projects plant and the asset register.', 403);
        $a = InventoryAssignment::where('id', $assignmentId)->where('assignee_type', self::HOLDER)->where('assignee_id', $project->id)->first() ?? throw new ProjectException('That is not held by this work.', 404);
        if ($condition && ! in_array($condition, ['new', 'excellent', 'good', 'fair', 'poor', 'damaged', 'unusable'], true)) {
            throw new ProjectException('Choose its condition.');
        }
        try {
            $this->inventory->returnAssignment($a, ['received_by' => $by->id, 'return_condition' => $condition, 'return_notes' => $note ? mb_substr(trim($note), 0, 500) : null]);
        } catch (\RuntimeException|\LogicException $e) {
            throw new ProjectException($this->words($e->getMessage()));
        }
        ProjectLog::record((int) $project->id, $by, 'plant.returned', 'inventory_assignment', $assignmentId, null, ['condition' => $condition]);
    }

    /** @param array<string, mixed> $d what, vendor_id, vendor_order_id, starts_on, ends_on, note @return int */
    public function hire(object $project, array $d, User $by): int
    {
        $this->access->authorize($by, 'plant', $project);
        $this->needSite();
        $what = trim((string) ($d['what'] ?? ''));
        $what !== '' || throw new ProjectException('Say what is hired.');
        $vendor = ! empty($d['vendor_id']) ? (int) $d['vendor_id'] : null;
        if ($vendor && ! (Schema::hasTable('vendors') && DB::table('vendors')->where('id', $vendor)->exists())) {
            throw new ProjectException('Choose a vendor.');
        }
        $order = ! empty($d['vendor_order_id']) ? (int) $d['vendor_order_id'] : null;
        if ($order) {
            $o = Schema::hasTable('vendor_orders') ? DB::table('vendor_orders')->where('id', $order)->first() : null;
            $o || throw new ProjectException('Choose a vendor order.');
            if ($vendor && (int) $o->vendor_id !== $vendor) {
                throw new ProjectException('That vendor order is with another vendor.');
            }
            $vendor ??= (int) $o->vendor_id;
        }
        $from = $this->date($d['starts_on'] ?? null, 'Choose the day it comes on hire.');
        $to = ! empty($d['ends_on']) ? $this->date($d['ends_on'], 'Choose the day it goes off hire.') : null;
        if ($to && $to < $from) {
            throw new ProjectException('It cannot go off hire before it comes on.');
        }
        $id = DB::table('project_plant_hires')->insertGetId(['project_id' => $project->id, 'vendor_id' => $vendor, 'what' => mb_substr($what, 0, 200), 'starts_on' => $from, 'ends_on' => $to, 'vendor_order_id' => $order,
            'state' => 'on_hire', 'note' => ! empty($d['note']) ? mb_substr(trim((string) $d['note']), 0, 300) : null, 'created_by' => $by->id, 'created_at' => now(), 'updated_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'plant.hired', 'plant_hire', $id, null, ['what' => $what, 'vendor_order' => $order]);

        return $id;
    }

    /** Off hire on a day (today when none is given), or cancelled when it never came. */
    public function offHire(object $project, int $id, ?string $on, bool $cancel, User $by): void
    {
        $this->access->authorize($by, 'plant', $project);
        $h = DB::table('project_plant_hires')->where('id', $id)->where('project_id', $project->id)->where('state', 'on_hire')->first() ?? throw new ProjectException('That hire is not on hire on this work.', 404);
        $day = $on ? $this->date($on, 'Choose the day it went off hire.') : now()->toDateString();
        if (! $cancel && $day < $h->starts_on) {
            throw new ProjectException('It cannot go off hire before it came on.');
        }
        DB::table('project_plant_hires')->where('id', $id)->update($cancel ? ['state' => 'cancelled', 'updated_at' => now()] : ['state' => 'off_hire', 'ends_on' => $day, 'updated_at' => now()]);
        ProjectLog::record((int) $project->id, $by, $cancel ? 'plant.hire_cancelled' : 'plant.off_hire', 'plant_hire', $id, null, $cancel ? null : ['on' => $day]);
    }

    /** Plant for the daily record: what the work holds and what is on hire on a day. @return array<int, array<string, mixed>> */
    public function onSite(object $project, string $day): array
    {
        $out = [];
        if (Schema::hasTable('inventory_assignments')) {
            foreach (DB::table('inventory_assignments as a')->join('inventory_items as i', 'i.id', '=', 'a.item_id')->leftJoin('inventory_instances as n', 'n.id', '=', 'a.instance_id')
                ->where('a.assignee_type', self::HOLDER)->where('a.assignee_id', $project->id)->whereIn('a.status', ['active', 'overdue'])->whereNotNull('a.instance_id')->get(['a.instance_id', 'i.name', 'n.asset_tag']) as $a) {
                $out[] = ['instance_id' => (int) $a->instance_id, 'hire_id' => null, 'name' => $a->name . ($a->asset_tag ? " ({$a->asset_tag})" : '')];
            }
        }
        foreach (DB::table('project_plant_hires')->where('project_id', $project->id)->where('state', '!=', 'cancelled')->where('starts_on', '<=', $day)->where(fn ($q) => $q->whereNull('ends_on')->orWhere('ends_on', '>=', $day))->get(['id', 'what']) as $h) {
            $out[] = ['instance_id' => null, 'hire_id' => (int) $h->id, 'name' => "{$h->what} (hired)"];
        }

        return $out;
    }

    public function mayIssue(User $user, object $project): bool
    {
        return $user->hasPermission('inventory.manage') && $this->access->decide($user, 'plant', $project)['allowed'];
    }

    // ------------------------------------------------------------------ inside

    /** Other works' bookings of the same equipment that overlap, and the piece being out elsewhere now. @return array<int, string> */
    private function clashes(int $item, ?int $instance, string $from, string $to, int $projectId): array
    {
        $q = DB::table('project_plant_bookings as b')->join('projects as p', 'p.id', '=', 'b.project_id')->where('b.state', 'booked')->where('b.project_id', '!=', $projectId)
            ->where('b.starts_on', '<=', $to)->where('b.ends_on', '>=', $from)->where('b.item_id', $item);
        if ($instance) {
            $q->where(fn ($w) => $w->whereNull('b.instance_id')->orWhere('b.instance_id', $instance));
        }
        $out = $q->orderBy('b.starts_on')->get(['p.number', 'b.starts_on', 'b.ends_on'])->map(fn ($b) => "Booked for {$b->number} from " . Carbon::parse($b->starts_on)->format('j M') . ' to ' . Carbon::parse($b->ends_on)->format('j M'))->all();
        if ($instance && $from <= now()->toDateString() && Schema::hasTable('inventory_instances')) {
            $n = DB::table('inventory_instances')->where('id', $instance)->first(['status', 'current_assignee_type', 'current_assignee_id', 'current_assignee_label']);
            if ($n && $n->status !== 'available' && ! ($n->current_assignee_type === self::HOLDER && (int) $n->current_assignee_id === $projectId)) {
                $out[] = 'Out now' . ($n->current_assignee_label ? " with {$n->current_assignee_label}" : " ({$n->status})");
            }
        }

        return $out;
    }

    private function words(string $m): string
    {
        if (str_contains($m, 'Insufficient available qty')) {
            return 'Not that many are free in the asset register. ' . trim((string) preg_replace('/.*Available:/', 'Free now:', $m)) . '.';
        }
        if (str_contains($m, 'is not available')) {
            return 'That piece is not free: it is out or being repaired.';
        }
        if (str_contains($m, 'obsolete')) {
            return 'That piece is marked as no longer used.';
        }

        return $m;
    }

    private function date(mixed $v, string $problem): string
    {
        return is_string($v) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) ? $v : throw new ProjectException($problem);
    }

    private function needSite(): void
    {
        ProjectsSetup::site() || throw new ProjectException('The site is not set up yet. Run script 267.', 409);
    }
}
