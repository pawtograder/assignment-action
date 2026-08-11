/**
 * Unit tests for the action's main functionality, src/main.ts
 *
 * These focus on the failure path. On any throw, run() used to re-submit an
 * empty result (ret_code 1, no tests). The server treats a re-submission
 * inside a 60s window as a replacement and deletes the rows belonging to the
 * result already recorded, so a failure occurring *after* a successful
 * submission turned a real grade into a zero.
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'

type FeedbackBody = { ret_code: number }
type QueryParams = { autograder_regression_test_id: number } | undefined

const submitFeedback =
  jest.fn<
    (
      body: FeedbackBody,
      token: string,
      queryParams?: QueryParams
    ) => Promise<unknown>
  >()
const createSubmission = jest.fn<() => Promise<unknown>>()
const createRegressionTestRun = jest.fn<() => Promise<unknown>>()
const grade = jest.fn<() => Promise<unknown>>()

jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('../src/SupabaseAPI.js', () => ({
  submitFeedback,
  createSubmission,
  createRegressionTestRun
}))
jest.unstable_mockModule('../src/grading/grade.js', () => ({
  default: grade
}))
// prepareForGrading downloads and unpacks the grader tarball; none of that is
// under test here.
jest.unstable_mockModule('@actions/exec', () => ({ exec: jest.fn() }))
jest.unstable_mockModule('fs', () => ({
  createWriteStream: jest.fn(),
  readFileSync: jest.fn()
}))
jest.unstable_mockModule('fs/promises', () => ({
  mkdir: jest.fn(),
  rename: jest.fn(),
  stat: jest.fn(),
  readdir: jest.fn()
}))
jest.unstable_mockModule('stream/promises', () => ({
  finished: jest.fn(async () => undefined)
}))
jest.unstable_mockModule('stream', () => ({
  Readable: { fromWeb: jest.fn(() => ({ pipe: jest.fn() })) }
}))

const { run } = await import('../src/main.js')

const PASSING_RESULT = {
  score: 10,
  max_score: 10,
  output: { visible: { output: 'all good' } },
  lint: { status: 'pass', output: '' },
  tests: [{ name: 'test one', score: 10, max_score: 10 }]
}

beforeEach(() => {
  jest.clearAllMocks()

  core.getIDToken.mockResolvedValue('oidc-token')
  core.getInput.mockImplementation((name: string) => {
    if (name === 'action_ref') return 'v4'
    if (name === 'action_repository') return 'pawtograder/assignment-action'
    if (name === 'grading_server') return 'https://api.example.test'
    return ''
  })
  core.summaryWrite.mockResolvedValue(undefined)

  createSubmission.mockResolvedValue({
    grader_sha: 'abc123',
    grader_url: 'https://example.test/grader.tgz'
  })
  submitFeedback.mockResolvedValue({
    details_url: 'https://pawtograder.test/submissions/1',
    is_ok: true
  })
  grade.mockResolvedValue(PASSING_RESULT)

  globalThis.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    body: {}
  })) as unknown as typeof globalThis.fetch
})

/** The ret_code of every submitFeedback call, in order. */
function submittedRetCodes(): number[] {
  return submitFeedback.mock.calls.map((call) => call[0].ret_code)
}

describe('run()', () => {
  it('does not replace a recorded result when a later step fails', async () => {
    // Fails after submitFeedback has already succeeded.
    core.summaryWrite.mockRejectedValue(new Error('summary write failed'))

    await run()

    expect(submittedRetCodes()).toEqual([0])
    expect(core.setFailed).toHaveBeenCalledWith('summary write failed')
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('will not be replaced')
    )
  })

  it('does not replace a recorded result when the response to the submission is lost', async () => {
    // The dangerous case: the server accepted the submission, then the
    // connection dropped. The action cannot tell this apart from "never
    // arrived", so it must not send the empty result.
    submitFeedback.mockRejectedValue(new Error('HTTP 502 Bad Gateway'))

    await run()

    expect(submittedRetCodes()).toEqual([0])
    expect(core.setFailed).toHaveBeenCalledWith('HTTP 502 Bad Gateway')
  })

  it('reports a grading failure, since nothing has been submitted yet', async () => {
    grade.mockRejectedValue(new Error('grader crashed'))

    await run()

    expect(submittedRetCodes()).toEqual([1])
    expect(core.setFailed).toHaveBeenCalledWith('grader crashed')
  })

  it('keeps the grading failure message when reporting it also fails', async () => {
    grade.mockRejectedValue(new Error('grader crashed'))
    submitFeedback.mockRejectedValue(new Error('HTTP 502 Bad Gateway'))

    await run()

    expect(core.setFailed).toHaveBeenCalledTimes(1)
    expect(core.setFailed).toHaveBeenCalledWith('grader crashed')
    expect(core.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to report the grading failure')
    )
  })

  it('submits the failure to the regression test endpoint for a regression run', async () => {
    core.getInput.mockImplementation((name: string) => {
      if (name === 'action_ref') return 'v4'
      if (name === 'action_repository') return 'pawtograder/assignment-action'
      if (name === 'regression_test_job') return '42'
      return ''
    })
    createRegressionTestRun.mockResolvedValue({
      regression_test_sha: 'def456',
      regression_test_url: 'https://example.test/regression.tgz'
    })
    grade.mockRejectedValue(new Error('grader crashed'))

    await run()

    expect(submitFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ ret_code: 1 }),
      'oidc-token',
      { autograder_regression_test_id: 42 }
    )
  })

  it('submits the passing result on the happy path', async () => {
    await run()

    expect(submittedRetCodes()).toEqual([0])
    expect(core.setFailed).not.toHaveBeenCalled()
  })
})
