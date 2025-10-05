# jupyterlab dyno (aka Dyno Lab)

[![Github Actions Status](/workflows/Build/badge.svg)](/actions/workflows/build.yml)
[![Binder](https://mybinder.org/badge_logo.svg)](https://mybinder.org/v2/gh//main?urlpath=lab)

A JupyterLab extension for DSGE modeling.

## Installation

- With [micromamba](https://github.com/mamba-org/micromamba-releases):

```
micromamba install -c https://repo.prefix.dev/econforge jupyterlab_dyno
```

- With [pixi](https://pixi.sh):

```
pixi add jupyterlab_dyno
```

A conda-forge release of `jupyterlab_dyno` is in the works so the above command should work for you. If it doesn't then add the `"https://repo.prefix.dev/econforge"` to the list of channels in your pixi project and try to run it again.

## Development

### Requirements

- [Pixi](https://pixi.sh): a reproducible package management tool

### Development Installation

```bash
pixi install
```

### Run JupyterLab

```bash
pixi run lab
```

### Live development (watch + lab)

```bash
pixi run watch
```

This runs `jlpm watch` and `jupyter lab` in parallel.
Every saved change will be rebuilt automatically — just refresh JupyterLab to load it.

### Dyno Options Sidebar

Opening a supported model file (e.g. a `.mod` or `.dyno` file) now also exposes a sidebar panel named "Dyno Options" on the left side of JupyterLab.

Use it to tweak per-file run parameters without editing global settings:

- Order: numerical order (default 1)
- Steady state only: if checked, only the steady state is computed
- Preserve scroll: toggle preservation of the output panel scroll position across re-renders for the current file

Changing any option automatically re-renders the currently active Dyno view. Each file remembers its own option set for the session; switching between open model files updates the panel to reflect that file's stored values.

These per-file options are merged on top of the extension's global settings (defined in `Settings -> Advanced Settings Editor -> Dyno Lab`).

### Important files

- `pixi.toml` contains the development environment dependencies and scripts
- `src/index.ts` contains all of the extension's code and logic
- `schema/plugin.json` defines the user-facing extension settings
- `package.json` contains the core JupyterLab nodejs dependencies and their versions
- `recipe.yaml` contains a conda-build recipe for the extension

## Packaging and release

### For conda-forge

A `conda-build` / `rattler-build` v1 recipe can be found in the `recipe` folder.
You can test it out by installing `rattler-build` if you don't have it already with

```bash
pixi global install rattler-build
```

and then by running the build command:

```bash
rattler-build build -r recipe
```

The version that is built with this command is not the version available locally, but rather a github release that can be modified by publishing a new release on the EconForge repo and then editing the context of the `recipe.yaml` file to reflect the new version tag.

### For a prefix.dev channel

If you just want a `.conda` file in order to publish the extension on a custom conda channel (like https://prefix.dev/channels/econforge), this recipe is not needed, and you only need to run the following command in the project root.

```
pixi build
```
