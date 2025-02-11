import { exec } from '@actions/exec'
import Logger from '../Logger.js'
import { OutputFormat } from '../types.js'

export type LintResult = {
  name: string
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
    protected gradingDir: string
  ) {}
  async executeCommandAndGetOutput(
    command: string,
    args: string[],
    logger: Logger,
    ignoreFailures = false
  ): Promise<string> {
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
          },
          stderr: (data: Buffer) => {
            myError += data.toString()
          }
        },
        ignoreReturnCode: ignoreFailures
      })
      myOutput += myError
      logger.log('hidden', `${myOutput}`)
      logger.log('hidden', `Return code: ${returnCode}`)
      return myOutput
    } catch (_err) {
      logger.log(
        'visible',
        `Command ${command} failed unexpectedly with output:\n${myOutput + myError}`
      )
      console.error(_err)
      throw new Error(`Command failed with output:\n${myOutput + myError}`)
    }
  }

  abstract lint(): Promise<LintResult>
  abstract test(): Promise<TestResult[]>
  abstract mutationTest(): Promise<MutantResult[]>
  abstract buildClean(): Promise<void>
}
