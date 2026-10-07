import { priceListPdf } from './priceListPdf';
import { zipStore } from './zip';
import { slugify } from './format';
import { saveBlob } from '../brochure/pdf';

const bytes = async (blob) => new Uint8Array(await blob.arrayBuffer());

/** The three files of a price list as a zip: a PDF drawn here, and the CSV and JSON the server made. @returns {Promise<Blob>} */
export async function listZip({ list, items, rule, company, csv, json }) {
  const slug = slugify(list.name);

  return zipStore([
    { name: `${slug}.pdf`, data: await bytes(priceListPdf({ list, items, company, rule })) },
    { name: `${slug}.csv`, data: await bytes(csv) },
    { name: `${slug}.json`, data: await bytes(json) },
  ]);
}

export const listPdfBlob = ({ list, items, rule, company }) => priceListPdf({ list, items, company, rule });

export { saveBlob };
