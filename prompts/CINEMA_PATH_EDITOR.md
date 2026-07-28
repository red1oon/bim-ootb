
### ⚠ AMENDMENT 2 to §CPE_PACE_LOS (user, 2026-07-27) — the total field stays the global speed knob
> *"remember there is also the overall speed control ie the total time of movie length in the panel
> can be set to a faster when reduced, or otherwise"*

Already built (`_state.userTotal`, `§CPE_TOTAL`, uniform `scale` in `_buildOverride`) and it must
survive the pacing work intact. **The interaction is the trap:** `tour.js`'s `_paceBuildRemap` does
TWO things — it redistributes time along the path AND rescales the action's own total via
`meanFactor`. The second one would silently fight an explicitly-keyed total: the user types 40s, the
remap decides the path is open and hands back 31s. So:
- **User has keyed a total → the brake REDISTRIBUTES within it only. `meanFactor` rescaling is OFF.**
  Their number is the film's length, full stop.
- **User has not keyed one → the derived total stands, and `meanFactor` may inform it** (that is the
  §CPE_PACING "length is a consequence of the building" model, which the user already ratified).
**Gate:** with a keyed total of T, the baked film's duration is T ± one frame, no matter how busy or
open the path is — while the WITHIN-film speed still varies. Both halves in one gate, or the brake
can quietly eat the user's setting and still look right.
