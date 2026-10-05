/**
 * Synthesizes aerodynamic wind tunnel audio (subtle wind rush + supersonic roar + stall rumble)
 */
class WindTunnelAudioEngine {
  private ctx: AudioContext | null = null;
  private noiseNode: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private rumbleNode: BiquadFilterNode | null = null;
  private isRunning = false;

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public start() {
    if (this.isRunning) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      // 4-second pink-like noise buffer
      const bufferSize = this.ctx.sampleRate * 3;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.04;
        b6 = white * 0.115926;
      }

      this.noiseNode = this.ctx.createBufferSource();
      this.noiseNode.buffer = buffer;
      this.noiseNode.loop = true;

      // Primary aerodynamic whoosh filter
      this.filterNode = this.ctx.createBiquadFilter();
      this.filterNode.type = 'lowpass';
      this.filterNode.frequency.value = 450;

      // Low stall rumble filter
      this.rumbleNode = this.ctx.createBiquadFilter();
      this.rumbleNode.type = 'peaking';
      this.rumbleNode.frequency.value = 85;
      this.rumbleNode.gain.value = 0;

      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.value = 0.06;

      this.noiseNode.connect(this.filterNode);
      this.filterNode.connect(this.rumbleNode);
      this.rumbleNode.connect(this.gainNode);
      this.gainNode.connect(this.ctx.destination);

      this.noiseNode.start();
      this.isRunning = true;
    } catch {
      // Audio playback restrictions handled gracefully
    }
  }

  public update(airspeedKts: number, mach: number, isStalled: boolean) {
    if (!this.isRunning || !this.filterNode || !this.gainNode || !this.rumbleNode || !this.ctx) return;

    const targetFreq = Math.min(2400, 250 + (airspeedKts / 600) * 800 + (mach > 1 ? (mach - 1) * 600 : 0));
    const targetGain = Math.min(0.18, 0.03 + (airspeedKts / 800) * 0.09 + (mach > 1 ? 0.04 : 0));
    const targetRumble = isStalled ? 14 : 0;

    const now = this.ctx.currentTime;
    this.filterNode.frequency.setTargetAtTime(targetFreq, now, 0.1);
    this.gainNode.gain.setTargetAtTime(targetGain, now, 0.1);
    this.rumbleNode.gain.setTargetAtTime(targetRumble, now, 0.1);
  }

  public stop() {
    if (!this.isRunning) return;
    try {
      if (this.gainNode && this.ctx) {
        this.gainNode.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      }
      setTimeout(() => {
        if (this.noiseNode) {
          this.noiseNode.stop();
          this.noiseNode.disconnect();
          this.noiseNode = null;
        }
        this.isRunning = false;
      }, 60);
    } catch {
      this.isRunning = false;
    }
  }
}

export const windTunnelAudio = new WindTunnelAudioEngine();
