// RNNoise WASM wrapper (MIT, WONG Tin Chi Timothy); optional speech gating.
// Speech probability is not a cough classifier. Processing stays on the audio thread.
let ycRnExports, ycRnMemory;
class YcRnnoiseProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super(options);
    if (!ycRnExports) {
      ycRnExports = new WebAssembly.Instance(options.processorOptions.module).exports;
      ycRnMemory = new Float32Array(ycRnExports.memory.buffer);
    }
    this.state = ycRnExports.newState();
    this.alive = true;
    this.focus = 'off';
    this.confirm = 0; this.hold = 0; this.open = false; this.gain = 0;
    this.delay = new Float32Array(Math.round(sampleRate * .06));
    this.pointer = 0; this.report = 0;
    this.port.onmessage = ({data}) => {
      if (!this.alive) return;
      if (data === false) {
        this.alive = false; ycRnExports.deleteState(this.state); return;
      }
      if (data?.type === 'voice-focus') {
        this.focus = ['balanced','strict'].includes(data.mode) ? data.mode : 'off';
        this.confirm = 0; this.hold = 0; this.open = false; this.gain = 0;
        this.delay.fill(0); this.pointer = 0;
      } else this.port.postMessage({vadProb:ycRnExports.getVadProb(this.state),focus:this.focus,speechOpen:this.open});
    };
  }
  process(inputs, outputs) {
    if (!this.alive) return false;
    const output = outputs[0]?.[0]; if (!output) return true;
    const input = inputs[0]?.[0], offset = ycRnExports.getInput(this.state) / 4;
    if (input) ycRnMemory.set(input, offset); else ycRnMemory.fill(0, offset, offset + output.length);
    const ptr = ycRnExports.pipe(this.state, output.length) / 4;
    if (ptr) output.set(ycRnMemory.subarray(ptr, ptr + output.length)); else output.fill(0);
    const probability = ycRnExports.getVadProb(this.state);
    const strict = this.focus === 'strict', threshold = strict ? .85 : .65;
    if (Number.isFinite(probability) && probability >= (this.open ? threshold - .18 : threshold)) {
      this.confirm += output.length;
      if (this.confirm >= sampleRate * (strict ? .045 : .025)) {
        this.open = true; this.hold = Math.round(sampleRate * (strict ? .12 : .20));
      }
    } else {
      this.confirm = 0; this.hold -= output.length;
      if (this.hold <= 0) this.open = false;
    }
    if (this.focus !== 'off') {
      const target = this.open ? 1 : 0;
      const coefficient = 1 - Math.exp(-1 / (sampleRate * (target > this.gain ? .004 : .025)));
      for (let i = 0; i < output.length; i++) {
        const delayed = this.delay[this.pointer]; this.delay[this.pointer] = output[i];
        this.pointer = (this.pointer + 1) % this.delay.length;
        this.gain += (target - this.gain) * coefficient;
        output[i] = delayed * this.gain;
      }
    }
    this.report += output.length;
    if (this.report >= sampleRate * .05) {
      this.report = 0;
      this.port.postMessage({vadProb:probability,focus:this.focus,speechOpen:this.focus==='off'||this.open});
    }
    return true;
  }
}
registerProcessor('rnnoise', YcRnnoiseProcessor);
