<?php

namespace Tests\Feature\Concerns;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** The events tables (hand-built for the in-memory test database; the real ones come from database script 120) and two ledgers: an income account (40) and a bank (41). */
trait CreatesEventTables
{
    protected function createEventTables(): void
    {
        Schema::create('events', function ($t) { $t->id(); $t->string('title'); $t->string('slug')->unique(); $t->string('summary')->nullable(); $t->text('description')->nullable(); $t->string('kind')->default('in_person'); $t->string('venue_name')->nullable(); $t->string('venue_address')->nullable(); $t->string('map_url')->nullable(); $t->string('online_url')->nullable(); $t->string('organiser')->nullable(); $t->string('main_image')->nullable(); $t->string('video_url')->nullable(); $t->string('status')->default('draft'); $t->boolean('is_listed')->default(true); $t->unsignedBigInteger('currency_id')->nullable(); $t->unsignedBigInteger('sales_ledger_id')->nullable(); $t->unsignedBigInteger('tax_rate_id')->nullable(); $t->unsignedBigInteger('location_id')->nullable(); $t->unsignedSmallInteger('max_per_order')->default(10); $t->dateTime('refund_until')->nullable(); $t->text('refund_policy')->nullable(); $t->boolean('allow_name_change')->default(true); $t->dateTime('published_at')->nullable(); $t->unsignedBigInteger('created_by')->nullable(); $t->unsignedBigInteger('updated_by')->nullable(); $t->softDeletes(); $t->timestamps(); });
        Schema::create('event_sessions', function ($t) { $t->id(); $t->unsignedBigInteger('event_id'); $t->string('label')->nullable(); $t->dateTime('starts_at'); $t->dateTime('ends_at')->nullable(); $t->unsignedInteger('capacity')->nullable(); $t->boolean('is_cancelled')->default(false); $t->timestamps(); });
        Schema::create('event_ticket_types', function ($t) { $t->id(); $t->unsignedBigInteger('event_id'); $t->string('name'); $t->string('description')->nullable(); $t->decimal('price', 12, 2)->default(0); $t->unsignedInteger('capacity')->nullable(); $t->unsignedSmallInteger('min_per_order')->default(1); $t->unsignedSmallInteger('max_per_order')->nullable(); $t->dateTime('sale_starts_at')->nullable(); $t->dateTime('sale_ends_at')->nullable(); $t->smallInteger('sort_order')->default(0); $t->boolean('is_active')->default(true); $t->softDeletes(); $t->timestamps(); });
        Schema::create('event_ticket_type_sessions', function ($t) { $t->unsignedBigInteger('ticket_type_id'); $t->unsignedBigInteger('session_id'); $t->primary(['ticket_type_id', 'session_id']); });
        Schema::create('event_tickets', function ($t) { $t->id(); $t->unsignedBigInteger('event_id'); $t->unsignedBigInteger('ticket_type_id'); $t->string('reference', 12)->unique(); $t->string('state')->default('held'); $t->dateTime('held_until')->nullable(); $t->unsignedBigInteger('order_id')->nullable(); $t->unsignedBigInteger('sale_id')->nullable(); $t->unsignedBigInteger('customer_id')->nullable(); $t->string('buyer_name')->nullable(); $t->string('buyer_email')->nullable(); $t->string('buyer_phone')->nullable(); $t->string('holder_name')->nullable(); $t->decimal('price', 12, 2)->default(0); $t->dateTime('issued_at')->nullable(); $t->dateTime('cancelled_at')->nullable(); $t->string('cancel_reason')->nullable(); $t->unsignedBigInteger('sold_by')->nullable(); $t->timestamps(); });
        Schema::create('event_checkins', function ($t) { $t->id(); $t->unsignedBigInteger('event_id'); $t->unsignedBigInteger('ticket_id')->nullable(); $t->unsignedBigInteger('session_id')->nullable(); $t->string('result'); $t->string('code_text')->nullable(); $t->unsignedBigInteger('checked_by')->nullable(); $t->string('note')->nullable(); $t->timestamps(); });
        Schema::create('event_settings', function ($t) { $t->unsignedTinyInteger('id')->primary(); $t->json('settings')->nullable(); $t->unsignedBigInteger('updated_by')->nullable(); $t->timestamps(); });
        Schema::create('ledger_groups', function ($t) { $t->id(); $t->unsignedBigInteger('parent_id')->nullable(); $t->string('name'); $t->timestamps(); });
        Schema::create('ledgers', function ($t) { $t->id(); $t->unsignedBigInteger('group_id')->nullable(); $t->string('name'); $t->timestamps(); });
        $income = DB::table('ledger_groups')->insertGetId(['name' => 'Direct Income']);
        $bank = DB::table('ledger_groups')->insertGetId(['name' => 'Bank Accounts']);
        DB::table('ledgers')->insert([['id' => 40, 'group_id' => $income, 'name' => 'Ticket sales'], ['id' => 41, 'group_id' => $bank, 'name' => 'KCB Bank']]);
    }
}
