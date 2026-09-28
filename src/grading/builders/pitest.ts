/* eslint-disable */
import { XMLParser } from 'fast-xml-parser'
import { readFileSync } from 'fs'

// Types for PIT mutation report structure
export interface MutationLocation {
  clazz: string // Full class name
  method: string // Method name
  methodDescription: string
  lineNumber: number
  mutator: string // Type of mutation
  index: number // Mutation index
  block: number // Basic block number
  killingTest?: string // Test that killed the mutation
}

export interface Mutation {
  detected: boolean
  status:
    | 'KILLED'
    | 'SURVIVED'
    | 'NO_COVERAGE'
    | 'TIMED_OUT'
    | 'MEMORY_ERROR'
    | 'RUN_ERROR'
    | 'NON_VIABLE'
  numberOfTestsRun: number
  sourceFile: string
  mutatedClass: string
  mutatedMethod: string
  methodDescription: string
  lineNumber: number
  mutator: string
  index: number
  block: number
  killingTest?: string
  killingTests?: string
  description: string
}

export interface MutationTestSummary {
  statistics: {
    totalMutations: number
    killed: number
    survived: number
    noCoverage: number
    timedOut: number
    memoryError: number
    runError: number
    mutationScore: number // percentage of mutations killed
  }
  mutations: Mutation[]
}

export function parsePitestXml(filePath: string): MutationTestSummary {
  const xmlContent = readFileSync(filePath, 'utf-8')
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    textNodeName: '_text'
  })

  const parsed = parser.parse(xmlContent)

  // Initialize the report structure
  const report: MutationTestSummary = {
    statistics: {
      totalMutations: 0,
      killed: 0,
      survived: 0,
      noCoverage: 0,
      timedOut: 0,
      memoryError: 0,
      runError: 0,
      mutationScore: 0
    },
    mutations: []
  }

  // Handle case where there are no mutations
  if (!parsed.mutations?.mutation) {
    return report
  }

  // Convert to array if single mutation
  const mutations = Array.isArray(parsed.mutations.mutation)
    ? parsed.mutations.mutation
    : [parsed.mutations.mutation]

  // Process each mutation
  report.mutations = mutations.map((mut: any): Mutation => {
    const mutation: Mutation = {
      detected: mut.status === 'KILLED',
      status: mut.status,
      numberOfTestsRun: parseInt(mut.numberOfTestsRun || '0', 10),
      sourceFile: mut.sourceFile,
      mutatedClass: mut.mutatedClass,
      mutatedMethod: mut.mutatedMethod,
      methodDescription: mut.methodDescription,
      lineNumber: parseInt(mut.lineNumber, 10),
      mutator: mut.mutator,
      index: parseInt(mut.index, 10),
      block: parseInt(mut.block, 10),
      description: mut.description
    }

    if (mut.killingTest) {
      mutation.killingTest = mut.killingTest
    }
    if (mut.killingTests) {
      mutation.killingTests = mut.killingTests
    }

    // Update statistics
    report.statistics.totalMutations++
    switch (mutation.status) {
      case 'KILLED':
        report.statistics.killed++
        break
      case 'SURVIVED':
        report.statistics.survived++
        break
      case 'NO_COVERAGE':
        report.statistics.noCoverage++
        break
      case 'TIMED_OUT':
        report.statistics.timedOut++
        break
      case 'MEMORY_ERROR':
        report.statistics.memoryError++
        break
      case 'RUN_ERROR':
        report.statistics.runError++
        break
    }

    return mutation
  })

  // Calculate mutation score
  if (report.statistics.totalMutations > 0) {
    report.statistics.mutationScore =
      (report.statistics.killed / report.statistics.totalMutations) * 100
  }

  return report
}

/**
 * PIT statuses meaning the mutant never ran against the tests, so neither
 * "killed" nor "survived" applies. PIT's console summary counts RUN_ERROR as
 * detected ("Killed 1 (100%)"), which hides these from instructors.
 */
export const UNEVALUATED_MUTANT_STATUSES: ReadonlySet<string> = new Set([
  'RUN_ERROR',
  'NON_VIABLE'
])

/**
 * Extracts the distinct reasons PIT gave for mutants that errored, with counts,
 * from the pitest task output. Each reason is the exception line that follows
 * PIT's "Error during mutation test" warning, e.g. "class redefinition failed:
 * attempted to change superclass or interfaces" for a pre-baked mutant whose
 * shape differs from the class it replaces.
 */
export function extractPitestRunErrorReasons(
  output: string
): { reason: string; count: number }[] {
  const counts = new Map<string, number>()
  const pattern =
    /Error during mutation test\s*\n(?:stderr\s*:\s*)?\s*([^\n]+)/g
  for (const match of output.matchAll(pattern)) {
    const reason = match[1].trim()
    counts.set(reason, (counts.get(reason) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
}

// Helper function to get mutations for a specific location range
export function getMutationsInRange(
  report: MutationTestSummary,
  className: string,
  startLine: number,
  endLine: number
): Mutation[] {
  return report.mutations.filter(
    (mutation) =>
      mutation.mutatedClass === className &&
      mutation.lineNumber >= startLine &&
      mutation.lineNumber <= endLine
  )
}
