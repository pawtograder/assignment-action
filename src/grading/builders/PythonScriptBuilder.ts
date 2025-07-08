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
import * as cache from '@actions/cache'
import { ScriptInfo } from '../types.js'

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
export default class PythonScriptBuilder extends Builder {
  constructor(
    protected logger: Logger,
    protected gradingDir: string,
    protected script_info: ScriptInfo,
    protected regressionTestJob?: number
  ) {
    super(logger, gradingDir, regressionTestJob)
  }

  async activateVenvAndExecuteCommand(
    command: string,
    timeoutSeconds?: number,
    ignoreFailures = false
  ): Promise<{ returnCode: number; output: string }> {
    return await this.executeCommandAndGetOutput(
      `${this.script_info.activate_venv} && ${command}`,
      [],
      this.logger,
      timeoutSeconds,
      ignoreFailures
    )
  }

  async setupVenv(dir: string, key: string): Promise<void> {
    const isGitHubAction = process.env.GITHUB_ACTIONS === 'true'
    let found_cache = false
    const venv_dir = `pawtograder-grading/${dir}`
    console.log(venv_dir)
    if (isGitHubAction) {
      console.log('Looking for existing cached virtual environment')
      const paths = [venv_dir]
      const cacheKey = await cache.restoreCache(paths, key)
      found_cache = cacheKey !== undefined
    }
    if (found_cache) {
      console.log(
        'Found and restored existing cached venv. Activating this venv.'
      )
      const { returnCode, output } = await this.executeCommandAndGetOutput(
        `${this.script_info.activate_venv}`,
        [],
        this.logger
      )
      if (returnCode !== 0) {
        throw new Error(
          `Unable to activate cached venv. Here is the output that was produced on the grading server 
        when trying to setup venv: ${output}`
        )
      }
    } else {
      console.log(
        'No suitable venv cache found (or not running as a github action), setting up new virtual environment'
      )

      const { returnCode, output } = await this.executeCommandAndGetOutput(
        `${this.script_info.setup_venv} && ${this.script_info.activate_venv} && ${this.script_info.install_deps}`,
        [],
        this.logger
      )
      if (returnCode !== 0) {
        throw new Error(
          `Unable to invoke venv setup script. Here is the output that was produced on the grading server 
        when trying to setup venv: ${output}`
        )
      }
      if (isGitHubAction) {
        console.log('Caching installed dependencies')
        const paths = [venv_dir]
        const cacheId = await cache.saveCache(paths, key)
        console.log('Cache ID:', cacheId)
      }
    }
  }
  async lint(): Promise<LintResult> {
    this.logger.log('hidden', 'Generating linting reports with provided script')
    const { returnCode, output } = await this.activateVenvAndExecuteCommand(
      this.script_info.linting_report
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
    this.logger.log(
      'hidden',
      'Generating html + textual coverage report with provided script'
    )

    const { returnCode: htmlReturnCode, output: htmlOutput } =
      await this.activateVenvAndExecuteCommand(
        this.script_info.html_coverage_reports
      )

    if (htmlReturnCode !== 0) {
      throw new Error(
        `Unable to generate HTML coverage report. Here is the output that was produced on the grading server 
        when trying to generate HTML coverage reports: ${htmlOutput}`
      )
    }

    const { returnCode: textualReturnCode, output: textualOutput } =
      await this.activateVenvAndExecuteCommand(
        this.script_info.textual_coverage_reports
      )

    if (textualReturnCode !== 0) {
      throw new Error(
        `Unable to generate textual coverage report. Here is the output that was produced on the grading server 
        when trying to generate textual coverage reports: ${textualOutput}`
      )
    }

    return textualOutput
  }
  getCoverageReportDir(): string {
    return 'coverage_reports/'
  }
  async test({ timeoutSeconds }: BuildStepOptions): Promise<TestResult[]> {
    this.logger.log('hidden', 'Running tests with provided script')

    const { returnCode, output } = await this.activateVenvAndExecuteCommand(
      this.script_info.test_runner,
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

    const { returnCode, output } = await this.activateVenvAndExecuteCommand(
      this.script_info.mutation_test_runner,
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
      ['-rf', 'test_results', 'mutation_test_results'],
      this.logger,
      timeoutSeconds,
      true
    )
  }
}
