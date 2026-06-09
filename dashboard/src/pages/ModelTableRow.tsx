import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { TableCell, TableRow } from '@/components/ui/table';
import { Pencil, Trash2 } from 'lucide-react';
import type { ModelCatalogEntry } from '@/lib/types';
import { computeCostTierLabel } from '@/lib/utils';
import {
  computeQualityTierLabel,
  COST_TIER_CLASS,
  GATEWAY_LABEL,
  GATEWAY_CLASS,
  QUALITY_TIER_CLASS,
} from '@/lib/model-badge-utils';

interface ModelTableRowProps {
  model: ModelCatalogEntry;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
  onToggleActive: (entry: ModelCatalogEntry) => void;
}

export function ModelTableRow({ model, onEdit, onRemove, onToggleActive }: ModelTableRowProps) {
  const costTier = computeCostTierLabel(
    model.input_cost_per_million,
    model.output_cost_per_million,
    model.is_free,
  );
  const qualityTier = computeQualityTierLabel(model.quality_index);

  return (
    <TableRow>
      <TableCell>
        <p className="font-medium text-sm">{model.display_name}</p>
        <p className="text-xs text-muted-foreground font-mono mt-0.5">{model.model_id}</p>
      </TableCell>
      <TableCell>
        <div className="flex gap-1 flex-wrap">
          {model.supported_gateways.map((gw) => (
            <Badge key={gw} variant="outline" className={GATEWAY_CLASS[gw] ?? ''}>
              {GATEWAY_LABEL[gw] ?? gw}
            </Badge>
          ))}
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className={COST_TIER_CLASS[costTier]}>
          {costTier}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className={QUALITY_TIER_CLASS[qualityTier]}>
          {qualityTier}
        </Badge>
      </TableCell>
      <TableCell>
        <span
          className={
            model.supports_tools ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'
          }
        >
          {model.supports_tools ? '✓' : '✗'}
        </span>
      </TableCell>
      <TableCell>
        <Switch
          checked={model.is_active}
          onCheckedChange={() => onToggleActive(model)}
          aria-label={`${model.is_active ? 'Deactivate' : 'Activate'} ${model.display_name}`}
        />
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(model.id)}
            aria-label={`Edit ${model.display_name}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => onRemove(model.id)}
            aria-label={`Remove ${model.display_name}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
