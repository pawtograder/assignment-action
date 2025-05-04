import { Builder, LintResult, MutantResult, TestResult } from './Builder.js';
export default class GradleBuilder extends Builder {
    lint(): Promise<LintResult>;
    getCoverageReport(): Promise<string>;
    getCoverageReportDir(): string;
    test(): Promise<TestResult[]>;
    mutationTest(): Promise<MutantResult[]>;
    buildClean(): Promise<void>;
}
