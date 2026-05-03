import { useState, useRef } from 'react';
import { load as parseYaml } from 'js-yaml';
import './index.css';

import { Card } from './components/Card/Card';
import { AppHeader } from './components/AppHeader/AppHeader';
import { AutoSaveBanner } from './components/AutoSaveBanner/AutoSaveBanner';
import { PatientForm } from './components/PatientForm/PatientForm';
import { BrandingCard } from './components/BrandingCard/BrandingCard';
import { VideoUpload } from './components/VideoUpload/VideoUpload';
import { LoadingState } from './components/LoadingState/LoadingState';
import { ResultsSection } from './components/ResultsSection/ResultsSection';
import { PROMs } from './components/PROMs/PROMs';
import { TapeMarkerCard } from './components/TapeMarkerCard/TapeMarkerCard';

import { usePatientForm } from './hooks/usePatientForm';
import { useRunningInputs } from './hooks/useRunningInputs';
import { useJumpInputs } from './hooks/useJumpInputs';
import { useBranding } from './hooks/useBranding';
import { useAutoSave } from './hooks/useAutoSave';
import { useVideoAnalysis } from './hooks/useVideoAnalysis';
import { usePROMs } from './hooks/usePROMs';
import type { PatientFormData, JumpInvolvedLimb, JumpProtocol, JumpTimePostOp, Assessment } from './types';
import { assessmentFromYaml } from './assessment';
import { CAMERA_GUIDES } from './data/cameraGuides';
import { extractFramesSequential } from './pipeline/frameExtraction';
import { initPoseLandmarker } from './pipeline/poseDetection';
import { runPrimaryAnalysis, runSecondaryAnalysis } from './pipeline/runAnalysis';
import { buildReportPrompt } from './pipeline/reportGeneration';
import { generateReport } from './api';

export default function App() {
  const form        = usePatientForm();
  const running     = useRunningInputs();
  const jump        = useJumpInputs();
  const branding    = useBranding();
  const autoSave    = useAutoSave();
  const video       = useVideoAnalysis();
  const proms       = usePROMs();
  const [apiKey, setApiKey]                     = useState('');
  const [apiError, setApiError]                 = useState('');
  const [focusAreas, setFocusAreas]             = useState<string[]>([]);
  const [guideOpen, setGuideOpen]               = useState(false);
  const [enableLandmarkReview, setLandmarkReview] = useState(false);
  const [startSecs, setStartSecs]               = useState(0);
  const [durationSecs, setDurationSecs]         = useState(2);
  const [targetFps, setTargetFps]               = useState(30);
  const caseInputRef = useRef<HTMLInputElement>(null);

  const isAnalyzing = ['extracting', 'detecting', 'analyzing'].includes(video.analysis.stage);
  const hasResults  = video.analysis.stage === 'complete' && video.analysis.report != null;

  function toggleFocus(area: string) {
    setFocusAreas(prev => prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area]);
  }

  function loadAssessment(a: Assessment) {
    form.load(a);
    running.load(a);
    jump.load(a);
    proms.load(a);
    video.setPrimaryView(a.media.primary.cameraView);
    if (a.media.secondary) video.setSecondaryView(a.media.secondary.cameraView);
    setFocusAreas(a.focus);
    if (a.capture) {
      setStartSecs(a.capture.startSecs);
      setDurationSecs(a.capture.durationSecs);
      setTargetFps(a.capture.targetFps);
    }
  }

  async function handleAnalyze() {
    if (!video.primary.file) { setApiError('Please upload a video or image.'); return; }
    if (!form.form.movementType) { setApiError('Please select a movement type.'); return; }
    if (!apiKey.trim()) { setApiError('Please enter your Anthropic API key.'); return; }
    setApiError('');

    const movementType = form.form.movementType;
    const cameraView = (video.primary.cameraView ?? 'side') as 'side' | 'front' | 'posterior';

    video.setStage('extracting', 'Extracting video frames...', 0);
    const t0 = performance.now();
    console.log('[Pipeline] Starting analysis —', movementType, video.primary.file.name);

    try {
      // Step 1: Extract frames across the user-specified window
      const t1 = performance.now();
      const frames = await extractFramesSequential(video.primary.file, {
        startSecs,
        durationSecs,
        targetFps,
        onProgress: (pct, label) => video.setStage('extracting', label, pct),
      });
      console.log(`[Step 1 ✓] Extracted ${frames.length} frames in ${Math.round(performance.now() - t1)}ms`);
      video.updatePrimary({ extractedFrames: frames });

      // Steps 2–4: MediaPipe on all frames, phase selection, annotation, angle calculation
      video.setStage('detecting', 'Initialising pose model...', 0);
      const t2 = performance.now();
      const landmarker = await initPoseLandmarker();
      const primary = await runPrimaryAnalysis(frames, landmarker, {
        movementType,
        cameraView,
        onProgress: (pct, label) => video.setStage('detecting', label, pct),
      });
      console.log(`[Steps 2–4 ✓] ${Math.round(performance.now() - t2)}ms — ${primary.phaseFrames.length} phase frames: ${primary.phaseFrames.map(f => f.phase.id).join(', ')}`);

      video.updatePrimary({
        extractedFrames: primary.phaseFrames,
        landmarks: primary.poseResults.map(r => r.poseLandmarks ?? []),
        gifData: primary.gifData,
        annotatedFrames: primary.phaseFrames.map((f, i) => ({
          base64:    primary.annotatedFrames[i],
          landmarks: primary.poseResults[i]?.poseLandmarks ?? null,
          timestamp: f.timestamp,
          index:     f.index,
          phaseId:   f.phase.label,
        })),
      });

      // Step 3b: Secondary pipeline — capture at primary timestamps so both videos stay in sync
      let secondary = null;
      if (video.secondary.file) {
        video.setStage('detecting', 'Extracting second camera angle...', 0);
        const cameraView2 = (video.secondary.cameraView ?? 'front') as 'side' | 'front' | 'posterior';
        console.log('[Step 3b] Processing secondary video —', cameraView2);
        try {
          const t3b = performance.now();
          secondary = await runSecondaryAnalysis(video.secondary.file, landmarker, primary.phaseFrames, {
            movementType,
            cameraView: cameraView2,
            onProgress: (pct, label) => video.setStage('detecting', label, pct),
          });
          video.updateSecondary({
            extractedFrames: secondary.phaseFrames,
            annotatedFrames: secondary.phaseFrames.map((f, i) => ({
              base64:    secondary!.annotatedFrames[i],
              landmarks: secondary!.poseResults[i]?.poseLandmarks ?? null,
              timestamp: f.timestamp,
              index:     f.index,
              phaseId:   f.phase.label,
            })),
          });
          console.log(`[Step 3b ✓] Secondary pipeline done in ${Math.round(performance.now() - t3b)}ms`);
        } catch (err2) {
          console.warn('[Step 3b] Secondary pipeline failed (non-critical):', err2);
          secondary = null;
        }
      }

      // Step 5: build prompt and call Claude for report generation
      video.setStage('analyzing', 'Generating clinical report...', 50);
      const t5 = performance.now();
      console.log('[Step 5] Building prompt and calling Claude API...');
      const isRunning = /running|gait|walk/i.test(movementType);
      const isJump    = /jump|landing/i.test(movementType);
      const hasDualView = (secondary?.phaseFrames.length ?? 0) > 0;
      const prompt = buildReportPrompt({
        patient:     form.form,
        movementType,
        cameraView,
        hasDualView,
        secondaryCameraView: video.secondary.cameraView as 'side' | 'front' | 'posterior',
        focusAreas,
        aggregated:  primary.aggregated,
        aggregated2: hasDualView ? secondary!.aggregated : undefined,
        proms: {
          nprs:       proms.nprs,
          psfs:       proms.psfs,
          lefsTotal:  proms.lefsTotal,
          odiScore:   proms.odiScore,
          lsi:        proms.lsi,
        },
        running: isRunning ? running.inputs : undefined,
        jump:    isJump    ? jump.inputs    : undefined,
        frameCount:  primary.phaseFrames.length,
        frameCount2: hasDualView ? secondary!.phaseFrames.length : undefined,
      });

      console.log(`[Step 5] Prompt length: ${prompt.length} chars, sending ${primary.phaseFrames.length} primary + ${secondary?.phaseFrames.length ?? 0} secondary frames to Claude...`);
      const report = await generateReport({
        apiKey,
        prompt,
        frames:  primary.phaseFrames,
        frames2: secondary?.phaseFrames ?? [],
      });
      console.log(`[Step 5 ✓] Report received in ${Math.round(performance.now() - t5)}ms — score: ${report.score}, findings: ${report.findings?.length ?? 0}`);
      console.log(`[Pipeline ✓] Total time: ${Math.round(performance.now() - t0)}ms`);

      video.updateAnalysis({ stage: 'complete', report });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Pipeline ✗] Error:', msg, err);
      video.setError(msg);
    }
  }

  async function handleLoadCase(files: FileList) {
    const all = Array.from(files);
    const yamlFile = all.find(f => /\.(yaml|yml)$/i.test(f.name));
    if (!yamlFile) { setApiError('No YAML file found in the selection.'); return; }

    try {
      const raw = parseYaml(await yamlFile.text()) as Record<string, unknown>;
      const assessment = assessmentFromYaml(raw);
      loadAssessment(assessment);

      const byName = new Map(all.map(f => [f.name, f]));

      const primaryFile = byName.get(assessment.media.primary.file);
      if (primaryFile) video.setPrimaryFile(primaryFile);

      const secondaryMeta = assessment.media.secondary;
      const secondaryFile = secondaryMeta ? byName.get(secondaryMeta.file) : undefined;
      if (secondaryFile) {
        video.setSecondaryFile(secondaryFile);
        video.setShowSecondary(true);
      }

      const missing: string[] = [];
      if (!primaryFile) missing.push(assessment.media.primary.file);
      if (secondaryMeta && !secondaryFile) missing.push(secondaryMeta.file);
      setApiError(missing.length
        ? `Case loaded — please also upload: ${missing.join(', ')}`
        : '',
      );
    } catch (e) {
      setApiError(`Could not parse case file: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      // Reset so the same file can be re-selected if needed
      if (caseInputRef.current) caseInputRef.current.value = '';
    }
  }

  function handleRestore() {
    if (!autoSave.pending) return;
    form.restore({
      patientName: autoSave.pending.patient,
      patientAge:  autoSave.pending.age,
      movementType: autoSave.pending.movement,
    });
    autoSave.dismiss();
  }

  return (
    <>
      <AppHeader onLoadCase={() => caseInputRef.current?.click()} />

      <div className="container">
        {autoSave.bannerVisible && autoSave.pending && (
          <AutoSaveBanner state={autoSave.pending} onRestore={handleRestore} onDismiss={autoSave.dismiss} />
        )}

        {/* INPUT SECTION */}
        {!hasResults && !isAnalyzing && (
          <div id="inputSection">
            <input
              ref={caseInputRef}
              type="file"
              multiple
              accept=".yaml,.yml,video/*"
              style={{ display: 'none' }}
              onChange={e => { if (e.target.files?.length) handleLoadCase(e.target.files); }}
            />
            <div className="page-header">
              <h1>New Motion Assessment</h1>
              <p>Upload a video or image — MediaPipe will track joints and measure angles, then Claude AI generates your clinical report.</p>
              <p style={{ fontSize: '.65rem', opacity: .4, marginTop: 4, letterSpacing: '.04em' }}>v0.13.4 · 2026.04.14</p>
            </div>

            <div className="two-col">
              <PatientForm form={form.form}
                onChange={(k, v) => form.setField(k as keyof PatientFormData, v)} />

              <VideoUpload
                primaryFile={video.primary.file} primaryView={video.primary.cameraView}
                secondaryFile={video.secondary.file} secondaryView={video.secondary.cameraView}
                primaryProgress={video.analysis.progress} primaryStatusText={video.analysis.stageLabel}
                onPrimaryFile={video.setPrimaryFile} onPrimaryView={video.setPrimaryView}
                onSecondaryFile={video.setSecondaryFile} onSecondaryView={video.setSecondaryView}
                onGuide={() => setGuideOpen(true)}
                focusAreas={focusAreas} onFocusToggle={toggleFocus}
                startSecs={startSecs} durationSecs={durationSecs} targetFps={targetFps}
                onStartSecs={setStartSecs} onDurationSecs={setDurationSecs} onTargetFps={setTargetFps}
              />
            </div>

            {/* Conditional parameter cards */}
            <div>
                {/* Running inputs */}
                {form.isRunning && (
                  <Card icon="🏃" title="Running Parameters" subtitle="Unlocks stride length, GCT, and context-aware norms" className="no-mb" style={{ marginTop: 12 }}>
                    <div className="form-grid">
                      <div className="form-group">
                        <label className="form-label">Treadmill Speed <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(unlocks stride length)</span></label>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input type="number" placeholder="e.g. 6.0" min={0.5} max={30} step={0.1} style={{ flex: 1 }}
                            value={running.inputs.treadmillSpeed}
                            onChange={e => running.setField('treadmillSpeed', e.target.value)} />
                          <select style={{ width: 72, flexShrink: 0 }} value={running.inputs.speedUnit}
                            onChange={e => running.setField('speedUnit', e.target.value as typeof running.inputs.speedUnit)}>
                            <option value="mph">mph</option>
                            <option value="kph">km/h</option>
                            <option value="mps">m/s</option>
                          </select>
                        </div>
                        <div style={{ fontSize: '.68rem', color: 'var(--muted)', marginTop: 3 }}>Leave blank for overground running</div>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Treadmill Incline</label>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <input type="number" placeholder="0" min={-5} max={15} step={0.5} style={{ flex: 1 }}
                            value={running.inputs.treadmillIncline}
                            onChange={e => running.setField('treadmillIncline', e.target.value)} />
                          <span style={{ fontSize: '.85rem', color: 'var(--muted)', paddingRight: 4, flexShrink: 0 }}>%</span>
                        </div>
                        <div style={{ fontSize: '.68rem', color: 'var(--muted)', marginTop: 3 }}>Affects hip extension norms</div>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Running Surface</label>
                        <select value={running.inputs.runningSurface}
                          onChange={e => running.setField('runningSurface', e.target.value as typeof running.inputs.runningSurface)}>
                          <option value="treadmill">Treadmill</option>
                          <option value="track">Track</option>
                          <option value="road">Road / Pavement</option>
                          <option value="trail">Trail</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Video Frame Rate <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(60fps+ enables GCT)</span></label>
                        <select value={running.inputs.videoFps}
                          onChange={e => running.setField('videoFps', parseInt(e.target.value, 10))}>
                          <option value={30}>30 fps — standard</option>
                          <option value={60}>60 fps — slo-mo</option>
                          <option value={120}>120 fps — high slo-mo</option>
                          <option value={240}>240 fps — super slo-mo</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Shoe Type</label>
                        <select value={running.inputs.shoe}
                          onChange={e => running.setField('shoe', e.target.value as typeof running.inputs.shoe)}>
                          <option value="">Not specified</option>
                          <option value="standard">Standard / Neutral</option>
                          <option value="stability">Motion Control / Stability</option>
                          <option value="minimalist">Minimalist / Zero-drop</option>
                          <option value="carbon">Carbon Plate Racing</option>
                          <option value="maximalist">Maximalist (Hoka-style)</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Running Experience</label>
                        <select value={running.inputs.experience}
                          onChange={e => running.setField('experience', e.target.value as typeof running.inputs.experience)}>
                          <option value="">Not specified</option>
                          <option value="beginner">Beginner (&lt;1 yr)</option>
                          <option value="recreational">Recreational</option>
                          <option value="competitive">Competitive</option>
                          <option value="elite">Elite</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--teal-light)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input type="checkbox" id="includeFootwear" checked={running.inputs.includeFootwear}
                        onChange={e => running.setField('includeFootwear', e.target.checked)}
                        style={{ width: 16, height: 16, accentColor: 'var(--teal)', flexShrink: 0 }} />
                      <label htmlFor="includeFootwear" style={{ fontSize: '.8rem', color: 'var(--teal)', fontWeight: 600, cursor: 'pointer' }}>
                        👟 Include footwear recommendation in report
                        <span style={{ fontWeight: 400, color: 'var(--muted)', display: 'block', fontSize: '.72rem', marginTop: 1 }}>Based on pronation, foot strike, and hip adduction data — adds a shoe category suggestion to the clinical report</span>
                      </label>
                    </div>
                  </Card>
                )}

                {/* Jump / Landing inputs */}
                {form.isJump && (
                  <Card icon="🦘" title="Jump / Landing Parameters" subtitle="Unlocks ACL risk scoring, bilateral LSI, and landing phase detection" className="no-mb" style={{ marginTop: 12 }}>
                    <div className="form-grid">
                      <div className="form-group">
                        <label className="form-label">Video Frame Rate <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(120fps+ strongly recommended)</span></label>
                        <select value={jump.inputs.videoFps}
                          onChange={e => jump.setField('videoFps', parseInt(e.target.value, 10))}>
                          <option value={30}>30 fps — landing mechanics may be missed</option>
                          <option value={60}>60 fps — marginal for landing</option>
                          <option value={120}>120 fps — recommended minimum</option>
                          <option value={240}>240 fps — optimal for ACL screening</option>
                        </select>
                        <div style={{ fontSize: '.68rem', color: 'var(--muted)', marginTop: 3 }}>Landing happens in 40-100ms. At 30fps = 1-3 frames captured.</div>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Post-Op / Involved Limb</label>
                        <select value={jump.inputs.involvedLimb}
                          onChange={e => jump.setField('involvedLimb', e.target.value as JumpInvolvedLimb)}>
                          <option value="">Not applicable</option>
                          <option value="left">Left limb (post-op / involved)</option>
                          <option value="right">Right limb (post-op / involved)</option>
                          <option value="bilateral">Bilateral / primary prevention</option>
                        </select>
                        <div style={{ fontSize: '.68rem', color: 'var(--muted)', marginTop: 3 }}>Sets ACL LSI threshold comparisons in the report</div>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Protocol / Box Height</label>
                        <select value={jump.inputs.protocol}
                          onChange={e => jump.setField('protocol', e.target.value as JumpProtocol)}>
                          <option value="">Standard / not specified</option>
                          <option value="30cm">Drop Jump — 30cm box</option>
                          <option value="45cm">Drop Jump — 45cm box</option>
                          <option value="dvj">Drop Vertical Jump (DVJ)</option>
                          <option value="3hop">Triple Hop for Distance</option>
                          <option value="custom">Custom protocol</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Time Post-Op <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(if applicable)</span></label>
                        <select value={jump.inputs.timePostOp}
                          onChange={e => jump.setField('timePostOp', e.target.value as JumpTimePostOp)}>
                          <option value="">Not applicable</option>
                          <option value="3mo">3 months</option>
                          <option value="6mo">6 months</option>
                          <option value="9mo">9 months</option>
                          <option value="12mo">12 months</option>
                          <option value=">12mo">&gt;12 months</option>
                        </select>
                        <div style={{ fontSize: '.68rem', color: 'var(--muted)', marginTop: 3 }}>Contextualises findings against return-to-sport timelines</div>
                      </div>
                    </div>
                    <div style={{ marginTop: 12, padding: '10px 14px', background: '#fff3cd', borderRadius: 8, border: '1px solid #ffc107', fontSize: '.76rem', color: '#7d5a00', lineHeight: 1.6 }}>
                      <strong>⚠️ Slow-motion video guidance:</strong>{' '}
                      iPhone: Camera → Video → tap the frame rate icon (top right) → select 120 or 240fps &nbsp;·&nbsp;
                      Samsung: Pro Video → 120fps &nbsp;·&nbsp;
                      Older phones: use a slow-mo app (Slow Motion Video FX, or SloPro).
                      Export and upload the original file — do not screen-record.
                    </div>
                  </Card>
                )}

                {/* Tape Markers */}
                {form.showTapeMarkers && <TapeMarkerCard />}
            </div>

            {/* PROMs */}
            <PROMs
              lefsScores={proms.lefsScores} lefsTotal={proms.lefsTotal} onLefsScore={proms.setLefsScore}
              odiScores={proms.odiScores} odiScore={proms.odiScore} onOdiScore={proms.setOdiScore}
              nprs={proms.nprs} onNprs={proms.patchNprs}
              psfs={proms.psfs} onPsfsItem={proms.setPsfsItem}
              lsiInjured={proms.lsiInjured} onLsiInjured={proms.setLsiInjured}
              lsiUninjured={proms.lsiUninjured} onLsiUninjured={proms.setLsiUninjured}
              lsi={proms.lsi}
            />

            <BrandingCard branding={branding.branding} onChange={branding.setField} />

            {/* API key card */}
            <Card icon="🔑" title="Anthropic API Key" subtitle="Required to run AI analysis — never stored or sent anywhere except Anthropic" style={{ marginBottom: 16, borderColor: '#f0c040', background: '#fffdf0' }}>
              <div className="form-group">
                <label className="form-label">API Key</label>
                <input type="password" placeholder="sk-ant-..." autoComplete="off" style={{ fontFamily: 'monospace' }}
                  value={apiKey} onChange={e => setApiKey(e.target.value)} />
              </div>
              <p style={{ fontSize: '.74rem', color: '#92600a', marginTop: 10 }}>
                🔒 Your key is used only for this request and is never saved. Get your key at{' '}
                <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{ color: '#92600a' }}>console.anthropic.com</a>
              </p>
            </Card>

            <div className="error-box" id="errorBox" style={apiError ? { display: 'block' } : undefined}>
              {apiError}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, padding: '10px 14px', background: 'var(--navy-light)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <input type="checkbox" id="enableLandmarkReview" checked={enableLandmarkReview}
                onChange={e => setLandmarkReview(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: 'var(--teal)', flexShrink: 0 }} />
              <label htmlFor="enableLandmarkReview" style={{ cursor: 'pointer' }}>
                <span style={{ fontSize: '.82rem', fontWeight: 600, color: 'var(--navy)' }}>✏️ Review &amp; correct landmarks before report</span>
                <span style={{ display: 'block', fontSize: '.72rem', color: 'var(--muted)', marginTop: 1 }}>Pause after tracking to drag any misplaced joint markers to the correct position</span>
              </label>
            </div>

            <button className="analyze-btn" onClick={handleAnalyze} disabled={isAnalyzing}>
              {isAnalyzing ? '⏳ Analysing…' : <><span>🔬</span> Generate Clinical Report</>}
            </button>
          </div>
        )}

        {/* LOADING STATE */}
        {isAnalyzing && (
          <LoadingState stage={video.analysis.stage} label={video.analysis.stageLabel} hasDualView={!!video.secondary.file} />
        )}

        {/* ERROR STATE */}
        {video.analysis.stage === 'error' && (
          <div className="card" style={{ marginTop: 20 }}>
            <div className="error-box" style={{ display: 'block' }}>{video.analysis.error}</div>
            <button className="analyze-btn" style={{ marginTop: 14 }} onClick={video.reset}>Try Again</button>
          </div>
        )}

        {/* RESULTS */}
        {hasResults && video.analysis.report && (
          <ResultsSection
            report={video.analysis.report}
            patient={form.form}
            branding={branding.branding}
            annotatedFrames={video.primary.annotatedFrames}
            annotatedFrames2={video.secondary.annotatedFrames}
            gifData={video.primary.gifData}
            onNewAssessment={video.reset}
            onSaveSession={() => {/* TODO */}}
            onExportPdf={() => {/* TODO */}}
            onCompare={() => {/* TODO */}}
          />
        )}
      </div>

      {/* Camera guide modal */}
      {guideOpen && (() => {
        const guide = CAMERA_GUIDES[form.form.movementType] ?? CAMERA_GUIDES['_default'];
        return (
          <div className="guide-modal open">
            <div className="guide-box">
              <h3>{guide.title}</h3>
              <p className="guide-sub">{guide.sub}</p>
              {guide.tips.map((tip, i) => (
                <div key={i} className="guide-tip">
                  <div className="guide-icon">{tip.icon}</div>
                  <div className="guide-tip-text">
                    <strong>{tip.title}</strong>
                    <span>{tip.desc}</span>
                  </div>
                </div>
              ))}
              <button className="guide-close" onClick={() => setGuideOpen(false)}>Got it</button>
            </div>
          </div>
        );
      })()}
    </>
  );
}
