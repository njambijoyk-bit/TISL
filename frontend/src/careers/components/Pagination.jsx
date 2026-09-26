// components/Pagination.jsx
export default function Pagination({ currentPage, lastPage, onPageChange }) {
    if (lastPage <= 1) return null;

    const pages = Array.from({ length: lastPage }, (_, i) => i + 1);

    return (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 24, flexWrap: 'wrap' }}>
            <button
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1}
                style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #2a2a2a', background: 'transparent', color: currentPage === 1 ? '#333' : '#a855f7', cursor: currentPage === 1 ? 'default' : 'pointer', fontSize: 13 }}
            >
                ‹
            </button>

            {pages.map(p => (
                <button
                    key={p}
                    onClick={() => onPageChange(p)}
                    style={{
                        padding: '6px 12px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                        background: p === currentPage ? 'linear-gradient(135deg, #a855f7, #7c3aed)' : 'transparent',
                        color: p === currentPage ? '#fff' : '#666',
                        border: p === currentPage ? 'none' : '1px solid #2a2a2a',
                    }}
                >
                    {p}
                </button>
            ))}

            <button
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage === lastPage}
                style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #2a2a2a', background: 'transparent', color: currentPage === lastPage ? '#333' : '#a855f7', cursor: currentPage === lastPage ? 'default' : 'pointer', fontSize: 13 }}
            >
                ›
            </button>
        </div>
    );
}