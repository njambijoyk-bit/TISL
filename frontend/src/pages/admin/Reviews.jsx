import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Trash2, Star } from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout';
import PageHeader from '../../components/layout/PageHeader';
import DataTable from '../../components/admin/DataTable';
import SearchBar from '../../components/admin/SearchBar';
import Select from '../../components/common/Select';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';
import Button from '../../components/common/Button';
import { reviewsAPI } from '../../api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

export default function Reviews() {
  const [reviews, setReviews] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    search: '',
    approved: '',
    rating: '',
  });
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, review: null });

  useEffect(() => {
    fetchReviews();
  }, [filters]);

  const fetchReviews = async (page = 1) => {
    try {
      setLoading(true);
      const response = await reviewsAPI.getAllReviews({
        ...filters,
        page,
        per_page: 20,
      });
      setReviews(response.data);
      setPagination(response.pagination || response.meta);
    } catch (error) {
      console.error('Failed to fetch reviews:', error);
      toast.error('Failed to load reviews');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (reviewId) => {
    try {
      await reviewsAPI.approveReview(reviewId);
      toast.success('Review approved');
      fetchReviews();
    } catch (error) {
      toast.error('Failed to approve review');
    }
  };

  const handleReject = async (reviewId) => {
    try {
      await reviewsAPI.rejectReview(reviewId);
      toast.success('Review rejected');
      fetchReviews();
    } catch (error) {
      toast.error('Failed to reject review');
    }
  };

  const handleDelete = async () => {
    try {
      await reviewsAPI.deleteReview(deleteModal.review.id);
      toast.success('Review deleted');
      setDeleteModal({ isOpen: false, review: null });
      fetchReviews();
    } catch (error) {
      toast.error('Failed to delete review');
    }
  };

  const columns = [
    {
      header: 'Product',
      render: (review) => (
        <div className="flex items-center space-x-3">
          <img
            src={review.product?.main_image || '/placeholder-product.png'}
            alt={review.product?.name}
            className="w-12 h-12 object-cover rounded"
          />
          <div>
            <p className="font-medium text-gray-900 dark:text-white">
              {review.product?.name}
            </p>
          </div>
        </div>
      ),
    },
    {
      header: 'Customer',
      render: (review) => (
        <div>
          <p className="font-medium text-gray-900 dark:text-white">
            {review.user?.name}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {review.user?.email}
          </p>
        </div>
      ),
    },
    {
      header: 'Rating',
      render: (review) => (
        <div className="flex items-center">
          {[...Array(5)].map((_, i) => (
            <Star
              key={i}
              size={16}
              className={
                i < review.rating
                  ? 'fill-yellow-400 text-yellow-400'
                  : 'text-gray-300 dark:text-gray-600'
              }
            />
          ))}
          <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
            {review.rating}/5
          </span>
        </div>
      ),
    },
    {
      header: 'Review',
      render: (review) => (
        <div>
          {review.title && (
            <p className="font-medium text-gray-900 dark:text-white mb-1">
              {review.title}
            </p>
          )}
          <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
            {review.comment}
          </p>
          {review.images && review.images.length > 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {review.images.length} image(s)
            </p>
          )}
        </div>
      ),
    },
    {
      header: 'Status',
      render: (review) => (
        <div className="space-y-1">
          <Badge variant={review.is_approved ? 'success' : 'warning'}>
            {review.is_approved ? 'Approved' : 'Pending'}
          </Badge>
          {review.is_verified_purchase && (
            <Badge variant="info" size="sm">
              Verified
            </Badge>
          )}
        </div>
      ),
    },
    {
      header: 'Helpful',
      render: (review) => (
        <span className="text-sm text-gray-700 dark:text-gray-300">
          {review.helpful_count || 0}
        </span>
      ),
    },
    {
      header: 'Date',
      render: (review) => (
        <span className="text-sm text-gray-700 dark:text-gray-300">
          {format(new Date(review.created_at), 'MMM d, yyyy')}
        </span>
      ),
    },
    {
      header: 'Actions',
      render: (review) => (
        <div className="flex items-center space-x-2">
          {!review.is_approved && (
            <button
              onClick={() => handleApprove(review.id)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              title="Approve"
            >
              <CheckCircle size={18} className="text-green-500" />
            </button>
          )}
          {review.is_approved && (
            <button
              onClick={() => handleReject(review.id)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              title="Reject"
            >
              <XCircle size={18} className="text-red-500" />
            </button>
          )}
          <button
            onClick={() => setDeleteModal({ isOpen: true, review })}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            title="Delete"
          >
            <Trash2 size={18} className="text-red-500" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <AdminLayout>
      <PageHeader
        title="Reviews"
        subtitle="Moderate product reviews"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <SearchBar
            placeholder="Search reviews..."
            onSearch={(query) => setFilters({ ...filters, search: query })}
            defaultValue={filters.search}
          />
          <Select
            name="approved"
            value={filters.approved}
            onChange={(e) => setFilters({ ...filters, approved: e.target.value })}
            options={[
              { value: '', label: 'All Reviews' },
              { value: 'true', label: 'Approved' },
              { value: 'false', label: 'Pending' },
            ]}
          />
          <Select
            name="rating"
            value={filters.rating}
            onChange={(e) => setFilters({ ...filters, rating: e.target.value })}
            options={[
              { value: '', label: 'All Ratings' },
              { value: '5', label: '5 Stars' },
              { value: '4', label: '4 Stars' },
              { value: '3', label: '3 Stars' },
              { value: '2', label: '2 Stars' },
              { value: '1', label: '1 Star' },
            ]}
          />
        </div>
      </PageHeader>

      <DataTable
        columns={columns}
        data={reviews}
        loading={loading}
        pagination={pagination}
        onPageChange={fetchReviews}
        emptyMessage="No reviews found"
      />

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, review: null })}
        title="Delete Review"
      >
        <div className="space-y-4">
          <p className="text-gray-700 dark:text-gray-300">
            Are you sure you want to delete this review? This action cannot be undone.
          </p>
          <div className="flex justify-end space-x-3">
            <Button
              variant="secondary"
              onClick={() => setDeleteModal({ isOpen: false, review: null })}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete}>
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </AdminLayout>
  );
}