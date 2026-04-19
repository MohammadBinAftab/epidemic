# 🦠 EpiSim — Epidemic Spread Simulation

> A visually stunning, interactive simulation of epidemic spread dynamics using the **SEIR compartmental model** on network graphs.

![EpiSim Preview](./preview.png)

---

## 🎯 What It Simulates

EpiSim models how infectious diseases (like COVID-19, influenza) spread through a population represented as a **contact network** — where nodes are people and edges are social connections.

### SEIR Compartments

| State | Color | Description |
|-------|-------|-------------|
| **S** — Susceptible | 🔵 Ice Blue | Not yet infected, can catch disease |
| **E** — Exposed | 🟡 Amber | Infected but not yet contagious (incubation) |
| **I** — Infectious | 🔴 Crimson | Contagious and spreading disease |
| **R** — Recovered | 🟢 Emerald | Immune (or dead via mortality rate) |
| **D** — Deceased | ⚫ Slate | Died from infection |
| **V** — Vaccinated | 🟣 Lavender | Protected via pre-vaccination |

---

## 🌐 Network Topologies

| Type | Description | Real-World Analogy |
|------|-------------|-------------------|
| **Scale-Free (Barabási-Albert)** | Hubs with many connections, power-law degree distribution | Social networks, airports |
| **Random (Erdős-Rényi)** | Each edge exists with uniform probability | Random mixing populations |
| **Small World (Watts-Strogatz)** | High clustering + short path lengths | Workplace/community networks |
| **Grid** | Regular lattice, localized spread | Geographic/spatial spread |

---

## 🔧 Model Parameters

| Parameter | Symbol | Effect |
|-----------|--------|--------|
| Transmission Rate | β | Probability of spreading per contact per day |
| Incubation Rate | σ | Rate at which Exposed → Infectious |
| Recovery Rate | γ | Rate at which Infectious → Recovered |
| Mortality Rate | μ | Probability of death per infectious day |
| Avg Contacts | k | Mean node degree in network |

### Basic Reproduction Number (R₀)

```
R₀ = β × ⟨k⟩ / γ
```

- **R₀ > 1** → Epidemic grows
- **R₀ < 1** → Disease dies out
- **R₀ = 1** → Endemic equilibrium

---

## 💉 Intervention Strategies

| Intervention | Mechanism | Effect |
|-------------|-----------|--------|
| 😷 Mask Mandate | Reduces β by 45% | Slower transmission |
| 🏠 Lockdown | Reduces β by 60%, contacts by 50% | Major spread reduction |
| 💊 Vaccination (30%) | 30% of population starts immune | Herd immunity early |
| 🧪 Contact Tracing | Reduces β by 30% | Faster identification/isolation |

---

## 🚀 How to Run

Simply open `index.html` in any modern browser:

```bash
# Option 1: Direct open
open index.html

# Option 2: Local server (recommended)
python -m http.server 8765
# Then visit: http://localhost:8765
```

No dependencies, no npm, no build step. Pure HTML + CSS + vanilla JavaScript.

---

## 🎮 Features

- ✅ **Fully interactive** — adjust all parameters in real-time
- ✅ **4 network topologies** — scale-free, random, small-world, grid  
- ✅ **SEIR + Death model** with mortality rate
- ✅ **Force-directed layout** (Fruchterman-Reingold) for graph visualization
- ✅ **Animated glow effects** — infected nodes pulse with crimson glow
- ✅ **Real-time epidemic curve** charted continuously
- ✅ **R₀ calculator** with dynamic bar chart
- ✅ **Hover tooltips** — inspect any node's state and connections
- ✅ **Click to infect** — manually patient-zero any node
- ✅ **Event log** — tracks milestones (10% infected, peak, herd immunity)
- ✅ **Reproduction number** updates live with interventions
- ✅ **Attack rate, CFR, doubling time** metrics

---

## 🧠 Systems Thinking Insights

This simulation demonstrates:

1. **Non-linear dynamics** — small β change → massive difference in outbreak size  
2. **Network heterogeneity** — scale-free networks have super-spreader hubs  
3. **Intervention timing matters** — lockdown at day 5 vs day 20 has drastically different outcomes  
4. **Herd immunity threshold** — at R₀=2.24, need ~55% immune to stop spread  
5. **Small-world effect** — even a few long-range connections accelerate spread dramatically  

---

## 📁 File Structure

```
Epidemic/
├── index.html       # Main UI (HTML5 semantic structure)
├── style.css        # Full design system (CSS custom properties)
├── simulation.js    # Simulation engine + renderer + UI controller
└── README.md        # This file
```

---

*Built with vanilla JavaScript — no frameworks, no dependencies.*
