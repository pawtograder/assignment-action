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
    output: string;
    output_format?: OutputFormat;
};
export declare abstract class Builder {
    protected logger: Logger;
    protected gradingDir: string;
    protected regressionTestJob?: number | undefined;
    constructor(logger: Logger, gradingDir: string, regressionTestJob?: number | undefined);
    executeCommandAndGetOutput(command: string, args: string[], logger: Logger, ignoreFailures?: boolean): Promise<{
        returnCode: number;
        output: string;
    }>;
    abstract lint(): Promise<LintResult>;
    abstract test(): Promise<TestResult[]>;
    abstract mutationTest(): Promise<MutantResult[]>;
    abstract buildClean(): Promise<void>;
}
