import * as io from '@actions/io'
import * as glob from '@actions/glob'
import { readdir, readFile, access } from 'fs/promises'
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
  submissionDir: string,
  regressionTestJob?: number
): Promise<AutograderFeedback> {
  const _config = await readFile(
    path.join(solutionDir, 'pawtograder.yml'),
    'utf8'
  )
  const config = yaml.parse(_config) as PawtograderConfig
  const gradingDir = path.join(process.cwd(), 'pawtograder-grading')
  await io.mkdirP(gradingDir)
  const grader = new Grader(
    solutionDir,
    submissionDir,
    config,
    gradingDir,
    regressionTestJob
  )
  const ret = await grader.grade()

  return ret
}
function icon(result: TestResult) {
  if (result.status === 'pass') {
    return '✅'
  } else {
    return '❌'
  }
}
class Grader {
  private builder: Builder
  private logger: Logger
  constructor(
    private solutionDir: string,
    private submissionDir: string,
    private config: PawtograderConfig,
    private gradingDir: string,
    private regressionTestJob?: number
  ) {
    this.logger = new Logger(regressionTestJob)
    this.builder = new GradleBuilder(
      this.logger,
      this.gradingDir,
      this.regressionTestJob
    )
    if (regressionTestJob) {
      console.log(
        `Autograder configuration: ${JSON.stringify(this.config, null, 2)}`
      )
    }
  }
  async copyStudentFiles(whichFiles: 'files' | 'testFiles') {
    const files = this.config.submissionFiles[whichFiles]

    // Delete any files that match the glob patterns in the solution directory, so that students can overwrite/replace them
    const solutionGlobber = await glob.create(
      files.map((f) => path.join(this.gradingDir, f)).join('\n')
    )
    const expandedSolutionFiles = await solutionGlobber.glob()
    await Promise.all(
      expandedSolutionFiles.map(async (file: string) => {
        await io.rmRF(file)
      })
    )

    // Expand glob patterns
    const globber = await glob.create(
      files.map((f) => path.join(this.submissionDir, f)).join('\n')
    )
    const expandedFiles = await globber.glob()

    // Remove any files that are a prefix of another file, so that we only copy the directory contents once
    const filesWithoutDirContents = expandedFiles.filter(
      (file) => !expandedFiles.some((f) => f.startsWith(file) && f !== file)
    )

    for (const file of filesWithoutDirContents) {
      const relativePath = path.relative(this.submissionDir, file)
      const dest = path.join(this.gradingDir, relativePath)
      // Make sure that the directory exists before copying the file
      const dir = path.dirname(dest)
      await io.mkdirP(dir)
      await io.cp(file, dest, { recursive: true })
    }
  }
  async resetSolutionFiles() {
    const files = this.config.submissionFiles['files'].concat(
      this.config.submissionFiles['testFiles']
    )
    //First, delete any files that we copied over, since we might have copied over files that don't exist in the solution due to glob patterns
    const gradingDirGlobber = await glob.create(
      files.map((f) => path.join(this.gradingDir, f)).join('\n')
    )
    const expandedFiles = await gradingDirGlobber.glob()
    await Promise.all(
      expandedFiles.map(async (file: string) => {
        try {
          await io.rmRF(file)
        } catch {
          // File might not exist because it was deleted by a previous glob
        }
      })
    )

    const solutionFilesGlobber = await glob.create(
      files.map((f) => path.join(this.solutionDir, f)).join('\n')
    )
    const expandedSolutionFiles = await solutionFilesGlobber.glob()
    // Remove any files that are a prefix of another file, so that we only copy the directory contents once
    const filesWithoutDirContents = expandedSolutionFiles.filter(
      (file) =>
        !expandedSolutionFiles.some((f) => f.startsWith(file) && f !== file)
    )
    for (const file of filesWithoutDirContents) {
      const relativePath = path.relative(this.solutionDir, file)
      const dest = path.join(this.gradingDir, relativePath)
      // Make sure that the directory exists before copying the file
      const dir = path.dirname(dest)
      await io.mkdirP(dir)
      await io.cp(file, dest, { recursive: true })
    }
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
          part,
          testResults,
          mutantResults,
          mutantFailureAdvice
        )
        for (const feedback of ret) {
          feedback.part = part.name
        }
        return ret
      })
      .flat()
  }
  private gradeGradedUnit(
    unit: GradedUnit,
    part: GradedPart,
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
            output_format: 'markdown',
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
            output: `**Faults detected: ${mutantsDetected} / ${maxMutantsToDetect}**`,
            output_format: 'markdown',
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

      let score = 0
      if (unit.allow_partial_credit) {
        score = (passingTests / expectedTests) * unit.points
      } else {
        score = passingTests == expectedTests ? unit.points : 0
      }
      return [
        {
          name: unit.name,
          output: `**Tests passed: ${passingTests} / ${expectedTests}**\n${relevantTestResults
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(
              (result) =>
                `  * ${icon(result)} ${result.name} ${result.output ? '\n```\n' + result.output + '\n```' : ''}`
            )
            .join('\n')}`,
          output_format: 'markdown',
          score,
          hide_until_released: part.hide_until_released,
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
    console.log('Beginning grading')
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
    await this.copyStudentFiles('testFiles')

    console.log('Linting student submission')
    const lintResult = await this.builder.lint()

    console.log('Resetting to run instructor tests on student submission')
    await this.resetSolutionFiles()
    await this.copyStudentFiles('files')

    try {
      console.log(
        'Building project with student submission and running instructor tests'
      )
      await this.builder.buildClean()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      this.logger.log(
        'visible',
        `Build failed, submission can not be graded. Please fix the above errors below and resubmit. This submission will not count towards any submisison limits (if applicable for this assignment).`
      )
      this.logger.log('visible', msg)
      const allTests: AutograderTestFeedback[] = this.config.gradedParts
        .filter((part) => !part.hide_until_released)
        .map((part) =>
          part.gradedUnits.map((gradedUnit) => {
            if (isRegularTestUnit(gradedUnit)) {
              return {
                name: gradedUnit.name,
                output:
                  'Build failed, test not run. Please see overall output for more details.',
                output_format: 'text' as OutputFormat,
                score: 0,
                part: part.name,
                max_score: gradedUnit.points
              }
            } else if (isMutationTestUnit(gradedUnit)) {
              return {
                name: gradedUnit.name,
                output:
                  'Build failed, test not run. Please see overall output for more details.',
                output_format: 'text' as OutputFormat,
                score: 0,
                part: part.name,
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
        output: this.logger.getEachOutput(),
        tests: allTests,
        score: 0,
        artifacts: []
      }
    }

    const testResults = await this.builder.test()
    let mutantResults: MutantResult[] | undefined
    let mutantFailureAdvice: string | undefined
    let studentTestResults: TestResult[] | undefined
    if (
      this.config.submissionFiles.testFiles.length > 0 &&
      this.config.build.student_tests?.grading === 'mutation'
    ) {
      console.log(
        'Resetting to have student tests with the instructor solution'
      )
      await this.resetSolutionFiles()
      await this.copyStudentFiles('testFiles')
      console.log('Building solution and running student tests')
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
      studentTestResults = await this.builder.test()
      if (studentTestResults.some((result) => result.status === 'fail')) {
        this.logger.log(
          'visible',
          "Some of your tests failed when run against the instructor's solution. Your tests will not be graded for this submission. Please fix them before resubmitting. "
        )
        mutantFailureAdvice =
          "**Error**: Some of your tests failed when run against the instructor's solution. Your tests will not be graded for this submission. Please fix them before resubmitting.\n\n\nHere are your failing test results:\n\n\n"
        this.logger.log('visible', 'Here are your failing test results:')
        for (const result of studentTestResults) {
          if (result.status === 'fail') {
            mutantFailureAdvice += `\n❌ ${result.name}\n`
            mutantFailureAdvice += '```\n' + result.output + '\n```'
            this.logger.log('visible', `${result.name}: ${result.status}`)
            this.logger.log('visible', result.output)
          }
        }
        mutantFailureAdvice += '\n\nPlease fix the above errors and resubmit.'
      } else {
        console.log('Running student tests against buggy solutions')
        mutantResults = await this.builder.mutationTest()
      }
    } else if (
      this.config.build.student_tests?.grading ===
        'student-impl-coverage-report-only' &&
      this.config.submissionFiles.testFiles.length > 0
    ) {
      console.log('Running student tests against student implementation')
      await this.resetSolutionFiles()
      await this.copyStudentFiles('testFiles')
      await this.copyStudentFiles('files')
      await this.builder.buildClean()
      studentTestResults = await this.builder.test()
    }
    console.log('Wrapping up')
    const testFeedbacks = this.config.gradedParts
      .map((part) =>
        this.gradePart(part, testResults, mutantResults, mutantFailureAdvice)
      )
      .flat()
    if (this.regressionTestJob) {
      console.log('DEBUG: Test results')
      console.log(JSON.stringify(testFeedbacks, null, 2))
    }

    //Future graders might want to dynamically generate some artifacts, this would be the place to add them to the feedback
    const expectedArtifacts = this.config.build.artifacts || []

    if (
      this.config.build.student_tests?.grading ===
      'student-impl-coverage-report-only'
    ) {
      const passingTestCount = studentTestResults?.filter(
        (result) => result.status === 'pass'
      ).length
      const totalTestCount = studentTestResults?.length
      let studentTestOutput =
        'Please refer to your assignment instructions for the specifications of how (if at all) your tests will be graded. These results are purely informational:\n\n'
      studentTestOutput += `**Student-written tests passed: ${passingTestCount} / ${totalTestCount}**\n`
      if (studentTestResults && studentTestResults.length > 0) {
        for (const result of studentTestResults) {
          studentTestOutput += `\n${icon(result)} ${result.name} ${result.output ? '\n```\n' + result.output + '\n```' : ''}`
        }
        studentTestOutput += `\n\n${await this.builder.getCoverageReport()}`
      }
      testFeedbacks.push({
        name: 'Student-Written Test Results',
        output: studentTestOutput,
        output_format: 'markdown',
        score: 0,
        max_score: 0,
        part: 'Student-Written Tests',
        extra_data: {
          icon: 'FaInfo',
          hide_score: 'true'
        }
      })
      const artifactDir = this.builder.getCoverageReportDir()
      if (artifactDir) {
        expectedArtifacts.push({
          name: 'Coverage Report: Student-Written Tests',
          path: artifactDir,
          data: {
            format: 'zip',
            display: 'html_site'
          }
        })
      }
    }

    //Check that each expected artifact is present in the grading directory
    const artifactPaths = await Promise.all(
      expectedArtifacts
        .filter((a) => a.path)
        .map(async (artifact) => {
          this.logger.log(
            'visible',
            `Checking for artifact: ${artifact.name} at ${artifact.path}`
          )
          const artifactPath = path.join(this.gradingDir, artifact.path)
          try {
            await access(artifactPath)
            return {
              name: artifact.name,
              path: artifactPath,
              data: artifact.data
            }
          } catch {
            console.error(
              `Missing expected artifact: ${artifact.name} at path ${artifact.path}`
            )
            return undefined
          }
        })
    )

    return {
      lint: lintResult,
      tests: testFeedbacks,
      output: this.logger.getEachOutput(),
      artifacts: this.regressionTestJob
        ? []
        : artifactPaths.filter((path) => path !== undefined)
    }
  }
}
