/**
 * Game-Specific Scoring Sections Component
 * 
 * This component provides the scoring UI for both autonomous and teleop phases.
 * Teams customize this to match their game's scoring mechanics.
 * 
 * HOW TO CUSTOMIZE FOR YOUR GAME YEAR:
 * ====================================
 * 
 * 1. Define your game pieces (coral, algae, notes, cubes, etc.)
 * 2. Define scoring locations (reef, speaker, amp, etc.) with levels/positions
 * 3. Create buttons that call onAddAction with action objects
 * 4. Actions are timestamped and stored in an array
 * 5. Later transformed into counter fields for database storage
 * 
 * ACTION OBJECT STRUCTURE:
 * Define properties that describe the action. These will be mapped to counter fields
 * in transformation.ts. Use any properties that make sense for your game.
 * 
 * Simple example (placeholder pattern):
 * {
 *   actionType: 'action1' | 'action2' | 'action3',
 *   phase: 'auto' | 'teleop',    // Auto-added by parent
 *   timestamp: number             // Auto-added by parent
 * }
 * 
 * Complex example (2025 Reefscape pattern):
 * {
 *   type: 'score' | 'pickup' | 'action',  // Action category
 *   pieceType: 'coral' | 'algae',          // What game piece
 *   location: 'reef' | 'net' | 'station',  // Where it happened
 *   level?: 'l1' | 'l2' | 'l3' | 'l4',    // Optional: scoring level
 *   phase: 'auto' | 'teleop',              // Auto-added by parent
 *   timestamp: number                      // Auto-added by parent
 * }
 * 
 * REAL GAME EXAMPLES:
 * 
 * 2025 Reefscape:
 * - { type: 'score', pieceType: 'coral', location: 'reef', level: 'l1' }
 * - { type: 'score', pieceType: 'algae', location: 'net' }
 * - { type: 'pickup', pieceType: 'coral', location: 'station' }
 * 
 * 2024 Crescendo:
 * - { type: 'score', pieceType: 'note', location: 'speaker' }
 * - { type: 'score', pieceType: 'note', location: 'amp' }
 * - { type: 'pickup', pieceType: 'note', location: 'ground' }
 * 
 * INTERFACE:
 * - phase: 'auto' | 'teleop' - Current match phase
 * - onAddAction: (action) => void - Callback to record action (parent adds timestamp/phase)
 * - actions: any[] - Array of action objects with timestamps
 * 
 * DATA FLOW:
 * 1. User clicks button → ScoringSections calls onAddAction(actionObject)
 * 2. Parent page adds timestamp and stores in array: [...actions, { ...action, timestamp, phase }]
 * 3. Actions stored in localStorage during match (UI state only)
 * 4. At end of match, EndgamePage calls gameDataTransformation.transformActionsToCounters()
 * 5. Transformation converts action arrays → counter fields
 * 6. Counter fields saved to database (actions arrays discarded)
 * 7. Later analysis/validation uses counter fields from database
 * 
 * Example flow (placeholder):
 * Button click → { actionType: 'action1', phase: 'auto' }
 *             → Stored in autoActions array
 *             → Transformed to autoAction1Count: 1
 *             → Saved to database as counter field
 * 
 * Example flow (2025 Reefscape):
 * Button click → { type: 'score', pieceType: 'coral', location: 'reef', level: 'l1' }
 *             → Stored in autoActions array
 *             → Transformed to autoCoralPlaceL1Count: 1
 *             → Saved to database as counter field
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/core/components/ui/card";
import { Button } from "@/core/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface ScoringSectionsProps {
  phase: 'auto' | 'teleop';
  onAddAction: (action: any) => void; // Accepts action object
  actions: any[]; // Array of timestamped action objects
  // Optional props for game-specific implementations
  status?: any;
  onStatusUpdate?: (updates: Partial<any>) => void;
  onUndo?: () => void;
  canUndo?: boolean;
}

/**
 * Default/Placeholder Scoring Sections Component
 * 
 * This is a simple placeholder that shows teams where to implement their
 * year-specific scoring UI with action-based tracking.
 * 
 * Each button should create an action object describing what happened.
 * Parent page adds timestamp and stores in actions array.
 * 
 * Replace this entire component with your game-specific implementation.
 */
export function ScoringSections({
  phase,
  onAddAction,
  actions = [],
  // Optional props - used by game-specific implementations
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  status: _status,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onStatusUpdate: _onStatusUpdate,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onUndo: _onUndo,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  canUndo: _canUndo,
}: ScoringSectionsProps) {
  // Example: Count how many times each action has been performed
  // Teams can use this to display running totals or provide visual feedback
  const action1Count = actions.filter(a => a.actionType === 'action1').length;
  const action2Count = actions.filter(a => a.actionType === 'action2').length;
  const action3Count = actions.filter(a => a.actionType === 'action3').length;
  const action4Count = actions.filter(a => a.actionType === 'action4').length;

  return (
    <div className="space-y-4">
      {/* Placeholder Notice */}
      <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <AlertTriangle className="h-8 w-8 text-amber-500" />
            <h3 className="font-semibold text-sm">Game-Specific Implementation Needed</h3>
            <p className="text-xs text-muted-foreground max-w-md">
              Replace this component with your game year's scoring sections.
              See the JSDoc comments in this file for implementation guidance.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Example Scoring Section 1 */}
      <Card>
        <CardHeader>
          <CardTitle>Scoring Section 1</CardTitle>
          <p className="text-sm text-muted-foreground">
            Example: Replace with game-specific scoring (e.g., 2025: Coral L1-L4)
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={() => onAddAction({
                actionType: 'action1',
                phase
              })}
              variant="outline"
              className="h-16 flex flex-col items-center justify-center gap-1"
            >
              <span>Action 1</span>
              {action1Count > 0 && (
                <span className="text-xs text-muted-foreground">({action1Count})</span>
              )}
            </Button>
            <Button
              onClick={() => onAddAction({
                actionType: 'action2',
                phase
              })}
              variant="outline"
              className="h-16 flex flex-col items-center justify-center gap-1"
            >
              <span>Action 2</span>
              {action2Count > 0 && (
                <span className="text-xs text-muted-foreground">({action2Count})</span>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Example Scoring Section 2 */}
      <Card>
        <CardHeader>
          <CardTitle>Scoring Section 2</CardTitle>
          <p className="text-sm text-muted-foreground">
            Example: Replace with game-specific scoring (e.g., 2025: Algae)
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Button
              onClick={() => onAddAction({
                actionType: 'action3',
                phase
              })}
              variant="outline"
              className="w-full h-12 flex items-center justify-between px-4"
            >
              <span>Action 3</span>
              {action3Count > 0 && (
                <span className="text-sm font-semibold bg-primary/10 px-2 py-1 rounded">
                  {action3Count}
                </span>
              )}
            </Button>
            <Button
              onClick={() => onAddAction({
                actionType: 'action4',
                phase
              })}
              variant="outline"
              className="w-full h-12 flex items-center justify-between px-4"
            >
              <span>Action 4</span>
              {action4Count > 0 && (
                <span className="text-sm font-semibold bg-primary/10 px-2 py-1 rounded">
                  {action4Count}
                </span>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Phase-specific example */}
      {phase === 'teleop' && (
        <Card>
          <CardHeader>
            <CardTitle>Teleop-Only Section</CardTitle>
            <p className="text-sm text-muted-foreground">
              Example: Teleop-specific scoring options
            </p>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => onAddAction({
                actionType: 'teleopSpecial',
                phase
              })}
              variant="outline"
              className="w-full"
            >
              Teleop Special Action
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

