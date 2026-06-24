import { useRef, useState, useCallback, useEffect } from 'react';

// ── useDeliveryAudio ──────────────────────────────────────────────────────────
// Logistics-themed sound events — no ambient drone (not neural theme)
// Same hook shape as useAiPageAudio for consistency
// All sounds are subtle — designed not to annoy on repeated actions

export function useDeliveryAudio() {
    const ctx      = useRef(null);
    const gainNode = useRef(null);
    const [muted, setMuted] = useState(false);

    const getCtx = useCallback(() => {
        if (!ctx.current) {
            ctx.current      = new (window.AudioContext || window.webkitAudioContext)();
            gainNode.current = ctx.current.createGain();
            gainNode.current.gain.value = 0.15;
            gainNode.current.connect(ctx.current.destination);
        }
        if (ctx.current.state === 'suspended') ctx.current.resume();
        return ctx.current;
    }, []);

    // ── subtle tick on hover ──────────────────────────────────────────────────
    const playHover = useCallback(() => {
        if (muted) return;
        const ac = getCtx();
        const osc = ac.createOscillator(); const g = ac.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1000, ac.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, ac.currentTime + 0.04);
        g.gain.setValueAtTime(0.04, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.06);
        osc.connect(g); g.connect(gainNode.current);
        osc.start(); osc.stop(ac.currentTime + 0.07);
    }, [getCtx, muted]);

    // ── manifest dispatched — rising two-tone "departure" ────────────────────
    const playDispatch = useCallback(() => {
        if (muted) return;
        const ac = getCtx();
        [[440, 0], [660, 0.1]].forEach(([freq, delay]) => {
            const osc = ac.createOscillator(); const g = ac.createGain();
            osc.type = 'sine'; osc.frequency.value = freq;
            g.gain.setValueAtTime(0, ac.currentTime + delay);
            g.gain.linearRampToValueAtTime(0.09, ac.currentTime + delay + 0.05);
            g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + delay + 0.35);
            osc.connect(g); g.connect(gainNode.current);
            osc.start(ac.currentTime + delay); osc.stop(ac.currentTime + delay + 0.4);
        });
    }, [getCtx, muted]);

    // ── manifest completed — satisfying three-note arrival chime ─────────────
    const playComplete = useCallback(() => {
        if (muted) return;
        const ac = getCtx();
        [523.25, 659.25, 880].forEach((freq, i) => {
            const osc = ac.createOscillator(); const g = ac.createGain();
            osc.type = 'sine'; osc.frequency.value = freq;
            g.gain.setValueAtTime(0, ac.currentTime + i * 0.08);
            g.gain.linearRampToValueAtTime(0.09, ac.currentTime + i * 0.08 + 0.05);
            g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + i * 0.08 + 0.45);
            osc.connect(g); g.connect(gainNode.current);
            osc.start(ac.currentTime + i * 0.08); osc.stop(ac.currentTime + i * 0.08 + 0.5);
        });
    }, [getCtx, muted]);

    // ── stop marked delivered — short positive ping ───────────────────────────
    const playDeliver = useCallback(() => {
        if (muted) return;
        const ac = getCtx();
        const osc = ac.createOscillator(); const g = ac.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(700, ac.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1100, ac.currentTime + 0.12);
        g.gain.setValueAtTime(0.08, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.25);
        osc.connect(g); g.connect(gainNode.current);
        osc.start(); osc.stop(ac.currentTime + 0.28);
    }, [getCtx, muted]);

    // ── stop marked failed — low descending tone ──────────────────────────────
    const playFail = useCallback(() => {
        if (muted) return;
        const ac = getCtx();
        const osc = ac.createOscillator(); const g = ac.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, ac.currentTime);
        osc.frequency.exponentialRampToValueAtTime(180, ac.currentTime + 0.28);
        g.gain.setValueAtTime(0.08, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.32);
        osc.connect(g); g.connect(gainNode.current);
        osc.start(); osc.stop(ac.currentTime + 0.35);
    }, [getCtx, muted]);

    // ── incident filed — sharp warning pulse ─────────────────────────────────
    const playIncident = useCallback(() => {
        if (muted) return;
        const ac = getCtx();
        [0, 0.12].forEach(delay => {
            const osc = ac.createOscillator(); const g = ac.createGain();
            osc.type = 'square'; osc.frequency.value = 220;
            g.gain.setValueAtTime(0.07, ac.currentTime + delay);
            g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + delay + 0.1);
            osc.connect(g); g.connect(gainNode.current);
            osc.start(ac.currentTime + delay); osc.stop(ac.currentTime + delay + 0.12);
        });
    }, [getCtx, muted]);

    // ── PDF download triggered — brief "print" whoosh ────────────────────────
    const playDownload = useCallback(() => {
        if (muted) return;
        const ac = getCtx();
        const osc = ac.createOscillator(); const g = ac.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, ac.currentTime);
        osc.frequency.linearRampToValueAtTime(600, ac.currentTime + 0.18);
        g.gain.setValueAtTime(0.06, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.22);
        osc.connect(g); g.connect(gainNode.current);
        osc.start(); osc.stop(ac.currentTime + 0.25);
    }, [getCtx, muted]);

    // ── generic success ───────────────────────────────────────────────────────
    const playSuccess = useCallback(() => {
        if (muted) return;
        const ac = getCtx();
        const osc = ac.createOscillator(); const g = ac.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(550, ac.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1100, ac.currentTime + 0.14);
        g.gain.setValueAtTime(0.08, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.28);
        osc.connect(g); g.connect(gainNode.current);
        osc.start(); osc.stop(ac.currentTime + 0.3);
    }, [getCtx, muted]);

    // ── generic error ─────────────────────────────────────────────────────────
    const playError = useCallback(() => {
        if (muted) return;
        const ac = getCtx();
        [0, 0.1, 0.2].forEach(delay => {
            const osc = ac.createOscillator(); const g = ac.createGain();
            osc.type = 'square'; osc.frequency.value = 160;
            g.gain.setValueAtTime(0.06, ac.currentTime + delay);
            g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + delay + 0.08);
            osc.connect(g); g.connect(gainNode.current);
            osc.start(ac.currentTime + delay); osc.stop(ac.currentTime + delay + 0.1);
        });
    }, [getCtx, muted]);

    // ── GPS ping sound — very subtle tick (used during active trip) ───────────
    const playPing = useCallback(() => {
        if (muted) return;
        const ac = getCtx();
        const osc = ac.createOscillator(); const g = ac.createGain();
        osc.type = 'sine'; osc.frequency.value = 1400;
        g.gain.setValueAtTime(0.025, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.04);
        osc.connect(g); g.connect(gainNode.current);
        osc.start(); osc.stop(ac.currentTime + 0.05);
    }, [getCtx, muted]);

    // ── mute toggle ───────────────────────────────────────────────────────────
    const toggleMute = useCallback(() => {
        setMuted(m => {
            const next = !m;
            if (gainNode.current) gainNode.current.gain.value = next ? 0 : 0.15;
            return next;
        });
    }, []);

    // cleanup on unmount
    useEffect(() => {
        return () => {
            try { ctx.current?.close(); } catch {}
        };
    }, []);

    return {
        playHover,
        playDispatch,
        playComplete,
        playDeliver,
        playFail,
        playIncident,
        playDownload,
        playSuccess,
        playError,
        playPing,
        toggleMute,
        muted,
    };
}
