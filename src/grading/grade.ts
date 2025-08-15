import * as io from '@actions/io'
import { readFile } from 'fs/promises'
import path from 'path'
import yaml from 'yaml'
import { AutograderFeedback } from '../api/adminServiceSchemas.js'
import { PawtograderConfig } from './types.js'
import { OverlayGrader } from './graders/OverlayGrader.js'
import { PyretGrader } from './graders/PyretGrader.js'

export async function makeGrader(
  config: PawtograderConfig,
  solutionDir: string,
  submissionDir: string,
  regressionTestJob?: number
) {
  switch (config.grader) {
    case 'overlay': {
      const gradingDir = path.join(process.cwd(), 'pawtograder-grading')
      await io.mkdirP(gradingDir)
      return new OverlayGrader(
        solutionDir,
        submissionDir,
        config,
        gradingDir,
        regressionTestJob
      )
    }
    case 'pyret':
      return new PyretGrader(
        solutionDir,
        submissionDir,
        config,
        regressionTestJob
      )
    default: {
      throw new Error(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        `Unknown grader ${(config satisfies never as any).grader}`
      )
    }
  }
}

export default async function grade(
  solutionDir: string,
  submissionDir: string,
  regressionTestJob?: number
): Promise<AutograderFeedback> {
  const _config = await readFile(
    path.join(solutionDir, 'pawtograder.yml'),
    'utf8'
  )
  const config = yaml.parse(_config) as PawtograderConfig

  // const grader = await makeGrader(
  //   config,
  //   solutionDir,
  //   submissionDir,
  //   regressionTestJob
  // )
  // const ret = await grader.grade()

  // console.log(JSON.stringify(ret, null, 0))

  return {
    tests: [
      {
        output_format: 'markdown',
        output: 'Chaff for tree-map output',
        hidden_output: 'Chaff for tree-map hidden output',
        hidden_output_format: 'markdown',
        name: 'Chaff for tree-map',
        max_score: 3,
        score: 0,
        part: 'tree-map',
        extra_data: {
          pyret_repl: {
            initial_code:
              'use context starter2024\n\nfun add(x, y):\n  x + y\nend',
            initial_interactions: ['add(5, 3)', 'add(10, 20)'],
            height: '500px'
          }
        }
      },
      {
        output_format: 'markdown',
        output: 'Functional Test for tree-fold functional output',
        hidden_output: 'Functional Test for tree-fold functional hidden output',
        hidden_output_format: 'markdown',
        name: 'Functional Test for tree-fold functional',
        max_score: 3,
        score: 0,
        part: 'tree-fold'
      },
      {
        output_format: 'markdown',
        output: 'Chaff for tree-contains output',
        hidden_output: 'Chaff for tree-contains hidden output',
        hidden_output_format: 'markdown',
        name: 'Chaff for tree-contains',
        max_score: 3,
        score: 0,
        part: 'tree-contains'
      },
      {
        output_format: 'markdown',
        output: 'Chaff for tree-map output',
        hidden_output: 'Chaff for tree-map hidden output',
        hidden_output_format: 'markdown',
        name: 'Chaff for tree-map',
        max_score: 3,
        score: 0,
        part: 'tree-map'
      },
      {
        output_format: 'markdown',
        output: 'Self-Test on tree-sum output',
        name: 'Self-Test on tree-sum',
        max_score: 0,
        score: 0,
        part: 'tree-sum'
      },
      {
        output_format: 'markdown',
        output: 'Chaff for tree-contains output',
        hidden_output: 'Chaff for tree-contains hidden output',
        hidden_output_format: 'markdown',
        name: 'Chaff for tree-contains',
        max_score: 3,
        score: 0,
        part: 'tree-contains'
      },
      {
        output_format: 'markdown',
        output: 'Functional Test for tree-contains functional output',
        hidden_output:
          'Functional Test for tree-contains functional hidden output',
        hidden_output_format: 'markdown',
        name: 'Functional Test for tree-contains functional',
        max_score: 3,
        score: 0,
        part: 'tree-contains'
      },
      {
        output_format: 'markdown',
        output: 'Chaff for tree-fold output',
        hidden_output: 'Chaff for tree-fold hidden output',
        hidden_output_format: 'markdown',
        name: 'Chaff for tree-fold',
        max_score: 3,
        score: 0,
        part: 'tree-fold'
      },
      {
        output_format: 'markdown',
        output: 'Functional Test for tree-map functional output',
        hidden_output: 'Functional Test for tree-map functional hidden output',
        hidden_output_format: 'markdown',
        name: 'Functional Test for tree-map functional',
        max_score: 3,
        score: 0,
        part: 'tree-map'
      },
      {
        output_format: 'markdown',
        output: 'Chaff for tree-fold output',
        hidden_output: 'Chaff for tree-fold hidden output',
        hidden_output_format: 'markdown',
        name: 'Chaff for tree-fold',
        max_score: 3,
        score: 0,
        part: 'tree-fold'
      },
      {
        output_format: 'markdown',
        output: 'Wheat for tree-ormap output',
        hidden_output: 'Wheat for tree-ormap hidden output',
        hidden_output_format: 'markdown',
        name: 'Wheat for tree-ormap',
        max_score: 3,
        score: 0,
        part: 'tree-ormap'
      },
      {
        output_format: 'markdown',
        output: 'Chaff for tree-andmap output',
        hidden_output: 'Chaff for tree-andmap hidden output',
        hidden_output_format: 'markdown',
        name: 'Chaff for tree-andmap',
        max_score: 3,
        score: 0,
        part: 'tree-andmap'
      },
      {
        output_format: 'markdown',
        output: 'Wheat for tree-map output',
        hidden_output: 'Wheat for tree-map hidden output',
        hidden_output_format: 'markdown',
        name: 'Wheat for tree-map',
        max_score: 3,
        score: 0,
        part: 'tree-map'
      },
      {
        output_format: 'markdown',
        output: 'Chaff for tree-flatten output',
        hidden_output: 'Chaff for tree-flatten hidden output',
        hidden_output_format: 'markdown',
        name: 'Chaff for tree-flatten',
        max_score: 3,
        score: 0,
        part: 'tree-flatten'
      },
      {
        output_format: 'markdown',
        output: 'Wheat for tree-contains output',
        hidden_output: 'Wheat for tree-contains hidden output',
        hidden_output_format: 'markdown',
        name: 'Wheat for tree-contains',
        max_score: 3,
        score: 0,
        part: 'tree-contains'
      },
      {
        output_format: 'markdown',
        output: 'Chaff for tree-flatten output',
        hidden_output: 'Chaff for tree-flatten hidden output',
        hidden_output_format: 'markdown',
        name: 'Chaff for tree-flatten',
        max_score: 3,
        score: 0,
        part: 'tree-flatten'
      },
      {
        output_format: 'markdown',
        output: 'Chaff for tree-zero output',
        hidden_output: 'Chaff for tree-zero hidden output',
        hidden_output_format: 'markdown',
        name: 'Chaff for tree-zero',
        max_score: 3,
        score: 0,
        part: 'tree-zero'
      },
      {
        output_format: 'markdown',
        output: 'Wheat for tree-fold output',
        hidden_output: 'Wheat for tree-fold hidden output',
        hidden_output_format: 'markdown',
        name: 'Wheat for tree-fold',
        max_score: 3,
        score: 0,
        part: 'tree-fold'
      },
      {
        output_format: 'markdown',
        output: 'Wheat for tree-andmap output',
        hidden_output: 'Wheat for tree-andmap hidden output',
        hidden_output_format: 'markdown',
        name: 'Wheat for tree-andmap',
        max_score: 3,
        score: 0,
        part: 'tree-andmap'
      },
      {
        output_format: 'markdown',
        output: 'Wheat for tree-flatten output',
        hidden_output: 'Wheat for tree-flatten hidden output',
        hidden_output_format: 'markdown',
        name: 'Wheat for tree-flatten',
        max_score: 3,
        score: 0,
        part: 'tree-flatten'
      },
      {
        output_format: 'markdown',
        output: 'Chaff for tree-sum output',
        hidden_output: 'Chaff for tree-sum hidden output',
        hidden_output_format: 'markdown',
        name: 'Chaff for tree-sum',
        max_score: 3,
        score: 0,
        part: 'tree-sum'
      },
      {
        output_format: 'markdown',
        output: 'Self-Test on tree-ormap output',
        name: 'Self-Test on tree-ormap',
        max_score: 0,
        score: 0,
        part: 'tree-ormap'
      },
      {
        output_format: 'markdown',
        output: 'Wheat for tree-zero output',
        hidden_output: 'Wheat for tree-zero hidden output',
        hidden_output_format: 'markdown',
        name: 'Wheat for tree-zero',
        max_score: 3,
        score: 0,
        part: 'tree-zero'
      },
      {
        output_format: 'markdown',
        output: 'Self-Test on tree-map output',
        name: 'Self-Test on tree-map',
        max_score: 0,
        score: 0,
        part: 'tree-map'
      },
      {
        output_format: 'markdown',
        output: 'Functional Test for tree-sum functional output',
        hidden_output: 'Functional Test for tree-sum functional hidden output',
        hidden_output_format: 'markdown',
        name: 'Functional Test for tree-sum functional',
        max_score: 3,
        score: 0,
        part: 'tree-sum'
      },
      {
        output_format: 'markdown',
        output: 'Self-Test on tree-contains output',
        name: 'Self-Test on tree-contains',
        max_score: 0,
        score: 0,
        part: 'tree-contains'
      },
      {
        output_format: 'markdown',
        output: 'Wheat for tree-sum output',
        hidden_output: 'Wheat for tree-sum hidden output',
        hidden_output_format: 'markdown',
        name: 'Wheat for tree-sum',
        max_score: 3,
        score: 0,
        part: 'tree-sum'
      },
      {
        output_format: 'markdown',
        output: 'Self-Test on tree-fold output',
        name: 'Self-Test on tree-fold',
        max_score: 0,
        score: 0,
        part: 'tree-fold'
      },
      {
        output_format: 'markdown',
        output: 'Functional Test for tree-zero functional output',
        hidden_output: 'Functional Test for tree-zero functional hidden output',
        hidden_output_format: 'markdown',
        name: 'Functional Test for tree-zero functional',
        max_score: 3,
        score: 0,
        part: 'tree-zero'
      },
      {
        output_format: 'markdown',
        output: 'Self-Test on tree-andmap output',
        name: 'Self-Test on tree-andmap',
        max_score: 0,
        score: 0,
        part: 'tree-andmap'
      },
      {
        output_format: 'markdown',
        output: 'Functional Test for tree-ormap functional output',
        hidden_output:
          'Functional Test for tree-ormap functional hidden output',
        hidden_output_format: 'markdown',
        name: 'Functional Test for tree-ormap functional',
        max_score: 3,
        score: 0,
        part: 'tree-ormap'
      },
      {
        output_format: 'markdown',
        output: 'Self-Test on tree-flatten output',
        name: 'Self-Test on tree-flatten',
        max_score: 0,
        score: 0,
        part: 'tree-flatten'
      },
      {
        output_format: 'markdown',
        output: 'Functional Test for tree-flatten functional output',
        hidden_output:
          'Functional Test for tree-flatten functional hidden output',
        hidden_output_format: 'markdown',
        name: 'Functional Test for tree-flatten functional',
        max_score: 3,
        score: 0,
        part: 'tree-flatten'
      },
      {
        output_format: 'markdown',
        output: 'Functional Test for tree-andmap functional output',
        hidden_output:
          'Functional Test for tree-andmap functional hidden output',
        hidden_output_format: 'markdown',
        name: 'Functional Test for tree-andmap functional',
        max_score: 3,
        score: 0,
        part: 'tree-andmap'
      },
      {
        output_format: 'markdown',
        output: 'Self-Test on tree-zero output',
        name: 'Self-Test on tree-zero',
        max_score: 0,
        score: 0,
        part: 'tree-zero'
      },
      {
        output_format: 'markdown',
        output: 'Chaff for tree-ormap output',
        hidden_output: '',
        hidden_output_format: 'markdown',
        name: 'Chaff for tree-ormap',
        max_score: 3,
        score: 0,
        part: 'tree-ormap'
      }
    ].sort((a, b) => a.part.localeCompare(b.part)),
    output: {
      visible: {
        output_format: 'markdown',
        output: 'visible output'
      },
      hidden: {
        output_format: 'markdown',
        output: 'hidden output'
      }
    },
    lint: { status: 'pass', output: '' },
    artifacts: [],
    annotations: []
  }
}
