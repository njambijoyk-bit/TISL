import Sidebar from './Sidebar';

export default function AdminLayout({ children }) {
  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      
      <main className="flex-1 overflow-x-hidden">
        <div className="container mx-auto px-4 lg:px-8 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}