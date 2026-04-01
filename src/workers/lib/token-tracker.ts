export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number;
  model: string;
}

export interface AccumulatedUsage {
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number;
  primaryModelId: string;
}

export class TokenTracker {
  private _promptTokens = 0;
  private _completionTokens = 0;
  private _estimatedCostUsd = 0;
  private _primaryModelId = '';

  addUsage(usage: TokenUsage): void {
    this._promptTokens += usage.promptTokens;
    this._completionTokens += usage.completionTokens;
    // Accumulate cost with 4-decimal precision to avoid floating-point drift
    this._estimatedCostUsd =
      Math.round((this._estimatedCostUsd + usage.estimatedCostUsd) * 10_000) / 10_000;
    if (this._primaryModelId === '') {
      this._primaryModelId = usage.model;
    }
  }

  getAccumulated(): AccumulatedUsage {
    return {
      promptTokens: this._promptTokens,
      completionTokens: this._completionTokens,
      estimatedCostUsd: this._estimatedCostUsd,
      primaryModelId: this._primaryModelId,
    };
  }

  reset(): void {
    this._promptTokens = 0;
    this._completionTokens = 0;
    this._estimatedCostUsd = 0;
    this._primaryModelId = '';
  }
}
