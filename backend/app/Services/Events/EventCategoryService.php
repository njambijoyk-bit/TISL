<?php

namespace App\Services\Events;

use App\Models\Events\EventCategory;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/** The hierarchy of kinds of event, managed by admin (never hard-coded), plus the standard set that can be added in one click. */
final class EventCategoryService
{
    /** name => [icon, default participation, [children]] */
    public const STANDARD = [
        'Weddings & Celebrations' => ['heart', 'invitation', ['Weddings', 'Traditional weddings', 'Engagements', 'Bridal showers', 'Baby showers', 'Birthdays', 'Anniversaries', 'Graduations', 'Family reunions']],
        'Business & Corporate' => ['briefcase', 'rsvp', ['Conferences', 'Seminars', 'AGMs', 'Workshops', 'Product launches', 'Networking events', 'Corporate dinners', 'Team building']],
        'Entertainment' => ['music', 'paid', ['Concerts', 'Music festivals', 'Comedy shows', 'Theatre', 'Fashion shows', 'Film screenings', 'Nightlife events']],
        'Exhibitions & Commerce' => ['store', 'free', ['Trade fairs', 'Expos', 'Product exhibitions', 'Business fairs', 'Agricultural shows', 'Career fairs']],
        'Community & Social' => ['users', 'free', ['Religious gatherings', 'Community meetings', 'Charity events', 'Fundraising dinners', 'Cultural celebrations']],
        'Sports & Recreation' => ['trophy', 'paid', ['Tournaments', 'Marathons', 'Competitions', 'Sports days', 'Outdoor activities']],
    ];

    public static function ready(): bool
    {
        return Schema::hasTable('event_categories');
    }

    private function slug(string $name, ?int $except = null): string
    {
        $base = Str::slug($name) ?: 'category';
        $slug = $base;
        for ($i = 2; EventCategory::where('slug', $slug)->when($except, fn ($q) => $q->where('id', '!=', $except))->exists(); $i++) {
            $slug = $base . '-' . $i;
        }

        return $slug;
    }

    /** The whole tree (admin sees inactive ones too). */
    public function tree(bool $withInactive = false): array
    {
        $all = EventCategory::orderBy('sort_order')->orderBy('name')->get()->when(! $withInactive, fn ($c) => $c->where('is_active', true));
        $events = DB::table('events')->whereNull('deleted_at')->selectRaw('category_id, COUNT(*) AS n')->groupBy('category_id')->pluck('n', 'category_id');
        $build = function ($parent) use (&$build, $all, $events) {
            return $all->where('parent_id', $parent)->values()->map(fn ($c) => ['id' => (int) $c->id, 'parent_id' => $c->parent_id ? (int) $c->parent_id : null, 'name' => $c->name, 'slug' => $c->slug, 'icon' => $c->icon,
                'description' => $c->description, 'cover_image' => $c->cover_image, 'default_participation' => $c->default_participation, 'sort_order' => (int) $c->sort_order, 'is_active' => (bool) $c->is_active,
                'events' => (int) ($events[$c->id] ?? 0), 'children' => $build($c->id)])->all();
        };

        return $build(null);
    }

    public function save(?EventCategory $c, array $in): EventCategory
    {
        $name = trim((string) ($in['name'] ?? $c?->name ?? ''));
        if ($name === '') {
            throw ValidationException::withMessages(['name' => 'Give the category a name.']);
        }
        $parent = $in['parent_id'] ?? $c?->parent_id;
        if ($parent) {
            if ($c && (int) $parent === (int) $c->id) {
                throw ValidationException::withMessages(['parent_id' => 'A category cannot sit inside itself.']);
            }
            if (EventCategory::whereKey($parent)->value('parent_id')) {
                throw ValidationException::withMessages(['parent_id' => 'Categories go two levels deep: a category and its subcategories.']);
            }
            if ($c && EventCategory::where('parent_id', $c->id)->exists()) {
                throw ValidationException::withMessages(['parent_id' => 'A category that has subcategories cannot become a subcategory.']);
            }
        }
        $part = $in['default_participation'] ?? $c?->default_participation;
        if ($part && ! array_key_exists($part, \App\Models\Events\Event::PARTICIPATION)) {
            throw ValidationException::withMessages(['default_participation' => 'That is not a participation model.']);
        }
        $fields = ['parent_id' => $parent ?: null, 'name' => $name, 'icon' => $in['icon'] ?? $c?->icon, 'description' => $in['description'] ?? $c?->description, 'cover_image' => $in['cover_image'] ?? $c?->cover_image,
            'default_participation' => $part ?: null, 'sort_order' => (int) ($in['sort_order'] ?? $c?->sort_order ?? 0), 'is_active' => (bool) ($in['is_active'] ?? $c?->is_active ?? true)];
        if ($c) {
            $c->update($fields + ($name !== $c->name ? ['slug' => $this->slug($name, $c->id)] : []));

            return $c->fresh();
        }

        return EventCategory::create($fields + ['slug' => $this->slug($name)]);
    }

    /** A category with events or subcategories is switched off, not deleted, so no event loses its category. */
    public function delete(EventCategory $c): bool
    {
        if (EventCategory::where('parent_id', $c->id)->exists() || DB::table('events')->where('category_id', $c->id)->exists()) {
            $c->update(['is_active' => false]);

            return false;
        }
        $c->delete();

        return true;
    }

    /** Add the standard categories that are not there yet (matched by name). Returns the names added. */
    public function addStandard(): array
    {
        $made = [];
        $order = 0;
        foreach (self::STANDARD as $name => [$icon, $part, $kids]) {
            $parent = EventCategory::whereNull('parent_id')->where('name', $name)->first();
            if (! $parent) {
                $parent = EventCategory::create(['name' => $name, 'slug' => $this->slug($name), 'icon' => $icon, 'default_participation' => $part, 'sort_order' => $order, 'is_active' => true]);
                $made[] = $name;
            }
            $order++;
            foreach ($kids as $i => $kid) {
                if (! EventCategory::where('parent_id', $parent->id)->where('name', $kid)->exists()) {
                    EventCategory::create(['parent_id' => $parent->id, 'name' => $kid, 'slug' => $this->slug($kid), 'sort_order' => $i, 'is_active' => true]);
                    $made[] = "{$name} › {$kid}";
                }
            }
        }

        return $made;
    }
}
