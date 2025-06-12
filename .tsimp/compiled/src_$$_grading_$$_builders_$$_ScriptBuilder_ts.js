import { Builder } from './Builder.js';
import { processXMLResults } from './surefire.js';
import { parseLintingReports } from './checkstyle.js';
import { glob } from 'glob';
import * as fs from 'fs';
async function parseMutationResultsFromJson(path_glob, logger) {
    const mutantResults = await Promise.all((await glob(path_glob)).map(async (file) => {
        const data = fs.readFileSync(file, 'utf-8');
        logger.log('hidden', `Reading mutation test results from ${file}`);
        const ret = (await JSON.parse(data));
        return ret;
    }));
    return mutantResults;
}
export default class ScriptBuilder extends Builder {
    async installDependencies() {
        const { returnCode, output } = await this.executeCommandAndGetOutput('./install_dependencies.sh', [], this.logger);
        if (returnCode !== 0) {
            throw new Error(`Unable to invoke dependency installation script. Here is the output that was produced on the grading server 
        when trying to install dependencies: ${output}`);
        }
    }
    async lint() {
        await this.installDependencies();
        this.logger.log('hidden', 'Generating linting reports with provided script');
        const { returnCode, output } = await this.executeCommandAndGetOutput('./generate_linting_reports.sh', [], this.logger);
        if (returnCode !== 0) {
            throw new Error(`Unable to invoke linting script. Here is the output that was produced on the grading server 
        when trying to generate linting reports: ${output}`);
        }
        return parseLintingReports(`${this.gradingDir}/linting_reports/*.xml`, this.logger);
    }
    async getCoverageReport() {
        await this.installDependencies();
        this.logger.log('hidden', 'Generating coverage report with provided script');
        // Script to generate html coverage report
        await this.executeCommandAndGetOutput('./generate_coverage_reports.sh', [], this.logger);
        // Textual coverage report
        const { returnCode, output } = await this.executeCommandAndGetOutput('coverage', ['report', '-m'], this.logger);
        if (returnCode !== 0) {
            throw new Error(`Unable to generate coverage report. Here is the output that was produced on the grading server 
        when trying to generate coverage reports: ${output}`);
        }
        return output;
    }
    getCoverageReportDir() {
        return 'coverage_reports/';
    }
    async test({ timeoutSeconds }) {
        await this.installDependencies();
        this.logger.log('hidden', 'Running tests with provided script');
        const { returnCode, output } = await this.executeCommandAndGetOutput('./test_runner.sh', [], this.logger, timeoutSeconds, true);
        if (returnCode !== 0) {
            throw new Error(`Unable to invoke test runner script. Here is the output that was produced on the grading server 
        when trying to run tests: ${output}`);
        }
        //Note: This method assumes that test_runner.sh generates xml files containing checkstyle compatible test results
        return await processXMLResults(`${this.gradingDir}/test_results/*.xml`, this.logger);
    }
    async mutationTest({ timeoutSeconds }) {
        await this.installDependencies();
        this.logger.log('hidden', 'Running mutation tests with provided script');
        const { returnCode, output } = await this.executeCommandAndGetOutput('./mutation_test_runner.sh', [], this.logger, timeoutSeconds, true);
        if (returnCode !== 0) {
            throw new Error(`Unable to invoke mutation testing script. Here is the output that was produced on the grading server 
        when trying to run mutation tests: ${output}`);
        }
        //Note: This method assumes that mutation_test_runner.sh generates JSON files containing MutantResults
        // in the mutation_test_results directory.
        return await parseMutationResultsFromJson(`${this.gradingDir}/mutation_test_results/*.json`, this.logger);
    }
    async buildClean({ timeoutSeconds }) {
        await this.executeCommandAndGetOutput('rm', ['-rf', 'test_results', 'coverage_reports', 'mutation_test_results'], this.logger, timeoutSeconds, true);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2NyaXB0QnVpbGRlci5qcyIsInNvdXJjZVJvb3QiOiIvVXNlcnMvc21hcmFudC9Eb2N1bWVudHMvVW5pdmVyc2l0eSBzdHVmZi9TdW1tZXItMjAyNS9Db3Vyc2UgRGV2L2Fzc2lnbm1lbnQtYWN0aW9uLyIsInNvdXJjZXMiOlsic3JjL2dyYWRpbmcvYnVpbGRlcnMvU2NyaXB0QnVpbGRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQ0wsT0FBTyxFQUtSLE1BQU0sY0FBYyxDQUFBO0FBQ3JCLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGVBQWUsQ0FBQTtBQUNqRCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQTtBQUVyRCxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sTUFBTSxDQUFBO0FBQzNCLE9BQU8sS0FBSyxFQUFFLE1BQU0sSUFBSSxDQUFBO0FBRXhCLEtBQUssVUFBVSw0QkFBNEIsQ0FDekMsU0FBaUIsRUFDakIsTUFBYztJQUVkLE1BQU0sYUFBYSxHQUFtQixNQUFNLE9BQU8sQ0FBQyxHQUFHLENBQ3JELENBQUMsTUFBTSxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxFQUFFO1FBQ3pDLE1BQU0sSUFBSSxHQUFHLEVBQUUsQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxDQUFBO1FBQzNDLE1BQU0sQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLHNDQUFzQyxJQUFJLEVBQUUsQ0FBQyxDQUFBO1FBQ2xFLE1BQU0sR0FBRyxHQUFHLENBQUMsTUFBTSxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFpQixDQUFBO1FBQ3BELE9BQU8sR0FBRyxDQUFBO0lBQ1osQ0FBQyxDQUFDLENBQ0gsQ0FBQTtJQUNELE9BQU8sYUFBYSxDQUFBO0FBQ3RCLENBQUM7QUFDRCxNQUFNLENBQUMsT0FBTyxPQUFPLGFBQWMsU0FBUSxP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