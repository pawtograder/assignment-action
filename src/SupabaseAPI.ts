import {
  GradeResponse,
  GradingScriptResult,
  RegressionTestRunResponse,
  SubmissionResponse
} from './api/adminServiceSchemas.js'
import { getInput } from '@actions/core'
export async function submitFeedback(
  body: GradingScriptResult,
  token: string,
  queryParams?: {
    autograder_regression_test_id?: number
  }
): Promise<GradeResponse> {
  const gradingServerURL = getInput('grading_server')
  const response = await fetch(
    `${gradingServerURL}/functions/v1/autograder-submit-feedback${
      queryParams?.autograder_regression_test_id
        ? `?autograder_regression_test_id=${queryParams.autograder_regression_test_id}`
        : ''
    }`,
    {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `${token}`
      }
    }
  )
  if (!response.ok) {
    throw new Error(`Failed to submit feedback: ${response.statusText}`)
  }
  return response.json() as Promise<GradeResponse>
}

export async function createSubmission(token: string) {
  const gradingServerURL = getInput('grading_server')
  const response = await fetch(
    `${gradingServerURL}/functions/v1/autograder-create-submission`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `${token}`
      }
    }
  )
  if (!response.ok) {
    throw new Error(`Failed to create submission: ${response.statusText}`)
  }
  return response.json() as Promise<SubmissionResponse>
}

export async function createRegressionTestRun(
  token: string,
  regression_test_id: number
) {
  const gradingServerURL = getInput('grading_server')
  const response = await fetch(
    `${gradingServerURL}/functions/v1/autograder-create-regression-test-run/${regression_test_id}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `${token}`
      }
    }
  )
  if (!response.ok) {
    throw new Error(
      `Failed to create regression test run: ${response.statusText}`
    )
  }
  return response.json() as Promise<RegressionTestRunResponse>
}
