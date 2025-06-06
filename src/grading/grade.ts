import * as io from '@actions/io'
import { readFile } from 'fs/promises'
import path from 'path'
import yaml from 'yaml'
import { AutograderFeedback } from '../api/adminServiceSchemas.js'
import { PawtograderConfig } from './types.js'
import { OverlayGrader } from './graders/OverlayGrader.js'
import { PyretGrader } from './graders/PyretGrader.js'

export async function makeGrader(
  config: PawtograderConfig,
  solutionDir: string,
  submissionDir: string,
  regressionTestJob?: number
) {
  switch (config.grader) {
    case 'overlay': {
      const gradingDir = path.join(process.cwd(), 'pawtograder-grading')
      await io.mkdirP(gradingDir)
      return new OverlayGrader(
        solutionDir,
        submissionDir,
        config,
        gradingDir,
        regressionTestJob
      )
    }
    case 'pyret':
      return new PyretGrader(
        solutionDir,
        submissionDir,
        config,
        regressionTestJob
      )
    default: {
      throw new Error(
        `Unknown grader ${(config satisfies never as any).grader}`
      )
    }
  }
}

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

  const grader = await makeGrader(
    config,
    solutionDir,
    submissionDir,
    regressionTestJob
  )
  const ret = await grader.grade()

  return ret
}
