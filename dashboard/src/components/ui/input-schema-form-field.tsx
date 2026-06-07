import { Input } from '@/components/ui/input';
import type { InputSchemaItem } from '@/lib/types';

const inputCls =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

const typeMap: Record<InputSchemaItem['type'], string> = {
  text: 'text',
  long_text: 'text',
  date: 'date',
  number: 'number',
  url: 'url',
  select: 'text',
};

export function InputSchemaFormField({
  item,
  value,
  onChange,
  fieldError,
}: {
  item: InputSchemaItem;
  value: string;
  onChange: (val: string) => void;
  fieldError?: string;
}) {
  const placeholder = item.description ?? `Enter ${item.label}`;

  let fieldEl: React.ReactNode;

  if (item.type === 'long_text') {
    fieldEl = (
      <textarea
        className={`${inputCls} min-h-[80px] resize-y`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    );
  } else if (item.type === 'select' && item.options && item.options.length > 0) {
    fieldEl = (
      <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select…</option>
        {item.options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  } else {
    fieldEl = (
      <Input
        type={typeMap[item.type]}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    );
  }

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">
        {item.label}
        {item.required && <span className="ml-1 text-destructive">*</span>}
      </label>
      {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
      {fieldEl}
      {fieldError && <p className="text-xs text-destructive">{fieldError}</p>}
    </div>
  );
}
