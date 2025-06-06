export interface TestFailure {
    message: string;
    type: string;
    description: string;
    stackTrace?: string;
}
export interface TestCase {
    name: string;
    className: string;
    time: number;
    failure?: TestFailure;
    skipped?: boolean;
    error?: TestFailure;
}
export interface TestSuite {
    name: string;
    time: number;
    tests: number;
    errors: number;
    skipped: number;
    failures: number;
    testCases: TestCase[];
}
export interface SurefireReport {
    testSuites: TestSuite[];
    summary: {
        totalTests: number;
        totalErrors: number;
        totalFailures: number;
        totalSkipped: number;
        totalTime: number;
    };
}
export declare function parseSurefireXml(filePath: string): SurefireReport;
