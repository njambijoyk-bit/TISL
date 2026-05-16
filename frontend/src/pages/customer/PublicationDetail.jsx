import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Calendar, User, Tag, ChevronLeft, MessageSquare } from 'lucide-react';
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

    if (loading || !publication) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

    const isNews = publication.type === 'news';

    return (
        <div className="min-h-screen bg-white">
            <Header />
            
            <article className="max-w-4xl mx-auto px-6 py-12 md:py-20">
                {/* Back Link */}
                <Link to={isNews ? "/news" : "/blog"} className="inline-flex items-center gap-2 text-gray-500 hover:text-purple-600 font-bold mb-8 transition-colors">
                    <ChevronLeft size={20} /> Back to {isNews ? "News" : "Blog"}
                </Link>

                {/* Header */}
                <header className="mb-12">
                    <div className="flex flex-wrap items-center gap-4 mb-6">
                        <span className="px-3 py-1 bg-purple-100 text-purple-700 text-[10px] font-black uppercase tracking-wider rounded-full">
                            {publication.type}
                        </span>
                        <div className="flex items-center gap-2 text-gray-400 text-sm">
                            <Calendar size={14} />
                            {new Date(publication.published_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </div>
                    </div>
                    
                    <h1 className="text-4xl md:text-5xl font-black text-gray-900 leading-tight mb-8">
                        {publication.title}
                    </h1>

                    <div className="flex items-center gap-4 p-6 bg-gray-50 rounded-2xl">
                        <div className="w-12 h-12 rounded-full bg-purple-200 flex items-center justify-center text-purple-700 font-bold">
                            {publication.authors?.[0]?.name?.[0] || 'A'}
                        </div>
                        <div>
                            <p className="text-sm font-black text-gray-900">{publication.authors?.[0]?.name || 'TISL Editorial'}</p>
                            <p className="text-xs text-gray-500">{publication.type === 'news' ? 'Staff Reporter' : 'Content Contributor'}</p>
                        </div>
                    </div>
                </header>

                {/* Cover Image */}
                {publication.cover_image && (
                    <div className="mb-12 rounded-3xl overflow-hidden shadow-2xl">
                        <img src={publication.cover_image} alt={publication.title} className="w-full aspect-video object-cover" />
                    </div>
                )}

                {/* Content Blocks with Flex Wrap Support */}
                <div className="flex flex-wrap items-start -mx-4">
                    {publication.blocks?.map((block, i) => (
                        <div key={i} className="px-4 mb-8 box-border" style={{ width: block.style?.width || '100%' }}>
                            <BlockRenderer block={block} />
                        </div>
                    ))}
                </div>

                {/* Footer Metadata */}
                <footer className="mt-16 pt-10 border-t border-gray-100">
                    {publication.tags && publication.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-10">
                            {publication.tags.map(tag => (
                                <span key={tag} className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-bold">
                                    <Tag size={14} /> {tag}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Comments Placeholder */}
                    <div className="bg-purple-50 rounded-3xl p-8 md:p-12 text-center w-full">
                        <MessageSquare size={48} className="mx-auto text-purple-200 mb-4" />
                        <h3 className="text-2xl font-black text-gray-900 mb-2">Join the Conversation</h3>
                        <p className="text-gray-600 mb-6">Comments are moderated and will appear once approved by an administrator.</p>
                        <button className="px-8 py-4 bg-purple-600 text-white font-black rounded-2xl shadow-xl hover:bg-purple-700 transition-colors">
                            Leave a Comment
                        </button>
                    </div>
                </footer>
            </article>

            <Footer />
        </div>
    );
}

function BlockRenderer({ block }) {
    const c = block.content || {};
    switch (block.type) {
        case 'rich_text':
            return <div className="prose prose-lg md:prose-xl max-w-none prose-purple" dangerouslySetInnerHTML={{ __html: c.html }} />;
        case 'image':
            return (
                <figure>
                    <img src={c.url} className="w-full rounded-2xl" alt={c.caption || ""} />
                    {c.caption && <figcaption className="mt-4 text-center text-gray-400 text-sm italic">{c.caption}</figcaption>}
                </figure>
            );
        case 'product_card':
            if (c.variant === 'B') return <ProductCardB product={c} />;
            if (c.variant === 'C') return <ProductCardC product={c} />;
            return <ProductCardA product={c} />;
        case 'bio_card':
            return (
                <div className="flex flex-col gap-4 p-8 bg-gray-50 rounded-3xl border border-gray-100 h-full">
                    <div className="w-20 h-20 rounded-full bg-gray-200 overflow-hidden">
                        {c.image && <img src={c.image} className="w-full h-full object-cover" alt="" />}
                    </div>
                    <div>
                        <h4 className="text-lg font-black text-gray-900">{c.name}</h4>
                        <p className="text-purple-600 font-bold text-xs uppercase tracking-wider">{c.role}</p>
                        <p className="mt-3 text-gray-600 text-sm leading-relaxed line-clamp-4">{c.bio}</p>
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
                                <th className="px-6 py-4 text-[10px] font-black uppercase text-gray-500">Item</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase text-gray-500 text-right">Price</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {rows.map((r, i) => (
                                <tr key={i}>
                                    <td className="px-4 py-3 text-gray-900 text-xs font-medium">{r.item}</td>
                                    <td className="px-4 py-3 text-purple-600 text-xs font-black text-right">{r.price}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        case 'pull_quote':
            return (
                <div className="py-8 px-6 bg-gray-50 border-l-4 border-purple-500 rounded-r-2xl h-full">
                    <p className="text-lg font-black text-gray-900 leading-tight italic">
                        "{c.text}"
                    </p>
                    {c.attribution && (
                        <p className="mt-4 text-purple-600 font-black uppercase tracking-widest text-[10px]">— {c.attribution}</p>
                    )}
                </div>
            );
        case 'cta':
            return (
                <div className="p-8 bg-gray-900 rounded-3xl text-center h-full flex flex-col justify-center">
                    <h4 className="text-xl font-black text-white mb-4">{c.text}</h4>
                    <a href={c.link} className="inline-block px-6 py-3 bg-purple-500 text-white font-black rounded-xl text-sm">
                        Action
                    </a>
                </div>
            );
        default:
            return null;
    }
}
