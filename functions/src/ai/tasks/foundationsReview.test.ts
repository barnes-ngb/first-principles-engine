import { describe, expect, it } from "vitest";
import {
  buildFoundationsReviewRole,
  extractImageUrls,
  extractReviewAgenda,
  formatAgenda,
  formatBridges,
} from "./foundationsReview.js";
import type { ChatTaskMessage } from "../chatTypes.js";

const AGENDA = {
  domain: "reading",
  subjectLabel: "reading",
  concepts: [
    { conceptId: "reading.phonics.blends", name: "Blend sounds", description: "Reads words like stop, frog", state: "frontier", evidence: ["from the June check"] },
    { conceptId: "reading.phonics.longVowels", name: "Long vowel words", description: "Reads words like cake, boat", state: "not-yet", evidence: [] },
  ],
};

describe("extractReviewAgenda", () => {
  it("pulls the agenda from the marker and cleans the message", () => {
    const messages: ChatTaskMessage[] = [
      { role: "user", content: `[FOUNDATIONS_REVIEW]${JSON.stringify(AGENDA)}[/FOUNDATIONS_REVIEW]\nStart it.` },
    ];
    const { agenda, messages: out } = extractReviewAgenda(messages);
    expect(agenda?.concepts).toHaveLength(2);
    expect(out[0].content).not.toContain("FOUNDATIONS_REVIEW");
    expect(out[0].content).toContain("Start it.");
  });

  it("supplies a clean start line when the marker is the whole message", () => {
    const messages: ChatTaskMessage[] = [
      { role: "user", content: `[FOUNDATIONS_REVIEW]${JSON.stringify(AGENDA)}[/FOUNDATIONS_REVIEW]` },
    ];
    const { messages: out } = extractReviewAgenda(messages);
    expect(out[0].content).toBe("Let's start the reading review.");
  });

  it("tolerates a missing/unparseable marker (null agenda, messages untouched)", () => {
    const messages: ChatTaskMessage[] = [{ role: "user", content: "hello" }];
    const { agenda, messages: out } = extractReviewAgenda(messages);
    expect(agenda).toBeNull();
    expect(out[0].content).toBe("hello");
  });
});

describe("formatAgenda", () => {
  it("renders concepts in order with plain names, no band numbers", () => {
    const text = formatAgenda(AGENDA);
    expect(text).toContain("EXACT ORDER");
    expect(text).toContain("Blend sounds");
    // ordered
    expect(text.indexOf("Blend sounds")).toBeLessThan(text.indexOf("Long vowel words"));
  });

  it("handles an empty agenda gracefully", () => {
    expect(formatAgenda({ domain: "math", subjectLabel: "math", concepts: [] })).toContain("empty");
    expect(formatAgenda(null)).toContain("empty");
  });
});

describe("buildFoundationsReviewRole — locked display + action rules", () => {
  const role = buildFoundationsReviewRole("child-1", "Lincoln", "reading");

  it("threads the childId into the action grammar and names all three write kinds", () => {
    expect(role).toContain('"childId":"child-1"');
    expect(role).toContain('"kind":"attest"');
    expect(role).toContain('"kind":"covered"');
    expect(role).toContain('"kind":"queueTest"');
  });

  it("forbids band numbers and percentages, and carries no-shame rails", () => {
    expect(role).toContain("NEVER show band numbers");
    expect(role).toContain("NEVER show percentages");
    expect(role.toLowerCase()).toContain("no shame");
    expect(role).toContain("PROPOSED"); // never "saved/done"
  });

  it("names the assistant the Learning Engine and never assumes the parent's name (amendment A)", () => {
    expect(role).toContain("LEARNING ENGINE");
    expect(role.toLowerCase()).toContain('as "you"');
    expect(role.toLowerCase()).toContain("never assume or use the parent's name");
    expect(role).not.toContain("Shelly");
  });

  it("offers the outs when asking for detail, and never presses a second recall follow-up (amendment B)", () => {
    // The three outs are present in the same breath: photo, test, "not sure".
    expect(role).toContain("OFFER THE OUTS");
    expect(role.toLowerCase()).toContain("snap a photo");
    expect(role.toLowerCase()).toContain("test it");
    expect(role).toContain("'not sure'");
    // No second recall-detail follow-up once uncertainty is signalled.
    expect(role).toContain("do NOT press with a second recall-detail follow-up");
  });

  it("handles both photo source classes — curriculum screenshots and work samples (Step 2 + amendment C)", () => {
    // A) curriculum screenshot → bridge-mapped covered, words-known as detail not mastery
    expect(role).toContain("CURRICULUM-APP SCREENSHOT");
    expect(role).toContain("BRIDGE");
    expect(role).toContain('"unit":"Peak N"');
    expect(role).toContain("NOT sight-word mastery");
    // no bridge → at most one generic covered, never invents a position
    expect(role).toContain("AT MOST a single generic");
    // B) work sample → attest, may reach solid for what it clearly shows
    expect(role).toContain("ACTUAL WORK");
    expect(role).toContain('`attest`');
    expect(role).toContain('MAY reach "solid"');
  });
});

describe("formatBridges", () => {
  const agendaWithBridge = {
    domain: "reading",
    subjectLabel: "reading",
    concepts: [],
    bridges: [
      {
        source: "fastPhonics",
        version: 1,
        units: [
          { peak: 8, phase: 3, covers: ["reading.phonics.digraphs"] },
          { peak: 13, phase: 4, covers: ["reading.phonics.blends", "reading.decoding.multisyllable"] },
          { peak: 19, phase: 5, covers: ["reading.phonics.vowelTeams"], depthOnly: true },
        ],
      },
    ],
  };

  it("renders each peak with its covered concepts and marks depth-only rows", () => {
    const text = formatBridges(agendaWithBridge);
    expect(text).toContain('BRIDGE for source "fastPhonics"');
    expect(text).toContain("Peak 8 (phase 3): reading.phonics.digraphs");
    expect(text).toContain("Peak 13 (phase 4): reading.phonics.blends");
    expect(text).toContain("depth only");
  });

  it("returns empty string when there is no bridge (e.g. math)", () => {
    expect(formatBridges({ domain: "math", subjectLabel: "math", concepts: [] })).toBe("");
    expect(formatBridges(null)).toBe("");
  });
});

describe("extractImageUrls", () => {
  it("pulls one or more leading [IMAGE_URL:…] markers and returns the context text", () => {
    const one = extractImageUrls("[IMAGE_URL:https://x/a.jpg]\nthese are Fast Phonics");
    expect(one.urls).toEqual(["https://x/a.jpg"]);
    expect(one.text).toBe("these are Fast Phonics");

    const many = extractImageUrls("[IMAGE_URL:https://x/a.jpg][IMAGE_URL:https://x/b.jpg]\nhis spelling page");
    expect(many.urls).toHaveLength(2);
    expect(many.text).toBe("his spelling page");
  });

  it("returns no urls for a plain text message", () => {
    const plain = extractImageUrls("just talking");
    expect(plain.urls).toEqual([]);
    expect(plain.text).toBe("just talking");
  });
});
