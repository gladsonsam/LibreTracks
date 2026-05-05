import { describe, expect, it } from "vitest";

import type { LibraryAssetSummary } from "./desktopApi";
import { mergeLibraryAssetsByFilePath } from "./pendingAudioImports";

function asset(overrides: Partial<LibraryAssetSummary> & Pick<LibraryAssetSummary, "fileName" | "filePath">): LibraryAssetSummary {
  return {
    fileName: overrides.fileName,
    filePath: overrides.filePath,
    durationSeconds: overrides.durationSeconds ?? 1,
    isMissing: overrides.isMissing ?? false,
    folderPath: overrides.folderPath ?? null,
  };
}

describe("pendingAudioImports helpers", () => {
  it("preserves incoming assets over stale base entries with the same file path", () => {
    const baseAssets = [asset({ fileName: "Guide.wav", filePath: "/audio/guide.wav", durationSeconds: 4 })];
    const incomingAssets = [
      asset({ fileName: "Guide.wav", filePath: "/audio/guide.wav", durationSeconds: 12 }),
    ];

    expect(mergeLibraryAssetsByFilePath(baseAssets, incomingAssets)).toEqual([
      asset({ fileName: "Guide.wav", filePath: "/audio/guide.wav", durationSeconds: 12 }),
    ]);
  });

  it("keeps merged assets sorted by folder and file name", () => {
    const baseAssets = [asset({ fileName: "Kick.wav", filePath: "/loops/kick.wav", folderPath: "Drums" })];
    const incomingAssets = [
      asset({ fileName: "Bass.wav", filePath: "/bass/bass.wav", folderPath: "Bass" }),
      asset({ fileName: "Snare.wav", filePath: "/loops/snare.wav", folderPath: "Drums" }),
    ];

    expect(mergeLibraryAssetsByFilePath(baseAssets, incomingAssets).map((item) => item.fileName)).toEqual([
      "Bass.wav",
      "Kick.wav",
      "Snare.wav",
    ]);
  });
});