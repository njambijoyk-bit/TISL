<?php

namespace App\Services\Chat\Local;

use App\Services\Access\Catalog;

/** The rules every entry must keep, applied when an entry is saved or imported (the unit tests apply the same ones to the shipped file). */
final class EntryLint
{
    public const KINDS = ['guest', 'customer', 'vendor', 'applicant', 'driver', 'staff'];

    /**
     * @param  array<string,Resolver>  $resolvers
     * @return string[] what is wrong, empty when the entry is fine
     */
    public static function problems(Entry $e, array $resolvers): array
    {
        $p = [];
        preg_match('/^[a-z]+\.[a-z0-9-]+$/', $e->id) || $p[] = 'The key must look like area.topic (lower case, for example staff.order-lookup).';
        ($e->audience && ! array_diff($e->audience, [...self::KINDS, 'any'])) || $p[] = 'Audience must be one or more of guest, customer, vendor, applicant, driver, staff, or "any".';
        foreach ($e->requires as $r) {
            isset(Catalog::PERMISSIONS[$r]) || $p[] = "\"{$r}\" is not a permission in the catalogue.";
        }
        in_array($e->sensitivity, ['public', 'own', 'restricted'], true) || $p[] = 'Sensitivity must be public, own or restricted.';
        ($e->sensitivity !== 'public' || ! $e->requires) || $p[] = 'A public entry cannot require a permission. Mark it restricted.';
        count($e->variants) >= 3 || $p[] = 'Write at least 3 ways people ask this question.';
        trim($e->answer) !== '' || $p[] = 'The answer is empty.';
        $roleKeys = array_diff(array_keys(Catalog::roles()), self::KINDS);          // customer, vendor, applicant and driver are account kinds, not role names
        array_intersect([...$e->audience, ...$e->requires], $roleKeys) && $p[] = 'Audience and permissions take account kinds and permission keys, never role names.';

        $reach = false;
        foreach (self::KINDS as $k) {
            $c = CallerContext::fake($k, []);
            $reach = $reach || ($c->reaches($e) && ! $c->sees($e));
        }
        ($reach && $e->denied === '') && $p[] = 'Someone could ask about this but not see it, so it needs a "when not allowed" line (safe for anyone to read).';

        if ($e->resolver !== '') {
            $r = $resolvers[$e->resolver] ?? null;
            if (! $r) {
                $p[] = "There is no resolver called \"{$e->resolver}\".";
            } else {
                array_diff($e->requires, $r->requires()) && $p[] = 'The resolver asks for fewer permissions than this entry does. Tighten the resolver first.';
                $kinds = in_array('any', $e->audience, true) ? self::KINDS : $e->audience;
                (in_array('any', $r->kinds(), true) || ! array_diff($kinds, $r->kinds())) || $p[] = 'The resolver serves fewer kinds of account than this entry is offered to.';
            }
        }

        return $p;
    }
}
