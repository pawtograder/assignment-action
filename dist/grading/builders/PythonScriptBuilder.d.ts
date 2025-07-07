import { Builder, BuildStepOptions, LintResult, MutantResult, TestResult } from './Builder.js';
import Logger from '../Logger.js';
import { ScriptInfo } from '../types.js';
export default class PythonScriptBuilder extends Builder {
    protected logger: Logger;
    protected gradingDir: string;
    protected script_info: ScriptInfo;
    protected regressionTestJob?: number | undefined;
    constructor(logger: Logger, gradingDir: string, script_info: ScriptInfo, regressionTestJob?: number | undefined);
    activateVenvAndExecuteCommand(command: string, timeoutSeconds?: number, ignoreFailures?: boolean): Promise<{
        returnCode: number;
        output: string;
    }>;
    setupVenv(dir: string, key: string): Promise<void>;
    lint(): Promise<LintResult>;
    getCoverageReport(): Promise<string>;
    getCoverageReportDir(): string;
    test({ timeoutSeconds }: BuildStepOptions): Promise<TestResult[]>;
    mutationTest({ timeoutSeconds }: BuildStepOptions): Promise<MutantResult[]>;
    buildClean({ timeoutSeconds }: BuildStepOptions): Promise<void>;
}
