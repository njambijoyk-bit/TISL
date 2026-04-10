import Sidebar from './Sidebar';

export default function AdminLayout({ children }) {
  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      
      <main className="flex-1 overflow-x-hidden w-full">
        <div className="w-full px-3 sm:px-4 lg:px-8 py-4 sm:py-6 lg:py-8 pt-16 md:pt-6">
          {children}
        </div>
      </main>
    </div>
  );
}
