import type * as core from '@actions/core'
import { jest } from '@jest/globals'

export const debug = jest.fn<typeof core.debug>()
export const error = jest.fn<typeof core.error>()
export const info = jest.fn<typeof core.info>()
export const getInput = jest.fn<typeof core.getInput>()
export const setOutput = jest.fn<typeof core.setOutput>()
export const setFailed = jest.fn<typeof core.setFailed>()
export const warning = jest.fn<typeof core.warning>()
export const notice = jest.fn<typeof core.notice>()
export const getIDToken = jest.fn<typeof core.getIDToken>()

/**
 * Exported separately so a test can reject it, which is the cheapest way to
 * make a step *after* the feedback submission fail.
 */
export const summaryWrite = jest.fn<() => Promise<unknown>>()

/** The summary builder is chainable, so every method returns the object. */
export const summary = {
  addHeading: jest.fn(() => summary),
  addRaw: jest.fn(() => summary),
  addLink: jest.fn(() => summary),
  addDetails: jest.fn(() => summary),
  addTable: jest.fn(() => summary),
  write: summaryWrite
} as unknown as typeof core.summary
