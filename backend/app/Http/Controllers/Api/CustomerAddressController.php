<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\Hash;

class CustomerAddressController extends Controller
{
    public function adminIndex($customerId)
    {
        $customer = Customer::findOrFail($customerId);
        $addresses = $customer->addresses()->orderBy('created_at', 'desc')->get();
        return response()->json($addresses);
    }

    public function adminStore(Request $request, $customerId)
    {
        $customer = Customer::findOrFail($customerId);

        $validated = $request->validate([
            'address_type'          => 'required|in:home,office,warehouse,billing,shipping,other',
            'label'                 => 'nullable|string|max:100',
            'contact_name'          => 'nullable|string|max:255',
            'contact_phone'         => 'nullable|string|max:50',
            'address_line_1'        => 'required|string|max:255',
            'address_line_2'        => 'nullable|string|max:255',
            'city'                  => 'required|string|max:100',
            'state'                 => 'nullable|string|max:100',
            'postal_code'           => 'nullable|string|max:20',
            'country'               => 'required|string|max:100',
            'landmark'              => 'nullable|string|max:255',
            'delivery_instructions' => 'nullable|string',
            'is_default_shipping'   => 'boolean',
            'is_default_billing'    => 'boolean',
        ]);

        // Clear existing defaults if needed
        if (!empty($validated['is_default_shipping'])) {
            $customer->addresses()->update(['is_default_shipping' => false]);
        }
        if (!empty($validated['is_default_billing'])) {
            $customer->addresses()->update(['is_default_billing' => false]);
        }

        $address = $customer->addresses()->create($validated);

        return response()->json(['address' => $address], 201);
    }

    public function adminUpdate(Request $request, $customerId, $addressId)
    {
        $customer = Customer::findOrFail($customerId);
        $address  = $customer->addresses()->findOrFail($addressId);

        $validated = $request->validate([
            'address_type'          => 'sometimes|in:home,office,warehouse,billing,shipping,other',
            'label'                 => 'nullable|string|max:100',
            'contact_name'          => 'nullable|string|max:255',
            'contact_phone'         => 'nullable|string|max:50',
            'address_line_1'        => 'sometimes|required|string|max:255',
            'address_line_2'        => 'nullable|string|max:255',
            'city'                  => 'sometimes|required|string|max:100',
            'state'                 => 'nullable|string|max:100',
            'postal_code'           => 'nullable|string|max:20',
            'country'               => 'sometimes|required|string|max:100',
            'landmark'              => 'nullable|string|max:255',
            'delivery_instructions' => 'nullable|string',
            'is_default_shipping'   => 'boolean',
            'is_default_billing'    => 'boolean',
        ]);

        if (!empty($validated['is_default_shipping'])) {
            $customer->addresses()->where('id', '!=', $addressId)->update(['is_default_shipping' => false]);
        }
        if (!empty($validated['is_default_billing'])) {
            $customer->addresses()->where('id', '!=', $addressId)->update(['is_default_billing' => false]);
        }

        $address->update($validated);

        return response()->json(['address' => $address->fresh()]);
    }

    public function adminDestroy($customerId, $addressId)
    {
        $customer = Customer::findOrFail($customerId);
        $address  = $customer->addresses()->findOrFail($addressId);
        $address->delete();

        return response()->json(['message' => 'Address deleted.']);
    }

    public function adminSetDefaultShipping($customerId, $addressId)
    {
        $customer = Customer::findOrFail($customerId);
        $customer->addresses()->update(['is_default_shipping' => false]);
        $customer->addresses()->findOrFail($addressId)->update(['is_default_shipping' => true]);

        return response()->json(['message' => 'Default shipping address updated.']);
    }

    public function adminSetDefaultBilling($customerId, $addressId)
    {
        $customer = Customer::findOrFail($customerId);
        $customer->addresses()->update(['is_default_billing' => false]);
        $customer->addresses()->findOrFail($addressId)->update(['is_default_billing' => true]);

        return response()->json(['message' => 'Default billing address updated.']);
    }
}