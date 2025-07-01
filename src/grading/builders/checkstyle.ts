/* eslint-disable */

import { glob } from 'glob'
import Logger from '../Logger.js'
import { LintResult } from './Builder.js'
import { readFileSync } from 'fs'
import { XMLParser } from 'fast-xml-parser'
// Types for Checkstyle output structure
interface CheckstyleError {
  line: number
  column: number
  severity: 'error' | 'warning' | 'info'
  message: string
  source: string
}

interface CheckstyleFile {
  name: string
  errors: CheckstyleError[]
}

interface CheckstyleReport {
  version: string
  files: CheckstyleFile[]
  totalErrors: number
}

function parseCheckstyleXml(filePath: string): CheckstyleReport {
  const xmlContent = readFileSync(filePath, 'utf-8')
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: ''
  })

  const parsed = parser.parse(xmlContent)

  // Initialize the report structure
  const report: CheckstyleReport = {
    version: parsed.checkstyle?.version || '',
    files: [],
    totalErrors: 0
  }

  // Handle the case where there are no files or errors
  if (!parsed.checkstyle?.file) {
    return report
  }

  // Convert to array if single file
  const files = Array.isArray(parsed.checkstyle.file)
    ? parsed.checkstyle.file
    : [parsed.checkstyle.file]

  // Process each file
  report.files = files.map((file: any) => {
    const errors = file.error || []
    const fileErrors: CheckstyleError[] = (
      Array.isArray(errors) ? errors : [errors]
    )
      .filter((error: any) => error) // Filter out null/undefined
      .map((error: any) => ({
        line: parseInt(error.line, 10),
        column: parseInt(error.column, 10),
        severity: error.severity as 'error' | 'warning' | 'info',
        message: error.message,
        source: error.source
      }))

    report.totalErrors += fileErrors.length

    return {
      name: file.name,
      errors: fileErrors
    }
  })

  return report
}

export async function parseLintingReports(
  file: string,
  logger: Logger
): Promise<LintResult> {
  const checkstyleFilesContents = await Promise.all(
    (await glob(file)).map(async (file: string) => {
      logger.log('hidden', `Linting ${file}`)
      const ret = await parseCheckstyleXml(file)
      return ret
    })
  )
  const totalErrors = checkstyleFilesContents.reduce(
    (acc: number, curr: CheckstyleReport) => acc + curr.totalErrors,
    0
  )
  const formattedOutput = checkstyleFilesContents
    .filter((file: CheckstyleReport) => file.totalErrors > 0)
    .map((file: CheckstyleReport) => {
      return file.files
        .map((f: CheckstyleFile) => {
          return ` * ${f.name}: ${f.errors.length} errors:
                    ${f.errors.map((e) => `\t${e.line}: ` + '`' + e.message + '`').join('\n')}`
        })
        .join('\n')
    })
    .join('\n')
  logger.log('hidden', `Total errors: ${totalErrors}\n${formattedOutput}`)

  return {
    status: totalErrors > 0 ? 'fail' : 'pass',
    output: `Total errors: ${totalErrors}\n${formattedOutput}`,
    output_format: 'markdown'
  }
}
