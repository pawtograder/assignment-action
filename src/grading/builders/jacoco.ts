import { readFile } from 'fs/promises'
import { parse } from 'csv-parse/sync'

type JacocoCsvRecord = {
  INSTRUCTION_MISSED: string
  INSTRUCTION_COVERED: string
  BRANCH_MISSED: string
  BRANCH_COVERED: string
  LINE_MISSED: string
  LINE_COVERED: string
  COMPLEXITY_MISSED: string
  COMPLEXITY_COVERED: string
  METHOD_MISSED: string
  METHOD_COVERED: string
  PACKAGE: string
  CLASS: string
}
export async function parseJacocoCsv(file: string): Promise<JacocoCsvRecord[]> {
  const coverageReport = await readFile(file, 'utf8')
  const records = parse(coverageReport, {
    columns: true,
    skip_empty_lines: true
  })
  return records as JacocoCsvRecord[]
}
export function getCoverageSummary(records: JacocoCsvRecord[]): string {
  const totalBranches = records.reduce(
    (acc, record) => acc + parseInt(record.BRANCH_COVERED),
    0
  )
  const totalBranchesMissed = records.reduce(
    (acc, record) => acc + parseInt(record.BRANCH_MISSED),
    0
  )
  return (
    `Overall branch coverage: ${totalBranches} / ${totalBranches + totalBranchesMissed} (${((totalBranches / (totalBranches + totalBranchesMissed)) * 100).toFixed(2)}%)\n` +
    '\n\n' +
    records
      .filter((r) => parseInt(r.BRANCH_COVERED) + parseInt(r.BRANCH_MISSED) > 0)
      .map(
        (r) =>
          ` * ${r.PACKAGE}.${r.CLASS}: ${r.BRANCH_COVERED} / ${r.BRANCH_COVERED + r.BRANCH_MISSED} (${((parseInt(r.BRANCH_COVERED) / (parseInt(r.BRANCH_COVERED) + parseInt(r.BRANCH_MISSED))) * 100).toFixed(2)}%)`
      )
      .join('\n')
  )
}
