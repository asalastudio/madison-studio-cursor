/**
 * Parametric Dieline Generators
 *
 * Professional packaging dielines generated from dimensions
 */

export { generateTuckEndBox, type TuckEndBoxDimensions, type DielineOutput } from './tuck-end-box';

// Export all generator functions
export * from './roller-bottle-box';
export * from './candle-box';
export * from './bottle-label';
export * from './jar-box';

/**
 * Generator registry for easy lookup
 */
export const GENERATORS = {
  'tuck-end-box': 'generateTuckEndBox',
  'roller-bottle-box': 'generateRollerBottleBox',
  'candle-box': 'generateCandleBox',
  'bottle-label': 'generateBottleLabel',
  'jar-box': 'generateJarBox',
} as const;

export type GeneratorType = keyof typeof GENERATORS;
