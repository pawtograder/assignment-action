import {
  Builder,
  BuildStepOptions,
  LintResult,
  MutantResult,
  TestResult
} from './Builder.js'
import { parseLintingReports } from './checkstyle.js'
import { getCoverageSummary, parseJacocoCsv } from './jacoco.js'
import { parsePitestXml } from './pitest.js'
import { processXMLResults } from './surefire.js'

export default class GradleBuilder extends Builder {
  async setupVenv(dir: string, key: string): Promise<void> {
    console.log('Venv not implemented in gradle builder')
    console.log('dir: ', dir)
    console.log('key: ', key)
  }
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
      this.logger,
      360,
      true
    )
    if (returnCode !== 0 && returnCode !== 130) {
      throw new Error(
        `Unable to invoke Gradle checkstyle task. Here is the output that Gradle produced on the grading server: ${output}`
      )
    }
    return parseLintingReports(
      `${this.gradingDir}/build/reports/checkstyle/*.xml`,
      this.logger
    )
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
    return await processXMLResults(
      `${this.gradingDir}/build/test-results/test/TEST-*.xml`,
      this.logger
    )
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
