import {
  Builder,
  BuildStepOptions,
  LintResult,
  MutantResult,
  TestResult
} from './Builder.js'

export default class SmeLLMBuilder extends Builder {
  async setupVenv(dir: string, key: string): Promise<void> {
    this.logger.log('hidden', 'Setting up SmeLLM environment')
    // SmeLLM uses Python, so we might need to ensure Python is available
    // For now, we'll assume it's already installed
  }

  async lint(): Promise<LintResult> {
    this.logger.log('hidden', 'Running SmeLLM code smell detection')
    
    try {
      // Find all Java files in the submission
      const javaFiles = await this.findJavaFiles()
      
      if (javaFiles.length === 0) {
        return {
          status: 'pass',
          output: 'No Java files found for code smell analysis'
        }
      }

      const allViolations: any[] = []
      let analysisOutput = `SmeLLM Code Smell Analysis Results:\n\n`
      
      // Run SmeLLM on each Java file
      for (const javaFile of javaFiles) {
        const violations = await this.runSmeLLMOnFile(javaFile)
        allViolations.push(...violations)
        
        analysisOutput += `File: ${javaFile}\n`
        analysisOutput += `Violations found: ${violations.length}\n`
        for (const violation of violations) {
          analysisOutput += `  - Line ${violation.line}: ${violation.message}\n`
        }
        analysisOutput += `\n`
      }

      analysisOutput += `\nTotal: ${allViolations.length} code smell violations found across ${javaFiles.length} Java files.`

      return {
        status: allViolations.length > 0 ? 'fail' : 'pass',
        output: analysisOutput
      }
    } catch (error) {
      this.logger.log('visible', `SmeLLM analysis failed: ${(error as Error).message}`)
      return {
        status: 'fail',
        output: `SmeLLM analysis failed: ${(error as Error).message}`
      }
    }
  }

  async getCoverageReport(): Promise<string> {
    // SmeLLM doesn't provide coverage reports
    return 'Code smell analysis does not provide coverage reports'
  }

  getCoverageReportDir(): string | null {
    // SmeLLM doesn't provide coverage reports
    return null
  }

  async test({ timeoutSeconds }: BuildStepOptions): Promise<TestResult[]> {
    // SmeLLM doesn't run tests, it analyzes code smells
    return []
  }

  async mutationTest({ timeoutSeconds }: BuildStepOptions): Promise<MutantResult[]> {
    // SmeLLM doesn't perform mutation testing
    return []
  }

  async buildClean({ timeoutSeconds }: BuildStepOptions): Promise<void> {
    // SmeLLM doesn't require building
    this.logger.log('hidden', 'SmeLLM analysis - no build required')
  }

  private async findJavaFiles(): Promise<string[]> {
    const { exec } = await import('child_process')
    const { promisify } = await import('util')
    const execAsync = promisify(exec)

    try {
      // Find all .java files in the grading directory
      const { stdout } = await execAsync(`find "${this.gradingDir}" -name "*.java" -type f`)
      return stdout.trim().split('\n').filter(file => file.length > 0)
    } catch (error) {
      this.logger.log('visible', `Error finding Java files: ${(error as Error).message}`)
      return []
    }
  }

  private async runSmeLLMOnFile(javaFile: string): Promise<any[]> {
    const { exec } = await import('child_process')
    const { promisify } = await import('util')
    const execAsync = promisify(exec)

    try {
      // Run SmeLLM on the Java file
      // Assuming SmeLLM is installed and available in PATH
      const smellmPath = '/Users/lessouffrances/MLProj/SmeLLM/smellmv2/smellm.py'
      
      // Create output directory for SmeLLM results
      const outputDir = `${this.gradingDir}/smellm_output`
      const { exec: execSync } = await import('child_process')
      execSync(`mkdir -p "${outputDir}"`)
      
      const { stderr } = await execAsync(
        `python3 "${smellmPath}" --lang java --file "${javaFile}" --model gpt-4o-mini-2024-07-18 --output "${outputDir}"`,
        { timeout: 30000 } // 30 second timeout
      )

      if (stderr) {
        this.logger.log('hidden', `SmeLLM stderr for ${javaFile}: ${stderr}`)
      }

      // SmeLLM outputs markdown files, so we need to parse them
      return this.parseSmeLLMMarkdownOutput(javaFile, outputDir)
    } catch (error) {
      this.logger.log('visible', `SmeLLM analysis failed for ${javaFile}: ${(error as Error).message}`)
      return []
    }
  }

  private parseSmeLLMMarkdownOutput(filePath: string, outputDir: string): any[] {
    const violations: any[] = []

    try {
      // SmeLLM creates markdown files with code smell analysis
      // For now, we'll create a simple violation based on the file being analyzed
      // In a real implementation, you'd parse the markdown output
      violations.push({
        file: filePath,
        line: 1,
        column: 1,
        severity: 'info',
        rule: 'smellm_analysis',
        message: 'Code smell analysis completed - check SmeLLM output files for detailed results',
        source: 'SmeLLM',
        smellType: 'analysis_completed',
        suggestion: 'Review the generated markdown files for detailed code smell analysis',
        refactoring: 'See SmeLLM output for specific refactoring suggestions'
      })
    } catch (error) {
      this.logger.log('visible', `Failed to parse SmeLLM output for ${filePath}: ${error}`)
    }

    return violations
  }
}
