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
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      <div
        className="flex border border-input rounded-md overflow-hidden"
        style={{ height: minHeight }}
      >
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
        <div className="flex-1 overflow-y-auto p-4 bg-background" style={{ height: minHeight }}>
          {value.trim() ? (
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">Preview will appear here…</p>
          )}
        </div>
      </div>
    </div>
  );
}
