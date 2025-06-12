import { Command } from 'commander';
import grade from './grade.js';
const program = new Command();
program
    .name('pawtograder')
    .description('Grade student submissions against solution')
    .requiredOption('-s, --solution-dir <path>', 'path to solution directory')
    .requiredOption('-u, --submission-dir <path>', 'path to submission directory')
    .parse();
const options = program.opts();
const solutionDir = options.solutionDir;
const submissionDir = options.submissionDir;
console.log(`Grading submissions in ${submissionDir} against solution in ${solutionDir}`);
grade(solutionDir, submissionDir).then((feedback) => {
    console.log(JSON.stringify(feedback, null, 2));
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIvVXNlcnMvc21hcmFudC9Eb2N1bWVudHMvVW5pdmVyc2l0eSBzdHVmZi9TdW1tZXItMjAyNS9Db3Vyc2UgRGV2L2Fzc2lnbm1lbnQtYWN0aW9uLyIsInNvdXJjZXMiOlsic3JjL2dyYWRpbmcvbWFpbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sV0FBVyxDQUFBO0FBQ25DLE9BQU8sS0FBSyxNQUFNLFlBQVksQ0FBQTtBQUU5QixNQUFNLE9BQU8sR0FBRyxJQUFJLE9BQU8sRUFBRSxDQUFBO0FBRTdCLE9BQU87S0FDSixJQUFJLENBQUMsYUFBYSxDQUFDO0tBQ25CLFdBQVcsQ0FBQyw0Q0FBNEMsQ0FBQztLQUN6RCxjQUFjLENBQUMsMkJBQTJCLEVBQUUsNEJBQTRCLENBQUM7S0FDekUsY0FBYyxDQUFDLDZCQUE2QixFQUFFLDhCQUE4QixDQUFDO0tBQzdFLEtBQUssRUFBRSxDQUFBO0FBRVYsTUFBTSxPQUFPLEdBQUcsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFBO0FBQzlCLE1BQU0sV0FBVyxHQUFXLE9BQU8sQ0FBQyxXQUFXLENBQUE7QUFDL0MsTUFBTSxhQUFhLEdBQVcsT0FBTyxDQUFDLGFBQWEsQ0FBQTtBQUVuRCxPQUFPLENBQUMsR0FBRyxDQUNULDBCQUEwQixhQUFhLHdCQUF3QixXQUFXLEVBQUUsQ0FDN0UsQ0FBQTtBQUNELEtBQUssQ0FBQyxXQUFXLEVBQUUsYUFBYSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsUUFBUSxFQUFFLEVBQUU7SUFDbEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQTtBQUNoRCxDQUFDLENBQUMsQ0FBQSJ9