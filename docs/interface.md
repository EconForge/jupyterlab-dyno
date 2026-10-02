# Dyno Lab Interface Guide

**Dyno Lab** (`jupyterlab_dyno`) provides an interactive, live workspace for DSGE modeling directly inside JupyterLab. It supports Dyno files (`.dyno`, `.dyno.yaml`) and Dynare files (`.mod`).

---

## Workspace Layout

Opening any supported model file automatically opens a coordinated, side-by-side workspace:

```text
┌─────────────────────────────────┬──────────────────────────────────┐
│ Left Pane: Code Editor          │ Right Pane: Dyno Report          │
├─────────────────────────────────┼──────────────────────────────────┤
│                                 │ [Re-run] [Clear] [Options]       │
│  var y c k i;                   ├──────────────────────────────────┤
│  varexo e;                      │ Model Summary & Steady State     │
│  parameters beta alpha delta;   │                                  │
│  ...                            │ Eigenvalues & Stability Check    │
│  model;                         │                                  │
│    ...                          │ Interactive IRF Plots (Plotly)   │
│  end;                           │                                  │
└─────────────────────────────────┴──────────────────────────────────┘
```

- **Left Pane — Code Editor**: CodeMirror editor with specialized syntax highlighting for Dyno and Dynare files.
- **Right Pane — Dyno Report Viewer**: An interactive document widget executing on a background Python kernel (`xpython`) that renders the model solution.
- **Multi-document grouping**: Switching between model files keeps editors grouped on the left and corresponding solution views on the right.

---

## Interactive Features

### 1. Live Reactive Re-rendering
- Edits in the code editor automatically trigger background re-solving and re-rendering of the report after a short typing pause.
- **Scroll Preservation**: The viewer keeps your current scroll position across re-renders so you do not lose context while editing.
- **Editor Error Highlighting**: If the model contains syntax or specification errors, the offending lines are highlighted directly within the code editor pane.

### 2. Report Toolbar
The toolbar at the top of the report view provides quick actions:
- **Re-run**: Manually forces a full recalculation and re-rendering of the report.
- **Clear**: Clears the output display area.
- **Options**: Opens the Dyno Options sidebar panel.

### 3. Dyno Options Sidebar
Accessible from the sidebar tab or the **Options** toolbar button. Options are tracked independently per open model file:

| Option | Description |
| :--- | :--- |
| **Approximation Order** | Numerical approximation order for model perturbation (e.g. `1`). |
| **Simulation Type** | Format for IRF trajectories: `Level`, `Deviation`, or `Log-Deviation`. |
| **Horizon** | Number of simulation periods for IRFs (default: `40`). |
| **Recompute Steady-State** | Computes and displays only the steady-state solution without full dynamic simulations. |
| **Preserve scroll** | Toggles whether the output scroll position is retained after updates. |

---

## Report Contents

When solved, the Dyno report displays:
1. **Model Summary**: Declarations, equations, and calibrated parameter values.
2. **Steady State**: Static solution values for endogenous variables.
3. **Eigenvalues & Blanchard-Kahn Conditions**: Dynamic stability and determinacy diagnostics.
4. **Impulse Response Functions (IRFs)**: Interactive charts (zoom, pan, hover tooltips) powered by Plotly.

---

## Global Preferences
Default behavior can be configured globally in JupyterLab under:  
**Settings** → **Advanced Settings Editor** → **Dyno Lab**.
