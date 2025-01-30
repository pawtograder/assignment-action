/* eslint-disable prettier/prettier */
import * as core from '@actions/core'
import { spawn } from 'child_process'
import { createWriteStream } from 'fs'
import { readFile } from 'fs/promises'
import { Readable } from 'stream'
import { finished } from 'stream/promises'
import { createCheckers } from 'ts-interface-checker'
import { Open as openZip } from 'unzipper'
import {
  createSubmission,
  submitFeedback
} from './api/adminServiceComponents.js'
import AutograderFeedback from './api/adminServiceSchemas-ti.js'

/**
 * The main function for the action.
 *
 * @returns Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    //Get an OIDC token
    const token = await core.getIDToken()
    const graderConfig = await createSubmission({
      headers: {
        Authorization: token
      }
    })
    // Download the autograder
    const file = await fetch(graderConfig.grader_url)
    //Save to disk
    if (!file.body) {
      throw new Error('No body in response')
    }
    const fileStream = createWriteStream('grader.zip')
    await finished(Readable.fromWeb(file.body).pipe(fileStream))
    fileStream.close()
    //unzip
    await (await openZip.file('grader.zip')).extract({ path: 'grader' })

    //Run the autograder
    const cwd = process.cwd()
    const assignmentDir = `${cwd}/submission`
    const graderDir = `${cwd}/grader`
    const resultsLocation = `${graderDir}/results.json`

    const childProcess = spawn('./run.sh', [assignmentDir, resultsLocation], {
      cwd: graderDir
    })
    let scriptOutput = ''

    childProcess.stdout.setEncoding('utf8')
    childProcess.stdout.on('data', function (data) {
      //Here is where the output goes

      console.log(data)
      data = data.toString()
      scriptOutput += data
    })

    childProcess.stderr.setEncoding('utf8')
    childProcess.stderr.on('data', function (data) {
      //Here is where the error output goes

      console.error(data)

      data = data.toString()
      scriptOutput += data
    })
    const start = Date.now()
    try {
      const retCode = await new Promise<number>((resolve, reject) => {
        childProcess.on('close', function (code) {
          if (code !== 0) {
            reject(new Error(`Process exited with code ${code}`))
          }
          resolve(0)
        })
        childProcess.on('error', function (err) {
          reject(err)
        })
      })

      const results = JSON.parse(await readFile(resultsLocation, 'utf8'))
      const checkers = createCheckers(AutograderFeedback)
      checkers.AutograderFeedback.check(results)

      await submitFeedback({
        body: {
          ...results,
          retCode,
          scriptOutput,
          execution_time: Date.now() - start
        },
        headers: {
          Authorization: token
        }
      })
    } catch (error) {
      if (error instanceof Error) {
        await submitFeedback({
          body: {
            retCode: 1,
            scriptOutput: `${error.message}\n${scriptOutput}`,
            execution_time: Date.now() - start,
            output: {},
            tests: []
          },
          headers: {
            Authorization: token
          }
        })
        core.setFailed(error.message)
        console.error(error)
      }
    }
  } catch (error) {
    // Fail the workflow run if an error occurs
    console.trace(error)
    if (error instanceof Error) core.setFailed(error.message)
  }
}
