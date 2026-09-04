import { describe, expect, it } from "vitest";
import type { Checkpoint } from "../inbox/checkpoint";
import {
  type FinishReviewDependencies,
  FinishReviewError,
  finishReview,
  type PendingReviewComment,
} from "./finish-review";

const comment = (id: string, text = `Comment ${id}`): PendingReviewComment => ({ id, text });

const successfulDependencies = (calls: Array<string>, saved: Array<Checkpoint>) => {
  const heads = ["head-1", "head-1"];

  return {
    loadHead: async () => {
      const head = heads.shift();
      calls.push(head === "head-1" && calls.length === 0 ? "head-before" : "head-after");
      return head ?? "unexpected-head-load";
    },
    sendComment: async (pending: PendingReviewComment) => {
      calls.push(`comment:${pending.id}`);
    },
    applyDecision: async (outcome: "approved" | "changes_requested" | "reviewed") => {
      calls.push(`decision:${outcome}`);
    },
    saveCheckpoint: async (checkpoint: Checkpoint) => {
      calls.push("checkpoint");
      saved.push(checkpoint);
    },
    now: () => "2026-09-02T12:00:00.000Z",
  } satisfies FinishReviewDependencies;
};

const rejectedError = async (promise: Promise<unknown>): Promise<FinishReviewError> => {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(FinishReviewError);
    const finishReviewError = error as FinishReviewError;
    expect(Object.isFrozen(finishReviewError.receipt)).toBe(true);
    expect(Object.isFrozen(finishReviewError.receipt.sentCommentIds)).toBe(true);
    return finishReviewError;
  }
  throw new Error("Expected Finish Review to reject");
};

describe("finishReview", () => {
  it("sends the reviewed comments and decision before persisting a checkpoint", async () => {
    const calls: Array<string> = [];
    const saved: Array<Checkpoint> = [];

    const receipt = await finishReview(
      {
        pullRequestKey: "acme/revelio#42",
        reviewedHeadCommit: "head-1",
        comments: [comment("first"), comment("second")],
        outcome: "approved",
      },
      successfulDependencies(calls, saved),
    );

    expect(calls).toEqual([
      "head-before",
      "comment:first",
      "comment:second",
      "decision:approved",
      "head-after",
      "checkpoint",
    ]);
    expect(receipt).toEqual({ sentCommentIds: ["first", "second"], decisionApplied: true });
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(Object.isFrozen(receipt.sentCommentIds)).toBe(true);
    expect(saved).toEqual([
      {
        pullRequestKey: "acme/revelio#42",
        reviewedHeadCommit: "head-1",
        watermark: "2026-09-02T12:00:00.000Z",
        outcome: "approved",
        finishedAt: "2026-09-02T12:00:00.000Z",
      },
    ]);
  });

  it("persists a reviewed checkpoint without applying a remote decision", async () => {
    const calls: Array<string> = [];
    const saved: Array<Checkpoint> = [];

    const receipt = await finishReview(
      {
        pullRequestKey: "acme/revelio#42",
        reviewedHeadCommit: "head-1",
        comments: [comment("first")],
        outcome: "reviewed",
      },
      successfulDependencies(calls, saved),
    );

    expect(calls).toEqual(["head-before", "comment:first", "head-after", "checkpoint"]);
    expect(receipt).toEqual({ sentCommentIds: ["first"], decisionApplied: false });
    expect(saved[0]).toMatchObject({
      reviewedHeadCommit: "head-1",
      outcome: "reviewed",
      watermark: "2026-09-02T12:00:00.000Z",
      finishedAt: "2026-09-02T12:00:00.000Z",
    });
  });

  it("stops before sending anything when the review head already changed", async () => {
    const calls: Array<string> = [];
    const error = await rejectedError(
      finishReview(
        {
          pullRequestKey: "acme/revelio#42",
          reviewedHeadCommit: "head-1",
          comments: [comment("private", "This text must not escape")],
          outcome: "approved",
        },
        {
          loadHead: async () => {
            calls.push("head-before");
            return "head-2";
          },
          sendComment: async () => {
            calls.push("comment");
          },
          applyDecision: async () => {
            calls.push("decision");
          },
          saveCheckpoint: async () => {
            calls.push("checkpoint");
          },
          now: () => "2026-09-02T12:00:00.000Z",
        },
      ),
    );

    expect(calls).toEqual(["head-before"]);
    expect(error).toMatchObject({
      _tag: "FinishReviewError",
      stage: "head-before",
      receipt: { sentCommentIds: [], decisionApplied: false },
    });
  });

  it("sanitizes a provider failure while loading the initial head", async () => {
    const error = await rejectedError(
      finishReview(
        {
          pullRequestKey: "acme/revelio#42",
          reviewedHeadCommit: "head-1",
          comments: [],
          outcome: "reviewed",
        },
        {
          loadHead: async () => {
            throw new Error("Provider head failure: raw-secret-head");
          },
          sendComment: async () => {},
          applyDecision: async () => {},
          saveCheckpoint: async () => {},
          now: () => "2026-09-02T12:00:00.000Z",
        },
      ),
    );

    expect(error).toMatchObject({
      stage: "head-before",
      receipt: { sentCommentIds: [], decisionApplied: false },
    });
    expect(error.message).toBe("Finish Review could not be completed.");
    expect(JSON.stringify(error)).not.toContain("raw-secret-head");
    expect(error).not.toHaveProperty("cause");
  });

  it("does not save a checkpoint when the head changes after remote review work", async () => {
    const calls: Array<string> = [];
    const heads = ["head-1", "head-2"];
    const error = await rejectedError(
      finishReview(
        {
          pullRequestKey: "acme/revelio#42",
          reviewedHeadCommit: "head-1",
          comments: [comment("first")],
          outcome: "changes_requested",
        },
        {
          loadHead: async () => {
            calls.push(calls.length === 0 ? "head-before" : "head-after");
            return heads.shift() ?? "unexpected-head-load";
          },
          sendComment: async (pending) => {
            calls.push(`comment:${pending.id}`);
          },
          applyDecision: async (outcome) => {
            calls.push(`decision:${outcome}`);
          },
          saveCheckpoint: async () => {
            calls.push("checkpoint");
          },
          now: () => "2026-09-02T12:00:00.000Z",
        },
      ),
    );

    expect(calls).toEqual([
      "head-before",
      "comment:first",
      "decision:changes_requested",
      "head-after",
    ]);
    expect(error).toMatchObject({
      stage: "head-after",
      receipt: { sentCommentIds: ["first"], decisionApplied: true },
    });
  });

  it("stops at a failed comment and returns only the sent comment IDs", async () => {
    const calls: Array<string> = [];
    const error = await rejectedError(
      finishReview(
        {
          pullRequestKey: "acme/revelio#42",
          reviewedHeadCommit: "head-1",
          comments: [comment("first"), comment("private", "Sensitive comment text")],
          outcome: "approved",
        },
        {
          loadHead: async () => {
            calls.push("head-before");
            return "head-1";
          },
          sendComment: async (pending) => {
            calls.push(`comment:${pending.id}`);
            if (pending.id === "private") throw new Error("Provider said: Sensitive comment text");
          },
          applyDecision: async () => {
            calls.push("decision");
          },
          saveCheckpoint: async () => {
            calls.push("checkpoint");
          },
          now: () => "2026-09-02T12:00:00.000Z",
        },
      ),
    );

    expect(calls).toEqual(["head-before", "comment:first", "comment:private"]);
    expect(error).toMatchObject({
      stage: "comment",
      receipt: { sentCommentIds: ["first"], decisionApplied: false },
    });
    expect(error.message).toBe("Finish Review could not be completed.");
    expect(JSON.stringify(error)).not.toContain("Sensitive comment text");
    expect(error).not.toHaveProperty("cause");
  });

  it("preserves sent comment IDs when applying the decision fails", async () => {
    const calls: Array<string> = [];
    const error = await rejectedError(
      finishReview(
        {
          pullRequestKey: "acme/revelio#42",
          reviewedHeadCommit: "head-1",
          comments: [comment("first"), comment("second")],
          outcome: "approved",
        },
        {
          loadHead: async () => {
            calls.push("head-before");
            return "head-1";
          },
          sendComment: async (pending) => {
            calls.push(`comment:${pending.id}`);
          },
          applyDecision: async () => {
            calls.push("decision");
            throw new Error("Provider decision failure: raw-secret-decision");
          },
          saveCheckpoint: async () => {
            calls.push("checkpoint");
          },
          now: () => "2026-09-02T12:00:00.000Z",
        },
      ),
    );

    expect(calls).toEqual(["head-before", "comment:first", "comment:second", "decision"]);
    expect(error).toMatchObject({
      stage: "decision",
      receipt: { sentCommentIds: ["first", "second"], decisionApplied: false },
    });
    expect(error.message).toBe("Finish Review could not be completed.");
    expect(JSON.stringify(error)).not.toContain("raw-secret-decision");
    expect(error).not.toHaveProperty("cause");
  });

  it("resumes a decision failure without resending confirmed comments", async () => {
    const calls: Array<string> = [];
    const saved: Array<Checkpoint> = [];
    let decisionAttempts = 0;
    const dependencies: FinishReviewDependencies = {
      loadHead: async () => {
        calls.push(calls.length === 0 || calls.length === 4 ? "head-before" : "head-after");
        return "head-1";
      },
      sendComment: async (pending) => {
        calls.push(`comment:${pending.id}`);
      },
      applyDecision: async (outcome) => {
        calls.push(`decision:${outcome}`);
        decisionAttempts += 1;
        if (decisionAttempts === 1) throw new Error("Provider decision failure: raw-secret-retry");
      },
      saveCheckpoint: async (checkpoint) => {
        calls.push("checkpoint");
        saved.push(checkpoint);
      },
      now: () => "2026-09-02T12:00:00.000Z",
    };
    const input = {
      pullRequestKey: "acme/revelio#42",
      reviewedHeadCommit: "head-1",
      comments: [comment("first"), comment("second")],
      outcome: "approved" as const,
    };

    const partial = await rejectedError(finishReview(input, dependencies));
    const receipt = await finishReview(
      { ...input, previousReceipt: partial.receipt },
      dependencies,
    );

    expect(calls).toEqual([
      "head-before",
      "comment:first",
      "comment:second",
      "decision:approved",
      "head-before",
      "decision:approved",
      "head-after",
      "checkpoint",
    ]);
    expect(receipt).toEqual({ sentCommentIds: ["first", "second"], decisionApplied: true });
    expect(saved).toHaveLength(1);
  });

  it("retries only work that the previous receipt has not confirmed", async () => {
    const calls: Array<string> = [];
    const saved: Array<Checkpoint> = [];
    const previousReceipt = {
      sentCommentIds: ["first"],
      decisionApplied: true,
    };
    const receipt = await finishReview(
      {
        pullRequestKey: "acme/revelio#42",
        reviewedHeadCommit: "head-1",
        comments: [comment("first"), comment("second")],
        outcome: "approved",
        previousReceipt,
      },
      successfulDependencies(calls, saved),
    );

    expect(calls).toEqual(["head-before", "comment:second", "head-after", "checkpoint"]);
    expect(receipt).toEqual({ sentCommentIds: ["first", "second"], decisionApplied: true });
    expect(previousReceipt).toEqual({ sentCommentIds: ["first"], decisionApplied: true });
  });

  it("reports a checkpoint failure with the completed remote work but no success receipt", async () => {
    const calls: Array<string> = [];
    const heads = ["head-1", "head-1"];
    const error = await rejectedError(
      finishReview(
        {
          pullRequestKey: "acme/revelio#42",
          reviewedHeadCommit: "head-1",
          comments: [comment("first")],
          outcome: "approved",
        },
        {
          loadHead: async () => {
            calls.push(calls.length === 0 ? "head-before" : "head-after");
            return heads.shift() ?? "unexpected-head-load";
          },
          sendComment: async (pending) => {
            calls.push(`comment:${pending.id}`);
          },
          applyDecision: async (outcome) => {
            calls.push(`decision:${outcome}`);
          },
          saveCheckpoint: async () => {
            calls.push("checkpoint");
            throw new Error("Provider checkpoint failure: raw-secret-checkpoint");
          },
          now: () => "2026-09-02T12:00:00.000Z",
        },
      ),
    );

    expect(calls).toEqual([
      "head-before",
      "comment:first",
      "decision:approved",
      "head-after",
      "checkpoint",
    ]);
    expect(error).toMatchObject({
      stage: "checkpoint",
      receipt: { sentCommentIds: ["first"], decisionApplied: true },
    });
    expect(error.message).toBe("Finish Review could not be completed.");
    expect(JSON.stringify(error)).not.toContain("raw-secret-checkpoint");
    expect(error).not.toHaveProperty("cause");
  });
});
