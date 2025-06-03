import { spawn } from 'child_process'
import { AutograderFeedback } from '../../api/adminServiceSchemas.js'
import { Grader } from './Grader.js'
import { PyretPawtograderConfig } from '../types.js'

export class PyretGrader extends Grader<PyretPawtograderConfig> {
  constructor(
    solutionDir: string,
    submissionDir: string,
    config: PyretPawtograderConfig,
    regressionTestJob?: number
  ) {
    super(solutionDir, submissionDir, config, regressionTestJob)
  }

  override async grade(): Promise<AutograderFeedback> {
    // TODO: provide grading & submission dirs
    const inputJson = JSON.stringify(this.config)

    return new Promise((resolve, reject) => {
      // FIXME: pyret path, double check pwd, args, etc
      const grader = spawn('npx', [
        'pyret',
        '--builtin-js-dir',
        'node_modules/pyret-autograder/pyret/src/js/trove/',
        '-p',
        'pyret/grader.arr',
        '-o',
        'pyret/grader.cjs',
        '-q' // this is important
      ])
      let output = ''
      let error = ''

      grader.stdout.on('data', (data) => (output += data.toString()))
      grader.stderr.on('data', (data) => (error += data.toString()))

      grader.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error(`Grader failed: ${error}`))
        }
        try {
          resolve(JSON.parse(output))
        } catch (e) {
          reject(new Error(`Invalid JSON from grader: ${output}`))
        }
      })

      grader.stdin.write(JSON.stringify(inputJson))
      grader.stdin.end()
    })
  }
}
