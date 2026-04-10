import { Package, ShoppingCart, FileText, Inbox } from 'lucide-react';

export default function EmptyState({ type = 'default', title, message, action }) {
  const icons = {
    products: Package,
    cart: ShoppingCart,
    orders: ShoppingCart,
    quotes: FileText,
    default: Inbox,
  };

  const Icon = icons[type] || icons.default;

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
        <Icon size={32} className="text-gray-400" />
      </div>
      
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        {title || 'No items found'}
      </h3>
      
      <p className="text-gray-600 dark:text-gray-400 max-w-md mb-6">
        {message || 'There are no items to display at the moment.'}
      </p>
      
      {action && (
        <div>
          {action}
        </div>
      )}
    </div>
  );
}