<?php

namespace App\Services\Projects\Links;

use App\Services\Projects\ProjectLinkTypes;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The paid modules' records that can be attached to a piece of work (docs/PROJECTS_STAGE7_SPEC.md, build 7.3). Each is there only while its
 * module is licensed and switched on, and only for people with that module's own permission. Modules with no record page of their own
 * (accommodations, listings, careers today) register nothing yet.
 */
class ModuleLinks
{
    public static function register(ProjectLinkTypes $types): void
    {
        CoreLinks::type($types, 'campaigns.campaign', 'campaigns', 'Campaign', 'Campaigns', 'campaigns.build', 'campaigns', ['title', 'slug'], false,
            ['id', 'title', 'type', 'starts_at', 'ends_at', 'is_published', 'is_paused', 'archived_at', 'approval_status'],
            fn ($r) => ['title' => $r->title, 'detail' => implode(' · ', array_filter([$r->type ? ucfirst((string) $r->type) : null, $r->starts_at ? substr((string) $r->starts_at, 0, 10) . ($r->ends_at ? ' to ' . substr((string) $r->ends_at, 0, 10) : '') : null])) ?: null,
                'url' => "/admin/campaigns/{$r->id}/edit", 'state' => $r->archived_at ? 'archived' : ($r->is_paused ? 'paused' : ($r->is_published ? 'live' : ($r->approval_status === 'pending' ? 'waiting' : 'draft')))],
            ['draft' => ['Draft', null], 'waiting' => ['Waiting for approval', 'warning'], 'live' => ['Live', 'good'], 'paused' => ['Paused', 'warning'], 'archived' => ['Archived', null]],
            'deliverable');

        CoreLinks::type($types, 'courses.offering', 'courses', 'Course', 'Courses', 'courses.view', 'course_offerings', ['title', 'slug'], false,
            ['id', 'title', 'kind', 'delivery', 'status'],
            fn ($r) => ['title' => $r->title, 'detail' => implode(' · ', array_filter([$r->kind ? ucfirst((string) $r->kind) : null, $r->delivery ? ucfirst(str_replace('_', ' ', (string) $r->delivery)) : null])) ?: null,
                'url' => "/admin/courses/{$r->id}", 'state' => $r->status],
            ['draft' => ['Draft', null], 'published' => ['Published', 'good'], 'archived' => ['Archived', null]], 'deliverable');

        CoreLinks::type($types, 'courses.intake', 'courses', 'Course intake', 'Course intakes', 'courses.view', 'course_intakes', ['name'], false,
            ['id', 'offering_id', 'name', 'starts_on', 'ends_on', 'status'],
            fn ($r) => ['title' => trim(self::name('course_offerings', 'title', (int) $r->offering_id) . " · {$r->name}", ' ·'), 'detail' => $r->starts_on ? substr((string) $r->starts_on, 0, 10) . ($r->ends_on ? ' to ' . substr((string) $r->ends_on, 0, 10) : '') : null,
                'url' => "/admin/courses/{$r->offering_id}", 'state' => $r->status],
            ['open' => ['Taking people', 'good'], 'closed' => ['Closed', null]], 'deliverable');

        CoreLinks::type($types, 'courses.enrolment', 'courses', 'Enrolment', 'Enrolments', 'courses.enrol', 'course_enrolments', ['number'], false,
            ['id', 'number', 'offering_id', 'student_user_id', 'status'],
            fn ($r) => ['title' => 'Enrolment ' . ($r->number ?: "#{$r->id}"), 'detail' => implode(' · ', array_filter([self::name('users', 'name', (int) $r->student_user_id), self::name('course_offerings', 'title', (int) $r->offering_id)])) ?: null,
                'url' => "/admin/courses/enrolments?id={$r->id}", 'state' => $r->status],
            ['pending' => ['Waiting for the first payment', 'warning'], 'active' => ['Active', 'good'], 'completed' => ['Completed', 'good'], 'cancelled' => ['Cancelled', 'problem'], 'refunded' => ['Refunded', null]], 'related');

        CoreLinks::type($types, 'memberships.member', 'memberships', 'Membership', 'Memberships', 'memberships.view', 'memberships', ['number'], false,
            ['id', 'number', 'plan_id', 'member_user_id', 'status', 'paid_until'],
            fn ($r) => ['title' => 'Membership ' . ($r->number ?: "#{$r->id}"), 'detail' => implode(' · ', array_filter([self::name('users', 'name', (int) $r->member_user_id), self::name('membership_plans', 'name', (int) $r->plan_id), $r->paid_until ? 'paid to ' . substr((string) $r->paid_until, 0, 10) : null])) ?: null,
                'url' => "/admin/memberships/members?id={$r->id}", 'state' => $r->status],
            ['pending' => ['Waiting', 'warning'], 'trial' => ['On trial', 'info'], 'active' => ['Active', 'good'], 'past_due' => ['Payment late', 'warning'], 'paused' => ['Paused', 'warning'], 'lapsed' => ['Lapsed', 'warning'], 'cancelled' => ['Cancelled', 'problem'], 'ended' => ['Ended', null]], 'related');

        CoreLinks::type($types, 'memberships.plan', 'memberships', 'Membership plan', 'Membership plans', 'memberships.view', 'membership_plans', ['name', 'slug'], false,
            ['id', 'name', 'period_unit', 'period_count', 'status'],
            fn ($r) => ['title' => $r->name, 'detail' => $r->period_unit ? "Every {$r->period_count} {$r->period_unit}" . ((int) $r->period_count === 1 ? '' : 's') : null, 'url' => '/admin/memberships', 'state' => $r->status],
            ['draft' => ['Draft', null], 'published' => ['Offered', 'good'], 'archived' => ['Archived', null]], 'deliverable');

        CoreLinks::type($types, 'events.booking', 'events', 'Event booking', 'Event bookings', 'events.view', 'event_bookings', ['reference'], false,
            ['id', 'reference', 'event_id', 'provider_type', 'starts_on', 'guests', 'status'],
            fn ($r) => ['title' => 'Booking ' . ($r->reference ?: "#{$r->id}") . ' · ' . self::name('events', 'title', (int) $r->event_id), 'detail' => implode(' · ', array_filter([$r->provider_type ? ucfirst((string) $r->provider_type) : null, $r->starts_on ? substr((string) $r->starts_on, 0, 10) : null, $r->guests ? "{$r->guests} guests" : null])) ?: null,
                'url' => "/admin/events/{$r->event_id}/plan", 'state' => $r->status],
            ['new' => ['Asked for', 'info'], 'consulting' => ['Being discussed', 'info'], 'quoted' => ['Quoted', 'info'], 'accepted' => ['Accepted', 'good'], 'declined' => ['Declined', 'problem'], 'closed' => ['Closed', null]], 'supplier');

        CoreLinks::type($types, 'menus.order', 'menus', 'Food order', 'Food orders', 'menus.view', 'menus_orders', ['number', 'name'], false,
            ['id', 'number', 'name', 'order_type', 'fulfil_at', 'status'],
            fn ($r) => ['title' => 'Food order ' . ($r->number ?: "#{$r->id}"), 'detail' => implode(' · ', array_filter([$r->name, $r->order_type ? ucfirst(str_replace('_', ' ', (string) $r->order_type)) : null, $r->fulfil_at ? substr((string) $r->fulfil_at, 0, 16) : null])) ?: null,
                'url' => "/admin/menus/orders?id={$r->id}", 'state' => $r->status],
            ['placed' => ['Placed', 'info'], 'accepted' => ['Accepted', 'info'], 'preparing' => ['Being made', 'info'], 'ready' => ['Ready', 'good'], 'out' => ['On its way', 'info'], 'completed' => ['Done', 'good'], 'cancelled' => ['Cancelled', 'problem']], 'related');
    }

    private static function name(string $table, string $col, int $id): ?string
    {
        return $id && Schema::hasTable($table) ? DB::table($table)->where('id', $id)->value($col) : null;
    }
}
