import { Command } from 'commander'
import grade from './grade.js'

const program = new Command()

program
  .name('pawtograder')
  .description('Grade student submissions against solution')
  .requiredOption('-s, --solution-dir <path>', 'path to solution directory')
  .requiredOption('-u, --submission-dir <path>', 'path to submission directory')
  .parse()

const options = program.opts()
const solutionDir: string = options.solutionDir
const submissionDir: string = options.submissionDir

console.log(
  `Grading submissions in ${submissionDir} against solution in ${solutionDir}`
)
grade(solutionDir, submissionDir).then((feedback) => {
  console.log(JSON.stringify(feedback, null, 2))
})
