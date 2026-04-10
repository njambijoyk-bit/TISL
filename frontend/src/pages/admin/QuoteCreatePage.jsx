import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast"; 

import AdminLayout from "../../components/layout/AdminLayout";
import QuoteCreate from "../../components/quotes/QuoteCreate";
import customersAPI from "../../api/customers";
import { quotesAPI } from "../../api/quotes";

const QuoteCreatePage = () => {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);

  useEffect(() => {
    const loadCustomers = async () => {
      try {
        setLoadingCustomers(true);

        const data = await customersAPI.getAllCustomers();
        const list = Array.isArray(data)
          ? data
          : data?.customers || data?.data || [];

        setCustomers(list);
      } catch (err) {
        console.error("Failed to load customers", err);
      } finally {
        setLoadingCustomers(false);
      }
    };

    loadCustomers();
  }, []);

  // Mirrors handleCreateQuote in QuoteRequestDetail exactly —
  // QuoteCreate doesn't POST itself, it hands the built payload here.
  const handleCreateQuote = async (quoteData) => {
    const response = await quotesAPI.createQuote(quoteData);
    toast.success('Quote created successfully!'); 
    navigate(`/admin/quotes/${response.quote.id}`);
  };

  return (
    <AdminLayout title="Create Quote">
      <QuoteCreate
        isOpen={true}
        onClose={() => window.history.back()}
        onSuccess={handleCreateQuote}
        customers={customers}
        loadingCustomers={loadingCustomers}
      />
    </AdminLayout>
  );
};

export default QuoteCreatePage;