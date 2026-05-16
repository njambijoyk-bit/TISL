import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import useStudioStore from '../../store/studioStore';
import { ProductCardA, ProductCardB, ProductCardC } from '../../components/studio/blocks/ProductCards';

export default function BrochureDetail() {
    const { slug } = useParams();
    const { fetchPublicPublication, loading } = useStudioStore();
    const [brochure, setBrochure] = useState(null);

    useEffect(() => {
        fetchPublicPublication(slug).then(setBrochure);
    }, [slug, fetchPublicPublication]);

    if (loading || !brochure) return <div className="min-h-screen flex items-center justify-center">Loading Brochure...</div>;

    const accent = brochure.style_config?.accent || '#a855f7';

    return (
        <div className="min-h-screen bg-white">
            <Header />
            
            <div className={`brochure-shell template-${brochure.template}`} style={{ '--accent': accent }}>
                
                {/* PDF Print Download Button */}
                <div className="max-w-6xl mx-auto px-6 py-8 flex justify-end no-print">
                    <button 
                        onClick={() => window.print()}
                        className="px-6 py-3 rounded-xl font-bold text-white shadow-lg transition-transform hover:scale-105"
                        style={{ background: accent }}
                    >
                        Download PDF
                    </button>
                </div>

                <div className="max-w-6xl mx-auto px-6 pb-20">
                    <header className="mb-16 text-center">
                        <h1 className="text-5xl font-black mb-4" style={{ color: '#111827' }}>{brochure.title}</h1>
                        <div className="w-24 h-1 mx-auto" style={{ background: accent }}></div>
                    </header>

                    {/* Flex Wrap Container for Blocks */}
                    <div className="flex flex-wrap items-start -mx-4">
                        {brochure.blocks?.map((block, i) => (
                            <div key={i} className="px-4 mb-8 box-border" style={{ width: block.style?.width || '100%' }}>
                                <PublicBlockRenderer block={block} accent={accent} />
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <Footer />

            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    body { background: white !important; }
                    .brochure-shell { padding: 0 !important; }
                }
                .template-bold h1 { text-transform: uppercase; letter-spacing: -0.02em; }
                .template-corporate { font-family: 'Inter', sans-serif; }
            `}</style>
        </div>
    );
}

function PublicBlockRenderer({ block, accent }) {
    const c = block.content || {};

    switch (block.type) {
        case 'rich_text':
            return <div className="prose prose-lg max-w-none" dangerouslySetInnerHTML={{ __html: c.html }} />;
        case 'image':
            return (
                <figure>
                    <img src={c.url} className="w-full rounded-2xl shadow-xl" alt="" />
                    {c.caption && <figcaption className="mt-4 text-center text-gray-400 text-sm italic">{c.caption}</figcaption>}
                </figure>
            );
        case 'product_card':
            if (c.variant === 'B') return <ProductCardB product={c} accentColor={accent} />;
            if (c.variant === 'C') return <ProductCardC product={c} accentColor={accent} />;
            return <ProductCardA product={c} accentColor={accent} />;
        case 'cta':
            return (
                <div className="text-center py-8">
                    <a href={c.link} className="inline-block px-10 py-4 rounded-2xl font-black text-white text-lg shadow-xl" style={{ background: accent }}>
                        {c.text}
                    </a>
                </div>
            );
        case 'bio_card':
            return (
                <div className="flex flex-col md:flex-row gap-6 items-center p-8 bg-gray-50 rounded-3xl border border-gray-100 h-full box-border">
                    <div className="w-24 h-24 rounded-full bg-gray-200 flex-shrink-0 overflow-hidden">
                        {c.image && <img src={c.image} className="w-full h-full object-cover" alt="" />}
                    </div>
                    <div>
                        <h4 className="text-xl font-black text-gray-900">{c.name}</h4>
                        <p className="text-purple-600 font-bold text-sm uppercase tracking-wider">{c.role}</p>
                        <p className="mt-4 text-gray-600 text-sm leading-relaxed">{c.bio}</p>
                    </div>
                </div>
            );
        case 'price_table':
            const rows = c.rows || [];
            return (
                <div className="overflow-hidden rounded-3xl border border-gray-100 shadow-sm h-full bg-white">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b border-gray-100">
                            <tr>
                                <th className="px-6 py-4 text-xs font-black uppercase text-gray-500">Item</th>
                                <th className="px-6 py-4 text-xs font-black uppercase text-gray-500 text-right">Price</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {rows.map((r, i) => (
                                <tr key={i}>
                                    <td className="px-6 py-4 text-gray-900 font-medium">{r.item}</td>
                                    <td className="px-6 py-4 text-purple-600 font-black text-right">{r.price}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        case 'pull_quote':
            return (
                <div className="py-10 px-8 bg-gray-50 border-l-8 border-purple-500 rounded-r-3xl h-full box-border">
                    <p className="text-xl font-black text-gray-900 leading-tight italic">
                        "{c.text}"
                    </p>
                    {c.attribution && (
                        <p className="mt-6 text-purple-600 font-black uppercase tracking-widest text-xs">— {c.attribution}</p>
                    )}
                </div>
            );
        default:
            return null;
    }
}
