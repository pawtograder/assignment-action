import {
  GradeResponse,
  GradingScriptResult,
  RegressionTestRunResponse,
  SubmissionResponse
} from './api/adminServiceSchemas.js'
import { getInput } from '@actions/core'

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function retryWithExponentialBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 5,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error as Error

      if (attempt === maxRetries) {
        throw lastError
      }

      // Calculate delay with exponential backoff
      // For the last attempt (5th), ensure at least 30 seconds delay
      let delay = baseDelay * Math.pow(2, attempt - 1)
      if (attempt === maxRetries - 1) {
        delay = Math.max(delay, 30000) // Ensure at least 30 seconds before last try
      }

      console.log(
        `Attempt ${attempt} failed: ${lastError.message}. Retrying in ${delay}ms...`
      )
      await sleep(delay)
    }
  }

  throw lastError!
}
export async function submitFeedback(
  body: GradingScriptResult,
  token: string,
  queryParams?: {
    autograder_regression_test_id?: number
  }
): Promise<GradeResponse> {
  const gradingServerURL = getInput('grading_server')

  return retryWithExponentialBackoff(async () => {
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
  })
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
  const resp = (await response.json()) as RegressionTestRunResponse
  if (resp.error) {
    throw new Error(
      `Failed to create regression test run: ${resp.error.message} ${resp.error.details}`
    )
  }
  return resp
}
