// ARCH-06: Slimmed BookmarkApp — orchestration only. Logic delegated to hooks/utils.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyAgentPlan, sortStepsByPriority } from "../utils/bookmarkFilters.js";
import {
  EMPTY_FILTERS,
  applyManualFilters,
  cycleTag,
  deriveTagCounts,
  hasActiveFilters,
} from "../utils/manualFilters.js";
import { filterDuplicateImports, findDuplicateIds } from "../utils/duplicates.js";
import { isBroken } from "../utils/linkHealth.js";
import { fetchUrlStatus } from "../utils/urlStatus.js";
import { organizePatches } from "../utils/organizePlan.js";
import { isViewWorthSaving, matchingViewId } from "../utils/smartViews.js";
import { useSemanticDedupe } from "../hooks/useSemanticDedupe.js";
import { isSafeHttpUrl } from "../utils/url.js";
import { parseNetscapeHtml } from "../utils/netscapeBookmarks.js";
import { remoteFaviconsEnabled, setRemoteFaviconsEnabled } from "../utils/favicon.js";
import { useAgentEngine } from "../hooks/useAgentEngine.js";
import { useBookmarkSelection } from "../hooks/useBookmarkSelection.js";
import { useBookmarkStore } from "../hooks/useBookmarkStore.js";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts.js";
import { useLinkSweep } from "../hooks/useLinkSweep.js";
import { useOrganizer } from "../hooks/useOrganizer.js";
import { useSemanticSearch } from "../hooks/useSemanticSearch.js";
import { useLLMSettings } from "../hooks/useLLMSettings.js";
import { useTheme } from "../hooks/useTheme.js";
import { useDebounce } from "../hooks/useDebounce.js";
import { useSmartViews } from "../hooks/useSmartViews.js";
import { useUndoHistory } from "../hooks/useUndoHistory.js";

import ErrorBoundary from "./ErrorBoundary.jsx";
import HelpModal from "./HelpModal";
import MessageModal from "./MessageModal";
import BookmarkForm from "./BookmarkForm";
import ImportExportContent from "./ImportExportContent";
import DeleteConfirmModal from "./DeleteConfirmModal";
import OptionsModal from "./OptionsModal";
import BookmarkList from "./BookmarkList.jsx";
import BulkEditBar from "./BulkEditBar.jsx";
import LinkSweepBar from "./LinkSweepBar.jsx";
import OrganizeReviewModal from "./OrganizeReviewModal.jsx";
import SmartViewBar from "./SmartViewBar.jsx";
import { AgentPlan, Button, IconButton, Kbd, Modal, SearchBar, Toast } from "./DesignSystem.jsx";

// Plan steps that write a new order to the store, rather than sorting the view.
const REORDER_ACTIONS = ["reorder", "reorderAscending", "reorderDescending", "persistSortedOrder"];

const getImportResultMessage = (importedCount, skippedCount, emptyMessage) => {
  if (importedCount > 0) {
    const skipped = skippedCount > 0 ? ` Skipped ${skippedCount} duplicate(s).` : "";
    return { message: `Imported ${importedCount} bookmark(s).${skipped}`, type: "success" };
  }

  if (skippedCount > 0) {
    return {
      message: `No new bookmarks imported. Skipped ${skippedCount} duplicate(s).`,
      type: "info",
    };
  }

  return { message: emptyMessage, type: "info" };
};

// ─── Component ────────────────────────────────────────────────────────────────

const BookmarkApp = () => {
  // ─── Theme ──────────────────────────────────────────────────────────────────
  const { currentTheme, themes, selectTheme, uploadTheme } = useTheme();

  // ─── Store ──────────────────────────────────────────────────────────────────
  // #56: every write records its own inverse, so undo covers whatever the store
  // is asked to do rather than the two operations that remembered to snapshot.
  const undo = useUndoHistory(showCustomMessage);
  const {
    bookmarks,
    isLoading,
    importProgress,
    storeRef,
    init,
    saveBookmark,
    deleteBookmarks,
    saveAllBookmarks,
    appendBookmarks,
    persistSortedOrder,
    applyBulkEdit,
  } = useBookmarkStore(undo.record);

  // Init store on mount
  useEffect(() => init(showCustomMessage), []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── LLM provider settings (#9/#29/#36 live in the hook) ────────────────────
  const {
    provider: runtimeProvider,
    setProvider: setRuntimeProvider,
    providerOptions,
    updateProviderOptions,
    encryption,
    enableEncryption,
    disableEncryption,
    unlock,
  } = useLLMSettings(showCustomMessage);

  // ─── UI state ───────────────────────────────────────────────────────────────
  // #39: Off by default — fetching favicons from a third party would report the
  // user's hostnames on every render.
  const [remoteFavicons, setRemoteFavicons] = useState(remoteFaviconsEnabled);
  const [searchQuery, setSearchQuery] = useState("");
  // The agent's accumulated plan. It stays here rather than inside the engine
  // because the view, the manual filters and a persisted reorder all read it.
  const [lastAction, setLastAction] = useState(null);
  const [editingBookmark, setEditingBookmark] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportExportModalOpen, setIsImportExportModalOpen] = useState(false);
  const [isDeleteConfirmModalOpen, setIsDeleteConfirmModalOpen] = useState(false);
  // #86: why a pair was proposed, shown in the confirmation. Empty for the
  // deterministic pass, which needs no explaining.
  const [duplicateReasons, setDuplicateReasons] = useState([]);
  const [isDeleting, setIsDeleting] = useState(false); // UX-09
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [bookmarksToDelete, setBookmarksToDelete] = useState([]);
  // #44: the diff a tidy-up is waiting to be reviewed through, empty when none is.
  const [proposedChanges, setProposedChanges] = useState([]);
  const [isApplyingChanges, setIsApplyingChanges] = useState(false);
  const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
  const [messageModalContent, setMessageModalContent] = useState({ message: "", type: "info" });
  // #53: manual filter state, independent of the agent plan so neither clobbers the other.
  const [manualFilters, setManualFilters] = useState(EMPTY_FILTERS);

  // #49: saved views name what is on screen — the plan and the filters together.
  const { views, save: saveView, forget: forgetView } = useSmartViews();

  // #11: only http(s) URLs open — javascript: and data: are refused out loud
  // rather than silently ignored.
  const openBookmark = useCallback((bookmark) => {
    if (isSafeHttpUrl(bookmark.url)) window.open(bookmark.url, "_blank", "noopener,noreferrer");
    else
      showCustomMessage(
        "This bookmark has an unsupported or unsafe URL and was not opened.",
        "error"
      );
  }, []);

  const {
    selectedId: selectedBookmarkId,
    multiSelectedIds: multiSelectedBookmarkIds,
    selectedIds,
    selectAll,
    clear: clearSelectedBookmarks,
    onBookmarkClick: handleBookmarkClick,
    onBookmarkKeyDown: handleBookmarkKeyDown,
  } = useBookmarkSelection(openBookmark);

  // Read by an effect that must not resubscribe when the list changes.
  const bookmarksRef = useRef(bookmarks);
  useEffect(() => {
    bookmarksRef.current = bookmarks;
  }, [bookmarks]);

  // PERF-07: Debounce search for displayedBookmarks (input updates instantly; search updates after 300ms)
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  // #53: debounce only the filter text — chips/selects apply immediately, since they
  // are discrete choices and waiting on them feels broken.
  const debouncedFilterText = useDebounce(manualFilters.text, 300);
  const effectiveFilters = useMemo(
    () => ({ ...manualFilters, text: debouncedFilterText }),
    [manualFilters, debouncedFilterText]
  );

  // ─── Background URL validation on select ────────────────────────────────────
  // When a bookmark is selected, silently validate its URL and auto-save if the
  // status or URL has changed (e.g. 404 discovered, or a redirect destination).
  // Skips bookmarks where the user explicitly set urlStatus="ignored".
  useEffect(() => {
    if (!selectedBookmarkId) return;
    const bookmark = bookmarksRef.current.find((b) => b.id === selectedBookmarkId);
    if (!bookmark?.url || bookmark.urlStatus === "ignored") return;

    let cancelled = false;
    fetchUrlStatus(bookmark.url)
      .then(({ status, redirectUrl }) => {
        if (cancelled) return;
        const newUrl = redirectUrl || bookmark.url;
        if (newUrl !== bookmark.url || status !== bookmark.urlStatus) {
          storeRef.current?.update(bookmark.id, { url: newUrl, urlStatus: status });
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [selectedBookmarkId, storeRef]); // bookmarksRef is a ref, no dep needed

  // ─── Dead-link sweep (#47) ──────────────────────────────────────────────────
  // Asked for rather than automatic: checking every link contacts every host in
  // the collection. It resumes where it left off, so a large collection can be
  // swept over several runs.
  const sweep = useLinkSweep({ bookmarks, storeRef, showMessage: showCustomMessage });
  const brokenCount = useMemo(() => bookmarks.filter(isBroken).length, [bookmarks]);
  const showBrokenOnly = useCallback(
    () => setManualFilters((prev) => ({ ...prev, brokenOnly: true })),
    []
  );

  // ─── Displayed bookmarks (PERF-08: precise deps, ARCH-10: empty state handled in BookmarkList) ─
  // #53: the agent plan narrows first, then the manual filters layer on top. Tag facets
  // come from the planned set (pre-manual) so the chip row doesn't rearrange itself out
  // from under the pointer as you click chips.
  const plannedBookmarks = useMemo(
    () => applyAgentPlan(lastAction, bookmarks),
    [bookmarks, lastAction]
  );

  const tagFacets = useMemo(() => deriveTagCounts(plannedBookmarks), [plannedBookmarks]);

  // #54: The bulk bar needs the bookmarks, not just their ids — what a change
  // would write depends on what each of them currently holds.
  const selectedBookmarks = useMemo(
    () => bookmarks.filter((b) => multiSelectedBookmarkIds.includes(b.id)),
    [bookmarks, multiSelectedBookmarkIds]
  );

  const displayedBookmarks = useMemo(
    () =>
      applyManualFilters(effectiveFilters, plannedBookmarks).map((b) =>
        b.unreachable ? { ...b, urlStatus: "invalid" } : b
      ),
    [plannedBookmarks, effectiveFilters]
  );

  // #49: A view is "active" when the screen matches it, rather than because it was
  // the last one clicked — editing a filter afterwards should visibly leave it.
  const activeViewId = useMemo(
    () => matchingViewId(views, lastAction, manualFilters),
    [views, lastAction, manualFilters]
  );

  const applyView = useCallback((view) => {
    setLastAction(view.plan.length > 0 ? view.plan : null);
    setManualFilters(view.filters);
    setSearchQuery("");
  }, []);

  const handleSaveView = useCallback(
    (name) => {
      if (!saveView(name, lastAction, manualFilters)) {
        showCustomMessage("There's nothing to save — search or filter something first.", "info");
        return false;
      }
      return true;
    },
    [saveView, lastAction, manualFilters]
  );

  // ─── Message helper ──────────────────────────────────────────────────────────

  function showCustomMessage(message, type = "info") {
    setMessageModalContent({ message, type });
    setIsMessageModalOpen(true);
  }

  // ─── CRUD handlers ───────────────────────────────────────────────────────────
  const handleSaveBookmark = useCallback(
    async (b) => {
      await saveBookmark(b, showCustomMessage);
      setIsModalOpen(false);
    },
    [saveBookmark]
  );

  // #86: Staging a deletion always says why, even when the reason is "you asked".
  // Two setters that had to move together is how a stale "same page as" line ends
  // up explaining an unrelated delete.
  const stageDeletion = useCallback((ids, reasons = []) => {
    setBookmarksToDelete(ids);
    setDuplicateReasons(reasons);
    setIsDeleteConfirmModalOpen(true);
  }, []);

  const handleDeleteBookmark = useCallback((id) => stageDeletion([id]), [stageDeletion]);

  // #54: The bar plans the patches; applying them and saying how many landed is
  // the app's business, as with any other write.
  const handleBulkEdit = useCallback(
    async (patches) => {
      try {
        await applyBulkEdit(patches);
        showCustomMessage(`Updated ${patches.length} bookmark(s).`, "success");
      } catch (e) {
        console.error("Bulk edit failed:", e);
        showCustomMessage("Failed to update the selected bookmarks. Please try again.", "error");
      }
    },
    [applyBulkEdit]
  );

  // UX-09: Keep modal open during delete; show error on failure; success toast
  const handleConfirmDelete = useCallback(async () => {
    if (!storeRef.current) return;
    const ids = [...bookmarksToDelete];
    if (ids.length === 0) return;

    setIsDeleting(true);
    try {
      await deleteBookmarks(ids);
      setIsDeleteConfirmModalOpen(false);
      setIsModalOpen(false);
      clearSelectedBookmarks();
      showCustomMessage(`Deleted ${ids.length} bookmark(s).`, "success");
    } catch (e) {
      console.error("Delete failed:", e);
      // UX-09: Error message persists (no auto-dismiss) — user must acknowledge data loss risk
      showCustomMessage("Failed to delete bookmark(s). Please try again.", "error");
    } finally {
      setIsDeleting(false);
      setBookmarksToDelete([]);
      setDuplicateReasons([]);
    }
  }, [bookmarksToDelete, deleteBookmarks, storeRef, clearSelectedBookmarks]);

  const handleCancelDelete = useCallback(() => {
    setBookmarksToDelete([]);
    setDuplicateReasons([]);
    setIsDeleteConfirmModalOpen(false);
  }, []);

  const handleAddNewBookmark = useCallback(() => {
    setEditingBookmark({
      id: null,
      title: "",
      url: "",
      description: "",
      tags: [],
      rating: 0,
      folderId: "",
      faviconUrl: "",
    });
    setIsModalOpen(true);
  }, []);

  const handleImportExportOpen = useCallback(() => setIsImportExportModalOpen(true), []);
  const handleImportExportClose = useCallback(() => setIsImportExportModalOpen(false), []);

  const handleBookmarkDoubleClick = useCallback((bookmark) => {
    setEditingBookmark(bookmark);
    setIsModalOpen(true);
  }, []);

  // #44: A tidy-up is a proposal. The model answers, the diff is reviewed, and
  // only what the user keeps is written — through the bulk-edit path, so the whole
  // tidy-up is one undo entry rather than a hundred.
  const semantic = useSemanticSearch({
    provider: runtimeProvider,
    providerOptions,
    locked: encryption.locked,
  });

  const organizer = useOrganizer({
    provider: runtimeProvider,
    providerOptions,
    locked: encryption.locked,
    showMessage: showCustomMessage,
  });

  // The list is passed in rather than read from state: a plan that searches and
  // then organizes runs both in the same tick, before React has re-rendered with
  // the new plan, so `displayedBookmarks` would still be the previous view and the
  // tidy-up would range over bookmarks the query had just excluded.
  const handleOrganize = useCallback(
    async (list, fields) => {
      const rows = await organizer.run(list, fields ? { fields } : {});
      if (rows.length === 0) {
        showCustomMessage("Nothing to change — these bookmarks are already organized.", "info");
        return;
      }
      setProposedChanges(rows);
    },
    [organizer]
  );

  const handleApplyOrganize = useCallback(
    async (acceptedIds) => {
      const patches = organizePatches(proposedChanges, acceptedIds);
      if (patches.length === 0) return;
      setIsApplyingChanges(true);
      try {
        await applyBulkEdit(patches);
        setProposedChanges([]);
        showCustomMessage(`Updated ${patches.length} bookmark(s).`, "success");
      } catch (e) {
        console.error("Organize failed:", e);
        showCustomMessage("Failed to apply the changes. Please try again.", "error");
      } finally {
        setIsApplyingChanges(false);
      }
    },
    [applyBulkEdit, proposedChanges]
  );

  // #86: the optional second opinion on duplicates. With no provider configured,
  // or an encrypted key nobody unlocked, it proposes nothing and the rule-based
  // pass stands on its own.
  const { isAsking: isAskingAboutDuplicates, propose: proposeSemanticDuplicates } =
    useSemanticDedupe({
      provider: runtimeProvider,
      providerOptions,
      locked: encryption.locked,
    });

  // #86: the rule-based pass first, then — only if a provider is configured — a
  // second look at the pairs no rule can settle. Both end in the same
  // confirmation, and the model's reason for each pair is shown there.
  const handleRemoveDuplicates = useCallback(async () => {
    const certain = findDuplicateIds(displayedBookmarks);
    const remaining = displayedBookmarks.filter((b) => !certain.includes(b.id));
    const { ids: likely, reasons } = await proposeSemanticDuplicates(remaining);
    const ids = [...certain, ...likely];

    if (ids.length === 0) {
      showCustomMessage("No duplicate bookmarks found in the current view.", "info");
      return;
    }
    stageDeletion(ids, reasons);
  }, [displayedBookmarks, proposeSemanticDuplicates, stageDeletion]);

  const resetSearch = useCallback(() => {
    setLastAction(null);
    clearSelectedBookmarks();
    setBookmarksToDelete([]);
  }, [clearSelectedBookmarks]);

  // #53: filter handlers. "Clear filters" (in the bar) and "Clear Search" (the agent
  // plan) stay separate so clearing one doesn't silently discard the other; the
  // empty-state CTA clears both, since that's the "give me everything back" button.
  const handleCycleTag = useCallback((tag) => setManualFilters((prev) => cycleTag(prev, tag)), []);
  const clearManualFilters = useCallback(() => setManualFilters(EMPTY_FILTERS), []);
  const clearAllFilters = useCallback(() => {
    setManualFilters(EMPTY_FILTERS);
    resetSearch();
  }, [resetSearch]);

  // ─── Keyboard shortcuts ──────────────────────────────────────────────────────
  // Escape drops the selection and anything staged for deletion with it.
  const clearSelection = useCallback(() => {
    clearSelectedBookmarks();
    setBookmarksToDelete([]);
  }, [clearSelectedBookmarks]);

  const confirmDeleteSelection = useCallback(() => {
    if (selectedIds.length === 0) {
      showCustomMessage("Please select bookmark(s) to delete.", "info");
      return;
    }
    setBookmarksToDelete(selectedIds);
    setIsDeleteConfirmModalOpen(true);
    clearSelectedBookmarks();
  }, [selectedIds, clearSelectedBookmarks]);

  // #27: An open dialog owns the keyboard. Escape inside one closes it and stops
  // there, and the rest of the shortcuts stay bound but inactive rather than
  // reaching the list behind the dialog.
  const isDialogOpen =
    isModalOpen ||
    isImportExportModalOpen ||
    isDeleteConfirmModalOpen ||
    isHelpModalOpen ||
    isOptionsOpen ||
    isMessageModalOpen ||
    proposedChanges.length > 0;

  useKeyboardShortcuts(
    {
      Escape: clearSelection,
      // #56: the history outlives the toast, so this reaches writes whose offer
      // has already gone.
      "Mod+z": (event) => {
        event.preventDefault();
        undo.undoLast();
      },
      h: () => setIsHeaderVisible((prev) => !prev),
      // #22: select the currently visible (filtered) bookmarks, not the whole store
      "Mod+a": (event) => {
        event.preventDefault();
        selectAll(displayedBookmarks.map((b) => b.id));
      },
      "Mod+d": (event) => {
        event.preventDefault();
        confirmDeleteSelection();
      },
      d: (event) => {
        event.preventDefault();
        confirmDeleteSelection();
      },
      e: (event) => {
        const id = selectedBookmarkId || (selectedIds.length === 1 ? selectedIds[0] : null);
        const bookmark = id && bookmarks.find((b) => b.id === id);
        if (!bookmark) return;
        event.preventDefault();
        setEditingBookmark(bookmark);
        setIsModalOpen(true);
      },
      c: () => {
        const selected = bookmarks.find((b) => b.id === selectedBookmarkId);
        // SEC-05: URL validation stub (corsproxy removed)
        if (selected?.url)
          showCustomMessage("URL check not available in extension context.", "info");
      },
    },
    { enabled: !isDialogOpen }
  );

  // ─── Persisted reorder (UX-05: with undo) ───────────────────────────────────
  const persistReorder = useCallback(
    async (order = "asc", sortByOverride) => {
      if (!storeRef.current) return;
      const plan = Array.isArray(lastAction) ? lastAction : lastAction ? [lastAction] : [];
      let sortBy = "title";
      if (sortByOverride) sortBy = sortByOverride;
      else {
        const sortStep = plan.find((s) => s.action === "sortBookmarks");
        if (sortStep?.parameters?.sortBy) sortBy = sortStep.parameters.sortBy;
      }
      try {
        await persistSortedOrder({ sortBy, order });
        showCustomMessage(
          `Reordered ${order === "asc" ? "ascending" : "descending"} by ${sortBy} and saved.`,
          "success"
        );
        if (plan.length > 0) {
          // The order now lives in the store, so the steps that asked for it have
          // been honoured and would otherwise re-sort the view forever.
          const withoutSort = plan.filter(
            (s) => !["sortBookmarks", ...REORDER_ACTIONS].includes(s.action)
          );
          setLastAction(withoutSort.length > 0 ? withoutSort : null);
        }
      } catch (e) {
        console.error("Persist reorder failed", e);
        showCustomMessage("Failed to persist new order.", "error");
      }
    },
    [lastAction, persistSortedOrder, storeRef]
  );

  const handlePersistReorderFromAgent = useCallback(
    async (step) => {
      const action = (step?.action || "").toLowerCase();
      const order = step?.parameters?.order || (action.includes("descending") ? "desc" : "asc");
      let sortBy = step?.parameters?.sortBy || "title";
      if (!step?.parameters?.sortBy) {
        const plan = Array.isArray(lastAction) ? lastAction : lastAction ? [lastAction] : [];
        const sortStep = plan.find((s) => s.action === "sortBookmarks");
        if (sortStep?.parameters?.sortBy) sortBy = sortStep.parameters.sortBy;
      }
      await persistReorder(order, sortBy);
    },
    [lastAction, persistReorder]
  );

  // ─── Agent plan side effects ─────────────────────────────────────────────────
  // What a plan *does* to the app, as opposed to how it was obtained. #21: in the
  // priority order the model assigned, and awaited, so a step that writes finishes
  // before the next one starts.
  // #46: A search reaches the vector index too, and the answer replaces the step
  // that asked — `semanticMatches` carries the query with it, because widening has
  // to see what substring matching filtered out. With no index and no provider this
  // returns nothing and the plain search stands.
  const widenSearch = useCallback(
    async (searchTerm) => {
      const ids = await semantic.search(searchTerm, bookmarks);
      if (ids.length === 0) return;
      setLastAction((plan) => {
        const steps = Array.isArray(plan) ? plan : plan ? [plan] : [];
        return steps.map((step) =>
          step.action === "searchBookmarks" && step.parameters?.searchTerm === searchTerm
            ? { ...step, action: "semanticMatches", parameters: { searchTerm, ids } }
            : step
        );
      });
    },
    [bookmarks, semantic]
  );

  const runPlanSteps = useCallback(
    async (steps, plan) => {
      // What this plan shows, computed from the plan itself for the same reason
      // `handleOrganize` takes a list: the render carrying it has not happened yet.
      const inView = () => applyManualFilters(effectiveFilters, applyAgentPlan(plan, bookmarks));
      for (const step of sortStepsByPriority(steps)) {
        if (step.action === "help") setIsHelpModalOpen(true);
        if (step.action === "importBookmarks" || step.action === "exportBookmarks")
          setIsImportExportModalOpen(true);
        if (step.action === "removeDuplicates") {
          const inView = applyAgentPlan(plan, bookmarks);
          const certain = findDuplicateIds(inView);
          const { ids: likely, reasons } = await proposeSemanticDuplicates(
            inView.filter((b) => !certain.includes(b.id))
          );
          const ids = [...certain, ...likely];
          if (ids.length > 0) stageDeletion(ids, reasons);
          else showCustomMessage("No duplicate bookmarks found in the current view.", "info");
        }
        if (step.action === "searchBookmarks" && step.parameters?.searchTerm)
          await widenSearch(step.parameters.searchTerm);
        if (step.action === "organizeBookmarks")
          await handleOrganize(inView(), step.parameters?.fields);
        if (REORDER_ACTIONS.includes(step.action)) await handlePersistReorderFromAgent(step);
      }
    },
    [
      bookmarks,
      effectiveFilters,
      handleOrganize,
      handlePersistReorderFromAgent,
      proposeSemanticDuplicates,
      stageDeletion,
      widenSearch,
    ]
  );

  const { isProcessing, run: runAgent } = useAgentEngine({
    provider: runtimeProvider,
    providerOptions,
    locked: encryption.locked,
    plan: lastAction,
    onPlan: setLastAction,
    onSteps: runPlanSteps,
    showMessage: showCustomMessage,
  });

  const handleSearchInputKeyDown = useCallback(
    (e) => {
      if (e.key !== "Enter") return;
      // The one query that is not a query: "options" opens the dialog. It predates
      // the agent and costs nothing to keep working.
      if ((searchQuery || "").trim().toLowerCase() === "options") {
        setIsOptionsOpen(true);
        return;
      }
      setBookmarksToDelete([]);
      runAgent(searchQuery);
    },
    [searchQuery, runAgent]
  );

  // ─── Import handlers ─────────────────────────────────────────────────────────
  const handleImportJson = useCallback(
    async (arr, replaceAll = false) => {
      const existing = replaceAll ? [] : bookmarks;
      // #11: only import entries with a safe http(s) URL.
      const safe = (Array.isArray(arr) ? arr : []).filter(
        (b) => b && typeof b === "object" && isSafeHttpUrl(b.url)
      );
      const { bookmarks: bookmarksToImport, skippedCount } = filterDuplicateImports(safe, existing);

      if (replaceAll) {
        await saveAllBookmarks(bookmarksToImport);
      } else if (bookmarksToImport.length > 0) {
        await appendBookmarks(bookmarksToImport);
      }

      const result = getImportResultMessage(
        bookmarksToImport.length,
        skippedCount,
        "No bookmarks found in the import data."
      );
      showCustomMessage(result.message, result.type);
      handleImportExportClose();
      setLastAction(null);
    },
    [appendBookmarks, bookmarks, handleImportExportClose, saveAllBookmarks]
  );

  const handleImportHtml = useCallback(
    async (html, replaceAll = false) => {
      try {
        const importedBookmarks = parseNetscapeHtml(html);

        // #11: only import links with a safe http(s) URL.
        const safeBookmarks = importedBookmarks.filter((b) => isSafeHttpUrl(b.url));
        const existing = replaceAll ? [] : bookmarks;
        const { bookmarks: bookmarksToImport, skippedCount } = filterDuplicateImports(
          safeBookmarks,
          existing
        );

        if (replaceAll) {
          await saveAllBookmarks(bookmarksToImport);
        } else if (bookmarksToImport.length > 0) {
          await appendBookmarks(bookmarksToImport);
        }

        if (safeBookmarks.length > 0) {
          const result = getImportResultMessage(
            bookmarksToImport.length,
            skippedCount,
            "No bookmarks found in the imported HTML."
          );
          showCustomMessage(result.message, result.type);
        } else {
          showCustomMessage("No bookmarks found in the imported HTML.", "info");
        }
        setLastAction(null);
      } catch (e) {
        console.error("Error parsing HTML bookmarks:", e);
        showCustomMessage("Failed to parse HTML bookmarks.", "error");
      } finally {
        handleImportExportClose();
      }
    },
    [appendBookmarks, bookmarks, handleImportExportClose, saveAllBookmarks]
  );

  // ─── Render ──────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: "var(--bg-secondary)" }}
      >
        <div className="text-center">
          <div
            className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto mb-4"
            style={{ borderColor: "var(--accent)" }}
          />
          <p style={{ color: "var(--text-secondary)" }}>Loading bookmarks...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-screen overflow-hidden flex flex-col font-sans"
      style={{ backgroundColor: "var(--bg-secondary)" }}
    >
      {/* UX-06: Import progress bar */}
      {importProgress && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-accent text-white text-sm text-center py-2">
          Importing… {importProgress.done} / {importProgress.total}
          <div className="h-1 bg-white bg-opacity-30 mt-1">
            <div
              className="h-1 bg-white transition-all"
              style={{
                width: `${Math.round((importProgress.done / importProgress.total) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* UX-05: Undo toast */}
      {undo.offered && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
          <Toast label={undo.offered.label} onAction={undo.undoLast} onDismiss={undo.dismiss} />
        </div>
      )}

      <header
        className={`bookmarkit-header fixed top-0 left-0 right-0 z-10 transition-transform duration-300 ${isHeaderVisible ? "translate-y-0" : "-translate-y-full"}`}
        role="banner"
      >
        <div className="bg-primary-bg shadow-sm border-b border-border h-full">
          <div className="max-w-4xl mx-auto px-4 py-4 h-full flex flex-col justify-center">
            <h1 className="sr-only">bookmarkit</h1>
            <div className="flex justify-center items-center space-x-2">
              <div className="relative w-full max-w-md">
                <SearchBar
                  id="search-input"
                  type="text"
                  placeholder="Type natural language queries (e.g., 'find github')"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleSearchInputKeyDown}
                  processing={isProcessing}
                  size="lg"
                  aria-label="Natural language search"
                />
              </div>
              <IconButton label="Help" variant="bordered" onClick={() => setIsHelpModalOpen(true)}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  viewBox="0 0 24 24"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.09 9a3 3 0 115.82 1c-.44.86-1.26 1.3-1.91 1.63-.51.26-.75.52-.75.87v.5" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </IconButton>
            </div>
            <div className="flex justify-center items-center mt-2 space-x-2 flex-wrap gap-y-1">
              <Button size="sm" onClick={handleAddNewBookmark}>
                Add New
              </Button>
              <Button size="sm" intent="secondary" onClick={handleImportExportOpen}>
                Import/Export
              </Button>
              <Button
                size="sm"
                intent="secondary"
                onClick={handleRemoveDuplicates}
                loading={isAskingAboutDuplicates}
              >
                {isAskingAboutDuplicates ? "Comparing…" : "Remove Duplicates"}
              </Button>
              <Button
                size="sm"
                intent="secondary"
                onClick={sweep.running ? sweep.stop : sweep.start}
              >
                {sweep.running ? "Stop Check" : "Check Links"}
              </Button>
              {lastAction && (
                <Button size="sm" intent="ghost" onClick={resetSearch}>
                  Clear Search
                </Button>
              )}
              <IconButton label="Options" variant="bordered" onClick={() => setIsOptionsOpen(true)}>
                ⚙
              </IconButton>
            </div>
            <div className="text-center text-xs text-secondary-text mt-1">
              Click to select, <Kbd>Shift</Kbd>
              +click to open, double-click or <Kbd>E</Kbd> to edit.
            </div>
          </div>
        </div>
      </header>

      <main
        className={`bookmarkit-main flex-1 overflow-hidden flex flex-col transition-all duration-300 ${isHeaderVisible ? "bookmarkit-main--header-visible" : "bookmarkit-main--header-hidden"}`}
        role="main"
      >
        <div className="flex-1 min-h-0 max-w-4xl w-full mx-auto px-4 flex flex-col">
          {/* Agent plan display */}
          {lastAction && (
            <div className="mb-4">
              <AgentPlan steps={lastAction} error={lastAction.action === "error"} />
            </div>
          )}

          <SmartViewBar
            views={views}
            activeViewId={activeViewId}
            canSave={isViewWorthSaving(lastAction, manualFilters)}
            onApply={applyView}
            onSave={handleSaveView}
            onForget={forgetView}
          />

          <LinkSweepBar
            running={sweep.running}
            checked={sweep.checked}
            total={sweep.total}
            brokenCount={brokenCount}
            brokenOnly={manualFilters.brokenOnly}
            onStop={sweep.stop}
            onShowBroken={showBrokenOnly}
          />

          {organizer.running && (
            <div
              className="mb-4 p-3 rounded-lg border border-border bg-primary-bg flex items-center gap-3"
              role="status"
              aria-live="polite"
            >
              <span className="text-sm text-primary-text">
                Reading your bookmarks… {organizer.done} of {organizer.total}
              </span>
              <Button type="button" intent="secondary" size="sm" onClick={organizer.stop}>
                Stop
              </Button>
            </div>
          )}

          {/* #54: Only for a real multi-selection — a single click is served by the form. */}
          {multiSelectedBookmarkIds.length > 0 && (
            <BulkEditBar
              selected={selectedBookmarks}
              allBookmarks={bookmarks}
              onApply={handleBulkEdit}
              onClearSelection={clearSelectedBookmarks}
              onDelete={confirmDeleteSelection}
            />
          )}

          {/* ARCH-10: Empty state + PERF-06: virtualized list — flex-1 fills remaining viewport height */}
          <div className="flex-1 min-h-0 pb-4">
            <BookmarkList
              bookmarks={displayedBookmarks}
              selectedBookmarkId={selectedBookmarkId}
              multiSelectedBookmarkIds={multiSelectedBookmarkIds}
              bookmarksToDelete={bookmarksToDelete}
              onBookmarkClick={handleBookmarkClick}
              onBookmarkDoubleClick={handleBookmarkDoubleClick}
              onBookmarkKeyDown={handleBookmarkKeyDown}
              isLoading={isLoading}
              bookmarksTotal={bookmarks.length}
              searchActive={!!debouncedSearchQuery || hasActiveFilters(effectiveFilters)}
              lastAction={lastAction}
              searchQuery={debouncedSearchQuery || debouncedFilterText}
              onClearSearch={clearAllFilters}
              onAddNew={handleAddNewBookmark}
              onImport={handleImportExportOpen}
              remoteFavicons={remoteFavicons}
              filters={manualFilters}
              tagFacets={tagFacets}
              onFilterChange={setManualFilters}
              onCycleTag={handleCycleTag}
              onClearFilters={clearManualFilters}
              filterSummary={(() => {
                const shown =
                  displayedBookmarks.length === bookmarks.length
                    ? `${bookmarks.length} total bookmarks`
                    : `${displayedBookmarks.length} of ${bookmarks.length} bookmarks`;
                if (multiSelectedBookmarkIds.length > 0)
                  return `${multiSelectedBookmarkIds.length} selected | ${shown}`;
                if (selectedBookmarkId) return `1 selected | ${shown}`;
                return shown;
              })()}
            />
          </div>
        </div>
      </main>

      {/* ─── Modals ─── */}
      <ErrorBoundary fallbackMessage="A modal encountered an error.">
        {isHelpModalOpen && <HelpModal onClose={() => setIsHelpModalOpen(false)} />}
        {isOptionsOpen && (
          <OptionsModal
            provider={runtimeProvider}
            providerOptions={providerOptions}
            onChange={setRuntimeProvider}
            onChangeOptions={updateProviderOptions}
            encryption={encryption}
            onEnableEncryption={enableEncryption}
            onDisableEncryption={disableEncryption}
            onUnlock={unlock}
            currentTheme={currentTheme}
            themes={themes}
            onThemeChange={selectTheme}
            onThemeUpload={(file) => uploadTheme(file, showCustomMessage)}
            remoteFavicons={remoteFavicons}
            onRemoteFaviconsChange={(enabled) => {
              setRemoteFaviconsEnabled(enabled);
              setRemoteFavicons(enabled);
            }}
            onClose={() => setIsOptionsOpen(false)}
          />
        )}
        {isMessageModalOpen && (
          <MessageModal
            message={messageModalContent.message}
            type={messageModalContent.type}
            onClose={() => setIsMessageModalOpen(false)}
          />
        )}
        {isModalOpen && (
          <BookmarkForm
            bookmark={editingBookmark}
            onClose={() => setIsModalOpen(false)}
            onSave={handleSaveBookmark}
            onDelete={handleDeleteBookmark}
            fetchUrlStatus={fetchUrlStatus}
            provider={runtimeProvider}
            providerOptions={providerOptions}
          />
        )}
        {isImportExportModalOpen && (
          <Modal title="Import / Export Bookmarks" onClose={handleImportExportClose} size="lg">
            <ImportExportContent
              bookmarks={bookmarks}
              onClose={handleImportExportClose}
              onImportJson={handleImportJson}
              onImportHtml={handleImportHtml}
              showMessage={showCustomMessage}
            />
          </Modal>
        )}
        {isDeleteConfirmModalOpen && (
          <DeleteConfirmModal
            message={`Are you sure you want to delete ${bookmarksToDelete.length} bookmark(s)?`}
            reasons={duplicateReasons}
            onConfirm={handleConfirmDelete}
            onCancel={handleCancelDelete}
            isLoading={isDeleting}
          />
        )}
        {proposedChanges.length > 0 && (
          <OrganizeReviewModal
            rows={proposedChanges}
            onApply={handleApplyOrganize}
            onCancel={() => setProposedChanges([])}
            isApplying={isApplyingChanges}
          />
        )}
      </ErrorBoundary>
    </div>
  );
};

export default BookmarkApp;
