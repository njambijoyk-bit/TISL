import { useEffect } from 'react';
import {
  PartyPopper, Pencil, RefreshCw, UserPlus, UserMinus,
  Link2, CheckSquare, Flag, ThumbsUp, XCircle,
  MessageSquare, FileText, Package, Plug,
  Unlink,
} from 'lucide-react';
import useProjectStore from '../../../store/projectStore';

// ── Action config — icon + colour per action type ─────────────────────────────
const ACTION_CFG = {
  PROJECT_CREATED:          { Icon: PartyPopper,   color: '#a855f7', bg: 'rgba(168,85,247,0.12)'  },
  PROJECT_UPDATED:          { Icon: Pencil,         color: '#3b82f6', bg: 'rgba(59,130,246,0.12)'  },
  STATUS_CHANGED:           { Icon: RefreshCw,      color: '#f59e0b', bg: 'rgba(245,158,11,0.12)'  },
  PARTICIPANT_ADDED:        { Icon: UserPlus,        color: '#10b981', bg: 'rgba(16,185,129,0.12)'  },
  PARTICIPANT_REMOVED:      { Icon: UserMinus,       color: '#ef4444', bg: 'rgba(239,68,68,0.12)'   },
  LINK_ADDED:               { Icon: Link2,           color: '#06b6d4', bg: 'rgba(6,182,212,0.12)'   },
  LINK_REMOVED:             { Icon: Unlink,         color: '#9ca3af', bg: 'rgba(156,163,175,0.12)' },
  TASK_CREATED:             { Icon: CheckSquare,     color: '#3b82f6', bg: 'rgba(59,130,246,0.12)'  },
  TASK_UPDATED:             { Icon: CheckSquare,     color: '#6366f1', bg: 'rgba(99,102,241,0.12)'  },
  TASK_STATUS_CHANGED:      { Icon: CheckSquare,     color: '#f59e0b', bg: 'rgba(245,158,11,0.12)'  },
  MILESTONE_CREATED:        { Icon: Flag,            color: '#a855f7', bg: 'rgba(168,85,247,0.12)'  },
  MILESTONE_APPROVED:       { Icon: ThumbsUp,        color: '#10b981', bg: 'rgba(16,185,129,0.12)'  },
  MILESTONE_REJECTED:       { Icon: XCircle,         color: '#ef4444', bg: 'rgba(239,68,68,0.12)'   },
  MESSAGE_POSTED:           { Icon: MessageSquare,   color: '#a855f7', bg: 'rgba(168,85,247,0.12)'  },
  QUOTE_CREATED:            { Icon: FileText,        color: '#f59e0b', bg: 'rgba(245,158,11,0.12)'  },
  ORDER_CREATED_FROM_QUOTE: { Icon: Package,         color: '#10b981', bg: 'rgba(16,185,129,0.12)'  },
  REQUEST_LINKED:           { Icon: Plug,            color: '#06b6d4', bg: 'rgba(6,182,212,0.12)'   },
};

const DEFAULT_CFG = { Icon: RefreshCw, color: '#9ca3af', bg: 'rgba(156,163,175,0.12)' };

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

// ── Component ─────────────────────────────────────────────────────────────────

const ActivityFeed = ({ project, limit }) => {
  const { activity, activityPagination, loading, fetchActivity } = useProjectStore();

  useEffect(() => {
    if (project?.id) fetchActivity(project.id, { per_page: limit || 20 });
  }, [project?.id]);

  const loadMore = () => {
    if (activityPagination?.current_page < activityPagination?.last_page) {
      fetchActivity(project.id, {
        per_page: limit || 20,
        page: activityPagination.current_page + 1,
      });
    }
  };

  if (loading.activity) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <div className="w-7 h-7 rounded-full animate-pulse shrink-0"
              style={{ background: 'rgba(168,85,247,0.12)' }} />
            <div className="flex-1 space-y-1.5 pt-1">
              <div className="h-3 rounded animate-pulse w-2/3"
                style={{ background: 'rgba(168,85,247,0.08)' }} />
              <div className="h-3 rounded animate-pulse w-1/3"
                style={{ background: 'rgba(168,85,247,0.05)' }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!activity.length) {
    return (
      <p className="text-sm italic" style={{ color: '#9ca3af' }}>No activity yet.</p>
    );
  }

  return (
    <div className="space-y-0">
      {activity.map((item, idx) => {
        const cfg      = ACTION_CFG[item.action] ?? DEFAULT_CFG;
        const isLast   = idx === activity.length - 1;
        const actorName = item.is_system || !item.actor
          ? 'System'
          : item.actor?.name || `User #${item.actor_user_id}`;

        return (
          <div key={item.id} className="flex gap-3">

            {/* Timeline col */}
            <div className="flex flex-col items-center" style={{ width: 28, flexShrink: 0 }}>
              {/* Icon badge */}
              <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                style={{ background: cfg.bg, border: `1px solid ${cfg.color}30` }}>
                <cfg.Icon size={13} color={cfg.color} />
              </div>
              {/* Connector line */}
              {!isLast && (
                <div className="flex-1 my-1"
                  style={{ width: 1.5, background: 'rgba(168,85,247,0.15)', minHeight: 16 }} />
              )}
            </div>

            {/* Content */}
            <div className="pb-4 min-w-0 flex-1">
              {/* Action label pill */}
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.color}30` }}>
                  {item.action.replace(/_/g, ' ')}
                </span>
                {item.entity_type && item.entity_id && (
                  <span className="text-xs font-mono" style={{ color: '#9ca3af' }}>
                    {item.entity_type.replace(/_/g, ' ')} #{item.entity_id}
                  </span>
                )}
              </div>

              {/* Actor */}
              <p className="text-sm text-gray-800 dark:text-gray-200">
                <span className="font-semibold" style={{ color: cfg.color }}>{actorName}</span>
                {' '}
                <span className="text-gray-500 dark:text-gray-400 text-xs">
                  {item.action.replace(/_/g, ' ').toLowerCase()}
                </span>
              </p>

              {/* Note */}
              {item.metadata?.note && (
                <p className="text-xs mt-0.5 truncate px-2 py-1 rounded-lg"
                  style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.color}20` }}>
                  {item.metadata.note}
                </p>
              )}

              {/* Timestamp */}
              <p className="text-xs mt-0.5" style={{ color: '#9ca3af' }}>
                {formatDate(item.created_at)}
              </p>
            </div>
          </div>
        );
      })}

      {/* Load more */}
      {activityPagination?.current_page < activityPagination?.last_page && (
        <button onClick={loadMore} disabled={loading.activity}
          className="text-xs font-semibold mt-2 px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
          style={{ color: '#a855f7', border: '1px solid rgba(168,85,247,0.2)', background: 'transparent' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.06)'; e.currentTarget.style.borderColor = 'rgba(168,85,247,0.4)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(168,85,247,0.2)'; }}>
          Load more activity
        </button>
      )}
    </div>
  );
};

export default ActivityFeed;