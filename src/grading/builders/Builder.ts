import { spawn } from 'child_process'
import Logger from '../Logger.js'
import { OutputFormat } from '../types.js'

export type LintResult = {
  status: 'pass' | 'fail'
  output: string
  output_format?: OutputFormat
}
export type TestResult = {
  name: string
  status: 'pass' | 'fail'
  output: string
  output_format?: OutputFormat
}
export type MutantResult = {
  name: string
  location: string
  status: 'pass' | 'fail'
  tests: string[]
  output: string
  output_format?: OutputFormat
}

export abstract class Builder {
  constructor(
    protected logger: Logger,
    protected gradingDir: string,
    protected regressionTestJob?: number
  ) {}
  async executeCommandAndGetOutput(
    command: string,
    args: string[],
    logger: Logger,
    timeoutSeconds?: number,
    ignoreFailures = false
  ): Promise<{ returnCode: number; output: string }> {
    let myOutput = ''
    let myError = ''

    const result = new Promise<{ returnCode: number; output: string }>(
      (resolve, reject) => {
        logger.log('hidden', `Running ${command} ${args.join(' ')}`)

        const child = spawn(command, args, {
          cwd: this.gradingDir,
          shell: true,
          detached: true
        })

        let timeoutId: NodeJS.Timeout | undefined
        if (timeoutSeconds) {
          timeoutId = setTimeout(() => {
            this.logger.log(
              'visible',
              `ERROR: Command timed out after ${timeoutSeconds} seconds`
            )
            child.kill()
          }, timeoutSeconds * 1000)
        }

        child.stdout.on('data', (data: Buffer) => {
          const output = data.toString()
          myOutput += output
          if (this.regressionTestJob) {
            console.log(`CIDebug: ${output}`)
          }
        })

        child.stderr.on('data', (data: Buffer) => {
          const error = data.toString()
          myError += error
          if (this.regressionTestJob) {
            console.log(`CIDebug: ${error}`)
          }
        })

        child.on('close', (code) => {
          if (timeoutId) {
            clearTimeout(timeoutId)
          }
          const returnCode = code ?? 1
          myOutput += myError
          logger.log('hidden', `${myOutput}`)
          logger.log('hidden', `Return code: ${returnCode}`)

          if (returnCode === 143) {
            reject(
              new Error(
                `${myOutput}\n\nCommand timed out after ${timeoutSeconds} seconds`
              )
            )
          } else if (returnCode !== 0 && !ignoreFailures) {
            logger.log(
              'visible',
              `Command ${command} failed unexpectedly with output:\n${myOutput}`
            )
            reject(new Error(`Command failed with output:\n${myOutput}`))
          } else {
            resolve({ returnCode, output: myOutput })
          }
        })

        child.on('error', (err: NodeJS.ErrnoException) => {
          if (err.code === 'ETIMEDOUT') {
            reject(
              new Error(`Command timed out after ${timeoutSeconds} seconds`)
            )
          } else {
            reject(err)
          }
        })
      }
    )
    return await result
  }

  abstract lint(): Promise<LintResult>
  abstract test(options: BuildStepOptions): Promise<TestResult[]>
  abstract mutationTest(options: BuildStepOptions): Promise<MutantResult[]>
  abstract buildClean(options: BuildStepOptions): Promise<void>
  abstract getCoverageReport(): Promise<string>
  abstract getCoverageReportDir(): string | null
}

export type BuildStepOptions = {
  timeoutSeconds?: number
}
