import type { JSX, ReactNode } from "react";
import type { PullRequestSummary } from "../providers/contracts";
import { Button } from "../ui/Button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "../ui/DropdownMenu";
import { IconButton } from "../ui/IconButton";
import { type ThemeChoice, ThemeControl } from "../ui/ThemeControl";
import { TooltipProvider } from "../ui/Tooltip";

// ponytail: @pierre/icons@0.7.1's dist/index.js re-exports "./types" without a file
// extension, which Node/Vitest ESM resolution rejects (verified: fails even in plain
// `node --input-type=module`). Inline SVGs sidestep that broken package until it ships
// a fixed release; swap these for @pierre/icons glyphs then.
function ToolbarSvgIcon({ children }: { readonly children: ReactNode }): JSX.Element {
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

const BackIcon = (): JSX.Element => (
  <ToolbarSvgIcon>
    <path d="M10 3 5 8l5 5" />
  </ToolbarSvgIcon>
);
const SplitViewIcon = (): JSX.Element => (
  <ToolbarSvgIcon>
    <rect x="2" y="3" width="5" height="10" rx="1" />
    <rect x="9" y="3" width="5" height="10" rx="1" />
  </ToolbarSvgIcon>
);
const UnifiedViewIcon = (): JSX.Element => (
  <ToolbarSvgIcon>
    <rect x="2" y="3" width="12" height="10" rx="1" />
    <path d="M5 6h6M5 8h6M5 10h4" />
  </ToolbarSvgIcon>
);
const CollapseAllIcon = (): JSX.Element => (
  <ToolbarSvgIcon>
    <path d="M4 6l4-3 4 3M4 13l4-3 4 3" />
  </ToolbarSvgIcon>
);
const DisplayOptionsIcon = (): JSX.Element => (
  <ToolbarSvgIcon>
    <circle cx="8" cy="8" r="2" />
    <path d="M8 2v2M8 12v2M2 8h2M12 8h2M3.8 3.8l1.4 1.4M10.8 10.8l1.4 1.4M3.8 12.2l1.4-1.4M10.8 5.2l1.4-1.4" />
  </ToolbarSvgIcon>
);
const SidebarToggleIcon = (): JSX.Element => (
  <ToolbarSvgIcon>
    <rect x="2" y="3" width="12" height="10" rx="1" />
    <path d="M6.5 3v10" />
  </ToolbarSvgIcon>
);

export interface ReviewToolbarProps {
  readonly pullRequest: PullRequestSummary;
  readonly sidebarCollapsed: boolean;
  readonly busy: boolean;
  readonly onBack: () => void;
  readonly onToggleSidebar: () => void;
  readonly onFinish: () => void;
  readonly theme: ThemeChoice;
  readonly resolvedTheme: "light" | "dark";
  readonly onThemeChange: (theme: ThemeChoice) => void;
  readonly onSplitView?: () => void;
  readonly onUnifiedView?: () => void;
  readonly onCollapseAll?: () => void;
  readonly collapsedAll?: boolean;
  readonly displayOptions?: ReactNode;
}

export function ReviewToolbar({
  pullRequest,
  sidebarCollapsed,
  busy,
  onBack,
  onToggleSidebar,
  onFinish,
  theme,
  resolvedTheme,
  onThemeChange,
  onSplitView,
  onUnifiedView,
  onCollapseAll,
  collapsedAll = false,
  displayOptions,
}: ReviewToolbarProps): JSX.Element {
  const collapseAllLabel = collapsedAll ? "Expand all files" : "Collapse all files";
  const sidebarToggleLabel = sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar";
  return (
    <TooltipProvider>
      <header className="review-toolbar">
        <IconButton
          label="Back to inbox"
          tooltip="Back to inbox"
          disabled={busy}
          onClick={onBack}
          className="review-toolbar-back"
        >
          <BackIcon />
        </IconButton>
        <div className="review-toolbar-identity leading-tight">
          <div className="truncate text-[length:var(--text-xs)] text-[var(--fg-muted)]">
            {pullRequest.ref.repository.workspace}/{pullRequest.ref.repository.slug} #
            {pullRequest.ref.id}
          </div>
          <h2 className="m-0 truncate text-[length:var(--text-sm)] font-medium">
            {pullRequest.title}
          </h2>
        </div>
        <Button
          variant="primary"
          disabled={busy}
          onClick={onFinish}
          className="review-toolbar-finish review-toolbar-finish-narrow"
        >
          Finish Review
        </Button>
        <div className="review-toolbar-row2">
          <IconButton
            label={sidebarToggleLabel}
            tooltip={sidebarToggleLabel}
            aria-pressed={sidebarCollapsed}
            disabled={busy}
            onClick={onToggleSidebar}
            className="review-toolbar-sidebar-toggle"
          >
            <SidebarToggleIcon />
          </IconButton>
          <div className="flex items-center gap-1">
            <IconButton
              label="Split view"
              tooltip="Split view"
              disabled={busy || !onSplitView}
              onClick={onSplitView}
            >
              <SplitViewIcon />
            </IconButton>
            <IconButton
              label="Unified view"
              tooltip="Unified view"
              disabled={busy || !onUnifiedView}
              onClick={onUnifiedView}
            >
              <UnifiedViewIcon />
            </IconButton>
          </div>
          <IconButton
            label={collapseAllLabel}
            tooltip={collapseAllLabel}
            aria-pressed={collapsedAll}
            disabled={busy || !onCollapseAll}
            onClick={onCollapseAll}
          >
            <CollapseAllIcon />
          </IconButton>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton
                label="Display options"
                tooltip="Display options"
                disabled={busy || !displayOptions}
              >
                <DisplayOptionsIcon />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent>{displayOptions}</DropdownMenuContent>
          </DropdownMenu>
          <ThemeControl theme={theme} resolvedTheme={resolvedTheme} onThemeChange={onThemeChange} />
        </div>
        <Button
          variant="primary"
          disabled={busy}
          onClick={onFinish}
          className="review-toolbar-finish review-toolbar-finish-wide"
        >
          Finish Review
        </Button>
      </header>
    </TooltipProvider>
  );
}
