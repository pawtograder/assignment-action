import { AutograderFeedback } from '../../api/adminServiceSchemas.js'
import Logger from '../Logger.js'
import { PawtograderConfig } from '../types.js'

export abstract class Grader<Config extends PawtograderConfig> {
  protected logger: Logger

  constructor(
    protected solutionDir: string,
    protected submissionDir: string,
    protected config: Config,
    protected regressionTestJob?: number
  ) {
    this.logger = new Logger(regressionTestJob)
    if (regressionTestJob) {
      console.log(
        `Autograder configuration: ${JSON.stringify(this.config, null, 2)}`
      )
    }
  }

  abstract grade(): Promise<AutograderFeedback>
}
