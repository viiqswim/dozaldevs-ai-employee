import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { ModelQuestionAnswers } from '@/lib/gateway';

interface QuestionOption {
  value: string;
  label: string;
}

interface Question {
  id: keyof ModelQuestionAnswers;
  text: string;
  options: QuestionOption[];
}

const QUESTIONS: Question[] = [
  {
    id: 'audience',
    text: 'Will this employee communicate directly with your customers, or is it for internal use only?',
    options: [
      { value: 'external', label: 'Customer-facing' },
      { value: 'internal', label: 'Internal only' },
    ],
  },
  {
    id: 'frequency',
    text: 'How often will this employee run?',
    options: [
      { value: 'frequent', label: 'Multiple times a day' },
      { value: 'daily', label: 'About once a day' },
      { value: 'rare', label: 'A few times a week or less' },
    ],
  },
  {
    id: 'speedPreference',
    text: 'Does this employee need to respond quickly, or is a few minutes fine?',
    options: [
      { value: 'fast', label: 'Speed matters' },
      { value: 'relaxed', label: 'A few minutes is fine' },
    ],
  },
];

interface ModelQuestionsStepProps {
  onSubmit: (answers: ModelQuestionAnswers) => void;
  onSkip: () => void;
  loading?: boolean;
}

export function ModelQuestionsStep({ onSubmit, onSkip, loading }: ModelQuestionsStepProps) {
  const [answers, setAnswers] = useState<Partial<ModelQuestionAnswers>>({});

  const allAnswered =
    answers.audience !== undefined &&
    answers.frequency !== undefined &&
    answers.speedPreference !== undefined;

  const handleSubmit = () => {
    if (!allAnswered) return;
    onSubmit(answers as ModelQuestionAnswers);
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg border bg-card px-5 py-4">
        <p className="text-sm font-medium">Help us pick the right AI model for your employee</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Answer 3 quick questions so we can recommend the best fit.
        </p>
      </div>

      {QUESTIONS.map((q, idx) => (
        <div key={q.id} className="rounded-lg border bg-card px-5 py-4 space-y-3">
          <p className="text-sm font-medium">
            <span className="text-muted-foreground mr-1.5">{idx + 1}.</span>
            {q.text}
          </p>
          <div className="flex flex-wrap gap-2">
            {q.options.map((option) => {
              const selected = answers[q.id] === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: option.value }))}
                  className={cn(
                    'rounded-md border px-3 py-1.5 text-sm transition-all',
                    selected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input bg-background text-foreground hover:border-muted-foreground/50 hover:bg-muted/40',
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          Skip — use default model
        </button>
        <Button onClick={handleSubmit} disabled={!allAnswered || loading}>
          {loading ? 'Finding recommendations…' : 'Get Recommendations'}
        </Button>
      </div>
    </div>
  );
}
