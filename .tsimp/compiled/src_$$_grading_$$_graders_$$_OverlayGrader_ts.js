import * as glob from '@actions/glob';
import * as io from '@actions/io';
import { access, readdir } from 'fs/promises';
import path from 'path';
import GradleBuilder from '../builders/GradleBuilder.js';
import ScriptBuilder from '../builders/ScriptBuilder.js';
import { DEFAULT_TIMEOUTS, isMutationTestUnit, isRegularTestUnit } from '../types.js';
import { Grader } from './Grader.js';
function icon(result) {
    if (result.status === 'pass') {
        return '✅';
    }
    else {
        return '❌';
    }
}
export class OverlayGrader extends Grader {
    gradingDir;
    builder;
    constructor(solutionDir, submissionDir, config, gradingDir, regressionTestJob) {
        super(solutionDir, submissionDir, config, regressionTestJob);
        this.gradingDir = gradingDir;
        if (this.config.build.preset == 'java-gradle') {
            this.builder = new GradleBuilder(this.logger, this.gradingDir, this.regressionTestJob);
        }
        else if (this.config.build.preset == 'script') {
            this.builder = new ScriptBuilder(this.logger, this.gradingDir, this.regressionTestJob);
        }
        else if (this.config.build.preset == 'none') {
            this.builder = undefined;
        }
        else {
            throw new Error(`Unsupported build preset: ${this.config.build.preset}`);
        }
    }
    async copyStudentFiles(whichFiles) {
        const files = this.config.submissionFiles[whichFiles];
        // Delete any files that match the glob patterns in the solution directory, so that students can overwrite/replace them
        const solutionGlobber = await glob.create(files.map((f) => path.join(this.gradingDir, f)).join('\n'));
        const expandedSolutionFiles = await solutionGlobber.glob();
        await Promise.all(expandedSolutionFiles.map(async (file) => {
            await io.rmRF(file);
        }));
        // Expand glob patterns
        const globber = await glob.create(files.map((f) => path.join(this.submissionDir, f)).join('\n'));
        const expandedFiles = await globber.glob();
        // Remove any files that are a prefix of another file, so that we only copy the directory contents once
        const filesWithoutDirContents = expandedFiles.filter((file) => !expandedFiles.some((f) => f.startsWith(file) && f !== file));
        for (const file of filesWithoutDirContents) {
            const relativePath = path.relative(this.submissionDir, file);
            const dest = path.join(this.gradingDir, relativePath);
            // Make sure that the directory exists before copying the file
            const dir = path.dirname(dest);
            await io.mkdirP(dir);
            await io.cp(file, dest, { recursive: true });
        }
    }
    async resetSolutionFiles() {
        const files = this.config.submissionFiles['files'].concat(this.config.submissionFiles['testFiles']);
        //First, delete any files that we copied over, since we might have copied over files that don't exist in the solution due to glob patterns
        const gradingDirGlobber = await glob.create(files.map((f) => path.join(this.gradingDir, f)).join('\n'));
        const expandedFiles = await gradingDirGlobber.glob();
        await Promise.all(expandedFiles.map(async (file) => {
            try {
                await io.rmRF(file);
            }
            catch {
                // File might not exist because it was deleted by a previous glob
            }
        }));
        const solutionFilesGlobber = await glob.create(files.map((f) => path.join(this.solutionDir, f)).join('\n'));
        const expandedSolutionFiles = await solutionFilesGlobber.glob();
        // Remove any files that are a prefix of another file, so that we only copy the directory contents once
        const filesWithoutDirContents = expandedSolutionFiles.filter((file) => !expandedSolutionFiles.some((f) => f.startsWith(file) && f !== file));
        for (const file of filesWithoutDirContents) {
            const relativePath = path.relative(this.solutionDir, file);
            const dest = path.join(this.gradingDir, relativePath);
            // Make sure that the directory exists before copying the file
            const dir = path.dirname(dest);
            await io.mkdirP(dir);
            await io.cp(file, dest, { recursive: true });
        }
    }
    gradePart(part, testResults, mutantResults, mutantFailureAdvice) {
        return part.gradedUnits
            .map((unit) => {
            const ret = this.gradeGradedUnit(unit, part, testResults, mutantResults, mutantFailureAdvice);
            for (const feedback of ret) {
                feedback.part = part.name;
            }
            return ret;
        })
            .flat();
    }
    gradeGradedUnit(unit, part, testResults, mutantResults, mutantFailureAdvice) {
        if (isMutationTestUnit(unit)) {
            if (!mutantResults) {
                return [
                    {
                        name: unit.name,
                        output: mutantFailureAdvice ||
                            'No results from grading tests. Please check overall output for more details.',
                        output_format: 'markdown',
                        score: 0,
                        max_score: unit.breakPoints[0].pointsToAward
                    }
                ];
            }
            else {
                const relevantMutantResults = mutantResults.filter((mr) => {
                    const locations = unit.locations;
                    const mutantLocation = mr.location;
                    const mutantLocationParts = mutantLocation.split(':');
                    const mutantLine = parseInt(mutantLocationParts[1]);
                    const mutantEndLine = parseInt(mutantLocationParts[2]);
                    return locations.some((location) => {
                        const locationParts = location.split('-');
                        const locationLine = parseInt(locationParts[1]);
                        const locationEndLine = parseInt(locationParts[2]);
                        return (mutantLine >= locationLine && mutantEndLine <= locationEndLine);
                    });
                });
                const mutantsDetected = relevantMutantResults.filter((mr) => mr.status === 'pass').length;
                const maxMutantsToDetect = unit.breakPoints[0].minimumMutantsDetected;
                const breakPoint = unit.breakPoints.find((bp) => bp.minimumMutantsDetected <= mutantsDetected);
                return [
                    {
                        name: unit.name,
                        output: `**Faults detected: ${mutantsDetected} / ${maxMutantsToDetect}**`,
                        output_format: 'markdown',
                        score: breakPoint ? breakPoint.pointsToAward : 0,
                        max_score: unit.breakPoints[0].pointsToAward
                    }
                ];
            }
        }
        else if (isRegularTestUnit(unit)) {
            const relevantTestResults = testResults.filter((result) => {
                const testName = result.name;
                if (typeof unit.tests === 'string') {
                    return testName.startsWith(unit.tests);
                }
                else {
                    return unit.tests.some((test) => testName.startsWith(test));
                }
            });
            const expectedTests = unit.testCount;
            const passingTests = relevantTestResults.filter((result) => result.status === 'pass').length;
            let score = 0;
            if (unit.allow_partial_credit) {
                score = (passingTests / expectedTests) * unit.points;
            }
            else {
                score = passingTests == expectedTests ? unit.points : 0;
            }
            return [
                {
                    name: unit.name,
                    output: `**Tests passed: ${passingTests} / ${expectedTests}**\n${relevantTestResults
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((result) => `  * ${icon(result)} ${result.name} ${result.output ? '\n```\n' + result.output + '\n```' : ''}`)
                        .join('\n')}`,
                    output_format: 'markdown',
                    score,
                    hide_until_released: part.hide_until_released,
                    max_score: unit.points
                }
            ];
        }
        throw new Error(`Unknown unit type in grading config: ${JSON.stringify(unit)}`);
    }
    async grade() {
        if (!this.builder) {
            return {
                lint: {
                    status: 'pass',
                    output: 'Linter is not enabled for this assignment'
                },
                output: this.logger.getEachOutput(),
                tests: [],
                score: 0,
                artifacts: []
            };
        }
        // const tmpDir = await mkdtemp(path.join(tmpdir(), 'pawtograder-'));
        console.log('Beginning grading');
        const tmpDir = path.join(process.cwd(), 'pawtograder-grading');
        await io.mkdirP(tmpDir);
        const solutionFiles = await readdir(this.solutionDir);
        await Promise.all(solutionFiles.map(async (file) => {
            const src = path.join(this.solutionDir, file);
            const dest = path.join(tmpDir, file);
            await io.cp(src, dest, { recursive: true });
        }));
        await this.copyStudentFiles('files');
        await this.copyStudentFiles('testFiles');
        console.log('Linting student submission');
        const lintResult = await this.builder.lint();
        console.log('Resetting to run instructor tests on student submission');
        await this.resetSolutionFiles();
        await this.copyStudentFiles('files');
        const gradedParts = this.config.gradedParts || [];
        try {
            console.log('Building project with student submission and running instructor tests');
            await this.builder.buildClean({
                timeoutSeconds: this.config.build.timeouts_seconds?.build || DEFAULT_TIMEOUTS.build
            });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            this.logger.log('visible', `Build failed, submission can not be graded. Please fix the above errors below and resubmit. This submission will not count towards any submisison limits (if applicable for this assignment).`);
            this.logger.log('visible', msg);
            const gradedParts = this.config.gradedParts || [];
            const allTests = gradedParts
                .filter((part) => !part.hide_until_released)
                .map((part) => part.gradedUnits.map((gradedUnit) => {
                if (isRegularTestUnit(gradedUnit)) {
                    return {
                        name: gradedUnit.name,
                        output: 'Build failed, test not run. Please see overall output for more details.',
                        output_format: 'text',
                        score: 0,
                        part: part.name,
                        max_score: gradedUnit.points
                    };
                }
                else if (isMutationTestUnit(gradedUnit)) {
                    return {
                        name: gradedUnit.name,
                        output: 'Build failed, test not run. Please see overall output for more details.',
                        output_format: 'text',
                        score: 0,
                        part: part.name,
                        max_score: gradedUnit.breakPoints[0].pointsToAward
                    };
                }
                else {
                    throw new Error(`Unknown unit type in grading config: ${JSON.stringify(gradedUnit)}`);
                }
            }))
                .flat();
            return {
                lint: {
                    status: 'fail',
                    output: 'Gradle build failed'
                },
                output: this.logger.getEachOutput(),
                tests: allTests,
                score: 0,
                artifacts: []
            };
        }
        let testResults = [];
        try {
            testResults = await this.builder.test({
                timeoutSeconds: this.config.build.timeouts_seconds?.instructor_tests ||
                    DEFAULT_TIMEOUTS.instructor_tests
            });
        }
        catch (err) {
            this.logger.log('visible', `An error occurred while running instructor tests. Please fix the above errors and resubmit for grading. Here is the error message: ${err}`);
            const allTests = gradedParts
                .filter((part) => !part.hide_until_released)
                .map((part) => part.gradedUnits.map((gradedUnit) => {
                if (isRegularTestUnit(gradedUnit)) {
                    return {
                        name: gradedUnit.name,
                        output: 'Build failed, test not run. Please see overall output for more details.',
                        output_format: 'text',
                        score: 0,
                        part: part.name,
                        max_score: gradedUnit.points
                    };
                }
                else if (isMutationTestUnit(gradedUnit)) {
                    return {
                        name: gradedUnit.name,
                        output: 'Build failed, test not run. Please see overall output for more details.',
                        output_format: 'text',
                        score: 0,
                        part: part.name,
                        max_score: gradedUnit.breakPoints[0].pointsToAward
                    };
                }
                else {
                    throw new Error(`Unknown unit type in grading config: ${JSON.stringify(gradedUnit)}`);
                }
            }))
                .flat();
            return {
                lint: lintResult,
                output: this.logger.getEachOutput(),
                tests: allTests,
                score: 0,
                artifacts: []
            };
        }
        let mutantResults;
        let mutantFailureAdvice;
        let studentTestResults;
        if (this.config.submissionFiles.testFiles.length > 0 &&
            this.config.build.student_tests?.instructor_impl?.run_tests) {
            console.log('Resetting to have student tests with the instructor solution');
            await this.resetSolutionFiles();
            await this.copyStudentFiles('testFiles');
            console.log('Building solution and running student tests');
            try {
                await this.builder.buildClean({
                    timeoutSeconds: this.config.build.timeouts_seconds?.build || DEFAULT_TIMEOUTS.build
                });
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : 'Unknown error';
                mutantFailureAdvice =
                    'Your tests failed to compile. Please see overall output for more details.';
                this.logger.log('visible', 'Your tests failed to compile. Here is the output from building your tests with our solution:');
                this.logger.log('visible', msg);
            }
            try {
                studentTestResults = await this.builder.test({
                    timeoutSeconds: this.config.build.timeouts_seconds?.student_tests ||
                        DEFAULT_TIMEOUTS.student_tests
                });
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : 'Unknown error';
                this.logger.log('visible', 'Error running student tests on instructor solution:');
                this.logger.log('visible', msg);
            }
            if (!studentTestResults ||
                studentTestResults.some((result) => result.status === 'fail')) {
                this.logger.log('visible', "Some of your tests failed when run against the instructor's solution. Your tests will not be graded for this submission. Please fix them before resubmitting. ");
                mutantFailureAdvice =
                    "**Error**: Some of your tests failed when run against the instructor's solution. Your tests will not be graded for this submission. Please fix them before resubmitting.\n\n\nHere are your failing test results:\n\n\n";
                this.logger.log('visible', 'Here are your failing test results:');
                if (studentTestResults) {
                    for (const result of studentTestResults) {
                        if (result.status === 'fail') {
                            mutantFailureAdvice += `\n❌ ${result.name}\n`;
                            mutantFailureAdvice += '```\n' + result.output + '\n```';
                            this.logger.log('visible', `${result.name}: ${result.status}`);
                            this.logger.log('visible', result.output);
                        }
                    }
                }
                mutantFailureAdvice +=
                    '\n\nPlease fix the above errors and resubmit for grading.';
            }
            else {
                console.log('Running student tests against buggy solutions');
                try {
                    mutantResults = await this.builder.mutationTest({
                        timeoutSeconds: this.config.build.timeouts_seconds?.mutants ||
                            DEFAULT_TIMEOUTS.mutants
                    });
                }
                catch (err) {
                    const msg = err instanceof Error ? err.message : 'Unknown error';
                    this.logger.log('visible', 'Error running mutation tests: ' + msg);
                }
            }
        }
        let studentTestAdvice;
        if ((this.config.build.student_tests?.student_impl?.report_branch_coverage ||
            this.config.build.student_tests?.student_impl?.run_tests) &&
            this.config.submissionFiles.testFiles.length > 0) {
            console.log('Running student tests against student implementation');
            try {
                await this.resetSolutionFiles();
                await this.copyStudentFiles('testFiles');
                await this.copyStudentFiles('files');
                await this.builder.buildClean({
                    timeoutSeconds: this.config.build.timeouts_seconds?.build || DEFAULT_TIMEOUTS.build
                });
                studentTestResults = await this.builder.test({
                    timeoutSeconds: this.config.build.timeouts_seconds?.student_tests ||
                        DEFAULT_TIMEOUTS.student_tests
                });
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : 'Unknown error';
                studentTestAdvice = 'Your tests failed to compile. ' + msg;
                this.logger.log('visible', msg);
            }
        }
        console.log('Wrapping up');
        const testFeedbacks = gradedParts
            .map((part) => this.gradePart(part, testResults, mutantResults, mutantFailureAdvice))
            .flat();
        if (this.regressionTestJob) {
            console.log('DEBUG: Test results');
            console.log(JSON.stringify(testFeedbacks, null, 2));
        }
        //Future graders might want to dynamically generate some artifacts, this would be the place to add them to the feedback
        const expectedArtifacts = this.config.build.artifacts || [];
        if (this.config.build.student_tests?.instructor_impl?.report_mutation_coverage) {
            let studentMutationOutput = 'Please refer to your assignment instructions for the specifications of how (if at all) your tests will be graded. These results are purely informational: ';
            if (mutantFailureAdvice) {
                studentMutationOutput = mutantFailureAdvice;
            }
            if (mutantResults) {
                const getMutantPrompt = (mutantName) => {
                    if (this.config.mutantAdvice) {
                        const [sourceClass, targetClass] = mutantName.split(' ');
                        const mutantAdvice = this.config.mutantAdvice.find((ma) => ma.sourceClass === sourceClass && ma.targetClass === targetClass);
                        if (mutantAdvice) {
                            return mutantAdvice.prompt;
                        }
                    }
                    return mutantName;
                };
                const getMutantShortName = (mutantName) => {
                    if (this.config.mutantAdvice) {
                        const [sourceClass, targetClass] = mutantName.split(' ');
                        const mutantAdvice = this.config.mutantAdvice.find((ma) => ma.sourceClass === sourceClass && ma.targetClass === targetClass);
                        if (mutantAdvice) {
                            return mutantAdvice.name;
                        }
                    }
                    return undefined;
                };
                const mutantsDetected = mutantResults
                    .filter((mr) => mr.status === 'pass')
                    .map((mr) => {
                    const prompt = getMutantPrompt(mr.name);
                    const shortName = getMutantShortName(mr.name);
                    return `* ${shortName} (${prompt})\n\t * Detected by: ${mr.tests.join(', ')}`;
                });
                const mutantsNotDetected = mutantResults
                    .filter((mr) => mr.status === 'fail')
                    .map((mr) => {
                    const prompt = getMutantPrompt(mr.name);
                    return `* **${mr.name}** (${prompt})`;
                });
                studentMutationOutput += `Faults detected: ${mutantsDetected.length}:\n`;
                studentMutationOutput += `${mutantsDetected.join('\n')}\n\n`;
                studentMutationOutput += `Faults not detected: ${mutantsNotDetected.length}:\n`;
                studentMutationOutput += `${mutantsNotDetected.join('\n')}`;
            }
            this.logger.log('hidden', studentMutationOutput);
            testFeedbacks.push({
                name: 'Fault Coverage Report',
                output: studentMutationOutput,
                output_format: 'markdown',
                score: 0,
                max_score: 0
            });
        }
        if (this.config.build.student_tests?.student_impl?.report_branch_coverage) {
            const passingTestCount = studentTestResults?.filter((result) => result.status === 'pass').length;
            const totalTestCount = studentTestResults?.length;
            let studentTestOutput = 'Please refer to your assignment instructions for the specifications of how (if at all) your tests will be graded. These results are purely informational:\n\n';
            if (studentTestAdvice) {
                studentTestOutput += studentTestAdvice;
            }
            studentTestOutput += `**Student-written tests passed: ${passingTestCount} / ${totalTestCount}**\n`;
            if (studentTestResults && studentTestResults.length > 0) {
                for (const result of studentTestResults) {
                    studentTestOutput += `\n${icon(result)} ${result.name} ${result.output ? '\n```\n' + result.output + '\n```' : ''}`;
                }
                studentTestOutput += `\n\n${await this.builder.getCoverageReport()}`;
            }
            testFeedbacks.push({
                name: 'Student-Written Test Results',
                output: studentTestOutput,
                output_format: 'markdown',
                score: 0,
                max_score: 0,
                part: 'Student-Written Tests',
                extra_data: {
                    icon: 'FaInfo',
                    hide_score: 'true'
                }
            });
            const artifactDir = this.builder.getCoverageReportDir();
            if (artifactDir) {
                expectedArtifacts.push({
                    name: 'Coverage Report: Student-Written Tests',
                    path: artifactDir,
                    data: {
                        format: 'zip',
                        display: 'html_site'
                    }
                });
            }
        }
        //Check that each expected artifact is present in the grading directory
        const artifactPaths = await Promise.all(expectedArtifacts
            .filter((a) => a.path)
            .map(async (artifact) => {
            this.logger.log('visible', `Checking for artifact: ${artifact.name} at ${artifact.path}`);
            const artifactPath = path.join(this.gradingDir, artifact.path);
            try {
                await access(artifactPath);
                return {
                    name: artifact.name,
                    path: artifactPath,
                    data: artifact.data
                };
            }
            catch {
                console.error(`Missing expected artifact: ${artifact.name} at path ${artifact.path}`);
                return undefined;
            }
        }));
        return {
            lint: lintResult,
            tests: testFeedbacks,
            output: this.logger.getEachOutput(),
            artifacts: this.regressionTestJob
                ? []
                : artifactPaths.filter((path) => path !== undefined)
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiT3ZlcmxheUdyYWRlci5qcyIsInNvdXJjZVJvb3QiOiIvVXNlcnMvc21hcmFudC9Eb2N1bWVudHMvVW5pdmVyc2l0eSBzdHVmZi9TdW1tZXItMjAyNS9Db3Vyc2UgRGV2L2Fzc2lnbm1lbnQtYWN0aW9uLyIsInNvdXJjZXMiOlsic3JjL2dyYWRpbmcvZ3JhZGVycy9PdmVybGF5R3JhZGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sS0FBSyxJQUFJLE1BQU0sZUFBZSxDQUFBO0FBQ3JDLE9BQU8sS0FBSyxFQUFFLE1BQU0sYUFBYSxDQUFBO0FBQ2pDLE9BQU8sRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLE1BQU0sYUFBYSxDQUFBO0FBQzdDLE9BQU8sSUFBSSxNQUFNLE1BQU0sQ0FBQTtBQUd2QixPQUFPLGFBQWEsTUFBTSw4QkFBOEIsQ0FBQTtBQUN4RCxPQUFPLGFBQWEsTUFBTSw4QkFBOEIsQ0FBQTtBQUN4RCxPQUFPLEVBRUwsZ0JBQWdCLEVBSWhCLGtCQUFrQixFQUNsQixpQkFBaUIsRUFHbEIsTUFBTSxhQUFhLENBQUE7QUFDcEIsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLGFBQWEsQ0FBQTtBQUVwQyxTQUFTLElBQUksQ0FBQyxNQUFrQjtJQUM5QixJQUFJLE1BQU0sQ0FBQyxNQUFNLEtBQUssTUFBTSxFQUFFLENBQUM7UUFDN0IsT0FBTyxHQUFHLENBQUE7SUFDWixDQUFDO1NBQU0sQ0FBQztRQUNOLE9BQU8sR0FBRyxDQUFBO0lBQ1osQ0FBQztBQUNILENBQUM7QUFFRCxNQUFNLE9BQU8sYUFBYyxTQUFRLE1BQWdDO0lBT3ZEO0lBTkYsT0FBTyxDQUFxQjtJQUVwQyxZQUNFLFdBQW1CLEVBQ25CLGFBQXFCLEVBQ3JCLE1BQXlCLEVBQ2pCLFVBQWtCLEVBQzFCLGlCQUEwQjtRQUUxQixLQUFLLENBQUMsV0FBVyxFQUFFLGFBQWEsRUFBRSxNQUFNLEVBQUUsaUJBQWlCLENBQUMsQ0FBQTtRQUhwRCxlQUFVLEdBQVYsVUFBVSxDQUFRO1FBSTFCLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsTUFBTSxJQUFJLGFBQWEsRUFBRSxDQUFDO1lBQzlDLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxhQUFhLENBQzlCLElBQUksQ0FBQyxNQUFNLEVBQ1gsSUFBSSxDQUFDLFVBQVUsRUFDZixJQUFJLENBQUMsaUJBQWlCLENBQ3ZCLENBQUE7UUFDSCxDQUFDO2FBQU0sSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxNQUFNLElBQUksUUFBUSxFQUFFLENBQUM7WUFDaEQsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLGFBQWEsQ0FDOUIsSUFBSSxDQUFDLE1BQU0sRUFDWCxJQUFJLENBQUMsVUFBVSxFQUNmLElBQUksQ0FBQyxpQkFBaUIsQ0FDdkIsQ0FBQTtRQUNILENBQUM7YUFBTSxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLE1BQU0sSUFBSSxNQUFNLEVBQUUsQ0FBQztZQUM5QyxJQUFJLENBQUMsT0FBTyxHQUFHLFNBQVMsQ0FBQTtRQUMxQixDQUFDO2FBQU0sQ0FBQztZQUNOLE1BQU0sSUFBSSxLQUFLLENBQUMsNkJBQTZCLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUE7UUFDMUUsQ0FBQztJQUNILENBQUM7SUFFRCxLQUFLLENBQUMsZ0JBQWdCLENBQUMsVUFBaUM7UUFDdEQsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxlQUFlLENBQUMsVUFBVSxDQUFDLENBQUE7UUFFckQsdUhBQXVIO1FBQ3ZILE1BQU0sZUFBZSxHQUFHLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FDdkMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUMzRCxDQUFBO1FBQ0QsTUFBTSxxQkFBcUIsR0FBRyxNQUFNLGVBQWUsQ0FBQyxJQUFJLEVBQUUsQ0FBQTtRQUMxRCxNQUFNLE9BQU8sQ0FBQyxHQUFHLENBQ2YscUJBQXFCLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRSxJQUFZLEVBQUUsRUFBRTtZQUMvQyxNQUFNLEVBQUUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7UUFDckIsQ0FBQyxDQUFDLENBQ0gsQ0FBQTtRQUVELHVCQUF1QjtRQUN2QixNQUFNLE9BQU8sR0FBRyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQy9CLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FDOUQsQ0FBQTtRQUNELE1BQU0sYUFBYSxHQUFHLE1BQU0sT0FBTyxDQUFDLElBQUksRUFBRSxDQUFBO1FBRTFDLHVHQUF1RztRQUN2RyxNQUFNLHVCQUF1QixHQUFHLGFBQWEsQ0FBQyxNQUFNLENBQ2xELENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLElBQUksQ0FBQyxDQUN2RSxDQUFBO1FBRUQsS0FBSyxNQUFNLElBQUksSUFBSSx1QkFBdUIsRUFBRSxDQUFDO1lBQzNDLE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLGFBQWEsRUFBRSxJQUFJLENBQUMsQ0FBQTtZQUM1RCxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsWUFBWSxDQUFDLENBQUE7WUFDckQsOERBQThEO1lBQzlELE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUE7WUFDOUIsTUFBTSxFQUFFLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFBO1lBQ3BCLE1BQU0sRUFBRSxDQUFDLEVBQUUsQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUE7UUFDOUMsQ0FBQztJQUNILENBQUM7SUFFRCxLQUFLLENBQUMsa0JBQWtCO1FBQ3RCLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxDQUFDLE1BQU0sQ0FDdkQsSUFBSSxDQUFDLE1BQU0sQ0FBQyxlQUFlLENBQUMsV0FBVyxDQUFDLENBQ3pDLENBQUE7UUFDRCwwSUFBMEk7UUFDMUksTUFBTSxpQkFBaUIsR0FBRyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQ3pDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FDM0QsQ0FBQTtRQUNELE1BQU0sYUFBYSxHQUFHLE1BQU0saUJBQWlCLENBQUMsSUFBSSxFQUFFLENBQUE7UUFDcEQsTUFBTSxPQUFPLENBQUMsR0FBRyxDQUNmLGFBQWEsQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLElBQVksRUFBRSxFQUFFO1lBQ3ZDLElBQUksQ0FBQztnQkFDSCxNQUFNLEVBQUUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7WUFDckIsQ0FBQztZQUFDLE1BQU0sQ0FBQztnQkFDUCxpRUFBaUU7WUFDbkUsQ0FBQztRQUNILENBQUMsQ0FBQyxDQUNILENBQUE7UUFFRCxNQUFNLG9CQUFvQixHQUFHLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FDNUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUM1RCxDQUFBO1FBQ0QsTUFBTSxxQkFBcUIsR0FBRyxNQUFNLG9CQUFvQixDQUFDLElBQUksRUFBRSxDQUFBO1FBQy9ELHVHQUF1RztRQUN2RyxNQUFNLHVCQUF1QixHQUFHLHFCQUFxQixDQUFDLE1BQU0sQ0FDMUQsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUNQLENBQUMscUJBQXFCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FDdkUsQ0FBQTtRQUNELEtBQUssTUFBTSxJQUFJLElBQUksdUJBQXVCLEVBQUUsQ0FBQztZQUMzQyxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsSUFBSSxDQUFDLENBQUE7WUFDMUQsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLFlBQVksQ0FBQyxDQUFBO1lBQ3JELDhEQUE4RDtZQUM5RCxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFBO1lBQzlCLE1BQU0sRUFBRSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQTtZQUNwQixNQUFNLEVBQUUsQ0FBQyxFQUFFLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFBO1FBQzlDLENBQUM7SUFDSCxDQUFDO0lBRU8sU0FBUyxDQUNmLElBQWdCLEVBQ2hCLFdBQXlCLEVBQ3pCLGFBQThCLEVBQzlCLG1CQUE0QjtRQUU1QixPQUFPLElBQUksQ0FBQyxXQUFXO2FBQ3BCLEdBQUcsQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFO1lBQ1osTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLGVBQWUsQ0FDOUIsSUFBSSxFQUNKLElBQUksRUFDSixXQUFXLEVBQ1gsYUFBYSxFQUNiLG1CQUFtQixDQUNwQixDQUFBO1lBQ0QsS0FBSyxNQUFNLFFBQVEsSUFBSSxHQUFHLEVBQUUsQ0FBQztnQkFDM0IsUUFBUSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFBO1lBQzNCLENBQUM7WUFDRCxPQUFPLEdBQUcsQ0FBQTtRQUNaLENBQUMsQ0FBQzthQUNELElBQUksRUFBRSxDQUFBO0lBQ1gsQ0FBQztJQUVPLGVBQWUsQ0FDckIsSUFBZ0IsRUFDaEIsSUFBZ0IsRUFDaEIsV0FBeUIsRUFDekIsYUFBOEIsRUFDOUIsbUJBQTRCO1FBRTVCLElBQUksa0JBQWtCLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUM3QixJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7Z0JBQ25CLE9BQU87b0JBQ0w7d0JBQ0UsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJO3dCQUNmLE1BQU0sRUFDSixtQkFBbUI7NEJBQ25CLDhFQUE4RTt3QkFDaEYsYUFBYSxFQUFFLFVBQVU7d0JBQ3pCLEtBQUssRUFBRSxDQUFDO3dCQUNSLFNBQVMsRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLGFBQWE7cUJBQzdDO2lCQUNGLENBQUE7WUFDSCxDQUFDO2lCQUFNLENBQUM7Z0JBQ04sTUFBTSxxQkFBcUIsR0FBRyxhQUFhLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUU7b0JBQ3hELE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUE7b0JBQ2hDLE1BQU0sY0FBYyxHQUFHLEVBQUUsQ0FBQyxRQUFRLENBQUE7b0JBQ2xDLE1BQU0sbUJBQW1CLEdBQUcsY0FBYyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQTtvQkFDckQsTUFBTSxVQUFVLEdBQUcsUUFBUSxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7b0JBQ25ELE1BQU0sYUFBYSxHQUFHLFFBQVEsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO29CQUN0RCxPQUFPLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxRQUFRLEVBQUUsRUFBRTt3QkFDakMsTUFBTSxhQUFhLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQTt3QkFDekMsTUFBTSxZQUFZLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO3dCQUMvQyxNQUFNLGVBQWUsR0FBRyxRQUFRLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7d0JBQ2xELE9BQU8sQ0FDTCxVQUFVLElBQUksWUFBWSxJQUFJLGFBQWEsSUFBSSxlQUFlLENBQy9ELENBQUE7b0JBQ0gsQ0FBQyxDQUFDLENBQUE7Z0JBQ0osQ0FBQyxDQUFDLENBQUE7Z0JBQ0YsTUFBTSxlQUFlLEdBQUcscUJBQXFCLENBQUMsTUFBTSxDQUNsRCxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLE1BQU0sS0FBSyxNQUFNLENBQzdCLENBQUMsTUFBTSxDQUFBO2dCQUNSLE1BQU0sa0JBQWtCLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxzQkFBc0IsQ0FBQTtnQkFDckUsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQ3RDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsc0JBQXNCLElBQUksZUFBZSxDQUNyRCxDQUFBO2dCQUNELE9BQU87b0JBQ0w7d0JBQ0UsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJO3dCQUNmLE1BQU0sRUFBRSxzQkFBc0IsZUFBZSxNQUFNLGtCQUFrQixJQUFJO3dCQUN6RSxhQUFhLEVBQUUsVUFBVTt3QkFDekIsS0FBSyxFQUFFLFVBQVUsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQzt3QkFDaEQsU0FBUyxFQUFFLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsYUFBYTtxQkFDN0M7aUJBQ0YsQ0FBQTtZQUNILENBQUM7UUFDSCxDQUFDO2FBQU0sSUFBSSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQ25DLE1BQU0sbUJBQW1CLEdBQUcsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFO2dCQUN4RCxNQUFNLFFBQVEsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFBO2dCQUM1QixJQUFJLE9BQU8sSUFBSSxDQUFDLEtBQUssS0FBSyxRQUFRLEVBQUUsQ0FBQztvQkFDbkMsT0FBTyxRQUFRLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQTtnQkFDeEMsQ0FBQztxQkFBTSxDQUFDO29CQUNOLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQTtnQkFDN0QsQ0FBQztZQUNILENBQUMsQ0FBQyxDQUFBO1lBQ0YsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQTtZQUNwQyxNQUFNLFlBQVksR0FBRyxtQkFBbUIsQ0FBQyxNQUFNLENBQzdDLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxNQUFNLENBQUMsTUFBTSxLQUFLLE1BQU0sQ0FDckMsQ0FBQyxNQUFNLENBQUE7WUFFUixJQUFJLEtBQUssR0FBRyxDQUFDLENBQUE7WUFDYixJQUFJLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO2dCQUM5QixLQUFLLEdBQUcsQ0FBQyxZQUFZLEdBQUcsYUFBYSxDQUFDLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQTtZQUN0RCxDQUFDO2lCQUFNLENBQUM7Z0JBQ04sS0FBSyxHQUFHLFlBQVksSUFBSSxhQUFhLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQTtZQUN6RCxDQUFDO1lBQ0QsT0FBTztnQkFDTDtvQkFDRSxJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUk7b0JBQ2YsTUFBTSxFQUFFLG1CQUFtQixZQUFZLE1BQU0sYUFBYSxPQUFPLG1CQUFtQjt5QkFDakYsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO3lCQUM1QyxHQUFHLENBQ0YsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUNULE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLE1BQU0sQ0FBQyxJQUFJLElBQUksTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsU0FBUyxHQUFHLE1BQU0sQ0FBQyxNQUFNLEdBQUcsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FDbkc7eUJBQ0EsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFO29CQUNmLGFBQWEsRUFBRSxVQUFVO29CQUN6QixLQUFLO29CQUNMLG1CQUFtQixFQUFFLElBQUksQ0FBQyxtQkFBbUI7b0JBQzdDLFNBQVMsRUFBRSxJQUFJLENBQUMsTUFBTTtpQkFDdkI7YUFDRixDQUFBO1FBQ0gsQ0FBQztRQUNELE1BQU0sSUFBSSxLQUFLLENBQ2Isd0NBQXdDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FDL0QsQ0FBQTtJQUNILENBQUM7SUFDRCxLQUFLLENBQUMsS0FBSztRQUNULElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDbEIsT0FBTztnQkFDTCxJQUFJLEVBQUU7b0JBQ0osTUFBTSxFQUFFLE1BQU07b0JBQ2QsTUFBTSxFQUFFLDJDQUEyQztpQkFDcEQ7Z0JBQ0QsTUFBTSxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsYUFBYSxFQUFFO2dCQUNuQyxLQUFLLEVBQUUsRUFBRTtnQkFDVCxLQUFLLEVBQUUsQ0FBQztnQkFDUixTQUFTLEVBQUUsRUFBRTthQUNkLENBQUE7UUFDSCxDQUFDO1FBQ0QscUVBQXFFO1FBQ3JFLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsQ0FBQTtRQUNoQyxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsRUFBRSxxQkFBcUIsQ0FBQyxDQUFBO1FBQzlELE1BQU0sRUFBRSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQTtRQUN2QixNQUFNLGFBQWEsR0FBRyxNQUFNLE9BQU8sQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUE7UUFDckQsTUFBTSxPQUFPLENBQUMsR0FBRyxDQUNmLGFBQWEsQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxFQUFFO1lBQy9CLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsQ0FBQTtZQUM3QyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQTtZQUNwQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLENBQUMsR0FBRyxFQUFFLElBQUksRUFBRSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFBO1FBQzdDLENBQUMsQ0FBQyxDQUNILENBQUE7UUFFRCxNQUFNLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPLENBQUMsQ0FBQTtRQUNwQyxNQUFNLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxXQUFXLENBQUMsQ0FBQTtRQUV4QyxPQUFPLENBQUMsR0FBRyxDQUFDLDRCQUE0QixDQUFDLENBQUE7UUFDekMsTUFBTSxVQUFVLEdBQUcsTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFBO1FBRTVDLE9BQU8sQ0FBQyxHQUFHLENBQUMseURBQXlELENBQUMsQ0FBQTtRQUN0RSxNQUFNLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFBO1FBQy9CLE1BQU0sSUFBSSxDQUFDLGdCQUFnQixDQUFDLE9BQU8sQ0FBQyxDQUFBO1FBQ3BDLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxJQUFJLEVBQUUsQ0FBQTtRQUVqRCxJQUFJLENBQUM7WUFDSCxPQUFPLENBQUMsR0FBRyxDQUNULHVFQUF1RSxDQUN4RSxDQUFBO1lBQ0QsTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQztnQkFDNUIsY0FBYyxFQUNaLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLGdCQUFnQixFQUFFLEtBQUssSUFBSSxnQkFBZ0IsQ0FBQyxLQUFLO2FBQ3RFLENBQUMsQ0FBQTtRQUNKLENBQUM7UUFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO1lBQ2IsTUFBTSxHQUFHLEdBQUcsR0FBRyxZQUFZLEtBQUssQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsZUFBZSxDQUFBO1lBQ2hFLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUNiLFNBQVMsRUFDVCwrTEFBK0wsQ0FDaE0sQ0FBQTtZQUNELElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxHQUFHLENBQUMsQ0FBQTtZQUMvQixNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsSUFBSSxFQUFFLENBQUE7WUFDakQsTUFBTSxRQUFRLEdBQTZCLFdBQVc7aUJBQ25ELE1BQU0sQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsbUJBQW1CLENBQUM7aUJBQzNDLEdBQUcsQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFLENBQ1osSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxVQUFVLEVBQUUsRUFBRTtnQkFDbEMsSUFBSSxpQkFBaUIsQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDO29CQUNsQyxPQUFPO3dCQUNMLElBQUksRUFBRSxVQUFVLENBQUMsSUFBSTt3QkFDckIsTUFBTSxFQUNKLHlFQUF5RTt3QkFDM0UsYUFBYSxFQUFFLE1BQXNCO3dCQUNyQyxLQUFLLEVBQUUsQ0FBQzt3QkFDUixJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUk7d0JBQ2YsU0FBUyxFQUFFLFVBQVUsQ0FBQyxNQUFNO3FCQUM3QixDQUFBO2dCQUNILENBQUM7cUJBQU0sSUFBSSxrQkFBa0IsQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDO29CQUMxQyxPQUFPO3dCQUNMLElBQUksRUFBRSxVQUFVLENBQUMsSUFBSTt3QkFDckIsTUFBTSxFQUNKLHlFQUF5RTt3QkFDM0UsYUFBYSxFQUFFLE1BQXNCO3dCQUNyQyxLQUFLLEVBQUUsQ0FBQzt3QkFDUixJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUk7d0JBQ2YsU0FBUyxFQUFFLFVBQVUsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsYUFBYTtxQkFDbkQsQ0FBQTtnQkFDSCxDQUFDO3FCQUFNLENBQUM7b0JBQ04sTUFBTSxJQUFJLEtBQUssQ0FDYix3Q0FBd0MsSUFBSSxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUNyRSxDQUFBO2dCQUNILENBQUM7WUFDSCxDQUFDLENBQUMsQ0FDSDtpQkFDQSxJQUFJLEVBQUUsQ0FBQTtZQUNULE9BQU87Z0JBQ0wsSUFBSSxFQUFFO29CQUNKLE1BQU0sRUFBRSxNQUFNO29CQUNkLE1BQU0sRUFBRSxxQkFBcUI7aUJBQzlCO2dCQUNELE1BQU0sRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsRUFBRTtnQkFDbkMsS0FBSyxFQUFFLFFBQVE7Z0JBQ2YsS0FBSyxFQUFFLENBQUM7Z0JBQ1IsU0FBUyxFQUFFLEVBQUU7YUFDZCxDQUFBO1FBQ0gsQ0FBQztRQUNELElBQUksV0FBVyxHQUFpQixFQUFFLENBQUE7UUFDbEMsSUFBSSxDQUFDO1lBQ0gsV0FBVyxHQUFHLE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUM7Z0JBQ3BDLGNBQWMsRUFDWixJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsRUFBRSxnQkFBZ0I7b0JBQ3BELGdCQUFnQixDQUFDLGdCQUFnQjthQUNwQyxDQUFDLENBQUE7UUFDSixDQUFDO1FBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztZQUNiLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUNiLFNBQVMsRUFDVCxzSUFBc0ksR0FBRyxFQUFFLENBQzVJLENBQUE7WUFDRCxNQUFNLFFBQVEsR0FBNkIsV0FBVztpQkFDbkQsTUFBTSxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQztpQkFDM0MsR0FBRyxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FDWixJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDLFVBQVUsRUFBRSxFQUFFO2dCQUNsQyxJQUFJLGlCQUFpQixDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUM7b0JBQ2xDLE9BQU87d0JBQ0wsSUFBSSxFQUFFLFVBQVUsQ0FBQyxJQUFJO3dCQUNyQixNQUFNLEVBQ0oseUVBQXlFO3dCQUMzRSxhQUFhLEVBQUUsTUFBc0I7d0JBQ3JDLEtBQUssRUFBRSxDQUFDO3dCQUNSLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSTt3QkFDZixTQUFTLEVBQUUsVUFBVSxDQUFDLE1BQU07cUJBQzdCLENBQUE7Z0JBQ0gsQ0FBQztxQkFBTSxJQUFJLGtCQUFrQixDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUM7b0JBQzFDLE9BQU87d0JBQ0wsSUFBSSxFQUFFLFVBQVUsQ0FBQyxJQUFJO3dCQUNyQixNQUFNLEVBQ0oseUVBQXlFO3dCQUMzRSxhQUFhLEVBQUUsTUFBc0I7d0JBQ3JDLEtBQUssRUFBRSxDQUFDO3dCQUNSLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSTt3QkFDZixTQUFTLEVBQUUsVUFBVSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxhQUFhO3FCQUNuRCxDQUFBO2dCQUNILENBQUM7cUJBQU0sQ0FBQztvQkFDTixNQUFNLElBQUksS0FBSyxDQUNiLHdDQUF3QyxJQUFJLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQ3JFLENBQUE7Z0JBQ0gsQ0FBQztZQUNILENBQUMsQ0FBQyxDQUNIO2lCQUNBLElBQUksRUFBRSxDQUFBO1lBQ1QsT0FBTztnQkFDTCxJQUFJLEVBQUUsVUFBVTtnQkFDaEIsTUFBTSxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsYUFBYSxFQUFFO2dCQUNuQyxLQUFLLEVBQUUsUUFBUTtnQkFDZixLQUFLLEVBQUUsQ0FBQztnQkFDUixTQUFTLEVBQUUsRUFBRTthQUNkLENBQUE7UUFDSCxDQUFDO1FBQ0QsSUFBSSxhQUF5QyxDQUFBO1FBQzdDLElBQUksbUJBQXVDLENBQUE7UUFDM0MsSUFBSSxrQkFBNEMsQ0FBQTtRQUNoRCxJQUNFLElBQUksQ0FBQyxNQUFNLENBQUMsZUFBZSxDQUFDLFNBQVMsQ0FBQyxNQUFNLEdBQUcsQ0FBQztZQUNoRCxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxhQUFhLEVBQUUsZUFBZSxFQUFFLFNBQVMsRUFDM0QsQ0FBQztZQUNELE9BQU8sQ0FBQyxHQUFHLENBQ1QsOERBQThELENBQy9ELENBQUE7WUFDRCxNQUFNLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFBO1lBQy9CLE1BQU0sSUFBSSxDQUFDLGdCQUFnQixDQUFDLFdBQVcsQ0FBQyxDQUFBO1lBQ3hDLE9BQU8sQ0FBQyxHQUFHLENBQUMsNkNBQTZDLENBQUMsQ0FBQTtZQUMxRCxJQUFJLENBQUM7Z0JBQ0gsTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQztvQkFDNUIsY0FBYyxFQUNaLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLGdCQUFnQixFQUFFLEtBQUssSUFBSSxnQkFBZ0IsQ0FBQyxLQUFLO2lCQUN0RSxDQUFDLENBQUE7WUFDSixDQUFDO1lBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztnQkFDYixNQUFNLEdBQUcsR0FBRyxHQUFHLFlBQVksS0FBSyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxlQUFlLENBQUE7Z0JBQ2hFLG1CQUFtQjtvQkFDakIsMkVBQTJFLENBQUE7Z0JBQzdFLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUNiLFNBQVMsRUFDVCw4RkFBOEYsQ0FDL0YsQ0FBQTtnQkFDRCxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsR0FBRyxDQUFDLENBQUE7WUFDakMsQ0FBQztZQUNELElBQUksQ0FBQztnQkFDSCxrQkFBa0IsR0FBRyxNQUFNLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDO29CQUMzQyxjQUFjLEVBQ1osSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLEVBQUUsYUFBYTt3QkFDakQsZ0JBQWdCLENBQUMsYUFBYTtpQkFDakMsQ0FBQyxDQUFBO1lBQ0osQ0FBQztZQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7Z0JBQ2IsTUFBTSxHQUFHLEdBQUcsR0FBRyxZQUFZLEtBQUssQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsZUFBZSxDQUFBO2dCQUNoRSxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FDYixTQUFTLEVBQ1QscURBQXFELENBQ3RELENBQUE7Z0JBQ0QsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsU0FBUyxFQUFFLEdBQUcsQ0FBQyxDQUFBO1lBQ2pDLENBQUM7WUFDRCxJQUNFLENBQUMsa0JBQWtCO2dCQUNuQixrQkFBa0IsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEtBQUssTUFBTSxDQUFDLEVBQzdELENBQUM7Z0JBQ0QsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQ2IsU0FBUyxFQUNULGdLQUFnSyxDQUNqSyxDQUFBO2dCQUNELG1CQUFtQjtvQkFDakIseU5BQXlOLENBQUE7Z0JBQzNOLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxxQ0FBcUMsQ0FBQyxDQUFBO2dCQUNqRSxJQUFJLGtCQUFrQixFQUFFLENBQUM7b0JBQ3ZCLEtBQUssTUFBTSxNQUFNLElBQUksa0JBQWtCLEVBQUUsQ0FBQzt3QkFDeEMsSUFBSSxNQUFNLENBQUMsTUFBTSxLQUFLLE1BQU0sRUFBRSxDQUFDOzRCQUM3QixtQkFBbUIsSUFBSSxPQUFPLE1BQU0sQ0FBQyxJQUFJLElBQUksQ0FBQTs0QkFDN0MsbUJBQW1CLElBQUksT0FBTyxHQUFHLE1BQU0sQ0FBQyxNQUFNLEdBQUcsT0FBTyxDQUFBOzRCQUN4RCxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsR0FBRyxNQUFNLENBQUMsSUFBSSxLQUFLLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFBOzRCQUM5RCxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFBO3dCQUMzQyxDQUFDO29CQUNILENBQUM7Z0JBQ0gsQ0FBQztnQkFDRCxtQkFBbUI7b0JBQ2pCLDJEQUEyRCxDQUFBO1lBQy9ELENBQUM7aUJBQU0sQ0FBQztnQkFDTixPQUFPLENBQUMsR0FBRyxDQUFDLCtDQUErQyxDQUFDLENBQUE7Z0JBQzVELElBQUksQ0FBQztvQkFDSCxhQUFhLEdBQUcsTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQzt3QkFDOUMsY0FBYyxFQUNaLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLGdCQUFnQixFQUFFLE9BQU87NEJBQzNDLGdCQUFnQixDQUFDLE9BQU87cUJBQzNCLENBQUMsQ0FBQTtnQkFDSixDQUFDO2dCQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7b0JBQ2IsTUFBTSxHQUFHLEdBQUcsR0FBRyxZQUFZLEtBQUssQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsZUFBZSxDQUFBO29CQUNoRSxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsZ0NBQWdDLEdBQUcsR0FBRyxDQUFDLENBQUE7Z0JBQ3BFLENBQUM7WUFDSCxDQUFDO1FBQ0gsQ0FBQztRQUNELElBQUksaUJBQXFDLENBQUE7UUFDekMsSUFDRSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLGFBQWEsRUFBRSxZQUFZLEVBQUUsc0JBQXNCO1lBQ3BFLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLGFBQWEsRUFBRSxZQUFZLEVBQUUsU0FBUyxDQUFDO1lBQzNELElBQUksQ0FBQyxNQUFNLENBQUMsZUFBZSxDQUFDLFNBQVMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUNoRCxDQUFDO1lBQ0QsT0FBTyxDQUFDLEdBQUcsQ0FBQyxzREFBc0QsQ0FBQyxDQUFBO1lBQ25FLElBQUksQ0FBQztnQkFDSCxNQUFNLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFBO2dCQUMvQixNQUFNLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxXQUFXLENBQUMsQ0FBQTtnQkFDeEMsTUFBTSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxDQUFDLENBQUE7Z0JBQ3BDLE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUM7b0JBQzVCLGNBQWMsRUFDWixJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsRUFBRSxLQUFLLElBQUksZ0JBQWdCLENBQUMsS0FBSztpQkFDdEUsQ0FBQyxDQUFBO2dCQUNGLGtCQUFrQixHQUFHLE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUM7b0JBQzNDLGNBQWMsRUFDWixJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsRUFBRSxhQUFhO3dCQUNqRCxnQkFBZ0IsQ0FBQyxhQUFhO2lCQUNqQyxDQUFDLENBQUE7WUFDSixDQUFDO1lBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztnQkFDYixNQUFNLEdBQUcsR0FBRyxHQUFHLFlBQVksS0FBSyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxlQUFlLENBQUE7Z0JBQ2hFLGlCQUFpQixHQUFHLGdDQUFnQyxHQUFHLEdBQUcsQ0FBQTtnQkFDMUQsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsU0FBUyxFQUFFLEdBQUcsQ0FBQyxDQUFBO1lBQ2pDLENBQUM7UUFDSCxDQUFDO1FBQ0QsT0FBTyxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsQ0FBQTtRQUMxQixNQUFNLGFBQWEsR0FBRyxXQUFXO2FBQzlCLEdBQUcsQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFLENBQ1osSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsV0FBVyxFQUFFLGFBQWEsRUFBRSxtQkFBbUIsQ0FBQyxDQUN0RTthQUNBLElBQUksRUFBRSxDQUFBO1FBQ1QsSUFBSSxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztZQUMzQixPQUFPLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLENBQUE7WUFDbEMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLGFBQWEsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQTtRQUNyRCxDQUFDO1FBRUQsdUhBQXVIO1FBQ3ZILE1BQU0saUJBQWlCLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsU0FBUyxJQUFJLEVBQUUsQ0FBQTtRQUUzRCxJQUNFLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLGFBQWEsRUFBRSxlQUFlLEVBQUUsd0JBQXdCLEVBQzFFLENBQUM7WUFDRCxJQUFJLHFCQUFxQixHQUN2Qiw0SkFBNEosQ0FBQTtZQUM5SixJQUFJLG1CQUFtQixFQUFFLENBQUM7Z0JBQ3hCLHFCQUFxQixHQUFHLG1CQUFtQixDQUFBO1lBQzdDLENBQUM7WUFDRCxJQUFJLGFBQWEsRUFBRSxDQUFDO2dCQUNsQixNQUFNLGVBQWUsR0FBRyxDQUFDLFVBQWtCLEVBQUUsRUFBRTtvQkFDN0MsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO3dCQUM3QixNQUFNLENBQUMsV0FBVyxFQUFFLFdBQVcsQ0FBQyxHQUFHLFVBQVUsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUE7d0JBQ3hELE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDLElBQUksQ0FDaEQsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUNMLEVBQUUsQ0FBQyxXQUFXLEtBQUssV0FBVyxJQUFJLEVBQUUsQ0FBQyxXQUFXLEtBQUssV0FBVyxDQUNuRSxDQUFBO3dCQUNELElBQUksWUFBWSxFQUFFLENBQUM7NEJBQ2pCLE9BQU8sWUFBWSxDQUFDLE1BQU0sQ0FBQTt3QkFDNUIsQ0FBQztvQkFDSCxDQUFDO29CQUNELE9BQU8sVUFBVSxDQUFBO2dCQUNuQixDQUFDLENBQUE7Z0JBQ0QsTUFBTSxrQkFBa0IsR0FBRyxDQUFDLFVBQWtCLEVBQUUsRUFBRTtvQkFDaEQsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO3dCQUM3QixNQUFNLENBQUMsV0FBVyxFQUFFLFdBQVcsQ0FBQyxHQUFHLFVBQVUsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUE7d0JBQ3hELE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDLElBQUksQ0FDaEQsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUNMLEVBQUUsQ0FBQyxXQUFXLEtBQUssV0FBVyxJQUFJLEVBQUUsQ0FBQyxXQUFXLEtBQUssV0FBVyxDQUNuRSxDQUFBO3dCQUNELElBQUksWUFBWSxFQUFFLENBQUM7NEJBQ2pCLE9BQU8sWUFBWSxDQUFDLElBQUksQ0FBQTt3QkFDMUIsQ0FBQztvQkFDSCxDQUFDO29CQUNELE9BQU8sU0FBUyxDQUFBO2dCQUNsQixDQUFDLENBQUE7Z0JBRUQsTUFBTSxlQUFlLEdBQUcsYUFBYTtxQkFDbEMsTUFBTSxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsTUFBTSxLQUFLLE1BQU0sQ0FBQztxQkFDcEMsR0FBRyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUU7b0JBQ1YsTUFBTSxNQUFNLEdBQUcsZUFBZSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQTtvQkFDdkMsTUFBTSxTQUFTLEdBQUcsa0JBQWtCLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFBO29CQUM3QyxPQUFPLEtBQUssU0FBUyxLQUFLLE1BQU0sd0JBQXdCLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUE7Z0JBQy9FLENBQUMsQ0FBQyxDQUFBO2dCQUNKLE1BQU0sa0JBQWtCLEdBQUcsYUFBYTtxQkFDckMsTUFBTSxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsTUFBTSxLQUFLLE1BQU0sQ0FBQztxQkFDcEMsR0FBRyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUU7b0JBQ1YsTUFBTSxNQUFNLEdBQUcsZUFBZSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQTtvQkFDdkMsT0FBTyxPQUFPLEVBQUUsQ0FBQyxJQUFJLE9BQU8sTUFBTSxHQUFHLENBQUE7Z0JBQ3ZDLENBQUMsQ0FBQyxDQUFBO2dCQUNKLHFCQUFxQixJQUFJLG9CQUFvQixlQUFlLENBQUMsTUFBTSxLQUFLLENBQUE7Z0JBQ3hFLHFCQUFxQixJQUFJLEdBQUcsZUFBZSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFBO2dCQUM1RCxxQkFBcUIsSUFBSSx3QkFBd0Isa0JBQWtCLENBQUMsTUFBTSxLQUFLLENBQUE7Z0JBQy9FLHFCQUFxQixJQUFJLEdBQUcsa0JBQWtCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUE7WUFDN0QsQ0FBQztZQUNELElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxxQkFBcUIsQ0FBQyxDQUFBO1lBQ2hELGFBQWEsQ0FBQyxJQUFJLENBQUM7Z0JBQ2pCLElBQUksRUFBRSx1QkFBdUI7Z0JBQzdCLE1BQU0sRUFBRSxxQkFBcUI7Z0JBQzdCLGFBQWEsRUFBRSxVQUFVO2dCQUN6QixLQUFLLEVBQUUsQ0FBQztnQkFDUixTQUFTLEVBQUUsQ0FBQzthQUNiLENBQUMsQ0FBQTtRQUNKLENBQUM7UUFDRCxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLGFBQWEsRUFBRSxZQUFZLEVBQUUsc0JBQXNCLEVBQUUsQ0FBQztZQUMxRSxNQUFNLGdCQUFnQixHQUFHLGtCQUFrQixFQUFFLE1BQU0sQ0FDakQsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEtBQUssTUFBTSxDQUNyQyxDQUFDLE1BQU0sQ0FBQTtZQUNSLE1BQU0sY0FBYyxHQUFHLGtCQUFrQixFQUFFLE1BQU0sQ0FBQTtZQUNqRCxJQUFJLGlCQUFpQixHQUNuQiwrSkFBK0osQ0FBQTtZQUNqSyxJQUFJLGlCQUFpQixFQUFFLENBQUM7Z0JBQ3RCLGlCQUFpQixJQUFJLGlCQUFpQixDQUFBO1lBQ3hDLENBQUM7WUFDRCxpQkFBaUIsSUFBSSxtQ0FBbUMsZ0JBQWdCLE1BQU0sY0FBYyxNQUFNLENBQUE7WUFDbEcsSUFBSSxrQkFBa0IsSUFBSSxrQkFBa0IsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQ3hELEtBQUssTUFBTSxNQUFNLElBQUksa0JBQWtCLEVBQUUsQ0FBQztvQkFDeEMsaUJBQWlCLElBQUksS0FBSyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksTUFBTSxDQUFDLElBQUksSUFBSSxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxTQUFTLEdBQUcsTUFBTSxDQUFDLE1BQU0sR0FBRyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFBO2dCQUNySCxDQUFDO2dCQUNELGlCQUFpQixJQUFJLE9BQU8sTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLGlCQUFpQixFQUFFLEVBQUUsQ0FBQTtZQUN0RSxDQUFDO1lBQ0QsYUFBYSxDQUFDLElBQUksQ0FBQztnQkFDakIsSUFBSSxFQUFFLDhCQUE4QjtnQkFDcEMsTUFBTSxFQUFFLGlCQUFpQjtnQkFDekIsYUFBYSxFQUFFLFVBQVU7Z0JBQ3pCLEtBQUssRUFBRSxDQUFDO2dCQUNSLFNBQVMsRUFBRSxDQUFDO2dCQUNaLElBQUksRUFBRSx1QkFBdUI7Z0JBQzdCLFVBQVUsRUFBRTtvQkFDVixJQUFJLEVBQUUsUUFBUTtvQkFDZCxVQUFVLEVBQUUsTUFBTTtpQkFDbkI7YUFDRixDQUFDLENBQUE7WUFDRixNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLG9CQUFvQixFQUFFLENBQUE7WUFDdkQsSUFBSSxXQUFXLEVBQUUsQ0FBQztnQkFDaEIsaUJBQWlCLENBQUMsSUFBSSxDQUFDO29CQUNyQixJQUFJLEVBQUUsd0NBQXdDO29CQUM5QyxJQUFJLEVBQUUsV0FBVztvQkFDakIsSUFBSSxFQUFFO3dCQUNKLE1BQU0sRUFBRSxLQUFLO3dCQUNiLE9BQU8sRUFBRSxXQUFXO3FCQUNyQjtpQkFDRixDQUFDLENBQUE7WUFDSixDQUFDO1FBQ0gsQ0FBQztRQUVELHVFQUF1RTtRQUN2RSxNQUFNLGFBQWEsR0FBRyxNQUFNLE9BQU8sQ0FBQyxHQUFHLENBQ3JDLGlCQUFpQjthQUNkLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQzthQUNyQixHQUFHLENBQUMsS0FBSyxFQUFFLFFBQVEsRUFBRSxFQUFFO1lBQ3RCLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUNiLFNBQVMsRUFDVCwwQkFBMEIsUUFBUSxDQUFDLElBQUksT0FBTyxRQUFRLENBQUMsSUFBSSxFQUFFLENBQzlELENBQUE7WUFDRCxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFBO1lBQzlELElBQUksQ0FBQztnQkFDSCxNQUFNLE1BQU0sQ0FBQyxZQUFZLENBQUMsQ0FBQTtnQkFDMUIsT0FBTztvQkFDTCxJQUFJLEVBQUUsUUFBUSxDQUFDLElBQUk7b0JBQ25CLElBQUksRUFBRSxZQUFZO29CQUNsQixJQUFJLEVBQUUsUUFBUSxDQUFDLElBQUk7aUJBQ3BCLENBQUE7WUFDSCxDQUFDO1lBQUMsTUFBTSxDQUFDO2dCQUNQLE9BQU8sQ0FBQyxLQUFLLENBQ1gsOEJBQThCLFFBQVEsQ0FBQyxJQUFJLFlBQVksUUFBUSxDQUFDLElBQUksRUFBRSxDQUN2RSxDQUFBO2dCQUNELE9BQU8sU0FBUyxDQUFBO1lBQ2xCLENBQUM7UUFDSCxDQUFDLENBQUMsQ0FDTCxDQUFBO1FBRUQsT0FBTztZQUNMLElBQUksRUFBRSxVQUFVO1lBQ2hCLEtBQUssRUFBRSxhQUFhO1lBQ3BCLE1BQU0sRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsRUFBRTtZQUNuQyxTQUFTLEVBQUUsSUFBSSxDQUFDLGlCQUFpQjtnQkFDL0IsQ0FBQyxDQUFDLEVBQUU7Z0JBQ0osQ0FBQyxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLElBQUksS0FBSyxTQUFTLENBQUM7U0FDdkQsQ0FBQTtJQUNILENBQUM7Q0FDRiJ9