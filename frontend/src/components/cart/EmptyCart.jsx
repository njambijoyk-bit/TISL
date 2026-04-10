import { ShoppingCart, Tag, Award, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Button from '../common/Button';
import { categoriesAPI, brandsAPI } from '../../api';

export default function EmptyCart() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const [categoriesRes, brandsRes] = await Promise.all([
        categoriesAPI.getCategories().catch(err => {
          console.error('Categories API error:', err);
          return [];
        }),
        brandsAPI.getBrands().catch(err => {
          console.error('Brands API error:', err);
          return [];
        })
      ]);
      
      // Parse categories response
      let cats = [];
      if (categoriesRes && Array.isArray(categoriesRes.data)) {
        cats = categoriesRes.data;
      } else if (Array.isArray(categoriesRes)) {
        cats = categoriesRes;
      }
      
      // Parse brands response
      let brandsList = [];
      if (Array.isArray(brandsRes)) {
        brandsList = brandsRes;
      } else if (brandsRes && Array.isArray(brandsRes.data)) {
        brandsList = brandsRes.data;
      }
      
      setCategories(cats);
      setBrands(brandsList);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      {/* Categories Section - TOP */}
      <div className="w-full max-w-5xl mb-16">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Tag size={20} className="text-primary-500" />
          Shop by Category
        </h3>
        
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
          </div>
        ) : categories.length > 0 ? (
          <div className="flex flex-wrap gap-3">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => navigate(`/products?category=${category.id}`)}
                className="category-btn inline-flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg transition-all duration-200 group"
              >
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {category.name}
                </span>
                {category.products_count > 0 && (
                  <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                    {category.products_count}
                  </span>
                )}
                <ArrowRight 
                  size={14} 
                  className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity duration-200" 
                />
              </button>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            No categories available
          </p>
        )}
      </div>

      {/* Empty Cart Message - MIDDLE */}
      <div className="w-24 h-24 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-6">
        <ShoppingCart size={48} className="text-gray-400" />
      </div>

      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
        Your cart is empty
      </h2>

      <p className="text-gray-600 dark:text-gray-400 text-center mb-8 max-w-md">
        Looks like you haven't added anything to your cart yet. Start shopping to fill it up!
      </p>

      {/* Start Shopping Button - Custom Purple */}
      <button
        onClick={() => navigate('/products')}
        className="start-shopping-btn inline-flex items-center justify-center px-8 py-3 text-base font-semibold text-white rounded-lg shadow-md transition-all duration-200 mb-16"
      >
        Start Shopping
      </button>

      {/* Brands Section - BOTTOM */}
      <div className="w-full max-w-5xl">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Award size={20} className="text-primary-500" />
          Shop by Brand
        </h3>
        
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
          </div>
        ) : brands.length > 0 ? (
          <div className="flex flex-wrap gap-3">
            {brands.map((brand) => (
              <button
                key={brand.id}
                onClick={() => navigate(`/products?brand=${brand.id}`)}
                className="brand-btn inline-flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg transition-all duration-200 group"
              >
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {brand.name}
                </span>

                {brand.products_count > 0 && (
                  <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                    {brand.products_count}
                  </span>
                )}

                <ArrowRight 
                  size={14} 
                  className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity duration-200" 
                />
              </button>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            No brands available
          </p>
        )}
      </div>

      {/* Custom Styles with Swapped Colors */}
      <style jsx>{`
        /* Categories - Red/Pink hover (swapped from brands) */
        .category-btn:hover {
          background-color: #fecaca;
          border-color: #fecaca;
          box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1);
        }

        .dark .category-btn:hover {
          background-color: #fecaca;
          border-color: #fecaca;
        }

        .category-btn:active {
          background-color: #fca5a5;
          transform: scale(0.98);
        }

        /* Brands - Blue hover (swapped from categories) */
        .brand-btn:hover {
          background-color: #93c5fd;
          border-color: #93c5fd;
          box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1);
        }

        .dark .brand-btn:hover {
          background-color: #93c5fd;
          border-color: #93c5fd;
        }

        .brand-btn:active {
          background-color: #60a5fa;
          transform: scale(0.98);
        }

        /* Start Shopping Button - Colors swapped */
        .start-shopping-btn {
          background-color: #d8b4fe;
          border: 1px solid #d8b4fe;
        }

        .start-shopping-btn:hover {
          background-color: #c084fc;
          border-color: #c084fc;
          box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
          transform: translateY(-2px);
        }

        .start-shopping-btn:active {
          background-color: #c084fc;
          transform: translateY(0) scale(0.98);
        }
      `}</style>
    </div>
  );
}
