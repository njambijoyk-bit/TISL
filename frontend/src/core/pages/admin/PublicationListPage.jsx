import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
    Plus, 
    Edit, 
    Trash2, 
    Eye, 
    Search, 
    Filter, 
    BookOpen, 
    Newspaper, 
    FileText,
    MoreVertical,
    CheckCircle,
    Clock,
    Archive
} from 'lucide-react';
import useStudioStore from '../../../_shared/store/studioStore';
import SettingsLayout from '../../../_shared/components/layout/SettingsLayout';

export default function PublicationListPage() {
    const navigate = useNavigate();
    const { publications, fetchPublications, deletePublication, createPublication, loading } = useStudioStore();
    const [filter, setFilter] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newType, setNewType] = useState('brochure');

    useEffect(() => {
        fetchPublications(filter);
    }, [filter, fetchPublications]);

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!newTitle.trim()) return;
        try {
            const pub = await createPublication({ title: newTitle, type: newType });
            setShowCreateModal(false);
            navigate(`/admin/settings/publications/${pub.id}/edit`);
        } catch (err) {
            alert('Failed to create publication');
        }
    };

    const handleDelete = async (id) => {
        if (confirm('Are you sure you want to delete this publication?')) {
            await deletePublication(id);
        }
    };

    // FIX: Guard against non-array publications
    const pubList = Array.isArray(publications) ? publications : (publications?.data || []);
    
    const filteredPubs = pubList.filter(p => 
        p.title?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div style={{ minHeight: '100vh', display: 'flex' }}>
            <SettingsLayout />
            
            <div style={{ flex: 1, padding: '40px 32px' }}>
                <div style={{ maxWidth: 1000, margin: '0 auto' }}>
                    
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
                        <div>
                            <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--color-primary-500)', margin: 0 }}>Content Studio</h1>
                            <p style={{ color: 'var(--text-secondary)', marginTop: 4 }}>Manage your brochures, news, and blog posts.</p>
                        </div>
                        <button 
                            onClick={() => setShowCreateModal(true)}
                            style={{ 
                                background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
                                color: 'white',
                                border: 'none',
                                padding: '12px 24px',
                                borderRadius: 12,
                                fontWeight: 700,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                cursor: 'pointer',
                                boxShadow: '0 4px 12px color-mix(in srgb, var(--color-primary-500) 30%, transparent)'
                            }}
                        >
                            <Plus size={20} /> Create New
                        </button>
                    </div>

                    {/* Filters & Search */}
                    <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
                        <div style={{ flex: 1, position: 'relative' }}>
                            <Search size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                            <input 
                                placeholder="Search publications..." 
                                style={{ ...inputStyle, paddingLeft: 40 }}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <select 
                            style={{ ...inputStyle, width: 200 }}
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                        >
                            <option value="">All Types</option>
                            <option value="brochure">Brochures</option>
                            <option value="news">News</option>
                            <option value="blog">Blog</option>
                        </select>
                    </div>

                    {/* Table */}
                    <div style={{ background: 'var(--surface-card, #fff)', borderRadius: 16, border: '1px solid var(--line)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead style={{ background: 'var(--surface-input)', borderBottom: '1px solid var(--line)' }}>
                                <tr>
                                    <th style={thStyle}>Publication</th>
                                    <th style={thStyle}>Type</th>
                                    <th style={thStyle}>Status</th>
                                    <th style={thStyle}>Last Updated</th>
                                    <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredPubs.map(pub => (
                                    <tr key={pub.id} style={{ borderBottom: '1px solid var(--line)' }}>
                                        <td style={tdStyle}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <div style={{ 
                                                    width: 40, height: 40, borderRadius: 10, background: 'var(--surface-input)', 
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-primary-500)'
                                                }}>
                                                    {pub.type === 'brochure' && <BookOpen size={20} />}
                                                    {pub.type === 'news' && <Newspaper size={20} />}
                                                    {pub.type === 'blog' && <FileText size={20} />}
                                                </div>
                                                <div>
                                                    <p style={{ margin: 0, fontWeight: 700, color: '#1e293b' }}>{pub.title}</p>
                                                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>/{pub.type}s/{pub.slug}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td style={tdStyle}>
                                            <span style={{ textTransform: 'capitalize', fontSize: '0.85rem' }}>{pub.type}</span>
                                        </td>
                                        <td style={tdStyle}>
                                            <StatusBadge status={pub.status} />
                                        </td>
                                        <td style={tdStyle}>
                                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                                {new Date(pub.updated_at).toLocaleDateString()}
                                            </span>
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                                <Link to={`/admin/settings/publications/${pub.id}/edit`} style={actionBtn}>
                                                    <Edit size={16} />
                                                </Link>
                                                <button onClick={() => handleDelete(pub.id)} style={{ ...actionBtn, color: '#ef4444' }}>
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {filteredPubs.length === 0 && !loading && (
                                    <tr>
                                        <td colSpan="5" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                                            No publications found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Create Modal */}
            {showCreateModal && (
                <div style={modalOverlay}>
                    <div style={modalContent}>
                        <h2 style={{ margin: '0 0 20px 0', color: '#333' }}>Create Publication</h2>
                        <form onSubmit={handleCreate}>
                            <div style={{ marginBottom: 15 }}>
                                <label style={labelStyle}>Title</label>
                                <input 
                                    style={inputStyle} 
                                    autoFocus
                                    placeholder="e.g. Q3 Price List 2026"
                                    value={newTitle}
                                    onChange={e => setNewTitle(e.target.value)}
                                />
                            </div>
                            <div style={{ marginBottom: 25 }}>
                                <label style={labelStyle}>Content Type</label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                                    <TypeOption 
                                        active={newType === 'brochure'} 
                                        onClick={() => setNewType('brochure')}
                                        icon={BookOpen} label="Brochure"
                                    />
                                    <TypeOption 
                                        active={newType === 'news'} 
                                        onClick={() => setNewType('news')}
                                        icon={Newspaper} label="News"
                                    />
                                    <TypeOption 
                                        active={newType === 'blog'} 
                                        onClick={() => setNewType('blog')}
                                        icon={FileText} label="Blog"
                                    />
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                                <button type="button" onClick={() => setShowCreateModal(false)} style={ghostBtn}>Cancel</button>
                                <button type="submit" style={primaryBtn}>Create & Edit</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

function StatusBadge({ status }) {
    const styles = {
        published: { bg: '#dcfce7', color: '#166534', icon: CheckCircle },
        draft: { bg: '#fef9c3', color: '#854d0e', icon: Clock },
        archived: { bg: '#f1f5f9', color: 'var(--text-secondary)', icon: Archive },
    };
    const s = styles[status] || styles.draft;
    const Icon = s.icon;

    return (
        <span style={{ 
            display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 20, 
            background: s.bg, color: s.color, fontSize: '0.75rem', fontWeight: 700, textTransform: 'capitalize' 
        }}>
            <Icon size={12} /> {status}
        </span>
    );
}

function TypeOption({ active, onClick, icon: Icon, label }) {
    return (
        <div 
            onClick={onClick}
            style={{ 
                padding: '12px 8px', borderRadius: 12, border: active ? '2px solid var(--color-primary-500)' : '1px solid var(--line)',
                background: active ? '#fdf4ff' : 'var(--surface-card, #fff)', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s'
            }}
        >
            <Icon size={20} color={active ? 'var(--color-primary-500)' : '#64748b'} style={{ marginBottom: 4 }} />
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: active ? 'var(--color-primary-500)' : 'var(--text-secondary)' }}>{label}</div>
        </div>
    );
}

const thStyle = { padding: '16px 20px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.05em' };
const tdStyle = { padding: '16px 20px', fontSize: '0.9rem' };
const inputStyle = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--line)', outline: 'none', fontSize: '0.95rem' };
const actionBtn = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface-input)', cursor: 'pointer', color: 'var(--text-secondary)' };
const modalOverlay = { position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const modalContent = { background: 'var(--surface-card, #fff)', padding: 32, borderRadius: 20, width: 450, boxShadow: '0 20px 50px rgba(0,0,0,0.2)' };
const ghostBtn = { background: 'none', border: 'none', padding: '10px 20px', fontWeight: 700, cursor: 'pointer', color: 'var(--text-secondary)' };
const primaryBtn = { background: 'var(--color-primary-500)', color: 'white', border: 'none', padding: '12px 24px', borderRadius: 12, fontWeight: 700, cursor: 'pointer' };
const labelStyle = { fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, display: 'block' };
