import { X } from 'lucide-react';
import { MultiSelectDropdown } from '@/components/ui/multi-select-dropdown';
import type { Archetype } from '@/lib/types';

export function EmployeeMultiSelect({
  archetypes,
  selectedIds,
  onToggle,
  onClearAll,
}: {
  archetypes: Pick<Archetype, 'id' | 'role_name'>[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onClearAll: () => void;
}) {
  const options = archetypes.map((a) => ({ value: a.id, label: a.role_name ?? a.id }));

  const showAllButton = (close: () => void) =>
    selectedIds.size > 0 ? (
      <button
        type="button"
        onClick={() => {
          onClearAll();
          close();
        }}
        className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      >
        <X className="h-3 w-3" />
        Show all employees
      </button>
    ) : null;

  return (
    <MultiSelectDropdown
      options={options}
      selected={selectedIds}
      onToggle={onToggle}
      placeholder="All employees"
      width="w-56"
      headerContent={showAllButton}
      searchPlaceholder="Search employees..."
      emptyMessage="No employees found"
      selectionCountLabel="employees"
      listMaxHeight="max-h-52"
      dropdownMinWidth="min-w-[14rem]"
    />
  );
}
