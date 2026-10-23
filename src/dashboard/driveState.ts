import type { DriveStatus } from '../services/api';

export type DriveSectionState = 'loading' | 'error' | 'disabled' | 'connected' | 'disconnected';

/**
 * What the Drive section shows. A failed status request is its own state:
 * it must not be rendered as "not connected" (or as nothing at all).
 */
export function driveSectionState({
  loading,
  failed,
  status,
}: {
  loading: boolean;
  failed: boolean;
  status: DriveStatus | null;
}): DriveSectionState {
  if (loading) return 'loading';
  if (failed || !status) return 'error';
  if (!status.enabled) return 'disabled';
  return status.connected ? 'connected' : 'disconnected';
}
