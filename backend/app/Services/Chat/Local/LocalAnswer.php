<?php

namespace App\Services\Chat\Local;

final class LocalAnswer
{
    /** guard | answer | ask | empty | denied_resolver | restricted | suggest | none */
    public function __construct(
        public string $outcome = 'none',
        public ?Entry $entry = null,
        public float $confidence = 0.0,
        public string $text = '',
        public array $suggestions = [],   // [['label' => ..., 'question' => ...]]
        public ?string $resolver = null,
        public int $rows = 0,
        public bool $sensitive = false,
        public ?string $harm = null,
        public float $ms = 0.0,
        public array $snippets = [],      // public entries only: [['id' => ..., 'text' => ...]], for the outside fallback
        public float $unknownShare = 0.0,
    ) {}

    /** Did the local layer settle the question itself (answer, refusal, or a question back)? */
    public function handled(): bool
    {
        return $this->outcome !== 'none';
    }

    /** What may be written to the log: for answers made of someone's own or restricted data, the values are blanked. */
    public function loggableText(): string
    {
        return $this->sensitive && $this->entry
            ? "[local answer: {$this->entry->id}, {$this->rows} row(s), values not stored]"
            : $this->text;
    }

    public function meta(): array
    {
        return array_filter([
            'answered_by' => $this->outcome === 'guard' ? 'guard' : 'local',
            'outcome' => $this->outcome,
            'entry' => $this->entry?->id,
            'confidence' => round($this->confidence, 3),
            'suggestions' => $this->suggestions ?: null,
        ], fn ($v) => $v !== null);
    }
}
