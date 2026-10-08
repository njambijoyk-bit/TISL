<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * One newest-first timeline of the activity logs kept all over the site. Each source says who may see it; a person is only ever shown the
 * sources their role allows, and a source whose table does not exist (a module not installed) is skipped quietly.
 * Every row is reduced to the same shape: when, which source, who, what they did, to what, and a one-line summary.
 */
class ActivityFeedService
{
    private const ADMINS = ['admin', 'super_admin'];
    private const OPS = ['manager', 'admin', 'super_admin'];
    private const FIN = ['finance', 'manager', 'admin', 'super_admin'];
    private const SUPER = ['super_admin'];

    /** @return array<int,array{key:string,label:string,group:string,roles:array,table:string,at:string}> */
    private function sources(): array
    {
        $o = self::OPS; $f = self::FIN; $a = self::ADMINS;

        return [
            ['key' => 'hamper_activity', 'label' => 'Hampers', 'group' => 'Sales', 'roles' => $o, 'table' => 'hamper_activity_logs', 'at' => 'created_at'],
            ['key' => 'auction_order_activity', 'label' => 'Auctions', 'group' => 'Sales', 'roles' => $o, 'table' => 'auction_order_activity_logs', 'at' => 'created_at'],
            ['key' => 'referral_activity', 'label' => 'Referrals', 'group' => 'Customers', 'roles' => $o, 'table' => 'referral_activity_logs', 'at' => 'created_at'],
            ['key' => 'customer_tier', 'label' => 'Customer tiers', 'group' => 'Customers', 'roles' => $o, 'table' => 'customer_tier_activities', 'at' => 'created_at'],
            ['key' => 'shipping', 'label' => 'Shipping', 'group' => 'Sales', 'roles' => $o, 'table' => 'shipping_activities', 'at' => 'created_at'],
            ['key' => 'product_activity', 'label' => 'Products', 'group' => 'Catalogue', 'roles' => $o, 'table' => 'product_activity_logs', 'at' => 'created_at'],
            ['key' => 'voucher_audit', 'label' => 'Vouchers', 'group' => 'Books', 'roles' => $f, 'table' => 'voucher_audit_logs', 'at' => 'created_at'],
            ['key' => 'verification', 'label' => 'Verification', 'group' => 'Books', 'roles' => $f, 'table' => 'verification_log', 'at' => 'created_at'],
            ['key' => 'tax_activity', 'label' => 'Tax', 'group' => 'Books', 'roles' => $f, 'table' => 'tax_activity_logs', 'at' => 'created_at'],
            ['key' => 'withholding_activity', 'label' => 'Withholding', 'group' => 'Books', 'roles' => $f, 'table' => 'withholding_activity_logs', 'at' => 'created_at'],
            ['key' => 'currency_activity', 'label' => 'Currency', 'group' => 'Books', 'roles' => $f, 'table' => 'currency_activity_logs', 'at' => 'created_at'],
            ['key' => 'delivery_activity', 'label' => 'Delivery', 'group' => 'Operations', 'roles' => $o, 'table' => 'delivery_activity_logs', 'at' => 'created_at'],
            ['key' => 'project_activity', 'label' => 'Projects', 'group' => 'Work', 'roles' => $o, 'table' => 'project_activities', 'at' => 'created_at'],
            ['key' => 'leave', 'label' => 'Leave', 'group' => 'People', 'roles' => $o, 'table' => 'leave_logs', 'at' => 'created_at'],
            ['key' => 'application_status', 'label' => 'Job applications', 'group' => 'People', 'roles' => $a, 'table' => 'application_status_history', 'at' => 'created_at'],
            ['key' => 'bug_status', 'label' => 'Bug reports', 'group' => 'System', 'roles' => $a, 'table' => 'bug_report_status_history', 'at' => 'created_at'],
            ['key' => 'policy_change', 'label' => 'Policy changes', 'group' => 'System', 'roles' => $a, 'table' => 'policy_change_logs', 'at' => 'changed_at'],
            ['key' => 'vault_access', 'label' => 'Vault', 'group' => 'System', 'roles' => $a, 'table' => 'vault_access_logs', 'at' => 'created_at'],
            ['key' => 'mimi_query', 'label' => 'Mimi chats', 'group' => 'System', 'roles' => $a, 'table' => 'mimi_query_logs', 'at' => 'queried_at'],
            ['key' => 'dev_access_key', 'label' => 'Developer key attempts', 'group' => 'System', 'roles' => self::SUPER, 'table' => 'dev_access_key_logs', 'at' => 'attempted_at'],
        ];
    }

    /** The sources this person may see (and that exist). */
    public function allowed(User $user): array
    {
        return array_values(array_filter($this->sources(), fn ($s) => in_array($user->role, $s['roles'], true) && Schema::hasTable($s['table'])));
    }

    public function feed(User $user, array $f): array
    {
        $allowed = $this->allowed($user);
        $want = array_filter((array) ($f['source'] ?? []));
        $use = $want ? array_values(array_filter($allowed, fn ($s) => in_array($s['key'], $want, true) || in_array($s['group'], $want, true))) : $allowed;
        $page = max(1, (int) ($f['page'] ?? 1));
        $per = min(100, max(10, (int) ($f['per_page'] ?? 50)));
        $q = trim((string) ($f['q'] ?? ''));
        $limit = $q !== '' ? 500 : min(500, $page * $per + 1);

        $rows = [];
        foreach ($use as $s) {
            try {
                foreach ($this->query($s, $f['from'] ?? null, $f['to'] ?? null, $limit) as $r) {
                    $rows[] = $this->shape($s, $r);
                }
            } catch (\Throwable $e) {
                report($e);   // one broken log must not take the whole timeline down
            }
        }
        $this->names($rows);
        if ($q !== '') {
            $needle = Str::lower($q);
            $rows = array_values(array_filter($rows, fn ($r) => Str::contains(Str::lower(implode(' ', [$r['actor'], $r['action'], $r['subject'], $r['summary'], $r['label']])), $needle)));
        }
        usort($rows, fn ($x, $y) => strcmp((string) $y['at'], (string) $x['at']));
        $slice = array_slice($rows, ($page - 1) * $per, $per);

        return ['data' => array_map(fn ($r) => array_diff_key($r, ['actor_id' => 1]), $slice), 'page' => $page, 'has_more' => count($rows) > $page * $per,
            'sources' => array_map(fn ($s) => ['key' => $s['key'], 'label' => $s['label'], 'group' => $s['group']], $allowed)];
    }

    private function query(array $s, ?string $from, ?string $to, int $limit)
    {
        $t = $s['table'];
        $q = DB::table($t . ' as l');
        if ($s['key'] === 'voucher_audit' && Schema::hasTable('vouchers')) {
            $q->leftJoin('vouchers as v', 'v.id', '=', 'l.voucher_id')->select('l.*', 'v.voucher_number as _ref');
        } elseif ($s['key'] === 'verification' && Schema::hasTable('verification_items')) {
            $q->leftJoin('verification_items as i', 'i.id', '=', 'l.item_id')->select('l.*', 'i.ref as _ref');
        } else {
            $q->select('l.*');
        }
        $col = 'l.' . $s['at'];

        return $q->when($from, fn ($w) => $w->where($col, '>=', $from . ' 00:00:00'))->when($to, fn ($w) => $w->where($col, '<=', $to . ' 23:59:59'))->orderByDesc($col)->limit($limit)->get();
    }

    private function short(?string $s, int $n = 160): string
    {
        return Str::limit(trim((string) $s), $n);
    }

    private function json($v): array
    {
        if (is_array($v)) {
            return $v;
        }
        $d = json_decode((string) $v, true);

        return is_array($d) ? $d : [];
    }

    private function keys($v): string
    {
        $a = $this->json($v);

        return $a ? 'Fields: ' . implode(', ', array_slice(array_keys($a), 0, 6)) : '';
    }

    /** Reduce one log row to the common shape. */
    private function shape(array $s, object $raw): array
    {
        // a column a given install does not have reads as null instead of failing the whole source
        $r = new class($raw) {
            public function __construct(private object $o) {}

            public function __get($n)
            {
                return $this->o->$n ?? null;
            }
        };
        $k = $s['key'];
        $at = $r->{$s['at']} ?? null;
        $actor = null; $action = ''; $subject = ''; $summary = '';
        switch ($k) {
            case 'hamper_activity':
                $actor = $r->performed_by ?? $r->user_id; $action = $r->action; $subject = 'Hamper #' . $r->hamper_id; $summary = $this->short($r->description); break;
            case 'auction_order_activity':
                $actor = $r->performed_by; $action = $r->action; $subject = 'Auction #' . $r->auction_id; $summary = $this->short($r->description); break;
            case 'referral_activity':
                $actor = $r->actor_user_id; $action = $r->action; $subject = Str::headline((string) $r->entity_type) . ' #' . $r->entity_id; $summary = $r->amount !== null ? 'Amount ' . $r->amount : ''; break;
            case 'customer_tier':
                $actor = $r->actor_user_id; $action = $r->action; $subject = Str::headline((string) $r->entity_type) . ' #' . $r->entity_id; break;
            case 'shipping':
                $actor = $r->actor_user_id; $action = $r->action; $subject = 'Shipping option #' . $r->shipping_option_id; break;
            case 'voucher_audit':
                $actor = $r->user_id; $action = $r->action; $subject = 'Voucher ' . ($r->_ref ?? '#' . $r->voucher_id); $summary = $this->keys($r->detail); break;
            case 'verification':
                $actor = $r->user_id; $action = $r->status; $subject = 'Verification of ' . ($r->_ref ?? 'item #' . $r->item_id); $summary = $this->short($r->note); break;
            case 'delivery_activity':
                $actor = $r->performer_name ?: $r->performed_by; $action = $r->action; $subject = class_basename((string) $r->loggable_type) . ' #' . $r->loggable_id; $summary = $r->severity ? Str::headline($r->severity) : ''; break;
            case 'project_activity':
                $actor = $r->actor_user_id; $action = $r->action; $subject = 'Project #' . $r->project_id . ($r->entity_type ? ' · ' . Str::headline($r->entity_type) . ' #' . $r->entity_id : ''); break;
            case 'leave':
                $actor = $r->actioned_by; $action = $r->action; $subject = 'Employee #' . $r->employee_id; $summary = trim(($r->days !== null ? $r->days . ' day(s). ' : '') . $this->short($r->reason, 100)); break;
            case 'application_status':
                $actor = $r->changed_by_type === 'user' ? $r->changed_by_id : null; $action = $r->to_status; $subject = 'Application #' . $r->application_id; $summary = trim(($r->from_status ? $r->from_status . ' → ' . $r->to_status . '. ' : '') . $this->short($r->note, 100)); break;
            case 'bug_status':
                $actor = $r->changed_by_user_id; $action = $r->to_status; $subject = 'Bug report #' . $r->bug_report_id; $summary = trim(($r->from_status ? $r->from_status . ' → ' . $r->to_status . '. ' : '') . $this->short($r->note, 100)); break;
            case 'policy_change':
                $actor = $r->changed_by_name ?: $r->changed_by; $action = $r->is_major_bump ? 'major change' : 'edited'; $subject = 'Policy ' . $r->policy_key; $summary = 'v' . $r->previous_version . ' → v' . $r->new_version . ($r->major_bump_note ? '. ' . $this->short($r->major_bump_note, 100) : ''); break;
            case 'vault_access':
                $actor = $r->user_id; $action = $r->action; $subject = Str::headline((string) $r->target_type) . ' #' . $r->target_id; $summary = $r->ip_address ? 'From ' . $r->ip_address : ''; break;
            case 'mimi_query':
                $actor = $r->user_id ?: Str::headline((string) $r->actor_type); $action = $r->is_harmful ? 'flagged harmful' : ($r->response_status ?: 'asked'); $subject = 'Mimi chat'; $summary = $this->short($r->query); break;
            case 'dev_access_key':
                $actor = null; $action = $r->result; $subject = 'Developer key'; $summary = $r->ip_address ? 'From ' . $r->ip_address : ''; break;
            default: // tax, withholding, products, currency: the shared append-only shape
                $actor = $r->user_id ?? null; $action = $r->event ?? ''; $subject = class_basename((string) ($r->loggable_type ?? '')) . ($r->loggable_id ? ' #' . $r->loggable_id : ''); $summary = $this->keys($r->new_values ?? null);
        }

        return ['id' => $k . ':' . ($r->id ?? md5(json_encode($raw))), 'at' => $at ? (string) $at : null, 'source' => $k, 'label' => $s['label'], 'group' => $s['group'], 'actor_id' => is_numeric($actor) ? (int) $actor : null,
            'actor' => is_numeric($actor) || $actor === null ? '' : (string) $actor, 'action' => Str::headline(str_replace('.', ' ', (string) $action)), 'subject' => trim($subject), 'summary' => $summary];
    }

    /** Fill in people's names with one query. */
    private function names(array &$rows): void
    {
        $ids = array_values(array_unique(array_filter(array_column($rows, 'actor_id'))));
        $map = $ids ? User::whereIn('id', $ids)->pluck('name', 'id') : collect();
        foreach ($rows as &$r) {
            if ($r['actor_id']) {
                $r['actor'] = (string) ($map[$r['actor_id']] ?? 'User #' . $r['actor_id']);
            } elseif ($r['actor'] === '') {
                $r['actor'] = 'System';
            }
        }
    }
}
