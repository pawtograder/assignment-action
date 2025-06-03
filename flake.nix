{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/release-25.05";
    systems.url = "github:nix-systems/default";
  };

  outputs =
    { nixpkgs, systems, ... }:
    let
      eachSystem = f: nixpkgs.lib.genAttrs (import systems) (s: f (import nixpkgs { system = s; }));
    in
    {
      devShells = eachSystem (pkgs: {
        default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_20
            gnumake
          ];
          shellHook = ''
            export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath [ pkgs.libuuid ]}:''$LD_LIBRARY_PATH"
          '';
        };
      });
    };
}
