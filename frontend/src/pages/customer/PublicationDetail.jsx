import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Calendar, Tag, ChevronLeft, MessageSquare } from 'lucide-react';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import useStudioStore from '../../store/studioStore';
import { ProductCardA, ProductCardB, ProductCardC } from '../../components/studio/blocks/ProductCards';

export default function PublicationDetail() {
    const { slug } = useParams();
    const { fetchPublicPublication, loading } = useStudioStore();
    const [publication, setPublication] = useState(null);

    useEffect(() => {
        window.scrollTo(0, 0);
        fetchPublicPublication(slug).then(setPublication);
    }, [slug, fetchPublicPublication]);

    if (loading || !publication) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white">
                <div className="flex flex-col items-center gap-4 text-gray-400">
                    <div className="w-8 h-8 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" />
                    <span className="text-sm font-medium">Loading publication…</span>
                </div>
            </div>
        );
    }

    const isNews = publication.type === 'news';

    return (
        <div className="min-h-screen bg-white">
            <Header />

            {/* ── Hero: Cover image full-bleed with gradient overlay ── */}
            {publication.cover_image ? (
                <div className="relative w-full" style={{ maxHeight: 560, overflow: 'hidden' }}>
                    <img
                        src={publication.cover_image}
                        alt={publication.title}
                        className="w-full object-cover"
                        style={{ maxHeight: 560, minHeight: 320 }}
                    />
                    {/* gradient so text overlay is readable */}
                    <div
                        className="absolute inset-0"
                        style={{ background: 'linear-gradient(to top, rgba(10,10,20,0.82) 40%, rgba(10,10,20,0.15) 100%)' }}
                    />
                    {/* Back link floats top-left inside the image */}
                    <div className="absolute top-6 left-6 md:left-12">
                        <Link
                            to={isNews ? '/news' : '/blog'}
                            className="inline-flex items-center gap-1.5 text-white/80 hover:text-white font-bold text-sm transition-colors"
                            style={{ textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}
                        >
                            <ChevronLeft size={18} /> Back to {isNews ? 'News' : 'Blog'}
                        </Link>
                    </div>
                    {/* Title & meta overlaid at the bottom */}
                    <div className="absolute bottom-0 left-0 right-0 px-6 md:px-16 pb-10 pt-6">
                        <div className="max-w-4xl mx-auto">
                            <div className="flex items-center gap-3 mb-4">
                                <span className="px-3 py-1 bg-purple-500 text-white text-[10px] font-black uppercase tracking-widest rounded-full">
                                    {publication.type}
                                </span>
                                <span className="text-white/60 text-xs flex items-center gap-1.5">
                                    <Calendar size={12} />
                                    {new Date(publication.published_at).toLocaleDateString('en-KE', {
                                        day: 'numeric', month: 'long', year: 'numeric'
                                    })}
                                </span>
                            </div>
                            <h1 className="text-3xl md:text-5xl font-black text-white leading-tight" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
                                {publication.title}
                            </h1>
                        </div>
                    </div>
                </div>
            ) : (
                /* No cover image — plain header section */
                <div className="bg-gray-50 border-b border-gray-100 px-6 py-12 md:py-16">
                    <div className="max-w-4xl mx-auto">
                        <Link
                            to={isNews ? '/news' : '/blog'}
                            className="inline-flex items-center gap-1.5 text-gray-500 hover:text-purple-600 font-bold text-sm mb-8 transition-colors"
                        >
                            <ChevronLeft size={18} /> Back to {isNews ? 'News' : 'Blog'}
                        </Link>
                        <div className="flex items-center gap-3 mb-5">
                            <span className="px-3 py-1 bg-purple-100 text-purple-700 text-[10px] font-black uppercase tracking-widest rounded-full">
                                {publication.type}
                            </span>
                            <span className="text-gray-400 text-xs flex items-center gap-1.5">
                                <Calendar size={12} />
                                {new Date(publication.published_at).toLocaleDateString('en-KE', {
                                    day: 'numeric', month: 'long', year: 'numeric'
                                })}
                            </span>
                        </div>
                        <h1 className="text-3xl md:text-5xl font-black text-gray-900 leading-tight">
                            {publication.title}
                        </h1>
                    </div>
                </div>
            )}

            <article className="max-w-4xl mx-auto px-6 md:px-12">

                {/* ── Byline strip ── */}
                <div
                    className="flex items-center gap-4 py-5 mb-10"
                    style={{ borderBottom: '1px solid #f1f5f9' }}
                >
                    <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-black text-sm flex-shrink-0">
                        {publication.authors?.[0]?.name?.[0] || 'T'}
                    </div>
                    <div>
                        <p className="text-sm font-black text-gray-900 leading-none">
                            {publication.authors?.[0]?.name || 'TISL Editorial'}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                            {publication.type === 'news' ? 'Staff Reporter' : 'Content Contributor'}
                        </p>
                    </div>
                </div>

                {/* ── Content Blocks ── */}
                <div className="py-2 mb-12">
                    <BlockLayout blocks={publication.blocks || []} />
                </div>

                {/* ── Footer ── */}
                <footer className="mt-16 pt-10" style={{ borderTop: '1px solid #f1f5f9' }}>

                    {/* Tags */}
                    {publication.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-12">
                            {publication.tags.map(tag => (
                                <span
                                    key={tag}
                                    className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 hover:bg-purple-50 hover:text-purple-700 text-gray-500 rounded-xl text-xs font-bold transition-colors cursor-default"
                                >
                                    <Tag size={12} /> {tag}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Comments CTA */}
                    <div
                        className="rounded-3xl p-8 md:p-12 text-center mb-16"
                        style={{ background: 'linear-gradient(135deg, #faf5ff, #f0fdf4)' }}
                    >
                        <div
                            className="w-14 h-14 rounded-2xl mx-auto mb-5 flex items-center justify-center"
                            style={{ background: 'linear-gradient(135deg, #a855f7, #7c3aed)' }}
                        >
                            <MessageSquare size={24} color="white" />
                        </div>
                        <h3 className="text-2xl font-black text-gray-900 mb-2">Join the Conversation</h3>
                        <p className="text-gray-500 text-sm mb-6 max-w-xs mx-auto">
                            Comments are moderated and appear once approved.
                        </p>
                        <button
                            className="px-8 py-3.5 text-white font-black rounded-2xl transition-opacity hover:opacity-90"
                            style={{ background: 'linear-gradient(135deg, #a855f7, #7c3aed)', boxShadow: '0 4px 16px rgba(168,85,247,0.35)' }}
                        >
                            Leave a Comment
                        </button>
                    </div>
                </footer>
            </article>

            <Footer />
        </div>
    );
}

/* ─────────────────────────────────────────────
   BlockLayout: groups blocks into rows based on
   block.style?.width so side-by-side blocks share
   a proper gap row instead of the -mx-4 hack.
───────────────────────────────────────────── */
function BlockLayout({ blocks }) {
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            {rows.map((row, ri) => {
                const isSolo = row.length === 1 && (row[0].style?.width === '100%' || !row[0].style?.width);
                if (isSolo) {
                    return (
                        <div key={ri}>
                            <BlockRenderer block={row[0]} />
                        </div>
                    );
                }
                const cols = row.length;
                return (
                    <div
                        key={ri}
                        style={{
                            display: 'grid',
                            gridTemplateColumns: `repeat(${cols}, 1fr)`,
                            gap: 24,
                            alignItems: 'start',
                        }}
                    >
                        {row.map((block, bi) => (
                            <BlockRenderer key={bi} block={block} />
                        ))}
                    </div>
                );
            })}
        </div>
    );
}

/* ─────────────────────────────────────────────
   BlockRenderer: renders each block type
───────────────────────────────────────────── */
function BlockRenderer({ block }) {
    const c = block.content || {};

    switch (block.type) {

        case 'rich_text':
            return (
                <div
                    className="prose prose-lg md:prose-xl max-w-none prose-purple prose-headings:font-black prose-p:text-gray-600 prose-p:leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: c.html }}
                />
            );

        case 'image':
            return (
                <figure className="m-0">
                    <div style={{
                        width: '100%',
                        maxHeight: 420,
                        borderRadius: 16,
                        overflow: 'hidden',
                        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
                        background: '#f8fafc',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}>
                        <img
                            src={c.url}
                            alt={c.caption || ''}
                            style={{
                                width: '100%',
                                height: '100%',
                                maxHeight: 420,
                                objectFit: 'contain',
                                display: 'block',
                            }}
                        />
                    </div>
                    {c.caption && (
                        <figcaption className="mt-3 text-center text-gray-400 text-xs italic">
                            {c.caption}
                        </figcaption>
                    )}
                </figure>
            );

        case 'product_card':
            if (c.variant === 'B') return <ProductCardB product={c} />;
            if (c.variant === 'C') return <ProductCardC product={c} />;
            return <ProductCardA product={c} />;

        case 'bio_card':
            return (
                <div className="flex flex-col gap-4 p-6 rounded-2xl h-full" style={{ background: '#fafafa', border: '1px solid #f1f5f9' }}>
                    <div className="w-16 h-16 rounded-full overflow-hidden flex-shrink-0" style={{ background: '#e2e8f0' }}>
                        {c.image && <img src={c.image} className="w-full h-full object-cover" alt="" />}
                    </div>
                    <div>
                        <h4 className="text-base font-black text-gray-900">{c.name}</h4>
                        <p className="text-purple-600 font-bold text-[10px] uppercase tracking-widest mt-0.5">{c.role}</p>
                        <p className="mt-3 text-gray-500 text-sm leading-relaxed line-clamp-4">{c.bio}</p>
                    </div>
                </div>
            );

        case 'price_table': {
            const rows = c.rows || [];
            return (
                <div className="rounded-2xl overflow-hidden h-full" style={{ border: '1px solid #f1f5f9', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                    <table className="w-full text-left bg-white">
                        <thead style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                            <tr>
                                <th className="px-5 py-4 text-[10px] font-black uppercase tracking-wider text-gray-400">Item</th>
                                <th className="px-5 py-4 text-[10px] font-black uppercase tracking-wider text-gray-400 text-right">Price</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r, i) => (
                                <tr key={i} style={{ borderTop: '1px solid #f8fafc' }}>
                                    <td className="px-5 py-3 text-gray-800 text-sm">{r.item}</td>
                                    <td className="px-5 py-3 text-purple-600 text-sm font-black text-right">{r.price}</td>
                                </tr>
                            ))}
                            {rows.length === 0 && (
                                <tr>
                                    <td colSpan="2" className="px-5 py-6 text-center text-gray-300 text-sm">No items.</td>
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
                    className="relative py-8 px-8 rounded-2xl h-full"
                    style={{ background: 'linear-gradient(135deg, #fdf4ff, #f5f3ff)', borderLeft: '4px solid #a855f7' }}
                >
                    {/* decorative large quote mark */}
                    <span
                        className="absolute top-2 left-5 font-black text-purple-200 select-none"
                        style={{ fontSize: '4rem', lineHeight: 1 }}
                        aria-hidden
                    >
                        "
                    </span>
                    <p className="relative text-xl font-black text-gray-800 leading-snug italic mt-6">
                        {c.text}
                    </p>
                    {c.attribution && (
                        <p className="mt-4 text-purple-500 font-black uppercase tracking-widest text-[10px]">
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
                /* Full-bleed breakout on md+ */
                <div className="md:-mx-8 md:w-[calc(100%+4rem)]">
                    <div className="aspect-video rounded-2xl overflow-hidden bg-gray-900" style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.15)' }}>
                        {embedUrl ? (
                            <iframe src={embedUrl} className="w-full h-full border-none" allowFullScreen title="Video" />
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

        case 'cta':
            return (
                <div
                    className="p-8 rounded-2xl text-center h-full flex flex-col justify-center gap-4"
                    style={{ background: 'linear-gradient(135deg, #0f172a, #1e1b4b)' }}
                >
                    <h4 className="text-xl font-black text-white">{c.text}</h4>
                    <a
                        href={c.link}
                        className="self-center px-6 py-3 font-black rounded-xl text-sm text-white transition-opacity hover:opacity-90"
                        style={{ background: 'linear-gradient(135deg, #a855f7, #7c3aed)', boxShadow: '0 4px 16px rgba(168,85,247,0.4)' }}
                    >
                        Learn More
                    </a>
                </div>
            );

        default:
            return null;
    }
}