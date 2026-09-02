import { describe, expect, it } from "vitest";
import type { PullRequestSummary, ReviewSignal } from "../providers/contracts";
import { type Checkpoint, isCheckpointValid } from "./checkpoint";

const USER = "{me}";
const WATERMARK = "2026-01-10T00:00:00Z";
const AFTER = "2026-01-11T00:00:00Z";
const BEFORE = "2026-01-09T00:00:00Z";

const pr = (overrides: Partial<PullRequestSummary> = {}): PullRequestSummary => ({
  ref: { repository: { workspace: "acme", slug: "repo" }, id: 1 },
  title: "PR",
  description: "",
  state: "OPEN",
  updatedAt: AFTER,
  sourceBranch: "feature",
  targetBranch: "main",
  sourceCommit: "head-1",
  author: { id: "{author}", displayName: "Author" },
  reviewerIds: [USER],
  ...overrides,
});

const checkpoint = (overrides: Partial<Checkpoint> = {}): Checkpoint => ({
  pullRequestKey: "acme/repo#1",
  reviewedHeadCommit: "head-1",
  watermark: WATERMARK,
  ...overrides,
});

const signal = (overrides: Partial<ReviewSignal> & Pick<ReviewSignal, "kind">): ReviewSignal => ({
  id: "sig-1",
  createdAt: AFTER,
  ...overrides,
});

describe("isCheckpointValid", () => {
  it("stays valid when nothing changed since the checkpoint", () => {
    expect(isCheckpointValid(pr(), [], checkpoint(), USER)).toBe(true);
  });

  describe("positive re-entry triggers (checkpoint becomes invalid)", () => {
    it("invalidates when the source head commit changed", () => {
      expect(isCheckpointValid(pr({ sourceCommit: "head-2" }), [], checkpoint(), USER)).toBe(false);
    });

    it("invalidates on a new head commit even if a stale approval survives", () => {
      const signals = [signal({ kind: "approved", actorId: USER, createdAt: BEFORE })];
      expect(isCheckpointValid(pr({ sourceCommit: "head-2" }), signals, checkpoint(), USER)).toBe(
        false,
      );
    });

    it("invalidates when the user is requested as reviewer again after the watermark", () => {
      const signals = [signal({ kind: "requested", actorId: "{author}", createdAt: AFTER })];
      expect(isCheckpointValid(pr(), signals, checkpoint(), USER)).toBe(false);
    });

    it("invalidates when the user is mentioned after the watermark", () => {
      const signals = [signal({ kind: "mentioned", actorId: "{other}", createdAt: AFTER })];
      expect(isCheckpointValid(pr(), signals, checkpoint(), USER)).toBe(false);
    });

    it("invalidates when another user's comment text mentions the user after the watermark", () => {
      const signals = [
        signal({
          kind: "commented",
          actorId: "{other}",
          createdAt: AFTER,
          text: `hey @${USER} please take another look`,
        }),
      ];
      expect(isCheckpointValid(pr(), signals, checkpoint(), USER)).toBe(false);
    });
  });

  describe("negative cases (checkpoint stays valid)", () => {
    it("ignores unrelated comments from others that do not mention the user", () => {
      const signals = [
        signal({ kind: "commented", actorId: "{other}", createdAt: AFTER, text: "nit: typo" }),
      ];
      expect(isCheckpointValid(pr(), signals, checkpoint(), USER)).toBe(true);
    });

    it("ignores the user's own comments", () => {
      const signals = [
        signal({
          kind: "commented",
          actorId: USER,
          createdAt: AFTER,
          text: `note to self @${USER}`,
        }),
      ];
      expect(isCheckpointValid(pr(), signals, checkpoint(), USER)).toBe(true);
    });

    it("ignores other reviewers' approvals and change requests", () => {
      const signals = [
        signal({ kind: "approved", actorId: "{other}", createdAt: AFTER }),
        signal({ kind: "changes_requested", actorId: "{other}", createdAt: AFTER, id: "sig-2" }),
      ];
      expect(isCheckpointValid(pr(), signals, checkpoint(), USER)).toBe(true);
    });

    it("ignores generic PR updates and CI-only activity", () => {
      const signals = [
        signal({ kind: "updated", actorId: "{author}", createdAt: AFTER }),
        signal({ kind: "other", createdAt: AFTER, id: "sig-2" }),
      ];
      expect(isCheckpointValid(pr(), signals, checkpoint(), USER)).toBe(true);
    });

    it("ignores a mention that predates the watermark", () => {
      const signals = [signal({ kind: "mentioned", actorId: "{other}", createdAt: BEFORE })];
      expect(isCheckpointValid(pr(), signals, checkpoint(), USER)).toBe(true);
    });

    it("ignores a re-request that predates the watermark", () => {
      const signals = [signal({ kind: "requested", actorId: "{author}", createdAt: BEFORE })];
      expect(isCheckpointValid(pr(), signals, checkpoint(), USER)).toBe(true);
    });
  });

  describe("terminal lifecycle states never requeue", () => {
    it("stays valid for a merged PR even with a fresh mention", () => {
      const signals = [signal({ kind: "mentioned", actorId: "{other}", createdAt: AFTER })];
      expect(isCheckpointValid(pr({ state: "MERGED" }), signals, checkpoint(), USER)).toBe(true);
    });

    it("stays valid for a declined PR even with a new head commit", () => {
      expect(
        isCheckpointValid(pr({ state: "DECLINED", sourceCommit: "head-2" }), [], checkpoint(), USER),
      ).toBe(true);
    });
  });
});
