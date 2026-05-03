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

// ── Video element helpers ─────────────────────────────────────────────────────

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
        const scale = Math.min(1, 800 / Math.max(w, h));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        canvas
          .getContext("2d")!
          .drawImage(videoEl, 0, 0, canvas.width, canvas.height);
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

// ── Frame extraction ──────────────────────────────────────────────────────────

export interface ExtractSequentialOptions {
  startSecs?: number;
  durationSecs?: number;
  targetFps?: number;
  onProgress?: (percent: number, label: string) => void;
}

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
      // Skip if seek landed on the same decoded video frame as the previous capture.
      // Sample from the middle of the data to avoid the identical JPEG header at the start.
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

// Extracts one frame per entry at the given timestamps, reusing phase labels
// from the primary video so secondary frames stay aligned.
export async function extractFramesAtTimestamps(
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
