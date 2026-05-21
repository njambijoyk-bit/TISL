import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Download } from 'lucide-react';
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

    if (loading || !brochure) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white">
                <div className="flex flex-col items-center gap-4 text-gray-400">
                    <div className="w-8 h-8 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
                    <span className="text-sm font-medium">Loading brochure…</span>
                </div>
            </div>
        );
    }

    const accent = brochure.style_config?.accent || '#a855f7';
    const template = brochure.template || 'minimal';

    return (
        <div
            className={`min-h-screen brochure-page template-${template}`}
            style={{ '--accent': accent, background: template === 'bold' ? '#0f172a' : '#fff' }}
        >
            <Header />

            <BrochureHeader brochure={brochure} accent={accent} template={template} />

            <main
                className="max-w-6xl mx-auto px-6 md:px-10 py-14 md:py-20"
                style={{ background: template === 'bold' ? '#0f172a' : 'transparent' }}
            >
                <BrochureBlockLayout blocks={brochure.blocks || []} accent={accent} template={template} />
            </main>

            <Footer />

            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&family=Outfit:wght@400;700;900&display=swap');

                .brochure-page { font-family: 'Inter', sans-serif; }
                .template-bold  { font-family: 'Outfit', sans-serif; }
                .template-bold h1 { text-transform: uppercase; letter-spacing: -0.04em; }

                @media print {
                    .no-print { display: none !important; }
                    body, .brochure-page { background: white !important; }
                    header, footer { display: none !important; }
                    .max-w-6xl { max-width: 100% !important; }
                }
            `}</style>
        </div>
    );
}

/* ── Template Headers ──────────────────────────────────────── */

function BrochureHeader({ brochure, accent, template }) {
    const handlePrint = () => window.print();

    if (template === 'bold') {
        return (
            <div
                className="relative overflow-hidden text-center px-6"
                style={{
                    background: 'linear-gradient(160deg, #0f172a 60%, #1e1035)',
                    padding: '100px 24px 80px',
                    borderBottom: `3px solid ${accent}`,
                }}
            >
                {/* Decorative glow */}
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        background: `radial-gradient(ellipse 60% 50% at 50% 100%, ${accent}22, transparent)`,
                    }}
                />
                <div className="relative max-w-4xl mx-auto">
                    <span
                        className="inline-block px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-8"
                        style={{ background: `${accent}22`, color: accent, border: `1px solid ${accent}44` }}
                    >
                        Catalogue 2026
                    </span>
                    <h1 className="text-5xl md:text-8xl font-black text-white leading-none mb-8">
                        {brochure.title}
                    </h1>
                    <div className="w-20 h-1 mx-auto rounded-full mb-10" style={{ background: accent }} />
                    <button
                        onClick={handlePrint}
                        className="no-print inline-flex items-center gap-2 px-6 py-3 rounded-full font-bold text-sm transition-opacity hover:opacity-80"
                        style={{ background: accent, color: 'white' }}
                    >
                        <Download size={16} /> Download PDF
                    </button>
                </div>
            </div>
        );
    }

    if (template === 'corporate') {
        return (
            <div className="bg-white" style={{ borderBottom: `4px solid ${accent}` }}>
                <div className="max-w-6xl mx-auto px-6 md:px-10 py-12 md:py-16 flex items-end justify-between gap-8">
                    <div className="max-w-2xl">
                        <p className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: accent }}>
                            Target Industrial Suppliers Limited
                        </p>
                        <h1 className="text-3xl md:text-5xl font-black text-gray-900 leading-tight">
                            {brochure.title}
                        </h1>
                        <p className="mt-3 text-gray-400 text-sm">Official Document · {new Date().getFullYear()}</p>
                    </div>
                    <button
                        onClick={handlePrint}
                        className="no-print flex-shrink-0 inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-white text-sm shadow-lg transition-opacity hover:opacity-90"
                        style={{ background: accent }}
                    >
                        <Download size={16} /> Download PDF
                    </button>
                </div>
            </div>
        );
    }

    /* Minimal (default) */
    return (
        <div className="max-w-3xl mx-auto px-6 pt-16 pb-12 text-center">
            <button
                onClick={handlePrint}
                className="no-print inline-flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-gray-700 uppercase tracking-widest mb-12 transition-colors"
            >
                <Download size={14} /> Download PDF
            </button>
            <h1 className="text-4xl md:text-6xl font-light text-gray-900 tracking-tight mb-6">
                {brochure.title}
            </h1>
            <div className="w-16 h-px mx-auto" style={{ background: accent }} />
        </div>
    );
}

/* ── Block Layout (same grid approach as PublicationDetail) ── */

function BrochureBlockLayout({ blocks, accent, template }) {
    const rows = [];
    let currentRow = [];

    blocks.forEach((block) => {
        const w = block.style?.width || '100%';
        const isFull = w === '100%' || !w;
        if (isFull) {
            if (currentRow.length) { rows.push(currentRow); currentRow = []; }
            rows.push([block]);
        } else {
            currentRow.push(block);
        }
    });
    if (currentRow.length) rows.push(currentRow);

    return (
        <div>
            {rows.map((row, ri) => {
                const isSolo = row.length === 1 && (!row[0].style?.width || row[0].style?.width === '100%');
                if (isSolo) {
                    return (
                        <div key={ri} className="mb-12">
                            <PublicBlockRenderer block={row[0]} accent={accent} template={template} />
                        </div>
                    );
                }
                return (
                    <div
                        key={ri}
                        className="mb-12"
                        style={{
                            display: 'grid',
                            gridTemplateColumns: row.map(b => b.style?.width || `${100 / row.length}%`).join(' '),
                            gap: 28,
                            alignItems: 'start',
                        }}
                    >
                        {row.map((block, bi) => (
                            <PublicBlockRenderer key={bi} block={block} accent={accent} template={template} />
                        ))}
                    </div>
                );
            })}
        </div>
    );
}

/* ── Block Renderers ─────────────────────────────────────────── */

function PublicBlockRenderer({ block, accent, template }) {
    const c = block.content || {};
    const isDark = template === 'bold';

    switch (block.type) {

        case 'rich_text':
            return (
                <div
                    className={`prose prose-lg max-w-none ${isDark ? 'prose-invert' : 'prose-purple'}`}
                    dangerouslySetInnerHTML={{ __html: c.html }}
                />
            );

        case 'image':
            return (
                <figure className="m-0">
                    <img
                        src={c.url}
                        className="w-full rounded-2xl"
                        style={{ boxShadow: isDark ? '0 8px 40px rgba(0,0,0,0.4)' : '0 4px 24px rgba(0,0,0,0.07)' }}
                        alt={c.caption || ''}
                    />
                    {c.caption && (
                        <figcaption className={`mt-3 text-center text-xs italic ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                            {c.caption}
                        </figcaption>
                    )}
                </figure>
            );

        case 'product_card':
            if (c.variant === 'B') return <ProductCardB product={c} accentColor={accent} />;
            if (c.variant === 'C') return <ProductCardC product={c} accentColor={accent} />;
            return <ProductCardA product={c} accentColor={accent} />;

        case 'cta':
            return (
                <div className="text-center py-10">
                    <a
                        href={c.link}
                        className="inline-block px-10 py-4 rounded-2xl font-black text-white text-base transition-opacity hover:opacity-90"
                        style={{ background: accent, boxShadow: `0 8px 32px ${accent}55` }}
                    >
                        {c.text}
                    </a>
                </div>
            );

        case 'bio_card':
            return (
                <div
                    className="flex flex-col md:flex-row gap-8 items-center p-8 rounded-3xl h-full"
                    style={{
                        background: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc',
                        border: isDark ? '1px solid rgba(255,255,255,0.07)' : '1px solid #f1f5f9',
                    }}
                >
                    <div
                        className="w-28 h-28 rounded-2xl flex-shrink-0 overflow-hidden"
                        style={{ background: '#e2e8f0', transform: 'rotate(2deg)' }}
                    >
                        {c.image && <img src={c.image} className="w-full h-full object-cover" alt="" />}
                    </div>
                    <div>
                        <h4 className={`text-xl font-black ${isDark ? 'text-white' : 'text-gray-900'}`}>{c.name}</h4>
                        <p className="font-bold text-xs uppercase tracking-wider mt-1" style={{ color: accent }}>{c.role}</p>
                        <p className={`mt-3 text-sm leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{c.bio}</p>
                    </div>
                </div>
            );

        case 'price_table': {
            const rows = c.rows || [];
            return (
                <div
                    className="rounded-2xl overflow-hidden h-full"
                    style={{
                        border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #f1f5f9',
                        boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
                        background: isDark ? 'rgba(255,255,255,0.03)' : 'white',
                    }}
                >
                    {c.title && (
                        <div
                            className="px-8 py-5"
                            style={{
                                borderBottom: `2px solid ${accent}`,
                                background: isDark ? 'rgba(255,255,255,0.05)' : '#fafafa',
                            }}
                        >
                            <h3 className={`font-black text-sm uppercase tracking-widest ${isDark ? 'text-white' : 'text-gray-700'}`}>
                                {c.title}
                            </h3>
                        </div>
                    )}
                    <table className="w-full text-left">
                        <thead style={{ background: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc', borderBottom: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #f1f5f9' }}>
                            <tr>
                                <th className={`px-7 py-5 text-[10px] font-black uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                    Item / Description
                                </th>
                                <th className={`px-7 py-5 text-[10px] font-black uppercase tracking-wider text-right ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                    Price
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r, i) => (
                                <tr
                                    key={i}
                                    style={{ borderTop: isDark ? '1px solid rgba(255,255,255,0.05)' : '1px solid #f8fafc' }}
                                >
                                    <td className={`px-7 py-5 font-medium ${isDark ? 'text-gray-300' : 'text-gray-800'}`}>{r.item}</td>
                                    <td className="px-7 py-5 font-black text-right text-lg" style={{ color: accent }}>{r.price}</td>
                                </tr>
                            ))}
                            {rows.length === 0 && (
                                <tr>
                                    <td colSpan="2" className="px-7 py-8 text-center text-gray-400 text-sm">No items yet.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            );
        }

        case 'pull_quote':
            return (
                <div
                    className="relative rounded-3xl overflow-hidden h-full px-10 py-12"
                    style={{ background: isDark ? `${accent}18` : '#0f172a', border: `1px solid ${isDark ? accent + '33' : 'transparent'}` }}
                >
                    <span
                        className="absolute -top-6 -left-2 font-black pointer-events-none select-none leading-none"
                        style={{ fontSize: '10rem', color: isDark ? `${accent}18` : 'rgba(255,255,255,0.05)' }}
                        aria-hidden
                    >
                        "
                    </span>
                    <p className="relative text-2xl md:text-3xl font-black text-white leading-tight italic">
                        {c.text}
                    </p>
                    {c.attribution && (
                        <p className="relative mt-8 font-black uppercase tracking-widest text-xs" style={{ color: accent }}>
                            — {c.attribution}
                        </p>
                    )}
                </div>
            );

        case 'video': {
            let embedUrl = c.url;
            if (c.url?.includes('youtube.com/watch?v=')) {
                embedUrl = c.url.replace('watch?v=', 'embed/');
            } else if (c.url?.includes('vimeo.com/')) {
                embedUrl = c.url.replace('vimeo.com/', 'player.vimeo.com/video/');
            }
            return (
                <div className="md:-mx-10 md:w-[calc(100%+5rem)]">
                    <div
                        className="aspect-video rounded-2xl overflow-hidden bg-gray-900"
                        style={{ boxShadow: '0 12px 48px rgba(0,0,0,0.2)' }}
                    >
                        {embedUrl ? (
                            <iframe src={embedUrl} className="w-full h-full border-none" allowFullScreen title="Video Content" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">
                                No video URL set
                            </div>
                        )}
                    </div>
                    {c.caption && (
                        <p className="mt-3 text-center text-gray-400 text-xs italic">{c.caption}</p>
                    )}
                </div>
            );
        }

        default:
            return null;
    }
}