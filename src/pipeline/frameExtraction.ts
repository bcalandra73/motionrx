import type { ExtractedFrame, PhaseLabel } from "../types";
import { PHASE_MAPS, LANDING_MOVEMENTS } from "../data/phaseMaps";

// ── Phase time calculation (used by non-gait phase selection) ─────────────────

export interface PhaseTimeResult {
  times: number[];
  labels: PhaseLabel[];
}

export function getPhaseTimes(movementType: string): PhaseTimeResult {
  let phases = PHASE_MAPS[movementType] ?? null;

  if (!phases) {
    for (const [key, val] of Object.entries(PHASE_MAPS)) {
      if (
        movementType.toLowerCase().includes(key.toLowerCase().split(" ")[0])
      ) {
        phases = val;
        break;
      }
    }
  }

  if (!phases) {
    const times = Array.from({ length: 8 }, (_, i) =>
      i === 0 ? 0.03 : (i / 7) * 0.95,
    );
    return {
      times,
      labels: times.map((t, i) => ({
        id: "frame",
        label: `Frame ${i + 1}`,
        desc: "",
        fraction: t,
      })),
    };
  }

  const isLanding = LANDING_MOVEMENTS.has(movementType);
  const targetCount = isLanding ? phases.length : 8;

  const expanded: number[] = [];
  const expandedLabels: Array<{ id: string; label: string; desc: string }> = [];

  if (phases.length >= targetCount) {
    phases.slice(0, targetCount).forEach((p) => {
      expanded.push(p.time);
      expandedLabels.push(p);
    });
  } else {
    phases.forEach((phase, i) => {
      expanded.push(phase.time);
      expandedLabels.push(phase);
      if (i < phases.length - 1) {
        const gap = phases[i + 1].time - phase.time;
        expanded.push(phase.time + gap * 0.5);
        expandedLabels.push({
          id: "frame",
          label: `Inter ${i + 1}a`,
          desc: "Between phases",
        });
        if (gap > 0.25) {
          expanded.push(phase.time + gap * 0.75);
          expandedLabels.push({
            id: "frame",
            label: `Inter ${i + 1}b`,
            desc: "Between phases",
          });
        }
      }
    });
  }

  while (expanded.length > targetCount) {
    const lastInter = [...expandedLabels]
      .reverse()
      .findIndex((l) => l.id === "frame");
    if (lastInter === -1) break;
    const idx = expandedLabels.length - 1 - lastInter;
    expanded.splice(idx, 1);
    expandedLabels.splice(idx, 1);
  }

  while (expanded.length < targetCount) {
    let maxGap = 0,
      maxIdx = 0;
    for (let i = 0; i < expanded.length - 1; i++) {
      const g = expanded[i + 1] - expanded[i];
      if (g > maxGap) {
        maxGap = g;
        maxIdx = i;
      }
    }
    const newT = (expanded[maxIdx] + expanded[maxIdx + 1]) / 2;
    expanded.splice(maxIdx + 1, 0, newT);
    expandedLabels.splice(maxIdx + 1, 0, {
      id: "frame",
      label: `Extra ${expanded.length}`,
      desc: "Added for coverage",
    });
  }

  const clamped = expanded.map((t) => Math.max(0.02, Math.min(0.97, t)));
  const deduped: number[] = [];
  const dedupedLabels: Array<{ id: string; label: string; desc: string }> = [];
  clamped.forEach((t, i) => {
    if (!deduped.some((existing) => Math.abs(existing - t) < 0.03)) {
      deduped.push(t);
      dedupedLabels.push(expandedLabels[i]);
    }
  });

  while (deduped.length < targetCount) {
    let maxGap = 0,
      maxIdx = 0;
    for (let i = 0; i < deduped.length - 1; i++) {
      const g = deduped[i + 1] - deduped[i];
      if (g > maxGap) {
        maxGap = g;
        maxIdx = i;
      }
    }
    const newT = Math.max(
      0.02,
      Math.min(0.97, (deduped[maxIdx] + deduped[maxIdx + 1]) / 2),
    );
    deduped.splice(maxIdx + 1, 0, newT);
    dedupedLabels.splice(maxIdx + 1, 0, {
      id: "frame",
      label: `Frame ${deduped.length}`,
      desc: "Coverage frame",
    });
  }

  const times = deduped.slice(0, targetCount);
  const labels: PhaseLabel[] = dedupedLabels
    .slice(0, targetCount)
    .map((l, i) => ({
      id: l.id,
      label: l.label,
      desc: l.desc,
      fraction: times[i],
    }));
  return { times, labels };
}

// ── Video element helpers (seek-based fallback) ───────────────────────────────

async function createVideoElement(file: File): Promise<HTMLVideoElement> {
  const url = URL.createObjectURL(file);
  const vid = document.createElement("video");
  vid.src = url;
  vid.muted = true;
  vid.playsInline = true;
  vid.style.cssText =
    "position:absolute;width:1px;height:1px;opacity:0;pointer-events:none";
  document.body.appendChild(vid);
  await new Promise<void>((resolve, reject) => {
    vid.onloadedmetadata = () => resolve();
    vid.onerror = () => reject(new Error("Video failed to load"));
    vid.load();
  });
  (vid as HTMLVideoElement & { _objectUrl?: string })._objectUrl = url;
  return vid;
}

function cleanupVideoElement(vid: HTMLVideoElement) {
  const url = (vid as HTMLVideoElement & { _objectUrl?: string })._objectUrl;
  if (url) URL.revokeObjectURL(url);
  vid.src = "";
  vid.remove();
}

export function captureFrameAtTime(
  videoEl: HTMLVideoElement,
  timeSeconds: number,
): Promise<string | null> {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(null);
      }
    }, 5000);

    const doCapture = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        const w = videoEl.videoWidth || 640;
        const h = videoEl.videoHeight || 480;
        if (!w || !h) {
          resolve(null);
          return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas
          .getContext("2d")!
          .drawImage(videoEl, 0, 0, w, h);
        const b64 = canvas.toDataURL("image/jpeg", 0.82).split(",")[1];
        resolve(b64 && b64.length > 300 ? b64 : null);
      } catch {
        resolve(null);
      }
    };

    const onSeeked = () => {
      if (done) return;
      videoEl.removeEventListener("seeked", onSeeked);
      requestAnimationFrame(() => requestAnimationFrame(doCapture));
    };

    videoEl.addEventListener("seeked", onSeeked);
    try {
      videoEl.currentTime = timeSeconds;
    } catch {
      if (!done) {
        done = true;
        clearTimeout(timer);
        resolve(null);
      }
    }
  });
}

// ── Seek-based extraction (fallback) ─────────────────────────────────────────

export interface ExtractSequentialOptions {
  startSecs?: number;
  durationSecs?: number;
  targetFps?: number;
  onProgress?: (percent: number, label: string) => void;
}

async function extractFramesSequentialSeek(
  file: File,
  options: ExtractSequentialOptions = {},
): Promise<ExtractedFrame[]> {
  const {
    startSecs = 0,
    durationSecs = 2,
    targetFps = 30,
    onProgress,
  } = options;
  const vid = await createVideoElement(file);

  try {
    const dur = vid.duration;
    if (!dur || !isFinite(dur))
      throw new Error("Could not determine video duration.");

    const start = Math.min(startSecs, dur);
    const end = Math.min(start + durationSecs, dur);
    const interval = 1 / targetFps;

    const captureTimes: number[] = [];
    for (let t = start; t <= end; t += interval) captureTimes.push(t);

    const frames: ExtractedFrame[] = [];
    let lastPrefix = '';
    for (let i = 0; i < captureTimes.length; i++) {
      const t = captureTimes[i];
      onProgress?.(
        Math.round((i / captureTimes.length) * 100),
        `Extracting frame ${i + 1} of ${captureTimes.length}`,
      );
      const imageData = await captureFrameAtTime(vid, t);
      if (!imageData) continue;
      const mid = Math.floor(imageData.length / 2);
      const sample = imageData.slice(mid, mid + 256);
      if (sample === lastPrefix) continue;
      lastPrefix = sample;
      frames.push({
        imageData,
        phase: {
          id: "dense",
          label: `Frame ${frames.length + 1}`,
          desc: "",
          fraction: t / dur,
        },
        timestamp: t,
        index: frames.length,
      });
    }

    onProgress?.(100, `Extracted ${frames.length} frames`);
    return frames;
  } finally {
    cleanupVideoElement(vid);
  }
}

async function extractFramesAtTimestampsSeek(
  file: File,
  targets: Array<{ timestamp: number; phase: PhaseLabel; index: number }>,
  options: { onProgress?: (percent: number, label: string) => void } = {},
): Promise<ExtractedFrame[]> {
  const { onProgress } = options;
  const vid = await createVideoElement(file);
  try {
    const dur = vid.duration;
    if (!dur || !isFinite(dur))
      throw new Error("Could not determine video duration.");

    const frames: ExtractedFrame[] = [];
    for (let i = 0; i < targets.length; i++) {
      const { timestamp, phase, index } = targets[i];
      const t = Math.min(timestamp, dur * 0.97);
      onProgress?.(
        Math.round((i / targets.length) * 100),
        `Extracting frame ${i + 1} of ${targets.length}`,
      );
      const imageData = await captureFrameAtTime(vid, t);
      frames.push({ imageData: imageData ?? "", phase, timestamp: t, index });
    }

    onProgress?.(100, `Extracted ${frames.length} frames`);
    return frames;
  } finally {
    cleanupVideoElement(vid);
  }
}

// ── WebCodecs frame extraction ────────────────────────────────────────────────

function isWebCodecsSupported(): boolean {
  if (
    typeof VideoDecoder === "undefined" ||
    typeof EncodedVideoChunk === "undefined" ||
    typeof VideoFrame === "undefined"
  ) return false;
  // Firefox's WebCodecs implementation hangs on flush() for many H.264 streams.
  // Fall back to seek-based extraction on Firefox to avoid the 20-second timeout.
  if (/Firefox\//.test(navigator.userAgent)) return false;
  return true;
}

interface RawSample {
  dts: number;
  cts: number;
  duration: number;
  timescale: number;
  is_sync: boolean;
  data: ArrayBuffer;
}

interface DemuxResult {
  codec: string;
  codedWidth: number;
  codedHeight: number;
  description: Uint8Array | undefined;
  samples: RawSample[];
  duration: number;
}

interface DecodedFrame {
  timestamp: number; // seconds
  frame: VideoFrame;
}

async function demuxVideoFile(file: File): Promise<DemuxResult> {
  // Dynamic import keeps mp4box out of the initial bundle.
  const mp4boxMod = await import("mp4box");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mp4 = ((mp4boxMod as any).default ?? mp4boxMod) as any;

  return new Promise<DemuxResult>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Demux timed out after 15 s")),
      15_000,
    );
    const finish = (result?: DemuxResult, err?: Error) => {
      clearTimeout(timeout);
      err ? reject(err) : resolve(result!);
    };

    const isoFile = mp4.createFile();
    const rawSamples: RawSample[] = [];
    let trackInfo: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any

    isoFile.onReady = (info: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (!info.videoTracks?.length) {
        finish(undefined, new Error("No video track found in file"));
        return;
      }
      trackInfo = info.videoTracks[0];
      isoFile.setExtractionOptions(trackInfo.id, null, { nbSamples: Infinity });
      isoFile.start();
    };

    isoFile.onSamples = (_tid: number, _user: unknown, samples: RawSample[]) => {
      rawSamples.push(...samples);
    };

    isoFile.onError = (e: string) =>
      finish(undefined, new Error(`MP4Box error: ${e}`));

    file.arrayBuffer().then((buf) => {
      (buf as any).fileStart = 0; // eslint-disable-line @typescript-eslint/no-explicit-any
      isoFile.appendBuffer(buf);
      isoFile.flush();

      // onSamples fires synchronously during appendBuffer/flush for fully-buffered files.
      // queueMicrotask ensures we collect all callbacks before resolving.
      queueMicrotask(() => {
        if (!trackInfo) {
          finish(undefined, new Error("onReady never fired — not an MP4/MOV file?"));
          return;
        }
        finish({
          codec: trackInfo.codec,
          codedWidth: trackInfo.video.width,
          codedHeight: trackInfo.video.height,
          description: extractCodecDescription(isoFile, trackInfo, mp4),
          samples: rawSamples,
          duration: trackInfo.movie_duration / trackInfo.movie_timescale,
        });
      });
    }).catch((e) => finish(undefined, e));
  });
}

function extractCodecDescription(
  isoFile: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  track: any,   // eslint-disable-line @typescript-eslint/no-explicit-any
  mp4: any,     // eslint-disable-line @typescript-eslint/no-explicit-any
): Uint8Array | undefined {
  try {
    const trak = isoFile.getTrackById(track.id);
    const entry = trak?.mdia?.minf?.stbl?.stsd?.entries?.[0];
    if (!entry) return undefined;

    const box = entry.avcC ?? entry.hvcC ?? entry.vpcC ?? entry.av1C;
    if (!box) return undefined;

    const DataStream = mp4.DataStream;
    if (!DataStream) return undefined;

    const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
    box.write(stream);
    // Skip the 4-byte box size + 4-byte box type header
    return new Uint8Array(stream.buffer, 8);
  } catch {
    return undefined;
  }
}

async function decodeVideoFrames(
  demux: DemuxResult,
  startSecs: number,
  endSecs: number,
): Promise<DecodedFrame[]> {
  const { codec, codedWidth, codedHeight, description, samples } = demux;

  // Locate the last keyframe at or before startSecs so the decoder has valid
  // reference state before our target window begins (handles B-frame dependencies).
  let firstSampleIdx = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = samples[i].cts / samples[i].timescale;
    if (samples[i].is_sync && t <= startSecs) firstSampleIdx = i;
    if (t > endSecs) break;
  }

  const window = samples.filter((s, i) => {
    if (i < firstSampleIdx) return false;
    return s.cts / s.timescale <= endSecs;
  });

  const config: VideoDecoderConfig = { codec, codedWidth, codedHeight };
  if (description) config.description = description;

  const support = await VideoDecoder.isConfigSupported(config);
  if (!support.supported) throw new Error(`Codec not supported by this browser: ${codec}`);

  const decoded: DecodedFrame[] = [];
  const DECODE_TIMEOUT_MS = 20_000;

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout>;
    const settle = (err?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      err ? reject(err) : resolve();
    };

    timeoutId = setTimeout(
      () => settle(new Error(`VideoDecoder.flush() timed out after ${DECODE_TIMEOUT_MS / 1000}s — browser may not support this codec`)),
      DECODE_TIMEOUT_MS,
    );

    const decoder = new VideoDecoder({
      output(vf) { decoded.push({ timestamp: vf.timestamp / 1e6, frame: vf }); },
      error: (e) => { try { decoder.close(); } catch { /* ignore */ } settle(e); },
    });

    decoder.configure(config);

    for (const s of window) {
      decoder.decode(
        new EncodedVideoChunk({
          type: s.is_sync ? "key" : "delta",
          timestamp: (s.cts / s.timescale) * 1e6,
          duration: (s.duration / s.timescale) * 1e6,
          data: s.data,
        }),
      );
    }

    decoder.flush()
      .then(() => { try { decoder.close(); } catch { /* ignore */ } settle(); })
      .catch((e) => { try { decoder.close(); } catch { /* ignore */ } settle(e); });
  });

  // Sort by display timestamp (B-frames can arrive out of decode order)
  decoded.sort((a, b) => a.timestamp - b.timestamp);
  return decoded;
}

function renderToBase64(vf: VideoFrame): string {
  const w = vf.displayWidth;
  const h = vf.displayHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(vf, 0, 0, w, h);
  vf.close();
  return canvas.toDataURL("image/jpeg", 0.82).split(",")[1];
}

function nearest(decoded: DecodedFrame[], targetSecs: number): number {
  let best = 0;
  let bestDelta = Infinity;
  for (let i = 0; i < decoded.length; i++) {
    const d = Math.abs(decoded[i].timestamp - targetSecs);
    if (d < bestDelta) { bestDelta = d; best = i; }
  }
  return best;
}

function closeRemaining(decoded: DecodedFrame[], rendered: Set<number>): void {
  for (let i = 0; i < decoded.length; i++) {
    if (!rendered.has(i)) try { decoded[i].frame.close(); } catch { /* already closed */ }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function extractFramesSequential(
  file: File,
  options: ExtractSequentialOptions = {},
): Promise<ExtractedFrame[]> {
  const {
    startSecs = 0,
    durationSecs = 2,
    targetFps = 30,
    onProgress,
  } = options;

  if (isWebCodecsSupported()) {
    try {
      onProgress?.(5, "Demuxing video…");
      const demux = await demuxVideoFile(file);
      const endSecs = Math.min(startSecs + durationSecs, demux.duration);
      console.log(`[WebCodecs] codec=${demux.codec} | ${demux.codedWidth}×${demux.codedHeight} | duration=${demux.duration.toFixed(3)}s | ${demux.samples.length} encoded samples`);

      onProgress?.(15, "Decoding frames…");
      const decoded = await decodeVideoFrames(demux, startSecs, endSecs);
      if (decoded.length === 0) throw new Error("No frames decoded");
      console.log(`[WebCodecs] Decoded ${decoded.length} frames | window=${startSecs.toFixed(3)}s–${endSecs.toFixed(3)}s | target=${targetFps}fps`);

      const interval = 1 / targetFps;
      const frames: ExtractedFrame[] = [];
      const rendered = new Set<number>();

      for (let t = startSecs; t <= endSecs + interval * 0.5; t += interval) {
        const idx = nearest(decoded, t);
        if (rendered.has(idx)) continue;
        if (Math.abs(decoded[idx].timestamp - t) > interval * 2) continue;
        rendered.add(idx);

        onProgress?.(
          15 + Math.round(((t - startSecs) / Math.max(endSecs - startSecs, 1)) * 80),
          `Rendering frame ${frames.length + 1}`,
        );

        const imageData = renderToBase64(decoded[idx].frame);
        frames.push({
          imageData,
          phase: {
            id: "dense",
            label: `Frame ${frames.length + 1}`,
            desc: "",
            fraction: decoded[idx].timestamp / demux.duration,
          },
          timestamp: decoded[idx].timestamp,
          index: frames.length,
        });
      }

      closeRemaining(decoded, rendered);
      console.log(`[WebCodecs] Rendered ${frames.length} frames | t=${frames[0]?.timestamp.toFixed(3)}s–${frames[frames.length - 1]?.timestamp.toFixed(3)}s`);
      onProgress?.(100, `Extracted ${frames.length} frames`);
      return frames;
    } catch (err) {
      console.warn("[WebCodecs] Sequential extraction failed, falling back to seek:", err);
    }
  }

  return extractFramesSequentialSeek(file, options);
}

export async function extractFramesAtTimestamps(
  file: File,
  targets: Array<{ timestamp: number; phase: PhaseLabel; index: number }>,
  options: { onProgress?: (percent: number, label: string) => void } = {},
): Promise<ExtractedFrame[]> {
  const { onProgress } = options;
  if (!targets.length) return [];

  if (isWebCodecsSupported()) {
    try {
      onProgress?.(5, "Demuxing video…");
      const demux = await demuxVideoFile(file);

      const minTs = Math.min(...targets.map((t) => t.timestamp));
      const maxTs = Math.max(...targets.map((t) => t.timestamp));

      onProgress?.(15, "Decoding frames…");
      const decoded = await decodeVideoFrames(
        demux,
        minTs,
        Math.min(maxTs + 0.5, demux.duration),
      );
      if (decoded.length === 0) throw new Error("No frames decoded");

      // Cache rendered base64 by decoded frame index so two targets that share
      // the nearest frame only call drawImage once (frame is closed after first render).
      const cache = new Map<number, string>();
      const frames: ExtractedFrame[] = [];

      for (let i = 0; i < targets.length; i++) {
        const { timestamp, phase, index } = targets[i];
        onProgress?.(
          15 + Math.round((i / targets.length) * 80),
          `Extracting frame ${i + 1} of ${targets.length}`,
        );
        const idx = nearest(decoded, timestamp);
        let imageData = cache.get(idx);
        if (!imageData) {
          imageData = renderToBase64(decoded[idx].frame);
          cache.set(idx, imageData);
        }
        frames.push({ imageData, phase, timestamp: decoded[idx].timestamp, index });
      }

      closeRemaining(decoded, new Set(cache.keys()));
      onProgress?.(100, `Extracted ${frames.length} frames`);
      return frames;
    } catch (err) {
      console.warn("[WebCodecs] Timestamp extraction failed, falling back to seek:", err);
    }
  }

  return extractFramesAtTimestampsSeek(file, targets, options);
}
