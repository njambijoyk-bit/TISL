<?php

namespace App\Models\Courses;

use Illuminate\Database\Eloquent\Model;

/** A book in the Courses library. Sold by invoice in the books, not through the shop. */
class Book extends Model
{
    public const FORMATS = ['printed' => 'Printed', 'digital' => 'Digital file', 'both' => 'Printed and digital'];

    protected $table = 'course_books';

    protected $guarded = [];

    protected $casts = ['price' => 'decimal:2', 'is_active' => 'boolean', 'download_limit' => 'integer'];

    public function hasDigital(): bool
    {
        return in_array($this->format, ['digital', 'both'], true);
    }

    public function hasPrinted(): bool
    {
        return in_array($this->format, ['printed', 'both'], true);
    }
}
