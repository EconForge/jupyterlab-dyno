# jupyter_dynare

[![Github Actions Status](/workflows/Build/badge.svg)](/actions/workflows/build.yml)

A Mimerenderer JupyterLab extension for Dynare's `.mod` files using [Dyno.py](https://github.com/EconForge/dyno.py).


## Setup Instructions

### Cloning the repo
This project contains a git submodule, in order to clone it, use
```
git clone --recurse-submodules https://github.com/ousema-bouaneni/jupyter_dynare
```

If you have already cloned the repo without the `--recurse-submodules` option, then you can simply run the following command to fetch `dyno.py`
```
git submodule update --init
```

### Setting up the environment
```
micromamba create -n jupyterlab-ext --override-channels --strict-channel-priority -c conda-forge -c nodefaults jupyterlab=4 nodejs=20 git copier=9 jinja2-time
micromamba activate jupyterlab-ext
```

### Installing the extension
```
cd jupyter_dynare
pip install -ve .
jupyter labextension develop --overwrite .
```
For real-time auto-compilation of the extension code:
```
jlpm run watch
```

### Using the extension
```
cd dyno.py
pixi install --environment prod
# needs to be done in dyno.py directory because absolute import of dyno doesn't work yet
jupyter lab
```

Verify that the prod environment appears as a kernel in the jupyterlab home screen. If that is not the case, execute the following command and rerun the previous command:
```
pixi run --environment prod python -m ipykernel install --user --name prod --display-name "Dyno kernel (prod)"
```

Now you can simply open one of the files in `examples/modfiles` using a right click with a text editor and `Dynare viewer` at the same time, and after each save, the contents of the Mimerenderer should be automatically updated.