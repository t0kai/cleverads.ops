import type { Dv360Row } from '@/engine/csv/dv360';

/** One row of the advertiser's target sheet. Dates are Sheets serial numbers. */
export interface TargetRow {
  readonly start: number | null;
  readonly end: number | null;
  readonly clicks: number | null;
}

/** Everything a module needs for one run. Built by features/, never by the module itself. */
export interface ModuleInput {
  readonly rows: readonly Dv360Row[];
  /** Keyed by normalizeKey(campaign name). */
  readonly targets: ReadonlyMap<string, TargetRow>;
  /**
   * First day each 2nd/3rd IO was seen (serial), keyed by normalizeKey(full name).
   * "seed" = it already existed on the very first run, so it uses the main IO's start date.
   */
  readonly firstSeen: ReadonlyMap<string, number | 'seed'>;
  /** TODAY() in the report's time zone, as a whole-day serial. */
  readonly today: number;
}

export interface SheetCell {
  /** A formula starting with "=", a number, or text. null = leave blank. */
  readonly value: string | number | null;
}

export interface SheetSpec {
  readonly title: string;
  readonly headers: readonly string[];
  readonly rows: readonly (readonly SheetCell[])[];
  readonly hiddenColumns: readonly number[];
}

/** The contract every advertiser module follows. */
export interface AdvertiserModule<Config, Result> {
  readonly id: string;
  readonly version: string;
  parseConfig(raw: unknown): Config;
  calculate(input: ModuleInput, config: Config): Result;
  buildSheetSpec(result: Result, config: Config): SheetSpec;
}
