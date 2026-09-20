/**
 * Web Audio sound effects, vibration and the mute toggle.
 */

import { requestWakeLock } from './wakeLock.js';

const AudioCtxClass = window.AudioContext || window.webkitAudioContext;

let audioCtx = null;

let isMuted = false;

function renderSoundToggle() {
    const btn = document.getElementById('btn-sound-toggle');
    btn.textContent = isMuted ? '🔇' : '🔊';
    btn.setAttribute('aria-pressed', String(isMuted));
}

/** Restore the saved mute preference and unlock audio on the first user gesture. */
export function setupAudio() {
    try {
        isMuted = localStorage.getItem('spy_muted') === 'true';
    } catch(e){}
    renderSoundToggle();
    const unlockAudioEvents = ['pointerdown', 'touchstart', 'touchend', 'click', 'keydown'];
    const unlockHandler = () => {
        initAudio();
        requestWakeLock();
        unlockAudioEvents.forEach(evt => document.removeEventListener(evt, unlockHandler));
    };
    unlockAudioEvents.forEach(evt => document.addEventListener(evt, unlockHandler, { passive: true }));
}

function initAudio() {
    if (!audioCtx && AudioCtxClass) audioCtx = new AudioCtxClass();
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(()=>{});
    }
}

export function vibrate(pat) {
    if (navigator.vibrate) navigator.vibrate(pat);
}

let silentKeepAliveNode = null;

export function keepAudioAlive() {
    if (!audioCtx || isMuted || silentKeepAliveNode) return;
    try {
        if (audioCtx.createConstantSource) {
            const src = audioCtx.createConstantSource();
            const gain = audioCtx.createGain();
            gain.gain.value = 0.0001;
            src.connect(gain);
            gain.connect(audioCtx.destination);
            src.start();
            silentKeepAliveNode = { src, gain };
        }
    } catch(e){}
}

export function stopAudioKeepAlive() {
    if (silentKeepAliveNode) {
        try {
            silentKeepAliveNode.src.stop();
            silentKeepAliveNode.src.disconnect();
        } catch(e){}
        silentKeepAliveNode = null;
    }
}

export async function playTone(freq, dur, type='sine') {
    if (isMuted) return;
    initAudio();
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
        try { await audioCtx.resume(); } catch(e) { return; }
    }
    try {
        const osc = audioCtx.createOscillator(), g = audioCtx.createGain();
        osc.connect(g); g.connect(audioCtx.destination);
        osc.type = type; osc.frequency.value = freq;
        g.gain.setValueAtTime(0.12, audioCtx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
        osc.start(); osc.stop(audioCtx.currentTime + dur);
    } catch(e) {}
}

export async function playSiren() {
    vibrate([200, 100, 200]);
    if (isMuted) return;
    initAudio();
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
        try { await audioCtx.resume(); } catch(e) { return; }
    }
    try {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.connect(g); g.connect(audioCtx.destination); o.type = 'sawtooth';
        o.frequency.setValueAtTime(450, audioCtx.currentTime);
        o.frequency.linearRampToValueAtTime(850, audioCtx.currentTime + 0.25);
        o.frequency.linearRampToValueAtTime(450, audioCtx.currentTime + 0.5);
        g.gain.setValueAtTime(0.1, audioCtx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.55);
        o.start(); o.stop(audioCtx.currentTime + 0.55);
    } catch(e) {}
}

export function playVictoryFanfare() {
    vibrate([150, 100, 250]);
    if (isMuted) return;
    [523.25, 659.25, 783.99, 1046.50].forEach((f,i)=>setTimeout(()=>playTone(f, 0.25, 'triangle'), i*140));
}

export function playCardFlip() {
    vibrate(40);
    if (isMuted) return;
    playTone(400, 0.08, 'sine');
}

/** Flip the mute flag, persist it and give audible feedback when un-muting. */
export function toggleMute() {
    isMuted = !isMuted;
    try {
        localStorage.setItem('spy_muted', String(isMuted));
    } catch(e){}
    renderSoundToggle();
    if (!isMuted) playCardFlip();
}

/** Resume a context the browser suspended while the page was hidden. */
export function resumeAudioIfSuspended() {
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(()=>{});
}
