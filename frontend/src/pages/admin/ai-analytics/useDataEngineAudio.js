import { useRef, useState, useCallback, useEffect } from 'react';

/**
 * useDataEngineAudio
 *
 * Financial cyberpunk sound system for the Data Engine pages.
 *
 * Ambient: low-frequency market hum with subtle quantisation pulse —
 *   sounds like a trading server room, not a meditation app.
 *
 * Events are designed around financial data actions:
 *   playTick       — data cell / row hover (soft terminal tick)
 *   playUpload     — file dropped / accepted (ascending confirmation)
 *   playDiffStart  — diff computation begins (deep engine-start rumble)
 *   playMatch      — clean match found (quick, bright positive blip)
 *   playMismatch   — mismatch detected (low double-pulse warning)
 *   playExport     — export initiated (mechanical key-press + release)
 *   playSuccess    — session saved / wizard complete (rising chord)
 *   playError      — validation failure / API error (circuit-breaker trip)
 *   playDelete     — discard / cancel (downward sweep)
 */
export function useDataEngineAudio() {
    const ctx        = useRef(null);
    const gainNode   = useRef(null);
    const ambientRef = useRef(null);
    const [muted, setMuted] = useState(false);

    // ── Bootstrap audio context on first interaction ──────────────────────
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

    // ── Ambient: server-room market hum ──────────────────────────────────
    // Two sine oscillators slightly detuned (creates beating effect)
    // + slow LFO for the "system breathing" feel
    // + subtle quantisation click layer (0.5Hz)
    const startAmbient = useCallback(() => {
        if (ambientRef.current) return;
        const ac = getCtx();

        // Main hum pair (sub-bass, detuned for room-scale beating)
        const osc1 = ac.createOscillator();
        const osc2 = ac.createOscillator();
        osc1.type = 'sine'; osc1.frequency.value = 55;   // A1
        osc2.type = 'sine'; osc2.frequency.value = 57.5; // slightly sharp

        // Mid layer — tonal hum
        const osc3 = ac.createOscillator();
        osc3.type = 'triangle'; osc3.frequency.value = 110;

        // Slow amplitude LFO — "breathing"
        const lfo = ac.createOscillator();
        const lfoGain = ac.createGain();
        lfo.type = 'sine'; lfo.frequency.value = 0.06; // one breath per ~17s
        lfoGain.gain.value = 0.012;
        lfo.connect(lfoGain); lfoGain.connect(osc1.frequency);

        // Quantisation pulse (very subtle click at 2Hz)
        const pulseOsc  = ac.createOscillator();
        const pulseGain = ac.createGain();
        pulseOsc.type = 'square'; pulseOsc.frequency.value = 2;
        pulseGain.gain.value = 0;

        // Envelope the pulse so it clicks gently
        const pulseEnv = ac.createWaveShaper();
        pulseEnv.curve = (function() {
            const n = 256, c = new Float32Array(n);
            for (let i = 0; i < n; i++) c[i] = Math.pow(Math.abs((2 * i) / n - 1), 4) * 0.003;
            return c;
        })();
        pulseOsc.connect(pulseGain); pulseGain.connect(pulseEnv);

        // Ambience gain
        const ambGain = ac.createGain();
        ambGain.gain.value = muted ? 0 : 0.045;

        osc1.connect(ambGain); osc2.connect(ambGain); osc3.connect(ambGain);
        pulseEnv.connect(ambGain);
        ambGain.connect(gainNode.current);

        osc1.start(); osc2.start(); osc3.start(); lfo.start(); pulseOsc.start();

        ambientRef.current = { osc1, osc2, osc3, lfo, pulseOsc, ambGain };
    }, [getCtx, muted]);

    const stopAmbient = useCallback(() => {
        if (!ambientRef.current) return;
        const { osc1, osc2, osc3, lfo, pulseOsc } = ambientRef.current;
        try { osc1.stop(); osc2.stop(); osc3.stop(); lfo.stop(); pulseOsc.stop(); } catch {}
        ambientRef.current = null;
    }, []);

    // ── Hover / tick — quiet terminal click ──────────────────────────────
    const playTick = useCallback(() => {
        if (muted) return;
        const ac = getCtx();
        const osc = ac.createOscillator(); const gain = ac.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1800, ac.currentTime);
        osc.frequency.exponentialRampToValueAtTime(2400, ac.currentTime + 0.04);
        gain.gain.setValueAtTime(0.04, ac.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.06);
        osc.connect(gain); gain.connect(gainNode.current);
        osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.08);
    }, [getCtx, muted]);

    // Alias for compatibility with shared MuteButton onHover prop
    const playHover = playTick;

    // ── File upload accepted — ascending three-note confirmation ─────────
    const playUpload = useCallback(() => {
        if (muted) return;
        const ac = getCtx();
        [440, 554.37, 659.25].forEach((freq, i) => {  // A4 C#5 E5 (A major arp)
            const osc = ac.createOscillator(); const gain = ac.createGain();
            osc.type = 'triangle'; osc.frequency.value = freq;
            const t = ac.currentTime + i * 0.07;
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.07, t + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
            osc.connect(gain); gain.connect(gainNode.current);
            osc.start(t); osc.stop(t + 0.4);
        });
    }, [getCtx, muted]);

    // ── Diff engine start — deep mechanical rumble ────────────────────────
    const playDiffStart = useCallback(() => {
        if (muted) return;
        const ac = getCtx();

        // Low rumble sweep
        const osc = ac.createOscillator(); const gain = ac.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(60, ac.currentTime);
        osc.frequency.exponentialRampToValueAtTime(180, ac.currentTime + 0.4);
        osc.frequency.exponentialRampToValueAtTime(90, ac.currentTime + 0.8);
        gain.gain.setValueAtTime(0, ac.currentTime);
        gain.gain.linearRampToValueAtTime(0.1, ac.currentTime + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.9);
        osc.connect(gain); gain.connect(gainNode.current);
        osc.start(ac.currentTime); osc.stop(ac.currentTime + 1.0);

        // High-freq indicator blip after rumble
        setTimeout(() => {
            if (muted) return;
            const ac2 = getCtx();
            const o2 = ac2.createOscillator(); const g2 = ac2.createGain();
            o2.type = 'sine'; o2.frequency.value = 1200;
            g2.gain.setValueAtTime(0.05, ac2.currentTime);
            g2.gain.exponentialRampToValueAtTime(0.0001, ac2.currentTime + 0.12);
            o2.connect(g2); g2.connect(gainNode.current);
            o2.start(ac2.currentTime); o2.stop(ac2.currentTime + 0.15);
        }, 500);
    }, [getCtx, muted]);

    // ── Clean match — quick bright positive blip ──────────────────────────
    const playMatch = useCallback(() => {
        if (muted) return;
        const ac = getCtx();
        const osc = ac.createOscillator(); const gain = ac.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ac.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1100, ac.currentTime + 0.08);
        gain.gain.setValueAtTime(0.055, ac.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.15);
        osc.connect(gain); gain.connect(gainNode.current);
        osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.18);
    }, [getCtx, muted]);

    // ── Mismatch detected — low double-pulse warning (amber) ─────────────
    const playMismatch = useCallback(() => {
        if (muted) return;
        const ac = getCtx();
        [0, 0.12].forEach(delay => {
            const osc = ac.createOscillator(); const gain = ac.createGain();
            osc.type = 'square'; osc.frequency.value = 220;
            gain.gain.setValueAtTime(0.06, ac.currentTime + delay);
            gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + delay + 0.1);
            osc.connect(gain); gain.connect(gainNode.current);
            osc.start(ac.currentTime + delay); osc.stop(ac.currentTime + delay + 0.12);
        });
    }, [getCtx, muted]);

    // ── Export initiated — mechanical key-press + release ─────────────────
    const playExport = useCallback(() => {
        if (muted) return;
        const ac = getCtx();

        // Click-down
        const bufferSize = ac.sampleRate * 0.015;
        const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        }
        const source = ac.createBufferSource();
        const noiseGain = ac.createGain();
        source.buffer = buffer;
        noiseGain.gain.value = 0.12;
        source.connect(noiseGain); noiseGain.connect(gainNode.current);
        source.start(ac.currentTime);

        // Tone tail
        const osc = ac.createOscillator(); const gain = ac.createGain();
        osc.type = 'sine'; osc.frequency.value = 660;
        gain.gain.setValueAtTime(0.06, ac.currentTime + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.25);
        osc.connect(gain); gain.connect(gainNode.current);
        osc.start(ac.currentTime + 0.015); osc.stop(ac.currentTime + 0.28);
    }, [getCtx, muted]);

    // ── Session saved / wizard complete — rising major chord ─────────────
    const playSuccess = useCallback(() => {
        if (muted) return;
        const ac = getCtx();
        // C major spread voicing — C4 E4 G4 C5
        [261.63, 329.63, 392.00, 523.25].forEach((freq, i) => {
            const osc = ac.createOscillator(); const gain = ac.createGain();
            osc.type = 'sine'; osc.frequency.value = freq;
            const t = ac.currentTime + i * 0.055;
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.08, t + 0.04);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
            osc.connect(gain); gain.connect(gainNode.current);
            osc.start(t); osc.stop(t + 0.65);
        });
    }, [getCtx, muted]);

    // ── Error / validation fail — circuit-breaker trip ────────────────────
    // Three descending harsh pulses
    const playError = useCallback(() => {
        if (muted) return;
        const ac = getCtx();
        [0, 0.09, 0.18].forEach((delay, i) => {
            const osc = ac.createOscillator(); const gain = ac.createGain();
            osc.type = 'square';
            osc.frequency.value = 200 - i * 30;
            gain.gain.setValueAtTime(0.07, ac.currentTime + delay);
            gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + delay + 0.09);
            osc.connect(gain); gain.connect(gainNode.current);
            osc.start(ac.currentTime + delay); osc.stop(ac.currentTime + delay + 0.11);
        });
    }, [getCtx, muted]);

    // ── Discard / cancel — downward sweep ────────────────────────────────
    const playDelete = useCallback(() => {
        if (muted) return;
        const ac = getCtx();
        const osc = ac.createOscillator(); const gain = ac.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(440, ac.currentTime);
        osc.frequency.exponentialRampToValueAtTime(80, ac.currentTime + 0.35);
        gain.gain.setValueAtTime(0.08, ac.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.4);
        osc.connect(gain); gain.connect(gainNode.current);
        osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.45);
    }, [getCtx, muted]);

    // ── AI analysis kick-off — resonant synth swell ───────────────────────
    const playAnalyse = useCallback(() => {
        if (muted) return;
        const ac = getCtx();
        // Pad chord: Dm7 feel (D F A C)
        [146.83, 174.61, 220.00, 261.63].forEach((freq, i) => {
            const osc = ac.createOscillator(); const gain = ac.createGain();
            osc.type = 'sine'; osc.frequency.value = freq;
            const t = ac.currentTime + i * 0.04;
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.06, t + 0.15);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
            osc.connect(gain); gain.connect(gainNode.current);
            osc.start(t); osc.stop(t + 1.0);
        });
    }, [getCtx, muted]);

    // ── Toggle mute ───────────────────────────────────────────────────────
    const toggleMute = useCallback(() => {
        setMuted(m => {
            const next = !m;
            if (gainNode.current) gainNode.current.gain.value = next ? 0 : 0.15;
            if (ambientRef.current) ambientRef.current.ambGain.gain.value = next ? 0 : 0.045;
            return next;
        });
    }, []);

    useEffect(() => () => stopAmbient(), [stopAmbient]);

    return {
        // Lifecycle
        startAmbient,
        stopAmbient,
        muted,
        toggleMute,
        // Events
        playHover,       // alias for MuteButton / Breadcrumb onHover
        playTick,        // row hover, cell focus
        playUpload,      // file accepted
        playDiffStart,   // diff computation starts
        playMatch,       // clean match row
        playMismatch,    // mismatch row
        playExport,      // export button pressed
        playSuccess,     // session saved, wizard done
        playError,       // validation / API error
        playDelete,      // discard / cancel
        playAnalyse,     // AI analysis triggered
    };
}
