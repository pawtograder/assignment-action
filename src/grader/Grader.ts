import * as io from '@actions/io'
import { readdir, readFile } from 'fs/promises'
import path from 'path'
import yaml from 'yaml'
import { Builder, MutantResult, TestResult } from './builder/Builder.js'
import GradleBuilder from './builder/GradleBuilder.js'
import Logger from './Logger.js'
import {
  AutograderTestFeedback,
  GradedPart,
  GradedUnit,
  isMutationTestUnit,
  isRegularTestUnit,
  OutputFormat,
  PawtograderConfig
} from './types.js'
import { AutograderFeedback } from '../api/adminServiceSchemas.js'
export default async function grade(
  solutionDir: string,
  submissionDir: string
): Promise<AutograderFeedback> {
  const _config = await readFile(
    path.join(solutionDir, 'pawtograder.yml'),
    'utf8'
  )
  const config = yaml.parse(_config) as PawtograderConfig
  const gradingDir = path.join(process.cwd(), 'pawtograder-grading')
  await io.mkdirP(gradingDir)
  const grader = new Grader(solutionDir, submissionDir, config, gradingDir)
  const ret = await grader.grade()

  return ret
}
class Grader {
  private builder: Builder
  private logger: Logger
  constructor(
    private solutionDir: string,
    private submissionDir: string,
    private config: PawtograderConfig,
    private gradingDir: string
  ) {
    this.logger = new Logger()
    this.builder = new GradleBuilder(this.logger, this.gradingDir)
  }
  async copyStudentFiles(whichFiles: 'files' | 'testFiles') {
    const files = this.config.submissionFiles[whichFiles]
    await Promise.all(
      files.map(async (file) => {
        const src = path.join(this.submissionDir, file)
        const dest = path.join(this.gradingDir, file)
        await io.cp(src, dest, { recursive: true })
      })
    )
  }
  async resetSolutionFiles() {
    const files = this.config.submissionFiles['files'].concat(
      this.config.submissionFiles['testFiles']
    )
    await Promise.all(
      files.map(async (file) => {
        const src = path.join(this.solutionDir, file)
        const dest = path.join(this.gradingDir, file)
        await io.cp(src, dest, { recursive: true })
      })
    )
  }

  private gradePart(
    part: GradedPart,
    testResults: TestResult[],
    mutantResults?: MutantResult[],
    mutantFailureAdvice?: string
  ): AutograderTestFeedback[] {
    return part.gradedUnits
      .map((unit) => {
        const ret = this.gradeGradedUnit(
          unit,
          testResults,
          mutantResults,
          mutantFailureAdvice
        )
        for (const feedback of ret) {
          feedback.tags = [`${part.name}`]
        }
        return ret
      })
      .flat()
  }
  private gradeGradedUnit(
    unit: GradedUnit,
    testResults: TestResult[],
    mutantResults?: MutantResult[],
    mutantFailureAdvice?: string
  ): AutograderTestFeedback[] {
    if (isMutationTestUnit(unit)) {
      if (!mutantResults) {
        return [
          {
            name: unit.name,
            output:
              mutantFailureAdvice ||
              'No results from grading tests. Please check overall output for more details.',
            output_format: 'text',
            score: 0,
            max_score: unit.breakPoints[0].pointsToAward
          }
        ]
      } else {
        const relevantMutantResults = mutantResults.filter((mr) => {
          const locations = unit.locations
          const mutantLocation = mr.location
          const mutantLocationParts = mutantLocation.split(':')
          const mutantLine = parseInt(mutantLocationParts[1])
          const mutantEndLine = parseInt(mutantLocationParts[2])
          return locations.some((location) => {
            const locationParts = location.split('-')
            const locationLine = parseInt(locationParts[1])
            const locationEndLine = parseInt(locationParts[2])
            return (
              mutantLine >= locationLine && mutantEndLine <= locationEndLine
            )
          })
        })
        const mutantsDetected = relevantMutantResults.filter(
          (mr) => mr.status === 'pass'
        ).length
        const maxMutantsToDetect = unit.breakPoints[0].minimumMutantsDetected
        const breakPoint = unit.breakPoints.find(
          (bp) => bp.minimumMutantsDetected <= mutantsDetected
        )
        return [
          {
            name: unit.name,
            output: `Faults detected: ${mutantsDetected} / ${maxMutantsToDetect}`,
            output_format: 'text',
            score: breakPoint ? breakPoint.pointsToAward : 0,
            max_score: unit.breakPoints[0].pointsToAward
          }
        ]
      }
    } else if (isRegularTestUnit(unit)) {
      const relevantTestResults = testResults.filter((result) => {
        const testName = result.name
        if (typeof unit.tests === 'string') {
          return testName.startsWith(unit.tests)
        } else {
          return unit.tests.some((test) => testName.startsWith(test))
        }
      })
      const expectedTests = unit.testCount
      const passingTests = relevantTestResults.filter(
        (result) => result.status === 'pass'
      ).length
      return [
        {
          name: unit.name,
          output: `Tests passed: ${passingTests} / ${expectedTests}\n${relevantTestResults.map((result) => `${result.name}: ${result.status}${result.output ? `\n${result.output}` : ''}`).join('\n')}`,
          output_format: 'text',
          score: passingTests == expectedTests ? unit.points : 0,
          max_score: unit.points
        }
      ]
    }
    throw new Error(
      `Unknown unit type in grading config: ${JSON.stringify(unit)}`
    )
  }
  async grade(): Promise<AutograderFeedback> {
    // const tmpDir = await mkdtemp(path.join(tmpdir(), 'pawtograder-'));
    const tmpDir = path.join(process.cwd(), 'pawtograder-grading')
    await io.mkdirP(tmpDir)
    const solutionFiles = await readdir(this.solutionDir)
    await Promise.all(
      solutionFiles.map(async (file) => {
        const src = path.join(this.solutionDir, file)
        const dest = path.join(tmpDir, file)
        await io.cp(src, dest, { recursive: true })
      })
    )

    await this.copyStudentFiles('files')

    try {
      await this.builder.buildClean()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      const allTests: AutograderTestFeedback[] = this.config.gradedParts
        .map((part) =>
          part.gradedUnits.map((gradedUnit) => {
            if (isRegularTestUnit(gradedUnit)) {
              return {
                name: gradedUnit.name,
                output:
                  'Build failed, test not run. Please see overall output for more details.',
                output_format: 'text' as OutputFormat,
                score: 0,
                max_score: gradedUnit.points
              }
            } else if (isMutationTestUnit(gradedUnit)) {
              return {
                name: gradedUnit.name,
                output:
                  'Build failed, test not run. Please see overall output for more details.',
                output_format: 'text' as OutputFormat,
                score: 0,
                max_score: gradedUnit.breakPoints[0].pointsToAward
              }
            } else {
              throw new Error(
                `Unknown unit type in grading config: ${JSON.stringify(gradedUnit)}`
              )
            }
          })
        )
        .flat()
      return {
        lint: {
          status: 'fail',
          output: 'Gradle build failed'
        },
        output: {
          visible: {
            output: msg,
            output_format: 'text'
          }
        },
        tests: allTests,
        score: 0
      }
    }

    const lintResult = await this.builder.lint()
    // console.log(lintResult);
    const testResults = await this.builder.test()
    let mutantResults: MutantResult[] | undefined
    let mutantFailureAdvice: string | undefined
    if (this.config.submissionFiles.testFiles.length > 0) {
      await this.resetSolutionFiles()
      await this.copyStudentFiles('testFiles')
      try {
        await this.builder.buildClean()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        mutantFailureAdvice =
          'Your tests failed to compile. Please see overall output for more details.'
        this.logger.log(
          'visible',
          'Your tests failed to compile. Here is the output from building your tests with our solution:'
        )
        this.logger.log('visible', msg)
      }
      const studentTestResults = await this.builder.test()
      if (studentTestResults.some((result) => result.status === 'fail')) {
        console.log('some tests failed')
        this.logger.log(
          'visible',
          "Some of your tests failed when run against the instructor's solution. Your tests will not be graded for this submission. Please fix them before resubmitting. "
        )
        mutantFailureAdvice =
          "Some of your tests failed when run against the instructor's solution. Your tests will not be graded for this submission. Please fix them before resubmitting. Here are the failing tests:"
        this.logger.log('visible', 'Here are your failing test results:')
        for (const result of studentTestResults) {
          if (result.status === 'fail') {
            mutantFailureAdvice += `\n${result.name}: ${result.status}\n${result.output}\n--------------------------------\n`
            this.logger.log('visible', `${result.name}: ${result.status}`)
            this.logger.log('visible', result.output)
            this.logger.log('visible', '--------------------------------')
          }
        }
      } else {
        mutantResults = await this.builder.mutationTest()
      }
    }
    const testFeedbacks = this.config.gradedParts
      .map((part) =>
        this.gradePart(part, testResults, mutantResults, mutantFailureAdvice)
      )
      .flat()

    return {
      lint: lintResult,
      tests: testFeedbacks,
      output: this.logger.getEachOutput()
    }
  }
}
