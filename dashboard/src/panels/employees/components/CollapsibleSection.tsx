import React from 'react';
import { ChevronDown } from 'lucide-react';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';

interface CollapsibleSectionProps {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  actions?: React.ReactNode;
  badge?: React.ReactNode;
  id?: string;
}

export function CollapsibleSection({
  title,
  subtitle,
  defaultOpen = true,
  children,
  actions,
  badge,
  id,
}: CollapsibleSectionProps) {
  return (
    <Accordion type="single" collapsible defaultValue={defaultOpen ? 'section' : undefined}>
      <AccordionItem value="section" id={id} className="border-none">
        <AccordionTrigger className="group py-2 hover:no-underline [&>svg]:hidden">
          <div className="flex w-full items-center justify-between gap-2">
            <div className="flex flex-col items-start gap-0.5 text-left">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{title}</span>
                {badge}
              </div>
              {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {actions && (
                <div onClick={(e) => e.stopPropagation()} className="flex items-center">
                  {actions}
                </div>
              )}
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent>{children}</AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
