type JacocoCsvRecord = {
    INSTRUCTION_MISSED: string;
    INSTRUCTION_COVERED: string;
    BRANCH_MISSED: string;
    BRANCH_COVERED: string;
    LINE_MISSED: string;
    LINE_COVERED: string;
    COMPLEXITY_MISSED: string;
    COMPLEXITY_COVERED: string;
    METHOD_MISSED: string;
    METHOD_COVERED: string;
    PACKAGE: string;
    CLASS: string;
};
export declare function parseJacocoCsv(file: string): Promise<JacocoCsvRecord[]>;
export declare function getCoverageSummary(records: JacocoCsvRecord[]): string;
export {};
