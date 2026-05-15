import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { ProductCardA, ProductCardB, ProductCardC } from './blocks/ProductCards';

export function SortableBlock({ block, isSelected, onClick }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({ id: block.id || block._id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        marginBottom: 16,
        position: 'relative',
        borderRadius: 8,
        border: isSelected ? '2px solid #a855f7' : '2px solid transparent',
        padding: 4,
        background: isSelected ? 'rgba(168,85,247,0.02)' : 'transparent',
    };

    return (
        <div ref={setNodeRef} style={style} onClick={onClick}>
            {/* Drag Handle */}
            <div 
                {...attributes} 
                {...listeners} 
                style={{ 
                    position: 'absolute', 
                    left: -24, 
                    top: '50%', 
                    transform: 'translateY(-50%)', 
                    cursor: 'grab', 
                    color: '#cbd5e1',
                    display: isSelected ? 'flex' : 'none',
                    padding: 4
                }}
            >
                <GripVertical size={18} />
            </div>

            <div style={{ padding: 10 }}>
                <BlockRenderer block={block} />
            </div>
        </div>
    );
}

function BlockRenderer({ block }) {
    const c = block.content || {};

    switch (block.type) {
        case 'rich_text':
            return (
                <div 
                    style={{ fontSize: '1rem', color: '#334155', lineHeight: 1.6 }}
                    dangerouslySetInnerHTML={{ __html: c.html || '<i>Rich Text Block Content</i>' }} 
                />
            );
        case 'image':
            return (
                <div style={{ textAlign: 'center' }}>
                    {c.url ? (
                        <div style={{ display: 'inline-block', width: '100%' }}>
                            <img src={c.url} style={{ maxWidth: '100%', borderRadius: 8 }} alt={c.caption || ''} />
                            {c.caption && <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 8 }}>{c.caption}</p>}
                        </div>
                    ) : (
                        <div style={{ height: 120, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', borderRadius: 8, border: '1px dashed #e2e8f0' }}>
                            Image Placeholder (No URL set)
                        </div>
                    )}
                </div>
            );
        case 'product_card':
            const productData = {
                name: c.name || 'Industrial Drill',
                price: c.price || 'KES 2,500',
                description: c.description || 'Heavy duty professional grade tool.',
                image: c.image || 'https://img.icons8.com/doodle-line/1200/image.jpg',
                link: c.link || '#'
            };
            if (c.variant === 'B') return <ProductCardB product={productData} />;
            if (c.variant === 'C') return <ProductCardC product={productData} />;
            return <ProductCardA product={productData} />;
            
        case 'cta':
            return (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    <button style={{ background: '#a855f7', color: 'white', padding: '12px 32px', borderRadius: 12, border: 'none', fontWeight: 800, cursor: 'default' }}>
                        {c.text || 'Call to Action'}
                    </button>
                </div>
            );

        case 'pull_quote':
            return (
                <div style={{ padding: '20px 40px', borderLeft: '4px solid #a855f7', background: '#f8fafc', fontStyle: 'italic' }}>
                    <p style={{ fontSize: '1.25rem', color: '#1e293b', marginBottom: 10 }}>"{c.text || 'Your quote here...'}"</p>
                    {c.attribution && <cite style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 700 }}>— {c.attribution}</cite>}
                </div>
            );

        case 'video':
            return (
                <div style={{ aspectScale: '16/9', background: '#000', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                    <p>Video Embed: {c.url || 'No URL set'}</p>
                </div>
            );

        case 'bio_card':
            return (
                <div style={{ display: 'flex', gap: 20, alignItems: 'center', padding: 20, borderRadius: 12, background: '#f8fafc' }}>
                    <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#e2e8f0' }} />
                    <div>
                        <h4 style={{ margin: 0, fontSize: '1.1rem' }}>{c.name || 'Author Name'}</h4>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#a855f7', fontWeight: 700 }}>{c.role || 'Designation'}</p>
                        <p style={{ margin: '8px 0 0', fontSize: '0.85rem', color: '#64748b' }}>{c.bio || 'Short biography goes here.'}</p>
                    </div>
                </div>
            );

        case 'price_table':
            const rows = c.rows || [];
            return (
                <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ background: '#f8fafc' }}>
                            <tr>
                                <th style={{ textAlign: 'left', padding: 12, fontSize: '0.75rem', fontWeight: 800 }}>ITEM</th>
                                <th style={{ textAlign: 'right', padding: 12, fontSize: '0.75rem', fontWeight: 800 }}>PRICE</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length > 0 ? rows.map((r, i) => (
                                <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: 12, fontSize: '0.9rem' }}>{r.item}</td>
                                    <td style={{ padding: 12, fontSize: '0.9rem', textAlign: 'right', fontWeight: 700 }}>{r.price}</td>
                                </tr>
                            )) : (
                                <tr><td colSpan="2" style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>No rows added yet.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            );
            
        default:
            return <div style={{ padding: 10, background: '#f1f5f9', borderRadius: 4, fontSize: '0.75rem', color: '#64748b' }}>Block: {block.type}</div>;
    }
}
