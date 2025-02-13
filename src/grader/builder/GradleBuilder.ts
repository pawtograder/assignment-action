import { glob } from 'glob'
import { Builder, LintResult, MutantResult, TestResult } from './Builder.js'
import {
  CheckstyleFile,
  CheckstyleReport,
  parseCheckstyleXml
} from './checkstyle.js'
import { parsePitestXml } from './pitest.js'
import { parseSurefireXml } from './surefire.js'

export default class GradleBuilder extends Builder {
  async lint(): Promise<LintResult> {
    this.logger.log('hidden', 'Linting with Gradle')
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
  async test(): Promise<TestResult[]> {
    this.logger.log('hidden', 'Testing with Gradle')
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
          const trimStackTrace = (stackTrace: string | undefined) => {
            if (!stackTrace) {
              return ''
            }
            const lines = stackTrace.split('\n')
            const idxOfFirstMethodAccessorImpl = lines.findIndex((line) =>
              line.includes('MethodAccessorImpl')
            )
            return lines.slice(0, idxOfFirstMethodAccessorImpl).join('\n')
          }
          const tr: TestResult = {
            name: `${suite.name}.${test.name}`,
            status: test.failure || test.error ? 'fail' : 'pass',
            output: test.failure ? trimStackTrace(test.failure.stackTrace) : '',
            output_format: 'text'
          }
          return tr
        })
      })
    })
    return ret
  }
  async mutationTest(): Promise<MutantResult[]> {
    this.logger.log('hidden', 'Running Pitest')
    await this.executeCommandAndGetOutput('./gradlew', ['pitest'], this.logger)
    this.logger.log('hidden', 'Reading mutation test results')
    const mutationTestResults = `${this.gradingDir}/build/reports/pitest/mutations.xml`
    const mutationTestResultsContents =
      await parsePitestXml(mutationTestResults)
    return mutationTestResultsContents.mutations.map((eachMutation) => {
      return {
        name: eachMutation.mutator,
        location: eachMutation.mutatedClass + ':' + eachMutation.lineNumber,
        status: eachMutation.status === 'KILLED' ? 'pass' : 'fail',
        output: eachMutation.killingTest
          ? 'Found by ' + eachMutation.killingTest
          : '',
        output_format: 'text'
      }
    })
  }
  async buildClean(): Promise<void> {
    this.logger.log('hidden', 'Building clean with Gradle')
    const { returnCode, output } = await this.executeCommandAndGetOutput(
      './gradlew',
      ['clean', 'build'],
      this.logger,
      true
    )
    if (returnCode !== 0) {
      throw new Error(`Gradle build failed: ${output}`)
    }
  }
}
