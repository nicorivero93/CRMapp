import { z } from 'zod';

export interface UpdaterStatusDTO {
  currentVersion: string;
  latestVersion: string | null;
  hasUpdate: boolean;
  lastCheckedAt: string | null;
  releaseNotes: string | null;
  releaseAssetUrl: string | null;
  /** True while a check is in flight. */
  checking: boolean;
  /** Last error checking or applying. */
  error: string | null;
}

export const applyUpdateSchema = z.object({
  /** Exact tag to pin; empty = use latest known from last check. */
  version: z.string().max(40).optional(),
});
export type ApplyUpdateInput = z.infer<typeof applyUpdateSchema>;

export interface ApplyUpdateResponse {
  status: 'initiated' | 'already-up-to-date' | 'no-candidate';
  version: string | null;
  /** Server will shut down in ~1 second. The updater script takes over. */
  message: string;
}
