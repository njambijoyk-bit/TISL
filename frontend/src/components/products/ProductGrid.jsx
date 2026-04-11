import ProductCard from './ProductCard';
import LoadingSpinner from '../layout/LoadingSpinner';
import EmptyState from '../layout/EmptyState';
import { useNavigate } from 'react-router-dom';
import Button from '../common/Button';

export default function ProductGrid({ products, loading, error }) {
  const navigate = useNavigate();

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 mb-4">{error}</p>
        <Button onClick={() => window.location.reload()}>
          Try Again
        </Button>
      </div>
    );
  }

  if (!products || products.length === 0) {
    return (
      <EmptyState
        type="products"
        title="No products found"
        message="Try adjusting your filters or search terms"
        action={
          <Button
            variant="primary"
            onClick={() => navigate('/products')}
          >
            View All Products
          </Button>
        }
      />
    );
  }

  return (
    <div
  className="grid gap-4 sm:gap-5 md:gap-6"
  style={{
    gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 320px))',
    justifyContent: 'center'
  }}
>
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}