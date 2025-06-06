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
      const grader = spawn('npx', [
        'pyret',
        '--builtin-js-dir',
        'node_modules/pyret-autograder/pyret/src/js/trove/',
        '--program',
        'pyret/grader.arr',
        '--outfile',
        'pyret/grader.cjs',
        '--quiet',
        '--no-check-mode'
      ])
      let output = ''
      let error = ''
      console.log('pyret child spawned')

      grader.stdout.on('data', (data) => (output += data.toString()))
      grader.stderr.on('data', (data) => (error += data.toString()))

      grader.on('close', (code) => {
        console.log('pyret child closed')
        if (code !== 0) {
          return reject(new Error(`Grader failed: ${error}`))
        }
        try {
          resolve(JSON.parse(output))
        } catch (e) {
          reject(new Error(`Invalid JSON from grader: ${output}\n${e}`))
        }
      })

      grader.stdin.write(JSON.stringify(inputJson))
      grader.stdin.end()
    })
  }
}
