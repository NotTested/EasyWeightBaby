import type { ActualSet, CardioRecordInput } from "./actual-input";
import type { ExerciseFields } from "./exercise-input";

/** Contract only: no parser, authorization, persistence, or network access. */
export const RULE_DRAFT_VERSION = "rules-v1" as const;
export const RULE_DRAFT_LIMITS = Object.freeze({
  textCodeUnits: 10_000,
  lines: 200,
  catalogEntries: 1_000,
  exercises: 40,
  setsPerExercise: 30,
  cardioRecords: 20,
  issues: 200,
});

/** Half-open offsets into the ORIGINAL text, in JavaScript UTF-16 code units. */
export type TextSpan = Readonly<{ start: number; end: number }>;
export type FieldCandidate<T> = Readonly<{ value: T; evidence: readonly TextSpan[] }>;
export type DraftField<T> =
  | Readonly<{ state: "explicit"; value: T; evidence: readonly TextSpan[] }>
  | Readonly<{ state: "missing" }>
  | Readonly<{ state: "ambiguous"; candidates: readonly FieldCandidate<T>[]; evidence: readonly TextSpan[] }>
  | Readonly<{ state: "invalid"; evidence: readonly TextSpan[] }>;

/** Caller supplies ONLY exercises the current user is allowed to use. */
export type RuleExerciseCatalogEntry = Readonly<
  Pick<ExerciseFields, "name" | "equipment" | "execution" | "measurement" | "active"> & {
    id: string;
    version: number;
    aliases: readonly string[];
  }
>;
export type RuleDraftRequest = Readonly<{
  text: string;
  catalog: readonly RuleExerciseCatalogEntry[];
}>;
export type ExerciseCandidate = Readonly<{ id: string; version: number; name: string }>;
export type ExerciseResolution =
  | Readonly<{ state: "matched"; candidate: ExerciseCandidate; evidence: readonly TextSpan[] }>
  | Readonly<{ state: "ambiguous"; candidates: readonly ExerciseCandidate[]; evidence: readonly TextSpan[] }>
  | Readonly<{ state: "unmatched"; evidence: readonly TextSpan[] }>;

/** Missing numbers have no value; an explicit 0 remains an explicit 0. */
export type RuleSetDraft = Readonly<{
  source: TextSpan;
  weightKg: DraftField<NonNullable<ActualSet["weightKg"]>>;
  dumbbellCount: DraftField<NonNullable<ActualSet["dumbbellCount"]>>;
  reps: DraftField<NonNullable<ActualSet["reps"]>>;
  side: DraftField<ActualSet["side"]>;
  kind: DraftField<ActualSet["kind"]>;
  reportedCompleted: DraftField<boolean>;
  actualRir: DraftField<NonNullable<ActualSet["actualRir"]>>;
}>;
export type RuleRirHint = Readonly<{
  value: DraftField<NonNullable<ActualSet["actualRir"]>>;
  target:
    | Readonly<{ state: "explicit_set"; setIndex: number }>
    | Readonly<{ state: "last_performed_working" }>
    | Readonly<{ state: "unresolved" }>;
}>;
export type RuleExerciseDraft = Readonly<{
  source: TextSpan;
  exercise: ExerciseResolution;
  sets: readonly RuleSetDraft[];
  rirHints: readonly RuleRirHint[];
}>;
export type RuleCardioDraft = Readonly<{
  source: TextSpan;
  activity: DraftField<CardioRecordInput["activity"]>;
  durationMinutes: DraftField<NonNullable<CardioRecordInput["durationMinutes"]>>;
  distanceKm: DraftField<NonNullable<CardioRecordInput["distanceKm"]>>;
  intensity: DraftField<CardioRecordInput["intensity"]>;
  notes: DraftField<CardioRecordInput["notes"]>;
  reportedCompleted: DraftField<boolean>;
}>;
export type RuleIssueCode =
  | "input_empty" | "input_limit" | "catalog_invalid" | "output_limit"
  | "invalid_date" | "exercise_unmatched" | "exercise_ambiguous"
  | "unsupported_syntax" | "missing_value" | "ambiguous_value"
  | "out_of_range" | "unassigned_rir" | "unrecognized_text";
export type RuleDraftIssue = Readonly<{
  code: RuleIssueCode;
  severity: "warning" | "error";
  /** Stable path such as exercises[0].sets[1].reps; no localized text needed. */
  path: string;
  evidence: readonly TextSpan[];
}>;

/** This result deliberately cannot be passed directly to the actual-save API. */
export type RuleDraftResult =
  | Readonly<{
      state: "needs_review";
      parserVersion: typeof RULE_DRAFT_VERSION;
      confirmationRequired: true;
      sourceText: string;
      localDate: DraftField<string>;
      exercises: readonly RuleExerciseDraft[];
      cardio: readonly RuleCardioDraft[];
      actualNotes: DraftField<string>;
      unparsed: readonly TextSpan[];
      issues: readonly RuleDraftIssue[];
    }>
  | Readonly<{
      state: "rejected";
      parserVersion: typeof RULE_DRAFT_VERSION;
      confirmationRequired: true;
      inputCodeUnits: number;
      /** A rejected oversized request must not echo the original input/catalog. */
      issues: readonly RuleDraftIssue[];
    }>;