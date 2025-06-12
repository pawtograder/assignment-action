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
        await this.executeCommandAndGetOutput('pip', ['install', '-r', 'requirements.txt'], this.logger);
    }
    async lint() {
        await this.installDependencies();
        this.logger.log('hidden', 'Linting with Pylint');
        const { returnCode, output } = await this.executeCommandAndGetOutput('./generate_linting_reports.sh', [], this.logger);
        if (returnCode !== 0) {
            throw new Error(`Unable to invoke pylint linting task. Here is the output that was produced on the grading server 
        when trying to generate linting reports: ${output}`);
        }
        return parseLintingReports(`${this.gradingDir}/pylint_reports/*.xml`, this.logger);
    }
    async getCoverageReport() {
        await this.installDependencies();
        this.logger.log('hidden', 'Generating python coverage report');
        // Script to generate html coverage report
        await this.executeCommandAndGetOutput('./generate_coverage_reports.sh', [], this.logger);
        // Textual coverage report
        const { returnCode, output } = await this.executeCommandAndGetOutput('coverage', ['report', '-m'], this.logger);
        if (returnCode !== 0 || !output) {
            throw new Error(`Unable to generate coverage report. Here is the output that was produced on the grading server 
        when trying to generate coverage reports: ${output ? output : '[no output was produced]'}`);
        }
        return output;
    }
    getCoverageReportDir() {
        return 'coverage_reports/';
    }
    async test({ timeoutSeconds }) {
        await this.installDependencies();
        this.logger.log('hidden', 'Unittesting with Python');
        const { returnCode } = await this.executeCommandAndGetOutput('python3', ['test_runner.py'], this.logger, timeoutSeconds, true);
        if (returnCode !== 0) {
            this.logger.log('hidden', `python test execution failed, return code: ${returnCode}`);
        }
        return await processXMLResults(`${this.gradingDir}/test_results/*.xml`, this.logger);
    }
    async mutationTest({ timeoutSeconds }) {
        await this.installDependencies();
        this.logger.log('hidden', 'Unittesting with Python');
        const { returnCode } = await this.executeCommandAndGetOutput('python3', ['mutation_test_runner.py'], this.logger, timeoutSeconds, true);
        if (returnCode !== 0) {
            this.logger.log('hidden', `Mutation test execution failed, return code: ${returnCode}`);
        }
        return await parseMutationResultsFromJson(`${this.gradingDir}/mutation_test_results/*.json`, this.logger);
    }
    async buildClean({ timeoutSeconds }) {
        await this.executeCommandAndGetOutput('rm', ['-rf', 'test_results', 'coverage_reports', 'mutation_test_results'], this.logger, timeoutSeconds, true);
        await this.executeCommandAndGetOutput('rm', ['-r', '.coverage'], this.logger, timeoutSeconds, true);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2NyaXB0QnVpbGRlci5qcyIsInNvdXJjZVJvb3QiOiIvVXNlcnMvc21hcmFudC9Eb2N1bWVudHMvVW5pdmVyc2l0eSBzdHVmZi9TdW1tZXItMjAyNS9Db3Vyc2UgRGV2L2Fzc2lnbm1lbnQtYWN0aW9uLyIsInNvdXJjZXMiOlsic3JjL2dyYWRpbmcvYnVpbGRlcnMvU2NyaXB0QnVpbGRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQ0wsT0FBTyxFQUtSLE1BQU0sY0FBYyxDQUFBO0FBQ3JCLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGVBQWUsQ0FBQTtBQUNqRCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQTtBQUVyRCxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sTUFBTSxDQUFBO0FBQzNCLE9BQU8sS0FBSyxFQUFFLE1BQU0sSUFBSSxDQUFBO0FBRXhCLEtBQUssVUFBVSw0QkFBNEIsQ0FDekMsU0FBaUIsRUFDakIsTUFBYztJQUVkLE1BQU0sYUFBYSxHQUFtQixNQUFNLE9BQU8sQ0FBQyxHQUFHLENBQ3JELENBQUMsTUFBTSxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxFQUFFO1FBQ3pDLE1BQU0sSUFBSSxHQUFHLEVBQUUsQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxDQUFBO1FBQzNDLE1BQU0sQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLHNDQUFzQyxJQUFJLEVBQUUsQ0FBQyxDQUFBO1FBQ2xFLE1BQU0sR0FBRyxHQUFHLENBQUMsTUFBTSxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFpQixDQUFBO1FBQ3BELE9BQU8sR0FBRyxDQUFBO0lBQ1osQ0FBQyxDQUFDLENBQ0gsQ0FBQTtJQUNELE9BQU8sYUFBYSxDQUFBO0FBQ3RCLENBQUM7QUFDRCxNQUFNLENBQUMsT0FBTyxPQUFPLGFBQWMsU0FBUSxP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