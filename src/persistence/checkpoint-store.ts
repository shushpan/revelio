import type { Checkpoint, ReviewOutcome } from "../inbox/checkpoint";
import type { KeyValueStore } from "./indexed-db";

const STORAGE_VERSION = 1;

interface StoredCheckpoints {
  readonly version: typeof STORAGE_VERSION;
  readonly checkpoints: ReadonlyArray<Checkpoint>;
}

export interface CheckpointStore {
  load(providerId: string, userId: string): Promise<ReadonlyArray<Checkpoint>>;
  save(providerId: string, userId: string, checkpoint: Checkpoint): Promise<void>;
  remove(providerId: string, userId: string, pullRequestKey: string): Promise<void>;
}

const encodeSegment = (value: string): string => encodeURIComponent(value);

const checkpointKey = (providerId: string, userId: string): string =>
  `checkpoints:${encodeSegment(providerId)}:${encodeSegment(userId)}`;

const isReviewOutcome = (value: unknown): value is ReviewOutcome =>
  value === "approved" || value === "changes_requested" || value === "reviewed";

const strictRfc3339Timestamp =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

const daysInMonth = (year: number, month: number): number => {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
};

const isTimestamp = (value: unknown): value is string => {
  if (typeof value !== "string") return false;

  const match = strictRfc3339Timestamp.exec(value);
  if (!match) return false;

  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month) &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    !Number.isNaN(Date.parse(value))
  );
};

const isCheckpoint = (value: unknown): value is Checkpoint =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { pullRequestKey?: unknown }).pullRequestKey === "string" &&
  typeof (value as { reviewedHeadCommit?: unknown }).reviewedHeadCommit === "string" &&
  isTimestamp((value as { watermark?: unknown }).watermark) &&
  isReviewOutcome((value as { outcome?: unknown }).outcome) &&
  isTimestamp((value as { finishedAt?: unknown }).finishedAt);

const isStoredCheckpoints = (value: unknown): value is StoredCheckpoints =>
  typeof value === "object" &&
  value !== null &&
  (value as { version?: unknown }).version === STORAGE_VERSION &&
  Array.isArray((value as { checkpoints?: unknown }).checkpoints) &&
  (value as { checkpoints: ReadonlyArray<unknown> }).checkpoints.every(isCheckpoint);

const compareCheckpoints = (a: Checkpoint, b: Checkpoint): number =>
  a.pullRequestKey.localeCompare(b.pullRequestKey);

const copyCheckpoints = (checkpoints: ReadonlyArray<Checkpoint>): ReadonlyArray<Checkpoint> =>
  Object.freeze(
    checkpoints.map((checkpoint) => Object.freeze({ ...checkpoint })).sort(compareCheckpoints),
  );

const decode = (value: unknown): ReadonlyArray<Checkpoint> =>
  isStoredCheckpoints(value) ? copyCheckpoints(value.checkpoints) : [];

export const makeCheckpointStore = (kv: KeyValueStore): CheckpointStore => ({
  load: async (providerId, userId) =>
    decode(await kv.get<unknown>("settings", checkpointKey(providerId, userId))),
  save: async (providerId, userId, checkpoint) => {
    const key = checkpointKey(providerId, userId);
    const existing = decode(await kv.get<unknown>("settings", key));
    const checkpoints = copyCheckpoints([
      ...existing.filter(({ pullRequestKey }) => pullRequestKey !== checkpoint.pullRequestKey),
      checkpoint,
    ]);
    await kv.put("settings", { version: STORAGE_VERSION, checkpoints }, key);
  },
  remove: async (providerId, userId, pullRequestKey) => {
    const key = checkpointKey(providerId, userId);
    const existing = decode(await kv.get<unknown>("settings", key));
    const checkpoints = copyCheckpoints(
      existing.filter((checkpoint) => checkpoint.pullRequestKey !== pullRequestKey),
    );
    await kv.put("settings", { version: STORAGE_VERSION, checkpoints }, key);
  },
});
