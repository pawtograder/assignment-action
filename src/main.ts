import * as core from '@actions/core'
import { SummaryTableRow } from '@actions/core/lib/summary.js'
import { exec } from '@actions/exec'
import { createWriteStream } from 'fs'
import { mkdir, rename } from 'fs/promises'
import { Readable } from 'stream'
import { finished } from 'stream/promises'
import {
  createRegressionTestRun,
  createSubmission,
  submitFeedback
} from './api/adminServiceComponents.js'
import grade from './grader/Grader.js'

async function downloadTarballAndExtractTo(url: string, dir: string) {
  const file = await fetch(url)
  if (!file.body) {
    throw new Error('No body in response')
  }
  const fileStream = createWriteStream('archive.tgz')
  await finished(Readable.fromWeb(file.body).pipe(fileStream))
  await mkdir(dir)
  await exec('tar', [
    'xzf',
    'archive.tgz',
    '-C',
    dir,
    '--strip-components',
    '1'
  ])
}
async function prepareForGrading(
  graderConfig: Awaited<ReturnType<typeof createSubmission>>
) {
  await downloadTarballAndExtractTo(graderConfig.grader_url, `grader`)
  const workDir = process.env.GITHUB_WORKSPACE

  //Run the autograder
  const assignmentDir = `${workDir}/submission`
  const graderDir = `${workDir}/grader`
  return { assignmentDir, graderDir }
}
async function prepareForRegressionTest(
  graderConfig: Awaited<ReturnType<typeof createRegressionTestRun>>
) {
  await rename(`submission`, `grader`)
  await downloadTarballAndExtractTo(
    graderConfig.regression_test_url,
    `submission`
  )
  const workDir = process.env.GITHUB_WORKSPACE
  const assignmentDir = `${workDir}/submission`
  const graderDir = `${workDir}/grader`
  return { assignmentDir, graderDir }
}
async function generateSummaryReport(
  results: Awaited<ReturnType<typeof grade>>,
  gradeResponse: Awaited<ReturnType<typeof submitFeedback>>
) {
  const score =
    results.score ||
    results.tests.reduce((acc, test) => acc + (test.score || 0), 0)
  const max_score =
    results.score ||
    results.tests.reduce((acc, test) => acc + (test.max_score || 0), 0)

  // Set job summary with test results
  core.summary.addHeading('Autograder Results')
  core.summary.addRaw(`Score: ${score}/${max_score}`, true)
  core.summary.addLink(
    'View the complete results with all details and logs in Pawtograder',
    gradeResponse.details_url
  )
  if (results.output.visible?.output) {
    core.summary.addDetails('Grader Output', results.output.visible.output)
  }
  core.summary.addHeading('Lint Results', 2)
  core.summary.addRaw(`Status: ${results.lint.status === 'pass' ? '✅' : '❌'}`)
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
  }
  await core.summary.write()
  if (score == 0) {
    core.error('Score: 0')
  } else if (score != max_score) {
    core.warning(`Score: ${score}/${max_score}`)
  } else {
    core.notice(`🚀 Score: ${score}/${max_score} `)
  }
}
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
    const regressionTestJob = await core.getInput('regression_test_job')
    if (regressionTestJob) {
      core.info(
        `Running regression test for ${regressionTestJob} on ${process.env.GITHUB_REPOSITORY}`
      )
    }

    if (handout && handout === process.env.GITHUB_REPOSITORY) {
      core.warning(
        'This action appears to have been triggered by running in the handout repo. No submission has been created, and it will not be graded.'
      )
      return
    }

    let graderSha, graderDir, assignmentDir: string
    if (regressionTestJob) {
      const graderConfig = await createRegressionTestRun({
        headers: {
          Authorization: token
        },
        pathParams: {
          regressionTestId: Number(regressionTestJob)
        }
      })
      const config = await prepareForRegressionTest(graderConfig)
      graderDir = config.graderDir
      assignmentDir = config.assignmentDir
      graderSha = process.env.GITHUB_SHA!
    } else {
      const graderConfig = await createSubmission({
        headers: {
          Authorization: token
        }
      })
      const config = await prepareForGrading(graderConfig)
      graderDir = config.graderDir
      assignmentDir = config.assignmentDir
      graderSha = graderConfig.grader_sha
    }

    const start = Date.now()
    try {
      const results = await grade(
        graderDir,
        assignmentDir,
        regressionTestJob ? Number.parseInt(regressionTestJob) : undefined
      )
      const gradeResponse = await submitFeedback({
        body: {
          ret_code: 0,
          output: '',
          execution_time: Date.now() - start,
          feedback: results,
          grader_sha: graderSha
        },
        queryParams: {
          autograder_regression_test_id: regressionTestJob
            ? Number.parseInt(regressionTestJob)
            : undefined
        },
        headers: {
          Authorization: token
        }
      })
      await generateSummaryReport(results, gradeResponse)
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
