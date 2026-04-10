export default function Card({
  children,
  title,
  subtitle,
  actions,
  padding = true,
  hover = false,
  className = '',
}) {
  return (
    <div
      className={`
        bg-white dark:bg-gray-800 
        border border-gray-200 dark:border-gray-700 
        rounded-lg shadow-sm
        ${hover ? 'hover:shadow-md transition-shadow' : ''}
        ${className}
      `}
    >
      {/* Header */}
      {(title || subtitle || actions) && (
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              {title && (
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {subtitle}
                </p>
              )}
            </div>
            {actions && <div>{actions}</div>}
          </div>
        </div>
      )}

      {/* Content */}
      <div className={padding ? 'p-6' : ''}>
        {children}
      </div>
    </div>
  );
}