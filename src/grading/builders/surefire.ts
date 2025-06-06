/* eslint-disable */
import { XMLParser } from 'fast-xml-parser'
import { readFileSync } from 'fs'

// Types for Surefire report structure
export interface TestFailure {
  message: string
  type: string
  description: string
  stackTrace?: string
}

export interface TestCase {
  name: string
  className: string
  time: number
  failure?: TestFailure
  skipped?: boolean
  error?: TestFailure
}

export interface TestSuite {
  name: string
  time: number
  tests: number
  errors: number
  skipped: number
  failures: number
  testCases: TestCase[]
}

export interface SurefireReport {
  testSuites: TestSuite[]
  summary: {
    totalTests: number
    totalErrors: number
    totalFailures: number
    totalSkipped: number
    totalTime: number
  }
}

function trimJunitStackTrace(stackTrace: string): string {
  if (!stackTrace) {
    return ''
  }
  const lines = stackTrace.split('\n')
  const idxOfJunitLine = lines.findIndex(
    (line) =>
      line.includes(
        'org.junit.jupiter.engine.execution.MethodInvocation.proceed'
      ) || line.includes('org.junit.runners.BlockJUnit4ClassRunner')
  )
  if (idxOfJunitLine === -1) {
    return stackTrace
  }

  let idxOfLastReflectionLineFromBottom = -1
  for (let i = idxOfJunitLine - 1; i >= 0; i--) {
    if (
      !lines[i].includes('jdk.internal.reflect') &&
      !lines[i].includes('java.lang.reflect') &&
      !lines[i].includes('org.junit.platform.commons.util.ReflectionUtils')
    ) {
      idxOfLastReflectionLineFromBottom = i + 1
      break
    }
  }
  if (idxOfLastReflectionLineFromBottom === -1) {
    return lines.slice(0, idxOfJunitLine).join('\n')
  }
  return lines.slice(0, idxOfLastReflectionLineFromBottom).join('\n')
}

export function parseSurefireXml(filePath: string): SurefireReport {
  const xmlContent = readFileSync(filePath, 'utf-8')
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    textNodeName: '_text'
  })

  const parsed = parser.parse(xmlContent)

  // Initialize the report structure
  const report: SurefireReport = {
    testSuites: [],
    summary: {
      totalTests: 0,
      totalErrors: 0,
      totalFailures: 0,
      totalSkipped: 0,
      totalTime: 0
    }
  }

  // Handle both single suite and multiple suite reports
  const suites = parsed.testsuite
    ? [parsed.testsuite]
    : parsed.testsuites?.testsuite || []

  // Process each test suite
  report.testSuites = suites.map((suite: any) => {
    const testCases: TestCase[] = []

    // Convert test cases to array if needed
    const cases = suite.testcase
      ? Array.isArray(suite.testcase)
        ? suite.testcase
        : [suite.testcase]
      : []

    // Process each test case
    cases.forEach((testCase: any) => {
      const tc: TestCase = {
        name: testCase.name,
        className: testCase.classname,
        time: parseFloat(testCase.time || '0'),
        skipped: !!testCase.skipped
      }

      // Handle failures
      if (testCase.failure) {
        tc.failure = {
          message: testCase.failure.message || '',
          type: testCase.failure.type || '',
          description: testCase.failure._text || '',
          stackTrace: trimJunitStackTrace(testCase.failure._text || '')
        }
      }

      // Handle errors
      if (testCase.error) {
        tc.error = {
          message: testCase.error.message || '',
          type: testCase.error.type || '',
          description: testCase.error._text || '',
          stackTrace: trimJunitStackTrace(testCase.error._text || '')
        }
      }

      testCases.push(tc)
    })

    const testSuite: TestSuite = {
      name: suite.name,
      time: parseFloat(suite.time || '0'),
      tests: parseInt(suite.tests || '0', 10),
      errors: parseInt(suite.errors || '0', 10),
      skipped: parseInt(suite.skipped || '0', 10),
      failures: parseInt(suite.failures || '0', 10),
      testCases
    }

    // Update summary
    report.summary.totalTests += testSuite.tests
    report.summary.totalErrors += testSuite.errors
    report.summary.totalFailures += testSuite.failures
    report.summary.totalSkipped += testSuite.skipped
    report.summary.totalTime += testSuite.time

    return testSuite
  })

  return report
}
