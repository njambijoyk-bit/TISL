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
    const template = brochure.template || 'minimal';

    return (
        <div className={`min-h-screen brochure-page template-${template}`} style={{ '--accent': accent }}>
            <Header />
            
            {/* Template-specific Header Shell */}
            <BrochureHeader brochure={brochure} accent={accent} template={template} />

            <main className="max-w-6xl mx-auto px-6 py-12 md:py-20">
                {/* Flex Wrap Container for Blocks */}
                <div className="flex flex-wrap items-start -mx-4">
                    {brochure.blocks?.map((block, i) => (
                        <div key={i} className="px-4 mb-12 box-border" style={{ width: block.style?.width || '100%' }}>
                            <PublicBlockRenderer block={block} accent={accent} />
                        </div>
                    ))}
                </div>
            </main>

            <Footer />

            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&family=Outfit:wght@400;700;900&display=swap');

                .brochure-page { font-family: 'Inter', sans-serif; }

                /* ── MINIMAL ── */
                .template-minimal { background: #fff; }
                .template-minimal .block-card { border-radius: 0; border: none; background: transparent; }

                /* ── BOLD ── */
                .template-bold { background: #fcfcfc; font-family: 'Outfit', sans-serif; }
                .template-bold h1 { text-transform: uppercase; letter-spacing: -0.04em; }
                .template-bold .header-banner { background: #0f172a; color: white; padding: 120px 24px; }

                /* ── CORPORATE ── */
                .template-corporate { background: #f8fafc; }
                .template-corporate .header-flex { display: flex; align-items: flex-end; justify-content: space-between; border-bottom: 4px solid var(--accent); padding-bottom: 20px; }

                @media print {
                    .no-print { display: none !important; }
                    body, .brochure-page { background: white !important; padding: 0 !important; margin: 0 !important; }
                    header, footer { display: none !important; }
                    .max-w-6xl { max-width: 100% !important; width: 100% !important; }
                }
            `}</style>
        </div>
    );
}

function BrochureHeader({ brochure, accent, template }) {
    const handlePrint = () => window.print();

    if (template === 'bold') {
        return (
            <div className="header-banner text-center relative overflow-hidden">
                <div className="absolute top-8 right-8 no-print">
                    <button onClick={handlePrint} className="bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-full font-bold backdrop-blur-md transition-all">Download PDF</button>
                </div>
                <div className="max-w-4xl mx-auto">
                    <span className="inline-block px-4 py-1 bg-white/10 text-white rounded-full text-xs font-bold uppercase tracking-widest mb-6">Catalogue 2026</span>
                    <h1 className="text-6xl md:text-8xl font-black mb-8 leading-none">{brochure.title}</h1>
                    <div className="w-24 h-2 mx-auto bg-white/20"></div>
                </div>
            </div>
        );
    }

    if (template === 'corporate') {
        return (
            <div className="bg-white border-b border-gray-100 py-12 md:py-16">
                <div className="max-w-6xl mx-auto px-6">
                    <div className="header-flex">
                        <div className="max-w-2xl">
                            <h1 className="text-4xl md:text-5xl font-black text-gray-900 leading-tight">{brochure.title}</h1>
                            <p className="mt-4 text-gray-500 font-medium">Target Industrial Suppliers Limited — Official Document</p>
                        </div>
                        <div className="no-print">
                            <button onClick={handlePrint} className="px-8 py-4 rounded-xl font-bold text-white shadow-xl" style={{ background: accent }}>Download PDF</button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Default: Minimal
    return (
        <div className="max-w-4xl mx-auto px-6 pt-20 text-center">
            <div className="flex justify-center mb-10 no-print">
                <button onClick={handlePrint} className="text-gray-400 hover:text-gray-900 font-bold flex items-center gap-2 border-b-2 border-transparent hover:border-gray-900 transition-all">Download PDF</button>
            </div>
            <h1 className="text-5xl md:text-7xl font-light text-gray-900 mb-6">{brochure.title}</h1>
            <div className="w-20 h-0.5 mx-auto bg-gray-200 mb-20"></div>
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
                <div className="flex flex-col md:flex-row gap-8 items-center p-10 bg-gray-50 rounded-[40px] border border-gray-100 h-full box-border shadow-sm">
                    <div className="w-32 h-32 rounded-[32px] bg-gray-200 flex-shrink-0 overflow-hidden rotate-3">
                        {c.image && <img src={c.image} className="w-full h-full object-cover" alt="" />}
                    </div>
                    <div>
                        <h4 className="text-2xl font-black text-gray-900">{c.name}</h4>
                        <p className="text-purple-600 font-bold text-sm uppercase tracking-wider">{c.role}</p>
                        <p className="mt-4 text-gray-600 leading-relaxed">{c.bio}</p>
                    </div>
                </div>
            );
        case 'price_table':
            const rows = c.rows || [];
            return (
                <div className="overflow-hidden rounded-3xl border border-gray-100 shadow-xl h-full bg-white">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b border-gray-100">
                            <tr>
                                <th className="px-8 py-6 text-xs font-black uppercase text-gray-500">Item / Description</th>
                                <th className="px-8 py-6 text-xs font-black uppercase text-gray-500 text-right">Price</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y-2 divide-gray-50">
                            {rows.map((r, i) => (
                                <tr key={i} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-8 py-6 text-gray-900 font-bold">{r.item}</td>
                                    <td className="px-8 py-6 text-purple-600 font-black text-right text-xl">{r.price}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        case 'pull_quote':
            return (
                <div className="py-12 px-10 bg-gray-900 rounded-[40px] h-full box-border relative overflow-hidden group">
                    <div className="absolute -top-10 -left-10 text-[200px] text-white/5 font-black pointer-events-none select-none">“</div>
                    <p className="text-2xl md:text-3xl font-black text-white leading-tight italic relative z-10">
                        {c.text}
                    </p>
                    {c.attribution && (
                        <p className="mt-8 text-purple-400 font-black uppercase tracking-widest text-xs relative z-10">— {c.attribution}</p>
                    )}
                </div>
            );
        case 'video':
            // Simple YouTube/Vimeo embed logic
            let embedUrl = c.url;
            if (c.url?.includes('youtube.com/watch?v=')) {
                embedUrl = c.url.replace('watch?v=', 'embed/');
            } else if (c.url?.includes('vimeo.com/')) {
                embedUrl = c.url.replace('vimeo.com/', 'player.vimeo.com/video/');
            }
            return (
                <div className="w-full md:-mx-20 md:w-[calc(100%+10rem)] my-12">
                    <div className="aspect-video rounded-3xl overflow-hidden shadow-2xl bg-black">
                        {embedUrl ? (
                            <iframe src={embedUrl} className="w-full h-full border-none" allowFullScreen title="Video Content"></iframe>
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-500">No Video Loaded</div>
                        )}
                    </div>
                    {c.caption && <p className="mt-4 text-center text-gray-400 text-sm italic">{c.caption}</p>}
                </div>
            );
        default:
            return null;
    }
}
