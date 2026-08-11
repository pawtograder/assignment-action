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

export class NonRetriableError extends Error {
  constructor(message: string, cause?: Error) {
    super(message)
    this.name = 'Error'
    this.cause = cause
  }
}

/**
 * Non-5xx statuses that still represent a transient condition worth retrying.
 * Everything else in the 4xx range (bad token, bad payload) is the client's
 * fault and will fail identically on every attempt.
 */
const RETRIABLE_STATUS = new Set([408, 425, 429])

type ApiError = { message: string; recoverable: boolean; details: string }

/**
 * Turn a fetch Response into a typed API payload, or throw.
 *
 * The gateway in front of the grading API returns its own errors as JSON that
 * does not carry an `error` field (e.g. a 502 body of
 * `{"msg":"internal edge function error"}` when an edge function pod is
 * killed mid-request). Inferring failure from the body alone therefore reads a
 * gateway error as a successful, empty response. The HTTP status is checked
 * first so those surface as retriable errors instead.
 *
 * @param response The raw fetch response.
 * @param what Human-readable prefix for error messages, e.g. 'Failed to submit
 *   feedback'.
 * @returns The parsed body.
 */
async function parseApiResponse<T extends { error?: ApiError }>(
  response: Response,
  what: string
): Promise<T> {
  // Read the body once, as text: a non-2xx response is frequently HTML or an
  // empty body, and response.json() would throw a SyntaxError whose message
  // hides the status that actually explains the failure.
  const text = await response.text()

  if (!response.ok) {
    const message = `${what}: HTTP ${response.status} ${response.statusText} ${text.slice(0, 500)}`
    if (response.status >= 500 || RETRIABLE_STATUS.has(response.status)) {
      throw new Error(message)
    }
    throw new NonRetriableError(message)
  }

  let resp: T
  try {
    resp = JSON.parse(text) as T
  } catch {
    throw new Error(
      `${what}: HTTP ${response.status} returned a non-JSON body: ${text.slice(0, 500)}`
    )
  }

  if (resp.error) {
    const message = `${what}: ${resp.error.message} ${resp.error.details}`
    if (!resp.error.recoverable) {
      throw new NonRetriableError(message)
    }
    throw new Error(message)
  }
  return resp
}

export async function retryWithExponentialBackoff<T>(
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

      // If the error is non-retriable, throw it immediately
      if (lastError instanceof NonRetriableError) {
        throw lastError
      }

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
    return parseApiResponse<GradeResponse>(
      response,
      'Failed to submit feedback'
    )
  })
}

export async function createSubmission(token: string) {
  const gradingServerURL = getInput('grading_server')

  return retryWithExponentialBackoff(async () => {
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
    return parseApiResponse<SubmissionResponse>(
      response,
      'Failed to create submission'
    )
  })
}

export async function createRegressionTestRun(
  token: string,
  regression_test_id: number
) {
  const gradingServerURL = getInput('grading_server')

  return retryWithExponentialBackoff(async () => {
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
    return parseApiResponse<RegressionTestRunResponse>(
      response,
      'Failed to create regression test run'
    )
  })
}
