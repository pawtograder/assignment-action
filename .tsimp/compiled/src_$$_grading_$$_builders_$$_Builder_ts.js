import { spawn } from 'child_process';
export class Builder {
    logger;
    gradingDir;
    regressionTestJob;
    constructor(logger, gradingDir, regressionTestJob) {
        this.logger = logger;
        this.gradingDir = gradingDir;
        this.regressionTestJob = regressionTestJob;
    }
    async executeCommandAndGetOutput(command, args, logger, timeoutSeconds, ignoreFailures = false) {
        let myOutput = '';
        let myError = '';
        const result = new Promise((resolve, reject) => {
            logger.log('hidden', `Running ${command} ${args.join(' ')}`);
            const child = spawn(command, args, {
                cwd: this.gradingDir,
                shell: true,
                detached: true
            });
            let timeoutId;
            if (timeoutSeconds) {
                timeoutId = setTimeout(() => {
                    this.logger.log('visible', `ERROR: Command timed out after ${timeoutSeconds} seconds`);
                    child.kill();
                }, timeoutSeconds * 1000);
            }
            child.stdout.on('data', (data) => {
                const output = data.toString();
                myOutput += output;
                if (this.regressionTestJob) {
                    console.log(`CIDebug: ${output}`);
                }
            });
            child.stderr.on('data', (data) => {
                const error = data.toString();
                myError += error;
                if (this.regressionTestJob) {
                    console.log(`CIDebug: ${error}`);
                }
            });
            child.on('close', (code) => {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
                const returnCode = code ?? 1;
                myOutput += myError;
                logger.log('hidden', `${myOutput}`);
                logger.log('hidden', `Return code: ${returnCode}`);
                if (returnCode === 143) {
                    reject(new Error(`${myOutput}\n\nCommand timed out after ${timeoutSeconds} seconds`));
                }
                else if (returnCode !== 0 && !ignoreFailures) {
                    logger.log('visible', `Command ${command} failed unexpectedly with output:\n${myOutput}`);
                    reject(new Error(`Command failed with output:\n${myOutput}`));
                }
                else {
                    resolve({ returnCode, output: myOutput });
                }
            });
            child.on('error', (err) => {
                if (err.code === 'ETIMEDOUT') {
                    reject(new Error(`Command timed out after ${timeoutSeconds} seconds`));
                }
                else {
                    reject(err);
                }
            });
        });
        return await result;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQnVpbGRlci5qcyIsInNvdXJjZVJvb3QiOiIvVXNlcnMvc21hcmFudC9Eb2N1bWVudHMvVW5pdmVyc2l0eSBzdHVmZi9TdW1tZXItMjAyNS9Db3Vyc2UgRGV2L2Fzc2lnbm1lbnQtYWN0aW9uLyIsInNvdXJjZXMiOlsic3JjL2dyYWRpbmcvYnVpbGRlcnMvQnVpbGRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sZUFBZSxDQUFBO0FBd0JyQyxNQUFNLE9BQWdCLE9BQU87SUFFZjtJQUNBO0lBQ0E7SUFIWixZQUNZLE1BQWMsRUFDZCxVQUFrQixFQUNsQixpQkFBMEI7UUFGMUIsV0FBTSxHQUFOLE1BQU0sQ0FBUTtRQUNkLGVBQVUsR0FBVixVQUFVLENBQVE7UUFDbEIsc0JBQWlCLEdBQWpCLGlCQUFpQixDQUFTO0lBQ25DLENBQUM7SUFDSixLQUFLLENBQUMsMEJBQTBCLENBQzlCLE9BQWUsRUFDZixJQUFjLEVBQ2QsTUFBYyxFQUNkLGNBQXVCLEVBQ3ZCLGNBQWMsR0FBRyxLQUFLO1FBRXRCLElBQUksUUFBUSxHQUFHLEVBQUUsQ0FBQTtRQUNqQixJQUFJLE9BQU8sR0FBRyxFQUFFLENBQUE7UUFFaEIsTUFBTSxNQUFNLEdBQUcsSUFBSSxPQUFPLENBQ3hCLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxFQUFFO1lBQ2xCLE1BQU0sQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLFdBQVcsT0FBTyxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFBO1lBRTVELE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQyxPQUFPLEVBQUUsSUFBSSxFQUFFO2dCQUNqQyxHQUFHLEVBQUUsSUFBSSxDQUFDLFVBQVU7Z0JBQ3BCLEtBQUssRUFBRSxJQUFJO2dCQUNYLFFBQVEsRUFBRSxJQUFJO2FBQ2YsQ0FBQyxDQUFBO1lBRUYsSUFBSSxTQUFxQyxDQUFBO1lBQ3pDLElBQUksY0FBYyxF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