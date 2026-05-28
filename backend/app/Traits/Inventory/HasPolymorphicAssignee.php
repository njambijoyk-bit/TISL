<?php

namespace App\Traits\Inventory;

trait HasPolymorphicAssignee
{
    public function resolveAssignee(): mixed
    {
        $type = $this->assignee_type;
        $id   = $this->assignee_id;

        if (! $type || ! $id) return null;

        return match ($type) {
            'employee' => \App\Models\Employee::find($id),
            'customer' => \App\Models\Customer::find($id),
            'group'    => \App\Models\Inventory\InventoryGroup::find($id),
            default    => null,
        };
    }

    public static function buildAssigneeLabel(string $type, mixed $id, ?string $fallback = null): string
    {
        if ($fallback) return $fallback;

        return match ($type) {
            'employee'   => optional(\App\Models\Employee::find($id))->full_name ?? "Employee #{$id}",
            'customer'   => optional(\App\Models\Customer::find($id))->name      ?? "Customer #{$id}",
            'group'      => optional(\App\Models\Inventory\InventoryGroup::find($id))->name ?? "Group #{$id}",
            'department' => $fallback ?? 'Unknown Department',
            default      => $fallback ?? 'Unknown',
        };
    }
}
