/**
 * Unit tests for src/SupabaseAPI.ts.
 *
 * The regression these cover: the grading API sits behind a gateway that
 * returns its own errors as JSON without an `error` field. Deciding success by
 * looking for that field alone made a 502 read as a successful, empty
 * response.
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'

jest.unstable_mockModule('@actions/core', () => core)

const { submitFeedback, createSubmission, NonRetriableError } = await import(
  '../src/SupabaseAPI.js'
)

const GRADING_SERVER = 'https://api.example.test'

const FEEDBACK = {
  ret_code: 0,
  output: '',
  execution_time: 1,
  grader_sha: 'abc123',
  action_ref: 'v4',
  action_repository: 'pawtograder/assignment-action',
  feedback: {
    output: {},
    tests: [],
    lint: { output: '', status: 'pass' as const }
  }
}

/**
 * Builds a Response-alike. Both text() and json() are implemented so these
 * tests describe behaviour rather than which one the implementation happens to
 * call.
 */
function response(status: number, body: string, statusText = ''): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    text: async () => body,
    json: async () => JSON.parse(body)
  } as Response
}

const fetchMock = jest.fn<typeof globalThis.fetch>()

beforeEach(() => {
  jest.useFakeTimers()
  fetchMock.mockReset()
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch
  core.getInput.mockImplementation((name: string) =>
    name === 'grading_server' ? GRADING_SERVER : ''
  )
})

afterEach(() => {
  jest.useRealTimers()
})

/**
 * Runs a promise that sleeps between retries to completion under fake timers.
 *
 * The backoff schedule is 1s, 2s, 4s, then at least 30s, so real timers would
 * make these tests take ~37 seconds.
 */
async function settle<T>(promise: Promise<T>): Promise<T> {
  const result = promise.then(
    (value) => ({ ok: true as const, value }),
    (error) => ({ ok: false as const, error })
  )
  // Comfortably longer than the whole 5-attempt schedule.
  await jest.advanceTimersByTimeAsync(120_000)
  const settled = await result
  if (settled.ok) return settled.value
  throw settled.error
}

describe('submitFeedback', () => {
  it('does not treat a gateway 502 with a JSON body as success', async () => {
    // This is the exact body observed in production from the gateway.
    fetchMock.mockResolvedValue(
      response(502, '{"msg":"internal edge function error"}', 'Bad Gateway')
    )

    await expect(settle(submitFeedback(FEEDBACK, 'token'))).rejects.toThrow(
      /502/
    )
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it('retries a 502 and returns the result once the server recovers', async () => {
    fetchMock
      .mockResolvedValueOnce(
        response(502, '{"msg":"internal edge function error"}', 'Bad Gateway')
      )
      .mockResolvedValueOnce(response(503, '', 'Service Unavailable'))
      .mockResolvedValueOnce(
        response(200, JSON.stringify({ details_url: '/here', is_ok: true }))
      )

    const result = await settle(submitFeedback(FEEDBACK, 'token'))

    expect(result.details_url).toBe('/here')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('reports the status when the error body is not JSON', async () => {
    fetchMock.mockResolvedValue(
      response(502, '<html><body>502 Bad Gateway</body></html>', 'Bad Gateway')
    )

    await expect(settle(submitFeedback(FEEDBACK, 'token'))).rejects.toThrow(
      /HTTP 502 Bad Gateway/
    )
  })

  it('does not retry a 4xx', async () => {
    fetchMock.mockResolvedValue(response(401, 'Unauthorized', 'Unauthorized'))

    await expect(settle(submitFeedback(FEEDBACK, 'token'))).rejects.toThrow(
      NonRetriableError
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries a 429', async () => {
    fetchMock
      .mockResolvedValueOnce(response(429, '', 'Too Many Requests'))
      .mockResolvedValueOnce(
        response(200, JSON.stringify({ details_url: '/here', is_ok: true }))
      )

    await expect(settle(submitFeedback(FEEDBACK, 'token'))).resolves.toEqual(
      expect.objectContaining({ details_url: '/here' })
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('still honours a non-recoverable error in a 200 body', async () => {
    fetchMock.mockResolvedValue(
      response(
        200,
        JSON.stringify({
          error: {
            message: 'Assignment closed',
            details: 'due date passed',
            recoverable: false
          }
        })
      )
    )

    await expect(settle(submitFeedback(FEEDBACK, 'token'))).rejects.toThrow(
      /Assignment closed due date passed/
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('still retries a recoverable error in a 200 body', async () => {
    fetchMock
      .mockResolvedValueOnce(
        response(
          200,
          JSON.stringify({
            error: { message: 'Busy', details: 'try again', recoverable: true }
          })
        )
      )
      .mockResolvedValueOnce(
        response(200, JSON.stringify({ details_url: '/here', is_ok: true }))
      )

    await expect(settle(submitFeedback(FEEDBACK, 'token'))).resolves.toEqual(
      expect.objectContaining({ details_url: '/here' })
    )
  })

  it('returns a well-formed response unchanged', async () => {
    const body = { details_url: '/submissions/1', message: 'ok', is_ok: true }
    fetchMock.mockResolvedValue(response(200, JSON.stringify(body)))

    await expect(settle(submitFeedback(FEEDBACK, 'token'))).resolves.toEqual(
      body
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('createSubmission', () => {
  it('does not return a 502 body as a submission', async () => {
    // Before the status check this resolved, and main.ts then called
    // downloadTarballAndExtractTo(undefined).
    fetchMock.mockResolvedValue(
      response(502, '{"msg":"internal edge function error"}', 'Bad Gateway')
    )

    await expect(settle(createSubmission('token'))).rejects.toThrow(/502/)
  })

  it('returns the grader url on success', async () => {
    fetchMock.mockResolvedValue(
      response(
        200,
        JSON.stringify({ grader_sha: 'abc', grader_url: 'https://x/y.tgz' })
      )
    )

    const result = await settle(createSubmission('token'))
    expect(result.grader_url).toBe('https://x/y.tgz')
  })
})
