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
    status: 'KILLED' | 'SURVIVED' | 'NO_COVERAGE' | 'TIMED_OUT' | 'MEMORY_ERROR' | 'RUN_ERROR';
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
        mutationScore: number;
    };
    mutations: Mutation[];
}
export declare function parsePitestXml(filePath: string): MutationTestSummary;
export declare function getMutationsInRange(report: MutationTestSummary, className: string, startLine: number, endLine: number): Mutation[];
