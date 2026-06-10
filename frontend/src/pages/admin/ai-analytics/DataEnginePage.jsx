import { useState, useCallback } from 'react';
import { useDataEngineAudio } from './useDataEngineAudio';
import { FinancialPageShell, FinancialBreadcrumb, WizardNav, TickerTape, WIZARD_STEPS } from './dataEngineShared';

import DataEngineIndex       from './DataEngineIndex';
import DataEngineExportFlow  from './DataEngineExportFlow';
import DataEngineSourceStep  from './DataEngineSourceStep';
import DataEngineUploadStep  from './DataEngineUploadStep';
import DataEngineConfigureStep from './DataEngineConfigureStep';
import DataEngineDiffStep    from './DataEngineDiffStep';
import DataEngineResultsStep from './DataEngineResultsStep';

// ── Routing constants ─────────────────────────────────────────────────────────
const VIEW = {
    INDEX:     'index',
    EXPORT:    'export',
    SOURCE:    'source',
    UPLOAD:    'upload',
    CONFIGURE: 'configure',
    DIFF:      'diff',
    RESULTS:   'results',
};

const DIFF_VIEWS = [VIEW.SOURCE, VIEW.UPLOAD, VIEW.CONFIGURE, VIEW.DIFF, VIEW.RESULTS];

// Map view → WIZARD_STEPS key
const VIEW_TO_STEP = {
    [VIEW.SOURCE]:    'source',
    [VIEW.UPLOAD]:    'upload',
    [VIEW.CONFIGURE]: 'configure',
    [VIEW.DIFF]:      'diff',
    [VIEW.RESULTS]:   'results',
};

export default function DataEnginePage() {
    const audio = useDataEngineAudio();

    // ── Routing ───────────────────────────────────────────────────────────────
    const [view, setView]           = useState(VIEW.INDEX);
    const [ambientOn, setAmbientOn] = useState(false);

    // ── Diff wizard state ─────────────────────────────────────────────────────
    const [source,        setSource]        = useState('');
    const [periodStart,   setPeriodStart]   = useState('');
    const [periodEnd,     setPeriodEnd]     = useState('');
    const [uploadedFile,  setUploadedFile]  = useState(null);   // File object
    const [fileHeaders,   setFileHeaders]   = useState([]);     // string[]
    const [detection,     setDetection]     = useState(null);   // { column, confidence, candidates }
    const [identifierCol, setIdentifierCol] = useState('');
    const [diffResult,    setDiffResult]    = useState(null);   // full diff response
    const [sessionResult, setSessionResult] = useState(null);   // { id, session_number, lines_created }

    // ── Navigation helpers ────────────────────────────────────────────────────
    const goTo = useCallback((target) => {
        audio.playTick();
        setView(target);
    }, [audio]);

    const resetDiffWizard = useCallback(() => {
        setSource('');
        setPeriodStart('');
        setPeriodEnd('');
        setUploadedFile(null);
        setFileHeaders([]);
        setDetection(null);
        setIdentifierCol('');
        setDiffResult(null);
        setSessionResult(null);
    }, []);

    const handleBackToIndex = useCallback(() => {
        audio.playDelete();
        resetDiffWizard();
        setView(VIEW.INDEX);
    }, [audio, resetDiffWizard]);

    // ── Breadcrumb builder ────────────────────────────────────────────────────
    const buildBreadcrumb = () => {
        const base = [{ label: 'ADMIN' }, { label: 'DATA ENGINE', onClick: handleBackToIndex }];

        if (view === VIEW.INDEX)  return [...base];
        if (view === VIEW.EXPORT) return [...base, { label: 'SMART EXPORT' }];

        const stepLabel = WIZARD_STEPS.find(s => s.key === VIEW_TO_STEP[view])?.label;
        return [...base, { label: 'IMPORT + DIFF' }, ...(stepLabel ? [{ label: stepLabel }] : [])];
    };

    const isDiffWizard = DIFF_VIEWS.includes(view);

    // ── Shared step props for diff wizard pages ───────────────────────────────
    const stepProps = {
        audio,
        source,        setSource,
        periodStart,   setPeriodStart,
        periodEnd,     setPeriodEnd,
        uploadedFile,  setUploadedFile,
        fileHeaders,   setFileHeaders,
        detection,     setDetection,
        identifierCol, setIdentifierCol,
        diffResult,    setDiffResult,
        sessionResult, setSessionResult,
        onNext: (target) => goTo(target || nextStep(view)),
        onBack: (target) => goTo(target || prevStep(view)),
        onReset: () => { resetDiffWizard(); goTo(VIEW.INDEX); },
    };

    return (
        <FinancialPageShell audio={audio} ambientOn={ambientOn} setAmbientOn={setAmbientOn}>
            <FinancialBreadcrumb items={buildBreadcrumb()} onHover={audio.playHover} />

            {/* Wizard nav — only shown during diff steps */}
            {isDiffWizard && (
                <WizardNav
                    steps={WIZARD_STEPS}
                    currentStep={VIEW_TO_STEP[view]}
                    onHover={audio.playHover}
                />
            )}

            <TickerTape />

            {/* ── Route ── */}
            {view === VIEW.INDEX && (
                <DataEngineIndex
                    audio={audio}
                    onSelectExport={() => goTo(VIEW.EXPORT)}
                    onSelectDiff={() => goTo(VIEW.SOURCE)}
                />
            )}

            {view === VIEW.EXPORT && (
                <DataEngineExportFlow
                    audio={audio}
                    onBack={handleBackToIndex}
                />
            )}

            {view === VIEW.SOURCE && (
                <DataEngineSourceStep
                    {...stepProps}
                    onNext={() => goTo(VIEW.UPLOAD)}
                    onBack={handleBackToIndex}
                />
            )}

            {view === VIEW.UPLOAD && (
                <DataEngineUploadStep
                    {...stepProps}
                    onNext={() => goTo(VIEW.CONFIGURE)}
                    onBack={() => goTo(VIEW.SOURCE)}
                />
            )}

            {view === VIEW.CONFIGURE && (
                <DataEngineConfigureStep
                    {...stepProps}
                    onNext={() => goTo(VIEW.DIFF)}
                    onBack={() => goTo(VIEW.UPLOAD)}
                />
            )}

            {view === VIEW.DIFF && (
                <DataEngineDiffStep
                    {...stepProps}
                    onNext={() => goTo(VIEW.RESULTS)}
                    onBack={() => goTo(VIEW.CONFIGURE)}
                />
            )}

            {view === VIEW.RESULTS && (
                <DataEngineResultsStep
                    {...stepProps}
                    onBack={() => goTo(VIEW.DIFF)}
                    onNewDiff={() => { resetDiffWizard(); goTo(VIEW.SOURCE); }}
                />
            )}
        </FinancialPageShell>
    );
}

// ── Step order helpers ────────────────────────────────────────────────────────
function nextStep(current) {
    const idx = DIFF_VIEWS.indexOf(current);
    return DIFF_VIEWS[idx + 1] ?? current;
}

function prevStep(current) {
    const idx = DIFF_VIEWS.indexOf(current);
    return DIFF_VIEWS[idx - 1] ?? VIEW.INDEX;
}
