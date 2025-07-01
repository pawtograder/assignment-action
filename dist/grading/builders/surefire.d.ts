import Logger from '../Logger.js';
import { TestResult } from './Builder.js';
export declare function processXMLResults(path_glob: string, logger: Logger): Promise<TestResult[]>;
