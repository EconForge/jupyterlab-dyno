# Making a new release of jupyterlab_dyno

The extension can be published to `PyPI` and `npm` manually or using the [Jupyter Releaser](https://github.com/jupyter-server/jupyter_releaser).

## Manual release

### Python package

This extension can be distributed as Python packages. All of the Python
packaging instructions are in the `pyproject.toml` file to wrap your extension in a
Python package. Before generating a package, you first need to install some tools:

```bash
pip install build twine hatch
```

Bump the version using `hatch`. By default this will create a tag.
See the docs on [hatch-nodejs-version](https://github.com/agoose77/hatch-nodejs-version#semver) for details.

```bash
hatch version <new-version>
```

Make sure to clean up all the development files before building the package:

```bash
jlpm clean:all
```

You could also clean up the local git repository:

```bash
git clean -dfX
```

To create a Python source package (`.tar.gz`) and the binary package (`.whl`) in the `dist/` directory, do:

```bash
python -m build
```

> `python setup.py sdist bdist_wheel` is deprecated and will not work for this package.

Then to upload the package to PyPI, do:

```bash
twine upload dist/*
```

### NPM package

To publish the frontend part of the extension as a NPM package, do:

```bash
npm login
npm publish --access public
```

## Automated releases with the Jupyter Releaser

The extension repository should already be compatible with the Jupyter Releaser. But
the GitHub repository and the package managers need to be properly set up. Please
follow the instructions of the Jupyter Releaser [checklist](https://jupyter-releaser.readthedocs.io/en/latest/how_to_guides/convert_repo_from_repo.html).

Here is a summary of the steps to cut a new release:

- Go to the Actions panel
- Run the "Step 1: Prep Release" workflow
- Check the draft changelog
- Run the "Step 2: Publish Release" workflow

> [!NOTE]
> Check out the [workflow documentation](https://jupyter-releaser.readthedocs.io/en/latest/get_started/making_release_from_repo.html)
> for more information.

## Publishing to `prefix-dev` (EconForge channel)

`jupyterlab-dyno` can be built as a conda package using `pixi build` or `rattler-build` (using `pixi.toml` or `recipe/recipe.yaml`) and published to the `econforge` channel on [prefix.dev](https://prefix.dev).

### 1. Build the conda package

Build the `.conda` package locally using `pixi` or `rattler-build`:

```bash
# Using pixi build
pixi build

# Or using rattler-build directly
rattler-build build --recipe recipe/recipe.yaml
```

The built `.conda` package will be located in the output directory (e.g. `output/noarch/jupyterlab_dyno-*.conda` or `.pixi/bld/output/noarch/`).

### 2. Upload to prefix.dev channel

Set your API token for prefix.dev (obtained from your prefix.dev account settings):

```bash
export PREFIX_API_KEY="your-prefix-api-token"
```

Upload the package to the `econforge` channel on prefix.dev:

```bash
rattler-build upload prefix -c econforge output/noarch/jupyterlab_dyno-*.conda
```

---

## Publishing to `conda-forge`

`jupyterlab-dyno` is available on `conda-forge` via the [jupyterlab-dyno-feedstock](https://github.com/conda-forge/jupyterlab-dyno-feedstock) repository.

### Automated bot PRs (Standard Workflow)

When a new version is published to PyPI:

1. **Automatic PR Creation**: The `regro-cf-autotick-bot` automatically detects the PyPI release and opens a PR on [jupyterlab-dyno-feedstock](https://github.com/conda-forge/jupyterlab-dyno-feedstock).
2. **Review & Merge**:
   - Verify that the version number, SHA256 checksum, and dependencies in `recipe/meta.yaml` (or `recipe/recipe.yaml`) match the new release.
   - Comment `@conda-forge-admin, please render` on the PR if re-rendering is required.
   - Merge the PR once CI checks pass.
3. **Automatic Deployment**: Merging the PR triggers conda-forge CI to automatically build and publish the updated package to the `conda-forge` channel.

### Manual feedstock update

If the bot PR is delayed or manual adjustments are needed:

1. Fork and clone [jupyterlab-dyno-feedstock](https://github.com/conda-forge/jupyterlab-dyno-feedstock).
2. Create a feature branch (e.g. `v0.1.x`).
3. Update `version` and `sha256` (from PyPI source archive) in `recipe/meta.yaml` or `recipe/recipe.yaml`.
4. Install `conda-smithy` and re-render:
   ```bash
   conda-smithy rerender
   ```
5. Commit, push, and open a PR on `conda-forge/jupyterlab-dyno-feedstock`.


