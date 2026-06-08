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
    <>
      <style>{`
        .product-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }
        @media (min-width: 640px) {
          .product-grid {
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          }
        }
      `}</style>
      <div className="product-grid">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div></>
  );
}