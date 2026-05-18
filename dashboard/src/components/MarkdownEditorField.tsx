import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { githubLight } from '@uiw/codemirror-theme-github';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownEditorFieldProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  minHeight?: number;
}

export function MarkdownEditorField({
  label,
  value,
  onChange,
  minHeight = 400,
}: MarkdownEditorFieldProps) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [expanded]);

  return (
    <>
      <div className="space-y-1.5">
        <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </label>
        <div className="overflow-hidden rounded-md border border-input shadow-sm">
          <div className="flex border-b border-input bg-muted/30 items-center">
            <div className="flex-1 px-3 py-1.5 text-xs font-medium text-muted-foreground border-r border-input">
              Editor
            </div>
            <div className="flex-1 px-3 py-1.5 text-xs font-medium text-muted-foreground">
              Preview
            </div>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              title="Expand"
              aria-label="Expand editor"
            >
              ⛶
            </button>
          </div>
          <div className="flex" style={{ height: minHeight }}>
            <div className="flex-1 overflow-auto border-r border-input">
              <CodeMirror
                value={value}
                height={`${minHeight}px`}
                extensions={[markdown()]}
                theme={githubLight}
                onChange={onChange}
                basicSetup={{
                  lineNumbers: false,
                  foldGutter: false,
                  dropCursor: false,
                  allowMultipleSelections: false,
                  indentOnInput: false,
                }}
              />
            </div>
            <div className="flex-1 overflow-y-auto bg-muted/10 p-4" style={{ height: minHeight }}>
              {value.trim() ? (
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground/60 italic select-none">
                  Preview will appear here…
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {expanded &&
        createPortal(
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 50 }}
            className="bg-black/50 flex items-center justify-center"
          >
            <div
              className="bg-background rounded-lg shadow-xl flex flex-col overflow-hidden"
              style={{ width: '90vw', height: '85vh' }}
            >
              <div className="flex items-center border-b border-input bg-muted/30 shrink-0">
                <span className="flex-1 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {label}
                </span>
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="px-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  ✕ Close
                </button>
              </div>
              <div className="flex border-b border-input bg-muted/30 shrink-0">
                <div className="flex-1 px-3 py-1.5 text-xs font-medium text-muted-foreground border-r border-input">
                  Editor
                </div>
                <div className="flex-1 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                  Preview
                </div>
              </div>
              <div className="flex flex-1 overflow-hidden">
                <div className="flex-1 overflow-auto border-r border-input">
                  <CodeMirror
                    value={value}
                    height="100%"
                    extensions={[markdown()]}
                    theme={githubLight}
                    onChange={onChange}
                    basicSetup={{
                      lineNumbers: false,
                      foldGutter: false,
                      dropCursor: false,
                      allowMultipleSelections: false,
                      indentOnInput: false,
                    }}
                  />
                </div>
                <div className="flex-1 overflow-y-auto bg-muted/10 p-4">
                  {value.trim() ? (
                    <div className="prose prose-sm max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground/60 italic select-none">
                      Preview will appear here…
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
