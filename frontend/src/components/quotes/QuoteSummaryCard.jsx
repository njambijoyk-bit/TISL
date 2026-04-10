import React, { useState } from 'react';
import { DollarSign, Edit2, Check, X } from 'lucide-react';
import Button from '../common/Button';
import Input from '../common/Input';

/**
 * QuoteSummaryCard Component
 * Displays quote totals with editable discount, tax, and shipping
 */
const QuoteSummaryCard = ({ 
  quote, 
  onUpdate, 
  editable = false,
  className = '' 
}) => {
  const [editing, setEditing] = useState(null); // 'discount', 'tax', 'shipping', or null
  const [tempValues, setTempValues] = useState({
    discount: quote?.discount || 0,
    discount_percentage: quote?.discount_percentage || 0,
    tax: quote?.tax || 0,
    shipping_cost: quote?.shipping_cost || 0,
  });

  // Format currency
  const formatCurrency = (amount) => {
    return `KES ${parseFloat(amount || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  // Calculate totals
  const subtotal = parseFloat(quote?.subtotal || 0);
  const discount = parseFloat(quote?.discount || 0);
  const discountPercentage = parseFloat(quote?.discount_percentage || 0);
  const tax = parseFloat(quote?.tax || 0);
  const shipping = parseFloat(quote?.shipping_cost || 0);
  
  const afterDiscount = subtotal - discount;
  const total = afterDiscount + tax + shipping;

  // Handle edit start
  const startEdit = (field) => {
    if (!editable) return;
    setEditing(field);
    setTempValues({
      discount: quote?.discount || 0,
      discount_percentage: quote?.discount_percentage || 0,
      tax: quote?.tax || 0,
      shipping_cost: quote?.shipping_cost || 0,
    });
  };

  // Handle save
  const handleSave = async () => {
    if (!onUpdate) return;

    try {
      await onUpdate({
        discount: parseFloat(tempValues.discount) || 0,
        discount_percentage: parseFloat(tempValues.discount_percentage) || 0,
        tax: parseFloat(tempValues.tax) || 0,
        shipping_cost: parseFloat(tempValues.shipping_cost) || 0,
      });
      setEditing(null);
    } catch (error) {
      console.error('Failed to update:', error);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    setEditing(null);
    setTempValues({
      discount: quote?.discount || 0,
      discount_percentage: quote?.discount_percentage || 0,
      tax: quote?.tax || 0,
      shipping_cost: quote?.shipping_cost || 0,
    });
  };

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 ${className}`}>
      <div className="flex items-center gap-2 mb-4">
        <DollarSign className="w-5 h-5 text-primary-600 dark:text-primary-400" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Quote Summary
        </h3>
      </div>

      <div className="space-y-3">
        {/* Subtotal */}
        <div className="flex items-center justify-between py-2">
          <span className="text-sm text-gray-600 dark:text-gray-400">Subtotal</span>
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            {formatCurrency(subtotal)}
          </span>
        </div>

        {/* Discount */}
        <div className="flex items-center justify-between py-2 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Discount
              {discountPercentage > 0 && (
                <span className="text-xs text-gray-500 ml-1">
                  ({discountPercentage}%)
                </span>
              )}
            </span>
            {editable && editing !== 'discount' && (
              <button
                onClick={() => startEdit('discount')}
                className="text-gray-400 hover:text-primary-600 transition-colors"
              >
                <Edit2 className="w-3 h-3" />
              </button>
            )}
          </div>

          {editing === 'discount' ? (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={tempValues.discount}
                onChange={(e) => setTempValues({ ...tempValues, discount: e.target.value })}
                className="w-24 text-sm"
                placeholder="Amount"
              />
              <Input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={tempValues.discount_percentage}
                onChange={(e) => setTempValues({ ...tempValues, discount_percentage: e.target.value })}
                className="w-20 text-sm"
                placeholder="%"
              />
              <button
                onClick={handleSave}
                className="text-green-600 hover:text-green-700"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={handleCancel}
                className="text-red-600 hover:text-red-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <span className="text-sm font-semibold text-red-600 dark:text-red-400">
              - {formatCurrency(discount)}
            </span>
          )}
        </div>

        {/* After Discount */}
        {discount > 0 && (
          <div className="flex items-center justify-between py-2 bg-gray-50 dark:bg-gray-700/50 px-3 rounded">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              After Discount
            </span>
            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              {formatCurrency(afterDiscount)}
            </span>
          </div>
        )}

        {/* Tax */}
        <div className="flex items-center justify-between py-2 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Tax (VAT)</span>
            {editable && editing !== 'tax' && (
              <button
                onClick={() => startEdit('tax')}
                className="text-gray-400 hover:text-primary-600 transition-colors"
              >
                <Edit2 className="w-3 h-3" />
              </button>
            )}
          </div>

          {editing === 'tax' ? (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={tempValues.tax}
                onChange={(e) => setTempValues({ ...tempValues, tax: e.target.value })}
                className="w-24 text-sm"
              />
              <button
                onClick={handleSave}
                className="text-green-600 hover:text-green-700"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={handleCancel}
                className="text-red-600 hover:text-red-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <span className="text-sm font-semibold text-green-600 dark:text-green-400">
              + {formatCurrency(tax)}
            </span>
          )}
        </div>

        {/* Shipping */}
        <div className="flex items-center justify-between py-2 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Shipping</span>
            {editable && editing !== 'shipping' && (
              <button
                onClick={() => startEdit('shipping')}
                className="text-gray-400 hover:text-primary-600 transition-colors"
              >
                <Edit2 className="w-3 h-3" />
              </button>
            )}
          </div>

          {editing === 'shipping' ? (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={tempValues.shipping_cost}
                onChange={(e) => setTempValues({ ...tempValues, shipping_cost: e.target.value })}
                className="w-24 text-sm"
              />
              <button
                onClick={handleSave}
                className="text-green-600 hover:text-green-700"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={handleCancel}
                className="text-red-600 hover:text-red-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <span className="text-sm font-semibold text-green-600 dark:text-green-400">
              + {formatCurrency(shipping)}
            </span>
          )}
        </div>

        {/* Total */}
        <div className="flex items-center justify-between py-3 border-t-2 border-gray-300 dark:border-gray-600 mt-2">
          <span className="text-base font-bold text-gray-900 dark:text-white">
            Total
          </span>
          <span className="text-lg font-bold text-primary-600 dark:text-primary-400">
            {formatCurrency(total)}
          </span>
        </div>

        {/* Valid Until */}
        {quote?.valid_until && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Valid until: {new Date(quote.valid_until).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuoteSummaryCard;