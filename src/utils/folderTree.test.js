import { describe, it, expect } from "vitest";
import {
  UNFILED,
  buildFolderTree,
  dissolveFolderPatches,
  findInFolder,
  folderName,
  folderPaths,
  folderSegments,
  followFolderMove,
  isWithinFolder,
  moveToFolderPatches,
  normalizeFolderPath,
  parentFolder,
  renameFolderPatches,
} from "./folderTree.js";

const at = (id, folderId) => ({ id, title: id, url: `https://${id}.test`, folderId });

describe("folder paths (#55)", () => {
  it("reads a typed path as its parts, blanks and stray spaces gone", () => {
    expect(folderSegments("  Work / Project   A //")).toEqual(["Work", "Project A"]);
    expect(folderSegments("")).toEqual([]);
    expect(folderSegments(undefined)).toEqual([]);
  });

  it("normalizes a path back to a canonical string", () => {
    expect(normalizeFolderPath("/Work//Project A/")).toBe("Work/Project A");
  });

  it("names the folder and its parent", () => {
    expect(folderName("Work/Project A")).toBe("Project A");
    expect(parentFolder("Work/Project A")).toBe("Work");
    expect(parentFolder("Work")).toBe("");
  });

  it("contains by segment, not by string prefix", () => {
    expect(isWithinFolder("Work/Project", "Work")).toBe(true);
    expect(isWithinFolder("Work", "Work")).toBe(true);
    expect(isWithinFolder("Workshop", "Work")).toBe(false);
    expect(isWithinFolder("Work", "Work/Project")).toBe(false);
  });

  it("treats the root as containing everything", () => {
    expect(isWithinFolder("Work/Project", "")).toBe(true);
    expect(isWithinFolder("", "")).toBe(true);
  });

  it("ignores case, because two spellings of one folder is not two folders", () => {
    expect(isWithinFolder("work/project", "Work")).toBe(true);
  });
});

describe("buildFolderTree (#55)", () => {
  const list = [
    at("1", "Work"),
    at("2", "Work/Project A"),
    at("3", "Work/Project A"),
    at("4", "Personal"),
    at("5", ""),
    at("6", undefined),
  ];

  it("derives the tree from the paths bookmarks carry", () => {
    const { folders } = buildFolderTree(list);

    expect(folders.map((f) => f.path)).toEqual(["Personal", "Work"]);
    expect(folders.find((f) => f.path === "Work").children.map((c) => c.path)).toEqual([
      "Work/Project A",
    ]);
  });

  it("counts what is in a folder and what is under it separately", () => {
    const work = buildFolderTree(list).folders.find((f) => f.path === "Work");

    expect(work.count).toBe(1);
    expect(work.total).toBe(3);
    expect(work.children[0].count).toBe(2);
  });

  it("counts the bookmarks in no folder rather than inventing one for them", () => {
    const { unfiled, total } = buildFolderTree(list);

    expect(unfiled).toBe(2);
    expect(total).toBe(6);
  });

  it("merges spellings that differ only in case, keeping the first seen", () => {
    const { folders } = buildFolderTree([at("1", "Work"), at("2", "work"), at("3", "WORK/Sub")]);

    expect(folders).toHaveLength(1);
    expect(folders[0].name).toBe("Work");
    expect(folders[0].total).toBe(3);
  });

  it("lists every path in use, ancestors included", () => {
    expect(folderPaths([at("1", "Work/Project A/Notes"), at("2", "Personal")])).toEqual([
      "Personal",
      "Work",
      "Work/Project A",
      "Work/Project A/Notes",
    ]);
  });
});

describe("findInFolder (#55)", () => {
  const list = [at("1", "Work"), at("2", "Work/Project A"), at("3", "Personal"), at("4", "")];

  it("includes subfolders, as the tree implies", () => {
    expect(findInFolder("Work", list).map((b) => b.id)).toEqual(["1", "2"]);
  });

  it("finds the bookmarks in no folder", () => {
    expect(findInFolder(UNFILED, list).map((b) => b.id)).toEqual(["4"]);
  });

  it("is everything when no folder is chosen", () => {
    expect(findInFolder("", list)).toHaveLength(4);
  });
});

describe("moveToFolderPatches (#55)", () => {
  const list = [at("1", "Work"), at("2", "Personal"), at("3", "Work")];

  it("moves the named bookmarks and leaves the rest alone", () => {
    expect(moveToFolderPatches(list, ["1", "2"], "Archive")).toEqual([
      { id: "1", folderId: "Archive" },
      { id: "2", folderId: "Archive" },
    ]);
  });

  it("writes nothing for a bookmark already there", () => {
    expect(moveToFolderPatches(list, ["1", "3"], "Work")).toEqual([]);
  });

  it("moves to no folder at all", () => {
    expect(moveToFolderPatches(list, ["1"], UNFILED)).toEqual([{ id: "1", folderId: "" }]);
  });
});

describe("renameFolderPatches (#55)", () => {
  const list = [
    at("1", "Work"),
    at("2", "Work/Project A"),
    at("3", "Workshop"),
    at("4", "Personal"),
  ];

  it("takes the subfolders and their bookmarks with it", () => {
    expect(renameFolderPatches(list, "Work", "Job")).toEqual([
      { id: "1", folderId: "Job" },
      { id: "2", folderId: "Job/Project A" },
    ]);
  });

  it("renests rather than renaming when the new path is inside another folder", () => {
    expect(renameFolderPatches(list, "Work", "Archive/Work")).toEqual([
      { id: "1", folderId: "Archive/Work" },
      { id: "2", folderId: "Archive/Work/Project A" },
    ]);
  });

  it("moves the contents to the root when there is no new path", () => {
    expect(renameFolderPatches(list, "Work", "")).toEqual([
      { id: "1", folderId: "" },
      { id: "2", folderId: "Project A" },
    ]);
  });

  it("refuses to move a folder inside itself", () => {
    expect(renameFolderPatches(list, "Work", "Work/Archive")).toEqual([]);
  });

  it("refuses to rename the root, which nobody named", () => {
    expect(renameFolderPatches(list, "", "Everything")).toEqual([]);
  });

  it("writes nothing when the name is the one it already has", () => {
    expect(renameFolderPatches(list, "Work", "work")).toEqual([]);
  });
});

// A rename rewrites bookmarks; a filter naming the old path would then match
// nothing and highlight no row, so it has to follow the move.
describe("followFolderMove (#55)", () => {
  it("follows the folder it names", () => {
    expect(followFolderMove("Work", "Work", "Archive/Work")).toBe("Archive/Work");
  });

  it("follows from inside the subtree, which moved too", () => {
    expect(followFolderMove("Work/Project A", "Work", "Archive/Work")).toBe(
      "Archive/Work/Project A"
    );
  });

  it("leaves a filter naming something else alone", () => {
    expect(followFolderMove("Personal", "Work", "Archive/Work")).toBe("Personal");
    expect(followFolderMove("Wor", "Work", "Archive/Work")).toBe("Wor");
    expect(followFolderMove("", "Work", "Archive/Work")).toBe("");
    expect(followFolderMove(UNFILED, "Work", "Archive/Work")).toBe(UNFILED);
  });

  it("answers with everything when a top-level folder dissolves", () => {
    // Its bookmarks are at the root now, and the root is everything.
    expect(followFolderMove("Work", "Work", "")).toBe("");
  });
});

describe("dissolveFolderPatches (#55)", () => {
  it("empties a folder upwards instead of deleting what was in it", () => {
    const list = [at("1", "Work/Project A"), at("2", "Work/Project A/Notes"), at("3", "Work")];

    expect(dissolveFolderPatches(list, "Work/Project A")).toEqual([
      { id: "1", folderId: "Work" },
      { id: "2", folderId: "Work/Notes" },
    ]);
  });

  it("empties a top-level folder to the root", () => {
    expect(dissolveFolderPatches([at("1", "Work")], "Work")).toEqual([{ id: "1", folderId: "" }]);
  });
});
