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
    await this.executeCommandAndGetOutput(
      'pip',
      ['install', '-r', 'requirements.txt'],
      this.logger
    )
  }
  async lint(): Promise<LintResult> {
    await this.installDependencies()
    this.logger.log('hidden', 'Linting with Pylint')
    const { returnCode, output } = await this.executeCommandAndGetOutput(
      './generate_linting_reports.sh',
      [],
      this.logger
    )
    if (returnCode !== 0) {
      throw new Error(
        `Unable to invoke pylint linting task. Here is the output that was produced on the grading server 
        when trying to generate linting reports: ${output}`
      )
    }
    return parseLintingReports(
      `${this.gradingDir}/linting_reports/*.xml`,
      this.logger
    )
  }
  async getCoverageReport(): Promise<string> {
    await this.installDependencies()
    this.logger.log('hidden', 'Generating python coverage report')

    // Script to generate html coverage report
    await this.executeCommandAndGetOutput(
      './generate_coverage_reports.sh',
      [],
      this.logger
    )

    // Textual coverage report
    const { returnCode, output } = await this.executeCommandAndGetOutput(
      'coverage',
      ['report', '-m'],
      this.logger
    )

    if (returnCode !== 0 || !output) {
      throw new Error(
        `Unable to generate coverage report. Here is the output that was produced on the grading server 
        when trying to generate coverage reports: ${output ? output : '[no output was produced]'}`
      )
    }

    return output
  }
  getCoverageReportDir(): string {
    return 'coverage_reports/'
  }
  async test({ timeoutSeconds }: BuildStepOptions): Promise<TestResult[]> {
    await this.installDependencies()
    this.logger.log('hidden', 'Unittesting with Python')

    const { returnCode } = await this.executeCommandAndGetOutput(
      'python3',
      ['test_runner.py'],
      this.logger,
      timeoutSeconds,
      true
    )
    if (returnCode !== 0) {
      this.logger.log(
        'hidden',
        `python test execution failed, return code: ${returnCode}`
      )
    }
    return await processXMLResults(
      `${this.gradingDir}/test_results/*.xml`,
      this.logger
    )
  }
  async mutationTest({
    timeoutSeconds
  }: BuildStepOptions): Promise<MutantResult[]> {
    await this.installDependencies()
    this.logger.log('hidden', 'Unittesting with Python')

    const { returnCode } = await this.executeCommandAndGetOutput(
      'python3',
      ['mutation_test_runner.py'],
      this.logger,
      timeoutSeconds,
      true
    )
    if (returnCode !== 0) {
      this.logger.log(
        'hidden',
        `Mutation test execution failed, return code: ${returnCode}`
      )
    }
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

    await this.executeCommandAndGetOutput(
      'rm',
      ['-r', '.coverage'],
      this.logger,
      timeoutSeconds,
      true
    )
  }
}
