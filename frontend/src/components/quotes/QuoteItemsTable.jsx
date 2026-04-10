import React from 'react';
import { 
  Package, 
  Wrench, 
  DollarSign, 
  Clock,
  Calendar,
  MapPin,
  Tag,
  Layers
} from 'lucide-react';
import Badge from '../common/Badge';

/**
 * QuoteItemsTable Component
 * Displays quote items (products, services, or mixed) in a table format
 */
const QuoteItemsTable = ({ items = [], showActions = false, onEdit, onRemove }) => {
  // Get item type icon
  const getItemTypeIcon = (itemType) => {
    const icons = {
      product: Package,
      service: Wrench,
      custom_product: Package,
      custom_service: Wrench,
      fee: DollarSign,
      custom: Layers,
    };
    const Icon = icons[itemType] || Package;
    return <Icon className="w-4 h-4" />;
  };

  // Get item type label
  const getItemTypeLabel = (itemType) => {
    const labels = {
      product: 'Product',
      service: 'Service',
      custom_product: 'Custom Product',
      custom_service: 'Custom Service',
      fee: 'Fee',
      custom: 'Custom Item',
    };
    return labels[itemType] || itemType;
  };

  // Get item type badge variant
  const getItemTypeBadgeVariant = (itemType) => {
    if (itemType === 'service' || itemType === 'custom_service') {
      return 'info';
    }
    if (itemType === 'product' || itemType === 'custom_product') {
      return 'primary';
    }
    if (itemType === 'fee') {
      return 'warning';
    }
    return 'secondary';
  };

  // Format currency
  const formatCurrency = (amount) => {
    return `KES ${parseFloat(amount || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  // Calculate total
  const calculateTotal = () => {
    return items.reduce((sum, item) => {
      return sum + (parseFloat(item.line_total_after_discount || item.line_total || 0));
    }, 0);
  };

  if (!items || items.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        No items in this quote
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <thead className="bg-gray-50 dark:bg-gray-800">
          <tr>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Type
            </th>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Item
            </th>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Details
            </th>
            <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Quantity
            </th>
            <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Unit Price
            </th>
            <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Subtotal
            </th>
            {showActions && (
              <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Actions
              </th>
            )}
          </tr>
        </thead>
        <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
          {items.map((item, index) => {
            const isService = item.item_type === 'service' || item.item_type === 'custom_service';
            const isProduct = item.item_type === 'product' || item.item_type === 'custom_product';
            const itemName = item.product_name || item.service_name || item.name || 'Unnamed Item';
            const itemDescription = item.service_description || item.description;

            return (
              <tr key={item.id || index} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                {/* Type */}
                <td className="px-4 py-4 whitespace-nowrap">
                  <Badge 
                    variant={getItemTypeBadgeVariant(item.item_type)}
                    className="flex items-center gap-1 text-xs"
                  >
                    {getItemTypeIcon(item.item_type)}
                    {getItemTypeLabel(item.item_type)}
                  </Badge>
                  {item.is_custom_item && (
                    <Badge variant="secondary" size="sm" className="mt-1">
                      Custom
                    </Badge>
                  )}
                </td>

                {/* Item Name & Description */}
                <td className="px-4 py-4">
                  <div className="flex items-start gap-3">
                    {/* Image (for products) */}
                    {isProduct && item.product_image && (
                      <img
                        src={item.product_image}
                        alt={itemName}
                        className="w-12 h-12 object-cover rounded"
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                    )}

                    <div>
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">
                        {itemName}
                      </div>
                      {item.product_sku && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                          <Tag className="w-3 h-3" />
                          SKU: {item.product_sku}
                        </div>
                      )}
                      {itemDescription && (
                        <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          {itemDescription}
                        </div>
                      )}
                      {item.brand_name && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Brand: {item.brand_name}
                        </div>
                      )}
                    </div>
                  </div>
                </td>

                {/* Service/Product Details */}
                <td className="px-4 py-4">
                  <div className="space-y-1 text-xs">
                    {/* Service-specific details */}
                    {isService && (
                      <>
                        {item.estimated_hours && (
                          <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                            <Clock className="w-3 h-3" />
                            {item.estimated_hours} hours
                          </div>
                        )}
                        {item.hourly_rate && (
                          <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                            <DollarSign className="w-3 h-3" />
                            {formatCurrency(item.hourly_rate)}/hr
                          </div>
                        )}
                        {item.scheduled_start_date && (
                          <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                            <Calendar className="w-3 h-3" />
                            Start: {new Date(item.scheduled_start_date).toLocaleDateString()}
                          </div>
                        )}
                        {item.scheduled_end_date && (
                          <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                            <Calendar className="w-3 h-3" />
                            End: {new Date(item.scheduled_end_date).toLocaleDateString()}
                          </div>
                        )}
                        {item.requires_site_visit && (
                          <Badge variant="info" size="sm" className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            Site Visit Required
                          </Badge>
                        )}
                        {item.labor_cost && (
                          <div className="text-gray-600 dark:text-gray-400">
                            Labor: {formatCurrency(item.labor_cost)}
                          </div>
                        )}
                        {item.material_cost && (
                          <div className="text-gray-600 dark:text-gray-400">
                            Materials: {formatCurrency(item.material_cost)}
                          </div>
                        )}
                      </>
                    )}

                    {/* Product-specific details */}
                    {isProduct && item.variant_details && (
                      <div className="text-gray-600 dark:text-gray-400">
                        {Object.entries(item.variant_details).map(([key, value]) => (
                          <div key={key}>
                            {key}: {value}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Custom item details */}
                    {item.is_custom_item && item.custom_item_details && (
                      <div className="text-gray-600 dark:text-gray-400">
                        {item.custom_item_details.specifications && (
                          <div>Specs: {item.custom_item_details.specifications}</div>
                        )}
                        {item.custom_item_details.requirements && (
                          <div>Requirements: {item.custom_item_details.requirements}</div>
                        )}
                      </div>
                    )}

                    {/* Notes */}
                    {item.notes && (
                      <div className="text-gray-600 dark:text-gray-400 italic">
                        Note: {item.notes}
                      </div>
                    )}

                    {/* Pricing notes */}
                    {item.pricing_notes && (
                      <div className="text-gray-600 dark:text-gray-400">
                        {item.pricing_notes}
                      </div>
                    )}
                  </div>
                </td>

                {/* Quantity */}
                <td className="px-4 py-4 text-right whitespace-nowrap">
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">
                    {item.quantity}
                  </div>
                  {item.unit_of_measure && item.unit_of_measure !== 'each' && (
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {item.unit_of_measure}
                    </div>
                  )}
                </td>

                {/* Unit Price */}
                <td className="px-4 py-4 text-right whitespace-nowrap">
                  <div className="text-sm text-gray-900 dark:text-white">
                    {formatCurrency(item.unit_price)}
                  </div>
                  {item.original_price && item.original_price > item.unit_price && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 line-through">
                      {formatCurrency(item.original_price)}
                    </div>
                  )}
                </td>

                {/* Line Total */}
                <td className="px-4 py-4 text-right whitespace-nowrap">
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">
                    {formatCurrency(item.line_total_after_discount || item.line_total)}
                  </div>
                  {item.discount_amount > 0 && (
                    <div className="text-xs text-green-600 dark:text-green-400">
                      -{formatCurrency(item.discount_amount)} discount
                    </div>
                  )}
                </td>

                {/* Actions */}
                {showActions && (
                  <td className="px-4 py-4 text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-2">
                      {onEdit && (
                        <button
                          onClick={() => onEdit(item)}
                          className="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 text-sm font-medium"
                        >
                          Edit
                        </button>
                      )}
                      {onRemove && (
                        <button
                          onClick={() => onRemove(item)}
                          className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-sm font-medium"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>

        {/* Totals Footer */}
        <tfoot className="bg-gray-50 dark:bg-gray-800">
          <tr>
            <td colSpan={showActions ? 5 : 4} className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white">
              Total:
            </td>
            <td className="px-4 py-3 text-right text-sm font-bold text-gray-900 dark:text-white">
              {formatCurrency(calculateTotal())}
            </td>
            {showActions && <td></td>}
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

export default QuoteItemsTable;