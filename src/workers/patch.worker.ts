import { preprocessPatch } from "../review/patch";

interface PatchWorkerRequest {
  readonly type: "preprocess";
  readonly id: string;
  readonly patch: string;
}

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<PatchWorkerRequest>) => void) | null;
  postMessage(message: unknown): void;
};

workerScope.onmessage = (event): void => {
  const request = event.data;
  if (request.type !== "preprocess") return;
  try {
    workerScope.postMessage({
      type: "success",
      id: request.id,
      result: preprocessPatch(request.patch),
    });
  } catch (error) {
    workerScope.postMessage({
      type: "error",
      id: request.id,
      error: error instanceof Error ? error.message : "Patch preprocessing failed",
    });
  }
};
