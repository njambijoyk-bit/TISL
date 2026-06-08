import { useState, useEffect, useMemo } from 'react';
import { History, ChevronDown, ChevronUp, GitCommit, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import policyAPI from '../../../../api/policy';

// ── Shared primitives (mirrored from PolicySettings) ──────────────────────────

const card = {
  background: 'white',
  borderRadius: 12,
  border: '1px solid rgba(168,85,247,0.1)',
  boxShadow: '0 2px 12px rgba(168,85,247,0.06)',
};

function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
      <div style={{
        width: 28, height: 28,
        border: '3px solid rgba(168,85,247,0.2)',
        borderTopColor: '#a855f7',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
    </div>
  );
}

// ── Diff engine ───────────────────────────────────────────────────────────────
// Produces a list of { type: 'equal'|'removed'|'added', line: string }
// using a simple LCS-based line diff.

function computeDiff(oldText = '', newText = '') {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const m = oldLines.length;
  const n = newLines.length;

  // Build LCS table
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Traceback
  const result = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.push({ type: 'equal', line: oldLines[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: 'added', line: newLines[j - 1] });
      j--;
    } else {
      result.push({ type: 'removed', line: oldLines[i - 1] });
      i--;
    }
  }

  return result.reverse();
}

// ── Diff viewer ───────────────────────────────────────────────────────────────

function DiffViewer({ previousContent, newContent }) {
  const diff = useMemo(
    () => computeDiff(previousContent || '', newContent || ''),
    [previousContent, newContent],
  );

  // Assign line numbers per side
  let oldLineNo = 0;
  let newLineNo = 0;

  const rows = diff.map((chunk, idx) => {
    let oldNo = null;
    let newNo = null;

    if (chunk.type === 'equal') {
      oldLineNo++; newLineNo++;
      oldNo = oldLineNo; newNo = newLineNo;
    } else if (chunk.type === 'removed') {
      oldLineNo++;
      oldNo = oldLineNo;
    } else {
      newLineNo++;
      newNo = newLineNo;
    }

    return { ...chunk, oldNo, newNo, idx };
  });

  const added   = diff.filter(d => d.type === 'added').length;
  const removed = diff.filter(d => d.type === 'removed').length;

  const BG = {
    added:   '#0d1117', // we'll use green tint below
    removed: '#0d1117',
    equal:   '#0d1117',
  };

  const ROW_BG = {
    added:   'rgba(46,160,67,0.15)',
    removed: 'rgba(248,81,73,0.15)',
    equal:   'transparent',
  };

  const TEXT = {
    added:   '#3fb950',
    removed: '#f85149',
    equal:   '#e6edf3',
  };

  const GUTTER = {
    added:   'rgba(46,160,67,0.25)',
    removed: 'rgba(248,81,73,0.25)',
    equal:   'transparent',
  };

  const PREFIX = { added: '+', removed: '−', equal: ' ' };

  return (
    <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(168,85,247,0.15)' }}>

      {/* Header bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 14px',
        background: '#161b22',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#8b949e', fontFamily: 'monospace' }}>
          Diff — policy content
        </span>
        <div style={{ display: 'flex', gap: 10 }}>
          {added > 0 && (
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#3fb950' }}>
              +{added} line{added !== 1 ? 's' : ''}
            </span>
          )}
          {removed > 0 && (
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#f85149' }}>
              −{removed} line{removed !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Diff table */}
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 520, background: '#0d1117' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'monospace', fontSize: '0.78rem' }}>
          <tbody>
            {rows.map(row => (
              <tr key={row.idx} style={{ background: ROW_BG[row.type] }}>

                {/* Old line number */}
                <td style={{
                  width: 44, minWidth: 44,
                  padding: '1px 10px',
                  textAlign: 'right',
                  color: '#8b949e',
                  userSelect: 'none',
                  borderRight: '1px solid rgba(255,255,255,0.06)',
                  background: GUTTER[row.type],
                  fontSize: '0.72rem',
                  verticalAlign: 'top',
                  lineHeight: '20px',
                }}>
                  {row.oldNo ?? ''}
                </td>

                {/* New line number */}
                <td style={{
                  width: 44, minWidth: 44,
                  padding: '1px 10px',
                  textAlign: 'right',
                  color: '#8b949e',
                  userSelect: 'none',
                  borderRight: '1px solid rgba(255,255,255,0.06)',
                  background: GUTTER[row.type],
                  fontSize: '0.72rem',
                  verticalAlign: 'top',
                  lineHeight: '20px',
                }}>
                  {row.newNo ?? ''}
                </td>

                {/* Prefix symbol */}
                <td style={{
                  width: 20, minWidth: 20,
                  padding: '1px 6px',
                  color: TEXT[row.type],
                  userSelect: 'none',
                  fontWeight: 700,
                  verticalAlign: 'top',
                  lineHeight: '20px',
                }}>
                  {PREFIX[row.type]}
                </td>

                {/* Line content */}
                <td style={{
                  padding: '1px 12px 1px 0',
                  color: TEXT[row.type],
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  lineHeight: '20px',
                }}>
                  {row.line || ' '}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Single log entry card ─────────────────────────────────────────────────────

function LogEntry({ log, policyTitle }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{
      ...card,
      overflow: 'hidden',
      borderColor: log.is_major_bump ? 'rgba(245,158,11,0.3)' : 'rgba(168,85,247,0.1)',
    }}>

      {/* Summary row — always visible */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px',
          cursor: 'pointer',
          background: log.is_major_bump ? 'rgba(245,158,11,0.04)' : 'white',
          userSelect: 'none',
        }}
      >
        {/* Version pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{
            fontSize: '0.72rem', fontWeight: 700,
            padding: '2px 8px', borderRadius: 99,
            background: 'rgba(168,85,247,0.1)', color: '#7c3aed',
          }}>
            v{log.previous_version}
          </span>
          <span style={{ fontSize: '0.68rem', color: '#9ca3af' }}>→</span>
          <span style={{
            fontSize: '0.72rem', fontWeight: 700,
            padding: '2px 8px', borderRadius: 99,
            background: log.is_major_bump ? 'rgba(245,158,11,0.15)' : 'rgba(168,85,247,0.1)',
            color: log.is_major_bump ? '#b45309' : '#7c3aed',
          }}>
            v{log.new_version}
          </span>
          {log.is_major_bump && (
            <span style={{
              fontSize: '0.6rem', fontWeight: 700,
              padding: '1px 6px', borderRadius: 99,
              background: 'rgba(245,158,11,0.15)', color: '#b45309',
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              Major
            </span>
          )}
        </div>

        {/* Policy name */}
        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {policyTitle}
        </span>

        {/* Meta */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: '0.68rem', color: '#9ca3af' }}>
            {log.changed_by_name}
          </span>
          <span style={{ fontSize: '0.65rem', color: '#9ca3af' }}>
            {log.changed_at ? format(new Date(log.changed_at), 'dd MMM yyyy, HH:mm') : '—'}
          </span>
          {open ? <ChevronUp size={13} color="#9ca3af" /> : <ChevronDown size={13} color="#9ca3af" />}
        </div>
      </div>

      {/* Expanded diff */}
      {open && (
        <div style={{ padding: '0 16px 16px', background: log.is_major_bump ? 'rgba(245,158,11,0.02)' : 'white' }}>
          {log.major_bump_note && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              padding: '8px 12px', borderRadius: 8, marginBottom: 12,
              background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
            }}>
              <AlertTriangle size={13} style={{ color: '#b45309', flexShrink: 0, marginTop: 2 }} />
              <p style={{ fontSize: '0.78rem', color: '#92400e', margin: 0, lineHeight: 1.5 }}>
                <strong>Major version note:</strong> {log.major_bump_note}
              </p>
            </div>
          )}
          <DiffViewer
            previousContent={log.previous_content}
            newContent={log.new_content}
          />
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PolicyVersionHistory({ policies = [] }) {
  // logs keyed by policy id: { [id]: log[] }
  const [allLogs,   setAllLogs]   = useState({});
  const [loading,   setLoading]   = useState(true);
  const [filterKey, setFilterKey] = useState('all'); // 'all' | policy.key

  // Fetch change logs for every policy in parallel
  useEffect(() => {
    if (!policies.length) { setLoading(false); return; }

    const fetches = policies.map(p =>
      policyAPI.getChangeLogs(p.id)
        .then(logs => ({ id: p.id, logs }))
        .catch(() => ({ id: p.id, logs: [] }))
    );

    Promise.all(fetches).then(results => {
      const map = {};
      results.forEach(({ id, logs }) => { map[id] = logs; });
      setAllLogs(map);
      setLoading(false);
    });
  }, [policies]);

  // Flatten + sort all logs newest first, annotated with policy info
  const flatLogs = useMemo(() => {
    return policies
      .flatMap(p =>
        (allLogs[p.id] ?? []).map(log => ({
          ...log,
          _policyId:    p.id,
          _policyKey:   p.key,
          _policyTitle: p.title,
        }))
      )
      .filter(log =>
        filterKey === 'all' ? true : log._policyKey === filterKey
      )
      .sort((a, b) => new Date(b.changed_at) - new Date(a.changed_at));
  }, [allLogs, policies, filterKey]);

  const totalChanges = Object.values(allLogs).reduce((acc, logs) => acc + logs.length, 0);
  const majorChanges = Object.values(allLogs)
    .flat()
    .filter(l => l.is_major_bump).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {[
          { label: 'Total revisions',  value: totalChanges,           color: '#7c3aed' },
          { label: 'Major bumps',      value: majorChanges,           color: '#b45309' },
          { label: 'Policies tracked', value: policies.length,        color: '#0e7490' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ ...card, padding: '16px 20px' }}>
            <p style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', margin: '0 0 6px' }}>
              {label}
            </p>
            <p style={{ fontSize: '1.5rem', fontWeight: 900, color, margin: 0 }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button
          onClick={() => setFilterKey('all')}
          style={{
            padding: '5px 14px', borderRadius: 8, fontSize: '0.72rem', fontWeight: 700,
            border: `1.5px solid ${filterKey === 'all' ? '#a855f7' : 'rgba(168,85,247,0.18)'}`,
            background: filterKey === 'all' ? 'rgba(168,85,247,0.08)' : 'white',
            color: filterKey === 'all' ? '#7c3aed' : '#9ca3af',
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          All policies
        </button>
        {policies.map(p => (
          <button
            key={p.key}
            onClick={() => setFilterKey(p.key)}
            style={{
              padding: '5px 14px', borderRadius: 8, fontSize: '0.72rem', fontWeight: 700,
              border: `1.5px solid ${filterKey === p.key ? '#a855f7' : 'rgba(168,85,247,0.18)'}`,
              background: filterKey === p.key ? 'rgba(168,85,247,0.08)' : 'white',
              color: filterKey === p.key ? '#7c3aed' : '#9ca3af',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {p.title}
          </button>
        ))}
      </div>

      {/* Log list */}
      {loading ? (
        <Spinner />
      ) : !flatLogs.length ? (
        <div style={{ ...card, padding: 48, textAlign: 'center' }}>
          <GitCommit size={32} style={{ color: '#d1d5db', marginBottom: 10 }} />
          <p style={{ fontSize: '0.88rem', fontWeight: 700, color: '#374151', margin: '0 0 4px' }}>
            No version history yet
          </p>
          <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0 }}>
            Changes will appear here after a policy is edited and saved.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {flatLogs.map(log => (
            <LogEntry
              key={log.id}
              log={log}
              policyTitle={log._policyTitle}
            />
          ))}
        </div>
      )}
    </div>
  );
}