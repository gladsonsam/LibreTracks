import { describe, expect, it } from "vitest";

import {
  LIBRARY_ASSET_DRAG_MIME,
  classifyDroppedFiles,
  getDroppedFiles,
  isExternalFileDrag,
  isInternalLibraryDrag,
} from "./dragDrop";

function buildTransfer(args?: { files?: File[]; items?: DataTransferItem[]; types?: string[] }) {
  const files = args?.files ?? [];
  const indexedFiles = files.reduce<Record<number, File>>((accumulator, file, index) => {
    accumulator[index] = file;
    return accumulator;
  }, {});
  const fileList = {
    length: files.length,
    item: (index: number) => files[index] ?? null,
    ...indexedFiles,
  } as unknown as FileList;

  return {
    files: fileList,
    items: args?.items ?? [],
    types: args?.types ?? [],
  } as unknown as DataTransfer;
}

describe("dragDrop helpers", () => {
  it("detects internal library drags from the custom MIME type", () => {
    expect(isInternalLibraryDrag(buildTransfer({ types: [LIBRARY_ASSET_DRAG_MIME] }))).toBe(true);
    expect(isExternalFileDrag(buildTransfer({ types: [LIBRARY_ASSET_DRAG_MIME] }))).toBe(false);
  });

  it("classifies a package drop", () => {
    const file = new File([new Uint8Array([1, 2, 3])], "demo.ltpkg");
    expect(classifyDroppedFiles([file]).kind).toBe("package");
  });

  it("classifies supported audio drops", () => {
    const files = [
      new File([new Uint8Array([1])], "drums.wav"),
      new File([new Uint8Array([2])], "bass.flac"),
    ];
    const classification = classifyDroppedFiles(files);
    expect(classification.kind).toBe("audio");
    expect(classification.audioFiles).toHaveLength(2);
  });

  it("classifies package and audio combinations as mixed", () => {
    const files = [
      new File([new Uint8Array([1])], "song.ltpkg"),
      new File([new Uint8Array([2])], "guide.wav"),
    ];
    expect(classifyDroppedFiles(files).kind).toBe("mixed");
  });

  it("classifies unsupported files", () => {
    const files = [new File([new Uint8Array([1])], "notes.txt")];
    expect(classifyDroppedFiles(files).kind).toBe("unsupported");
  });

  it("returns dropped files from the transfer payload", () => {
    const files = [new File([new Uint8Array([1])], "drums.wav")];
    expect(getDroppedFiles(buildTransfer({ files, types: ["Files"] }))).toHaveLength(1);
    expect(isExternalFileDrag(buildTransfer({ files, types: ["Files"] }))).toBe(true);
  });

  it("falls back to DataTransfer.items during hover classification", () => {
    const items = [
      {
        kind: "file",
        getAsFile: () => new File([new Uint8Array([1])], "song.ltpkg"),
      },
      {
        kind: "file",
        getAsFile: () => new File([new Uint8Array([2])], "guide.wav"),
      },
    ] as DataTransferItem[];

    const files = getDroppedFiles(buildTransfer({ items, types: ["Files"] }));
    expect(files).toHaveLength(2);
    expect(classifyDroppedFiles(files).kind).toBe("mixed");
  });
});
