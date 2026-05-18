import { useState, useEffect, useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { EditorView } from '@codemirror/view';
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handler = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const handleExpand = () => {
    if (!containerRef.current) return;
    if (isFullscreen) {
      document.exitFullscreen().catch(() => {});
    } else {
      containerRef.current.requestFullscreen().catch(() => {});
    }
  };

  const editorExtensions = [markdown(), EditorView.lineWrapping];

  const editorSetup = {
    lineNumbers: true,
    foldGutter: false,
    dropCursor: false,
    allowMultipleSelections: false,
    indentOnInput: false,
  };

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      <div
        ref={containerRef}
        className="overflow-hidden rounded-md border border-input shadow-sm bg-background"
        style={isFullscreen ? { display: 'flex', flexDirection: 'column' } : undefined}
      >
        <div className="flex border-b border-input bg-muted/30 items-center shrink-0">
          <div className="flex-1 px-3 py-1.5 text-xs font-medium text-muted-foreground border-r border-input">
            Editor
          </div>
          <div className="flex-1 px-3 py-1.5 text-xs font-medium text-muted-foreground">
            Preview
          </div>
          <button
            type="button"
            onClick={handleExpand}
            className="px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            ⛶
          </button>
        </div>

        <div
          className="flex"
          style={isFullscreen ? { flex: 1, overflow: 'hidden' } : { height: minHeight }}
        >
          <div className="flex-1 overflow-auto border-r border-input">
            <CodeMirror
              value={value}
              height={isFullscreen ? '100%' : `${minHeight}px`}
              extensions={editorExtensions}
              theme={githubLight}
              onChange={onChange}
              basicSetup={editorSetup}
            />
          </div>
          <div
            className="flex-1 overflow-y-auto bg-muted/10 p-4"
            style={isFullscreen ? { overflowY: 'auto' } : { height: minHeight }}
          >
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
  );
}
