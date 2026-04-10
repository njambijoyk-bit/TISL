import Header from '../../../components/layout/Header';
import Footer from '../../../components/layout/Footer';
import Sidebar from '../../../components/layout/Sidebar';
import PageHeader from '../../../components/layout/PageHeader';
import Card from '../../../components/common/Card';
import { Database } from 'lucide-react';

export default function BackupSettings() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      <Header />
      <div className="flex flex-1">
        <Sidebar />
        <div className="flex-1 overflow-auto">
          <div className="max-w-7xl mx-auto px-4 py-8">
            <PageHeader title="Backup & Restore" subtitle="Manage database backups and restoration" />
            <Card>
              <div className="text-center py-12">
                <Database size={48} className="mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Backup & Restore</h3>
                <p className="text-gray-600 dark:text-gray-400">Coming soon</p>
              </div>
            </Card>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}