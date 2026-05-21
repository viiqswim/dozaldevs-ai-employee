import { MarkdownEditorField } from '../../../components/MarkdownEditorField';
import { MarkdownPreview } from '../../../components/MarkdownPreview';
import { Button } from '@/components/ui/button';

interface InlineEditableMarkdownProps {
  value: string;
  onChange: (v: string) => void;
  onSave: () => Promise<void>;
  onCancel: () => void;
  label: string;
  subtitle?: string;
  editing: boolean;
  saving?: boolean;
  error?: string | null;
  emptyText?: string;
  minHeight?: number;
}

export function InlineEditableMarkdown({
  value,
  onChange,
  onSave,
  onCancel,
  label,
  editing,
  saving = false,
  error,
  emptyText,
  minHeight,
}: InlineEditableMarkdownProps) {
  if (!editing) {
    if (!value?.trim()) {
      return (
        <p className="text-sm text-muted-foreground italic">
          {emptyText ?? 'Nothing configured yet.'}
        </p>
      );
    }
    return <MarkdownPreview content={value} />;
  }

  return (
    <div className="space-y-2">
      <MarkdownEditorField
        label={label}
        value={value}
        onChange={onChange}
        minHeight={minHeight ?? 300}
      />
      <div className="flex items-center gap-2 pt-2">
        <Button size="sm" disabled={saving} onClick={() => void onSave()}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="outline" size="sm" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}
