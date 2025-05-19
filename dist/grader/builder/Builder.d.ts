import Logger from '../Logger.js';
import { OutputFormat } from '../types.js';
export type LintResult = {
    status: 'pass' | 'fail';
    output: string;
    output_format?: OutputFormat;
};
export type TestResult = {
    name: string;
    status: 'pass' | 'fail';
    output: string;
    output_format?: OutputFormat;
};
export type MutantResult = {
    name: string;
    location: string;
    status: 'pass' | 'fail';
    tests: string[];
    output: string;
    output_format?: OutputFormat;
};
export declare abstract class Builder {
    protected logger: Logger;
    protected gradingDir: string;
    protected regressionTestJob?: number | undefined;
    constructor(logger: Logger, gradingDir: string, regressionTestJob?: number | undefined);
    executeCommandAndGetOutput(command: string, args: string[], logger: Logger, timeoutSeconds?: number, ignoreFailures?: boolean): Promise<{
        returnCode: number;
        output: string;
    }>;
    abstract lint(): Promise<LintResult>;
    abstract test(options: BuildStepOptions): Promise<TestResult[]>;
    abstract mutationTest(options: BuildStepOptions): Promise<MutantResult[]>;
    abstract buildClean(options: BuildStepOptions): Promise<void>;
    abstract getCoverageReport(): Promise<string>;
    abstract getCoverageReportDir(): string | null;
}
export type BuildStepOptions = {
    timeoutSeconds?: number;
};
