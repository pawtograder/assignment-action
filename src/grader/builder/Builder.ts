import { exec } from '@actions/exec'
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
    ignoreFailures = false
  ): Promise<{ returnCode: number; output: string }> {
    let myOutput = ''
    let myError = ''
    try {
      logger.log('hidden', `Running ${command} ${args.join(' ')}`)
      const returnCode = await exec(command, args, {
        cwd: this.gradingDir,
        silent: true,
        listeners: {
          stdout: (data: Buffer) => {
            myOutput += data.toString()
            if (this.regressionTestJob) {
              console.log(`CIDebug: ${myOutput}`)
            }
          },
          stderr: (data: Buffer) => {
            myError += data.toString()
            if (this.regressionTestJob) {
              console.log(`CIDebug: ${myError}`)
            }
          }
        },
        ignoreReturnCode: ignoreFailures
      })
      myOutput += myError
      logger.log('hidden', `${myOutput}`)
      logger.log('hidden', `Return code: ${returnCode}`)
      return { returnCode, output: myOutput }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
      logger.log(
        'visible',
        `Command ${command} failed unexpectedly with output:\n${myOutput + myError}`
      )
      throw new Error(`Command failed with output:\n${myOutput}`)
    }
  }

  abstract lint(): Promise<LintResult>
  abstract test(): Promise<TestResult[]>
  abstract mutationTest(): Promise<MutantResult[]>
  abstract buildClean(): Promise<void>
}
