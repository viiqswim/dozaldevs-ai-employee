export type CiFailureCategory = 'substantive' | 'infra' | 'unknown';

export interface CheckRun {
  name: string;
  conclusion: string;
  output?: { title?: string; summary?: string };
}

export function classifyCiFailure(checkRun: CheckRun): CiFailureCategory {
  const name = checkRun.name.toLowerCase();
  const title = (checkRun.output?.title ?? '').toLowerCase();

  const infraPattern = /setup|install|cache|docker|deploy|publish|registry|network|timeout/;
  if (infraPattern.test(name) || infraPattern.test(title)) {
    return 'infra';
  }

  if (/lint|test|build|typecheck|type-check|e2e/.test(name)) {
    return 'substantive';
  }

  return 'unknown';
}

export function summarizeCheckRuns(checkRuns: CheckRun[]): {
  substantive: number;
  infra: number;
  unknown: number;
  failed: boolean;
} {
  const failed = checkRuns.filter((cr) => cr.conclusion === 'failure');
  const categories = failed.map((cr) => classifyCiFailure(cr));
  return {
    substantive: categories.filter((c) => c === 'substantive').length,
    infra: categories.filter((c) => c === 'infra').length,
    unknown: categories.filter((c) => c === 'unknown').length,
    failed: categories.some((c) => c === 'substantive'),
  };
}
