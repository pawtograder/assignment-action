import * as core from '@actions/core'
import { exec } from '@actions/exec'
import { createHash } from 'crypto'
import { createWriteStream } from 'fs'
import { mkdir, readFile } from 'fs/promises'
import { Readable } from 'stream'
import { finished } from 'stream/promises'
import {
  createSubmission,
  submitFeedback
} from './api/adminServiceComponents.js'
import grade from './grader/Grader.js'
import { SummaryTableRow } from '@actions/core/lib/summary.js'
/**
 * The main function for the action.
 *
 * @returns Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    //Get an OIDC token
    const token = await core.getIDToken()
    if (!token) {
      throw new Error(
        'Unable to get OIDC token. Is workflow permission configured correctly?'
      )
    }
    //Double check: is this the handout? If so, ignore the rest of the action and just log a warning
    const handout = await core.getInput('handout_repo')
    if (handout && handout === process.env.GITHUB_REPOSITORY) {
      core.warning(
        'This action appears to have been triggered by running in the handout repo. No submission has been created, and it will not be graded.'
      )
      return
    }
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
    const fileStream = createWriteStream('grader.tgz')
    await finished(Readable.fromWeb(file.body).pipe(fileStream))
    //Calculate the sha256 hash of the file
    const hash = createHash('sha256')
    const fileContents = await readFile('grader.tgz')
    hash.update(fileContents)
    const graderSha = hash.digest('hex')
    //Unzip the file to the directory "grader"
    await mkdir('grader')
    await exec('tar', [
      'xzf',
      'grader.tgz',
      '-C',
      'grader',
      '--strip-components',
      '1'
    ])
    const workDir = process.env.GITHUB_WORKSPACE

    //Run the autograder
    const assignmentDir = `${workDir}/submission`
    const graderDir = `${workDir}/grader`
    const start = Date.now()
    try {
      const results = await grade(assignmentDir, graderDir)
      const gradeResponse = await submitFeedback({
        body: {
          ret_code: 0,
          output: '',
          execution_time: Date.now() - start,
          feedback: results,
          grader_sha: graderSha
        },
        headers: {
          Authorization: token
        }
      })
      const score =
        results.score ||
        results.tests.reduce((acc, test) => acc + (test.score || 0), 0)
      const max_score =
        results.score ||
        results.tests.reduce((acc, test) => acc + (test.max_score || 0), 0)

      // Set job summary with test results
      core.summary.addHeading('Autograder Results')
      core.summary.addRaw(`**Score**: ${score}/${max_score}`)
      core.summary.addLink(
        'View the complete results',
        gradeResponse.details_url
      )
      if (results.output.visible?.output) {
        core.summary.addDetails('Grader Output', results.output.visible.output)
      }
      core.summary.addHeading('Lint Results', 2)
      core.summary.addRaw(
        `**Status**: ${results.lint.status === 'pass' ? '✅' : '❌'}`
      )
      core.summary.addDetails('Lint Output', results.lint.output)
      if (results.tests.length > 0) {
        core.summary.addHeading('Test Results', 2)
        core.summary.addHeading('Summary', 3)
        const rows: SummaryTableRow[] = []
        rows.push([
          { data: 'Status', header: true },
          { data: 'Name', header: true },
          { data: 'Score', header: true }
        ])
        let lastPart = undefined
        for (const test of results.tests) {
          const icon = test.score === test.max_score ? '✅' : '❌'
          if (test.part !== lastPart && test.part) {
            lastPart = test.part
            rows.push([{ data: test.part, colspan: '3' }])
          }
          rows.push([icon, test.name, `${test.score}/${test.max_score}`])
        }
        core.summary.addTable(rows)
        core.summary.addHeading('Test Details', 3)
        for (const test of results.tests) {
          if (test.output) {
            const icon = test.score === test.max_score ? '✅' : '❌'
            core.summary.addDetails(icon + test.name, test.output)
          }
        }
      }
      await core.summary.write()

      if (score != max_score) {
        core.setFailed(`Partial score: ${score}/${max_score}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        await submitFeedback({
          body: {
            ret_code: 1,
            output: `${error.message}`,
            execution_time: Date.now() - start,
            grader_sha: graderSha,
            feedback: {
              output: {},
              tests: [],
              lint: {
                output: 'Unknown error',
                status: 'fail'
              }
            }
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
    core.setFailed(`An error occurred: ${error}`)
  }
}
