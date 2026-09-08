import { Effect } from "effect";
import {
  type JSX,
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { InboxLoadSnapshot } from "../../inbox/load-inbox";
import type { CodeReviewProvider, PullRequestSummary } from "../../providers/contracts";
import { IconButton } from "../../ui/IconButton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/Tabs";
import { TooltipProvider } from "../../ui/Tooltip";
import type { PreparedPatchFile } from "../patch";
import { type ActivityState, ActivityTab } from "./ActivityTab";
import { DescriptionTab } from "./DescriptionTab";
import { InboxTab } from "./InboxTab";

// @pierre/trees is large; keep it out of the main ReviewScreen chunk (§19).
const TreeTab = lazy(() => import("./TreeTab").then((module) => ({ default: module.TreeTab })));

const SIDEBAR_TRIGGER_ID = "sidebar-open-trigger";

function TreeTabSkeleton(): JSX.Element {
  return (
    <div className="tree-tab-skeleton" aria-hidden="true">
      {Array.from({ length: 8 }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length static skeleton, never reordered.
        <div key={index} className="tree-tab-skeleton-row" />
      ))}
    </div>
  );
}

// ponytail: @pierre/icons@0.7.1's dist/index.js re-exports "./types" without a file
// extension, which Node/Vitest ESM resolution rejects (verified: fails even in plain
// `node --input-type=module`, same failure as Task 2's ReviewToolbar). Inline SVGs
// sidestep that broken package until it ships a fixed release.
function TabGlyph({ children }: { readonly children: ReactNode }): JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const InboxGlyph = (): JSX.Element => (
  <TabGlyph>
    <path d="M2 8h3l1.5 2.5h3L11 8h3" />
    <rect x="2" y="4" width="12" height="8" rx="1" />
  </TabGlyph>
);
const TreeGlyph = (): JSX.Element => (
  <TabGlyph>
    <rect x="2" y="2" width="5" height="5" rx="1" />
    <path d="M4.5 7v3a1 1 0 0 0 1 1H12M12 9v3" />
  </TabGlyph>
);
const DescriptionGlyph = (): JSX.Element => (
  <TabGlyph>
    <rect x="3" y="2" width="10" height="12" rx="1" />
    <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" />
  </TabGlyph>
);
const ActivityGlyph = (): JSX.Element => (
  <TabGlyph>
    <path d="M2 8h3l2 4 3-8 2 4h2" />
  </TabGlyph>
);

// A plain ARIA/CSS tooltip span, not the shared Radix `Tooltip` primitive:
// `Tooltip.Trigger asChild`'s clone writes its own open/closed `data-state`
// onto the cloned node, overwriting `Tabs.Trigger`'s active/inactive
// `data-state` that the CSS active-tab indicator and this file's own
// focus-management code both depend on (verified by rendering the DOM —
// see task-3-report.md). `aria-hidden` keeps this span's text out of the
// trigger's accessible name (name-from-content respects aria-hidden);
// `aria-describedby` on the trigger still exposes it as the accessible
// description regardless of that hidden state — the same technique the
// WAI-ARIA tooltip pattern uses. Visibility is real CSS `:hover`/
// `:focus-visible` (see `.sidebar-tab-tooltip` in styles.css) — hover and
// keyboard focus, not a touch-only affordance, and no new dependency.
function TabTooltip({
  id,
  children,
}: {
  readonly id: string;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <span role="tooltip" id={id} aria-hidden="true" className="sidebar-tab-tooltip">
      {children}
    </span>
  );
}

function SidebarTriggerIcon(): JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="12" height="12" rx="1" />
      <path d="M6 2v12" />
    </svg>
  );
}

/** Marks every sibling of every ancestor of `preserve`, up to (not including)
 * `document.body`, as `inert` — the native way to suppress background
 * interaction/focus for everything except `preserve`'s own branch, without a
 * focus-trap dependency (fix round item 2). Returns the elements this call
 * itself inerted, so the caller can precisely undo only those. */
function inertOutside(preserve: HTMLElement): HTMLElement[] {
  const toggled: HTMLElement[] = [];
  let node: HTMLElement | null = preserve;
  while (node && node !== document.body) {
    const parent: HTMLElement | null = node.parentElement;
    if (!parent) break;
    for (const sibling of Array.from(parent.children)) {
      if (sibling === node || !(sibling instanceof HTMLElement) || sibling.hasAttribute("inert"))
        continue;
      // Plain attribute, not the `.inert` IDL property: this project's pinned
      // TypeScript DOM lib does not yet declare `HTMLElement.inert` (verified:
      // no match for it anywhere in node_modules/typescript/lib/*.d.ts).
      sibling.setAttribute("inert", "");
      toggled.push(sibling);
    }
    node = parent;
  }
  return toggled;
}

export interface SidebarProps {
  readonly files: ReadonlyArray<PreparedPatchFile>;
  readonly selectedPath: string | null;
  readonly onSelectPath: (path: string) => void;
  readonly pullRequest: PullRequestSummary;
  readonly currentUserId: string;
  readonly provider: CodeReviewProvider;
  /** Matches `DiffReview`'s `themeType`; defaults to light for callers that don't theme. */
  readonly themeType?: "light" | "dark";
  /** The review's actionable list, drawn from the same inbox snapshot as
   * the main inbox screen (§ Inbox tab: replaces the removed Queue drawer). */
  readonly inbox: InboxLoadSnapshot;
  readonly onSelectPullRequest: (pullRequest: PullRequestSummary) => void;
  readonly busy?: boolean;
}

type SidebarTab = "inbox" | "tree" | "description" | "activity";

export function Sidebar({
  files,
  selectedPath,
  onSelectPath,
  pullRequest,
  currentUserId,
  provider,
  themeType,
  inbox,
  onSelectPullRequest,
  busy = false,
}: SidebarProps): JSX.Element {
  const [tab, setTab] = useState<SidebarTab>("inbox");
  // Shared per-PR lazy load (fix round item 3): Description and Activity both
  // read this one state; whichever tab is activated first starts the one
  // request `getReviewSignals` makes for the lifetime of this open review
  // (ReviewScreen remounts Sidebar via a per-PR `key`, so a single flag below —
  // not a cache keyed by PR ref — is enough; this component never sees a second PR).
  const [signalsState, setSignalsState] = useState<ActivityState | undefined>(undefined);
  const requestedRef = useRef(false);
  // <768px only (§15): the persistent column becomes a bottom sheet. Same
  // mounted Tabs tree either way — only its CSS presentation and this open
  // state differ, so Tree/Description/Activity state survives the transition.
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetGroupRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const wasSheetOpenRef = useRef(false);
  const inertedRef = useRef<HTMLElement[]>([]);

  const loadSignals = useCallback((): void => {
    requestedRef.current = true;
    setSignalsState({ status: "loading" });
    void Effect.runPromise(provider.getReviewSignals(pullRequest.ref))
      .then((signals) => setSignalsState({ status: "loaded", signals }))
      .catch(() => setSignalsState({ status: "error", error: "Unable to load review activity." }));
  }, [provider, pullRequest]);

  useEffect(() => {
    if (requestedRef.current) return;
    if (tab !== "description" && tab !== "activity") return;
    loadSignals();
  }, [tab, loadSignals]);

  useEffect(() => {
    if (!sheetOpen) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setSheetOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [sheetOpen]);

  // Initial focus on open; focus return to the trigger on close (fix round item 2).
  useEffect(() => {
    if (sheetOpen) {
      wasSheetOpenRef.current = true;
      const activeTrigger = sheetRef.current?.querySelector<HTMLElement>(
        '[role="tab"][data-state="active"]',
      );
      (activeTrigger ?? sheetRef.current)?.focus();
    } else if (wasSheetOpenRef.current) {
      wasSheetOpenRef.current = false;
      document.getElementById(SIDEBAR_TRIGGER_ID)?.focus();
    }
  }, [sheetOpen]);

  // Background interaction/focus suppression while the sheet is open (fix round
  // item 2): native `inert`, not a duplicated tree/second Dialog instance.
  useEffect(() => {
    if (!sheetOpen) return;
    const group = sheetGroupRef.current;
    if (!group) return;
    inertedRef.current = inertOutside(group);
    return () => {
      for (const element of inertedRef.current) element.removeAttribute("inert");
      inertedRef.current = [];
    };
  }, [sheetOpen]);

  // Tab trap (fix round item 2): re-capture focus if it ever ends up outside the
  // sheet, rather than hand-computing Radix's roving-tabindex "first"/"last"
  // trigger for a Tab/Shift+Tab keydown handler — that computation went wrong in
  // practice (the two non-current tab triggers are `tabIndex={-1}`, so real Tab
  // presses never reach them at all; only ArrowLeft/ArrowRight do). Listens on
  // `focusout`, not `focusin`: verified in a real browser that once every
  // sibling is `inert`, tabbing past the sheet's last focusable descendant does
  // not wrap to anything — it drops `document.activeElement` to `<body>` with no
  // corresponding `focusin` anywhere, so only the outgoing `focusout` reliably
  // fires; the check is deferred one tick because the browser hasn't necessarily
  // settled the new `document.activeElement` yet when `focusout` itself fires.
  useEffect(() => {
    if (!sheetOpen) return;
    const onFocusOut = (): void => {
      window.setTimeout(() => {
        const active = document.activeElement;
        if (active instanceof Node && sheetRef.current?.contains(active)) return;
        const activeTrigger = sheetRef.current?.querySelector<HTMLElement>(
          '[role="tab"][data-state="active"]',
        );
        (activeTrigger ?? sheetRef.current)?.focus();
      }, 0);
    };
    document.addEventListener("focusout", onFocusOut);
    return () => document.removeEventListener("focusout", onFocusOut);
  }, [sheetOpen]);

  return (
    <TooltipProvider>
      <IconButton
        id={SIDEBAR_TRIGGER_ID}
        label="Open sidebar"
        tooltip="Files"
        className="sidebar-trigger"
        onClick={() => setSheetOpen(true)}
      >
        <SidebarTriggerIcon />
      </IconButton>
      <div ref={sheetGroupRef} className="sidebar-sheet-group">
        {sheetOpen ? (
          <button
            type="button"
            aria-label="Close sidebar"
            className="sidebar-sheet-backdrop"
            onClick={() => setSheetOpen(false)}
          />
        ) : null}
        <Tabs
          ref={sheetRef}
          value={tab}
          onValueChange={(value) => setTab(value as SidebarTab)}
          className="sidebar"
          data-sheet-open={sheetOpen}
          aria-label="Review sidebar"
          role={sheetOpen ? "dialog" : undefined}
          aria-modal={sheetOpen ? true : undefined}
          tabIndex={sheetOpen ? -1 : undefined}
        >
          <TabsList aria-label="Sidebar sections">
            <TabsTrigger
              value="inbox"
              className="sidebar-tab-trigger"
              aria-describedby="sidebar-tab-tooltip-inbox"
            >
              <InboxGlyph />
              <span>Inbox</span>
              <TabTooltip id="sidebar-tab-tooltip-inbox">This review's pull requests</TabTooltip>
            </TabsTrigger>
            <TabsTrigger
              value="tree"
              className="sidebar-tab-trigger"
              aria-describedby="sidebar-tab-tooltip-tree"
            >
              <TreeGlyph />
              <span>Tree</span>
              <TabTooltip id="sidebar-tab-tooltip-tree">Browse changed files</TabTooltip>
            </TabsTrigger>
            <TabsTrigger
              value="description"
              className="sidebar-tab-trigger"
              aria-describedby="sidebar-tab-tooltip-description"
            >
              <DescriptionGlyph />
              <span>Description</span>
              <TabTooltip id="sidebar-tab-tooltip-description">
                Pull request description and reviewers
              </TabTooltip>
            </TabsTrigger>
            <TabsTrigger
              value="activity"
              className="sidebar-tab-trigger"
              aria-describedby="sidebar-tab-tooltip-activity"
            >
              <ActivityGlyph />
              <span>Activity</span>
              <TabTooltip id="sidebar-tab-tooltip-activity">Review activity timeline</TabTooltip>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="inbox" forceMount className="sidebar-tab-panel">
            <InboxTab
              inbox={inbox}
              currentUserId={currentUserId}
              currentPullRequest={pullRequest}
              onSelectPullRequest={onSelectPullRequest}
              busy={busy}
            />
          </TabsContent>
          <TabsContent value="tree" forceMount className="sidebar-tab-panel">
            <Suspense fallback={<TreeTabSkeleton />}>
              <TreeTab
                files={files}
                selectedPath={selectedPath}
                onSelectPath={onSelectPath}
                active={tab === "tree"}
                themeType={themeType}
              />
            </Suspense>
          </TabsContent>
          <TabsContent value="description" forceMount className="sidebar-tab-panel">
            <DescriptionTab
              pullRequest={pullRequest}
              currentUserId={currentUserId}
              signalsState={signalsState}
              onRetry={loadSignals}
            />
          </TabsContent>
          <TabsContent value="activity" forceMount className="sidebar-tab-panel">
            <ActivityTab state={signalsState} onRetry={loadSignals} />
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}
