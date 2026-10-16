import { describe, it, expect } from "vitest";
import { buildProspectiveCheckPrompt, buildScanSystemPrompt } from "./scan.js";

/**
 * The prospective prompt is its OWN prompt, and this is why.
 *
 * The first attempt appended a "before-work" section to the retrospective scan
 * prompt. That prompt also instructs the model on CERTIFICATES — returning
 * `suggestedSnapshotUpdate.masteredSkills` and a `recommendedStartLevel` — and
 * on COVER PAGES ("use this to set up workbook tracking"). So the model was
 * told not to claim mastery and, forty lines later, asked for a list of
 * mastered skills and a tracking setup. These cases pin the separation, in both
 * directions: the prospective prompt must not carry those instructions, and the
 * legacy prompt must still carry them unchanged.
 */

const SLICES = ["CHILD PROFILE: Lincoln, 8", "SKILL SNAPSHOT: addition to 20"];

const prospective = (slices: string[] = SLICES) =>
  buildProspectiveCheckPrompt("3", slices);

describe("the prospective prompt asks the prospective question", () => {
  it("says the page has not been done and the photo is not evidence about the student", () => {
    const prompt = prospective();
    expect(prompt).toContain("NOT done yet");
    expect(prompt).toMatch(/It is NOT evidence about the STUDENT/);
    expect(prompt).toMatch(/Do not state or imply what they know, have mastered/);
  });

  it("forbids inferring that earlier lessons were done", () => {
    expect(prospective()).toMatch(/say NOTHING about whether earlier lessons, pages or levels were done/);
    expect(prospective()).toMatch(/Never infer prior completion/);
  });

  it("states that no learning or progress record is written from the answer", () => {
    const prompt = prospective();
    expect(prompt).toMatch(/Nothing you return changes any learning or progress record/);
    expect(prompt).toMatch(/Do not propose such an update/);
  });

  it("makes 'I cannot tell' the required answer when there is no evidence about the child", () => {
    const prompt = prospective();
    expect(prompt).toMatch(/If it contains no recorded level, skill or history evidence/);
    expect(prompt).toMatch(/"unclear" for both "estimatedDifficulty" and "recommendation"/);
    expect(prompt).toMatch(/always better than a confident guess/);
  });

  it("says so explicitly when the caller supplied no evidence slices at all", () => {
    const prompt = prospective([]);
    expect(prompt).toContain("(No recorded level, skill or history evidence was supplied for this student.)");
  });

  it("redefines `skip` as a statement about the page, not about mastery", () => {
    expect(prospective()).toMatch(/This is a statement about the page's level, NOT a mastery claim/);
  });

  it("asks for an honest 'limits' line and a readable flag", () => {
    const prompt = prospective();
    expect(prompt).toContain('"limits"');
    expect(prompt).toContain('"readable"');
    expect(prompt).toMatch(/What you could NOT tell/);
  });

  it("keeps `pageType` so the shared reply reader can still tell an analysis from a refusal", () => {
    expect(prospective()).toContain('"pageType": "worksheet|textbook|test|activity|other"');
  });

  it("carries the capture context when the caller has one, with no contentNote talk", () => {
    const prompt = buildProspectiveCheckPrompt("3", SLICES, {
      itemLabel: "GATB Math",
      subjectBucket: "Math",
    });
    expect(prompt).toContain("CAPTURE CONTEXT");
    expect(prompt).toContain("Planned activity: GATB Math");
    // The prospective schema has no `contentNote`, so the header must not ask
    // the model to ground one — the retrospective header does, and is unchanged.
    expect(prompt).not.toContain("contentNote");
  });

  it("uses no child name — nothing in it can identify the student", () => {
    const prompt = buildProspectiveCheckPrompt("3", ["CHILD PROFILE: (redacted)"]);
    expect(prompt).toMatch(/do not use any name in any field/i);
    expect(prompt).not.toMatch(/^Student: /m);
  });
});

describe("and inherits none of the retrospective prompt's record-changing instructions", () => {
  const prompt = prospective();

  it.each([
    "suggestedSnapshotUpdate",
    "masteredSkills",
    "recommendedStartLevel",
    "CERTIFICATE",
    "certificate",
    "COVER PAGE",
    "set up workbook tracking",
    "skillsTargeted",
    "alignsWithSnapshot",
    "contentNote",
  ])("does not mention %s", (fragment) => {
    expect(prompt).not.toContain(fragment);
  });

  it("asks for no update to a level, a snapshot or a position", () => {
    // "mastered" DOES appear — in the sentence forbidding the claim — so the
    // assertion is about the things it could ask the model to PRODUCE.
    expect(prompt).not.toMatch(/snapshot update|working level|advance past|update the (level|position)/i);
    expect(prompt).not.toMatch(/"(level|skillsCovered|wordsRead|isCover|totalUnits)"/);
  });
});

describe("the legacy retrospective prompt is unchanged", () => {
  it("still instructs on certificates, covers and skill alignment", () => {
    const legacy = buildScanSystemPrompt("Lincoln", "3", SLICES);
    expect(legacy).toContain("CERTIFICATE / PROGRESS DOCUMENT DETECTION");
    expect(legacy).toContain("COVER PAGE / TABLE OF CONTENTS DETECTION");
    expect(legacy).toContain('"suggestedSnapshotUpdate"');
    expect(legacy).toContain('"skillsTargeted"');
    expect(legacy).toContain("Compare against the student's skill snapshot");
    expect(legacy).toContain("Student: Lincoln, grade 3");
  });

  it("does not take a purpose at all — the two prompts are separate functions", () => {
    // There is no branch inside either builder, and no handler chooses between
    // them: `handleScan` builds one, `handlePageCheck` builds the other, and the
    // dispatcher decides which handler runs (see `tasks/pageCheck.test.ts`).
    expect(buildScanSystemPrompt("Lincoln", "3", SLICES)).not.toContain("NOT done yet");
    expect(buildScanSystemPrompt("Lincoln", "3", SLICES)).not.toContain("before-work-page-check");
    expect(buildScanSystemPrompt("Lincoln", "3", SLICES)).not.toContain("pageCheck");
  });
});
