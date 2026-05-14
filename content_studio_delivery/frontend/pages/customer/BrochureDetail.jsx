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
    }, [slug]);

    if (loading || !brochure) return <div className="min-h-screen flex items-center justify-center">Loading Brochure...</div>;

    const accent = brochure.style_config?.accent || '#a855f7';

    return (
        <div className="min-h-screen bg-white">
            <Header />

            {/* Template-based shell */}
            <div className={`brochure-shell template-${brochure.template}`} style={{ '--accent': accent }}>

                {/* PDF Print Download Button */}
                <div className="max-w-4xl mx-auto px-6 py-8 flex justify-end no-print">
                    <button
                        onClick={() => window.print()}
                        className="px-6 py-3 rounded-xl font-bold text-white shadow-lg transition-transform hover:scale-105"
                        style={{ background: accent }}
                    >
                        Download PDF
                    </button>
                </div>

                <div className="max-w-4xl mx-auto px-6 pb-20">
                    <header className="mb-16 text-center">
                        <h1 className="text-5xl font-black mb-4" style={{ color: '#111827' }}>{brochure.title}</h1>
                        <div className="w-24 h-1 mx-auto" style={{ background: accent }}></div>
                    </header>

                    <div className="space-y-12">
                        {brochure.blocks?.map((block, i) => (
                            <div key={i} className="block-render">
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
    switch (block.type) {
        case 'rich_text':
            return <div className="prose prose-lg max-w-none" dangerouslySetInnerHTML={{ __html: block.content?.html }} />;
        case 'image':
            return <img src={block.content?.url} className="w-full rounded-2xl shadow-xl" alt="" />;
        case 'product_card':
            const p = block.content;
            if (p.variant === 'B') return <ProductCardB product={p} accentColor={accent} />;
            if (p.variant === 'C') return <ProductCardC product={p} accentColor={accent} />;
            return <ProductCardA product={p} accentColor={accent} />;
        case 'cta':
            return (
                <div className="text-center py-8">
                    <a href={block.content?.link} className="inline-block px-10 py-4 rounded-2xl font-black text-white text-lg shadow-xl" style={{ background: accent }}>
                        {block.content?.text}
                    </a>
                </div>
            );
        default:
            return null;
    }
}
