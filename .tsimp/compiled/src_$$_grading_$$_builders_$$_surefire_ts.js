/* eslint-disable */
import { XMLParser } from 'fast-xml-parser';
import { readFileSync } from 'fs';
import { glob } from 'glob';
function trimJunitStackTrace(stackTrace) {
    if (!stackTrace) {
        return '';
    }
    const lines = stackTrace.split('\n');
    const idxOfJunitLine = lines.findIndex((line) => line.includes('org.junit.jupiter.engine.execution.MethodInvocation.proceed') || line.includes('org.junit.runners.BlockJUnit4ClassRunner'));
    if (idxOfJunitLine === -1) {
        return stackTrace;
    }
    let idxOfLastReflectionLineFromBottom = -1;
    for (let i = idxOfJunitLine - 1; i >= 0; i--) {
        if (!lines[i].includes('jdk.internal.reflect') &&
            !lines[i].includes('java.lang.reflect') &&
            !lines[i].includes('org.junit.platform.commons.util.ReflectionUtils')) {
            idxOfLastReflectionLineFromBottom = i + 1;
            break;
        }
    }
    if (idxOfLastReflectionLineFromBottom === -1) {
        return lines.slice(0, idxOfJunitLine).join('\n');
    }
    return lines.slice(0, idxOfLastReflectionLineFromBottom).join('\n');
}
function parseSurefireXml(filePath) {
    const xmlContent = readFileSync(filePath, 'utf-8');
    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '',
        textNodeName: '_text'
    });
    const parsed = parser.parse(xmlContent);
    // Initialize the report structure
    const report = {
        testSuites: [],
        summary: {
            totalTests: 0,
            totalErrors: 0,
            totalFailures: 0,
            totalSkipped: 0,
            totalTime: 0
        }
    };
    // Handle both single suite and multiple suite reports
    const suites = parsed.testsuite
        ? [parsed.testsuite]
        : parsed.testsuites?.testsuite || [];
    // Process each test suite
    report.testSuites = suites.map((suite) => {
        const testCases = [];
        // Convert test cases to array if needed
        const cases = suite.testcase
            ? Array.isArray(suite.testcase)
                ? suite.testcase
                : [suite.testcase]
            : [];
        // Process each test case
        cases.forEach((testCase) => {
            const tc = {
                name: testCase.name,
                className: testCase.classname,
                time: parseFloat(testCase.time || '0'),
                skipped: !!testCase.skipped
            };
            // Handle failures
            if (testCase.failure) {
                tc.failure = {
                    message: testCase.failure.message || '',
                    type: testCase.failure.type || '',
                    description: testCase.failure._text || '',
                    stackTrace: trimJunitStackTrace(testCase.failure._text || '')
                };
            }
            // Handle errors
            if (testCase.error) {
                tc.error = {
                    message: testCase.error.message || '',
                    type: testCase.error.type || '',
                    description: testCase.error._text || '',
                    stackTrace: trimJunitStackTrace(testCase.error._text || '')
                };
            }
            testCases.push(tc);
        });
        const testSuite = {
            name: suite.name,
            time: parseFloat(suite.time || '0'),
            tests: parseInt(suite.tests || '0', 10),
            errors: parseInt(suite.errors || '0', 10),
            skipped: parseInt(suite.skipped || '0', 10),
            failures: parseInt(suite.failures || '0', 10),
            testCases
        };
        // Update summary
        report.summary.totalTests += testSuite.tests;
        report.summary.totalErrors += testSuite.errors;
        report.summary.totalFailures += testSuite.failures;
        report.summary.totalSkipped += testSuite.skipped;
        report.summary.totalTime += testSuite.time;
        return testSuite;
    });
    return report;
}
export async function processXMLResults(path_glob, logger) {
    const testResultsContents = await Promise.all((await glob(path_glob)).map(async (file) => {
        logger.log('hidden', `Reading test results from ${file}`);
        const ret = await parseSurefireXml(file);
        return ret;
    }));
    const ret = testResultsContents.flatMap((result) => {
        return result.testSuites.flatMap((suite) => {
            return suite.testCases.map((test) => {
                const tr = {
                    name: `${suite.name}.${test.name}`,
                    status: test.failure || test.error ? 'fail' : 'pass',
                    output: test.failure?.stackTrace || test.error?.stackTrace || '',
                    output_format: 'text'
                };
                return tr;
            });
        });
    });
    return ret;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3VyZWZpcmUuanMiLCJzb3VyY2VSb290IjoiL1VzZXJzL3NtYXJhbnQvRG9jdW1lbnRzL1VuaXZlcnNpdHkgc3R1ZmYvU3VtbWVyLTIwMjUvQ291cnNlIERldi9hc3NpZ25tZW50LWFjdGlvbi8iLCJzb3VyY2VzIjpbInNyYy9ncmFkaW5nL2J1aWxkZXJzL3N1cmVmaXJlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLG9CQUFvQjtBQUNwQixPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0saUJBQWlCLENBQUE7QUFDM0MsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLElBQUksQ0FBQTtBQUNqQyxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sTUFBTSxDQUFBO0FBMEMzQixTQUFTLG1CQUFtQixDQUFDLFVBQWtCO0lBQzdDLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUNoQixPQUFPLEVBQUUsQ0FBQTtJQUNYLENBQUM7SUFDRCxNQUFNLEtBQUssR0FBRyxVQUFVLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFBO0lBQ3BDLE1BQU0sY0FBYyxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQ3BDLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FDUCxJQUFJLENBQUMsUUFBUSxDQUNYLDZEQUE2RCxDQUM5RCxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsMENBQTBDLENBQUMsQ0FDakUsQ0FBQTtJQUNELElBQUksY0FBYyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUM7UUFDMUIsT0FBTyxVQUFVLENBQUE7SUFDbkIsQ0FBQztJQUVELElBQUksaUNBQWlDLEdBQUcsQ0FBQyxDQUFDLENBQUE7SUFDMUMsS0FBSyxJQUFJLENBQUMsR0FBRyxjQUFjLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztRQUM3QyxJQUNFLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxzQkFBc0IsQ0FBQztZQUMxQyxD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