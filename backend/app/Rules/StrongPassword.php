<?php

namespace App\Rules;

use App\Services\Security\PasswordPolicy;
use Closure;
use Illuminate\Contracts\Validation\DataAwareRule;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * The password rule (see PasswordPolicy). The person's own details come from the form being checked (name, email, phone) and from anything passed in, such as the signed-in person's.
 *
 *   'password' => ['required', 'string', new StrongPassword, 'confirmed']
 *   'new_password' => ['required', 'string', new StrongPassword([$user->name, $user->email])]
 */
class StrongPassword implements DataAwareRule, ValidationRule
{
    /** @var array<string, mixed> */
    private array $data = [];

    /** @param array<int, string|null> $personal */
    public function __construct(private array $personal = []) {}

    public function setData(array $data): static
    {
        $this->data = $data;

        return $this;
    }

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value)) {
            $fail('The password must be text.');

            return;
        }
        $fromForm = array_map(fn ($k) => is_string($this->data[$k] ?? null) ? $this->data[$k] : null, ['name', 'first_name', 'last_name', 'email', 'phone']);
        $problem = PasswordPolicy::problem($value, array_merge($this->personal, $fromForm));
        if ($problem) {
            $fail($problem);
        }
    }
}
