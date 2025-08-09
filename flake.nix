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
        pyret-repos = pkgs.stdenv.mkDerivation {
          pname = "pyret-repos";
          version = "1.0.0";

          sourceRoot = ".";

          srcs = [
            # https://github.com/ironm00n/pyret-lang/tree/unmerged
            (pkgs.fetchFromGitHub {
              name = "pyret-lang";
              owner = "ironm00n";
              repo = "pyret-lang";
              rev = "27a74f8dd4bcc762275b487e9d9e90630a25802d";
              # sha256 = lib.fakeHash;
              sha256 = "sha256-fIH8TzThMZcDoUfVOe0G+5rd6l8FuWoRf+64FoFjSko=";
            })

            # https://github.com/ironm00n/code.pyret.org/tree/horizon
            (pkgs.fetchFromGitHub {
              name = "cpo";
              owner = "ironm00n";
              repo = "code.pyret.org";
              rev = "756570952bbbd07081c7af515ecd7a177288dc50";
              # sha256 = lib.fakeHash;
              sha256 = "sha256-r5+0qd7crdthKT+6ppAyqSsAKu50rOvpXpeVsacd8/U=";
            })
          ];

          installPhase = ''
            mkdir -p $out
            cp -r ./* $out
          '';
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
              ' ${pyret-repos}/pyret-lang/package.json > $out/package.json

              cp ${pyret-repos}/pyret-lang/package-lock.json $out/package-lock.json
            '';
          in
          (pkgs.buildNpmPackage {
            pname = "pyret-runtime-deps";
            version = "1.0.0";
            inherit src;

            nodejs = pkgs.nodejs_24;
            # npmDepsHash = lib.fakeHash;
            npmDepsHash = "sha256-hxH66Mj2wbY5J6B9pRNen+qo8MHpw+X61D6Cgz+keMo=";
            dontNpmBuild = true;
            npmFlags = [ "--ignore-scripts" ];
            npmPruneFlags = [ "--omit=dev" ];

            installPhase = ''
              runHook preInstall
              mkdir -p $out
              cp -r node_modules $out/
              runHook postInstall
            '';
          }).overrideAttrs
            ({
              buildInputs = [ ];
              propagatedBuildInputs = [ ];
            });

        action-build = (
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
                --builtin-js-dir ${pyret-repos}/pyret-lang/src/js/trove/ \
                --builtin-arr-dir ${pyret-repos}/cpo/src/web/arr/trove/ \
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
          let
            nodejs_24-slim-exec = lib.getExe (
              pkgs.nodejs_24.override {
                enableNpm = false;
              }
            );
          in
          pkgs.runCommand "pawtograder-assignment-action"
            {
              nativeBuildInputs = [ pkgs.makeWrapper ];

              propagatedBuildInputs = with pkgs; [
                cairo
                pango
                pixman
              ];
            }
            ''
              mkdir -p $out/bin

              cp -r ${action-build}/dist $out/dist
              cp -r ${action-build}/main.cjs $out/main.cjs
              cp -r ${pyret-runtime-deps}/node_modules $out/node_modules

              makeWrapper ${nodejs_24-slim-exec} $out/bin/action-runner \
                --add-flags "--enable-source-maps" \
                --add-flags "$out/dist/index.js" \
                --set PYRET_MAIN_PATH "$out/main.cjs"

              makeWrapper ${nodejs_24-slim-exec} $out/bin/grading-cli \
                --add-flags "--enable-source-maps" \
                --add-flags "$out/dist/grading.js" \
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
