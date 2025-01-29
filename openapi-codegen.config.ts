import { generateSchemaTypes, generateFetchers } from '@openapi-codegen/typescript';
import { defineConfig } from '@openapi-codegen/cli';
export default defineConfig({
  adminService: {
    from: {
      relativePath: './swagger.json',
      source: 'file',
    },
    outputDir: 'src/api',
    to: async context => {
      const filenamePrefix = 'adminService';
      const { schemasFiles } = await generateSchemaTypes(context, {
        filenamePrefix,
      });
      await generateFetchers(context, {
        filenamePrefix,
        schemasFiles,
      });
    },
  },
});
