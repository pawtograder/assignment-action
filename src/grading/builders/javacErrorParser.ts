/**
 * Parser for Java compiler errors from Gradle/javac output
 * Extracts structured error information and generates student-friendly messages
 */

export interface JavacError {
  type:
    | 'cannot_find_symbol'
    | 'incompatible_types'
    | 'method_cannot_be_applied'
    | 'unreported_exception'
    | 'other'
  file: string // Relative path to the test file
  line: number
  symbolType?: 'method' | 'class' | 'variable' | 'field'
  symbolName?: string // e.g., "toBaseAmount"
  symbolSignature?: string // e.g., "toBaseAmount(ConversionRegistry)"
  locationClass?: string // e.g., "Quantity"
  exceptionName?: string // e.g., "UnsupportedConversionException"
  errorMessage?: string // Original error message for other types
}

/**
 * Parse Java compiler errors from Gradle build output
 * @param output Raw Gradle/javac output string
 * @param gradingDir Base directory for resolving relative paths
 * @returns Array of parsed error objects
 */
export function parseJavacErrors(
  output: string,
  gradingDir: string
): JavacError[] {
  const errors: JavacError[] = []
  const lines = output.split('\n')

  let i = 0
  while (i < lines.length) {
    // Look for error line pattern: /path/to/file.java:LINE: error: MESSAGE
    const errorLineMatch = lines[i].match(/^(.+?):(\d+):\s*error:\s*(.+)$/)
    if (errorLineMatch) {
      const filePath = errorLineMatch[1].trim()
      const lineNum = parseInt(errorLineMatch[2], 10)
      const errorMsg = errorLineMatch[3]

      // Trim all absolute path components - extract relative path starting from src/ or test/
      let relativePath = filePath

      // Find the last occurrence of /src/ or /test/ and take everything from there
      // Prefer src/ over test/ to preserve src/test/ paths correctly
      const srcMatch = relativePath.match(/.*[/\\](src[/\\].+)$/)
      const testMatch = relativePath.match(/.*[/\\](test[/\\].+)$/)

      if (srcMatch) {
        relativePath = srcMatch[1].replace(/\\/g, '/')
      } else if (testMatch) {
        relativePath = testMatch[1].replace(/\\/g, '/')
      } else if (filePath.startsWith(gradingDir)) {
        // Fallback: if it starts with gradingDir, trim that
        relativePath = filePath.substring(gradingDir.length + 1)
      }

      // Look ahead for symbol and location information
      let symbolType: 'method' | 'class' | 'variable' | 'field' | undefined
      let symbolName: string | undefined
      let symbolSignature: string | undefined
      let locationClass: string | undefined

      // Check next few lines for symbol information
      for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
        const symbolMatch = lines[j].match(
          /^\s*symbol:\s*(method|class|variable|field)\s+(.+)$/
        )
        if (symbolMatch) {
          symbolType = symbolMatch[1] as
            | 'method'
            | 'class'
            | 'variable'
            | 'field'
          symbolSignature = symbolMatch[2].trim()

          // Extract method/class name from signature
          if (symbolType === 'method') {
            // Format: "methodName(ParamType1, ParamType2)" or "methodName()"
            const methodMatch = symbolSignature.match(
              /^([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/
            )
            if (methodMatch) {
              symbolName = methodMatch[1]
            }
          } else if (symbolType === 'class') {
            symbolName = symbolSignature
          } else if (symbolType === 'variable' || symbolType === 'field') {
            // Format: "variableName" or "variableName of type Type"
            const varMatch = symbolSignature.match(/^([a-zA-Z_][a-zA-Z0-9_]*)/)
            if (varMatch) {
              symbolName = varMatch[1]
            }
          }
          continue
        }

        const locationMatch = lines[j].match(
          /^\s*location:\s*(?:class\s+|variable\s+target\s+of\s+type\s+)(.+)$/
        )
        if (locationMatch) {
          locationClass = locationMatch[1].trim()
          break
        }
      }

      // Determine error type and extract additional information
      let errorType: JavacError['type'] = 'other'
      let exceptionName: string | undefined

      if (errorMsg.includes('cannot find symbol')) {
        errorType = 'cannot_find_symbol'
      } else if (errorMsg.includes('incompatible types')) {
        errorType = 'incompatible_types'
      } else if (errorMsg.includes('cannot be applied')) {
        errorType = 'method_cannot_be_applied'
      } else if (errorMsg.includes('unreported exception')) {
        errorType = 'unreported_exception'
        // Extract exception name from: "unreported exception ExceptionName; must be caught..."
        const exceptionMatch = errorMsg.match(
          /unreported exception\s+([A-Za-z][A-Za-z0-9_]*)/
        )
        if (exceptionMatch) {
          exceptionName = exceptionMatch[1]
        }
      }

      errors.push({
        type: errorType,
        file: relativePath,
        line: lineNum,
        symbolType,
        symbolName,
        symbolSignature,
        locationClass,
        exceptionName,
        errorMessage: errorMsg
      })
    }
    i++
  }

  return errors
}

/**
 * Generate a student-friendly error message from parsed Java compiler errors
 * @param errors Array of parsed JavacError objects
 * @returns Formatted markdown message
 */
export function generateStudentFriendlyError(errors: JavacError[]): string {
  if (errors.length === 0) {
    return 'Your tests failed to compile. Please check the build output for details.'
  }

  // Group errors by type for better organization
  const cannotFindSymbolErrors = errors.filter(
    (e) => e.type === 'cannot_find_symbol'
  )
  const unreportedExceptionErrors = errors.filter(
    (e) => e.type === 'unreported_exception'
  )
  const otherErrors = errors.filter(
    (e) => e.type !== 'cannot_find_symbol' && e.type !== 'unreported_exception'
  )

  let message = '**Compilation Error in Your Tests**\n\n'

  // Handle "cannot find symbol" errors (most common and most actionable)
  if (cannotFindSymbolErrors.length > 0) {
    // Group by symbol to avoid repetition
    const symbolGroups = new Map<string, JavacError[]>()
    for (const error of cannotFindSymbolErrors) {
      const key = `${error.symbolType}:${error.symbolSignature || error.symbolName}:${error.locationClass}`
      if (!symbolGroups.has(key)) {
        symbolGroups.set(key, [])
      }
      symbolGroups.get(key)!.push(error)
    }

    for (const [, groupErrors] of symbolGroups.entries()) {
      const error = groupErrors[0] // Use first error as representative
      const locations = groupErrors
        .map((e) => `\`${e.file}:${e.line}\``)
        .join(', ')

      if (
        error.symbolType === 'method' &&
        error.symbolName &&
        error.locationClass
      ) {
        message += `Your test${groupErrors.length > 1 ? 's' : ''} at ${locations} assume${groupErrors.length > 1 ? '' : 's'} that class \`${error.locationClass}\` has the method \`${error.symbolSignature || error.symbolName}\`.\n\n`
        message += `Your implementation might have this method, but it is **not part of the shared specification** that we asked you to implement and test. Our solution does not include this method, so your tests cannot compile against it.\n\n`
        message += `**How to Fix:**\n`
        message += `- Remove tests that call \`${error.symbolSignature || error.symbolName}\` on \`${error.locationClass}\` objects\n`
        message += `- Only test the public API defined in the assignment specification\n`
        message += `- See the assignment specification for a reminder of the public API\n\n`
      } else if (error.symbolType === 'class' && error.symbolName) {
        message += `Your test${groupErrors.length > 1 ? 's' : ''} at ${locations} reference${groupErrors.length > 1 ? '' : 's'} the class \`${error.symbolName}\`, which is not part of the shared specification.\n\n`
        message += `**How to Fix:**\n`
        message += `- Remove tests that use \`${error.symbolName}\`\n`
        message += `- Only use classes defined in the assignment specification\n\n`
      } else if (
        (error.symbolType === 'variable' || error.symbolType === 'field') &&
        error.symbolName &&
        error.locationClass
      ) {
        message += `Your test${groupErrors.length > 1 ? 's' : ''} at ${locations} assume${groupErrors.length > 1 ? '' : 's'} that class \`${error.locationClass}\` has the ${error.symbolType} \`${error.symbolName}\`.\n\n`
        message += `This ${error.symbolType} is not part of the shared specification.\n\n`
        message += `**How to Fix:**\n`
        message += `- Remove tests that access \`${error.symbolName}\` on \`${error.locationClass}\` objects\n`
        message += `- Only test the public API defined in the assignment specification\n\n`
      } else {
        // Fallback for other symbol types
        message += `Your test${groupErrors.length > 1 ? 's' : ''} at ${locations} reference${groupErrors.length > 1 ? '' : 's'} a symbol that is not available: \`${error.symbolSignature || error.symbolName || 'unknown'}\`\n\n`
        message += `This symbol is not part of the shared specification.\n\n`
        message += `**How to Fix:**\n`
        message += `- Remove tests that use this symbol\n`
        message += `- Only test the public API defined in the assignment specification\n\n`
      }
    }
  }

  // Handle unreported exception errors
  if (unreportedExceptionErrors.length > 0) {
    // Group by exception type
    const exceptionGroups = new Map<string, JavacError[]>()
    for (const error of unreportedExceptionErrors) {
      const key = error.exceptionName || 'unknown'
      if (!exceptionGroups.has(key)) {
        exceptionGroups.set(key, [])
      }
      exceptionGroups.get(key)!.push(error)
    }

    for (const [, groupErrors] of exceptionGroups.entries()) {
      const error = groupErrors[0]
      const locations = groupErrors
        .map((e) => `\`${e.file}:${e.line}\``)
        .join(', ')
      const exceptionName = error.exceptionName || 'an exception'

      message += `Your test${groupErrors.length > 1 ? 's' : ''} at ${locations} call${groupErrors.length > 1 ? '' : 's'} a method that throws \`${exceptionName}\`, but your test does not handle this exception.\n\n`
      message += `Methods in the specification may throw checked exceptions that must be handled. Your tests need to either:\n\n`
      message += `**How to Fix:**\n`
      message += `- Wrap the method call in a \`try-catch\` block to handle \`${exceptionName}\`\n`
      message += `- Add \`throws ${exceptionName}\` to your test method signature\n`
      message += `- Check the assignment specification to understand when this exception is thrown\n\n`
    }
  }

  // Handle other error types
  if (otherErrors.length > 0) {
    message += `**Additional Compilation Errors:**\n\n`
    for (const error of otherErrors) {
      message += `- \`${error.file}:${error.line}\`: ${error.errorMessage || 'Compilation error'}\n`
    }
    message += `\nPlease review these errors and ensure your tests only use the public API defined in the assignment specification.\n\n`
  }

  // Add general guidance
  message += `---\n\n`
  message += `**General Guidance:**\n\n`
  message += `When writing tests, make sure they only test the public API that was specified in the assignment. Your tests will be compiled against our solution, which implements only the specified interface. If your tests rely on implementation details or methods not in the specification, they will fail to compile.\n`

  return message
}
