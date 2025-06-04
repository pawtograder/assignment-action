import { glob } from 'glob'
import {
  Builder,
  BuildStepOptions,
  LintResult,
  MutantResult,
  TestResult
} from './Builder.js'
import {
  CheckstyleFile,
  CheckstyleReport,
  parseCheckstyleXml
} from './checkstyle.js'
import { getCoverageSummary, parseJacocoCsv } from './jacoco.js'
import { parsePitestXml } from './pitest.js'
import { parseSurefireXml } from './surefire.js'

export default class GradleBuilder extends Builder {
  async lint(): Promise<LintResult> {
    this.logger.log('hidden', 'Linting with Gradle')
    const { returnCode, output } = await this.executeCommandAndGetOutput(
      './gradlew',
      [
        '--console=plain',
        'clean',
        'checkstyleMain',
        'checkstyleTest',
        '-x',
        'compileJava',
        '-x',
        'compileTestJava'
      ],
      this.logger
    )
    if (returnCode !== 0) {
      throw new Error(
        `Unable to invoke Gradle checkstyle task. Here is the output that Gradle produced on the grading server: ${output}`
      )
    }
    const checkstyleFilesContents = await Promise.all(
      (await glob(`${this.gradingDir}/build/reports/checkstyle/*.xml`)).map(
        async (file: string) => {
          this.logger.log('hidden', `Linting ${file}`)
          const ret = await parseCheckstyleXml(file)
          return ret
        }
      )
    )
    const totalErrors = checkstyleFilesContents.reduce(
      (acc: number, curr: CheckstyleReport) => acc + curr.totalErrors,
      0
    )
    const formattedOutput = checkstyleFilesContents
      .filter((file: CheckstyleReport) => file.totalErrors > 0)
      .map((file: CheckstyleReport) => {
        return file.files
          .map((f: CheckstyleFile) => {
            return ` * ${f.name}: ${f.errors.length} errors:
                    ${f.errors.map((e) => `\t${e.line}: ` + '`' + e.message + '`').join('\n')}`
          })
          .join('\n')
      })
      .join('\n')
    this.logger.log(
      'hidden',
      `Total errors: ${totalErrors}\n${formattedOutput}`
    )

    return {
      status: totalErrors > 0 ? 'fail' : 'pass',
      output: `Total errors: ${totalErrors}\n${formattedOutput}`,
      output_format: 'markdown'
    }
  }
  async getCoverageReport(): Promise<string> {
    this.logger.log('hidden', 'Getting coverage report with Gradle')
    const coverageReport = `${this.gradingDir}/build/reports/jacoco/test/jacocoTestReport.csv`
    try {
      const coverageReportContents = await parseJacocoCsv(coverageReport)
      return getCoverageSummary(coverageReportContents)
    } catch (e) {
      this.logger.log('visible', (e as Error).message)
      return 'Coverage report not found'
    }
  }
  getCoverageReportDir(): string {
    return 'build/reports/jacoco/test/html'
  }
  async test({ timeoutSeconds }: BuildStepOptions): Promise<TestResult[]> {
    this.logger.log('hidden', 'Testing with Gradle')
    const { returnCode } = await this.executeCommandAndGetOutput(
      './gradlew',
      ['--console=plain', 'test'],
      this.logger,
      timeoutSeconds,
      true
    )
    if (returnCode !== 0) {
      this.logger.log(
        'hidden',
        `Gradle test failed, return code: ${returnCode}`
      )
    }
    const testResultsContents = await Promise.all(
      (await glob(`${this.gradingDir}/build/test-results/test/TEST-*.xml`)).map(
        async (file) => {
          this.logger.log('hidden', `Reading test results from ${file}`)
          const ret = await parseSurefireXml(file)
          return ret
        }
      )
    )
    const ret = testResultsContents.flatMap((result) => {
      return result.testSuites.flatMap((suite) => {
        return suite.testCases.map((test) => {
          const tr: TestResult = {
            name: `${suite.name}.${test.name}`,
            status: test.failure || test.error ? 'fail' : 'pass',
            output: test.failure?.stackTrace || test.error?.stackTrace || '',
            output_format: 'text'
          }
          return tr
        })
      })
    })
    return ret
  }
  async mutationTest({
    timeoutSeconds
  }: BuildStepOptions): Promise<MutantResult[]> {
    this.logger.log('hidden', 'Running Pitest')
    await this.executeCommandAndGetOutput(
      './gradlew',
      ['--console=plain', 'pitest'],
      this.logger,
      timeoutSeconds,
      false
    )
    this.logger.log('hidden', 'Reading mutation test results')
    const mutationTestResults = `${this.gradingDir}/build/reports/pitest/mutations.xml`
    const mutationTestResultsContents =
      await parsePitestXml(mutationTestResults)
    return mutationTestResultsContents.mutations.map((eachMutation) => {
      return {
        name: eachMutation.mutator,
        location: eachMutation.mutatedClass + ':' + eachMutation.lineNumber,
        status: eachMutation.status === 'KILLED' ? 'pass' : 'fail',
        tests: eachMutation.killingTests
          ? eachMutation.killingTests.split('|')
          : [],
        output: eachMutation.killingTest
          ? 'Found by ' + eachMutation.killingTest
          : '',
        output_format: 'text'
      }
    })
  }
  async buildClean({ timeoutSeconds }: BuildStepOptions): Promise<void> {
    this.logger.log('hidden', 'Building clean with Gradle')
    const { returnCode, output } = await this.executeCommandAndGetOutput(
      './gradlew',
      ['--console=plain', 'clean', '-x', 'test', 'build'],
      this.logger,
      timeoutSeconds,
      true
    )
    if (returnCode !== 0) {
      throw new Error(
        `Gradle build failed. Please check that running the command 'gradle clean build' completes without compilation errors before resubmitting. Here is the output that gradle produced on the grading server: ${output}`
      )
    }
  }
}
