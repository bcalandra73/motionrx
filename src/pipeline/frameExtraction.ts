import type { ExtractedFrame, PhaseLabel } from "../types";
import {
  PHASE_MAPS,
  LANDING_MOVEMENTS,
  DENSE_FRAME_MOVEMENTS,
} from "../data/phaseMaps";

export interface PhaseTimeResult {
  times: number[]; // proportional (0–1) positions within the video
  labels: PhaseLabel[];
}

// Pure function — no DOM, no side-effects. Fully unit testable.
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

  // Clamp to [0.02, 0.97] and deduplicate times within 3%
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

// Seeks the video to `timeSeconds` and resolves with a base64 JPEG string,
// or null if the seek times out or the canvas is empty.
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
      resolve(captureFrameFromVideo(videoEl));
    };

    const onSeeked = () => {
      if (done) return;
      videoEl.removeEventListener("seeked", onSeeked);
      // Double rAF ensures the new frame is painted before we draw to canvas
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

// Draws the current video frame to an offscreen canvas and returns a base64 JPEG.
function captureFrameFromVideo(videoEl: HTMLVideoElement): string | null {
  try {
    const w = videoEl.videoWidth || 640;
    const h = videoEl.videoHeight || 480;
    if (!w || !h) return null;
    const scale = Math.min(1, 800 / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas
      .getContext("2d")!
      .drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    const b64 = canvas.toDataURL("image/jpeg", 0.82).split(",")[1];
    return b64 && b64.length > 300 ? b64 : null;
  } catch {
    return null;
  }
}

// Creates a temporary, hidden <video> element from a File, loads the file,
// waits for metadata, then tears down the element when the caller's promise resolves.
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

  // Store the object URL on the element so we can revoke it later
  (vid as HTMLVideoElement & { _objectUrl?: string })._objectUrl = url;
  return vid;
}

function cleanupVideoElement(vid: HTMLVideoElement) {
  const url = (vid as HTMLVideoElement & { _objectUrl?: string })._objectUrl;
  if (url) URL.revokeObjectURL(url);
  vid.src = "";
  vid.remove();
}

export interface ExtractFramesOptions {
  onProgress?: (percent: number, label: string) => void;
}

export interface ExtractSequentialOptions {
  startFraction?: number;
  onProgress?: (percent: number, label: string) => void;
}

function sequentialCaptureParams(movementType: string): { fps: number; windowSeconds: number } {
  if (/running|gait|walk/i.test(movementType)) return { fps: 20, windowSeconds: 2 };
  if (/squat|lunge|deadlift|hinge|drop.?jump|countermovement.?jump|single.?leg.?landing|tuck.?jump/i.test(movementType)) return { fps: 12, windowSeconds: 5 };
  return { fps: 8, windowSeconds: 3 };
}

export async function extractFramesSequential(
  file: File,
  movementType: string,
  options: ExtractSequentialOptions = {},
): Promise<ExtractedFrame[]> {
  const { onProgress, startFraction = 0.05 } = options;
  const vid = await createVideoElement(file);
  try {
    const dur = vid.duration;
    if (!dur || !isFinite(dur)) throw new Error('Could not determine video duration.');

    const { fps, windowSeconds } = sequentialCaptureParams(movementType);
    const interval = 1 / fps;
    const startTime = startFraction * dur;
    const endTime = Math.min(startTime + windowSeconds, dur * 0.95);

    const captureTimes: number[] = [];
    for (let t = startTime; t <= endTime; t += interval) {
      captureTimes.push(t);
    }

    const frames: ExtractedFrame[] = [];
    for (let i = 0; i < captureTimes.length; i++) {
      const t = captureTimes[i];
      onProgress?.(Math.round((i / captureTimes.length) * 100), `Extracting frame ${i + 1} of ${captureTimes.length}`);
      const imageData = await captureFrameAtTime(vid, t);
      if (imageData) {
        frames.push({
          imageData,
          phase: { id: 'dense', label: `Frame ${frames.length + 1}`, desc: '', fraction: t / dur },
          timestamp: t,
          index: frames.length,
        });
      }
    }

    onProgress?.(100, `Extracted ${frames.length} frames`);
    return frames;
  } finally {
    cleanupVideoElement(vid);
  }
}

// Legacy uniform sampler — still used by the UI analysis hooks.
export async function extractFrames(
  file: File,
  movementType: string,
  options: ExtractFramesOptions = {},
): Promise<ExtractedFrame[]> {
  const { onProgress } = options;
  const vid = await createVideoElement(file);

  try {
    const dur = vid.duration;
    if (!dur || !isFinite(dur))
      throw new Error("Could not determine video duration.");

    // Step 1 extracts a uniform dense sample — no phase mapping yet.
    // Step 2 (phaseSelection) selects the final subset and assigns phase labels.
    const denseCount = movementType === "Running" ? 128
      : DENSE_FRAME_MOVEMENTS.has(movementType) ? 64
      : 16;

    const captureTimes = Array.from(
      { length: denseCount },
      (_, i) => 0.03 + (i / (denseCount - 1)) * 0.94,
    );
    const captureLabels: PhaseLabel[] = captureTimes.map((t, i) => ({
      id: "dense",
      label: `Frame ${i + 1}`,
      desc: "",
      fraction: t,
    }));

    const frames: ExtractedFrame[] = [];

    for (let i = 0; i < captureTimes.length; i++) {
      const t = captureTimes[i] * dur;
      const label = captureLabels[i];

      onProgress?.(
        Math.round((i / captureTimes.length) * 100),
        `Extracting frame ${i + 1} of ${captureTimes.length}`,
      );

      const imageData = await captureFrameAtTime(vid, t);
      if (imageData) {
        frames.push({
          imageData,
          phase: label,
          timestamp: t,
          index: frames.length,
        });
      }
    }

    onProgress?.(100, `Extracted ${frames.length} frames`);
    return frames;
  } finally {
    cleanupVideoElement(vid);
  }
}
