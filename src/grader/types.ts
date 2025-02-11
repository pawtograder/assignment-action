// Build configuration types
interface BuildConfig {
  preset: 'java-gradle'
  cmd: string
  artifacts: string[]
  linter: {
    preset: 'checkstyle'
    policy: 'fail' | 'warn' | 'ignore'
  }
}

// Mutation testing types
interface BreakPoint {
  minimumMutantsDetected: number
  pointsToAward: number
}

interface MutationTestUnit {
  name: string
  locations: string[] // format: "file:line-line"
  breakPoints: BreakPoint[]
}

// Regular test unit types
interface RegularTestUnit {
  name: string
  tests: string | string[] // format: "[T#.#]"
  points: number
  testCount: number
}

// Combined graded unit type
type GradedUnit = MutationTestUnit | RegularTestUnit

// Graded part type
interface GradedPart {
  name: string
  gradedUnits: GradedUnit[]
}

// Main configuration type
interface PawtograderConfig {
  build: BuildConfig
  gradedParts: GradedPart[]
  submissionFiles: {
    files: string[]
    testFiles: string[]
  }
}

// Type guard to check if a unit is a mutation test unit
function isMutationTestUnit(unit: GradedUnit): unit is MutationTestUnit {
  return 'locations' in unit && 'breakPoints' in unit
}

// Type guard to check if a unit is a regular test unit
function isRegularTestUnit(unit: GradedUnit): unit is RegularTestUnit {
  return 'tests' in unit && 'testCount' in unit
}
export type OutputFormat = 'text' // TODO also support: | 'ansi' | 'html' | 'markdown';
export type OutputVisibility =
  | 'hidden' // Never shown to students
  | 'visible' // Always shown to students
  | 'after_due_date' // Shown to students after the due date
  | 'after_published' // Shown to students after grades are published

export type AutograderTestFeedback = AutograderFeedback['tests'][0]
export type AutograderFeedback = {
  score?: number
  output: {
    [key in OutputVisibility]?: {
      output: string
      output_format?: OutputFormat
    }
  }
  lint: {
    status: 'pass' | 'fail'
    output: string
    output_format?: OutputFormat
  }
  tests: {
    score?: number
    max_score?: number
    status?: 'pass' | 'fail'
    name: string
    name_format?: OutputFormat
    output: string
    output_format?: OutputFormat
    tags?: string[]
    extra_data?: { [key: string]: string }
  }[]
}
export {
  PawtograderConfig,
  BuildConfig,
  GradedPart,
  GradedUnit,
  MutationTestUnit,
  RegularTestUnit,
  BreakPoint,
  isMutationTestUnit,
  isRegularTestUnit
}
