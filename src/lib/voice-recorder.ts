export const MAX_RECORDING_SECONDS = 30;
export const MAX_RECORDING_BYTES = 8 * 1024 * 1024;
export interface VoiceRecording { finish: () => void; cancel: () => void }

/** Returns before permission resolves so close/edit/unmount can cancel even a pending permission prompt. */
export function createVoiceRecording(callbacks: {
  onAudio: (audio: Blob) => void;
  onError: (message: string) => void;
  onTick: (seconds: number) => void;
}, mediaDevices: Pick<MediaDevices, "getUserMedia"> = navigator.mediaDevices, Recorder: typeof MediaRecorder = MediaRecorder): VoiceRecording {
  let cancelled = false, finished = false, delivered = false;
  let stream: MediaStream | undefined, recorder: MediaRecorder | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let bytes = 0;
  const chunks: Blob[] = [];
  const release = () => { clearInterval(timer); stream?.getTracks().forEach(track => track.stop()); };
  const error = (message: string) => {
    if (cancelled || delivered) return;
    delivered = true; release();
    if (recorder?.state === "recording") recorder.stop();
    callbacks.onError(message);
  };
  const control: VoiceRecording = {
    cancel: () => { cancelled = true; release(); if (recorder?.state === "recording") recorder.stop(); },
    finish: () => {
      if (cancelled || finished || delivered) return;
      finished = true;
      if (recorder?.state === "recording") recorder.stop();
      else { error("Rekaman belum dimulai. Izinkan mikrofon, lalu coba lagi."); cancelled = true; release(); }
    },
  };
  void mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).then(acquired => {
    stream = acquired;
    if (cancelled || finished) { release(); return; }
    const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"].find(type => Recorder.isTypeSupported(type));
    recorder = new Recorder(stream, mimeType ? { mimeType } : undefined);
    recorder.ondataavailable = event => {
      if (cancelled || delivered || !event.data.size) return;
      bytes += event.data.size;
      if (bytes > MAX_RECORDING_BYTES) { error("Rekaman terlalu besar. Ulangi dengan pesanan lebih singkat."); return; }
      chunks.push(event.data);
    };
    recorder.onerror = () => error("Rekaman terputus. Coba lagi atau ketik pesanan.");
    recorder.onstop = () => {
      release();
      if (cancelled || delivered) return;
      delivered = true;
      const audio = new Blob(chunks, { type: recorder!.mimeType || chunks[0]?.type || "audio/webm" });
      if (!audio.size) { callbacks.onError("Rekaman kosong. Coba bicara lalu tekan selesai."); return; }
      callbacks.onAudio(audio);
    };
    recorder.start(250);
    const started = Date.now(); callbacks.onTick(0);
    timer = setInterval(() => {
      const seconds = Math.floor((Date.now() - started) / 1000); callbacks.onTick(seconds);
      if (seconds >= MAX_RECORDING_SECONDS) control.finish();
    }, 250);
  }).catch((caught: unknown) => {
    const name = caught instanceof Error ? caught.name : "";
    error(name === "NotAllowedError" ? "Izinkan mikrofon di browser, lalu coba lagi. Kamu juga bisa mengetik pesanan." : "Mikrofon tidak tersedia. Periksa perangkat atau ketik pesanan.");
  });
  return control;
}

export async function voiceAudioPayload(audio: Blob): Promise<{ audio: string; mimeType: string }> {
  if (!audio.size || audio.size > MAX_RECORDING_BYTES) throw new Error("Ukuran rekaman tidak valid.");
  const bytes = new Uint8Array(await audio.arrayBuffer());
  let binary = "";
  for (let start = 0; start < bytes.length; start += 8192) binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
  return { audio: btoa(binary), mimeType: audio.type.split(";")[0] || "audio/webm" };
}
