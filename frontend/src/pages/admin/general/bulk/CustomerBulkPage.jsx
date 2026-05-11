import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Upload, AlertCircle, CheckCircle, ArrowLeft, FileText, Rocket, X } from 'lucide-react';
import toast from 'react-hot-toast';
import GeneralLayout from '../../../../components/layout/GeneralLayout';
import { customersAPI } from '../../../../api';

const glowBorder = {
  border: '1px solid var(--accent, #7c3aed)',
  boxShadow: '0 0 8px rgba(124,58,237,0.35), inset 0 0 2px rgba(124,58,237,0.1)',
};

export default function CustomerBulkPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault(); e.stopPropagation(); setDragActive(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped && ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(dropped.type)) {
      setFile(dropped); setUploadResult(null);
    } else toast.error('Please upload a valid .csv or .xlsx file');
  }, []);

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (selected) { setFile(selected); setUploadResult(null); }
  };

  const downloadTemplate = async () => {
    try {
      const res = await customersAPI.downloadTemplate();
      const blob = new Blob([res.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'customers_template.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('Template downloaded');
    } catch (err) {
      console.error('Download failed:', err);
      if (err.response?.headers?.['content-type']?.includes('application/json')) {
        const errorText = await err.response.data.text();
        try {
          const errorJson = JSON.parse(errorText);
          toast.error(errorJson.message || 'Failed to download template');
        } catch {
          toast.error('Failed to download template');
        }
      } else {
        toast.error('Failed to download template');
      }
    }
  };

  const handleUpload = async () => {
    if (!file) return toast.error('Please select a file first');
    setUploading(true); setUploadResult(null);
    try {
      const formData = new FormData(); formData.append('file', file);
      await customersAPI.bulkImport(formData);
      setUploadResult({ success: true, message: 'Customers imported successfully!' });
      toast.success('Import complete'); setFile(null);
    } catch (err) {
      const errors = err.response?.data?.errors || [];
      setUploadResult({ success: false, message: err.response?.data?.message || 'Import failed', errors });
      toast.error(errors.length ? `${errors.length} validation errors` : 'Import failed');
    } finally { setUploading(false); }
  };

  return (
    <GeneralLayout>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 28px' }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 24 }}>
          <button
            onClick={() => navigate('/admin/settings/general')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'none', border: 'none', padding: 0,
              color: 'var(--text-muted)', cursor: 'pointer',
              fontSize: 13, fontWeight: 500, marginBottom: 8,
            }}
          >
            <ArrowLeft size={14} /> Back to General Settings
          </button>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#7c3aed', margin: 0 }}>
            Bulk Customer Import
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            Upload a CSV or Excel file to add or update customers in bulk
          </p>
        </div>

        {/* ── Template Download Card ── */}
        <div style={{
          background: 'var(--bg-secondary)',
          borderRadius: 10,
          padding: '16px 20px',
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          ...glowBorder,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: 'rgba(124,58,237,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <FileText size={18} color="var(--accent, #7c3aed)" />
            </div>
            <div>
              <strong style={{ fontSize: 14, color: '#7c3aed' }}>Need a template?</strong>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                Download a pre-formatted CSV with all required columns
              </p>
            </div>
          </div>
          <button
            onClick={downloadTemplate}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8, border: 'none',
              background: 'var(--accent, #7c3aed)', color: '#fff',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(124,58,237,0.3)',
            }}
          >
            <Download size={14} /> Download Template
          </button>
        </div>

        {/* ── Drag & Drop Zone ── */}
        <div
          onDragEnter={handleDrag} onDragLeave={handleDrag}
          onDragOver={handleDrag} onDrop={handleDrop}
          onClick={() => document.getElementById('file-input')?.click()}
          style={{
            border: `2px dashed ${dragActive ? 'var(--accent, #7c3aed)' : 'rgba(124,58,237,0.35)'}`,
            borderRadius: 12,
            padding: '40px 24px',
            textAlign: 'center',
            background: dragActive ? 'rgba(124,58,237,0.05)' : 'var(--bg-primary)',
            boxShadow: dragActive ? '0 0 16px rgba(124,58,237,0.2)' : '0 0 8px rgba(124,58,237,0.1)',
            transition: 'all 0.15s',
            cursor: 'pointer',
            marginBottom: 20,
          }}
        >
          <input id="file-input" type="file" accept=".csv,.xlsx,.xls" onChange={handleFileChange} style={{ display: 'none' }} />
          <div style={{
            width: 52, height: 52, borderRadius: 12,
            background: 'rgba(124,58,237,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <Upload size={24} color="var(--accent, #7c3aed)" />
          </div>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 6px' }}>
            {file ? file.name : 'Drag & drop your file here'}
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
            or click to browse • Max 5MB • .csv, .xlsx
          </p>
        </div>

        {/* ── File Selected Actions ── */}
        {file && (
          <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Selected: <strong style={{ color: 'var(--text-primary)' }}>{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)
            </span>
            <button
              onClick={handleUpload}
              disabled={uploading}
              style={{
                padding: '8px 20px', borderRadius: 8, border: 'none',
                background: uploading ? '#9ca3af' : 'var(--accent, #7c3aed)',
                color: '#fff', fontSize: 13, fontWeight: 600,
                cursor: uploading ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: uploading ? 'none' : '0 2px 8px rgba(124,58,237,0.3)',
              }}
            >
              <Rocket size={14} />
              {uploading ? 'Uploading…' : 'Start Import'}
            </button>
            <button
              onClick={() => { setFile(null); setUploadResult(null); }}
              style={{
                padding: '8px 14px', borderRadius: 8,
                background: 'transparent',
                fontSize: 12, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 5,
                color: 'var(--text-muted)',
                ...glowBorder,
              }}
            >
              <X size={12} /> Cancel
            </button>
          </div>
        )}

        {/* ── Upload Result ── */}
        {uploadResult && (
          <div style={{
            padding: '16px 20px', borderRadius: 10, marginBottom: 20,
            background: uploadResult.success ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${uploadResult.success ? '#22c55e' : '#ef4444'}`,
            boxShadow: uploadResult.success
              ? '0 0 8px rgba(34,197,94,0.15)'
              : '0 0 8px rgba(239,68,68,0.15)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: uploadResult.errors?.length ? 10 : 0 }}>
              {uploadResult.success
                ? <CheckCircle size={18} color="#22c55e" />
                : <AlertCircle size={18} color="#ef4444" />}
              <strong style={{ fontSize: 14, color: uploadResult.success ? '#166534' : '#991b1b' }}>
                {uploadResult.message}
              </strong>
            </div>
            {uploadResult.errors?.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: '#991b1b' }}>
                {uploadResult.errors.slice(0, 5).map((err, i) => (
                  <li key={i}>{typeof err === 'string' ? err : JSON.stringify(err)}</li>
                ))}
                {uploadResult.errors.length > 5 && (
                  <li style={{ fontStyle: 'italic' }}>+ {uploadResult.errors.length - 5} more errors</li>
                )}
              </ul>
            )}
          </div>
        )}

        {/* ── Tips ── */}
        <div style={{
          borderRadius: 10, padding: '16px 20px',
          background: 'var(--bg-secondary)',
          ...glowBorder,
        }}>
          <strong style={{ fontSize: 13, color: '#7c3aed' }}>Tips</strong>
          <ul style={{ margin: '10px 0 0', paddingLeft: 20, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.8 }}>
            <li><strong>email</strong> is required and must be unique</li>
            <li>Use <code>customer_type</code>: <code>individual</code>, <code>business</code>, <code>wholesale</code>, or <code>contractor</code></li>
            <li>Use <code>tier</code>: <code>bronze</code>, <code>silver</code>, <code>gold</code>, or <code>platinum</code></li>
            <li>JSON fields (<code>tags</code>, <code>preferences</code>) should be valid JSON arrays e.g. <code>["priority","wholesale"]</code></li>
            <li>Existing customers (by email) will be updated; new ones will be created</li>
          </ul>
        </div>

      </div>
    </GeneralLayout>
  );
}