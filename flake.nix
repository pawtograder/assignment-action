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
      packages = eachSystem (pkgs: {
        default = pkgs.buildNpmPackage {
          pname = "pawtograder-assignment-action";
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
          npmDepsHash = "sha256-tSjDttcCU/w9vNaomVKNIU/t1dkaaU0ESI+IB7zwHzA=";

          dontNpmBuild = true;
          npmFlags = [ "--ignore-scripts" ];
          npmPruneFlags = [ "--omit=dev" ];

          nativeBuildInputs = with pkgs; [
            makeWrapper
            gnumake

            # node-gyp related:
            pkg-config
            python3
          ];

          # native libraries needed for canvas
          buildInputs = with pkgs; [
            pixman
            cairo
            pango
          ];

          buildPhase = ''
            runHook preBuild

            exec 2>&1
            set -x

            # `/usr/bin/env` doesn't exist in minimal nix environment
            substituteInPlace node_modules/pyret-lang/Makefile \
              --replace "SHELL := /usr/bin/env bash" "SHELL := ${pkgs.bash}/bin/bash"
            cat node_modules/pyret-lang/Makefile

            echo "start post install scripts"
            npm rebuild # post install scripts
            echo "start ts package"
            npm run package

            echo "start compile pyret"
            npx pyret \
              --builtin-js-dir node_modules/pyret-lang/src/js/trove/ \
              --program pyret/main.arr \
              --outfile pyret/main.cjs \
              --no-check-mode --norun

            echo "done building"

            runHook postBuild
          '';

          postInstall = ''
            mkdir -p $out/lib/pawtograder
            mv $out/lib/node_modules/pawtograder-assignment-action/* $out/lib/pawtograder/
            rm -rf $out/lib/node_modules/pawtograder-assignment-action

            mkdir -p $out/lib/pawtograder/pyret
            cp pyret/main.cjs $out/lib/pawtograder/pyret/ || true

            mkdir -p $out/bin
            makeWrapper ${pkgs.nodejs_24}/bin/node $out/bin/pawtograder \
              --add-flags "--enable-source-maps" \
              --add-flags "$out/lib/pawtograder/dist/index.js" \
              # --chdir "$out/lib/pawtograder"
          '';
        };
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
