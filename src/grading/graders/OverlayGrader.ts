import * as glob from '@actions/glob'
import * as io from '@actions/io'
import { access, readdir } from 'fs/promises'
import path from 'path'
import { AutograderFeedback } from '../../api/adminServiceSchemas.js'
import { Builder, MutantResult, TestResult } from '../builders/Builder.js'
import GradleBuilder from '../builders/GradleBuilder.js'
import {
  AutograderTestFeedback,
  DEFAULT_TIMEOUTS,
  GradedPart,
  GradedUnit,
  OverlayPawtograderConfig,
  isMutationTestUnit,
  isRegularTestUnit,
  OutputFormat,
  PawtograderConfig
} from '../types.js'
import { Grader } from './Grader.js'

function icon(result: TestResult) {
  if (result.status === 'pass') {
    return '✅'
  } else {
    return '❌'
  }
}

export class OverlayGrader extends Grader<OverlayPawtograderConfig> {
  private builder: Builder | undefined

  constructor(
    solutionDir: string,
    submissionDir: string,
    config: PawtograderConfig,
    private gradingDir: string,
    regressionTestJob?: number
  ) {
    super(solutionDir, submissionDir, config, regressionTestJob)
    if (this.config.build.preset == 'java-gradle') {
      this.builder = new GradleBuilder(
        this.logger,
        this.gradingDir,
        this.regressionTestJob
      )
    } else if (this.config.build.preset == 'none') {
      this.builder = undefined
    } else {
      throw new Error(`Unsupported build preset: ${this.config.build.preset}`)
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
    if (!this.builder) {
      return {
        lint: {
          status: 'pass',
          output: 'Linter is not enabled for this assignment'
        },
        output: this.logger.getEachOutput(),
        tests: [],
        score: 0,
        artifacts: []
      }
    }
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
    const gradedParts = this.config.gradedParts || []

    try {
      console.log(
        'Building project with student submission and running instructor tests'
      )
      await this.builder.buildClean({
        timeoutSeconds:
          this.config.build.timeouts_seconds?.build || DEFAULT_TIMEOUTS.build
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      this.logger.log(
        'visible',
        `Build failed, submission can not be graded. Please fix the above errors below and resubmit. This submission will not count towards any submisison limits (if applicable for this assignment).`
      )
      this.logger.log('visible', msg)
      const gradedParts = this.config.gradedParts || []
      const allTests: AutograderTestFeedback[] = gradedParts
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
    let testResults: TestResult[] = []
    try {
      testResults = await this.builder.test({
        timeoutSeconds:
          this.config.build.timeouts_seconds?.instructor_tests ||
          DEFAULT_TIMEOUTS.instructor_tests
      })
    } catch (err) {
      this.logger.log(
        'visible',
        `An error occurred while running instructor tests. Please fix the above errors and resubmit for grading. Here is the error message: ${err}`
      )
      const allTests: AutograderTestFeedback[] = gradedParts
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
        lint: lintResult,
        output: this.logger.getEachOutput(),
        tests: allTests,
        score: 0,
        artifacts: []
      }
    }
    let mutantResults: MutantResult[] | undefined
    let mutantFailureAdvice: string | undefined
    let studentTestResults: TestResult[] | undefined
    if (
      this.config.submissionFiles.testFiles.length > 0 &&
      this.config.build.student_tests?.instructor_impl?.run_tests
    ) {
      console.log(
        'Resetting to have student tests with the instructor solution'
      )
      await this.resetSolutionFiles()
      await this.copyStudentFiles('testFiles')
      console.log('Building solution and running student tests')
      try {
        await this.builder.buildClean({
          timeoutSeconds:
            this.config.build.timeouts_seconds?.build || DEFAULT_TIMEOUTS.build
        })
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
      try {
        studentTestResults = await this.builder.test({
          timeoutSeconds:
            this.config.build.timeouts_seconds?.student_tests ||
            DEFAULT_TIMEOUTS.student_tests
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        this.logger.log(
          'visible',
          'Error running student tests on instructor solution:'
        )
        this.logger.log('visible', msg)
      }
      if (
        !studentTestResults ||
        studentTestResults.some((result) => result.status === 'fail')
      ) {
        this.logger.log(
          'visible',
          "Some of your tests failed when run against the instructor's solution. Your tests will not be graded for this submission. Please fix them before resubmitting. "
        )
        mutantFailureAdvice =
          "**Error**: Some of your tests failed when run against the instructor's solution. Your tests will not be graded for this submission. Please fix them before resubmitting.\n\n\nHere are your failing test results:\n\n\n"
        this.logger.log('visible', 'Here are your failing test results:')
        if (studentTestResults) {
          for (const result of studentTestResults) {
            if (result.status === 'fail') {
              mutantFailureAdvice += `\n❌ ${result.name}\n`
              mutantFailureAdvice += '```\n' + result.output + '\n```'
              this.logger.log('visible', `${result.name}: ${result.status}`)
              this.logger.log('visible', result.output)
            }
          }
        }
        mutantFailureAdvice +=
          '\n\nPlease fix the above errors and resubmit for grading.'
      } else {
        console.log('Running student tests against buggy solutions')
        try {
          mutantResults = await this.builder.mutationTest({
            timeoutSeconds:
              this.config.build.timeouts_seconds?.mutants ||
              DEFAULT_TIMEOUTS.mutants
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error'
          this.logger.log('visible', 'Error running mutation tests: ' + msg)
        }
      }
    }
    let studentTestAdvice: string | undefined
    if (
      (this.config.build.student_tests?.student_impl?.report_branch_coverage ||
        this.config.build.student_tests?.student_impl?.run_tests) &&
      this.config.submissionFiles.testFiles.length > 0
    ) {
      console.log('Running student tests against student implementation')
      try {
        await this.resetSolutionFiles()
        await this.copyStudentFiles('testFiles')
        await this.copyStudentFiles('files')
        await this.builder.buildClean({
          timeoutSeconds:
            this.config.build.timeouts_seconds?.build || DEFAULT_TIMEOUTS.build
        })
        studentTestResults = await this.builder.test({
          timeoutSeconds:
            this.config.build.timeouts_seconds?.student_tests ||
            DEFAULT_TIMEOUTS.student_tests
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        studentTestAdvice = 'Your tests failed to compile. ' + msg
        this.logger.log('visible', msg)
      }
    }
    console.log('Wrapping up')
    const testFeedbacks = gradedParts
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
      this.config.build.student_tests?.instructor_impl?.report_mutation_coverage
    ) {
      let studentMutationOutput =
        'Please refer to your assignment instructions for the specifications of how (if at all) your tests will be graded. These results are purely informational: '
      if (mutantFailureAdvice) {
        studentMutationOutput = mutantFailureAdvice
      }
      if (mutantResults) {
        const getMutantPrompt = (mutantName: string) => {
          if (this.config.mutantAdvice) {
            const [sourceClass, targetClass] = mutantName.split(' ')
            const mutantAdvice = this.config.mutantAdvice.find(
              (ma) =>
                ma.sourceClass === sourceClass && ma.targetClass === targetClass
            )
            if (mutantAdvice) {
              return mutantAdvice.prompt
            }
          }
          return mutantName
        }
        const getMutantShortName = (mutantName: string) => {
          if (this.config.mutantAdvice) {
            const [sourceClass, targetClass] = mutantName.split(' ')
            const mutantAdvice = this.config.mutantAdvice.find(
              (ma) =>
                ma.sourceClass === sourceClass && ma.targetClass === targetClass
            )
            if (mutantAdvice) {
              return mutantAdvice.name
            }
          }
          return undefined
        }

        const mutantsDetected = mutantResults
          .filter((mr) => mr.status === 'pass')
          .map((mr) => {
            const prompt = getMutantPrompt(mr.name)
            const shortName = getMutantShortName(mr.name)
            return `* ${shortName} (${prompt})\n\t * Detected by: ${mr.tests.join(', ')}`
          })
        const mutantsNotDetected = mutantResults
          .filter((mr) => mr.status === 'fail')
          .map((mr) => {
            const prompt = getMutantPrompt(mr.name)
            return `* **${mr.name}** (${prompt})`
          })
        studentMutationOutput += `Faults detected: ${mutantsDetected.length}:\n`
        studentMutationOutput += `${mutantsDetected.join('\n')}\n\n`
        studentMutationOutput += `Faults not detected: ${mutantsNotDetected.length}:\n`
        studentMutationOutput += `${mutantsNotDetected.join('\n')}`
      }
      this.logger.log('hidden', studentMutationOutput)
      testFeedbacks.push({
        name: 'Fault Coverage Report',
        output: studentMutationOutput,
        output_format: 'markdown',
        score: 0,
        max_score: 0
      })
    }
    if (this.config.build.student_tests?.student_impl?.report_branch_coverage) {
      const passingTestCount = studentTestResults?.filter(
        (result) => result.status === 'pass'
      ).length
      const totalTestCount = studentTestResults?.length
      let studentTestOutput =
        'Please refer to your assignment instructions for the specifications of how (if at all) your tests will be graded. These results are purely informational:\n\n'
      if (studentTestAdvice) {
        studentTestOutput += studentTestAdvice
      }
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
