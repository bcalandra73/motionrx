import type { AnalyzableMovement, MovementAnalyzer } from './types';
import { runningAnalyzer } from './analyzers/running';

const analyzers: Partial<Record<AnalyzableMovement, MovementAnalyzer>> = {
  Running: runningAnalyzer,
};

export function getAnalyzer(type: AnalyzableMovement): MovementAnalyzer {
  const analyzer = analyzers[type];
  if (!analyzer) throw new Error(`No analyzer registered for movement type: ${type}`);
  return analyzer;
}
