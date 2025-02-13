import { Builder, LintResult, MutantResult, TestResult } from './Builder.js';
export default class GradleBuilder extends Builder {
    lint(): Promise<LintResult>;
    test(): Promise<TestResult[]>;
    mutationTest(): Promise<MutantResult[]>;
    buildClean(): Promise<void>;
}
