import { useRef, useState, useCallback, useEffect } from 'react';

export function useAiPageAudio() {
    const ctx        = useRef(null);
    const gainNode   = useRef(null);
    const ambientRef = useRef(null);
    const [muted, setMuted] = useState(false);

    const getCtx = useCallback(() => {
        if (!ctx.current) {
            ctx.current      = new (window.AudioContext || window.webkitAudioContext)();
            gainNode.current = ctx.current.createGain();
            gainNode.current.gain.value = muted ? 0 : 0.15;
            gainNode.current.connect(ctx.current.destination);
        }
        if (ctx.current.state === 'suspended') ctx.current.resume();
        return ctx.current;
    }, [muted]);

    const startAmbient = useCallback(() => {
        if (ambientRef.current) return;
        const ac = getCtx();
        const osc1 = ac.createOscillator();
        const osc2 = ac.createOscillator();
        const lfo  = ac.createOscillator();
        const lfoGain = ac.createGain();
        const ambGain = ac.createGain();
        osc1.type = 'sine'; osc1.frequency.value = 60;
        osc2.type = 'sine'; osc2.frequency.value = 63.5;
        lfo.type  = 'sine'; lfo.frequency.value  = 0.08;
        lfoGain.gain.value = 4;
        ambGain.gain.value = muted ? 0 : 0.04;
        lfo.connect(lfoGain); lfoGain.connect(osc1.frequency);
        osc1.connect(ambGain); osc2.connect(ambGain);
        ambGain.connect(gainNode.current);
        osc1.start(); osc2.start(); lfo.start();
        ambientRef.current = { osc1, osc2, lfo, ambGain };
    }, [getCtx, muted]);

    const stopAmbient = useCallback(() => {
        if (!ambientRef.current) return;
        const { osc1, osc2, lfo } = ambientRef.current;
        try { osc1.stop(); osc2.stop(); lfo.stop(); } catch {}
        ambientRef.current = null;
    }, []);

    const playHover = useCallback(() => {
        if (muted) return;
        const ac = getCtx();
        const osc = ac.createOscillator(); const gain = ac.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ac.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, ac.currentTime + 0.06);
        gain.gain.setValueAtTime(0.05, ac.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.08);
        osc.connect(gain); gain.connect(gainNode.current);
        osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.1);
    }, [getCtx, muted]);

    const playActivate = useCallback(() => {
        if (muted) return;
        const ac = getCtx();
        [523.25, 659.25, 783.99].forEach((freq, i) => {
            const osc = ac.createOscillator(); const gain = ac.createGain();
            osc.type = 'sine'; osc.frequency.value = freq;
            gain.gain.setValueAtTime(0, ac.currentTime + i * 0.06);
            gain.gain.linearRampToValueAtTime(0.08, ac.currentTime + i * 0.06 + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + i * 0.06 + 0.4);
            osc.connect(gain); gain.connect(gainNode.current);
            osc.start(ac.currentTime + i * 0.06); osc.stop(ac.currentTime + i * 0.06 + 0.5);
        });
    }, [getCtx, muted]);

    const playDelete = useCallback(() => {
        if (muted) return;
        const ac = getCtx();
        const osc = ac.createOscillator(); const gain = ac.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, ac.currentTime);
        osc.frequency.exponentialRampToValueAtTime(80, ac.currentTime + 0.3);
        gain.gain.setValueAtTime(0.08, ac.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.35);
        osc.connect(gain); gain.connect(gainNode.current);
        osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.4);
    }, [getCtx, muted]);

    const playError = useCallback(() => {
        if (muted) return;
        const ac = getCtx();
        [0, 0.1, 0.2].forEach(delay => {
            const osc = ac.createOscillator(); const gain = ac.createGain();
            osc.type = 'square'; osc.frequency.value = 160;
            gain.gain.setValueAtTime(0.06, ac.currentTime + delay);
            gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + delay + 0.08);
            osc.connect(gain); gain.connect(gainNode.current);
            osc.start(ac.currentTime + delay); osc.stop(ac.currentTime + delay + 0.1);
        });
    }, [getCtx, muted]);

    const playSuccess = useCallback(() => {
        if (muted) return;
        const ac = getCtx();
        const osc = ac.createOscillator(); const gain = ac.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, ac.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1400, ac.currentTime + 0.15);
        gain.gain.setValueAtTime(0.08, ac.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.3);
        osc.connect(gain); gain.connect(gainNode.current);
        osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.35);
    }, [getCtx, muted]);

    const toggleMute = useCallback(() => {
        setMuted(m => {
            const next = !m;
            if (gainNode.current) gainNode.current.gain.value = next ? 0 : 0.15;
            if (ambientRef.current) ambientRef.current.ambGain.gain.value = next ? 0 : 0.04;
            return next;
        });
    }, []);

    useEffect(() => () => stopAmbient(), [stopAmbient]);

    return { startAmbient, stopAmbient, playHover, playActivate, playDelete, playError, playSuccess, toggleMute, muted };
}