// The relay status line's small shared vocabulary.
//
// The game writes `connectionStatus` and the lobby paints it, which is all prose
// needs. The relay URL field, though, also has to report *whether that status is
// something wrong with what was typed in it* (`aria-invalid`), and deciding that
// by pattern-matching prose inside the component would hide half of a state
// machine in a view. So the three statuses that mean "this URL did not get you
// into a game" are declared once, here, and the game reports them from this table
// — the same direction as every other game-to-UI dependency (`store.ts`).

export const RELAY_PROBLEM_STATUS = {
  /** Connect was pressed with nothing in the field. */
  noUrl: 'Enter a server URL',
  /** The relay already has its pair of miners. */
  roomFull: 'Room full',
  /** The socket never opened, or died on its own. */
  socket: 'Connection error'
} as const;

const PROBLEMS: readonly string[] = Object.values(RELAY_PROBLEM_STATUS);

/** Whether the relay status is reporting a failure rather than progress. */
export function isRelayProblemStatus(status: string): boolean {
  return PROBLEMS.includes(status);
}
