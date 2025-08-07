import { spawn } from 'child_process'
import { AutograderFeedback } from '../../api/adminServiceSchemas.js'
import { Grader } from './Grader.js'
import { PyretPawtograderConfig } from '../types.js'
import { Spec, z } from 'pyret-autograder-pawtograder'
import { inspect } from 'util'

export class PyretGrader extends Grader<PyretPawtograderConfig> {
  constructor(
    solutionDir: string,
    submissionDir: string,
    config: PyretPawtograderConfig,
    regressionTestJob?: number
  ) {
    super(solutionDir, submissionDir, config, regressionTestJob)
  }

  async resolveSpec() {
    const parseRes = Spec.safeParse({
      solution_dir: this.solutionDir,
      submission_dir: this.submissionDir,
      config: this.config
    })

    if (parseRes.success) {
      return parseRes.data
    } else {
      const pretty = z.prettifyError(parseRes.error)
      const err = `Invalid specification provided:\n${pretty}\n\nSee the cause field for the full error.`

      throw new Error(err, { cause: parseRes.error })
    }
  }

  async tryGrade(): Promise<AutograderFeedback> {
    const spec = await this.resolveSpec()

    return new Promise((resolve, reject) => {
      const grader = spawn('node', ['pyret/main.cjs'])
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
        const outputTail = output.trim().split('\n').at(-1)!
        try {
          resolve(JSON.parse(outputTail))
        } catch (e) {
          reject(new Error(`Invalid JSON from grader: ${outputTail}\n${e}`))
        }
      })

      grader.stdin.write(JSON.stringify(spec))
      grader.stdin.end()
    })
  }

  override async grade(): Promise<AutograderFeedback> {
    try {
      return await this.tryGrade()
    } catch (e) {
      const studentMessage =
        'A fatal internal autograder error occurred, please report this to course staff.'
      return {
        tests: [],
        lint: {
          output: studentMessage,
          status: 'fail'
        },
        output: {
          visible: {
            output: studentMessage
          },
          hidden: {
            output: inspect(e)
          }
        }
      }
    }
  }
}
