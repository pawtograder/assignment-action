import { AutograderFeedback } from '../api/adminServiceSchemas.js'

export const DEFAULT_TIMEOUTS = {
  build: 600,
  student_tests: 300,
  instructor_tests: 300,
  mutants: 1800
}
// Build configuration types
export interface BuildConfig {
  preset: 'java-gradle' | 'none'
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
    policy: 'fail' | 'warn' | 'ignore'
  }
  student_tests?: {
    student_impl?: {
      run_tests?: boolean
      report_branch_coverage?: boolean
    }
    instructor_impl?: {
      run_tests?: boolean
      run_mutation?: boolean
      report_mutation_coverage?: boolean
    }
  }
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
  breakPoints: BreakPoint[]
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
  mutantAdvice?: {
    sourceClass: string
    targetClass: string
    name: string
    prompt: string
  }[]
}

export interface PyretPawtograderConfig {
  grader: 'pyret'
}

export type PawtograderConfig =
  | OverlayPawtograderConfig
  | PyretPawtograderConfig

// Type guard to check if a unit is a mutation test unit
export function isMutationTestUnit(unit: GradedUnit): unit is MutationTestUnit {
  return 'locations' in unit && 'breakPoints' in unit
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
