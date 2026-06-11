import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { ComposioToolkit } from '@/lib/types';

export interface IntegrationCardProps {
  toolkit: ComposioToolkit;
  onConnect: (slug: string) => void;
  onDisconnect: (slug: string) => void;
}

// Hardcoded complete Tailwind class pairs — required so the build scanner
// detects them and does not purge these color utilities.
const AVATAR_COLORS: ReadonlyArray<readonly [string, string]> = [
  ['bg-blue-100', 'text-blue-700'],
  ['bg-purple-100', 'text-purple-700'],
  ['bg-orange-100', 'text-orange-700'],
  ['bg-green-100', 'text-green-700'],
  ['bg-rose-100', 'text-rose-700'],
  ['bg-amber-100', 'text-amber-700'],
  ['bg-cyan-100', 'text-cyan-700'],
  ['bg-indigo-100', 'text-indigo-700'],
] as const;

function getAvatarClasses(name: string): readonly [string, string] {
  const index = name.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

interface LogoTileProps {
  toolkit: ComposioToolkit;
}

function LogoTile({ toolkit }: LogoTileProps) {
  const [imgError, setImgError] = useState(false);
  const showFallback = !toolkit.logo || imgError;
  const [bgColor, textColor] = getAvatarClasses(toolkit.name);

  if (showFallback) {
    return (
      <div
        className={cn(
          'h-12 w-12 flex-shrink-0 rounded-lg flex items-center justify-center select-none',
          bgColor,
          textColor,
        )}
        aria-hidden="true"
      >
        <span className="font-semibold text-lg leading-none">
          {toolkit.name.charAt(0).toUpperCase()}
        </span>
      </div>
    );
  }

  return (
    <div className="h-12 w-12 flex-shrink-0 rounded-lg bg-muted/50 flex items-center justify-center overflow-hidden">
      <img
        src={toolkit.logo as string}
        width={48}
        height={48}
        alt={`${toolkit.name} logo`}
        loading="lazy"
        className="object-contain"
        onError={() => setImgError(true)}
      />
    </div>
  );
}

interface ActionAreaProps {
  toolkit: ComposioToolkit;
  onConnect: (slug: string) => void;
  onDisconnect: (slug: string) => void;
}

function ActionArea({ toolkit, onConnect, onDisconnect }: ActionAreaProps) {
  if (toolkit.connected) {
    return (
      <div className="flex items-center gap-2 flex-wrap justify-end">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          Connected
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDisconnect(toolkit.slug)}
          className="text-xs text-muted-foreground hover:text-destructive"
        >
          Disconnect
        </Button>
      </div>
    );
  }

  if (toolkit.connectable) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => onConnect(toolkit.slug)}
        className="text-xs"
      >
        Connect {toolkit.name}
      </Button>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* span wrapper needed: Radix TooltipTrigger does not fire on a disabled button */}
          <span tabIndex={0} className="inline-flex">
            <Button
              variant="ghost"
              size="sm"
              disabled
              className="text-xs text-muted-foreground cursor-not-allowed pointer-events-none"
            >
              Not yet available
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>Coming soon — ask to enable this app</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function IntegrationCard({ toolkit, onConnect, onDisconnect }: IntegrationCardProps) {
  const description = toolkit.description ?? toolkit.categories[0]?.name ?? null;

  return (
    <div
      className={cn(
        'rounded-lg border bg-card px-5 py-4',
        'flex flex-col gap-3',
        'motion-safe:hover:shadow-md motion-safe:hover:border-border/80 motion-safe:transition-[box-shadow] motion-safe:duration-200',
        'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
      )}
    >
      <div className="flex items-start gap-3">
        <LogoTile toolkit={toolkit} />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-foreground truncate">{toolkit.name}</p>
          {description && (
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{description}</p>
          )}
          {toolkit.categories.length > 0 && (
            <Badge variant="secondary" className="mt-1.5 text-xs w-fit">
              {toolkit.categories[0].name}
            </Badge>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end pt-1 mt-auto">
        <ActionArea toolkit={toolkit} onConnect={onConnect} onDisconnect={onDisconnect} />
      </div>
    </div>
  );
}
