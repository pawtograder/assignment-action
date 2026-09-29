export interface MutationLocation {
    clazz: string;
    method: string;
    methodDescription: string;
    lineNumber: number;
    mutator: string;
    index: number;
    block: number;
    killingTest?: string;
}
export interface Mutation {
    detected: boolean;
    status: 'KILLED' | 'SURVIVED' | 'NO_COVERAGE' | 'TIMED_OUT' | 'MEMORY_ERROR' | 'RUN_ERROR' | 'NON_VIABLE';
    numberOfTestsRun: number;
    sourceFile: string;
    mutatedClass: string;
    mutatedMethod: string;
    methodDescription: string;
    lineNumber: number;
    mutator: string;
    index: number;
    block: number;
    killingTest?: string;
    killingTests?: string;
    description: string;
}
export interface MutationTestSummary {
    statistics: {
        totalMutations: number;
        killed: number;
        survived: number;
        noCoverage: number;
        timedOut: number;
        memoryError: number;
        runError: number;
        nonViable: number;
        mutationScore: number;
    };
    mutations: Mutation[];
}
export declare function parsePitestXml(filePath: string): MutationTestSummary;
/**
 * PIT statuses meaning the mutant never ran against the tests, so neither
 * "killed" nor "survived" applies. PIT's console summary counts RUN_ERROR as
 * detected ("Killed 1 (100%)"), which hides these from instructors.
 */
export declare const UNEVALUATED_MUTANT_STATUSES: ReadonlySet<string>;
/**
 * Extracts the distinct reasons PIT gave for mutants that errored, with counts,
 * from the pitest task output. Each reason is the exception line that follows
 * PIT's "Error during mutation test" warning, e.g. "class redefinition failed:
 * attempted to change superclass or interfaces" for a pre-baked mutant whose
 * shape differs from the class it replaces.
 */
export declare function extractPitestRunErrorReasons(output: string): {
    reason: string;
    count: number;
}[];
export declare function getMutationsInRange(report: MutationTestSummary, className: string, startLine: number, endLine: number): Mutation[];
