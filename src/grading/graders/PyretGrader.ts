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
      const env = {
        ...process.env,
        PA_CURRENT_LOAD_PATH: this.submissionDir,
        PWD: this.submissionDir
      }

      const child = spawn(
        process.execPath,
        [process.env.PYRET_MAIN_PATH ?? 'pyret/main.cjs'],
        {
          env,
          cwd: this.submissionDir,
          //     [ stdin, stdout, stderr, custom]
          stdio: ['pipe', 'pipe', 'pipe', 'pipe']
        }
      )

      console.log('grader started')

      for (const [stream, target, name] of [
        [child.stdout, process.stdout, `stdout`],
        [child.stderr, process.stderr, `stderr`]
      ] as const) {
        const prefix = `${name} » `
        let leftover = ''
        stream.setEncoding('utf8')
        stream.on('data', (chunk) => {
          const lines = (leftover + chunk).split(/\n/)
          leftover = lines.pop()!
          for (const line of lines) target.write(`${prefix}${line}\n`)
        })
        stream.on('end', () => {
          if (leftover) target.write(`${prefix}${leftover}\n`)
        })
      }

      const fd3 = child.stdio[3] as NodeJS.ReadableStream
      let output = ''
      fd3.setEncoding('utf8')
      fd3.on('data', (chunk: string) => (output += chunk))

      child.on('close', (code) => {
        console.log('grader ended')
        if (code !== 0) {
          return reject(new Error(`Grader failed with code ${code}.`))
        }
        try {
          resolve(JSON.parse(output))
        } catch (e) {
          reject(new Error(`Invalid JSON from grader: ${output}\n${e}`))
        }
      })

      child.stdin.write(JSON.stringify(spec))
      child.stdin.end()
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
