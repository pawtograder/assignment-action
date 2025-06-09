import * as core from '@actions/core'
import { SummaryTableRow } from '@actions/core/lib/summary.js'
import { exec } from '@actions/exec'
import { createWriteStream, readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

import { mkdir, rename } from 'fs/promises'
import { stat } from 'fs/promises'
import { Readable } from 'stream'
import { finished } from 'stream/promises'
import {
  createRegressionTestRun,
  createSubmission,
  submitFeedback
} from './SupabaseAPI.js'
import grade from './grading/grade.js'

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
  gradeResponse: Awaited<ReturnType<typeof submitFeedback>>,
  regressionTestJob?: string
) {
  const score =
    results.score ||
    results.tests
      .filter((t) => !t.hide_until_released || regressionTestJob)
      .reduce((acc, test) => acc + (test.score || 0), 0)
  const max_score =
    results.score ||
    results.tests
      .filter((t) => !t.hide_until_released || regressionTestJob)
      .reduce((acc, test) => acc + (test.max_score || 0), 0)

  // Set job summary with test results
  core.summary.addHeading('Autograder Results')
  core.summary.addRaw(`Score: ${score}/${max_score}`, true)
  if (!regressionTestJob) {
    core.summary.addLink(
      'View the complete results with all details and logs in Pawtograder',
      gradeResponse.details_url
    )
  }
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
    for (const test of results.tests.filter(
      (t) => !t.hide_until_released || regressionTestJob
    )) {
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
  if (score == 0 && max_score) {
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

    const action_ref = core.getInput('action_ref')
    const action_repository = core.getInput('action_repository')
    if (!action_ref || !action_repository) {
      throw new Error('action_ref and action_repository must be set')
    }

    let graderSha, graderDir, assignmentDir: string
    if (regressionTestJob) {
      const graderConfig = await createRegressionTestRun(
        token,
        Number(regressionTestJob)
      )
      const config = await prepareForRegressionTest(graderConfig)
      graderDir = config.graderDir
      assignmentDir = config.assignmentDir
      graderSha = process.env.GITHUB_SHA!
    } else {
      const graderConfig = await createSubmission(token)
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
      const queryParams = regressionTestJob
        ? {
            autograder_regression_test_id: Number.parseInt(regressionTestJob)
          }
        : undefined
      const gradeResponse = await submitFeedback(
        {
          ret_code: 0,
          output: '',
          execution_time: Date.now() - start,
          feedback: results,
          grader_sha: graderSha,
          action_repository,
          action_ref
        },
        token,
        queryParams
      )
      //If there are artifacts, we need to upload them.
      if (results.artifacts && !regressionTestJob) {
        const supabase = createClient(
          gradeResponse.supabase_url,
          gradeResponse.supabase_anon_key
        )
        await Promise.all(
          results.artifacts.map(async (artifact) => {
            const artifactRemote = gradeResponse.artifacts?.find(
              (ra) => ra.name === artifact.name
            )
            if (artifactRemote) {
              //Check to see if it is a directory or a file
              const stats = await stat(artifact.path)
              let fileToUpload: Buffer

              if (stats.isDirectory()) {
                // Create a zip file for the directory
                const zipPath = `${artifact.path}.zip`
                await exec('zip', ['-r', zipPath, artifact.path])
                fileToUpload = readFileSync(zipPath)
              } else {
                fileToUpload = readFileSync(artifact.path)
              }

              const { error } = await supabase.storage
                .from('submission-artifacts')
                .uploadToSignedUrl(
                  artifactRemote.path,
                  artifactRemote.token,
                  fileToUpload
                )
              if (error) {
                console.error(error)
              }
            } else {
              console.error(
                `Artifact ${artifact.name} not found in gradeResponse`
              )
            }
          })
        )
      }
      await generateSummaryReport(results, gradeResponse, regressionTestJob)
      if (results.score === 0 && results.max_score) {
        core.setFailed(
          'Score for this submission is 0. Please check to be sure that it conforms with the assignment instructions.'
        )
      }
    } catch (error) {
      if (error instanceof Error) {
        core.setFailed(error.message)
        console.error(error)
        await submitFeedback(
          {
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
            },
            action_ref,
            action_repository
          },
          token
        )
      }
    }
  } catch (error) {
    // Fail the workflow run if an error occurs
    console.trace(error)
    core.setFailed(`An error occurred: ${error}`)
  }
}
