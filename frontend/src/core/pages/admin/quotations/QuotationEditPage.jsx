import VoucherForm from '../books/VoucherForm';
import quotationsAPI from '../../../../_shared/api/quotations';

/** Price / edit a quotation with the same form the books use, limited to quotations. */
export default function QuotationEditPage() {
  return <VoucherForm api={quotationsAPI} mode="quotation" />;
}
