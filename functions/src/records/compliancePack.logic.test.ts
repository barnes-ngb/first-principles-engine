import { describe, expect, it } from "vitest";

import {
  buildPackManifestCsv,
  checkSizeAllowance,
  DEFAULT_PACK_LIMITS,
  describeSkipReason,
  findRemainingRemoteUrls,
  isPathWithinFamily,
  MANIFEST_HEADER,
  mediaEntryName,
  objectBasename,
  packDownloadName,
  packObjectPath,
  PackFileRole,
  PackSkipReason,
  parseStorageObjectRef,
  planPackMedia,
  rewritePortfolioMedia,
  selectExpiredPacks,
  summarizePack,
  unavailableMarker,
  validatePackRequest,
} from "./compliancePack.logic.js";

const FAMILY = "fam-1";

/** The shape real data actually holds: a tokenized firebasestorage URL. */
const downloadUrl = (path: string) =>
  `https://firebasestorage.googleapis.com/v0/b/fpe.appspot.com/o/${encodeURIComponent(path)}?alt=media&token=abc-123`;

const PHOTO_PATH = `families/${FAMILY}/artifacts/art-1/2026-07-04T12-00-00-000Z.jpg`;
const AUDIO_PATH = `families/${FAMILY}/artifacts/art-2/2026-07-04T12-05-00-000Z.webm`;

describe("parseStorageObjectRef", () => {
  it("decodes the tokenized firebasestorage download URL the app actually writes", () => {
    expect(parseStorageObjectRef(downloadUrl(PHOTO_PATH))).toEqual({
      bucket: "fpe.appspot.com",
      path: PHOTO_PATH,
    });
  });

  it("reads the plain GCS and gs:// forms too", () => {
    expect(
      parseStorageObjectRef(`https://storage.googleapis.com/fpe.appspot.com/${PHOTO_PATH}`),
    ).toEqual({ bucket: "fpe.appspot.com", path: PHOTO_PATH });
    expect(parseStorageObjectRef(`gs://fpe.appspot.com/${PHOTO_PATH}`)).toEqual({
      bucket: "fpe.appspot.com",
      path: PHOTO_PATH,
    });
    expect(
      parseStorageObjectRef(`https://fpe.appspot.com.storage.googleapis.com/${PHOTO_PATH}`),
    ).toEqual({ bucket: "fpe.appspot.com", path: PHOTO_PATH });
  });

  it("returns null for anything that is not a storage object", () => {
    for (const url of [
      "",
      "   ",
      "not a url",
      "data:image/png;base64,AAAA",
      "blob:http://localhost/abc",
      "https://example.com/photo.jpg",
      "https://firebasestorage.googleapis.com/v0/b/fpe.appspot.com/nope",
      "gs://bucket-only",
    ]) {
      expect(parseStorageObjectRef(url), url).toBeNull();
    }
  });
});

describe("isPathWithinFamily", () => {
  it("accepts this family's own tree", () => {
    expect(isPathWithinFamily(PHOTO_PATH, FAMILY)).toBe(true);
  });

  it("refuses another family, traversal, and absolute paths", () => {
    expect(isPathWithinFamily("families/fam-2/artifacts/a/x.jpg", FAMILY)).toBe(false);
    expect(isPathWithinFamily(`families/${FAMILY}/../fam-2/x.jpg`, FAMILY)).toBe(false);
    expect(isPathWithinFamily(`/families/${FAMILY}/x.jpg`, FAMILY)).toBe(false);
    expect(isPathWithinFamily("public/catalog/fam-1/index.html", FAMILY)).toBe(false);
    expect(isPathWithinFamily(PHOTO_PATH, "")).toBe(false);
  });
});

describe("mediaEntryName", () => {
  it("carries the artifact id so a file traces back to its record", () => {
    expect(mediaEntryName("art-1", PHOTO_PATH, new Set())).toBe(
      "media/art-1-2026-07-04T12-00-00-000Z.jpg",
    );
  });

  it("disambiguates rather than letting one file overwrite another", () => {
    const used = new Set<string>();
    const a = mediaEntryName("art-1", "families/f/x/photo.jpg", used);
    const b = mediaEntryName("art-1", "families/f/y/photo.jpg", used);
    expect(a).toBe("media/art-1-photo.jpg");
    expect(b).toBe("media/art-1-photo-2.jpg");
  });

  it("sanitizes ids and names that would escape the media directory", () => {
    const name = mediaEntryName("../evil", "families/f/a/..%2Fx.jpg", new Set());
    expect(name.startsWith("media/")).toBe(true);
    expect(name.split("/").length).toBe(2);
    expect(objectBasename("families/f/a/x.jpg")).toBe("x.jpg");
  });
});

describe("planPackMedia", () => {
  it("plans one entry per media URL and one row for a media-less artifact", () => {
    const entries = planPackMedia(
      [
        { id: "art-1", title: "Volcano", urls: [downloadUrl(PHOTO_PATH)] },
        { id: "art-2", title: "Narration", urls: [downloadUrl(AUDIO_PATH)] },
        { id: "art-3", title: "A note", urls: [] },
      ],
      FAMILY,
    );

    expect(entries).toHaveLength(3);
    expect(entries[0].objectPath).toBe(PHOTO_PATH);
    expect(entries[0].entryName).toBe("media/art-1-2026-07-04T12-00-00-000Z.jpg");
    expect(entries[1].entryName).toBe("media/art-2-2026-07-04T12-05-00-000Z.webm");
    expect(entries[2].skipReason).toBe(PackSkipReason.NoMedia);
  });

  it("refuses an object outside the family rather than fetching it", () => {
    const entries = planPackMedia(
      [{ id: "art-x", urls: [downloadUrl("families/fam-2/artifacts/a/x.jpg")] }],
      FAMILY,
    );
    expect(entries[0].skipReason).toBe(PackSkipReason.OutsideFamily);
    expect(entries[0].objectPath).toBeUndefined();
  });

  it("marks an unresolvable link rather than dropping the artifact", () => {
    const entries = planPackMedia(
      [{ id: "art-y", urls: ["https://example.com/photo.jpg"] }],
      FAMILY,
    );
    expect(entries[0].skipReason).toBe(PackSkipReason.UnreadableUrl);
  });

  // ── UX-285: a link is not a broken file ──────────────────────────────────
  //
  // A Video artifact records an EXTERNAL address by design — nothing was ever
  // uploaded for it — so reporting "media link could not be resolved to a file"
  // describes a correct record as a failure, on the one surface where that must
  // not happen.
  it("reports a Video artifact's external address as a link, not a failure", () => {
    const entries = planPackMedia(
      [
        {
          id: "vid-1",
          title: "Ancient Egypt",
          type: "Video",
          urls: ["https://example.com/watch?v=abc"],
        },
      ],
      FAMILY,
    );
    expect(entries[0].skipReason).toBe(PackSkipReason.ExternalLink);
    expect(describeSkipReason(PackSkipReason.ExternalLink)).not.toMatch(/could not/i);
  });

  it("keeps a PHOTO's foreign URL unreadable — that one really is a defect", () => {
    // The distinction is what kind of evidence this is, not whether the URL
    // parsed: a photo that should be a file and is not cannot be archived, and
    // calling it "recorded in the portfolio" would be false — the Links section
    // holds no row for it.
    const entries = planPackMedia(
      [{ id: "p-1", type: "Photo", urls: ["https://example.com/photo.jpg"] }],
      FAMILY,
    );
    expect(entries[0].skipReason).toBe(PackSkipReason.UnreadableUrl);
  });

  it("keeps a non-web scheme unreadable even on a Video artifact", () => {
    for (const url of ["javascript:alert(1)", "data:text/html,x", "gs://nope"]) {
      const entries = planPackMedia([{ id: "v", type: "Video", urls: [url] }], FAMILY);
      expect(entries[0].skipReason, url).toBe(PackSkipReason.UnreadableUrl);
    }
  });

  it("keeps a MALFORMED Storage URL unreadable, not external", () => {
    // Classing it external would leave it intact through the rewrite, and
    // `findRemainingRemoteUrls` then ABORTS the whole archive rather than ship
    // a live Storage link — so this misclassification broke the export outright
    // rather than mislabelling one row.
    const entries = planPackMedia(
      [
        {
          id: "v",
          type: "Video",
          urls: ["https://firebasestorage.googleapis.com/bad-path"],
        },
      ],
      FAMILY,
    );
    expect(entries[0].skipReason).toBe(PackSkipReason.UnreadableUrl);
  });

  it("does not let a malformed Storage URL survive the rewrite", () => {
    const url = "https://firebasestorage.googleapis.com/bad-path";
    const entries = planPackMedia([{ id: "v", type: "Video", urls: [url] }], FAMILY);
    const { markdown } = rewritePortfolioMedia(`- [Egypt](${url})`, entries);

    expect(markdown).toContain("evidence unavailable");
    expect(findRemainingRemoteUrls(markdown)).toEqual([]);
  });

  it("never treats a Storage URL as external", () => {
    const entries = planPackMedia(
      [{ id: "v", type: "Video", urls: [downloadUrl(PHOTO_PATH)] }],
      FAMILY,
    );
    expect(entries[0].skipReason).toBeUndefined();
    expect(entries[0].objectPath).toBe(PHOTO_PATH);
  });
});

// ── UX-285: the Links section must survive the rewrite ──────────────────────
//
// `rewritePortfolioMedia` matches EVERY markdown link, not only images, so the
// portfolio's new Links section would otherwise have each entry replaced by an
// "evidence unavailable" marker — deleting the address the section exists to
// record, and doing it alongside a reason reading "recorded in the portfolio".
// The rule the rewrite enforces is *no revocable Storage token in the archive*;
// a public address is not one.
describe("rewritePortfolioMedia and external links", () => {
  const LINK = "https://example.com/watch?v=abc";

  it("leaves an external link exactly as written", () => {
    const entries = planPackMedia(
      [{ id: "vid-1", title: "Ancient Egypt", type: "Video", urls: [LINK] }],
      FAMILY,
    );
    const md = `### Links

- [Ancient Egypt](${LINK})
`;
    const { markdown } = rewritePortfolioMedia(md, entries);

    expect(markdown).toContain(`- [Ancient Egypt](${LINK})`);
    expect(markdown).not.toContain("evidence unavailable");
  });

  it("still marks a Storage link that has no file in the pack", () => {
    // The external-link case must not have widened into "leave everything".
    const entries = planPackMedia(
      [{ id: "p-1", type: "Photo", urls: [downloadUrl(PHOTO_PATH)] }],
      FAMILY,
    ).map((e) => ({ ...e, skipReason: PackSkipReason.NotFound }));
    const md = `![Volcano](${downloadUrl(PHOTO_PATH)})`;
    const { markdown } = rewritePortfolioMedia(md, entries);

    expect(markdown).toContain("evidence unavailable");
    expect(markdown).not.toContain("firebasestorage");
  });

  it("reports no external link as a remaining remote URL", () => {
    // The offline-readability scan must not read a public video address as a
    // leftover Storage token.
    const md = `- [Ancient Egypt](${LINK})`;
    expect(findRemainingRemoteUrls(md)).toEqual([]);
  });
});

describe("checkSizeAllowance", () => {
  it("refuses a single oversized file", () => {
    expect(checkSizeAllowance(0, DEFAULT_PACK_LIMITS.maxFileBytes + 1)).toEqual({
      ok: false,
      reason: PackSkipReason.FileTooLarge,
    });
  });

  it("refuses the file that would cross the total ceiling", () => {
    const limits = { maxFileBytes: 100, maxTotalBytes: 150 };
    expect(checkSizeAllowance(100, 40, limits)).toEqual({ ok: true });
    expect(checkSizeAllowance(100, 60, limits)).toEqual({
      ok: false,
      reason: PackSkipReason.PackSizeCap,
    });
  });
});

describe("rewritePortfolioMedia", () => {
  const markdown = [
    "# Portfolio Index — 2026-07-01 to 2027-06-30",
    "",
    "## Lincoln",
    "",
    `![Volcano](${downloadUrl(PHOTO_PATH)})`,
    "",
    "## Dad Lab",
    "",
    `[Narration](${downloadUrl(AUDIO_PATH)})`,
    "",
    "See [the charter](https://example.com/charter).",
  ].join("\n");

  it("rewrites embedded media to relative paths inside the zip", () => {
    const entries = planPackMedia(
      [
        { id: "art-1", title: "Volcano", urls: [downloadUrl(PHOTO_PATH)] },
        { id: "art-2", title: "Narration", urls: [downloadUrl(AUDIO_PATH)] },
      ],
      FAMILY,
    );
    const { markdown: out, unmatchedUrls } = rewritePortfolioMedia(markdown, entries);

    expect(out).toContain("![Volcano](media/art-1-2026-07-04T12-00-00-000Z.jpg)");
    expect(out).toContain("[Narration](media/art-2-2026-07-04T12-05-00-000Z.webm)");
    expect(unmatchedUrls).toEqual([]);
    // The point of the whole run: nothing still needs the network or a token.
    expect(findRemainingRemoteUrls(out)).toEqual([]);
  });

  it("leaves non-storage links alone", () => {
    const entries = planPackMedia([], FAMILY);
    const { markdown: out } = rewritePortfolioMedia(markdown, entries);
    expect(out).toContain("[the charter](https://example.com/charter)");
  });

  it("says so inline when a file could not be included", () => {
    const entries = planPackMedia(
      [{ id: "art-1", title: "Volcano", urls: [downloadUrl(PHOTO_PATH)] }],
      FAMILY,
    ).map((e) => ({ ...e, skipReason: PackSkipReason.NotFound }));

    const { markdown: out } = rewritePortfolioMedia(markdown, entries);
    expect(out).toContain(
      "_[evidence unavailable — artifact art-1, file no longer in storage]_",
    );
    expect(out).not.toContain("![Volcano]");
  });

  it("never leaves a storage URL behind, even one no artifact claimed", () => {
    const { markdown: out, unmatchedUrls } = rewritePortfolioMedia(markdown, []);
    expect(findRemainingRemoteUrls(out)).toEqual([]);
    expect(unmatchedUrls).toHaveLength(2);
    expect(out).toContain(
      unavailableMarker(undefined, PackSkipReason.NotInManifest),
    );
  });
});

describe("findRemainingRemoteUrls", () => {
  it("finds a leaked token URL in any rendered file", () => {
    const found = findRemainingRemoteUrls(`see ![x](${downloadUrl(PHOTO_PATH)}) here`);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("firebasestorage.googleapis.com");
    expect(findRemainingRemoteUrls("no links here")).toEqual([]);
  });
});

describe("buildPackManifestCsv", () => {
  it("accounts for every artifact — included and skipped alike", () => {
    const entries = planPackMedia(
      [
        { id: "art-1", title: "Volcano", createdAt: "2026-07-04", type: "Photo", scope: "family", urls: [downloadUrl(PHOTO_PATH)] },
        { id: "art-3", title: "A note", createdAt: "2026-07-05", type: "Note", scope: "child", urls: [] },
      ],
      FAMILY,
    ).map((e, i) => (i === 0 ? { ...e, bytes: 2048 } : e));

    const csv = buildPackManifestCsv(entries, ["https://firebasestorage.googleapis.com/v0/b/b/o/x"]);
    const lines = csv.trimEnd().split("\n");

    expect(lines[0]).toBe(MANIFEST_HEADER.join(","));
    expect(lines[1]).toBe(
      "art-1,Volcano,2026-07-04,Photo,family,included,media/art-1-2026-07-04T12-00-00-000Z.jpg,2048,",
    );
    expect(lines[2]).toContain("skipped");
    expect(lines[2]).toContain(describeSkipReason(PackSkipReason.NoMedia));
    expect(lines[3]).toContain(describeSkipReason(PackSkipReason.NotInManifest));
  });

  it("escapes a title holding a comma or a quote", () => {
    const csv = buildPackManifestCsv([
      { artifactId: "a", title: 'Lincoln\'s "big" day, part 2', createdAt: "", type: "", scope: "", url: "", skipReason: PackSkipReason.NoMedia },
    ]);
    expect(csv).toContain('"Lincoln\'s ""big"" day, part 2"');
  });
});

describe("summarizePack", () => {
  it("counts what made it in and what did not", () => {
    expect(
      summarizePack([
        { artifactId: "a", title: "", createdAt: "", type: "", scope: "", url: "u", entryName: "media/a.jpg", bytes: 10 },
        { artifactId: "b", title: "", createdAt: "", type: "", scope: "", url: "u", entryName: "media/b.jpg", skipReason: PackSkipReason.NotFound },
        { artifactId: "c", title: "", createdAt: "", type: "", scope: "", url: "", skipReason: PackSkipReason.NoMedia },
      ]),
    ).toEqual({ included: 1, skipped: 2, bytes: 10 });
  });
});

describe("validatePackRequest", () => {
  const good = {
    familyId: FAMILY,
    childId: "child-1",
    childName: "Lincoln",
    startDate: "2026-07-01",
    endDate: "2027-06-30",
    files: [
      { role: PackFileRole.HoursSummary, name: "lincoln-hours.csv", content: "a,b\n" },
      { role: PackFileRole.Portfolio, name: "lincoln-portfolio.md", content: "# x" },
    ],
    artifacts: [{ id: "art-1", title: "Volcano", urls: [downloadUrl(PHOTO_PATH)] }],
  };

  it("accepts a well-formed request", () => {
    const result = validatePackRequest(good);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.files).toHaveLength(2);
      expect(result.request.artifacts[0].urls).toHaveLength(1);
    }
  });

  it("rejects bad dates and an inverted range", () => {
    expect(validatePackRequest({ ...good, startDate: "07/01/2026" }).ok).toBe(false);
    expect(validatePackRequest({ ...good, endDate: "2026-06-30" }).ok).toBe(false);
  });

  it("rejects a file name that would escape the zip root", () => {
    for (const name of ["../evil.csv", "media/x.csv", ".hidden", ""]) {
      const result = validatePackRequest({
        ...good,
        files: [{ role: PackFileRole.HoursSummary, name, content: "x" }],
      });
      expect(result.ok, name).toBe(false);
    }
  });

  it("rejects an unknown role, a duplicate name, and a missing id", () => {
    expect(
      validatePackRequest({ ...good, files: [{ role: "whatever", name: "x.csv", content: "" }] }).ok,
    ).toBe(false);
    expect(
      validatePackRequest({
        ...good,
        files: [
          { role: PackFileRole.HoursSummary, name: "x.csv", content: "" },
          { role: PackFileRole.DailyLogs, name: "x.csv", content: "" },
        ],
      }).ok,
    ).toBe(false);
    expect(validatePackRequest({ ...good, childId: "  " }).ok).toBe(false);
    expect(validatePackRequest({ ...good, familyId: "" }).ok).toBe(false);
    expect(validatePackRequest(null).ok).toBe(false);
    expect(validatePackRequest({ ...good, files: [] }).ok).toBe(false);
  });
});

describe("pack storage naming and retention", () => {
  it("writes generated packs under their own prefix, never among the artifacts", () => {
    const path = packObjectPath(FAMILY, "Lincoln", "2026-07-01", "2027-06-30", "2026-07-26T03:00:00.000Z");
    expect(path).toBe(
      `families/${FAMILY}/compliance-packs/2026-07-26T03-00-00-000Z-lincoln-compliance-archive-2026-07-01-to-2027-06-30.zip`,
    );
    expect(path).not.toContain("/artifacts/");
  });

  it("names the download after the child and range", () => {
    expect(packDownloadName("Lincoln", "2026-07-01", "2027-06-30")).toBe(
      "lincoln-compliance-archive-2026-07-01-to-2027-06-30.zip",
    );
    expect(packDownloadName("", "2026-07-01", "2027-06-30")).toBe(
      "compliance-archive-2026-07-01-to-2027-06-30.zip",
    );
  });

  it("sweeps only packs past the retention window, and never one it cannot date", () => {
    const now = Date.parse("2026-07-26T12:00:00.000Z");
    const expired = selectExpiredPacks(
      [
        { name: "old.zip", updated: "2026-07-24T12:00:00.000Z" },
        { name: "fresh.zip", updated: "2026-07-26T11:00:00.000Z" },
        { name: "undated.zip" },
        { name: "garbled.zip", updated: "not a date" },
      ],
      now,
    );
    expect(expired).toEqual(["old.zip"]);
  });
});
