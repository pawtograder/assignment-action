import { OutputFormat, OutputVisibility } from './types.js';
export default class Logger {
    private regressionTestJob?;
    private output;
    constructor(regressionTestJob?: number | undefined);
    log(visibility: OutputVisibility, message: string): void;
    hasOutput(visibility: OutputVisibility): boolean;
    getEachOutput(): {
        hidden?: {
            output: string;
            output_format?: OutputFormat;
        } | undefined;
        visible?: {
            output: string;
            output_format?: OutputFormat;
        } | undefined;
        after_due_date?: {
            output: string;
            output_format?: OutputFormat;
        } | undefined;
        after_published?: {
            output: string;
            output_format?: OutputFormat;
        } | undefined;
    };
    getOutput(visibility: OutputVisibility): string;
}
