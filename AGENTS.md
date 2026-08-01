# Working agreements

## Avoid UI clutter

The gameplay view is the mine, not a dashboard. Before adding a widget, ask
whether an existing one can carry the information instead — the fuel gauge shows
the return-fuel forecast as a second colour rather than as a readout of its own.
Prefer folding a new number into an existing meter, label, tooltip or accessible
name; use a transient toast for one-off events; put anything that is only
occasionally interesting behind the Info / Cargo overlay. Two elements saying the
same thing is one too many, and a permanent element that is usually irrelevant is
noise around the thing the player is actually watching.

## Keep the rules pure

Gameplay maths, formatting and classification live in `src/core/` as pure
functions with co-located `*.test.ts`. Components and the game loop read them;
they never re-derive the same rule inline.

## Verify with `./test.sh`

Lint, client tests, typecheck, production build and relay tests, in that order.
It is the definition of "done" for a change.
