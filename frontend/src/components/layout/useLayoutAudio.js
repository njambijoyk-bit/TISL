import { useRef, useCallback, useState } from 'react';

/**
 * useLayoutAudio
 *
 * Shared audio hook for layout shell components:
 * Header, Sidebar, GeneralLayout, SettingsLayout.
 *
 * Sound vocabulary:
 *  playHover      — subtle tick on any button/link hover
 *  playNav        — clean click when navigating to a route
 *  playCollapse   — sidebar/panel collapsing (swoosh down)
 *  playExpand     — sidebar/panel expanding (swoosh up)
 *  playFlyoutOpen — mega-menu / dropdown opening
 *  playFlyoutClose— mega-menu / dropdown closing
 *  playMenuToggle — mobile hamburger open/close
 *  playLogoutOpen — logout confirmation modal appears
 *  playLogoutConfirm — destructive confirm (low descending tone)
 *  playLogoutCancel  — soft dismiss
 *  playIconAction — cart / wishlist / search icon press
 *
 * Mute state persists in localStorage under 'layout-audio-muted'.
 */
export function useLayoutAudio() {
    const ctx      = useRef(null);
    const gainNode = useRef(null);

    const [muted, setMuted] = useState(() => {
        try { return localStorage.getItem('layout-audio-muted') === 'true'; } catch { return false; }
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

    // ── helpers ───────────────────────────────────────────────────────────────
    const tone = useCallback((opts) => {
        if (muted) return;
        const ac  = getCtx();
        const osc = ac.createOscillator();
        const g   = ac.createGain();
        osc.type = opts.type ?? 'sine';
        if (opts.freq)       osc.frequency.setValueAtTime(opts.freq, ac.currentTime);
        if (opts.freqEnd)    osc.frequency.exponentialRampToValueAtTime(opts.freqEnd, ac.currentTime + (opts.dur ?? 0.1));
        g.gain.setValueAtTime(opts.vol ?? 0.04, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + (opts.dur ?? 0.1));
        osc.connect(g); g.connect(gainNode.current);
        osc.start(ac.currentTime);
        osc.stop(ac.currentTime + (opts.dur ?? 0.1) + 0.01);
    }, [getCtx, muted]);

    // ── Subtle tick — hover / focus ───────────────────────────────────────────
    const playHover = useCallback(() => {
        tone({ freq: 1100, freqEnd: 900, vol: 0.025, dur: 0.06 });
    }, [tone]);

    // ── Clean click — nav link / route change ─────────────────────────────────
    const playNav = useCallback(() => {
        tone({ type: 'square', freq: 440, freqEnd: 260, vol: 0.035, dur: 0.07 });
    }, [tone]);

    // ── Sidebar collapse — short downward sweep ───────────────────────────────
    const playCollapse = useCallback(() => {
        tone({ type: 'sine', freq: 600, freqEnd: 320, vol: 0.05, dur: 0.12 });
    }, [tone]);

    // ── Sidebar expand — short upward sweep ──────────────────────────────────
    const playExpand = useCallback(() => {
        tone({ type: 'sine', freq: 320, freqEnd: 620, vol: 0.05, dur: 0.12 });
    }, [tone]);

    // ── Flyout / dropdown open — airy pop ────────────────────────────────────
    const playFlyoutOpen = useCallback(() => {
        tone({ type: 'sine', freq: 280, freqEnd: 560, vol: 0.04, dur: 0.1 });
    }, [tone]);

    // ── Flyout / dropdown close — reverse pop ────────────────────────────────
    const playFlyoutClose = useCallback(() => {
        tone({ type: 'sine', freq: 480, freqEnd: 240, vol: 0.035, dur: 0.09 });
    }, [tone]);

    // ── Mobile menu toggle — heavier thud ────────────────────────────────────
    const playMenuToggle = useCallback(() => {
        tone({ type: 'triangle', freq: 220, freqEnd: 160, vol: 0.06, dur: 0.14 });
    }, [tone]);

    // ── Logout modal open — neutral alert ────────────────────────────────────
    const playLogoutOpen = useCallback(() => {
        if (muted) return;
        const ac = getCtx();
        [{ freq: 440, t: 0 }, { freq: 360, t: 0.07 }].forEach(({ freq, t }) => {
            const osc = ac.createOscillator();
            const g   = ac.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            g.gain.setValueAtTime(0, ac.currentTime + t);
            g.gain.linearRampToValueAtTime(0.05, ac.currentTime + t + 0.03);
            g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + t + 0.2);
            osc.connect(g); g.connect(gainNode.current);
            osc.start(ac.currentTime + t);
            osc.stop(ac.currentTime + t + 0.25);
        });
    }, [getCtx, muted]);

    // ── Logout confirm — low descending sawtooth (destructive) ───────────────
    const playLogoutConfirm = useCallback(() => {
        tone({ type: 'sawtooth', freq: 260, freqEnd: 110, vol: 0.06, dur: 0.28 });
    }, [tone]);

    // ── Logout cancel — soft dismissal ───────────────────────────────────────
    const playLogoutCancel = useCallback(() => {
        tone({ type: 'sine', freq: 520, freqEnd: 420, vol: 0.04, dur: 0.1 });
    }, [tone]);

    // ── Icon action — cart / wishlist / search press ──────────────────────────
    const playIconAction = useCallback(() => {
        tone({ type: 'sine', freq: 900, freqEnd: 1200, vol: 0.04, dur: 0.08 });
    }, [tone]);

    // ── Toggle mute ───────────────────────────────────────────────────────────
    const toggleMute = useCallback(() => {
        setMuted(m => {
            const next = !m;
            try { localStorage.setItem('layout-audio-muted', String(next)); } catch {}
            if (gainNode.current) gainNode.current.gain.value = next ? 0 : 0.12;
            return next;
        });
    }, []);

    return {
        playHover,
        playNav,
        playCollapse,
        playExpand,
        playFlyoutOpen,
        playFlyoutClose,
        playMenuToggle,
        playLogoutOpen,
        playLogoutConfirm,
        playLogoutCancel,
        playIconAction,
        toggleMute,
        muted,
    };
}