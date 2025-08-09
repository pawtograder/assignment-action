{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/release-25.05";
    systems.url = "github:nix-systems/default";
  };

  outputs =
    {
      self,
      nixpkgs,
      systems,
      ...
    }:
    let
      inherit (nixpkgs) lib;
      eachSystem = f: lib.genAttrs (import systems) (s: f nixpkgs.legacyPackages.${s});
    in
    {
      packages = eachSystem (pkgs: rec {
        nodejs-minimal =
          (pkgs.nodejs_24.override {
            enableNpm = false;
          }).overrideAttrs
            (old: {
              outputs = [
                "out"
                "libv8"
              ];
              postInstall =
                builtins.replaceStrings [ "cp -r $out/include $dev/include" ] [ "# dev output disabled" ]
                  (old.postInstall or "");
            });

        pyret-runtime-deps =
          (pkgs.buildNpmPackage {
            pname = "pyret-runtime-deps";
            version = "1.0.0";

            src =
              pkgs.runCommand "pyret-deps-src"
                {
                  nativeBuildInputs = [ pkgs.jq ];
                }
                ''
                  mkdir -p $out

                  # Extract only pyret-* dependencies from original package.json
                  jq '{
                    name: "pyret-runtime-deps",
                    version: "1.0.0",
                    dependencies: .dependencies | with_entries(select(.key | startswith("pyret-")))
                  }' < ${./package.json} > $out/package.json

                  # Copy and modify the lock file to remove zod from pyret-autograder-pawtograder's deps
                  jq '
                    # Remove zod from the dependencies of pyret-autograder-pawtograder
                    .packages."node_modules/pyret-autograder-pawtograder".dependencies |= (if . then del(.zod) else . end) |
                    # Remove zod entry itself
                    del(.packages."node_modules/zod") |
                    del(.dependencies.zod)
                  ' < ${./package-lock.json} > $out/package-lock.json
                '';

            nodejs = pkgs.nodejs_24;

            # npmDepsHash = lib.fakeHash;
            npmDepsHash = "sha256-WweOAWhpyn2IDloBqDPffK8PyR/397pwZcANQCtVXuE=";

            dontNpmBuild = true;
            dontStrip = false;
            # doesn't need to be built, we just need this for runtime
            npmFlags = [ "--ignore-scripts" ];
            npmPruneFlags = [ "--omit=dev" ];

            # postConfigure = ''
            #   # Fix pyret-lang Makefile if it exists
            #   if [ -f node_modules/pyret-lang/Makefile ]; then
            #     substituteInPlace node_modules/pyret-lang/Makefile \
            #       --replace-fail "SHELL := /usr/bin/env bash" "SHELL := ${lib.getExe pkgs.bash}"
            #   fi

            #   # Run post-install scripts for native modules
            #   npm rebuild
            # '';

            installPhase = ''
              runHook preInstall

              mkdir -p $out
              cp -r node_modules $out/

              # # Remove build artifacts that might reference Python
              # find $out -type f -name "*.pyc" -delete 2>/dev/null || true
              # find $out -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
              # find $out -type f -name "Makefile" -delete 2>/dev/null || true
              # find $out -type f -name "*.mk" -delete 2>/dev/null || true
              # find $out -type f -name "binding.gyp" -delete 2>/dev/null || true
              # # find $out -type d -name "build" -exec rm -rf {} + 2>/dev/null || true
              # find $out -type d -name ".node-gyp" -exec rm -rf {} + 2>/dev/null || true

              # # Clean up unnecessary files
              # find $out -type f \( \
              #   -name "*.md" -o \
              #   -name "*.markdown" -o \
              #   -name "*.yml" -o \
              #   -name "*.yaml" -o \
              #   -name "*.nix" -o \
              #   -name "LICENSE*" -o \
              #   -name "license*" -o \
              #   -name "COPYING*" -o \
              #   -name "CHANGELOG*" -o \
              #   -name "README*" -o \
              #   -name ".npmignore" -o \
              #   -name ".gitignore" -o \
              #   -name ".nycrc" -o \
              #   -name "rollup.config.js" -o \
              #   -name "brower.json" -o \
              #   -name "Gruntfile.js" -o \
              #   -name ".editorconfig" -o \
              #   -name ".eslintrc" -o \
              #   -name "tsconfig.json" -o \
              #   -name "*.ts" -o \
              #   -name "*.d.ts" -o \
              #   -name "*.map" \
              # \) -delete 2>/dev/null || true

              # find $out -type d \( \
              #   -name "test" -o \
              #   -name "tests" -o \
              #   -name "__tests__" -o \
              #   -name "example" -o \
              #   -name "examples" -o \
              #   -name "benchmark" -o \
              #   -name "coverage" -o \
              #   -name ".github" -o \
              #   -name ".idea" -o \
              #   -name "docs" \
              # \) -exec rm -rf {} + 2>/dev/null || true

              runHook postInstall
            '';

            disallowedReferences = [
              # pkgs.python3
              pkgs.pkg-config
              pkgs.gnumake
            ];
          }).overrideAttrs
            ({
              buildInputs = [ ];
              propagatedBuildInputs = [ ];
            });

        # 2. Build TypeScript and compile Pyret (using full deps)
        pawtograder-build = (
          pkgs.buildNpmPackage {
            pname = "pawtograder-assignment-action-build";
            version = "1.0.0";

            src = lib.fileset.toSource {
              root = ./.;
              fileset = lib.fileset.unions [
                ./src
                ./pyret
                ./package.json
                ./package-lock.json
                ./rollup.config.ts
                ./tsconfig.json
                ./tsconfig.base.json
                ./tsconfig.eslint.json
              ];
            };

            nodejs = pkgs.nodejs_24;
            # npmDepsHash = lib.fakeHash;
            npmDepsHash = "sha256-I6T/ywWRhaMwX6xXrPcpzrZzRK3VSU5Tkmv4YQbUKaA=";
            dontNpmBuild = true;
            npmFlags = [ "--ignore-scripts" ];

            nativeBuildInputs = with pkgs; [
              gnumake
              pkg-config
              python3
            ];

            buildInputs = with pkgs; [
              pixman
              cairo
              pango
            ];

            buildPhase = ''
              runHook preBuild

              substituteInPlace node_modules/pyret-lang/Makefile \
                --replace-fail "SHELL := /usr/bin/env bash" "SHELL := ${lib.getExe pkgs.bash}"

              npm rebuild
              npm run package

              npm exec --no pyret -- \
                --builtin-js-dir node_modules/pyret-lang/src/js/trove/ \
                --program pyret/main.arr \
                --outfile pyret/main.cjs \
                --no-check-mode --norun

              runHook postBuild
            '';

            installPhase = ''
              runHook preInstall
              mkdir -p $out
              cp -r dist $out/
              cp pyret/main.cjs $out/
              runHook postInstall
            '';
          }
        );

        default =
          pkgs.runCommand "pawtograder-assignment-action"
            {
              nativeBuildInputs = [ pkgs.makeWrapper ];

              # Only runtime native deps
              propagatedBuildInputs = with pkgs; [
                cairo
                pango
                pixman
              ];
            }
            ''
              mkdir -p $out/bin

              ln -s ${pawtograder-build}/dist $out/dist
              ln -s ${pawtograder-build}/main.cjs $out/main.cjs
              ln -s ${pyret-runtime-deps}/node_modules $out/node_modules

              makeWrapper ${
                lib.getExe (
                  pkgs.nodejs_24.override {
                    enableNpm = false;
                  }
                )
              } $out/bin/action-runner \
                --add-flags "--enable-source-maps" \
                --add-flags "$out/dist/index.js" \
                --set PYRET_MAIN_PATH "$out/main.cjs"
            '';
      });

      apps = eachSystem (pkgs: {
        default = {
          type = "app";
          program = "${self.packages.${pkgs.system}.default}/bin/pawtograder";
        };
      });

      devShells = eachSystem (pkgs: {
        default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_24
            gnumake
          ];
          shellHook = ''
            export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath [ pkgs.libuuid ]}:''$LD_LIBRARY_PATH"
          '';
        };
      });
    };
}
