# A tour of dyno: writing a growth model step by step

Recorded length: about 5 min (dyno-tour.yaml). Each scene lists what is
said (subtitles) and what happens on screen.

---

## 0. Title

**On screen:** a white page, "Interactive Modeling in the Browser with Dyno"
and "(5 min)" below. After 3.5 s it fades to white, then JupyterLab's
loading screen appears.

## 1. An empty model

**On screen:** right-click in the file browser, New File, name it
`growth.dyno`. Double-click it, then close the file browser (click its icon).

**Say:**
- Let's create an empty .dyno file.
- Double-clicking on it opens two views.
- The model is written on the left.
- On the right, dyno shows what it understood. It updates while typing.

## 2. Parameters are assignments

**On screen:** type `beta <- 0.96`, then select the `<-`. On the next line,
type `r <- 1/beta`. Save. Open **Calibration**: `beta = 0.96`, `r = 1.04167`.

**Say:**
- Let's start with a parameter: the discount factor beta.
- The arrow `<-` is an assignment: it gives a value to a symbol.
- A second parameter, the gross interest rate, defined from beta.
- Assignments are evaluated in order, so r can use beta.

## 3. Equations: just write them

**On screen:** below a `# equations` comment, type:

```
y[t] = z[t] * k[t-1]^alpha
k[t] = (1-delta)*k[t-1] + i[t]
c[t] = y[t] - i[t]
```

Save. The overview lists the variables and flags `alpha^`, `delta^` as
missing parameters. Add `alpha <- 0.36` and `delta <- 0.1` under `r`.

**Say:**
- Now the equations.
- Equations use the equal sign. Time is written in brackets: t for today,
  t-1 for yesterday.
- There is no list of variables to declare: dyno works it out from the
  equations.
- It also noticed that alpha and delta have no value yet.

## 4. Future values

**On screen:** type the Euler equation.

```
beta*(c[t]/c[t+1])*(1-delta+alpha*y[t+1]/k[t]) = 1
```

**Say:**
- Future values are denoted by t+1.

## 5. Shocks

**On screen:** type

```
log(z[t]) = rho*log(z[t-1]) + epsilon[t]

epsilon[t] <- N(0.01)
```

and `rho <- 0.9` with the parameters. Save. The overview shows one
exogenous variable, `epsilon`.

**Say:**
- Productivity follows a log-normal AR(1) process, with mean 1.
- The shock is declared by its distribution: normal, with a standard
  deviation of 1%.
- dyno classifies epsilon as exogenous on its own.

## 6. Tags

**On screen:** append a name to each equation (`:: "Production"`,
`:: "Capital accumulation"`, `:: "Resource constraint"`,
`:: "Euler equation"`), and `:: [ar1, label="Productivity process"]` to the
AR(1). Save. Open **Equations**: each equation is shown with its name.

**Say:**
- The system is complete. Equations can be tagged with their name.
- Arbitrary information can also be attached: here, a tag and a label.
- The names show up in the report.

## 7. Steady state

**On screen:** type rough guesses under `# steady state`, then
`@run: check`. Save. Expand "Residuals are not zero": the Euler equation has
a residual of -0.21.

```
z[~] <- 1
k[~] <- 1
y[~] <- 1
i[~] <- 0.1
c[~] <- 0.9
```

**Say:**
- The tilde stands for the steady state. Let's type rough guesses.
- Are these guesses right? Let's ask dyno to check the model.
- They are not: the residuals of the equations are not zero.

**On screen:** insert `@run: steady` before `@run: check`. Save. Expand
"Steady-state converged" (algorithm, iterations, max residual...), close
it, then expand "Residuals are zero" (each equation at ~1e-14). Close it and
expand "Blanchard-Kahn conditions are met": the eigenvalues, sorted by
modulus.

Then change `beta <- 0.96` to `beta <- 1.08`: the card turns yellow,
"Blanchard-Kahn conditions are not met", with a second eigenvalue (0.9925)
inside the unit circle. Back to `beta <- 0.96`.

**Say:**
- Rather than solving the steady state by hand, dyno can find it, before
  the check.
- The steady state converged, and now all residuals are zero.
- The steady-state card tells how it was found: algorithm, iterations,
  final residual.
- The residuals card lists the residual of each equation.
- The check also looks at the eigenvalues: the Blanchard-Kahn conditions are
  met.
- What if humans were really patient?
- With beta = 1.08, the Blanchard-Kahn conditions are not met: too many
  stable roots.
- Just kidding.

## 8. Solve and simulate

**On screen:** add `@run: solve` and `@run: simulate`. Save. Expand the
**IRFS** table. Change to `@run: simulate: {T: 100}`: the table now
has 100 periods.

**Say:**
- @run lines say what to do with the model, in order: here, solve and
  simulate.
- simulate computes impulse responses to the shock: here they are, as a
  table.
- Commands take options, in YAML syntax: here, a horizon of 100 periods.

## 9. Plot

**On screen:** add `@run: plot`. Save. Then change it to
`@run: plot: {vars: [y,k,c,z], units: log-deviation}`.

**Say:**
- Now a plot.
- Here are the impulse responses to a productivity shock.
- plot takes options too: the variables to show, and the units.
- Responses are now in log-deviations from the steady state, in percent.

## 10. Playing with parameters

**On screen:** each time, only the digits change, and the plots update.

| Change | Capital peaks after |
|---|---|
| baseline (`rho <- 0.9`, `delta <- 0.1`) | 8 periods |
| `rho <- 0.5` | 3 periods |
| `rho <- 0.99` | 20 periods |
| `rho <- 0.99`, `delta <- 0.025` | 35 periods |

Then back to `rho <- 0.9`, `delta <- 0.1`.

**Say:**
- Change a parameter, and the whole analysis reruns.
- A less persistent shock: capital now peaks after 3 periods, instead of 8.
- A very persistent one: capital keeps building up for 20 periods.
- With slower depreciation, it builds up for 35 periods.
- Back to the original values.

## 11. Variants

**On screen:** add `@run: variants: {rho: [0.5, 0.9]}` as the first `@run`
line. Save. Each plot shows one curve per value of rho.

**Say:**
- To compare calibrations, list them in a variants line, before the other
  commands.
- Each plot now shows both calibrations.

## 12. A clean report, and goodbye

**On screen:** add `;` after `steady`, `check`, `solve` and `simulate`
(`@run: simulate: {T: 100};`). Save: only the plot is left. Then add `0.99`
to the variants.

**Say:**
- Finally, a semicolon mutes a command: let's keep only the plot.
- And one more calibration, for good measure.
- That's a complete model, from an empty file, in about twenty-five lines.
- Thank you for watching!

Below the last subtitle, the dyno walks to the sunset:
`🦖. . . . . . . . . . . . . . . . . 🌇`, the 🦖 moving to the right.

---

## The final file

```
beta <- 0.96
r <- 1/beta
alpha <- 0.36
delta <- 0.1
rho <- 0.9

# equations
y[t] = z[t] * k[t-1]^alpha  :: "Production"
k[t] = (1-delta)*k[t-1] + i[t]  :: "Capital accumulation"
c[t] = y[t] - i[t]  :: "Resource constraint"
beta*(c[t]/c[t+1])*(1-delta+alpha*y[t+1]/k[t]) = 1  :: "Euler equation"
log(z[t]) = rho*log(z[t-1]) + epsilon[t]  :: [ar1, label="Productivity process"]

epsilon[t] <- N(0.01)

# steady state
z[~] <- 1
k[~] <- 1
y[~] <- 1
i[~] <- 0.1
c[~] <- 0.9

@run: variants: {rho: [0.5, 0.9, 0.99]}
@run: steady;
@run: check;
@run: solve;
@run: simulate: {T: 100};
@run: plot: {vars: [y,k,c,z], units: log-deviation}
```
