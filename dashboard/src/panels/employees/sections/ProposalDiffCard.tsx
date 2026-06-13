import { useState } from 'react';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

const FIELD_LABELS: Record<'identity' | 'execution_steps' | 'delivery_steps' | 'overview', string> =
  {
    identity: 'Personality',
    execution_steps: 'How it works',
    delivery_steps: 'How it delivers',
    overview: 'Overview',
  };

interface ProseChange {
  field: 'identity' | 'execution_steps' | 'delivery_steps' | 'overview';
  before: string;
  after: string;
}

export interface ProposalDiffCardProps {
  proseChanges: ProseChange[];
  toolDelta?: { added: string[]; removed: string[] };
  approvalChange?: { from: boolean; to: boolean };
  triggerChange?: { before: string; after: string };
  inputChange?: { added: string[]; removed: string[] };
  onApprove: () => void;
  onDeny: () => void;
  onRefineSubmit?: (text: string) => void;
  busy?: boolean;
}

export function ProposalDiffCard({
  proseChanges,
  toolDelta,
  approvalChange,
  triggerChange,
  inputChange,
  onApprove,
  onDeny,
  onRefineSubmit,
  busy = false,
}: ProposalDiffCardProps) {
  const [splitView, setSplitView] = useState(false);
  const [approvalConfirmed, setApprovalConfirmed] = useState(false);
  const [showRefine, setShowRefine] = useState(false);
  const [refineText, setRefineText] = useState('');

  const requiresApprovalConfirm = approvalChange?.to === false;
  const approveDisabled = busy || (requiresApprovalConfirm && !approvalConfirmed);

  const hasToolChanges = toolDelta && (toolDelta.added.length > 0 || toolDelta.removed.length > 0);
  const hasInputChanges =
    inputChange && (inputChange.added.length > 0 || inputChange.removed.length > 0);
  const hasChanges =
    proseChanges.length > 0 ||
    hasToolChanges ||
    approvalChange !== undefined ||
    triggerChange !== undefined ||
    hasInputChanges;

  return (
    <div className="rounded-lg border bg-card px-5 py-4 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Proposed changes</h2>
        {proseChanges.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setSplitView((v) => !v)} disabled={busy}>
            {splitView ? 'Inline view' : 'Side-by-side'}
          </Button>
        )}
      </div>

      {proseChanges.map((change) => (
        <div key={change.field} className="space-y-1">
          <p className="text-sm font-medium text-foreground">{FIELD_LABELS[change.field]}</p>
          <div className="rounded-md overflow-hidden border text-sm">
            <ReactDiffViewer
              oldValue={change.before}
              newValue={change.after}
              splitView={splitView}
              compareMethod={DiffMethod.WORDS}
              useDarkTheme={false}
            />
          </div>
        </div>
      ))}

      {hasToolChanges && (
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Capabilities</p>
          <ul className="space-y-1">
            {toolDelta!.added.map((tool) => (
              <li
                key={`add-${tool}`}
                className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400"
              >
                <span aria-hidden="true">＋</span>
                <span>Can now use: {tool}</span>
              </li>
            ))}
            {toolDelta!.removed.map((tool) => (
              <li key={`rm-${tool}`} className="flex items-center gap-1.5 text-sm text-destructive">
                <span aria-hidden="true">－</span>
                <span>No longer uses: {tool}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {approvalChange !== undefined && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">Approval setting</p>
          {approvalChange.to === true ? (
            <p className="text-sm text-foreground">
              This employee will ask you to approve actions before taking them.
            </p>
          ) : (
            <>
              <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 dark:bg-amber-950/30 dark:border-amber-800">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  ⚠️ This employee will act WITHOUT asking you first.
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  Once approved, tasks will run automatically — no approval step.
                </p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <Checkbox
                  checked={approvalConfirmed}
                  onCheckedChange={(v) => setApprovalConfirmed(v === true)}
                  disabled={busy}
                  id="approval-confirm"
                />
                <span className="text-sm">
                  I understand this employee will act without my approval
                </span>
              </label>
            </>
          )}
        </div>
      )}

      {triggerChange && (
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Schedule</p>
          <p className="text-sm text-muted-foreground">
            Runs: <span className="text-foreground">{triggerChange.before}</span>
            {' → '}
            <span className="text-foreground font-medium">{triggerChange.after}</span>
          </p>
        </div>
      )}

      {hasInputChanges && (
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Required information</p>
          <ul className="space-y-1">
            {inputChange!.added.map((field) => (
              <li
                key={`iadd-${field}`}
                className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400"
              >
                <span aria-hidden="true">＋</span>
                <span>Now asks you for: {field}</span>
              </li>
            ))}
            {inputChange!.removed.map((field) => (
              <li
                key={`irm-${field}`}
                className="flex items-center gap-1.5 text-sm text-muted-foreground"
              >
                <span aria-hidden="true">－</span>
                <span>No longer asks for: {field}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!hasChanges && <p className="text-sm text-muted-foreground italic">No changes proposed.</p>}

      {showRefine && (
        <div className="space-y-2">
          <textarea
            className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring min-h-[80px]"
            placeholder="Describe what you'd like changed…"
            value={refineText}
            onChange={(e) => setRefineText(e.target.value)}
            disabled={busy}
            aria-label="Refinement request"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={busy || !refineText.trim()}
              onClick={() => {
                onRefineSubmit?.(refineText.trim());
                setRefineText('');
                setShowRefine(false);
              }}
            >
              Submit
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setShowRefine(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 pt-1 border-t">
        <Button onClick={onApprove} disabled={approveDisabled}>
          Approve
        </Button>
        <Button variant="outline" onClick={onDeny} disabled={busy}>
          Deny
        </Button>
        {onRefineSubmit && !showRefine && (
          <Button variant="ghost" onClick={() => setShowRefine(true)} disabled={busy}>
            Ask for more changes
          </Button>
        )}
      </div>
    </div>
  );
}
