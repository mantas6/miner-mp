import { describe, expect, it } from 'vitest';
import { isRelayProblemStatus, RELAY_PROBLEM_STATUS } from './connection-status';

describe('relay status vocabulary', () => {
  it('recognises every declared failure', () => {
    for (const status of Object.values(RELAY_PROBLEM_STATUS)) {
      expect(isRelayProblemStatus(status), status).toBe(true);
    }
  });

  it('leaves progress, idleness and success alone', () => {
    for (const status of ['Disconnected', 'Connecting...', 'Connected - pairing...', 'Host - waiting for player', 'Host - paired', 'Guest - paired', 'Peer left', 'Solo', '']) {
      expect(isRelayProblemStatus(status), status).toBe(false);
    }
  });
});
