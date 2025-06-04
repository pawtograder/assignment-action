import { OutputFormat, OutputVisibility } from './types.js'

export default class Logger {
  private output: {
    output: string
    visibility: OutputVisibility
  }[] = []
  constructor(private regressionTestJob?: number) {}

  log(visibility: OutputVisibility, message: string) {
    if (visibility === 'visible') {
      console.log(message)
    } else if (this.regressionTestJob) {
      console.log(`CIDebug: ${message}`)
    }
    this.output.push({
      output: message,
      visibility: visibility
    })
  }
  hasOutput(visibility: OutputVisibility) {
    return this.output.some((o) => o.visibility === visibility)
  }
  getEachOutput() {
    const ret: {
      [key in OutputVisibility]?: {
        output: string
        output_format?: OutputFormat
      }
    } = {}
    for (const visibility of [
      'visible',
      'hidden',
      'after_due_date',
      'after_published'
    ] as OutputVisibility[]) {
      if (this.hasOutput(visibility)) {
        ret[visibility] = {
          output: this.getOutput(visibility),
          output_format: 'text'
        }
      }
    }
    return ret
  }

  getOutput(visibility: OutputVisibility) {
    const includeLine = (v: OutputVisibility) => {
      if (visibility === 'visible') {
        return v === 'visible'
      }
      if (visibility === 'hidden') {
        return true
      }
      if (visibility === 'after_due_date') {
        return v === 'visible' || v === 'after_due_date'
      }
      if (visibility === 'after_published') {
        return (
          v === 'visible' || v === 'after_published' || v === 'after_due_date'
        )
      }
      return false
    }
    return this.output
      .filter((o) => includeLine(o.visibility))
      .map((o) => o.output)
      .join('\n')
  }
}
