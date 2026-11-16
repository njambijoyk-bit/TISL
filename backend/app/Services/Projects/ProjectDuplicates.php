<?php

namespace App\Services\Projects;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * "Do we already know them?" (docs/PROJECTS_STAGE3_SPEC.md). Before a lead, a contact or a party is added, the others are searched by name,
 * email and phone. It warns; it never stops anyone. For a law firm it is also the first sign that the same name sits on both sides.
 */
class ProjectDuplicates
{
    /** A phone number as Projects keeps it: digits, with a leading + when it had one. So one number is found however it was typed. */
    public static function phone(?string $v): ?string
    {
        $digits = preg_replace('/\D+/', '', (string) $v);

        return $digits === '' ? null : (str_starts_with(trim((string) $v), '+') ? '+' : '') . mb_substr($digits, 0, 20);
    }

    /**
     * @param array{name?: ?string, email?: ?string, phone?: ?string} $who
     * @param array{0: string, 1: int}|null $except the record being edited
     * @return array<int, array{type: string, id: int, name: string, detail: string, url: ?string}>
     */
    public function find(array $who, ?array $except = null): array
    {
        if (! ProjectsSetup::relationships()) {
            return [];
        }
        $name = mb_strtolower(trim((string) ($who['name'] ?? '')));
        $email = mb_strtolower(trim((string) ($who['email'] ?? '')));
        $phone = preg_replace('/\D+/', '', (string) ($who['phone'] ?? ''));
        $tail = strlen($phone) >= 7 ? substr($phone, -9) : '';   // the last nine digits: the same number with or without the country code
        if ($name === '' && $email === '' && $tail === '') {
            return [];
        }
        $match = function ($q, string $nameCol, ?string $emailCol, ?string $phoneCol) use ($name, $email, $tail) {
            $q->where(function ($w) use ($nameCol, $emailCol, $phoneCol, $name, $email, $tail) {
                if ($name !== '') {
                    $w->orWhereRaw("LOWER({$nameCol}) = ?", [$name]);
                }
                if ($email !== '' && $emailCol) {
                    $w->orWhereRaw("LOWER({$emailCol}) = ?", [$email]);
                }
                if ($tail !== '' && $phoneCol) {
                    $w->orWhere($phoneCol, 'like', '%' . $tail);
                }
            });
        };
        $skip = fn (string $type, $q) => $except && $except[0] === $type ? $q->where('id', '!=', $except[1]) : $q;
        $out = [];

        foreach ($skip('lead', DB::table('project_leads')->whereNull('deleted_at'))->tap(fn ($q) => $match($q, 'name', 'email', 'phone'))->limit(5)->get() as $r) {
            $out[] = ['type' => 'lead', 'id' => (int) $r->id, 'name' => $r->name, 'detail' => 'A lead' . ($r->status === 'lost' ? ', lost' : ($r->status === 'won' ? ', won' : '')) . ', owned by ' . (DB::table('users')->where('id', $r->owner_id)->value('name') ?? 'nobody'), 'url' => "/admin/projects/leads/{$r->id}"];
        }
        foreach ($skip('party', DB::table('project_parties')->whereNull('deleted_at'))->tap(fn ($q) => $match($q, 'name', 'email', 'phone'))->limit(5)->get() as $r) {
            $on = DB::table('project_party_links as l')->join('projects as p', 'p.id', '=', 'l.project_id')->where('l.party_id', $r->id)->whereNull('p.deleted_at')->where('p.confidential', 0)->pluck('p.number')->unique()->take(3)->implode(', ');
            $out[] = ['type' => 'party', 'id' => (int) $r->id, 'name' => $r->name, 'detail' => 'Another party' . ($on ? " on {$on}" : ''), 'url' => null];
        }
        foreach ($skip('contact', DB::table('project_contacts')->whereNull('deleted_at'))->tap(fn ($q) => $match($q, 'name', 'email', 'phone'))->limit(5)->get() as $r) {
            $out[] = ['type' => 'contact', 'id' => (int) $r->id, 'name' => $r->name, 'detail' => 'A contact of a ' . ['customer' => 'client', 'lead' => 'lead', 'party' => 'party'][$r->owner_type], 'url' => null];
        }
        $hasPhone = Schema::hasTable('customers') && Schema::hasColumn('customers', 'phone');
        // (a search with nothing a customer row could match must not match every customer)
        if (Schema::hasTable('customers') && ($name !== '' || $email !== '' || ($tail !== '' && $hasPhone))) {
            $q = $skip('customer', DB::table('customers')->whereNull('deleted_at'));
            $q->where(function ($w) use ($name, $email, $tail) {
                if ($name !== '') {
                    // joining first and last name is written differently by MySQL and by the SQLite the tests use
                    $full = DB::getDriverName() === 'sqlite' ? "COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')" : "CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, ''))";
                    $w->orWhereRaw('LOWER(company_name) = ?', [$name])->orWhereRaw("LOWER(TRIM({$full})) = ?", [$name]);
                }
                if ($email !== '') {
                    $w->orWhereRaw('LOWER(email) = ?', [$email]);
                }
                if ($tail !== '' && $hasPhone) {
                    $w->orWhere('phone', 'like', '%' . $tail);
                }
            });
            foreach ($q->limit(5)->get() as $r) {
                $out[] = ['type' => 'customer', 'id' => (int) $r->id, 'name' => $r->company_name ?: trim(($r->first_name ?? '') . ' ' . ($r->last_name ?? '')), 'detail' => 'Already a client' . (! empty($r->customer_number) ? " ({$r->customer_number})" : ''), 'url' => "/admin/projects/clients/{$r->id}"];
            }
        }

        return $out;
    }
}
