import React from 'react';
import ServiceCard from './ServiceCard';
import EmptyState from '../layout/EmptyState';
import LoadingSpinner from '../layout/LoadingSpinner';
import { Wrench } from 'lucide-react';

/**
 * ServiceGrid Component
 * Auto-fill responsive grid — adds a new column whenever space allows.
 * Small screens: 1–2 cards. Medium: 3. Large: 4. XL: 5+
 */
const ServiceGrid = ({
  services = [],
  loading = false,
  emptyMessage = 'No services found',
  emptyDescription = 'Try adjusting your search or filters',
  onServiceClick,
}) => {
  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!services || services.length === 0) {
    return (
      <EmptyState
        icon={Wrench}
        title={emptyMessage}
        description={emptyDescription}
      />
    );
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))',
        gap: '12px',
      }}
    >
      {services.map((service) => (
        <ServiceCard
          key={service.id}
          service={service}
          onClick={onServiceClick}
        />
      ))}
    </div>
  );
};

export default ServiceGrid;