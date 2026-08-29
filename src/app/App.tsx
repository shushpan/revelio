import "../styles.css";
import { useTheme } from "@heroui/react";
import type { JSX } from "react";
import { lazy, Suspense, useState } from "react";
import { ConnectScreen } from "../connection/ConnectScreen";
import { InboxScreen, pullRequestKey } from "../inbox/InboxScreen";
import type { InboxLoadResult } from "../inbox/load-inbox";
import type { CodeReviewProvider, PullRequestSummary, ProviderUser } from "../providers/contracts";
import { type ThemeChoice, ThemeControl } from "../ui/ThemeControl";

const ReviewScreen = lazy(() =>
  import("../review/ReviewScreen").then(({ ReviewScreen: screen }) => ({ default: screen })),
);

type AppState =
  | { readonly screen: "connect" }
  | ({ readonly screen: "inbox"; readonly inbox: InboxLoadResult } & Session)
  | ({
      readonly screen: "review";
      readonly pullRequest: PullRequestSummary;
      readonly inbox: InboxLoadResult;
    } & Session);

interface Session {
  readonly provider: CodeReviewProvider;
  readonly user: ProviderUser;
}

const reviewedStorageKey = "revelio.reviewed";

export function App(): JSX.Element {
  const [appState, setAppState] = useState<AppState>({ screen: "connect" });
  const [reviewed, setReviewed] = useState<Record<string, string>>(readReviewed);
  const { theme, resolvedTheme, setTheme } = useTheme("system");
  const selectedTheme: ThemeChoice = theme === "light" || theme === "dark" ? theme : "system";
  const diffTheme = resolvedTheme === "dark" ? "dark" : "light";

  const lock = (): void => setAppState({ screen: "connect" });

  const markReviewed = (pullRequest: PullRequestSummary): void => {
    const next = { ...reviewed, [pullRequestKey(pullRequest)]: pullRequest.sourceCommit };
    setReviewed(next);
    window.localStorage.setItem(reviewedStorageKey, JSON.stringify(next));
    setAppState((current) =>
      current.screen === "review"
        ? { screen: "inbox", provider: current.provider, user: current.user, inbox: current.inbox }
        : current,
    );
  };

  const connect = (
    provider: CodeReviewProvider,
    user: ProviderUser,
    inbox: InboxLoadResult,
  ): void => {
    setAppState({ screen: "inbox", provider, user, inbox });
  };

  const refresh = (): void => {
    if (appState.screen !== "inbox") return;
    void Promise.all([import("effect"), import("../inbox/load-inbox")])
      .then(([{ Effect }, { loadInbox }]) => Effect.runPromise(loadInbox(appState.provider)))
      .then((inbox) => {
        setAppState((current) => (current.screen === "inbox" ? { ...current, inbox } : current));
      })
      .catch(() => undefined);
  };

  return (
    <>
      <header className="app-shell app-header">
        <div>
          <p className="eyebrow">Personal review workspace</p>
          <h1>Revelio</h1>
        </div>
        <ThemeControl theme={selectedTheme} resolvedTheme={diffTheme} onThemeChange={setTheme} />
      </header>
      {appState.screen === "connect" ? <ConnectScreen onConnected={connect} /> : null}
      {appState.screen === "inbox" ? (
        <InboxScreen
          user={appState.user}
          pullRequests={appState.inbox.pullRequests}
          failures={appState.inbox.failures}
          reviewed={reviewed}
          onSelect={(pullRequest) =>
            setAppState({ ...appState, screen: "review", pullRequest, inbox: appState.inbox })
          }
          onRefresh={refresh}
          onLock={lock}
        />
      ) : null}
      {appState.screen === "review" ? (
        <Suspense
          fallback={
            <p className="app-shell review-status" role="status">
              Loading review…
            </p>
          }
        >
          <ReviewScreen
            provider={appState.provider}
            pullRequest={appState.pullRequest}
            themeType={diffTheme}
            onBack={() => setAppState({ ...appState, screen: "inbox" })}
            onMarkReviewed={markReviewed}
          />
        </Suspense>
      ) : null}
    </>
  );
}

function readReviewed(): Record<string, string> {
  try {
    const value = window.localStorage.getItem(reviewedStorageKey);
    if (!value) return {};
    const parsed: unknown = JSON.parse(value);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}
