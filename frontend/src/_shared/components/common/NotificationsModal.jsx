import { useState, useEffect } from 'react';
import { Bell, X, Check, Loader2, Trash2 } from 'lucide-react';
import notificationsAPI from '../../api/notifications';
import toast from 'react-hot-toast';

const TYPE_COLORS = {
  referral_earned:          '#a855f7',
  birthday_promo:           '#ec4899',
  win_back_promo:           '#f97316',
  vip_upgrade_promo:        '#f59e0b',
  loyalty_milestone_promo:  '#10b981',
  order_placed:             '#3b82f6',
  order_confirmed:          '#22c55e',
  order_shipped:            '#6366f1',
  order_delivered:          '#22c55e',
  order_cancelled:          '#ef4444',
};

export default function NotificationsModal({ open, onClose }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [loading,       setLoading]       = useState(false);
  const [filter,        setFilter]        = useState('all'); // 'all' | 'unread'

  useEffect(() => {
    if (!open) return;
    load();
  }, [open]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    if (open) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await notificationsAPI.list({ per_page: 50 });
      const items = res.data.data;
      setNotifications(items);
      setUnreadCount(items.filter(n => !n.is_read).length);
    } catch {
      toast.error('Could not load notifications');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (id) => {
    try {
      await notificationsAPI.markAsRead(id);
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n)
      );
      setUnreadCount(c => Math.max(0, c - 1));
    } catch {}
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationsAPI.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true, read_at: new Date().toISOString() })));
      setUnreadCount(0);
      toast.success('All marked as read');
    } catch { toast.error('Failed'); }
  };

  const handleDelete = async (id) => {
    const notif = notifications.find(n => n.id === id);
    try {
      await notificationsAPI.destroy(id);
      setNotifications(prev => prev.filter(n => n.id !== id));
      if (!notif?.is_read) setUnreadCount(c => Math.max(0, c - 1));
    } catch { toast.error('Could not delete'); }
  };

  const visible = filter === 'unread'
    ? notifications.filter(n => !n.is_read)
    : notifications;

  if (!open) return null;

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div style={{
        background: 'white', borderRadius: 20,
        width: '100%', maxWidth: 520,
        maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
        overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{
          padding: '20px 20px 14px',
          borderBottom: '1px solid rgba(168,85,247,0.1)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'linear-gradient(135deg,#a855f7,#7c3aed)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Bell size={16} color="white" />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#111827' }}>
                  Notifications
                </h2>
                <p style={{ margin: 0, fontSize: '0.7rem', color: '#9ca3af' }}>
                  {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
                </p>
              </div>
            </div>
            <button onClick={onClose} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#9ca3af', display: 'flex', padding: 4, borderRadius: 8,
              transition: 'color 150ms',
            }}
              onMouseEnter={e => e.currentTarget.style.color = '#374151'}
              onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}
            >
              <X size={18} />
            </button>
          </div>

          {/* Filter + Mark all */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {['all', 'unread'].map(f => (
                <button key={f} onClick={() => setFilter(f)} style={{
                  padding: '4px 12px', borderRadius: 8, fontSize: '0.72rem', fontWeight: 700,
                  border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  background: filter === f ? 'rgba(168,85,247,0.1)' : 'transparent',
                  color: filter === f ? '#7c3aed' : '#9ca3af',
                  transition: 'all 150ms',
                }}>
                  {f === 'all' ? 'All' : `Unread${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
                </button>
              ))}
            </div>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead} style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '4px 10px', borderRadius: 8, fontSize: '0.7rem', fontWeight: 700,
                border: '1px solid rgba(168,85,247,0.2)', cursor: 'pointer', fontFamily: 'inherit',
                background: 'rgba(168,85,247,0.04)', color: '#7c3aed',
              }}>
                <Check size={11} strokeWidth={2.5} /> Mark all read
              </button>
            )}
          </div>
        </div>

        {/* List */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
              <Loader2 size={24} color="#a855f7" style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          ) : visible.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px' }}>
              <Bell size={36} strokeWidth={1.5} color="#e5e7eb" style={{ marginBottom: 10 }} />
              <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: '#9ca3af' }}>
                {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
              </p>
            </div>
          ) : visible.map(n => {
            const accent = TYPE_COLORS[n.type] ?? '#6b7280';
            return (
              <div key={n.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '13px 18px',
                background: n.is_read ? 'white' : `${accent}08`,
                borderBottom: '1px solid #f9fafb',
                cursor: n.is_read ? 'default' : 'pointer',
                transition: 'background 150ms',
              }}
                onClick={() => !n.is_read && handleMarkAsRead(n.id)}
                onMouseEnter={e => { if (!n.is_read) e.currentTarget.style.background = `${accent}12`; }}
                onMouseLeave={e => { if (!n.is_read) e.currentTarget.style.background = `${accent}08`; }}
              >
                {/* Left accent bar */}
                <div style={{
                  width: 3, borderRadius: 99, alignSelf: 'stretch', flexShrink: 0,
                  background: n.is_read ? '#f3f4f6' : accent,
                  minHeight: 36,
                }} />

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    margin: '0 0 3px', fontSize: '0.82rem', lineHeight: 1.35,
                    fontWeight: n.is_read ? 600 : 700, color: '#111827',
                  }}>
                    {n.title}
                  </p>
                  <p style={{
                    margin: '0 0 5px', fontSize: '0.76rem', lineHeight: 1.45,
                    color: n.is_read ? '#9ca3af' : '#4b5563',
                  }}>
                    {n.message}
                  </p>
                  <p style={{ margin: 0, fontSize: '0.67rem', color: '#d1d5db', fontWeight: 600 }}>
                    {n.time_ago}
                    {!n.is_read && (
                      <span style={{
                        marginLeft: 8, padding: '1px 6px', borderRadius: 99,
                        background: `${accent}18`, color: accent,
                        fontSize: '0.62rem', fontWeight: 700,
                      }}>
                        new
                      </span>
                    )}
                  </p>
                </div>

                {/* Delete */}
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(n.id); }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#e5e7eb', padding: 4, display: 'flex', flexShrink: 0,
                    borderRadius: 6, transition: 'color 150ms, background 150ms',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = '#fef2f2'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#e5e7eb'; e.currentTarget.style.background = 'transparent'; }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}