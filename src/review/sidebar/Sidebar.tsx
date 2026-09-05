import { type JSX, lazy, Suspense, useEffect, useRef, useState } from "react";
import type { CodeReviewProvider, PullRequestSummary } from "../../providers/contracts";
import { IconButton } from "../../ui/IconButton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/Tabs";
import type { PreparedPatchFile } from "../patch";
import { type ActivityState, ActivityTab } from "./ActivityTab";
import { DescriptionTab } from "./DescriptionTab";

// @pierre/trees is large; keep it out of the main ReviewScreen chunk (§19).
const TreeTab = lazy(() => import("./TreeTab").then((module) => ({ default: module.TreeTab })));

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

export interface SidebarProps {
  readonly files: ReadonlyArray<PreparedPatchFile>;
  readonly selectedPath: string | null;
  readonly onSelectPath: (path: string) => void;
  readonly pullRequest: PullRequestSummary;
  readonly currentUserId: string;
  readonly provider: CodeReviewProvider;
}

type SidebarTab = "tree" | "description" | "activity";

export function Sidebar({
  files,
  selectedPath,
  onSelectPath,
  pullRequest,
  currentUserId,
  provider,
}: SidebarProps): JSX.Element {
  const [tab, setTab] = useState<SidebarTab>("tree");
  // Owned for the lifetime of this open review: ReviewScreen remounts Sidebar
  // (via its own per-PR `key`) whenever the reviewed pull request changes.
  const activityCacheRef = useRef(new Map<string, ActivityState>());
  const [activitySignals, setActivitySignals] = useState<ActivityState | undefined>(undefined);
  // <768px only (§15): the persistent column becomes a bottom sheet. Same
  // mounted Tabs tree either way — only its CSS presentation and this open
  // state differ, so Tree/Description/Activity state survives the transition.
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (!sheetOpen) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setSheetOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [sheetOpen]);

  return (
    <>
      <IconButton
        label="Open sidebar"
        tooltip="Files"
        className="sidebar-trigger"
        onClick={() => setSheetOpen(true)}
      >
        <SidebarTriggerIcon />
      </IconButton>
      {sheetOpen ? (
        <button
          type="button"
          aria-label="Close sidebar"
          className="sidebar-sheet-backdrop"
          onClick={() => setSheetOpen(false)}
        />
      ) : null}
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as SidebarTab)}
        className="sidebar"
        data-sheet-open={sheetOpen}
        aria-label="Review sidebar"
      >
        <TabsList aria-label="Sidebar sections">
          <TabsTrigger value="tree">Tree</TabsTrigger>
          <TabsTrigger value="description">Description</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="tree" forceMount className="sidebar-tab-panel">
          <Suspense fallback={<TreeTabSkeleton />}>
            <TreeTab
              files={files}
              selectedPath={selectedPath}
              onSelectPath={onSelectPath}
              active={tab === "tree"}
            />
          </Suspense>
        </TabsContent>
        <TabsContent value="description" forceMount className="sidebar-tab-panel">
          <DescriptionTab
            pullRequest={pullRequest}
            currentUserId={currentUserId}
            signals={activitySignals?.signals ?? []}
          />
        </TabsContent>
        <TabsContent value="activity" forceMount className="sidebar-tab-panel">
          <ActivityTab
            provider={provider}
            pullRequest={pullRequest}
            active={tab === "activity"}
            cache={activityCacheRef.current}
            onStateChange={setActivitySignals}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
