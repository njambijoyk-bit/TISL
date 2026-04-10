export default function PageHeader({ title, subtitle, actions, children }) {
  return (
    <div className="mb-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              {subtitle}
            </p>
          )}
        </div>
        
        {actions && (
          <div className="mt-4 sm:mt-0 flex items-center space-x-3">
            {actions}
          </div>
        )}
      </div>
      
      {children && (
        <div className="mt-6">
          {children}
        </div>
      )}
    </div>
  );
}