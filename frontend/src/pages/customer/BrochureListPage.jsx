import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ArrowRight, Search, Download, FileText } from 'lucide-react';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import useStudioStore from '../../store/studioStore';

export default function BrochureListPage() {
    const { fetchPublicPublications, loading } = useStudioStore();
    const [brochures, setBrochures] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchPublicPublications('brochure').then(data => {
            setBrochures(data?.data || []);
        });
    }, [fetchPublicPublications]);

    const filtered = brochures.filter(b =>
        b.title.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="min-h-screen" style={{ background: '#f8fafc' }}>
            <Header />

            {/* ── Hero ── */}
            <div
                className="relative overflow-hidden px-6 py-20 text-center"
                style={{ background: 'linear-gradient(160deg, #0f172a 55%, #1e1035)' }}
            >
                {/* subtle purple glow */}
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 110%, #a855f722, transparent)' }}
                />

                <div className="relative max-w-3xl mx-auto">
                    {/* icon badge */}
                    <div
                        className="w-14 h-14 rounded-2xl mx-auto mb-6 flex items-center justify-center"
                        style={{ background: 'linear-gradient(135deg, #a855f7, #7c3aed)', boxShadow: '0 8px 32px rgba(168,85,247,0.4)' }}
                    >
                        <BookOpen size={26} color="white" strokeWidth={2} />
                    </div>

                    <h1 className="text-4xl md:text-5xl font-black text-white mb-4 leading-tight">
                        Digital Brochures
                    </h1>
                    <p className="text-gray-400 text-base md:text-lg mb-10 max-w-xl mx-auto">
                        Download and view our latest product catalogues, company profiles, and industrial guides.
                    </p>

                    {/* Search */}
                    <div className="max-w-lg mx-auto relative">
                        <Search
                            size={18}
                            className="absolute left-4 top-1/2 -translate-y-1/2"
                            style={{ color: '#64748b' }}
                        />
                        <input
                            className="w-full rounded-2xl py-3.5 pl-11 pr-5 text-sm text-white placeholder-gray-500 outline-none transition-all"
                            style={{
                                background: 'rgba(255,255,255,0.07)',
                                border: '1px solid rgba(255,255,255,0.1)',
                            }}
                            onFocus={e => e.target.style.borderColor = '#a855f7'}
                            onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                            placeholder="Search catalogues…"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* ── Grid ── */}
            <div className="max-w-7xl mx-auto px-6 py-16">

                {loading ? (
                    /* Skeleton */
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="bg-white rounded-3xl overflow-hidden border border-gray-100" style={{ height: 380 }}>
                                <div className="bg-gray-100 animate-pulse" style={{ height: 220 }} />
                                <div className="p-6 flex flex-col gap-3">
                                    <div className="h-3 bg-gray-100 rounded-full animate-pulse w-1/3" />
                                    <div className="h-4 bg-gray-100 rounded-full animate-pulse w-4/5" />
                                    <div className="h-4 bg-gray-100 rounded-full animate-pulse w-3/5" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : filtered.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {filtered.map(brochure => (
                            <BrochureCard key={brochure.id} brochure={brochure} />
                        ))}
                    </div>
                ) : (
                    /* Empty state */
                    <div
                        className="text-center py-24 rounded-3xl"
                        style={{ border: '1.5px dashed #e2e8f0', background: 'white' }}
                    >
                        <div
                            className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center"
                            style={{ background: '#f8fafc' }}
                        >
                            <FileText size={28} color="#cbd5e1" />
                        </div>
                        <h3 className="text-lg font-black text-gray-700">No brochures found</h3>
                        <p className="text-gray-400 text-sm mt-2">Try a different search term.</p>
                    </div>
                )}
            </div>

            <Footer />
        </div>
    );
}

function BrochureCard({ brochure }) {
    return (
        <Link
            to={`/brochures/${brochure.slug}`}
            className="group flex flex-col bg-white rounded-3xl overflow-hidden transition-all duration-300"
            style={{
                border: '1px solid #f1f5f9',
                boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 16px 48px rgba(0,0,0,0.1)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)'}
        >
            {/* Cover */}
            <div className="relative overflow-hidden" style={{ aspectRatio: '4/3', background: '#f1f5f9' }}>
                {brochure.cover_image ? (
                    <img
                        src={brochure.cover_image}
                        alt={brochure.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #f5f3ff, #ede9fe)' }}>
                        <BookOpen size={64} color="#c4b5fd" strokeWidth={1.5} />
                    </div>
                )}

                {/* Hover overlay */}
                <div
                    className="absolute inset-0 flex items-center justify-center transition-all duration-300"
                    style={{ background: 'rgba(15,23,42,0)', opacity: 0 }}
                    ref={el => {
                        if (!el) return;
                        el.closest('a').addEventListener('mouseenter', () => {
                            el.style.background = 'rgba(15,23,42,0.45)';
                            el.style.opacity = '1';
                        });
                        el.closest('a').addEventListener('mouseleave', () => {
                            el.style.background = 'rgba(15,23,42,0)';
                            el.style.opacity = '0';
                        });
                    }}
                >
                    <span
                        className="px-5 py-2.5 rounded-xl text-sm font-black text-white"
                        style={{ background: 'linear-gradient(135deg, #a855f7, #7c3aed)', boxShadow: '0 4px 16px rgba(168,85,247,0.5)' }}
                    >
                        View Brochure
                    </span>
                </div>
            </div>

            {/* Body */}
            <div className="p-6 flex-1 flex flex-col">
                <div className="flex items-center gap-2 mb-3">
                    <span
                        className="px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded-full"
                        style={{ background: '#f5f3ff', color: '#7c3aed' }}
                    >
                        Catalogue
                    </span>
                    <span className="text-gray-400 text-xs">
                        {new Date(brochure.published_at).getFullYear()} Edition
                    </span>
                </div>

                <h3 className="text-base font-black text-gray-900 leading-snug flex-1 mb-5">
                    {brochure.title}
                </h3>

                <div
                    className="flex items-center justify-between pt-4"
                    style={{ borderTop: '1px solid #f8fafc' }}
                >
                    <span
                        className="flex items-center gap-2 text-sm font-black transition-all duration-200"
                        style={{ color: '#a855f7' }}
                    >
                        Read Online
                        <ArrowRight
                            size={16}
                            className="transition-transform duration-200 group-hover:translate-x-1"
                        />
                    </span>
                    <Download
                        size={18}
                        className="transition-colors duration-200"
                        style={{ color: '#cbd5e1' }}
                    />
                </div>
            </div>
        </Link>
    );
}