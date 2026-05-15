import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ArrowRight, Search, Download } from 'lucide-react';
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
        <div className="min-h-screen bg-gray-50">
            <Header />

            {/* Hero Section */}
            <div className="bg-gray-900 py-20 px-6 text-center">
                <div className="max-w-4xl mx-auto">
                    <h1 className="text-4xl md:text-5xl font-black text-white mb-6">Digital Brochures</h1>
                    <p className="text-xl text-gray-400 mb-10">Download and view our latest product catalogues, company profiles, and industrial guides.</p>

                    <div className="max-w-xl mx-auto relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
                        <input
                            className="w-full bg-gray-800 border-none rounded-2xl py-4 pl-12 pr-6 text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500 transition-all"
                            placeholder="Search catalogues..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-6 py-16">
                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {[1,2,3].map(i => (
                            <div key={i} className="bg-white rounded-3xl h-96 animate-pulse border border-gray-100"></div>
                        ))}
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {filtered.map(brochure => (
                                <Link
                                    key={brochure.id}
                                    to={`/brochures/${brochure.slug}`}
                                    className="group bg-white rounded-3xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 flex flex-col"
                                >
                                    <div className="aspect-[4/3] bg-gray-100 relative overflow-hidden">
                                        {brochure.cover_image ? (
                                            <img src={brochure.cover_image} alt={brochure.title} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-purple-50 text-purple-200">
                                                <BookOpen size={80} strokeWidth={1} />
                                            </div>
                                        )}
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                            <div className="bg-white text-gray-900 px-6 py-3 rounded-xl font-bold opacity-0 translate-y-4 group-hover:opacity-100 group-hover:translate-y-0 transition-all">
                                                View Brochure
                                            </div>
                                        </div>
                                    </div>
                                    <div className="p-8 flex-1 flex flex-col">
                                        <div className="flex items-center gap-2 mb-4">
                                            <span className="px-3 py-1 bg-purple-100 text-purple-700 text-[10px] font-black uppercase tracking-wider rounded-full">Catalogue</span>
                                            <span className="text-gray-400 text-xs">{new Date(brochure.published_at).getFullYear()} Edition</span>
                                        </div>
                                        <h3 className="text-xl font-bold text-gray-900 mb-4 flex-1">{brochure.title}</h3>
                                        <div className="flex items-center justify-between mt-auto pt-6 border-t border-gray-50">
                                            <span className="flex items-center gap-2 text-purple-600 font-bold group-hover:gap-4 transition-all">
                                                Read Online <ArrowRight size={18} />
                                            </span>
                                            <Download size={20} className="text-gray-300 group-hover:text-purple-400 transition-colors" />
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>

                        {filtered.length === 0 && (
                            <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-200">
                                <BookOpen size={48} className="mx-auto text-gray-200 mb-4" />
                                <h3 className="text-xl font-bold text-gray-900">No brochures found</h3>
                                <p className="text-gray-500 mt-2">Try adjusting your search criteria.</p>
                            </div>
                        )}
                    </>
                )}
            </div>

            <Footer />
        </div>
    );
}
