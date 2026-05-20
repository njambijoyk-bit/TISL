<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Payment;
use App\Models\User;
use App\Models\Category;
use App\Models\CustomerTier;
use App\Models\ShippingOption;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class FailedStatusTest extends TestCase
{
    use DatabaseMigrations;

    public function test_manual_failed_on_paid_order()
    {
        $admin = User::create(['name' => 'A', 'email' => 'a@e.com', 'password' => 'p', 'role' => 'super_admin', 'status' => 'active']);
        $cust = Customer::create(['first_name' => 'J', 'last_name' => 'D', 'email' => 'j@e.com', 'customer_number' => 'C1']);
        CustomerTier::create(['slug' => 'bronze', 'name' => 'B']);
        $cat = Category::create(['name' => 'T', 'slug' => 't']);
        ShippingOption::create(['slug' => 'standard_delivery', 'name' => 'S', 'is_active' => true, 'cost' => 0]);

        DB::table('loyalty_settings')->insert([
            ['key' => 'points_per_100_kes', 'value' => json_encode(1), 'updated_by' => $admin->id, 'created_at' => now(), 'updated_at' => now()],
        ]);

        $order = Order::create([
            'order_number' => 'O1', 'customer_id' => $cust->id, 'subtotal' => 1000, 'total' => 1000, 'total_kes' => 1000, 'currency' => 'KES', 'payment_status' => 'unpaid', 'status' => 'pending', 'delivery_method' => 'standard_delivery', 'shipping_address' => 'N'
        ]);

        OrderItem::create(['order_id' => $order->id, 'product_name' => 'P', 'quantity' => 1, 'unit_price' => 1000, 'line_total' => 1000, 'line_total_after_discount' => 1000]);

        // 1. Mark as Paid
        $this->actingAs($admin)->putJson("/api/admin/orders/{$order->id}/payment-status", [
            'payment_status' => 'paid', 'payment_method' => 'mpesa', 'payment_reference' => 'REF1'
        ])->assertStatus(200);

        $this->assertEquals('paid', $order->fresh()->payment_status);
        $this->assertEquals(10, $cust->fresh()->loyalty_points);

        // 2. Mark as Failed
        $this->actingAs($admin)->putJson("/api/admin/orders/{$order->id}/payment-status", [
            'payment_status' => 'failed'
        ])->assertStatus(200);

        $order->refresh();
        $this->assertEquals('failed', $order->payment_status);
        $this->assertEquals(10, $cust->fresh()->loyalty_points); // Points still there!
        $this->assertEquals(1000, $order->getTotalConfirmedPayments()); // Ledger still says 1000!
    }
}
