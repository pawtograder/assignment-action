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
  locations: string[] // format: "file:line-line" (for normal pit mutators) OR format oldFile-newFile (for prebake mutators)

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
}

// Combined graded unit type
export type GradedUnit = MutationTestUnit | RegularTestUnit

// Graded part type
export interface GradedPart {
  name: string
  gradedUnits: GradedUnit[]
  hide_until_released?: boolean
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
