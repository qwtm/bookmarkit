// ARCH-06, PERF-08: Pure bookmark filter/sort/limit functions extracted from BookmarkApp.jsx.
// No React or DOM dependencies — independently testable.
// PERF-08: Defined outside the component so references are stable across renders.

export const searchBookmarks = (searchTerm, list) => {
  const lower = (searchTerm || "").toLowerCase();
  if (!lower) return list;
  return list.filter(
    (b) =>
      (b.title?.toLowerCase() || "").includes(lower) ||
      (b.url?.toLowerCase() || "").includes(lower) ||
      (b.description?.toLowerCase() || "").includes(lower) ||
      (b.tags && b.tags.some((tag) => tag.toLowerCase().includes(lower))),
  );
};

export const findWithTags = (includeTags = [], excludeTags = [], list) => {
  const lowerInclude = includeTags.map((t) => t.toLowerCase());
  const lowerExclude = excludeTags.map((t) => t.toLowerCase());
  return list.filter((b) => {
    const bookmarkTags = b.tags ? b.tags.map((bt) => bt.toLowerCase()) : [];
    return (
      lowerInclude.every((tag) => bookmarkTags.includes(tag)) &&
      !lowerExclude.some((tag) => bookmarkTags.includes(tag))
    );
  });
};

export const findIncludes = (field, value, list) => {
  const lowerValue = (value || "").toLowerCase();
  return list.filter((b) => ((b[field] || "") + "").toLowerCase().includes(lowerValue));
};

export const findStartsWith = (field, value, list) => {
  const lowerValue = (value || "").toLowerCase();
  return list.filter((b) => {
    if (field === "tags") {
      const tags = Array.isArray(b.tags) ? b.tags : [];
      return tags.some((t) => (t || "").toString().toLowerCase().startsWith(lowerValue));
    }
    const val = ((b[field] ?? "") + "").toLowerCase();
    return lowerValue ? val.startsWith(lowerValue) : true;
  });
};

export const filterByRating = (params = {}, list) => {
  const { minRating, maxRating, comparator, exact } = params || {};
  const hasExact = typeof exact === "number" || comparator === "eq";
  const min = hasExact
    ? (typeof exact === "number" ? exact : minRating) || 0
    : typeof minRating === "number"
      ? minRating
      : 0;
  const max = hasExact ? min : typeof maxRating === "number" ? maxRating : 5;
  return list.filter((b) => {
    const r = b.rating || 0;
    if (comparator === "gte") return r >= min;
    if (comparator === "lte") return r <= min;
    if (comparator === "eq" || hasExact) return r === min;
    return r >= min && r <= max;
  });
};

export const sortBookmarks = (sortBy, order, list) => {
  const ord = (order || "asc").toLowerCase();
  return [...list].sort((a, b) => {
    let valA = a[sortBy];
    let valB = b[sortBy];
    if (valA === undefined || valA === null) valA = "";
    if (valB === undefined || valB === null) valB = "";
    if (typeof valA === "number" && typeof valB === "number") {
      return ord === "asc" ? valA - valB : valB - valA;
    }
    if (typeof valA === "string") valA = valA.toLowerCase();
    if (typeof valB === "string") valB = valB.toLowerCase();
    if (ord === "asc") return valA < valB ? -1 : valA > valB ? 1 : 0;
    return valA > valB ? -1 : valA < valB ? 1 : 0;
  });
};

export const limitResults = (count, list, direction = "first") => {
  const n = Number(count) || 0;
  if (!n || n <= 0) return list;
  return direction === "last" ? list.slice(-n) : list.slice(0, n);
};

// PERF-08: applyAgentPlan is a pure function — given the same plan + list it always
// returns the same reference-equal result when inputs are stable.
export const applyAgentPlan = (plan, list) => {
  if (!plan) return list;
  const actions = Array.isArray(plan) ? plan : [plan];
  const hasPriority = actions.some((s) => typeof s?.priority === "number");
  const ordered = hasPriority
    ? actions
        .map((s, idx) => ({ s, idx }))
        .sort((a, b) => a.s.priority - b.s.priority || a.idx - b.idx)
        .map((x) => x.s)
    : actions;
  let currentResults = [...list];
  for (const step of ordered) {
    const { action, parameters = {} } = step;
    if (
      [
        "importBookmarks", "exportBookmarks", "resetSearch",
        "showAllBookmarks", "removeDuplicates", "reorder",
        "reorderAscending", "reorderDescending", "persistSortedOrder",
      ].includes(action)
    )
      continue;
    switch (action) {
      case "searchBookmarks":
        currentResults = searchBookmarks(parameters.searchTerm || "", currentResults);
        break;
      case "findIncludes":
        currentResults = findIncludes(parameters.field || "title", parameters.value || "", currentResults);
        break;
      case "findStartsWith":
        currentResults = findStartsWith(parameters.field || "title", parameters.value || "", currentResults);
        break;
      case "findWithTags":
        currentResults = findWithTags(parameters.includeTags || [], parameters.excludeTags || [], currentResults);
        break;
      case "filterByRating":
        currentResults = filterByRating(parameters || {}, currentResults);
        break;
      case "sortBookmarks":
        currentResults = sortBookmarks(parameters.sortBy || "title", parameters.order || "asc", currentResults);
        break;
      case "limitResults":
        currentResults = limitResults(Number(parameters.count) || 0, parameters.scope === "all" ? list : currentResults, parameters.direction || "first");
        break;
      case "limitFirst":
        currentResults = limitResults(Number(parameters.count) || 0, currentResults, "first");
        break;
      case "limitLast":
        currentResults = limitResults(Number(parameters.count) || 0, currentResults, "last");
        break;
      default:
        break;
    }
  }
  return currentResults;
};
