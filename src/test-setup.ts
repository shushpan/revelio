import "@testing-library/jest-dom/vitest";

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as typeof ResizeObserver;
}

if (typeof HTMLElement.prototype.scrollTo === "undefined") {
  HTMLElement.prototype.scrollTo = function scrollTo(options?: ScrollToOptions | number): void {
    if (typeof options === "number") this.scrollTop = options;
    else if (options?.top !== undefined) this.scrollTop = options.top;
  };
}
