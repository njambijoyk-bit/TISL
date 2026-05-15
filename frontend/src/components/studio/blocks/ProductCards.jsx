import { Link } from 'react-router-dom';
import { ArrowRight, ShoppingCart, Info, CheckCircle } from 'lucide-react';

/**
 * Variant A: Apple-style / Modern White
 * Image top, name and price below, minimal.
 */
export function ProductCardA({ product, accentColor = '#a855f7' }) {
    return (
        <div style={{
            background: 'white',
            borderRadius: 16,
            padding: 16,
            boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
            transition: 'transform 0.2s',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            border: '1px solid rgba(0,0,0,0.02)'
        }} className="hover:scale-[1.02]">
            <div style={{ 
                aspectRatio: '1/1', 
                background: '#f9fafb', 
                borderRadius: 12, 
                overflow: 'hidden' 
            }}>
                <img 
                    src={product.image} 
                    alt={product.name} 
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
                />
            </div>
            <div>
                <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', margin: 0 }}>{product.name}</h4>
                <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: '4px 0' }}>{product.description}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                    <span style={{ fontSize: '1.1rem', fontWeight: 800, color: accentColor }}>{product.price}</span>
                    <Link to={product.link} style={{ color: accentColor }}><ArrowRight size={18} /></Link>
                </div>
            </div>
        </div>
    );
}

/**
 * Variant B: List / Horizontal Layout
 * Image left, details right.
 */
export function ProductCardB({ product, accentColor = '#a855f7' }) {
    return (
        <div style={{
            background: 'white',
            borderRadius: 16,
            padding: 12,
            display: 'flex',
            gap: 16,
            border: `1.5px solid ${accentColor}15`,
            alignItems: 'center'
        }}>
            <img 
                src={product.image} 
                alt={product.name} 
                style={{ width: 80, height: 80, borderRadius: 8, objectFit: 'cover' }} 
            />
            <div style={{ flex: 1 }}>
                <h4 style={{ fontSize: '0.9rem', color: '#a855f7', fontWeight: 700, margin: 0 }}>{product.name}</h4>
                <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '2px 0' }}>{product.description}</p>
                <span style={{ fontSize: '0.9rem', fontWeight: 800, color: accentColor }}>{product.price}</span>
            </div>
            <Link 
                to={product.link} 
                style={{ 
                    background: accentColor, 
                    color: 'white', 
                    width: 32, height: 32, 
                    borderRadius: '50%', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center' 
                }}
            >
                <ShoppingCart size={14} />
            </Link>
        </div>
    );
}

/**
 * Variant C: TISL Industrial / Mission-Vision Inspired
 * Dark theme, overlay text, scrapbook feel.
 */
export function ProductCardC({ product, accentColor = '#a855f7' }) {
    return (
        <div style={{
            background: '#0f172a',
            borderRadius: 20,
            overflow: 'hidden',
            position: 'relative',
            aspectRatio: '3/4',
            border: `2px solid ${accentColor}40`,
        }}>
            <img 
                src={product.image} 
                alt={product.name} 
                style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.6 }} 
            />
            <div style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(to top, #0f172a, transparent)',
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                gap: 8
            }}>
                {/* Scrapbook Tape style tag */}
                <div style={{
                    position: 'absolute',
                    top: 15,
                    right: -25,
                    background: accentColor,
                    color: 'white',
                    padding: '4px 30px',
                    transform: 'rotate(45deg)',
                    fontSize: '0.65rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.3)'
                }}>
                    Special
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Info size={12} color={accentColor} />
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: accentColor, textTransform: 'uppercase' }}>Industrial Grade</span>
                </div>
                <h4 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#a855f7', margin: 0 }}>{product.name}</h4>
                <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0, lineHeight: 1.4 }}>{product.description}</p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: '1.3rem', fontWeight: 900, color: '#22b64e' }}>{product.price}</span>
                    <span style={{ fontSize: '0.7rem', color: '#b90f2b', textDecoration: 'line-through' }}>KES 4,500</span>
                </div>
                <Link 
                    to={product.link}
                    style={{
                        marginTop: 10,
                        background: 'transparent',
                        border: `1.5px solid ${accentColor}`,
                        color: 'white',
                        padding: '8px 16px',
                        borderRadius: 10,
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        textAlign: 'center',
                        textDecoration: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8
                    }}
                >
                    View Details <ArrowRight size={14} />
                </Link>
            </div>
        </div>
    );
}
