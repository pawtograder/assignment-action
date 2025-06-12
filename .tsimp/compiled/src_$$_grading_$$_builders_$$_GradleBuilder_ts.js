import { Builder } from './Builder.js';
import { parseLintingReports } from './checkstyle.js';
import { getCoverageSummary, parseJacocoCsv } from './jacoco.js';
import { parsePitestXml } from './pitest.js';
import { processXMLResults } from './surefire.js';
export default class GradleBuilder extends Builder {
    async lint() {
        this.logger.log('hidden', 'Linting with Gradle');
        const { returnCode, output } = await this.executeCommandAndGetOutput('./gradlew', [
            '--console=plain',
            'clean',
            'checkstyleMain',
            'checkstyleTest',
            '-x',
            'compileJava',
            '-x',
            'compileTestJava'
        ], this.logger);
        if (returnCode !== 0) {
            throw new Error(`Unable to invoke Gradle checkstyle task. Here is the output that Gradle produced on the grading server: ${output}`);
        }
        return parseLintingReports(`${this.gradingDir}/build/reports/checkstyle/*.xml`, this.logger);
    }
    async getCoverageReport() {
        this.logger.log('hidden', 'Getting coverage report with Gradle');
        const coverageReport = `${this.gradingDir}/build/reports/jacoco/test/jacocoTestReport.csv`;
        try {
            const coverageReportContents = await parseJacocoCsv(coverageReport);
            return getCoverageSummary(coverageReportContents);
        }
        catch (e) {
            this.logger.log('visible', e.message);
            return 'Coverage report not found';
        }
    }
    getCoverageReportDir() {
        return 'build/reports/jacoco/test/html';
    }
    async test({ timeoutSeconds }) {
        this.logger.log('hidden', 'Testing with Gradle');
        const { returnCode } = await this.executeCommandAndGetOutput('./gradlew', ['--console=plain', 'test'], this.logger, timeoutSeconds, true);
        if (returnCode !== 0) {
            this.logger.log('hidden', `Gradle test failed, return code: ${returnCode}`);
        }
        return await processXMLResults(`${this.gradingDir}/build/test-results/test/TEST-*.xml`, this.logger);
    }
    async mutationTest({ timeoutSeconds }) {
        this.logger.log('hidden', 'Running Pitest');
        await this.executeCommandAndGetOutput('./gradlew', ['--console=plain', 'pitest'], this.logger, timeoutSeconds, false);
        this.logger.log('hidden', 'Reading mutation test results');
        const mutationTestResults = `${this.gradingDir}/build/reports/pitest/mutations.xml`;
        const mutationTestResultsContents = await parsePitestXml(mutationTestResults);
        return mutationTestResultsContents.mutations.map((eachMutation) => {
            return {
                name: eachMutation.mutator,
                location: eachMutation.mutatedClass + ':' + eachMutation.lineNumber,
                status: eachMutation.status === 'KILLED' ? 'pass' : 'fail',
                tests: eachMutation.killingTests
                    ? eachMutation.killingTests.split('|')
                    : [],
                output: eachMutation.killingTest
                    ? 'Found by ' + eachMutation.killingTest
                    : '',
                output_format: 'text'
            };
        });
    }
    async buildClean({ timeoutSeconds }) {
        this.logger.log('hidden', 'Building clean with Gradle');
        const { returnCode, output } = await this.executeCommandAndGetOutput('./gradlew', ['--console=plain', 'clean', '-x', 'test', 'build'], this.logger, timeoutSeconds, true);
        if (returnCode !== 0) {
            throw new Error(`Gradle build failed. Please check that running the command 'gradle clean build' completes without compilation errors before resubmitting. Here is the output that gradle produced on the grading server: ${output}`);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiR3JhZGxlQnVpbGRlci5qcyIsInNvdXJjZVJvb3QiOiIvVXNlcnMvc21hcmFudC9Eb2N1bWVudHMvVW5pdmVyc2l0eSBzdHVmZi9TdW1tZXItMjAyNS9Db3Vyc2UgRGV2L2Fzc2lnbm1lbnQtYWN0aW9uLyIsInNvdXJjZXMiOlsic3JjL2dyYWRpbmcvYnVpbGRlcnMvR3JhZGxlQnVpbGRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQ0wsT0FBTyxFQUtSLE1BQU0sY0FBYyxDQUFBO0FBQ3JCLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGlCQUFpQixDQUFBO0FBQ3JELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxjQUFjLEVBQUUsTUFBTSxhQUFhLENBQUE7QUFDaEUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGFBQWEsQ0FBQTtBQUM1QyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxlQUFlLENBQUE7QUFFakQsTUFBTSxDQUFDLE9BQU8sT0FBTyxhQUFjLFNBQVEsT0FBTztJQUNoRCxLQUFLLENBQUMsSUFBSTtRQUNSLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxxQkFBcUIsQ0FBQyxDQUFBO1FBQ2hELE1BQU0sRUFBRSxVQUFVLEVBQUUsTUFBTSxFQUFFLEdBQUcsTUFBTSxJQUFJLENBQUMsMEJBQTBCLENBQ2xFLFdBQVcsRUFDWDtZQUNFLGlCQUFpQjtZQUNqQixPQUFPO1lBQ1AsZ0JBQWdCO1lBQ2hCLGdCQUFnQjtZQUNoQixJQUFJO1lBQ0osYUFBYTtZQUNiLElBQUk7WUFDSixpQkFBaUI7U0FDbEIsRUFDRCxJQUFJLENBQUMsTUFBTSxDQUNaLENBQUE7UUFDRCxJQUFJLFVBQVUsS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUNyQixNQUFNLElBQUksS0FBSyxDQUNiLDJHQUEyRyxNQUFNLEVBQUUsQ0FDcEgsQ0FBQTtRQUNILENBQUM7UUFDRCxPQUFPLG1CQUFtQixDQUN4QixHQUFHLElBQUksQ0FBQyxVQUFVLGlDQUFpQyxFQUNuRCxJQUFJLENBQUMsTUFBTSxDQUNaLENBQUE7SUFDSCxDQUFDO0lBQ0QsS0FBSyxDQUFDLGlCQUFpQjtRQUNyQixJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUscUNBQXFDLENBQUMsQ0FBQTtRQUNoRSxNQUFNLGNBQWMsR0FBRyxHQUFHLElBQUksQ0FBQyxVQUFVLGlEQUFpRCxDQUFBO1FBQzFGLElBQUksQ0FBQztZQUNILE1BQU0sc0JBQXNCLEdBQUcsTUFBTSxjQUFjLENBQUMsY0FBYyxDQUFDLENBQUE7WUFDbkUsT0FBTyxrQkFBa0IsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFBO1FBQ25ELENBQUM7UUFBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ1gsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsU0FBUyxFQUFHLENBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQTtZQUNoRCxPQUFPLDJCQUEyQixDQUFBO1FBQ3BDLENBQUM7SUFDSCxDQUFDO0lBQ0Qsb0JBQW9CO1FBQ2xCLE9BQU8sZ0NBQWdDLENBQUE7SUFDekMsQ0FBQztJQUNELEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRSxjQUFjLEVBQW9CO1FBQzdDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxxQkFBcUIsQ0FBQyxDQUFBO1FBQ2hELE1BQU0sRUFBRSxVQUFVLEVBQUUsR0FBRyxNQUFNLElBQUksQ0FBQywwQkFBMEIsQ0FDMUQsV0FBVyxFQUNYLENBQUMsaUJBQWlCLEVBQUUsTUFBTSxDQUFDLEVBQzNCLElBQUksQ0FBQyxNQUFNLEVBQ1gsY0FBYyxFQUNkLElBQUksQ0FDTCxDQUFBO1FBQ0QsSUFBSSxVQUFVLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDckIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQ2IsUUFBUSxFQUNSLG9DQUFvQyxVQUFVLEVBQUUsQ0FDakQsQ0FBQTtRQUNILENBQUM7UUFDRCxPQUFPLE1BQU0saUJBQWlCLENBQzVCLEdBQUcsSUFBSSxDQUFDLFVBQVUscUNBQXFDLEVBQ3ZELElBQUksQ0FBQyxNQUFNLENBQ1osQ0FBQTtJQUNILENBQUM7SUFDRCxLQUFLLENBQUMsWUFBWSxDQUFDLEVBQ2pCLGNBQWMsRUFDRztRQUNqQixJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQTtRQUMzQyxNQUFNLElBQUksQ0FBQywwQkFBMEIsQ0FDbkMsV0FBVyxFQUNYLENBQUMsaUJBQWlCLEVBQUUsUUFBUSxDQUFDLEVBQzdCLElBQUksQ0FBQyxNQUFNLEVBQ1gsY0FBYyxFQUNkLEtBQUssQ0FDTixDQUFBO1FBQ0QsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLCtCQUErQixDQUFDLENBQUE7UUFDMUQsTUFBTSxtQkFBbUIsR0FBRyxHQUFHLElBQUksQ0FBQyxVQUFVLHFDQUFxQyxDQUFBO1FBQ25GLE1BQU0sMkJBQTJCLEdBQy9CLE1BQU0sY0FBYyxDQUFDLG1CQUFtQixDQUFDLENBQUE7UUFDM0MsT0FBTywyQkFBMkIsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsWUFBWSxFQUFFLEVBQUU7WUFDaEUsT0FBTztnQkFDTCxJQUFJLEVBQUUsWUFBWSxDQUFDLE9BQU87Z0JBQzFCLFFBQVEsRUFBRSxZQUFZLENBQUMsWUFBWSxHQUFHLEdBQUcsR0FBRyxZQUFZLENBQUMsVUFBVTtnQkFDbkUsTUFBTSxFQUFFLFlBQVksQ0FBQyxNQUFNLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE1BQU07Z0JBQzFELEtBQUssRUFBRSxZQUFZLENBQUMsWUFBWTtvQkFDOUIsQ0FBQyxDQUFDLFlBQVksQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQztvQkFDdEMsQ0FBQyxDQUFDLEVBQUU7Z0JBQ04sTUFBTSxFQUFFLFlBQVksQ0FBQyxXQUFXO29CQUM5QixDQUFDLENBQUMsV0FBVyxHQUFHLFlBQVksQ0FBQyxXQUFXO29CQUN4QyxDQUFDLENBQUMsRUFBRTtnQkFDTixhQUFhLEVBQUUsTUFBTTthQUN0QixDQUFBO1FBQ0gsQ0FBQyxDQUFDLENBQUE7SUFDSixDQUFDO0lBQ0QsS0FBSyxDQUFDLFVBQVUsQ0FBQyxFQUFFLGNBQWMsRUFBb0I7UUFDbkQsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLDRCQUE0QixDQUFDLENBQUE7UUFDdkQsTUFBTSxFQUFFLFVBQVUsRUFBRSxNQUFNLEVBQUUsR0FBRyxNQUFNLElBQUksQ0FBQywwQkFBMEIsQ0FDbEUsV0FBVyxFQUNYLENBQUMsaUJBQWlCLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEVBQ25ELElBQUksQ0FBQyxNQUFNLEVBQ1gsY0FBYyxFQUNkLElBQUksQ0FDTCxDQUFBO1FBQ0QsSUFBSSxVQUFVLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDckIsTUFBTSxJQUFJLEtBQUssQ0FDYiw0TUFBNE0sTUFBTSxFQUFFLENBQ3JOLENBQUE7UUFDSCxDQUFDO0lBQ0gsQ0FBQztDQUNGIn0=