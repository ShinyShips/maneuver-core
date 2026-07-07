/**
 * @maneuver/core
 *
 * Year-agnostic FRC scouting framework
 *
 * This package provides the core infrastructure for building
 * custom FRC scouting applications that work offline-first.
 */

// Core Types
export * from './types';

// Database Layer
export * from './db';

// React Hooks
export * from './hooks';

// React Components
export * from './components';

// React Contexts
export * from './contexts';

// Utility Functions
export * from './lib';

// Remote sync protocol and supported backend adapters
export * from './core/sync';

// Game Interfaces (contracts for game-specific implementations)
export type {
  GameConfig,
  ScoringCalculations,
  ValidationRules,
  StrategyAnalysis,
  UIComponents,
} from './types/game-interfaces';
