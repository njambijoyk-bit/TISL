<?php

namespace App\Services\Codes;

use App\Models\User;
use App\Services\Access\Authorizer;

/**
 * What our signed codes MEAN. A module registers its code type once (an event ticket, a gift voucher, a table card) and says two things: where an ordinary phone camera should
 * be sent (a public page), and what staff scanning it should DO (check in, redeem), with the permission that needs. Core never knows module details; it only checks the code is
 * genuine and hands over.
 */
final class CodeResolvers
{
    /** @var array<string, array{label: string, public: ?callable, scan: ?callable, permission: ?string}> */
    private array $defs = [];

    /**
     * @param  ?callable  $public  fn (string $id): ?string  the web path (e.g. "/tickets/4821") to open for a customer, or null when there is none
     * @param  ?callable  $scan  fn (string $id, User $by, array $context): array  what happens when staff scan it; returns what to show them
     * @param  ?string  $permission  what the staff member needs to scan this type (checked here, before $scan runs)
     */
    public function register(string $type, string $label, ?callable $public = null, ?callable $scan = null, ?string $permission = null): void
    {
        $this->defs[$type] = ['label' => $label, 'public' => $public, 'scan' => $scan, 'permission' => $permission];
    }

    public function has(string $type): bool
    {
        return isset($this->defs[$type]);
    }

    /** @return array<string, string> type => label */
    public function types(): array
    {
        return array_map(fn ($d) => $d['label'], $this->defs);
    }

    /** The code is genuine and is for a type a module registered: what it stands for, or null. @return array{type: string, id: string, label: string}|null */
    public function identify(string $scanned): ?array
    {
        $v = Signed::verify($scanned);
        if ($v === null || ! isset($this->defs[$v['type']])) {
            return null;
        }

        return $v + ['label' => $this->defs[$v['type']]['label']];
    }

    /** Where a customer's phone camera should land. */
    public function publicPath(string $scanned): ?string
    {
        $i = $this->identify($scanned);

        return $i && $this->defs[$i['type']]['public'] ? ($this->defs[$i['type']]['public'])($i['id']) : null;
    }

    /**
     * Staff scan a code. The person must hold the type's permission.
     *
     * @param  array<string, mixed>  $context  what the scanning screen knows (which event and session is being checked in, which till)
     * @return array{type: string, label: string, id: string, result: array}
     */
    public function scan(string $scanned, User $by, array $context = []): array
    {
        $i = $this->identify($scanned) ?? throw new CodeException('This is not one of our codes.');
        $def = $this->defs[$i['type']];
        if ($def['scan'] === null) {
            throw new CodeException("{$i['label']} codes can be opened by customers but there is nothing for staff to do with them.");
        }
        if ($def['permission'] !== null && ! app(Authorizer::class)->allows($by, $def['permission'])) {
            throw new CodeException("You are not allowed to scan {$i['label']} codes.");
        }

        return $i + ['result' => ($def['scan'])($i['id'], $by, $context)];
    }
}
