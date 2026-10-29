<?php

namespace App\Services\Books;

use App\Models\TaxType;
use Illuminate\Validation\ValidationException;

/**
 * What a tax type may be (docs/TAX_CONTROL_PLAN.md, step T4): its category (what kind of tax) and its method (how it is applied), checked against what the
 * Tax control settings allow. The old `kind` and `application_mode` columns are still the ones the posting code reads until step T6, so they are kept in
 * step with the new category and method: a tax type created either way ends up with both.
 */
class TaxTypeRules
{
    /** The methods the posting code can carry out today. Step T6 adds the others here, and nowhere else. */
    public const POSTABLE_METHODS = ['added', 'withheld', 'reverse_charge'];

    /** Whether the tax a buyer pays can be claimed back (docs/TAX_CONTROL_PLAN.md, section 18). It matters on purchases only. */
    public const RECOVERY = ['recoverable' => 'Recoverable: claimed back as input tax', 'non_recoverable' => 'Not recoverable: part of what the goods cost', 'conditional' => 'Conditional: recoverable only in a certain position'];

    /** How the company stands for a tax. Only a manufacturer recovers a conditional tax; an importer's duty on import belongs to the customs module. */
    public const ROLES = ['ordinary' => 'An ordinary purchaser', 'manufacturer' => 'A licensed manufacturer', 'importer' => 'An importer'];

    /** The recovery a new tax type of a category starts with: excise is not claimed back by an ordinary purchaser; everything else posts as it always has. */
    public static function defaultRecovery(?string $category): string
    {
        return $category === 'excise' ? 'non_recoverable' : 'recoverable';
    }

    /** Can the buyer claim this tax back? A type with no recovery set takes its category's default. */
    public static function recoverable(TaxType $type): bool
    {
        $recovery = $type->getAttribute('recovery') ?: self::defaultRecovery($type->getAttribute('tax_category') ?: self::categoryOfKind($type->kind));

        return match ($recovery) {
            'non_recoverable' => false,
            'conditional' => $type->getAttribute('company_role') === 'manufacturer',
            default => true,
        };
    }

    /** category => the old `kind` it is stored as too. */
    private const KIND_OF = ['vat_gst' => 'vat', 'excise' => 'excise', 'customs' => 'customs', 'withholding_income' => 'withholding_income', 'withholding_vat' => 'withholding_vat'];

    public static function kindOf(string $category): string
    {
        return self::KIND_OF[$category] ?? 'other';
    }

    public static function categoryOfKind(?string $kind): ?string
    {
        $c = array_search($kind, self::KIND_OF, true);

        return $c === false ? ($kind ? 'other' : null) : $c;
    }

    /** The old mode a method is stored as. Methods the posting code cannot carry out yet have none. */
    public static function modeOf(string $method): ?string
    {
        // a reverse-charge tax is kept as 'additive' in the old column (which only knows additive and withheld) and told apart by application_method
        return match ($method) {'added', 'reverse_charge' => 'additive', 'withheld' => 'withheld', default => null};
    }

    public static function methodOfMode(?string $mode): ?string
    {
        return match ($mode) {'additive' => 'added', 'withheld' => 'withheld', default => null};
    }

    /** @return array{categories: string[], methods: array<string, string[]>} what Tax control allows (everything, as the defaults say, until it is set up) */
    public function allowed(): array
    {
        $s = app(TaxControlSettings::class);
        $v = TaxControlSettings::ready() ? $s->values() : [];

        return ['categories' => $v['enabled_categories'] ?? array_keys(TaxControlDefinitions::CATEGORIES), 'methods' => $v['category_methods'] ?? TaxControlDefinitions::DEFAULT_METHODS];
    }

    /**
     * The category and method for a tax type being created, with the old kind and mode.
     *
     * @param  array  $in  tax_category, application_method, or the old kind and application_mode
     * @return array{tax_category: string, application_method: string, kind: string, application_mode: string}
     *
     * @throws ValidationException
     */
    public function forCreate(array $in): array
    {
        $method = ($in['application_method'] ?? null) ?: self::methodOfMode($in['application_mode'] ?? null);
        if (! $method) {
            throw ValidationException::withMessages(['application_method' => 'Choose how the tax is applied.']);
        }
        $category = ($in['tax_category'] ?? null) ?: self::categoryOfKind($in['kind'] ?? null) ?: ($method === 'withheld' ? 'withholding_income' : 'other');
        $this->assertAllowed($category, $method);

        return ['tax_category' => $category, 'application_method' => $method, 'kind' => self::kindOf($category), 'application_mode' => self::modeOf($method)];
    }

    /**
     * What a change to an existing tax type may be: the category may change to another that allows its method; the method may not change at all, because
     * it decides what is posted.
     *
     * @return array<string, string> the columns to set (empty when neither was given)
     *
     * @throws ValidationException
     */
    public function forUpdate(TaxType $type, array $in): array
    {
        $current = $type->application_method ?: self::methodOfMode($type->application_mode);
        $asked = ($in['application_method'] ?? null) ?: (array_key_exists('application_mode', $in) ? self::methodOfMode($in['application_mode']) : null);
        if ($asked && $asked !== $current) {
            throw ValidationException::withMessages(['application_method' => 'How a tax is applied cannot be changed once it exists, because it decides what is posted. Create a new tax type instead.']);
        }
        $category = ($in['tax_category'] ?? null) ?: (array_key_exists('kind', $in) ? self::categoryOfKind($in['kind']) : null);
        if (! $category || $category === $type->tax_category) {
            return [];
        }
        $this->assertAllowed($category, $current, false);

        return ['tax_category' => $category, 'kind' => self::kindOf($category)];
    }

    /** @throws ValidationException */
    private function assertAllowed(string $category, ?string $method, bool $postable = true): void
    {
        $labels = TaxControlDefinitions::CATEGORIES;
        $methods = TaxControlDefinitions::METHODS;
        if (! isset($labels[$category])) {
            throw ValidationException::withMessages(['tax_category' => 'There is no such tax category.']);
        }
        if ($method !== null && ! isset($methods[$method])) {
            throw ValidationException::withMessages(['application_method' => 'There is no such way of applying a tax.']);
        }
        $allowed = $this->allowed();
        if (! in_array($category, $allowed['categories'], true)) {
            throw ValidationException::withMessages(['tax_category' => "{$labels[$category]} is switched off in Tax control."]);
        }
        if ($method !== null && ! in_array($method, $allowed['methods'][$category] ?? [], true)) {
            $list = implode(', ', array_map(fn ($m) => lcfirst($methods[$m]), $allowed['methods'][$category] ?? [])) ?: 'none';
            throw ValidationException::withMessages(['application_method' => "{$labels[$category]} cannot be applied as \"" . lcfirst($methods[$method]) . "\". Tax control allows: {$list}."]);
        }
        if ($postable && $method !== null && ! in_array($method, self::POSTABLE_METHODS, true)) {
            throw ValidationException::withMessages(['application_method' => "\"{$methods[$method]}\" is not available yet: the books cannot post it until the tax posting update (step T6)."]);
        }
    }

    /** Whether the new rate types (a percentage together with an amount per unit) may be used on a tax type: only on one that is added to the price. */
    public function allowsMixedRates(TaxType $type): bool
    {
        return ($type->application_method ?: self::methodOfMode($type->application_mode)) === 'added';
    }
}
