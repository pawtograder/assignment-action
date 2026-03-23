import * as glob from '@actions/glob'
import * as io from '@actions/io'
import { access, readdir, stat } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { AutograderFeedback } from '../../api/adminServiceSchemas.js'
import { Builder, MutantResult, TestResult } from '../builders/Builder.js'
import GradleBuilder, { GradleBuildError } from '../builders/GradleBuilder.js'
import PythonScriptBuilder from '../builders/PythonScriptBuilder.js'
import { generateStudentFriendlyError } from '../builders/javacErrorParser.js'
import {
  AutograderTestFeedback,
  DEFAULT_TIMEOUTS,
  Dependency,
  FeedBotConfig,
  GradedPart,
  GradedUnit,
  GraderArtifact,
  MutantAdvice,
  OverlayPawtograderConfig,
  isMutationTestUnit,
  isRegularTestUnit,
  isPartDependency,
  isUnitDependency,
  isSimpleDependency,
  OutputFormat,
  PawtograderConfig
} from '../types.js'
import {
  FeedbotValidationResult,
  validateFeedbotConfig
} from '../feedbotConfig.js'
import { buildFeedBotPromptWithSpec } from '../../constants/promptData.js'
import { Grader } from './Grader.js'

function isFeedbotEnabled(cfg: FeedBotConfig | undefined): boolean {
  return Boolean(cfg?.enabled)
}

function icon(result: TestResult) {
  if (result.status === 'pass') {
    return '✅'
  } else {
    return '❌'
  }
}

/** Cooldown default only; assignment/class totals are omitted unless set in config so the service can apply its own limits. */
const DEFAULT_FEEDBOT_COOLDOWN = 5

function getFeedbotRateLimit(cfg: FeedBotConfig | undefined) {
  const partial = cfg?.rate_limit
  return {
    cooldown: partial?.cooldown ?? DEFAULT_FEEDBOT_COOLDOWN,
    ...(partial?.assignment_total !== undefined
      ? { assignment_total: partial.assignment_total }
      : {}),
    ...(partial?.class_total !== undefined ? { class_total: partial.class_total } : {})
  }
}

export class OverlayGrader extends Grader<OverlayPawtograderConfig> {
  private builder: Builder | undefined
  private mutantHintsShown = 0 // Running tally of mutant hints shown
  private implementationHintsShown = 0 // Running tally of failing test details shown
  private feedbotValidation: FeedbotValidationResult
  private feedbotSpecMarkdown?: string
  private feedbotSpecLoadFailed = false

  private async ensureFeedbotSpecLoaded() {
    if (
      this.feedbotSpecMarkdown ||
      this.feedbotSpecLoadFailed ||
      !this.config.feedbot ||
      !this.config.feedbot.enabled ||
      !this.feedbotValidation.runtimeEnabled
    ) {
      return
    }
    const specUrl = this.config.feedbot.spec_url
    if (!specUrl) {
      this.feedbotSpecLoadFailed = true
      this.feedbotValidation.runtimeEnabled = false
      return
    }
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10_000)
    try {
      const response = await fetch(specUrl, { signal: controller.signal })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`)
      }
      const text = await response.text()
      this.feedbotSpecMarkdown = text
      const preview = text.slice(0, 80).replace(/\s+/g, ' ')
      this.logger.log(
        'visible',
        `FeedBot spec_url loaded, first chars: "${preview}..."`
      )
    } catch (err) {
      const isTimeout =
        (err instanceof Error && err.name === 'AbortError') ||
        (typeof err === 'object' &&
          err !== null &&
          'name' in err &&
          (err as { name?: unknown }).name === 'AbortError')
      const reason = isTimeout
        ? 'Timed out after 10 seconds'
        : err instanceof Error
          ? err.message
          : 'Unknown error fetching spec_url'
      this.logger.log(
        'visible',
        `FeedBot configuration error: could not fetch spec_url '${specUrl}': ${reason}. FeedBot will be disabled for this run.`
      )
      this.feedbotSpecLoadFailed = true
      this.feedbotValidation.runtimeEnabled = false
    } finally {
      clearTimeout(timeoutId)
    }
  }

  constructor(
    solutionDir: string,
    submissionDir: string,
    config: PawtograderConfig,
    private gradingDir: string,
    regressionTestJob?: number
  ) {
    super(solutionDir, submissionDir, config, regressionTestJob)
    this.feedbotValidation = validateFeedbotConfig(this.config.feedbot)

    if (
      this.feedbotValidation.runtimeEnabled === false &&
      this.feedbotValidation.valid === false
    ) {
      const missingList = this.feedbotValidation.missingFields.join(', ')
      this.logger.log(
        'visible',
        `FeedBot configuration error: missing required fields: ${missingList}. FeedBot will be disabled for this run.`
      )
    }
    if (this.config.build.preset == 'java-gradle') {
      this.builder = new GradleBuilder(
        this.logger,
        this.gradingDir,
        this.regressionTestJob
      )
    } else if (this.config.build.preset == 'python-script') {
      const info = this.config.build.script_info
      if (!info) {
        throw Error(
          'Expected SciptInfo to be provided in yml config, but nothing was provided'
        )
      }
      this.builder = new PythonScriptBuilder(
        this.logger,
        this.gradingDir,
        info,
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

  async copyFallbackFiles() {
    console.log(
      `Copying fallback files: ${JSON.stringify(this.config.fallbackFiles)}`
    )
    if (!this.config.fallbackFiles) {
      return
    }

    const fallbackDir = path.join(this.solutionDir, this.config.fallbackFiles)

    // Recursively glob all files in the fallback directory
    const fallbackGlobber = await glob.create(path.join(fallbackDir, '**/*'))
    const fallbackFiles = await fallbackGlobber.glob()

    // Filter to only include files (not directories)
    const fileChecks = await Promise.all(
      fallbackFiles.map(async (file) => {
        try {
          const fileStat = await stat(file)
          return fileStat.isFile() ? file : null
        } catch {
          return null
        }
      })
    )
    const validFiles = fileChecks.filter(
      (file): file is string => file !== null
    )

    for (const fallbackFile of validFiles) {
      // Calculate relative path from fallback directory
      const relativePath = path.relative(fallbackDir, fallbackFile)
      const dest = path.join(this.gradingDir, relativePath)

      // Check if the file already exists in the grading directory
      console.log(`Checking if file exists in grading directory: ${dest}`)
      try {
        await access(dest)
        // File exists, skip it
        continue
      } catch {
        // File doesn't exist, copy it
        const dir = path.dirname(dest)
        await io.mkdirP(dir)
        await io.cp(fallbackFile, dest, { recursive: true })
      }
    }
  }

  private async copyArtifactToTemp(artifact: GraderArtifact) {
    const artifactsTempDir = path.join(
      tmpdir(),
      `pawtograder-artifacts-${Date.now()}`
    )
    await io.mkdirP(artifactsTempDir)
    const sourcePath = artifact.path.startsWith('/')
      ? artifact.path
      : path.join(this.gradingDir, artifact.path)
    try {
      await access(sourcePath)
      const tempArtifactPath = path.join(
        artifactsTempDir,
        `${Date.now()}-${path.basename(artifact.path)}`
      )
      await io.cp(sourcePath, tempArtifactPath, { recursive: true })
      return {
        name: artifact.name,
        path: tempArtifactPath,
        data: artifact.data
      }
    } catch (err) {
      this.logger.log(
        'visible',
        `Warning: Could not copy artifact ${artifact.name} from ${artifact.path}`
      )
      this.logger.log('visible', JSON.stringify(err, null, 2))
      throw err
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

  /**
   * Main code for grading a single unit as specified in pawtograder.yml
   * @param unit
   * @param part
   * @param testResults
   * @param mutantResults
   * @param mutantError
   * @returns
   */
  private gradeGradedUnit(
    unit: GradedUnit,
    part: GradedPart,
    testResults: TestResult[],
    mutantResults?: MutantResult[],
    mutantError?: { reason: string; details: string }
  ): AutograderTestFeedback[] {
    if (isMutationTestUnit(unit)) {
      if (!mutantResults) {
        const errorMessage = mutantError
          ? `**${mutantError.reason}**\n\n${mutantError.details}`
          : 'No results from grading tests. Please check overall output for more details.'
        const showFeedbotMutantError =
          isFeedbotEnabled(this.config.feedbot) &&
          this.feedbotValidation.runtimeEnabled &&
          !!this.feedbotSpecMarkdown &&
          !part.hideFeedbot &&
          !unit.hideFeedbot
        const feedbotCfg = this.config.feedbot
        const extra_data =
          mutantError || showFeedbotMutantError
            ? {
                ...(mutantError
                  ? { icon: 'FaExclamationTriangle' as const }
                  : {}),
                ...(showFeedbotMutantError
                  ? {
                      llm: {
                        prompt: buildFeedBotPromptWithSpec(
                          errorMessage,
                          unit.name,
                          this.feedbotSpecMarkdown!,
                          feedbotCfg?.prompt
                        ),
                        type: 'v1' as const,
                        provider: feedbotCfg!.provider,
                        model: feedbotCfg!.model!,
                        account: feedbotCfg!.account!,
                        rate_limit: getFeedbotRateLimit(feedbotCfg)
                      }
                    }
                  : {})
              }
            : undefined
        return [
          {
            name: unit.name,
            output: errorMessage,
            output_format: 'markdown',
            score: 0,
            max_score:
              unit.breakPoints?.[0].pointsToAward ?? unit.linearScoring?.points,
            extra_data
          }
        ]
      } else {
        const maxScore =
          unit.breakPoints?.[0].pointsToAward ?? unit.linearScoring?.points
        const maxMutantsToDetect =
          unit.breakPoints?.[0].minimumMutantsDetected ??
          unit.linearScoring?.total_faults

        if (!maxScore || !maxMutantsToDetect) {
          throw new Error(
            `Incorrect mutation test specification (should either provide valid breakpoints or total points and faults): ${JSON.stringify(unit)}`
          )
        }
        const relevantMutantResults = mutantResults.filter((mr) => {
          const locations = unit.locations
          const mutantLocation = mr.location

          // Try class-based matching first (backward compatible)
          let classMatch = false
          if (!mutantLocation.includes(':')) {
            classMatch = locations.some((location) => {
              // Check if location looks like a class name (contains dots or is simple identifier)
              const looksLikeClassName =
                location.includes('.') || /^[A-Z][a-zA-Z0-9]*$/.test(location)
              if (looksLikeClassName && !location.includes(' ')) {
                return mutantLocation.startsWith(location)
              }
              return false
            })
          } else {
            const mutantLocationParts = mutantLocation.split(':')
            const mutantClass = mutantLocationParts[0]
            const mutantLine = parseInt(mutantLocationParts[1])
            const mutantEndLine = parseInt(mutantLocationParts[2])

            classMatch = locations.some((location) => {
              if (!location.includes('-')) {
                const looksLikeClassName =
                  location.includes('.') || /^[A-Z][a-zA-Z0-9]*$/.test(location)
                if (looksLikeClassName && !location.includes(' ')) {
                  return mutantClass.startsWith(location)
                }
                return false
              }
              // Line range matching for locations like "ClassName-10-50"
              const locationParts = location.split('-')
              if (
                locationParts.length === 3 &&
                !isNaN(parseInt(locationParts[1])) &&
                !isNaN(parseInt(locationParts[2]))
              ) {
                const locationLine = parseInt(locationParts[1])
                const locationEndLine = parseInt(locationParts[2])
                return (
                  mutantLine >= locationLine && mutantEndLine <= locationEndLine
                )
              }
              return false
            })
          }

          // If class-based matching found results, return them
          if (classMatch) {
            return true
          }

          // Fallback: try mutator-based matching for all locations
          return locations.some((location) => {
            // Try matching against mutator name (full string)
            return mr.name.includes(location) || location === mr.name
          })
        })
        const mutantsDetected = relevantMutantResults.filter(
          (mr) => mr.status === 'pass'
        ).length

        // Collect advice for non-killed mutants from config
        const nonKilledMutants = relevantMutantResults.filter(
          (mr) => mr.status === 'fail'
        )
        const mutantsWithAdvice = nonKilledMutants
          .map((mr) => {
            // Extract targetClass from mutant name (format: "sourceClass targetClass")
            const nameParts = mr.name.split(' ')
            const targetClass =
              nameParts.length > 1 ? nameParts[nameParts.length - 1] : null

            // Look up advice in config
            const advice =
              targetClass && this.config.mutantAdvice
                ? this.config.mutantAdvice.find(
                    (a) => a.targetClass === targetClass
                  )
                : null

            return advice ? { mutant: mr, advice } : null
          })
          .filter(
            (item): item is { mutant: MutantResult; advice: MutantAdvice } =>
              item !== null
          )

        // Apply the maxMutantHints limit
        const maxHints = this.config.maxMutantHints
        const remainingHints =
          maxHints !== undefined ? maxHints - this.mutantHintsShown : Infinity
        const hintsToShow = mutantsWithAdvice.slice(
          0,
          Math.max(0, remainingHints)
        )

        // Update the running tally
        this.mutantHintsShown += hintsToShow.length

        // Calculate if there are hints available but not shown due to limit
        const hintsNotShown = mutantsWithAdvice.length - hintsToShow.length
        const limitMessage =
          hintsNotShown > 0 && maxHints !== undefined
            ? `\n\n*${hintsNotShown} additional hint${hintsNotShown > 1 ? 's' : ''} available but not shown. You are limited to ${maxHints} hint${maxHints > 1 ? 's' : ''} total across all fault detection tests.*`
            : ''

        const adviceSection =
          hintsToShow.length > 0
            ? '\n\n**Hints for undetected faults:**\n' +
              hintsToShow
                .map((item) => `- ${item.advice.name}: ${item.advice.prompt}`)
                .join('\n') +
              limitMessage
            : hintsNotShown > 0
              ? limitMessage
              : ''

        let score: number | undefined = 0
        if (unit.breakPoints) {
          score = unit.breakPoints.find(
            (bp) => bp.minimumMutantsDetected <= mutantsDetected
          )?.pointsToAward
        } else {
          score =
            Math.round(
              (mutantsDetected / maxMutantsToDetect) * maxScore * 100
            ) / 100
        }

        const errorOutput = `**Faults detected: ${mutantsDetected} / ${relevantMutantResults.length}**.\n${unit.breakPoints ? `Minimum mutants to detect to get full points: ${maxMutantsToDetect}` : ''}${adviceSection}`
        const feedbotConfig = this.config.feedbot
        const showFeedbotMutation =
          hintsToShow.length > 0 &&
          isFeedbotEnabled(feedbotConfig) &&
          this.feedbotValidation.runtimeEnabled &&
          !!this.feedbotSpecMarkdown &&
          !part.hideFeedbot &&
          !unit.hideFeedbot
        return [
          {
            name: unit.name,
            output: errorOutput,
            output_format: 'markdown',
            score: score ?? 0,
            max_score: maxScore,
            ...(showFeedbotMutation && {
              extra_data: {
                llm: {
                  prompt: buildFeedBotPromptWithSpec(
                    errorOutput,
                    unit.name,
                    this.feedbotSpecMarkdown!,
                    feedbotConfig?.prompt
                  ),
                  type: 'v1' as const,
                  provider: feedbotConfig!.provider,
                  model: feedbotConfig!.model!,
                  account: feedbotConfig!.account!,
                  rate_limit: getFeedbotRateLimit(feedbotConfig)
                }
              }
            })
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
      const failingTests = relevantTestResults.filter(
        (result) => result.status === 'fail'
      )

      let score = 0
      if (unit.allow_partial_credit) {
        score = (passingTests / expectedTests) * unit.points
      } else {
        score = passingTests == expectedTests ? unit.points : 0
      }

      // Generate output based on maxImplementationHints setting
      const maxImplHints = this.config.maxImplementationHints
      let output: string
      let hiddenOutput: string | undefined
      let failingTestsToShow: typeof failingTests = failingTests

      if (unit.hide_output) {
        output = 'Output for this test is intentionally hidden.'
        hiddenOutput = `**Tests passed: ${passingTests} / ${expectedTests}**\n${relevantTestResults
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(
            (result) =>
              `  * ${icon(result)} ${result.name} ${result.output ? '\n```\n' + result.output + '\n```' : ''}`
          )
          .join('\n')}`
      } else if (maxImplHints !== undefined) {
        // Limited mode: only show failing tests, up to the limit
        const remainingHints = maxImplHints - this.implementationHintsShown
        failingTestsToShow = failingTests
          .sort((a, b) => a.name.localeCompare(b.name))
          .slice(0, Math.max(0, remainingHints))

        // Update the running tally
        this.implementationHintsShown += failingTestsToShow.length

        // Calculate hints not shown
        const hintsNotShown = failingTests.length - failingTestsToShow.length
        const limitMessage =
          hintsNotShown > 0
            ? `\n\n*${hintsNotShown} additional failing test${hintsNotShown > 1 ? 's' : ''} not shown. You are limited to ${maxImplHints} failing test detail${maxImplHints > 1 ? 's' : ''} total.*`
            : ''

        output = `**Tests passed: ${passingTests} / ${expectedTests}**`
        if (failingTestsToShow.length > 0) {
          output +=
            '\n' +
            failingTestsToShow
              .map(
                (result) =>
                  `  * ${icon(result)} ${result.name} ${result.output ? '\n```\n' + result.output + '\n```' : ''}`
              )
              .join('\n')
        }
        output += limitMessage
      } else {
        // Default mode: show all tests
        output = `**Tests passed: ${passingTests} / ${expectedTests}**\n${relevantTestResults
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(
            (result) =>
              `  * ${icon(result)} ${result.name} ${result.output ? '\n```\n' + result.output + '\n```' : ''}`
          )
          .join('\n')}`
      }

      const hasFailingTests = failingTests.length > 0
      const feedbotConfigRegular = this.config.feedbot
      const showFeedbotRegular =
        isFeedbotEnabled(feedbotConfigRegular) &&
        this.feedbotValidation.runtimeEnabled &&
        !!this.feedbotSpecMarkdown &&
        (hasFailingTests ||
          maxImplHints === undefined ||
          failingTestsToShow.length > 0) &&
        !part.hideFeedbot &&
        !unit.hideFeedbot
      return [
        {
          name: unit.name,
          output,
          output_format: 'markdown',
          hidden_output: hiddenOutput,
          hidden_output_format: unit.hide_output ? 'markdown' : undefined,
          score,
          hide_until_released: part.hide_until_released,
          max_score: unit.points,
          ...(showFeedbotRegular && {
            extra_data: {
              llm: {
                prompt: buildFeedBotPromptWithSpec(
                  output,
                  unit.name,
                  this.feedbotSpecMarkdown!,
                  feedbotConfigRegular?.prompt
                ),
                type: 'v1' as const,
                provider: feedbotConfigRegular!.provider,
                model: feedbotConfigRegular!.model!,
                account: feedbotConfigRegular!.account!,
                rate_limit: getFeedbotRateLimit(feedbotConfigRegular)
              }
            }
          })
        }
      ]
    }
    throw new Error(
      `Unknown unit type in grading config: ${JSON.stringify(unit)}`
    )
  }

  /**
   * Check if dependencies are satisfied based on part and unit scores.
   * Works for both GradedPart and GradedUnit dependencies.
   * Returns an object with:
   * - satisfied: boolean indicating if all dependencies are met
   * - unmetDependencies: array of strings describing which dependencies were not met
   */
  private checkDependencies(
    dependencies: Dependency[] | undefined,
    partScores: Map<string, { score: number; maxScore: number }>,
    unitScores: Map<string, { score: number; maxScore: number }>
  ): { satisfied: boolean; unmetDependencies: string[] } {
    if (!dependencies || dependencies.length === 0) {
      return { satisfied: true, unmetDependencies: [] }
    }

    const unmetDependencies: string[] = []

    for (const dep of dependencies) {
      let targetName: string
      let minScore: number | undefined
      let scoresMap: Map<string, { score: number; maxScore: number }>
      let depType: 'part' | 'unit'

      if (isSimpleDependency(dep)) {
        // String = part name requiring 100%
        targetName = dep
        minScore = undefined
        scoresMap = partScores
        depType = 'part'
      } else if (isPartDependency(dep)) {
        targetName = dep.part
        minScore = dep.minScore
        scoresMap = partScores
        depType = 'part'
      } else if (isUnitDependency(dep)) {
        targetName = dep.unit
        minScore = dep.minScore
        scoresMap = unitScores
        depType = 'unit'
      } else {
        continue
      }

      const depScores = scoresMap.get(targetName)
      if (!depScores) {
        // Dependency not found - this is a configuration error
        unmetDependencies.push(
          `Dependency ${depType} "${targetName}" not found in grading configuration`
        )
        continue
      }

      const { score, maxScore } = depScores

      if (minScore !== undefined) {
        // Use minScore as raw score threshold
        if (score < minScore) {
          unmetDependencies.push(
            `${depType} "${targetName}" (scored ${score}/${maxScore}, required at least ${minScore})`
          )
        }
      } else {
        // Require full marks
        if (score < maxScore) {
          unmetDependencies.push(
            `${depType} "${targetName}" (scored ${score}/${maxScore}, required ${maxScore})`
          )
        }
      }
    }

    return {
      satisfied: unmetDependencies.length === 0,
      unmetDependencies
    }
  }

  /**
   * Check if any dependency has a custom minScore
   */
  private hasCustomMinScore(dependencies: Dependency[] | undefined): boolean {
    if (!dependencies) return false
    return dependencies.some(
      (dep) =>
        (isPartDependency(dep) && dep.minScore !== undefined) ||
        (isUnitDependency(dep) && dep.minScore !== undefined)
    )
  }

  /**
   * Create feedback for a part whose dependencies were not met
   */
  private createPartDependencyNotMetFeedback(
    part: GradedPart,
    unmetDependencies: string[]
  ): AutograderTestFeedback[] {
    // Calculate total max score for this part
    const totalMaxScore = part.gradedUnits.reduce((sum, unit) => {
      if (isRegularTestUnit(unit)) {
        return sum + unit.points
      } else if (isMutationTestUnit(unit)) {
        return (
          sum +
          (unit.breakPoints?.[0].pointsToAward ??
            unit.linearScoring?.points ??
            0)
        )
      }
      return sum
    }, 0)

    const requirementText = this.hasCustomMinScore(part.dependencies)
      ? 'Please meet the required score thresholds shown above before this part will be graded.'
      : 'Please receive full marks on all dependent parts before this part will be graded.'

    return [
      {
        name: `${part.name} (Dependencies Not Met)`,
        output: `This part was not graded because the following dependencies were not satisfied:\n\n${unmetDependencies.map((d) => `* ${d}`).join('\n')}\n\n${requirementText}`,
        output_format: 'markdown',
        score: 0,
        max_score: totalMaxScore,
        part: part.name,
        hide_until_released: part.hide_until_released
      }
    ]
  }

  /**
   * Create feedback for a unit whose dependencies were not met
   */
  private createUnitDependencyNotMetFeedback(
    unit: GradedUnit,
    part: GradedPart,
    unmetDependencies: string[]
  ): AutograderTestFeedback {
    const maxScore = isRegularTestUnit(unit)
      ? unit.points
      : (unit.breakPoints?.[0].pointsToAward ?? unit.linearScoring?.points ?? 0)

    const requirementText = this.hasCustomMinScore(unit.dependencies)
      ? 'Please meet the required score thresholds shown above before this unit will be graded.'
      : 'Please receive full marks on all dependencies before this unit will be graded.'

    return {
      name: `${unit.name} (Dependencies Not Met)`,
      output: `This unit was not graded because the following dependencies were not satisfied:\n\n${unmetDependencies.map((d) => `* ${d}`).join('\n')}\n\n${requirementText}`,
      output_format: 'markdown',
      score: 0,
      max_score: maxScore,
      part: part.name,
      hide_until_released: part.hide_until_released
    }
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
    this.logger.log('visible', 'Beginning grading')
    const expectedArtifacts = this.config.build.artifacts || []

    const tmpDir = path.join(process.cwd(), 'pawtograder-grading')
    await io.mkdirP(tmpDir)

    // Create temp directory for preserving artifacts
    const artifactsTempDir = path.join(
      tmpdir(),
      `pawtograder-artifacts-${Date.now()}`
    )
    await io.mkdirP(artifactsTempDir)
    const solutionFiles = await readdir(this.solutionDir)
    await Promise.all(
      solutionFiles.map(async (file) => {
        if (!file.startsWith('.git')) {
          const src = path.join(this.solutionDir, file)
          const dest = path.join(tmpDir, file)
          await io.cp(src, dest, { recursive: true })
        }
      })
    )
    this.logger.log('visible', 'Copying student files')
    await this.copyStudentFiles('files')
    await this.copyStudentFiles('testFiles')

    this.logger.log('visible', 'Setting up virtual environment')

    if (this.config.build.venv?.cache_key && this.config.build.venv?.dir_name) {
      const venv_dir = this.config.build.venv.dir_name
      const cache_key = this.config.build.venv.cache_key
      await this.builder.setupVenv(venv_dir, cache_key)
    }

    this.logger.log('visible', 'Linting student submission')
    const lintResult = await this.builder.lint()
    if (this.config.build.linter?.policy === 'fail') {
      if (lintResult.status === 'fail') {
        this.logger.log(
          'visible',
          `Linting failed, submission can not be graded. Please fix the above errors below and resubmit. This submission will not count towards any submisison limits (if applicable for this assignment).`
        )
        this.logger.log('visible', lintResult.output)
        return {
          lint: lintResult,
          output: this.logger.getEachOutput(),
          tests: [],
          score: 0,
          artifacts: []
        }
      }
    }

    this.logger.log(
      'visible',
      'Resetting to run instructor tests on student submission'
    )
    await this.resetSolutionFiles()
    await this.copyStudentFiles('files')
    await this.copyFallbackFiles()
    const gradedParts = this.config.gradedParts || []

    // Attempt to load FeedBot assignment spec (if enabled and otherwise valid)
    await this.ensureFeedbotSpecLoaded()

    try {
      this.logger.log(
        'visible',
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

      // Check if this is a GradleBuildError with parsed errors - show friendly message
      if (err instanceof GradleBuildError && err.parsedErrors.length > 0) {
        // ALWAYS show the raw output to students
        this.logger.log('visible', err.rawOutput)
        // Also include the friendly message
        const friendlyMessage = generateStudentFriendlyError(err.parsedErrors)
        this.logger.log('visible', '\n---\n\n' + friendlyMessage)
      } else {
        // Fallback to generic error message
        this.logger.log('visible', msg)
      }
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
                max_score:
                  gradedUnit.breakPoints?.[0].pointsToAward ??
                  gradedUnit.linearScoring?.points
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
                max_score:
                  gradedUnit.breakPoints?.[0].pointsToAward ??
                  gradedUnit.linearScoring?.points
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
    let mutantError: { reason: string; details: string } | undefined
    let studentTestResults: TestResult[] | undefined
    if (
      this.config.submissionFiles.testFiles.length > 0 &&
      this.config.build.student_tests?.instructor_impl?.run_tests
    ) {
      this.logger.log(
        'visible',
        'Resetting to have student tests with the instructor solution'
      )
      await this.resetSolutionFiles()
      await this.copyStudentFiles('testFiles')
      this.logger.log('visible', 'Building solution and running student tests')
      try {
        await this.builder.buildClean({
          timeoutSeconds:
            this.config.build.timeouts_seconds?.build || DEFAULT_TIMEOUTS.build
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'

        // Check if this is a GradleBuildError with parsed errors
        if (err instanceof GradleBuildError && err.parsedErrors.length > 0) {
          const friendlyMessage = generateStudentFriendlyError(err.parsedErrors)
          mutantError = {
            reason: 'Your tests failed to compile',
            details: friendlyMessage
          }
          this.logger.log('visible', 'Your tests failed to compile.')
          // Also include the friendly message in the visible output
          this.logger.log('visible', '\n---\n\n' + friendlyMessage)
          this.logger.log(
            'visible',
            'Here is the raw, debug output from building your tests with our solution:'
          )
          this.logger.log('visible', err.rawOutput)
        } else {
          // Fallback to generic error message
          mutantError = {
            reason: 'Your tests failed to compile',
            details:
              'Please see overall output for more details. Pay attention to the error messages: they likely indicate an assumption that your tests make about the implementation that is not true.'
          }
          this.logger.log(
            'visible',
            'Your tests failed to compile. Here is the output from building your tests with our solution:'
          )
          this.logger.log('visible', msg)
        }
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
          "Some of your tests failed when run against the instructor's solution."
        )
        this.logger.log('visible', 'Here are your failing test results:')

        // Build details for failing tests
        let failingTestDetails = ''
        if (studentTestResults) {
          for (const result of studentTestResults) {
            if (result.status === 'fail') {
              failingTestDetails += `❌ ${result.name}\n`
              failingTestDetails += '```\n' + result.output + '\n```\n\n'
              this.logger.log('visible', `${result.name}: ${result.status}`)
              this.logger.log('visible', result.output)
            }
          }
        }

        if (this.config.build.student_tests?.instructor_impl?.run_mutation) {
          mutantError = {
            reason: `Your test suite contains incorrect tests. We ran YOUR tests against a known-correct implementation, and your tests failed. This means your tests are checking for wrong behavior.

Before we can grade your test suite's ability to detect bugs, your tests must correctly describe the expected behavior from the specification.

The following tests expect incorrect output:
`,
            details:
              failingTestDetails +
              'Your tests must pass against a correct implementation before fault detection can be evaluated. Please fix the failing tests and resubmit.'
          }
        }
      } else if (
        this.config.build.student_tests?.instructor_impl?.run_mutation
      ) {
        this.logger.log(
          'visible',
          'Running student tests against buggy solutions'
        )
        try {
          mutantResults = await this.builder.mutationTest({
            timeoutSeconds:
              this.config.build.timeouts_seconds?.mutants ||
              DEFAULT_TIMEOUTS.mutants
          })
          if (
            this.config.build.student_tests?.instructor_impl
              ?.report_mutation_coverage
          ) {
            const coverageReportDir =
              this.builder.getMutationCoverageReportDir()
            if (coverageReportDir) {
              expectedArtifacts.push(
                await this.copyArtifactToTemp({
                  name: 'Mutation Report: Student-Written Tests on Instructor Implementation',
                  path: coverageReportDir,
                  data: {
                    format: 'zip',
                    display: 'html_site'
                  }
                })
              )
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error'
          this.logger.log('visible', 'Error running mutation tests: ' + msg)
        }
      }
    }
    let studentTestAdvice: string | undefined
    let studentImplMutantResults: MutantResult[] | undefined
    let studentImplMutantFailureAdvice: string | undefined
    if (
      (this.config.build.student_tests?.student_impl?.report_branch_coverage ||
        this.config.build.student_tests?.student_impl?.run_tests ||
        this.config.build.student_tests?.student_impl?.run_mutation ||
        this.config.build.student_tests?.student_impl
          ?.report_mutation_coverage) &&
      this.config.submissionFiles.testFiles.length > 0
    ) {
      this.logger.log(
        'visible',
        'Running student tests against student implementation'
      )
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

        // Run mutation testing on student implementation if enabled
        if (
          this.config.build.student_tests?.student_impl?.run_mutation &&
          studentTestResults &&
          studentTestResults.every((result) => result.status === 'pass')
        ) {
          this.logger.log(
            'visible',
            'Running mutation tests on student implementation'
          )
          try {
            studentImplMutantResults = await this.builder.mutationTest({
              timeoutSeconds:
                this.config.build.timeouts_seconds?.mutants ||
                DEFAULT_TIMEOUTS.mutants
            })
            if (
              this.config.build.student_tests?.student_impl
                ?.report_mutation_coverage
            ) {
              const mutationCoverageReportDir =
                this.builder.getMutationCoverageReportDir()
              if (mutationCoverageReportDir) {
                expectedArtifacts.push(
                  await this.copyArtifactToTemp({
                    name: 'Mutation Report: Student-Written Tests on Student Implementation',
                    path: mutationCoverageReportDir,
                    data: {
                      format: 'zip',
                      display: 'html_site'
                    }
                  })
                )
              }
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unknown error'
            this.logger.log(
              'visible',
              'Error running mutation tests on student implementation: ' + msg
            )
            studentImplMutantFailureAdvice =
              'Error running mutation tests on student implementation. Please see overall output for more details.'
          }
        } else if (
          this.config.build.student_tests?.student_impl?.run_mutation &&
          studentTestResults &&
          studentTestResults.some((result) => result.status === 'fail')
        ) {
          studentImplMutantFailureAdvice =
            'Mutation testing was not run because some student tests failed against the student implementation.'
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        studentTestAdvice = 'Your tests failed to compile. ' + msg
        this.logger.log('visible', msg)
      }
    }
    this.logger.log('visible', 'Wrapping up')

    // First pass: grade all units (without dependency checks) to calculate scores
    const unitScores = new Map<string, { score: number; maxScore: number }>()
    const unitFeedbacksMap = new Map<string, AutograderTestFeedback>()

    for (const part of gradedParts) {
      for (const unit of part.gradedUnits) {
        const feedbacks = this.gradeGradedUnit(
          unit,
          part,
          testResults,
          mutantResults,
          mutantError
        )
        // Each unit produces one feedback item
        const feedback = feedbacks[0]
        if (feedback) {
          feedback.part = part.name
          unitFeedbacksMap.set(unit.name, feedback)
          unitScores.set(unit.name, {
            score: feedback.score ?? 0,
            maxScore: feedback.max_score ?? 0
          })
        }
      }
    }

    // Calculate part scores from unit scores
    const partScores = new Map<string, { score: number; maxScore: number }>()
    for (const part of gradedParts) {
      let totalScore = 0
      let totalMaxScore = 0
      for (const unit of part.gradedUnits) {
        const unitScore = unitScores.get(unit.name)
        if (unitScore) {
          totalScore += unitScore.score
          totalMaxScore += unitScore.maxScore
        }
      }
      partScores.set(part.name, { score: totalScore, maxScore: totalMaxScore })
    }

    // Second pass: apply dependency checks for parts and units
    const testFeedbacks: AutograderTestFeedback[] = []
    for (const part of gradedParts) {
      // Check part-level dependencies first
      const { satisfied: partSatisfied, unmetDependencies: partUnmet } =
        this.checkDependencies(part.dependencies, partScores, unitScores)

      if (!partSatisfied) {
        // Part dependencies not met - show single message for entire part
        testFeedbacks.push(
          ...this.createPartDependencyNotMetFeedback(part, partUnmet)
        )
      } else {
        // Part dependencies satisfied - check each unit's dependencies
        for (const unit of part.gradedUnits) {
          const { satisfied: unitSatisfied, unmetDependencies: unitUnmet } =
            this.checkDependencies(unit.dependencies, partScores, unitScores)

          if (unitSatisfied) {
            // Unit dependencies satisfied - use original feedback
            const feedback = unitFeedbacksMap.get(unit.name)
            if (feedback) {
              testFeedbacks.push(feedback)
            }
          } else {
            // Unit dependencies not met - replace with dependency message
            testFeedbacks.push(
              this.createUnitDependencyNotMetFeedback(unit, part, unitUnmet)
            )
          }
        }
      }
    }

    if (this.logger.isVerboseDebug) {
      console.log('DEBUG: Test results')
      console.log(JSON.stringify(testFeedbacks, null, 2))
    }

    //Future graders might want to dynamically generate some artifacts, this would be the place to add them to the feedback

    if (
      this.config.build.student_tests?.instructor_impl?.report_mutation_coverage
    ) {
      let studentMutationOutput =
        'Please refer to your assignment instructions for the specifications of how (if at all) your tests will be graded. These results are purely informational: '
      if (mutantError) {
        studentMutationOutput = `**${mutantError.reason}**\n\n${mutantError.details}`
      }
      if (mutantResults) {
        const mutantsDetected = mutantResults
          .filter((mr) => mr.status === 'pass')
          .map((mr) => {
            const shortName = mr.shortName ?? mr.name
            return `* ${shortName} (${mr.prompt ?? 'No prompt provided for this bug :( '})\n\t * Detected by: ${mr.tests.join(', ')}`
          })
        const mutantsNotDetected = mutantResults
          .filter((mr) => mr.status === 'fail')
          .map((mr) => {
            const shortName = mr.shortName ?? mr.name
            return `* **${shortName}** (${mr.prompt ?? 'No prompt provided for this bug :( '})`
          })
        studentMutationOutput += `Faults detected(${mutantsDetected.length}):\n`
        studentMutationOutput += `${mutantsDetected.join('\n')}\n\n`
        studentMutationOutput += `Faults not detected(${mutantsNotDetected.length}):\n`
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
    if (
      this.config.build.student_tests?.student_impl?.report_mutation_coverage
    ) {
      let studentImplMutationOutput =
        'Please refer to your assignment instructions for the specifications of how (if at all) your tests will be graded. These results are purely informational: '
      if (studentImplMutantFailureAdvice) {
        studentImplMutationOutput = studentImplMutantFailureAdvice
      }
      if (studentImplMutantResults) {
        const getMutantPrompt = (mr: MutantResult) => {
          return mr.prompt ?? 'No prompt provided for this bug :( '
        }

        const mutantsDetected = studentImplMutantResults
          .filter((mr) => mr.status === 'pass')
          .map((mr) => {
            const prompt = getMutantPrompt(mr)
            const shortName = mr.shortName ?? mr.name
            return `* ${shortName} (${prompt})\n\t * Detected by: ${mr.tests.join(', ')}`
          })
        const mutantsNotDetected = studentImplMutantResults
          .filter((mr) => mr.status === 'fail')
          .map((mr) => {
            const prompt = getMutantPrompt(mr)
            return `* **${mr.name}** (${prompt})`
          })
        studentImplMutationOutput += `Faults detected: ${mutantsDetected.length}:\n`
        studentImplMutationOutput += `${mutantsDetected.join('\n')}\n\n`
        studentImplMutationOutput += `Faults not detected: ${mutantsNotDetected.length}:\n`
        studentImplMutationOutput += `${mutantsNotDetected.join('\n')}`
      }
      this.logger.log('hidden', studentImplMutationOutput)
      testFeedbacks.push({
        name: 'Student Implementation Fault Coverage Report',
        output: studentImplMutationOutput,
        output_format: 'markdown',
        score: 0,
        max_score: 0,
        part: 'Student Implementation Tests'
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
      const coverageReportDir = this.builder.getCoverageReportDir()
      if (coverageReportDir) {
        try {
          expectedArtifacts.push(
            await this.copyArtifactToTemp({
              name: 'Coverage Report: Student-Written Tests on Student Implementation',
              path: coverageReportDir,
              data: {
                format: 'zip',
                display: 'html_site'
              }
            })
          )
        } catch (err) {
          this.logger.log(
            'visible',
            `Error copying coverage report: ${err instanceof Error ? err.message : 'Unknown error'}`
          )
          this.logger.log(
            'visible',
            `Coverage report will not be available for this submission.`
          )
        }
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
          const artifactPath = artifact.path.startsWith('/')
            ? artifact.path
            : path.join(this.gradingDir, artifact.path)
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
