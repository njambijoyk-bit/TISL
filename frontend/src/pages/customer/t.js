public function syncOrderPaymentStatus(): void  
{  
    $order = $this->order;  
    if (!$order) return;  
  
    $totalConfirmed = static::where('order_id', $order->id)  
        ->where('status', 'confirmed')  
        ->sum('mpesa_amount_confirmed');  
  
    $totalKes = (float) ($order->total_kes ?? $order->total ?? 0);  
  
    $newPaymentStatus = match(true) {  
        $totalConfirmed <= 0             => 'unpaid',  
        $totalConfirmed >= $totalKes     => 'paid',  
        default                          => 'partially_paid',  
    };  
  
    if ($newPaymentStatus === 'paid' && !$order->paid_at) {  
        // Use markAsPaid to trigger loyalty points  
        $order->markAsPaid($this->mpesa_receipt_number);  
    } else {  
        // For other statuses, update directly  
        $order->update(['payment_status' => $newPaymentStatus]);  
    }  
}
$this->update([
            'payment_status'    => 'paid',
            'paid_at'           => now(),
            'payment_reference' => $reference ?? $this->payment_reference,
        ]);