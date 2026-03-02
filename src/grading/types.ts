import { AutograderFeedback } from '../api/adminServiceSchemas.js'

export const DEFAULT_TIMEOUTS = {
  build: 600,
  student_tests: 300,
  instructor_tests: 300,
  mutants: 1800
}
// Build configuration types

export interface VenvInfo {
  cache_key: string
  dir_name: string
}
export interface ScriptInfo {
  setup_venv: string
  activate_venv: string
  linting_report: string
  html_coverage_reports: string
  textual_coverage_reports: string
  test_runner: string
  mutation_test_runner: string
  install_deps: string
}

export interface BuildConfig {
  preset: 'java-gradle' | 'python-script' | 'none'
  cmd?: string
  timeouts_seconds?: {
    build?: number
    student_tests?: number
    instructor_tests?: number
    mutants?: number
  }
  artifacts?: GraderArtifact[]
  linter?: {
    preset: 'checkstyle'
    policy: 'fail' | 'ignore'
  }
  student_tests?: {
    student_impl?: {
      run_tests?: boolean
      report_branch_coverage?: boolean
      run_mutation?: boolean
      report_mutation_coverage?: boolean
    }
    instructor_impl?: {
      run_tests?: boolean
      run_mutation?: boolean
      report_mutation_coverage?: boolean
    }
  }
  venv?: VenvInfo
  script_info?: ScriptInfo
}

export interface GraderArtifact {
  name: string
  path: string
  data?: object
}

// Mutation testing types
export interface BreakPoint {
  minimumMutantsDetected: number
  pointsToAward: number
}

export interface MutationTestUnit {
  name: string
  locations: string[] // format: "ClassName" (class name), "ClassName-line-line" (line range),
  // OR mutator name string (matched against mutation mutator field)

  //Either exact breakpoints are provided, or points are awarded linearly as (mutants detected/total_faults) * points
  //one of these must be provided
  breakPoints?: BreakPoint[]
  linearScoring?: { total_faults: number; points: number }
}

// Regular test unit types
export interface RegularTestUnit {
  name: string
  tests: string | string[] // format: "[T#.#]"
  points: number
  testCount: number
  allow_partial_credit?: boolean
  hide_output?: boolean
}

// Combined graded unit type - base type without dependencies
export type GradedUnitBase = MutationTestUnit | RegularTestUnit

// Unified Dependency Types
// A dependency can reference either a part or a unit

// Explicit part dependency
export interface PartDependencyRef {
  part: string
  minScore?: number // raw score threshold, defaults to max score (100%) if omitted
}

// Unit dependency
export interface UnitDependencyRef {
  unit: string
  minScore?: number // raw score threshold, defaults to max score (100%) if omitted
}

// Simple string = part name requiring full marks (backward compatible)
// Union type - part and unit are mutually exclusive in object form
export type Dependency = string | PartDependencyRef | UnitDependencyRef

// Type guards for dependencies
export function isPartDependency(dep: Dependency): dep is PartDependencyRef {
  return typeof dep === 'object' && 'part' in dep
}

export function isUnitDependency(dep: Dependency): dep is UnitDependencyRef {
  return typeof dep === 'object' && 'unit' in dep
}

export function isSimpleDependency(dep: Dependency): dep is string {
  return typeof dep === 'string'
}

// GradedUnit with optional dependencies
export type GradedUnit = GradedUnitBase & {
  dependencies?: Dependency[]
}

// Graded part type
export interface GradedPart {
  name: string
  gradedUnits: GradedUnit[]
  hide_until_released?: boolean
  dependencies?: Dependency[]
}

// Mutant advice configuration
export interface MutantAdvice {
  name: string
  prompt: string
  sourceClass: string
  targetClass: string
}

export type LLMProvider = 'openai' | 'azure' | 'anthropic' | 'openrouter'

export interface LLMConfig {
  model: string
  provider: LLMProvider
  assignment_spec_path?: string
  temperature?: number
  max_tokens?: number
  rate_limit?: object
}

// Main configuration type
export interface OverlayPawtograderConfig {
  grader: 'overlay'
  build: BuildConfig
  gradedParts?: GradedPart[]
  submissionFiles: {
    files: string[]
    testFiles: string[]
  }
  fallbackFiles?: string
  mutantAdvice?: MutantAdvice[]
  maxMutantHints?: number // Maximum number of mutant hints to show across all units. If undefined, shows all.
  maxImplementationHints?: number // Maximum number of failing test details to show across all units. If set, only shows failing tests (not passing). If undefined, shows all test results.
  llm?: LLMConfig
}

export type PawtograderConfig = OverlayPawtograderConfig

// Type guard to check if a unit is a mutation test unit
export function isMutationTestUnit(unit: GradedUnit): unit is MutationTestUnit {
  return (
    'locations' in unit && ('breakPoints' in unit || 'linearScoring' in unit)
  )
}

// Type guard to check if a unit is a regular test unit
export function isRegularTestUnit(unit: GradedUnit): unit is RegularTestUnit {
  return 'tests' in unit && 'testCount' in unit
}
export type OutputFormat = 'text' | 'ansi' | 'markdown'
export type OutputVisibility =
  | 'hidden' // Never shown to students
  | 'visible' // Always shown to students
  | 'after_due_date' // Shown to students after the due date
  | 'after_published' // Shown to students after grades are published

export type AutograderTestFeedback = AutograderFeedback['tests'][0]
