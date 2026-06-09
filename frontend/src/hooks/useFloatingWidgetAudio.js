import { useRef, useCallback, useState } from 'react';

/**
 * useFloatingWidgetAudio
 *
 * Shared audio hook for floating/draggable edge-anchored widgets:
 *   - BookmarkNote      (soft, personal, customer-facing)
 *   - AlgorithmBanner   (celebratory, motivational)
 *   - FloatingMemoModal (clinical, financial, admin)
 *
 * Each component picks only the sounds that fit its context.
 *
 * Sound vocabulary:
 *   playHover        — subtle tick on pill / button hover
 *   playExpand       — widget opening / expanding from edge
 *   playCollapse     — widget collapsing back to pill
 *   playDragStart    — soft thud when user grabs to drag
 *   playFieldFocus   — gentle chime when a textarea/input gains focus
 *   playToggle       — direction toggle / mode switch (e.g. IN vs OUT)
 *   playSelect       — dropdown / subject selection confirmed
 *   playSave         — soft confirm for "save now" / sync success
 *   playSubmit       — stronger confirm for final form submit
 *   playDelete       — clear / reset / dismiss action
 *   playError        — sync error / validation failure
 *   playCta          — customer-facing CTA button (banner action)
 *   playSegmentReveal— celebratory reveal when segment badge appears
 *   playCharWarn     — subtle alarm when char count enters warning zone
 *
 * Mute state persists in localStorage under 'floating-widget-audio-muted'.
 */
export function useFloatingWidgetAudio() {
    const ctx      = useRef(null);
    const gainNode = useRef(null);

    const [muted, setMuted] = useState(() => {
        try { return localStorage.getItem('floating-widget-audio-muted') === 'true'; } catch { return false; }
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

    // ── internal tone builder ─────────────────────────────────────────────────
    const tone = useCallback((opts) => {
        if (muted) return;
        const ac  = getCtx();
        const osc = ac.createOscillator();
        const g   = ac.createGain();
        osc.type = opts.type ?? 'sine';
        if (opts.freq)    osc.frequency.setValueAtTime(opts.freq, ac.currentTime + (opts.delay ?? 0));
        if (opts.freqEnd) osc.frequency.exponentialRampToValueAtTime(opts.freqEnd, ac.currentTime + (opts.delay ?? 0) + (opts.dur ?? 0.1));
        g.gain.setValueAtTime(0.0001, ac.currentTime + (opts.delay ?? 0));
        g.gain.linearRampToValueAtTime(opts.vol ?? 0.05, ac.currentTime + (opts.delay ?? 0) + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + (opts.delay ?? 0) + (opts.dur ?? 0.1));
        osc.connect(g); g.connect(gainNode.current);
        osc.start(ac.currentTime + (opts.delay ?? 0));
        osc.stop(ac.currentTime + (opts.delay ?? 0) + (opts.dur ?? 0.1) + 0.02);
    }, [getCtx, muted]);

    // ── Subtle tick — pill / button hover ─────────────────────────────────────
    const playHover = useCallback(() => {
        tone({ freq: 1100, freqEnd: 960, vol: 0.025, dur: 0.055 });
    }, [tone]);

    // ── Upward pop — widget expanding from edge ───────────────────────────────
    const playExpand = useCallback(() => {
        tone({ type: 'sine', freq: 280, freqEnd: 560, vol: 0.055, dur: 0.13 });
    }, [tone]);

    // ── Downward pop — widget collapsing to pill ──────────────────────────────
    const playCollapse = useCallback(() => {
        tone({ type: 'sine', freq: 520, freqEnd: 260, vol: 0.05, dur: 0.12 });
    }, [tone]);

    // ── Soft thud — drag grab ─────────────────────────────────────────────────
    const playDragStart = useCallback(() => {
        tone({ type: 'triangle', freq: 180, freqEnd: 120, vol: 0.06, dur: 0.1 });
    }, [tone]);

    // ── Gentle chime — input / textarea focus ─────────────────────────────────
    const playFieldFocus = useCallback(() => {
        tone({ type: 'sine', freq: 740, freqEnd: 880, vol: 0.03, dur: 0.1 });
    }, [tone]);

    // ── Clean click — direction toggle / mode switch ──────────────────────────
    const playToggle = useCallback(() => {
        tone({ type: 'square', freq: 380, freqEnd: 480, vol: 0.035, dur: 0.07 });
    }, [tone]);

    // ── Soft confirm — dropdown / subject selection ───────────────────────────
    const playSelect = useCallback(() => {
        tone({ type: 'sine', freq: 620, freqEnd: 780, vol: 0.04, dur: 0.09 });
    }, [tone]);

    // ── Two-tone confirm — save now / auto-sync success ───────────────────────
    const playSave = useCallback(() => {
        if (muted) return;
        [{ freq: 480, freqEnd: 580, delay: 0 }, { freq: 580, freqEnd: 720, delay: 0.08 }].forEach(o =>
            tone({ type: 'sine', ...o, vol: 0.055, dur: 0.18 })
        );
    }, [tone, muted]);

    // ── Three-tone ascending — final form submit ──────────────────────────────
    const playSubmit = useCallback(() => {
        if (muted) return;
        [
            { freq: 520, freqEnd: 580, delay: 0    },
            { freq: 660, freqEnd: 740, delay: 0.08 },
            { freq: 780, freqEnd: 900, delay: 0.16 },
        ].forEach(o => tone({ type: 'sine', ...o, vol: 0.065, dur: 0.22 }));
    }, [tone, muted]);

    // ── Low descending — clear / reset / dismiss ──────────────────────────────
    const playDelete = useCallback(() => {
        tone({ type: 'sawtooth', freq: 260, freqEnd: 110, vol: 0.055, dur: 0.22 });
    }, [tone]);

    // ── Triple buzz — error / sync failure ────────────────────────────────────
    const playError = useCallback(() => {
        if (muted) return;
        [0, 0.1, 0.2].forEach(delay =>
            tone({ type: 'square', freq: 160, vol: 0.055, dur: 0.07, delay })
        );
    }, [tone, muted]);

    // ── Energetic upward sweep — customer CTA click ───────────────────────────
    const playCta = useCallback(() => {
        tone({ type: 'sine', freq: 440, freqEnd: 1100, vol: 0.06, dur: 0.18 });
    }, [tone]);

    // ── Celebratory chord — segment badge reveal ──────────────────────────────
    const playSegmentReveal = useCallback(() => {
        if (muted) return;
        [
            { freq: 523.25, delay: 0    },
            { freq: 659.25, delay: 0.07 },
            { freq: 783.99, delay: 0.14 },
            { freq: 1046.5, delay: 0.21 },
        ].forEach(({ freq, delay }) =>
            tone({ type: 'sine', freq, freqEnd: freq * 1.02, vol: 0.06, dur: 0.35, delay })
        );
    }, [tone, muted]);

    // ── Subtle rising alarm — char count entering warn/crit zone ─────────────
    const playCharWarn = useCallback(() => {
        tone({ type: 'sine', freq: 880, freqEnd: 1100, vol: 0.04, dur: 0.12 });
    }, [tone]);

    // ── Toggle mute ───────────────────────────────────────────────────────────
    const toggleMute = useCallback(() => {
        setMuted(m => {
            const next = !m;
            try { localStorage.setItem('floating-widget-audio-muted', String(next)); } catch {}
            if (gainNode.current) gainNode.current.gain.value = next ? 0 : 0.12;
            return next;
        });
    }, []);

    return {
        playHover,
        playExpand,
        playCollapse,
        playDragStart,
        playFieldFocus,
        playToggle,
        playSelect,
        playSave,
        playSubmit,
        playDelete,
        playError,
        playCta,
        playSegmentReveal,
        playCharWarn,
        toggleMute,
        muted,
    };
}