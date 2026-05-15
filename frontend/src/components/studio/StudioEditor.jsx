import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
    DndContext, 
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { 
    Save, 
    Eye, 
    Settings, 
    Plus, 
    Type, 
    Image as ImageIcon, 
    ShoppingBag, 
    User, 
    MousePointer2, 
    Layout,
    ChevronLeft,
    Trash2,
    Check,
    Video,
    Quote
} from 'lucide-react';
import useStudioStore from '../../store/studioStore';
import { SortableBlock } from './SortableBlock';

export default function StudioEditor() {
    const { id } = useParams();
    const navigate = useNavigate();
    
    // Store hooks
    const activePublication = useStudioStore(state => state.activePublication);
    const fetchPublication = useStudioStore(state => state.fetchPublication);
    const updatePublication = useStudioStore(state => state.updatePublication);
    const addBlock = useStudioStore(state => state.addBlock);
    const setBlocks = useStudioStore(state => state.setBlocks);
    const removeBlock = useStudioStore(state => state.removeBlock);
    const updateBlock = useStudioStore(state => state.updateBlock);
    const loading = useStudioStore(state => state.loading);

    const [selectedBlockId, setSelectedBlockId] = useState(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (id) fetchPublication(id);
    }, [id, fetchPublication]);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = (event) => {
        const { active, over } = event;
        if (active.id !== over.id) {
            const oldIndex = activePublication.blocks.findIndex(b => (b.id || b._id) === active.id);
            const newIndex = activePublication.blocks.findIndex(b => (b.id || b._id) === over.id);
            setBlocks(arrayMove(activePublication.blocks, oldIndex, newIndex));
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await updatePublication(id, activePublication);
            alert('Saved successfully!');
        } catch (err) {
            console.error(err);
        } finally {
            setSaving(false);
        }
    };

    if (loading || !activePublication) return <div>Loading...</div>;

    const selectedBlock = activePublication.blocks?.find(b => (b.id || b._id) === selectedBlockId);

    return (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f1f5f9' }}>
            {/* Toolbar */}
            <div style={{ height: 60, background: 'white', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', px: 20, justifyContent: 'space-between', padding: '0 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
                    <button onClick={() => navigate('/admin/publications')} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                        <ChevronLeft size={20} />
                    </button>
                    <div>
                        <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>{activePublication.title}</h2>
                        <span style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>{activePublication.type} Editor</span>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button style={btnStyle} onClick={() => window.open(`/${activePublication.type}s/${activePublication.slug}`, '_blank')}>
                        <Eye size={16} /> Preview
                    </button>
                    <button style={{ ...btnStyle, background: '#a855f7', color: 'white' }} onClick={handleSave} disabled={saving}>
                        {saving ? 'Saving...' : <><Save size={16} /> Save Changes</>}
                    </button>
                </div>
            </div>

            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {/* Left Sidebar: Block Library */}
                <div style={{ width: 260, background: 'white', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                    <div style={{ padding: 20 }}>
                        <p style={labelStyle}>Blocks</p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                            <BlockIcon label="Rich Text" icon={Type} onClick={() => addBlock('rich_text', { html: 'Enter text here' })} />
                            <BlockIcon label="Image" icon={ImageIcon} onClick={() => addBlock('image', { url: '' })} />
                            <BlockIcon label="Product" icon={ShoppingBag} onClick={() => addBlock('product_card', { name: '', price: '', variant: 'A', description: '', link: '#' })} />
                            <BlockIcon label="Bio Card" icon={User} onClick={() => addBlock('bio_card', { name: '', role: '', bio: '' })} />
                            <BlockIcon label="CTA" icon={MousePointer2} onClick={() => addBlock('cta', { text: 'Click Here', link: '#' })} />
                            <BlockIcon label="Table" icon={Layout} onClick={() => addBlock('price_table', { rows: [] })} />
                            {(activePublication.type === 'news' || activePublication.type === 'blog') && (
                                <>
                                    <BlockIcon label="Pull Quote" icon={Quote} onClick={() => addBlock('pull_quote', { text: '', attribution: '' })} />
                                    <BlockIcon label="Video" icon={Video} onClick={() => addBlock('video', { url: '' })} />
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Center: Canvas */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '40px 0' }}>
                    <div style={{ maxWidth: 800, margin: '0 auto', background: 'white', minHeight: '1000px', boxShadow: '0 10px 25px rgba(0,0,0,0.05)', borderRadius: 8, padding: 40 }}>
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                            <SortableContext items={activePublication.blocks?.map(b => b.id || b._id) || []} strategy={verticalListSortingStrategy}>
                                {activePublication.blocks?.map((block) => (
                                    <SortableBlock 
                                        key={block.id || block._id} 
                                        block={block} 
                                        isSelected={selectedBlockId === (block.id || block._id)}
                                        onClick={() => setSelectedBlockId(block.id || block._id)}
                                    />
                                ))}
                            </SortableContext>
                        </DndContext>
                        
                        {(!activePublication.blocks || activePublication.blocks.length === 0) && (
                            <div style={{ height: 300, border: '2px dashed #e2e8f0', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                                <Plus size={40} style={{ marginBottom: 10 }} />
                                <p>Drag and drop blocks here or click to add</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Sidebar: Properties */}
                <div style={{ width: 320, background: 'white', borderLeft: '1px solid #e2e8f0', overflowY: 'auto' }}>
                    {selectedBlock ? (
                        <div style={{ padding: 20 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                <h3 style={{ fontSize: '0.9rem', fontWeight: 800, textTransform: 'uppercase' }}>Edit {selectedBlock.type.replace('_', ' ')}</h3>
                                <button onClick={() => setSelectedBlockId(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><Check size={18} /></button>
                            </div>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                                <PropertyFields 
                                    block={selectedBlock} 
                                    onChange={(content) => updateBlock(selectedBlockId, { content })} 
                                />
                                
                                <div style={{ height: 1, background: '#e2e8f0', margin: '10px 0' }} />
                                
                                <button 
                                    style={{ ...btnStyle, background: '#fee2e2', color: '#ef4444', border: 'none', width: '100%', justifyContent: 'center' }}
                                    onClick={() => {
                                        if (confirm('Delete this block?')) {
                                            removeBlock(selectedBlockId);
                                            setSelectedBlockId(null);
                                        }
                                    }}
                                >
                                    <Trash2 size={16} /> Delete Block
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div style={{ padding: 20 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                                <Settings size={18} color="#a855f7" />
                                <h3 style={{ fontSize: '0.9rem', fontWeight: 800, textTransform: 'uppercase' }}>Publication Settings</h3>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                                <div>
                                    <label style={fieldLabel}>Title</label>
                                    <input 
                                        style={inputStyle} 
                                        value={activePublication.title} 
                                        onChange={(e) => updatePublication(id, { title: e.target.value })}
                                    />
                                </div>

                                {activePublication.type === 'brochure' && (
                                    <>
                                        <div>
                                            <label style={fieldLabel}>Accent Color</label>
                                            <div style={{ display: 'flex', gap: 8, marginTop: 5 }}>
                                                {['#a855f7', '#3b82f6', '#ef4444', '#10b981', '#f59e0b'].map(c => (
                                                    <div 
                                                        key={c} 
                                                        onClick={() => updatePublication(id, { style_config: { ...activePublication.style_config, accent: c } })}
                                                        style={{ 
                                                            width: 28, height: 28, borderRadius: '50%', background: c, cursor: 'pointer',
                                                            border: activePublication.style_config?.accent === c ? '2px solid black' : '2px solid transparent',
                                                            boxShadow: 'inset 0 0 0 2px white'
                                                        }} 
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <label style={fieldLabel}>Template Shell</label>
                                            <select 
                                                style={inputStyle}
                                                value={activePublication.template}
                                                onChange={(e) => updatePublication(id, { template: e.target.value })}
                                            >
                                                <option value="minimal">Minimal White</option>
                                                <option value="bold">Bold Industrial</option>
                                                <option value="corporate">Professional Corporate</option>
                                            </select>
                                        </div>
                                    </>
                                )}

                                {(activePublication.type === 'news' || activePublication.type === 'blog') && (
                                    <div>
                                        <label style={fieldLabel}>Tags (comma separated)</label>
                                        <input 
                                            style={inputStyle} 
                                            value={activePublication.tags?.join(', ') || ''} 
                                            onChange={(e) => updatePublication(id, { tags: e.target.value.split(',').map(t => t.trim()) })}
                                        />
                                    </div>
                                )}
                                
                                <div style={{ height: 1, background: '#e2e8f0', margin: '10px 0' }} />

                                <div>
                                    <p style={labelStyle}>Publishing Status</p>
                                    <div style={{ display: 'flex', gap: 5, marginTop: 5 }}>
                                        {['draft', 'published', 'archived'].map(s => (
                                            <button 
                                                key={s} 
                                                onClick={() => updatePublication(id, { status: s })}
                                                style={{ 
                                                    flex: 1, padding: '8px 5px', fontSize: '0.65rem', fontWeight: 700, borderRadius: 6, textTransform: 'uppercase',
                                                    background: activePublication.status === s ? '#a855f7' : '#f1f5f9',
                                                    color: activePublication.status === s ? 'white' : '#64748b',
                                                    border: 'none', cursor: 'pointer', transition: 'all 0.2s'
                                                }}
                                            >
                                                {s}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

/**
 * Renders appropriate fields for each block type
 */
function PropertyFields({ block, onChange }) {
    const c = block.content || {};
    
    switch (block.type) {
        case 'rich_text':
            return (
                <div>
                    <label style={fieldLabel}>HTML Content</label>
                    <textarea 
                        style={{ ...inputStyle, height: 200, fontFamily: 'monospace' }} 
                        value={c.html || ''} 
                        onChange={(e) => onChange({ ...c, html: e.target.value })}
                    />
                </div>
            );
        case 'image':
            return (
                <div>
                    <label style={fieldLabel}>Image URL</label>
                    <input style={inputStyle} value={c.url || ''} onChange={(e) => onChange({ ...c, url: e.target.value })} />
                    <label style={{ ...fieldLabel, marginTop: 10, display: 'block' }}>Caption</label>
                    <input style={inputStyle} value={c.caption || ''} onChange={(e) => onChange({ ...c, caption: e.target.value })} />
                </div>
            );
        case 'product_card':
            return (
                <>
                    <label style={fieldLabel}>Visual Variant</label>
                    <div style={{ display: 'flex', gap: 5 }}>
                        {['A', 'B', 'C'].map(v => (
                            <button 
                                key={v} 
                                onClick={() => onChange({ ...c, variant: v })}
                                style={{ flex: 1, padding: 8, borderRadius: 6, border: '1px solid #e2e8f0', background: c.variant === v ? '#f1f5f9' : 'white', fontWeight: 700 }}
                            >
                                Variant {v}
                            </button>
                        ))}
                    </div>
                    <label style={fieldLabel}>Product Name</label>
                    <input style={inputStyle} value={c.name || ''} onChange={(e) => onChange({ ...c, name: e.target.value })} />
                    <label style={fieldLabel}>Price</label>
                    <input style={inputStyle} value={c.price || ''} onChange={(e) => onChange({ ...c, price: e.target.value })} />
                    <label style={fieldLabel}>Description</label>
                    <textarea style={inputStyle} value={c.description || ''} onChange={(e) => onChange({ ...c, description: e.target.value })} />
                    <label style={fieldLabel}>Link URL</label>
                    <input style={inputStyle} value={c.link || ''} onChange={(e) => onChange({ ...c, link: e.target.value })} />
                </>
            );
        case 'cta':
            return (
                <>
                    <label style={fieldLabel}>Button Text</label>
                    <input style={inputStyle} value={c.text || ''} onChange={(e) => onChange({ ...c, text: e.target.value })} />
                    <label style={fieldLabel}>Link URL</label>
                    <input style={inputStyle} value={c.link || ''} onChange={(e) => onChange({ ...c, link: e.target.value })} />
                </>
            );
        case 'pull_quote':
            return (
                <>
                    <label style={fieldLabel}>Quote Text</label>
                    <textarea style={inputStyle} value={c.text || ''} onChange={(e) => onChange({ ...c, text: e.target.value })} />
                    <label style={fieldLabel}>Attribution (Author)</label>
                    <input style={inputStyle} value={c.attribution || ''} onChange={(e) => onChange({ ...c, attribution: e.target.value })} />
                </>
            );
        default:
            return <p style={{ fontSize: '0.75rem', color: '#94a3b8' }}>No specific fields for this block yet.</p>;
    }
}

function BlockIcon({ label, icon: Icon, onClick }) {
    return (
        <button 
            onClick={onClick}
            style={{ 
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, border: '1px solid #e2e8f0', background: 'none', cursor: 'pointer', transition: 'background 0.2s'
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
        >
            <Icon size={20} color="#a855f7" />
            <span style={{ fontSize: '0.65rem', fontWeight: 600 }}>{label}</span>
        </button>
    );
}

const btnStyle = {
    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 10, fontSize: '0.8rem', fontWeight: 700, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontFamily: 'inherit'
};

const labelStyle = { fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10, display: 'block' };

const fieldLabel = { fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginTop: 10, display: 'block' };

const inputStyle = { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.85rem', outline: 'none', marginTop: 5 };
