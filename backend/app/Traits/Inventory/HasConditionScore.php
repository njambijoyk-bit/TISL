<?php

namespace App\Traits\Inventory;

trait HasConditionScore
{
    public static array $conditionScoreMap = [
        'new'       => 100,
        'excellent' => 90,
        'good'      => 75,
        'fair'      => 55,
        'poor'      => 35,
        'damaged'   => 15,
        'unusable'  => 0,
    ];

    public static function scoreFromCondition(string $condition): float
    {
        return self::$conditionScoreMap[$condition] ?? 0;
    }

    public function getFinalScoreAttribute(): ?float
    {
        return $this->condition_score_override ?? $this->condition_score ?? null;
    }

    public function setConditionAttribute(string $value): void
    {
        $this->attributes['condition'] = $value;
        if (! isset($this->attributes['condition_score_override'])) {
            $this->attributes['condition_score'] = self::$conditionScoreMap[$value] ?? 0;
        }
    }
}
