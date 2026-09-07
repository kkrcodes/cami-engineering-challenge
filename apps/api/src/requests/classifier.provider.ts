import { ClassificationResult } from './keyword-classifier';

/** DI token for the swappable classifier provider (keyword today, LLM later). */
export const CLASSIFIER_PROVIDER = 'CLASSIFIER_PROVIDER';

/**
 * A classification provider. `classify` is async so an implementation backed by
 * a network call (e.g. an LLM) is a drop-in replacement for the local keyword
 * one — callers already await it. Swapping providers is a one-line change to the
 * CLASSIFIER_PROVIDER binding in RequestsModule; no consumer code changes.
 */
export interface ClassifierProvider {
  /** Stable identifier recorded on each persisted classification, e.g. 'keyword'. */
  readonly name: string;
  classify(message: string): Promise<ClassificationResult>;
}
