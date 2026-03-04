/**
 * useClapperFeedback Hook
 *
 * Professional cinema clapperboard (slate) feedback system.
 * Acts as the video counterpart to the Dark Room's camera shutter.
 *
 * Provides:
 * - Direct emotional feedback when "Action!" is triggered
 * - Visual "slate" transition
 * - Synthesized clapper sound (with file fallback)
 */

import React, { useCallback, useRef, useEffect, useState, useMemo, createElement } from "react";

// ============================================================================
// CONSTANTS
// ============================================================================

export const CLAPPER_FEEDBACK_CONFIG = {
    sound: {
        src: "/sounds/clapper.mp3",
        volume: 0.8,
        useSynthFallback: true,
    },
    slate: {
        duration: 200, // Duration of the clapper snap
        fadeOut: 300,
    },
    timing: {
        debounceMs: 1000,
    },
} as const;

// ============================================================================
// SYNTHESIZED CLAPPER SOUND
// Creates a mechanical "wood on wood" snap for the slate
// ============================================================================

function createSynthClapperSound(audioContext: AudioContext, volume: number = 0.8): void {
    const now = audioContext.currentTime;

    const masterGain = audioContext.createGain();
    masterGain.connect(audioContext.destination);
    masterGain.gain.setValueAtTime(volume, now);

    // Initial sharp transient (The "Clap")
    const transient = audioContext.createOscillator();
    transient.type = "sine";
    transient.frequency.setValueAtTime(1000, now);
    transient.frequency.exponentialRampToValueAtTime(100, now + 0.01);

    const transientGain = audioContext.createGain();
    transientGain.gain.setValueAtTime(1.0, now);
    transientGain.gain.exponentialRampToValueAtTime(0.001, now + 0.015);

    transient.connect(transientGain);
    transientGain.connect(masterGain);
    transient.start(now);
    transient.stop(now + 0.02);

    // Body resonance (Woody sound)
    const noiseBuffer = audioContext.createBuffer(1, audioContext.sampleRate * 0.1, audioContext.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseData.length; i++) {
        noiseData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (noiseData.length * 0.2));
    }

    const noiseSource = audioContext.createBufferSource();
    noiseSource.buffer = noiseBuffer;

    const bodyFilter = audioContext.createBiquadFilter();
    bodyFilter.type = "lowpass";
    bodyFilter.frequency.setValueAtTime(1200, now);
    bodyFilter.Q.setValueAtTime(1, now);

    const bodyGain = audioContext.createGain();
    bodyGain.gain.setValueAtTime(0.6, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    noiseSource.connect(bodyFilter);
    bodyFilter.connect(bodyGain);
    bodyGain.connect(masterGain);
    noiseSource.start(now);
    noiseSource.stop(now + 0.1);
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export interface ClapperFeedbackOptions {
    soundEnabled?: boolean;
    slateEnabled?: boolean;
    onComplete?: () => void;
}

export function useClapperFeedback(options: ClapperFeedbackOptions = {}) {
    const {
        soundEnabled = true,
        slateEnabled = true,
        onComplete,
    } = options;

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const lastTriggerRef = useRef<number>(0);
    const useSynthRef = useRef<boolean>(true);

    const [isAnimating, setIsAnimating] = useState(false);

    const getAudioContext = useCallback(() => {
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        return audioContextRef.current;
    }, []);

    const preload = useCallback(() => {
        if (audioRef.current || !soundEnabled) return;

        const audio = new Audio(CLAPPER_FEEDBACK_CONFIG.sound.src);
        audio.volume = CLAPPER_FEEDBACK_CONFIG.sound.volume;
        audio.preload = "auto";

        audio.addEventListener("canplaythrough", () => {
            useSynthRef.current = false;
        }, { once: true });

        audio.addEventListener("error", () => {
            useSynthRef.current = true;
        });

        audioRef.current = audio;
    }, [soundEnabled]);

    const trigger = useCallback(async () => {
        const now = Date.now();
        if (now - lastTriggerRef.current < CLAPPER_FEEDBACK_CONFIG.timing.debounceMs) return;
        lastTriggerRef.current = now;

        setIsAnimating(true);

        if (soundEnabled) {
            if (useSynthRef.current || CLAPPER_FEEDBACK_CONFIG.sound.useSynthFallback) {
                const ctx = getAudioContext();
                if (ctx.state === "suspended") await ctx.resume();
                createSynthClapperSound(ctx, CLAPPER_FEEDBACK_CONFIG.sound.volume);
            } else if (audioRef.current) {
                audioRef.current.currentTime = 0;
                audioRef.current.play().catch(() => {
                    // Fallback to synth if play fails
                    const ctx = getAudioContext();
                    createSynthClapperSound(ctx, CLAPPER_FEEDBACK_CONFIG.sound.volume);
                });
            }
        }

        setTimeout(() => {
            setIsAnimating(false);
            onComplete?.();
        }, CLAPPER_FEEDBACK_CONFIG.slate.duration + CLAPPER_FEEDBACK_CONFIG.slate.fadeOut);
    }, [soundEnabled, getAudioContext, onComplete]);

    const ClapperOverlay = useMemo(() => {
        return () => {
            if (!slateEnabled || !isAnimating) return null;
            return createElement("div", {
                className: "clapper-slate-overlay",
                "aria-hidden": "true",
            });
        };
    }, [slateEnabled, isAnimating]);

    return {
        trigger,
        preload,
        ClapperOverlay,
        isAnimating,
    };
}

export default useClapperFeedback;
