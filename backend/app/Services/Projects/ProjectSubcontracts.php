<?php

namespace App\Services\Projects;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Subcontracts and claims (docs/PROJECTS_STAGE10_SPEC.md, build 10.3). A subcontract is a vendor, what they do, and the vendor order that holds
 * the agreed value (read, never copied). A claim is how far the work is, as a cumulative percentage; certifying a percentage posts a supplier
 * bill in Books for the difference since the last certificate, on the work's cost centre, and holds retention back with a journal settled
 * against that bill. Releasing retention at the end is a journal the other way. Projects keeps percentages only; every amount is a voucher.
 */
class ProjectSubcontracts
{
    public function __construct(private ProjectAccess $access) {}

    /** @return array<string, mixed> */
    public function page(object $project, User $user): array
    {
        $this->access->authorize($user, 'open', $project);
        if (! ProjectsSetup::site()) {
            return ['ready' => false];
        }
        $money = $this->access->decide($user, 'money', $project)['allowed'];
        $subs = DB::table('project_subcontracts')->where('project_id', $project->id)->whereNull('deleted_at')->orderByRaw("CASE state WHEN 'active' THEN 0 ELSE 1 END")->orderBy('id')->get();
        $site = app(ProjectSettings::class)->get('site');

        return ['ready' => true, 'subcontracts' => $subs->map(fn ($s) => $this->shape($s, $money))->all(),
            'ledgers_chosen' => $site['sub_cost_ledger_id'] > 0 && $site['sub_retention_ledger_id'] > 0,
            'can' => ['manage' => $this->access->decide($user, 'subcontracts', $project)['allowed'], 'money' => $money]];
    }

    /** @param array<string, mixed> $d vendor_id, title, scope, vendor_order_id, retention_pct, starts_on, ends_on @return int */
    public function create(object $project, array $d, User $by): int
    {
        $this->access->authorize($by, 'subcontracts', $project);
        $this->needSite();
        $vendor = (int) ($d['vendor_id'] ?? 0);
        (Schema::hasTable('vendors') && DB::table('vendors')->where('id', $vendor)->whereNull('deleted_at')->exists()) || throw new ProjectException('Choose the subcontractor from the vendors.');
        $title = trim((string) ($d['title'] ?? ''));
        $title !== '' || throw new ProjectException('Say what the subcontract is for.');
        $row = ['project_id' => $project->id, 'vendor_id' => $vendor, 'title' => mb_substr($title, 0, 200), 'scope' => ! empty($d['scope']) ? mb_substr(trim((string) $d['scope']), 0, 5000) : null,
            'vendor_order_id' => $this->order($d['vendor_order_id'] ?? null, $vendor), 'retention_pct' => $this->retention($d['retention_pct'] ?? 0),
            'starts_on' => $this->day($d['starts_on'] ?? null), 'ends_on' => $this->day($d['ends_on'] ?? null), 'state' => 'active', 'created_by' => $by->id, 'created_at' => now(), 'updated_at' => now()];
        $id = DB::table('project_subcontracts')->insertGetId($row);
        ProjectLog::record((int) $project->id, $by, 'subcontract.added', 'subcontract', $id, null, ['vendor' => $this->vendorName($vendor), 'title' => $title]);

        return $id;
    }

    /** @param array<string, mixed> $d title, scope, starts_on, ends_on, state, and while nothing is certified: vendor_order_id, retention_pct */
    public function update(object $project, int $id, array $d, User $by): void
    {
        $this->access->authorize($by, 'subcontracts', $project);
        $s = $this->sub($project, $id);
        $certified = DB::table('project_sub_claims')->where('subcontract_id', $id)->where('state', 'certified')->exists();
        $row = [];
        if (array_key_exists('title', $d)) {
            $t = trim((string) $d['title']);
            $t !== '' || throw new ProjectException('Say what the subcontract is for.');
            $row['title'] = mb_substr($t, 0, 200);
        }
        foreach (['starts_on', 'ends_on'] as $k) {
            if (array_key_exists($k, $d)) {
                $row[$k] = $this->day($d[$k]);
            }
        }
        if (array_key_exists('scope', $d)) {
            $row['scope'] = $d['scope'] ? mb_substr(trim((string) $d['scope']), 0, 5000) : null;
        }
        if (array_key_exists('state', $d)) {
            in_array($d['state'], ['active', 'complete', 'ended'], true) || throw new ProjectException('Choose active, complete or ended.');
            $row['state'] = $d['state'];
        }
        foreach (['vendor_order_id', 'retention_pct'] as $k) {
            if (array_key_exists($k, $d) && $certified && (string) $d[$k] !== (string) $s->{$k}) {
                throw new ProjectException('A claim is already certified, so the vendor order and retention stay as they are.');
            }
        }
        if (array_key_exists('vendor_order_id', $d)) {
            $row['vendor_order_id'] = $this->order($d['vendor_order_id'], (int) $s->vendor_id);
        }
        if (array_key_exists('retention_pct', $d)) {
            $row['retention_pct'] = $this->retention($d['retention_pct']);
        }
        if ($row) {
            DB::table('project_subcontracts')->where('id', $id)->update($row + ['updated_at' => now()]);
            ProjectLog::record((int) $project->id, $by, 'subcontract.changed', 'subcontract', $id, null, $row);
        }
    }

    /**
     * A claim: how far the work is, as a percentage of the whole. Made on the work, or by the subcontractor on their portal (10.4).
     * @param array<string, mixed> $d claimed_pct, period_to, note
     */
    public function claim(object $project, int $subId, array $d, ?User $by, bool $byVendor = false, ?int $fileId = null): int
    {
        if (! $byVendor) {
            $this->access->authorize($by, 'subcontracts', $project);
        }
        $s = $this->sub($project, $subId);
        $s->state === 'active' || throw new ProjectException('This subcontract is not active.');
        DB::table('project_sub_claims')->where('subcontract_id', $subId)->where('state', 'submitted')->exists() && throw new ProjectException('A claim is already waiting to be certified.');
        $pct = round((float) ($d['claimed_pct'] ?? 0), 4);
        $done = $this->certifiedPct($subId);
        if ($pct <= $done || $pct > 100) {
            throw new ProjectException('Claim how far the whole work is, between ' . $this->pct($done) . '% (certified so far) and 100%.');
        }
        $number = (int) DB::table('project_sub_claims')->where('subcontract_id', $subId)->max('number') + 1;
        $id = DB::table('project_sub_claims')->insertGetId(['subcontract_id' => $subId, 'number' => $number, 'period_to' => $this->day($d['period_to'] ?? null), 'claimed_pct' => $pct,
            'state' => 'submitted', 'note' => ! empty($d['note']) ? mb_substr(trim((string) $d['note']), 0, 1000) : null, 'file_id' => $fileId, 'by_user_id' => $by?->id, 'by_vendor' => $byVendor ? 1 : 0, 'created_at' => now(), 'updated_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'subcontract.claimed', 'subcontract', $subId, null, ['claim' => $number, 'pct' => $pct, 'by_vendor' => $byVendor]);
        if ($byVendor) {
            ProjectNotices::tell(app(\App\Services\Notify\Staff::class)->holding('projects.subcontracts')->filter(fn ($u) => $this->access->decide($u, 'subcontracts', $project)['allowed']),
                ProjectNotices::TASK, "Claim {$number} from {$this->vendorName((int) $s->vendor_id)} · {$project->number}", "{$s->title}: {$this->pct($pct)}% done.", "/admin/projects/{$project->id}?tab=site&part=subcontracts", 'Certify it');
        }

        return $id;
    }

    /** Certify a claim at a percentage (no more than claimed): the bill for the difference and the retention held back go into Books. */
    public function certify(object $project, int $claimId, float $pct, ?string $note, User $by): void
    {
        $this->access->authorize($by, 'subcontracts', $project);
        [$c, $s] = $this->openClaim($project, $claimId);
        $pct = round($pct, 4);
        $before = $this->certifiedPct((int) $s->id);
        if ($pct < $before || $pct > (float) $c->claimed_pct) {
            throw new ProjectException('Certify between ' . $this->pct($before) . '% (certified so far) and ' . $this->pct((float) $c->claimed_pct) . '% (claimed).');
        }
        $value = $this->value($s) ?? throw new ProjectException('Choose the vendor order that holds the agreed value first.');
        $site = app(ProjectSettings::class)->get('site');
        $amount = round($value * ($pct - $before) / 100, 2);
        $retain = round($amount * (float) $s->retention_pct / 100, 2);
        if ($amount > 0 && ! $site['sub_cost_ledger_id']) {
            throw new ProjectException('Choose the ledger subcontract costs go to in Configuration → Site first.', 409);
        }
        if ($retain > 0 && ! $site['sub_retention_ledger_id']) {
            throw new ProjectException('Choose the ledger subcontract retention is held in, in Configuration → Site, first.', 409);
        }
        $vendor = $this->vendorName((int) $s->vendor_id);

        DB::transaction(function () use ($project, $c, $s, $pct, $note, $by, $amount, $retain, $site, $vendor) {
            $bill = null;
            $held = null;
            if ($amount > 0) {
                $poster = app(ProjectVoucherPoster::class);
                $bill = $poster->purchase(now()->toDateString(), (int) $s->vendor_id, [['type' => 'custom', 'description' => "{$s->title}: claim {$c->number}, certified to {$this->pct($pct)}% for {$project->number}", 'quantity' => 1, 'rate' => $amount,
                    'ledger_id' => (int) $site['sub_cost_ledger_id']]], $project->cost_centre_id ? (int) $project->cost_centre_id : null, "Subcontract claim {$c->number}: {$vendor}, {$project->number}", "SC-{$s->id}-{$c->number}", $by);
                if ($retain > 0) {
                    $held = $poster->journal(now()->toDateString(), "Retention held on {$bill['number']} ({$this->pct((float) $s->retention_pct)}%): {$vendor}, {$project->number}", $bill['number'], [
                        ['ledger_id' => $bill['party_ledger_id'], 'side' => 'D', 'amount' => $retain, 'is_party' => true, 'cost_centre_id' => $project->cost_centre_id],
                        ['ledger_id' => (int) $site['sub_retention_ledger_id'], 'side' => 'C', 'amount' => $retain, 'cost_centre_id' => $project->cost_centre_id],
                    ], $by, [['against_voucher_id' => $bill['id'], 'amount' => $retain]]);
                }
            }
            DB::table('project_sub_claims')->where('id', $c->id)->update(['certified_pct' => $pct, 'state' => 'certified', 'answer_note' => $note ? mb_substr(trim($note), 0, 1000) : null, 'certified_by' => $by->id,
                'certified_at' => now(), 'voucher_id' => $bill['id'] ?? null, 'retention_voucher_id' => $held, 'updated_at' => now()]);
            ProjectLog::record((int) $project->id, $by, 'subcontract.certified', 'subcontract', (int) $s->id, null, ['claim' => (int) $c->number, 'pct' => $pct, 'bill' => $bill['number'] ?? null, 'retention_journal' => $held]);
        });
        $this->tellVendor($s, $project, "Claim {$c->number} certified · {$project->number}", "{$s->title}: certified to {$this->pct($pct)}%." . ($note ? "\n{$note}" : ''));
    }

    public function reject(object $project, int $claimId, string $note, User $by): void
    {
        $this->access->authorize($by, 'subcontracts', $project);
        [$c, $s] = $this->openClaim($project, $claimId);
        trim($note) !== '' || throw new ProjectException('Say why the claim is not certified.');
        DB::table('project_sub_claims')->where('id', $c->id)->update(['state' => 'rejected', 'answer_note' => mb_substr(trim($note), 0, 1000), 'certified_by' => $by->id, 'certified_at' => now(), 'updated_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'subcontract.claim_rejected', 'subcontract', (int) $s->id, null, ['claim' => (int) $c->number]);
        $this->tellVendor($s, $project, "Claim {$c->number} not certified · {$project->number}", "{$s->title}: {$note}");
    }

    /** At the end: everything held back goes back on the subcontractor's account (a journal the other way), once. */
    public function release(object $project, int $subId, User $by): void
    {
        $this->access->authorize($by, 'subcontracts', $project);
        $s = $this->sub($project, $subId);
        $s->released_voucher_id && throw new ProjectException('Retention on this subcontract was already released.');
        $s->state !== 'active' || throw new ProjectException('Mark the subcontract complete before releasing its retention.');
        $held = $this->held($subId);
        $held > 0.004 || throw new ProjectException('Nothing is held back on this subcontract.');
        $site = app(ProjectSettings::class)->get('site');
        $party = app(ProjectVoucherPoster::class)->supplierLedger((int) $s->vendor_id);
        $retLedger = (int) (DB::table('voucher_entries')->whereIn('voucher_id', DB::table('project_sub_claims')->where('subcontract_id', $subId)->whereNotNull('retention_voucher_id')->pluck('retention_voucher_id'))
            ->where('side', 'C')->value('ledger_id') ?: $site['sub_retention_ledger_id']);   // the ledger it was held in, even if Configuration has changed since
        $id = app(ProjectVoucherPoster::class)->journal(now()->toDateString(), "Retention released: {$this->vendorName((int) $s->vendor_id)}, {$s->title}, {$project->number}", "SC-{$s->id}", [
            ['ledger_id' => $retLedger, 'side' => 'D', 'amount' => $held, 'cost_centre_id' => $project->cost_centre_id],
            ['ledger_id' => $party, 'side' => 'C', 'amount' => $held, 'is_party' => true, 'cost_centre_id' => $project->cost_centre_id],
        ], $by);
        DB::table('project_subcontracts')->where('id', $subId)->update(['released_voucher_id' => $id, 'updated_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'subcontract.retention_released', 'subcontract', $subId, null, ['journal' => $id]);
        $this->tellVendor($s, $project, "Retention released · {$project->number}", "{$s->title}: the retention held back is now on your account.");
    }

    /** Subcontracts of one vendor across the work, for their portal (10.4). @return array<int, array<string, mixed>> */
    public function forVendor(int $vendorId): array
    {
        if (! ProjectsSetup::site()) {
            return [];
        }

        return DB::table('project_subcontracts as s')->join('projects as p', 'p.id', '=', 's.project_id')->where('s.vendor_id', $vendorId)->whereNull('s.deleted_at')->whereNull('p.deleted_at')
            ->orderByRaw("CASE s.state WHEN 'active' THEN 0 ELSE 1 END")->orderByDesc('s.id')->get(['s.*', 'p.number', 'p.title as project_title'])
            ->map(fn ($s) => ['project' => "{$s->number} {$s->project_title}"] + $this->shape($s, true))->all();
    }

    // ------------------------------------------------------------------ inside

    /** @return array<string, mixed> */
    public function shape(object $s, bool $money): array
    {
        $claims = DB::table('project_sub_claims')->where('subcontract_id', $s->id)->orderByDesc('number')->get();
        $bills = Schema::hasTable('vouchers') ? DB::table('vouchers')->whereIn('id', $claims->pluck('voucher_id')->filter()->all() ?: [0])->get(['id', 'voucher_number', 'total_amount', 'status'])->keyBy('id') : collect();
        $order = $s->vendor_order_id && Schema::hasTable('vendor_orders') ? DB::table('vendor_orders')->where('id', $s->vendor_order_id)->first(['id', 'po_number', 'status']) : null;
        $value = $this->value($s);
        $done = $this->certifiedPct((int) $s->id);

        return ['id' => (int) $s->id, 'vendor_id' => (int) $s->vendor_id, 'vendor' => $this->vendorName((int) $s->vendor_id), 'title' => $s->title, 'scope' => $s->scope, 'starts_on' => $s->starts_on, 'ends_on' => $s->ends_on,
            'state' => $s->state, 'retention_pct' => (float) $s->retention_pct, 'order' => $order ? ['id' => (int) $order->id, 'number' => $order->po_number, 'status' => $order->status] : null,
            'certified_pct' => $done, 'value' => $money ? $value : null, 'certified' => $money && $value !== null ? round($value * $done / 100, 2) : null, 'held' => $money ? $this->held((int) $s->id) : null,
            'released' => (bool) $s->released_voucher_id,
            'claims' => $claims->map(fn ($c) => ['id' => (int) $c->id, 'number' => (int) $c->number, 'period_to' => $c->period_to, 'claimed_pct' => (float) $c->claimed_pct, 'certified_pct' => $c->certified_pct !== null ? (float) $c->certified_pct : null,
                'state' => $c->state, 'note' => $c->note, 'answer_note' => $c->answer_note, 'by_vendor' => (bool) $c->by_vendor, 'at' => $c->created_at, 'file_id' => $c->file_id ? (int) $c->file_id : null,
                'bill' => $c->voucher_id && isset($bills[$c->voucher_id]) ? ['id' => (int) $c->voucher_id, 'number' => $bills[$c->voucher_id]->voucher_number, 'total' => $money ? (float) $bills[$c->voucher_id]->total_amount : null] : null])->all()];
    }

    /** The agreed value before tax, from the vendor order, in the company's currency; null when there is none. */
    private function value(object $s): ?float
    {
        if (! $s->vendor_order_id || ! Schema::hasTable('vendor_orders')) {
            return null;
        }
        $o = DB::table('vendor_orders')->where('id', $s->vendor_order_id)->first();

        return $o && $o->status !== 'cancelled' ? round((float) $o->subtotal, 2) : null;
    }

    private function certifiedPct(int $subId): float
    {
        return (float) (DB::table('project_sub_claims')->where('subcontract_id', $subId)->where('state', 'certified')->max('certified_pct') ?? 0);
    }

    /** What is held back now: the posted retention journals of its claims, unless released. */
    private function held(int $subId): float
    {
        $ids = DB::table('project_sub_claims')->where('subcontract_id', $subId)->whereNotNull('retention_voucher_id')->pluck('retention_voucher_id')->all();

        return $ids && Schema::hasTable('vouchers') ? round((float) DB::table('vouchers')->whereIn('id', $ids)->where('status', 'posted')->sum('total_amount'), 2) : 0.0;
    }

    private function order(mixed $id, int $vendor): ?int
    {
        if (empty($id)) {
            return null;
        }
        $o = Schema::hasTable('vendor_orders') ? DB::table('vendor_orders')->where('id', (int) $id)->first() : null;
        $o || throw new ProjectException('Choose a vendor order.');
        (int) $o->vendor_id === $vendor || throw new ProjectException('That vendor order is with another vendor.');
        $o->status !== 'cancelled' || throw new ProjectException('That vendor order was cancelled.');
        $base = Schema::hasTable('currencies') ? DB::table('currencies')->where('is_base', 1)->value('code') : null;
        if (! empty($o->currency) && $base && strtoupper((string) $o->currency) !== strtoupper((string) $base)) {
            throw new ProjectException("That vendor order is in {$o->currency}; a subcontract is billed in {$base}. Choose an order in {$base}.");
        }

        return (int) $o->id;
    }

    private function retention(mixed $v): float
    {
        $p = round((float) $v, 2);
        ($p >= 0 && $p <= 50) || throw new ProjectException('Retention is between 0% and 50%.');

        return $p;
    }

    private function day(mixed $v): ?string
    {
        if ($v === null || $v === '') {
            return null;
        }

        return is_string($v) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) ? $v : throw new ProjectException('Choose a day.');
    }

    private function sub(object $project, int $id): object
    {
        return DB::table('project_subcontracts')->where('id', $id)->where('project_id', $project->id)->whereNull('deleted_at')->first() ?? throw new ProjectException('That subcontract is not on this work.', 404);
    }

    /** @return array{0: object, 1: object} */
    private function openClaim(object $project, int $claimId): array
    {
        $c = DB::table('project_sub_claims')->where('id', $claimId)->first();
        $s = $c ? $this->sub($project, (int) $c->subcontract_id) : throw new ProjectException('That claim is not on this work.', 404);
        $c->state === 'submitted' || throw new ProjectException('That claim was already answered.');

        return [$c, $s];
    }

    private function vendorName(int $id): string
    {
        $v = Schema::hasTable('vendors') ? DB::table('vendors')->where('id', $id)->first(['company_name', 'contact_name']) : null;

        return $v ? ($v->company_name ?: $v->contact_name ?: "Vendor {$id}") : "Vendor {$id}";
    }

    private function tellVendor(object $s, object $project, string $title, string $body): void
    {
        $userId = Schema::hasColumn('vendors', 'user_id') ? DB::table('vendors')->where('id', $s->vendor_id)->value('user_id') : null;
        if ($userId && ($u = User::find($userId))) {
            ProjectNotices::tell($u, ProjectNotices::REQUEST, $title, $body, '/vendor-portal/subcontracts', 'Open your subcontracts');
        }
    }

    private function pct(float $p): string
    {
        return rtrim(rtrim(number_format($p, 2, '.', ''), '0'), '.');
    }

    private function needSite(): void
    {
        ProjectsSetup::site() || throw new ProjectException('The site is not set up yet. Run script 267.', 409);
    }
}
