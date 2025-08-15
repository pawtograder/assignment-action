// See: https://rollupjs.org/introduction/

import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import nodeResolve from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'

const config = {
  input: {
    index: 'src/index.ts',
    grading: 'src/grading/main.ts'
  },
  output: {
    esModule: true,
    dir: './dist',
    format: 'es',
    sourcemap: true
  },
  plugins: [
    typescript({
      include: ['src/**/*']
    }),
    nodeResolve(),
    commonjs(),
    json()
  ]
}

export default config
