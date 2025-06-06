/* eslint-disable */
import { readFileSync } from 'fs'
import { XMLParser } from 'fast-xml-parser'
// Types for Checkstyle output structure
export interface CheckstyleError {
  line: number
  column: number
  severity: 'error' | 'warning' | 'info'
  message: string
  source: string
}

export interface CheckstyleFile {
  name: string
  errors: CheckstyleError[]
}

export interface CheckstyleReport {
  version: string
  files: CheckstyleFile[]
  totalErrors: number
}

export function parseCheckstyleXml(filePath: string): CheckstyleReport {
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
