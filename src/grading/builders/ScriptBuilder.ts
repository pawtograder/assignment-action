import {
  Builder,
  BuildStepOptions,
  LintResult,
  MutantResult,
  TestResult
} from './Builder.js'
import { processXMLResults } from './surefire.js'
import { parseLintingReports } from './checkstyle.js'
import Logger from '../Logger.js'
import { glob } from 'glob'
import * as fs from 'fs'

async function parseMutationResultsFromJson(
  path_glob: string,
  logger: Logger
): Promise<MutantResult[]> {
  const mutantResults: MutantResult[] = await Promise.all(
    (await glob(path_glob)).map(async (file) => {
      const data = fs.readFileSync(file, 'utf-8')
      logger.log('hidden', `Reading mutation test results from ${file}`)
      const ret = (await JSON.parse(data)) as MutantResult
      return ret
    })
  )
  return mutantResults
}
export default class ScriptBuilder extends Builder {
  async installDependencies(): Promise<void> {
    const { returnCode, output } = await this.executeCommandAndGetOutput(
      './install_dependencies.sh',
      [],
      this.logger
    )
    if (returnCode !== 0) {
      throw new Error(
        `Unable to invoke dependency installation script. Here is the output that was produced on the grading server 
        when trying to install dependencies: ${output}`
      )
    }
  }
  async lint(): Promise<LintResult> {
    this.logger.log('hidden', 'Generating linting reports with provided script')
    const { returnCode, output } = await this.executeCommandAndGetOutput(
      './generate_linting_reports.sh',
      [],
      this.logger
    )
    if (returnCode !== 0) {
      throw new Error(
        `Unable to invoke linting script. Here is the output that was produced on the grading server 
        when trying to generate linting reports: ${output}`
      )
    }
    return parseLintingReports(
      `${this.gradingDir}/linting_reports/*.xml`,
      this.logger
    )
  }
  async getCoverageReport(): Promise<string> {
    this.logger.log('hidden', 'Generating coverage report with provided script')

    // Script to generate html coverage report
    await this.executeCommandAndGetOutput(
      './generate_coverage_reports.sh',
      [],
      this.logger
    )

    // Textual coverage report
    const { returnCode, output } = await this.executeCommandAndGetOutput(
      './generate_textual_coverage_reports.sh',
      [],
      this.logger
    )

    if (returnCode !== 0) {
      throw new Error(
        `Unable to generate coverage report. Here is the output that was produced on the grading server 
        when trying to generate coverage reports: ${output}`
      )
    }

    return output
  }
  getCoverageReportDir(): string {
    return 'coverage_reports/'
  }
  async test({ timeoutSeconds }: BuildStepOptions): Promise<TestResult[]> {
    this.logger.log('hidden', 'Running tests with provided script')

    const { returnCode, output } = await this.executeCommandAndGetOutput(
      './test_runner.sh',
      [],
      this.logger,
      timeoutSeconds,
      true
    )
    if (returnCode !== 0) {
      throw new Error(
        `Unable to invoke test runner script. Here is the output that was produced on the grading server 
        when trying to run tests: ${output}`
      )
    }
    //Note: This method assumes that test_runner.sh generates xml files containing checkstyle compatible test results
    return await processXMLResults(
      `${this.gradingDir}/test_results/*.xml`,
      this.logger
    )
  }
  async mutationTest({
    timeoutSeconds
  }: BuildStepOptions): Promise<MutantResult[]> {
    this.logger.log('hidden', 'Running mutation tests with provided script')

    const { returnCode, output } = await this.executeCommandAndGetOutput(
      './mutation_test_runner.sh',
      [],
      this.logger,
      timeoutSeconds,
      true
    )
    if (returnCode !== 0) {
      throw new Error(
        `Unable to invoke mutation testing script. Here is the output that was produced on the grading server 
        when trying to run mutation tests: ${output}`
      )
    }
    //Note: This method assumes that mutation_test_runner.sh generates JSON files containing MutantResults
    // in the mutation_test_results directory.
    return await parseMutationResultsFromJson(
      `${this.gradingDir}/mutation_test_results/*.json`,
      this.logger
    )
  }
  async buildClean({ timeoutSeconds }: BuildStepOptions): Promise<void> {
    await this.executeCommandAndGetOutput(
      'rm',
      ['-rf', 'test_results', 'coverage_reports', 'mutation_test_results'],
      this.logger,
      timeoutSeconds,
      true
    )
  }
}
