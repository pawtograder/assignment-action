/**
 * Mutants that PIT cannot run (RUN_ERROR) must be surfaced as an autograder
 * configuration error. PIT's console summary counts them as detected
 * ("Generated 1 Killed 1 (100%)"), so an instructor reading a clean-looking
 * PIT run next to a zero score had no way to tell the two apart.
 */
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  extractPitestRunErrorReasons,
  parsePitestXml,
  UNEVALUATED_MUTANT_STATUSES
} from '../src/grading/builders/pitest.js'
import { formatUnevaluatedMutantsForInstructors } from '../src/grading/graders/OverlayGrader.js'

// Shape of the pitest task output from a real grading run, trimmed.
const PIT_OUTPUT = `> Task :pitest
stderr  : 11:20:46 PM PIT >> WARNING : Error during mutation test
stderr  : java.lang.UnsupportedOperationException: class redefinition failed: attempted to change superclass or interfaces
stderr  : 	at java.instrument/sun.instrument.InstrumentationImpl.redefineClasses0(Native Method)
stderr  : 11:20:49 PM PIT >> WARNING : Error during mutation test
stderr  : java.lang.UnsupportedOperationException: class redefinition failed: attempted to change superclass or interfaces
stderr  : 11:21:06 PM PIT >> WARNING : Error during mutation test
stderr  : java.lang.UnsupportedOperationException: class redefinition failed: attempted to change the class NestHost, NestMembers, Record, or PermittedSubclasses attribute
`

describe('extractPitestRunErrorReasons', () => {
  it('collects distinct reasons with counts, most frequent first', () => {
    expect(extractPitestRunErrorReasons(PIT_OUTPUT)).toEqual([
      {
        reason:
          'java.lang.UnsupportedOperationException: class redefinition failed: attempted to change superclass or interfaces',
        count: 2
      },
      {
        reason:
          'java.lang.UnsupportedOperationException: class redefinition failed: attempted to change the class NestHost, NestMembers, Record, or PermittedSubclasses attribute',
        count: 1
      }
    ])
  })

  it('returns nothing for a clean run', () => {
    expect(
      extractPitestRunErrorReasons('> Task :pitest\nBUILD SUCCESSFUL')
    ).toEqual([])
  })
})

describe('parsePitestXml', () => {
  it('keeps RUN_ERROR mutants distinct from killed ones', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pitest-'))
    const file = join(dir, 'mutations.xml')
    writeFileSync(
      file,
      `<?xml version="1.0" encoding="UTF-8"?>
<mutations>
<mutation detected='true' status='KILLED' numberOfTestsRun='3'><sourceFile>ConversionRule.java</sourceFile><mutatedClass>app.ConversionRule</mutatedClass><mutatedMethod>__mutate_entire_class</mutatedMethod><methodDescription>()V</methodDescription><lineNumber>0</lineNumber><mutator>app.ConversionRule app.ConversionRule_CI1</mutator><index>-1</index><block>0</block><killingTest>app.ConversionRuleTest</killingTest><description>Replace</description></mutation>
<mutation detected='true' status='RUN_ERROR' numberOfTestsRun='0'><sourceFile>SimpleRecipe.java</sourceFile><mutatedClass>app.SimpleRecipe</mutatedClass><mutatedMethod>__mutate_entire_class</mutatedMethod><methodDescription>()V</methodDescription><lineNumber>0</lineNumber><mutator>app.SimpleRecipe app.Recipe_SC1</mutator><index>-1</index><block>0</block><description>Replace</description></mutation>
</mutations>`
    )
    const report = parsePitestXml(file)
    expect(report.statistics.killed).toBe(1)
    expect(report.statistics.runError).toBe(1)
    expect(
      report.mutations
        .filter((m) => UNEVALUATED_MUTANT_STATUSES.has(m.status))
        .map((m) => m.mutator)
    ).toEqual(['app.SimpleRecipe app.Recipe_SC1'])
  })
})

describe('formatUnevaluatedMutantsForInstructors', () => {
  it('names each mutant and explains why PIT looked clean', () => {
    const out = formatUnevaluatedMutantsForInstructors([
      {
        name: 'app.SimpleRecipe app.Recipe_SC1',
        location: 'app.SimpleRecipe:0',
        status: 'fail',
        tests: [],
        output: '',
        error: 'RUN_ERROR'
      }
    ])
    expect(out).toContain('1 mutant in this unit never ran')
    expect(out).toContain(
      '`app.SimpleRecipe app.Recipe_SC1` (PIT status RUN_ERROR)'
    )
    expect(out).toContain('Killed 1 (100%)')
  })
})
