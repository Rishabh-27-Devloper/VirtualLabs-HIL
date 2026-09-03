// ============================================================
// VirtualLab-HIL — Web Audio API Sound Engine for Speakers
// ============================================================

interface SpeakerAudioNode {
  oscillator: OscillatorNode;
  gainNode: GainNode;
  lastVoltage: number;
  lastTime: number;
  zeroCrossings: number[];
  frequency: number;
  amplitude: number;
}

class AudioService {
  private ctx: AudioContext | null = null;
  private masterCompressor: DynamicsCompressorNode | null = null;
  private speakers: Map<string, SpeakerAudioNode> = new Map();
  private isMuted: boolean = false;

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        // Master dynamics compressor to act as a soft limiter (protect ears)
        this.masterCompressor = this.ctx.createDynamicsCompressor();
        this.masterCompressor.threshold.setValueAtTime(-18, this.ctx.currentTime);
        this.masterCompressor.knee.setValueAtTime(12, this.ctx.currentTime);
        this.masterCompressor.ratio.setValueAtTime(12, this.ctx.currentTime);
        this.masterCompressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
        this.masterCompressor.release.setValueAtTime(0.15, this.ctx.currentTime);
        this.masterCompressor.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public updateSpeaker(
    speakerId: string,
    vDiff: number,
    simTime: number,
    volumePercent: number = 50,
    isMuted: boolean = false
  ) {
    if (isMuted || this.isMuted) {
      this.silenceSpeaker(speakerId);
      return;
    }

    this.initContext();
    if (!this.ctx || !this.masterCompressor) return;

    let node = this.speakers.get(speakerId);
    if (!node) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, this.ctx.currentTime);
      gain.gain.setValueAtTime(0, this.ctx.currentTime);
      osc.connect(gain);
      gain.connect(this.masterCompressor);
      osc.start();

      node = {
        oscillator: osc,
        gainNode: gain,
        lastVoltage: vDiff,
        lastTime: simTime,
        zeroCrossings: [],
        frequency: 0,
        amplitude: 0,
      };
      this.speakers.set(speakerId, node);
    }

    // Detect frequency from zero-crossings
    const prevV = node.lastVoltage;
    if ((prevV <= 0 && vDiff > 0) || (prevV >= 0 && vDiff < 0)) {
      node.zeroCrossings.push(simTime);
      if (node.zeroCrossings.length > 8) {
        node.zeroCrossings.shift();
      }
      if (node.zeroCrossings.length >= 4) {
        const span = node.zeroCrossings[node.zeroCrossings.length - 1] - node.zeroCrossings[0];
        const cycles = (node.zeroCrossings.length - 1) / 2;
        if (span > 0 && cycles > 0) {
          const rawFreq = cycles / span;
          if (rawFreq >= 20 && rawFreq <= 15000) {
            node.frequency = rawFreq;
          }
        }
      }
    }

    node.lastVoltage = vDiff;
    node.lastTime = simTime;
    const absV = Math.abs(vDiff);
    node.amplitude = Math.max(node.amplitude * 0.9, absV);

    const now = this.ctx.currentTime;
    if (node.frequency >= 20 && node.frequency <= 15000 && node.amplitude > 0.05) {
      node.oscillator.frequency.setTargetAtTime(node.frequency, now, 0.02);
      // Volume scaling: max 0.3 for safety
      const safeVolume = Math.min(Math.max(volumePercent / 100, 0), 1) * 0.25;
      const targetGain = Math.min(node.amplitude / 5.0, 1.0) * safeVolume;
      node.gainNode.gain.setTargetAtTime(targetGain, now, 0.02);
    } else {
      node.gainNode.gain.setTargetAtTime(0, now, 0.05);
    }
  }

  public silenceSpeaker(speakerId: string) {
    const node = this.speakers.get(speakerId);
    if (node && this.ctx) {
      node.gainNode.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
      node.zeroCrossings = [];
      node.frequency = 0;
      node.amplitude = 0;
    }
  }

  public removeSpeaker(speakerId: string) {
    const node = this.speakers.get(speakerId);
    if (node) {
      try {
        node.oscillator.stop();
        node.oscillator.disconnect();
        node.gainNode.disconnect();
      } catch {}
      this.speakers.delete(speakerId);
    }
  }

  public stopAll() {
    this.speakers.forEach((node) => {
      try {
        node.gainNode.gain.setValueAtTime(0, this.ctx?.currentTime ?? 0);
        node.oscillator.stop();
        node.oscillator.disconnect();
        node.gainNode.disconnect();
      } catch {}
    });
    this.speakers.clear();
  }

  public setGlobalMute(muted: boolean) {
    this.isMuted = muted;
    if (muted) {
      this.speakers.forEach((node) => {
        if (this.ctx) node.gainNode.gain.setTargetAtTime(0, this.ctx.currentTime, 0.01);
      });
    }
  }
}

export const audioService = new AudioService();
