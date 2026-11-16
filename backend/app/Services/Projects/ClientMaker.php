<?php

namespace App\Services\Projects;

use App\Models\Customer;

/**
 * Makes the customer record when a lead is won. It goes through the Customer model, exactly as the rest of TISL makes a customer, so the
 * customer number, the account currency and everything else that hangs off a new customer happen as they always do. Projects adds nothing
 * of its own here: the customer record stays the one identity, and the account and Books ledger are the ones TISL already has.
 */
class ClientMaker
{
    /** @param array<string, mixed> $values first_name, last_name, company_name, email, phone, notes @return int the new customer's id */
    public function make(array $values): int
    {
        return (int) Customer::create($values)->id;
    }
}
