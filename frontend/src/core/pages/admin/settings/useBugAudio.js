import { useRef, useCallback, useState } from 'react';

/**
 * useBugAudio
 *
 * Lightweight audio hook for the bug/dev module.
 * No ambient drone — just clean clinical micro-sounds for interactions.
 * Respects a persistent muted state stored in localStorage.
 */
export function useBugAudio() {
    const ctx      = useRef(null);
    const gainNode = useRef(null);
    const [muted, setMuted] = useState(() => {
        try { return localStorage.getItem('bug-audio-muted') === 'true'; } catch { return false; }
    });

    const getCtx = useCallback(() => {
        if (!ctx.current) {
            ctx.current      = new (window.AudioContext || window.webkitAudioContext)();
            gainNode.current = ctx.current.createGain();
            gainNode.current.gain.value = muted ? 0 : 0.12;
            gainNode.current.connect(ctx.current.destination);
        }
        if (ctx.current.state === 'suspended') ctx.current.resume();
        return ctx.current;
    }, [muted]);

    // ── Subtle tick on hover / focus ──────────────────────────────────────────
    const playHover = useCallback(() => {
        if (muted) return;
        const ac   = getCtx();
        const osc  = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1100, ac.currentTime);
        osc.frequency.exponentialRampToValueAtTime(900, ac.currentTime + 0.04);
        gain.gain.setValueAtTime(0.03, ac.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.06);
        osc.connect(gain); gain.connect(gainNode.current);
        osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.07);
    }, [getCtx, muted]);

    // ── Sharp click on row select / button press ──────────────────────────────
    const playClick = useCallback(() => {
        if (muted) return;
        const ac   = getCtx();
        const osc  = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(400, ac.currentTime);
        osc.frequency.exponentialRampToValueAtTime(200, ac.currentTime + 0.05);
        gain.gain.setValueAtTime(0.04, ac.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.08);
        osc.connect(gain); gain.connect(gainNode.current);
        osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.1);
    }, [getCtx, muted]);

    // ── Clean two-tone confirm for save / status update ───────────────────────
    const playSuccess = useCallback(() => {
        if (muted) return;
        const ac = getCtx();
        [{ freq: 520, t: 0 }, { freq: 780, t: 0.07 }].forEach(({ freq, t }) => {
            const osc  = ac.createOscillator();
            const gain = ac.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0, ac.currentTime + t);
            gain.gain.linearRampToValueAtTime(0.07, ac.currentTime + t + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + t + 0.25);
            osc.connect(gain); gain.connect(gainNode.current);
            osc.start(ac.currentTime + t); osc.stop(ac.currentTime + t + 0.3);
        });
    }, [getCtx, muted]);

    // ── Low descending tone for error / failed ────────────────────────────────
    const playError = useCallback(() => {
        if (muted) return;
        const ac   = getCtx();
        const osc  = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(280, ac.currentTime);
        osc.frequency.exponentialRampToValueAtTime(120, ac.currentTime + 0.25);
        gain.gain.setValueAtTime(0.06, ac.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.3);
        osc.connect(gain); gain.connect(gainNode.current);
        osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.35);
    }, [getCtx, muted]);

    // ── Soft pop for modal open ───────────────────────────────────────────────
    const playOpen = useCallback(() => {
        if (muted) return;
        const ac   = getCtx();
        const osc  = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, ac.currentTime);
        osc.frequency.exponentialRampToValueAtTime(600, ac.currentTime + 0.08);
        gain.gain.setValueAtTime(0.05, ac.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.18);
        osc.connect(gain); gain.connect(gainNode.current);
        osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.2);
    }, [getCtx, muted]);

    // ── Soft reverse pop for modal close / delete ─────────────────────────────
    const playClose = useCallback(() => {
        if (muted) return;
        const ac   = getCtx();
        const osc  = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(500, ac.currentTime);
        osc.frequency.exponentialRampToValueAtTime(220, ac.currentTime + 0.1);
        gain.gain.setValueAtTime(0.05, ac.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.15);
        osc.connect(gain); gain.connect(gainNode.current);
        osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.18);
    }, [getCtx, muted]);

    // ── Subtle ping for key copy / clipboard ─────────────────────────────────
    const playPing = useCallback(() => {
        if (muted) return;
        const ac   = getCtx();
        const osc  = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = 'sine';
        osc.frequency.value = 1400;
        gain.gain.setValueAtTime(0.05, ac.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.3);
        osc.connect(gain); gain.connect(gainNode.current);
        osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.35);
    }, [getCtx, muted]);

    const toggleMute = useCallback(() => {
        setMuted(m => {
            const next = !m;
            try { localStorage.setItem('bug-audio-muted', String(next)); } catch {}
            if (gainNode.current) gainNode.current.gain.value = next ? 0 : 0.12;
            return next;
        });
    }, []);

    return { playHover, playClick, playSuccess, playError, playOpen, playClose, playPing, toggleMute, muted };
}