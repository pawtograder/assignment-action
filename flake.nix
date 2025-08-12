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
      inherit (nixpkgs) lib legacyPackages;
      eachSystem = f: lib.genAttrs (import systems) (system: f legacyPackages.${system});
      mkCanvasNativeBuildInputs =
        pkgs: with pkgs; [
          gnumake
          pkg-config
          python3
        ];
      mkCanvasBuildInputs =
        pkgs:
        with pkgs;
        [
          pixman
          cairo
          pango
        ]
        ++ lib.optionals stdenv.isDarwin [
          (lib.getLib giflib)
          (lib.getDev giflib)
        ];
    in
    {
      packages = eachSystem (pkgs: rec {
        node-js-very-slim = import ./nix/node-js-very-slim.nix { inherit pkgs; };

        pyret-lang-src = pkgs.stdenv.mkDerivation {
          name = "pyret-lang-src";

          dontBuild = true;

          # https://github.com/ironm00n/pyret-lang/tree/unmerged
          src = pkgs.fetchFromGitHub {
            name = "pyret-lang";
            owner = "ironm00n";
            repo = "pyret-lang";
            rev = "27a74f8dd4bcc762275b487e9d9e90630a25802d";
            # sha256 = lib.fakeHash;
            sha256 = "sha256-fIH8TzThMZcDoUfVOe0G+5rd6l8FuWoRf+64FoFjSko=";
          };

          installPhase = ''
            mkdir -p $out
            cp -r ./* $out
          '';
        };

        cpo-src = pkgs.stdenv.mkDerivation {
          name = "code.pyret.org-src";

          dontBuild = true;

          # https://github.com/ironm00n/code.pyret.org/tree/unmerged
          src = pkgs.fetchFromGitHub {
            name = "cpo";
            owner = "ironm00n";
            repo = "code.pyret.org";
            rev = "8460d0a97f0aef62f73128ae26ef2fb54f58f6e8";
            # sha256 = lib.fakeHash;
            sha256 = "sha256-URrY4cGFE84K49oHB8Msbe03oFnGx1ZPF1xIpQPmojs=";
          };

          patches = [
            ./nix/dcic2024-charts.patch
          ];

          installPhase = ''
            mkdir -p $out
            cp -r ./* $out
          '';
        };

        # so... the repl need to have access to built-in modules at runtime
        compiled-pyret = pkgs.buildNpmPackage {
          name = "pyret-built";

          src = pyret-lang-src;
          nodejs = pkgs.nodejs_24;

          # npmDepsHash = lib.fakeHash;
          npmDepsHash = "sha256-hxH66Mj2wbY5J6B9pRNen+qo8MHpw+X61D6Cgz+keMo=";

          dontNpmBuild = true;
          npmFlags = [ "--ignore-scripts" ];

          nativeBuildInputs = mkCanvasNativeBuildInputs pkgs;
          buildInputs = mkCanvasBuildInputs pkgs;

          buildPhase = ''
            runHook preBuild

            substituteInPlace Makefile \
              --replace-fail "SHELL := /usr/bin/env bash" "SHELL := ${lib.getExe pkgs.bash}"

            npm rebuild

            make phaseA libA

            mkdir -p build/cpo

            # if we compile directly, name will be wrong
            cat > build/compile-dcic.arr << 'EOF'
            import dcic2024 as _
            EOF

            # manually add dcic2024 context
            node build/phaseA/pyret.jarr \
              -allow-builtin-overrides \
              --builtin-js-dir src/js/trove/ \
              --builtin-arr-dir src/arr/trove/ \
              --builtin-arr-dir ${cpo-src}/src/web/arr/trove/ \
              --require-config src/scripts/standalone-configA.json \
              --compiled-dir build/cpo/ \
              --build-runnable build/compile-dcic.arr \
              --standalone-file src/js/base/handalone.js \
              --outfile build/cpo/compile-dcic.jarr \
              -no-check-mode

            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall

            mkdir -p $out
            cp -r src $out/
            cp -r build $out/

            runHook postInstall
          '';

          disallowedReferences = with pkgs; [
            nodejs_24
            nodejs_24.src
          ];
        };

        pyret-runtime-deps =
          let
            keep = [
              "s-expression"
              "q"
              "js-md5"
              "canvas"
              "seedrandom"
              "fast-csv"
              "cross-fetch"
              "source-map"
              "js-sha256"
              "resolve"
              "vega"
            ];
            keepJSON = builtins.toJSON keep;
            src = pkgs.runCommand "pyret-runtime-deps-src" { nativeBuildInputs = [ pkgs.jq ]; } ''
              set -euo pipefail
              mkdir -p $out
              keep='${keepJSON}'

              # minimal needed deps from pyret-lang/package.json
              jq --argjson keep "$keep" '
                { name:"pyret-runtime-deps", version:"1.0.0",
                  dependencies: ((.dependencies // {}) | with_entries(select(.key as $k | $keep | index($k))))
                }
              ' ${pyret-lang-src}/package.json > $out/package.json

              cp ${pyret-lang-src}/package-lock.json $out/package-lock.json
            '';
          in
          pkgs.buildNpmPackage {
            name = "pyret-runtime-deps";
            inherit src;

            nodejs = pkgs.nodejs_24;
            # npmDepsHash = lib.fakeHash;
            npmDepsHash = "sha256-hxH66Mj2wbY5J6B9pRNen+qo8MHpw+X61D6Cgz+keMo=";
            dontNpmBuild = true;
            npmFlags = [ "--ignore-scripts" ];
            npmPruneFlags = [ "--omit=dev" ];
            dontStrip = false;

            nativeBuildInputs = mkCanvasNativeBuildInputs pkgs ++ [ pkgs.removeReferencesTo ];
            buildInputs = mkCanvasBuildInputs pkgs;

            buildPhase = ''
              runHook preBuild

              # canvas, etc
              npm rebuild

              runHook postBuild
            '';

            installPhase = ''
              mkdir -p $out
              cp -r node_modules $out/

              # Replace all references to the full nodejs with the slim nodejs
              find $out -type f -exec sed -i \
                "s|${pkgs.nodejs_24}/bin/node|${node-js-very-slim}/bin/node|g" {} +

              find $out -type f \( -name "*.node" -o -name "*.a" -o -name "*.json" \) \
                -exec remove-references-to -t ${pkgs.nodejs_24.src} {} +

              rm $out/node_modules/canvas/build/canvas.target.mk
              rm $out/node_modules/canvas/build/Makefile
              rm $out/node_modules/canvas/build/config.gypi
            '';

            disallowedReferences = with pkgs; [
              nodejs_24
              nodejs_24.src
            ];
          };

        action-build = pkgs.buildNpmPackage {
          name = "pawtograder-assignment-action-build";
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
            ];
          };

          nodejs = pkgs.nodejs_24;
          # npmDepsHash = lib.fakeHash;
          npmDepsHash = "sha256-QLCEfd+mOJKMyJ2Sr8ZGq94ffZ9/MPgFi2u92OmAtaA=";
          dontNpmBuild = true;
          npmFlags = [ "--ignore-scripts" ];

          nativeBuildInputs = mkCanvasNativeBuildInputs pkgs;
          buildInputs = mkCanvasBuildInputs pkgs;

          buildPhase = ''
            runHook preBuild

            substituteInPlace node_modules/pyret-lang/Makefile \
              --replace-fail "SHELL := /usr/bin/env bash" "SHELL := ${lib.getExe pkgs.bash}"

            npm rebuild
            npm run package

            npm exec --no pyret -- \
              --builtin-js-dir ${pyret-lang-src}/src/js/trove/ \
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

          disallowedReferences = with pkgs; [
            nodejs_24
            nodejs_24.src
          ];
        };

        default =
          let
            nodejs-very-slim-exec = lib.getExe (node-js-very-slim);
          in
          pkgs.runCommand "pawtograder-assignment-action"
            {
              nativeBuildInputs = [ pkgs.makeWrapper ];
            }
            ''
              mkdir -p $out/bin

              cp -r ${action-build}/dist $out/dist
              cp -r ${action-build}/main.cjs $out/main.cjs
              cp -r ${pyret-runtime-deps}/node_modules $out/node_modules

              makeWrapper ${nodejs-very-slim-exec} $out/bin/action-runner \
                --add-flags "--enable-source-maps" \
                --add-flags "$out/dist/index.js" \
                --set PA_PYRET_LANG_COMPILED_PATH "${compiled-pyret}/build/phaseA/lib-compiled:${compiled-pyret}/build/cpo" \
                --set PYRET_MAIN_PATH "$out/main.cjs"

              makeWrapper ${nodejs-very-slim-exec} $out/bin/grading-cli \
                --add-flags "--enable-source-maps" \
                --add-flags "$out/dist/grading.js" \
                --set PA_PYRET_LANG_COMPILED_PATH "${compiled-pyret}/build/phaseA/lib-compiled:${compiled-pyret}/build/cpo" \
                --set PYRET_MAIN_PATH "$out/main.cjs"
            '';
      });

      apps = eachSystem (
        pkgs:
        let
          packages = (self.packages.${pkgs.system});
        in
        {
          default = {
            type = "app";
            program = "${packages.default}/bin/action-runner";
          };
          grade = {
            type = "app";
            program = "${packages.default}/bin/grading-cli";
          };
        }
      );

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
