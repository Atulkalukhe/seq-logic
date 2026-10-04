# Sequential Logic Lab · Unit IV

A dependency-free classroom resource built with HTML, CSS, and JavaScript. It is arranged in syllabus order and uses live controls, bit indicators, circuit diagrams, truth and excitation tables, and an updating counter timing diagram.

## Run locally

From this directory, start the static server:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000` in a browser. There is no package installation or build step.

## Explore

- **4.1 Sequential basics:** combinational AND, level-sensitive D latch, rising-edge D flip-flop, and active-high NOR / active-low NAND RS latches.
- **4.2 Flip-flops:** SR, JK, T, and D characteristics, excitation tables, applications, and edge sampling.
- **4.3 JK:** a teaching model of level-sensitive race-around beside a master-slave cycle.
- **4.4 Shift registers:** SISO, SIPO, PISO, PIPO, bidirectional, and universal four-bit operation.
- **4.5 Counters:** synchronous, ripple/asynchronous, ring, Johnson, up/down, decade, and MOD-N sequences with a live timing diagram.

Click or tap bit indicators to toggle them. Clock controls apply rising edges. In the counter lab, **Step** advances once and **Run** repeats until paused. On a keyboard, Space clocks the flip-flop workbench and R resets the experiments.

The race-around panel is explicitly illustrative: its selected propagation-delay count demonstrates possible repeated toggling. A physical level-sensitive circuit's exact final state depends on its actual delays and pulse width.
