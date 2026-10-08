<?php

namespace App\Services\Entity;

use App\Models\LegalEntity;

/**
 * The company whose books this request is about. Set by the SetEntityContext middleware from an X-Entity header (the browser tab's choice);
 * otherwise the default entity. While there is one entity it always resolves to it. Before script 100 it resolves to null and nothing asks.
 */
class CurrentEntity
{
    private ?LegalEntity $current = null;
    private bool $resolved = false;

    public function set(?LegalEntity $entity): void
    {
        $this->current = $entity;
        $this->resolved = $entity !== null;
    }

    /** Choose by id; an unknown or inactive id is ignored (the default stays). */
    public function setById(?int $id): void
    {
        if ($id === null || ! LegalEntity::ready()) {
            return;
        }
        $e = LegalEntity::query()->active()->find($id);
        if ($e) {
            $this->set($e);
        }
    }

    public function get(): ?LegalEntity
    {
        if (! $this->resolved) {
            $this->current = LegalEntity::default();
            $this->resolved = true;
        }

        return $this->current;
    }

    public function id(): ?int
    {
        return $this->get()?->id;
    }

    /** True once the business keeps books for more than one company (drives the switcher). */
    public static function isMulti(): bool
    {
        return LegalEntity::ready() && LegalEntity::query()->active()->count() > 1;
    }
}
