import { expect as baseExpect, test as baseTest } from "@playwright/test";

const BITBUCKET_API_ORIGIN = "https://api.bitbucket.org";

type BrowserGuards = {
  expectedApiErrorStatuses: ReadonlyArray<number>;
  browserGuards: undefined;
};

export const test = baseTest.extend<BrowserGuards>({
  expectedApiErrorStatuses: [[], { option: true }],
  browserGuards: [
    async ({ page, expectedApiErrorStatuses: allowedApiErrorStatuses }, use, testInfo) => {
      const localOrigin = new URL(testInfo.project.use.baseURL ?? "http://127.0.0.1:4173").origin;
      const consoleErrors: string[] = [];
      const unexpectedOrigins: string[] = [];
      const expectedApiErrorStatusCounts = new Map<number, number>();

      const onConsole = (message: { type(): string; text(): string }): void => {
        if (message.type() !== "error") return;
        const statusMatch = message
          .text()
          .match(/^Failed to load resource: the server responded with a status of (\d+)/);
        const status = statusMatch === null ? undefined : Number(statusMatch[1]);
        if (status !== undefined && (expectedApiErrorStatusCounts.get(status) ?? 0) > 0) {
          expectedApiErrorStatusCounts.set(
            status,
            (expectedApiErrorStatusCounts.get(status) ?? 1) - 1,
          );
          return;
        }
        consoleErrors.push(message.text());
      };
      const onRequest = (request: { url(): string }): void => {
        const origin = new URL(request.url()).origin;
        if (origin !== localOrigin && origin !== BITBUCKET_API_ORIGIN) {
          unexpectedOrigins.push(request.url());
        }
      };
      const onResponse = (response: { url(): string; ok(): boolean; status(): number }): void => {
        if (
          new URL(response.url()).origin !== BITBUCKET_API_ORIGIN ||
          response.ok() ||
          !allowedApiErrorStatuses.includes(response.status())
        )
          return;
        const status = response.status();
        expectedApiErrorStatusCounts.set(
          status,
          (expectedApiErrorStatusCounts.get(status) ?? 0) + 1,
        );
      };

      page.on("console", onConsole);
      page.on("request", onRequest);
      page.on("response", onResponse);
      try {
        await use();
      } finally {
        page.off("console", onConsole);
        page.off("request", onRequest);
        page.off("response", onResponse);
        baseExpect(consoleErrors, `Unexpected browser console errors in ${testInfo.title}`).toEqual(
          [],
        );
        baseExpect(unexpectedOrigins, `Unexpected outbound origins in ${testInfo.title}`).toEqual(
          [],
        );
      }
    },
    { auto: true },
  ],
});

export const expect = baseExpect;
