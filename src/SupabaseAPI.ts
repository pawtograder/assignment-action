import {
  GradeResponse,
  GradingScriptResult,
  RegressionTestRunResponse,
  SubmissionResponse
} from './api/adminServiceSchemas.js'
import { getEnv } from './utils.js'

export async function submitFeedback(
  body: GradingScriptResult,
  token: string,
  queryParams?: {
    autograder_regression_test_id?: number
  }
): Promise<GradeResponse> {
  const gradingServerURL = getEnv('GRADING_SERVER', true)
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
  const resp = (await response.json()) as GradeResponse
  if (resp.error) {
    throw new Error(
      `Failed to submit feedback: ${resp.error.message} ${resp.error.details}`
    )
  }
  return resp
}

export async function createSubmission(token: string) {
  const gradingServerURL = getEnv('GRADING_SERVER', true)
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
  const resp = (await response.json()) as SubmissionResponse
  if (resp.error) {
    throw new Error(
      `Failed to create submission: ${resp.error.message} ${resp.error.details}`
    )
  }

  return resp
}

export async function createRegressionTestRun(
  token: string,
  regression_test_id: number
) {
  const gradingServerURL = getEnv('GRADING_SERVER', true)
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
  const resp = (await response.json()) as RegressionTestRunResponse
  if (resp.error) {
    throw new Error(
      `Failed to create regression test run: ${resp.error.message} ${resp.error.details}`
    )
  }
  return resp
}
