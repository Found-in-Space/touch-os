# Three.js Living Room Demo

Run the example locally:

```sh
npm run example:living-room
```

The scene demonstrates three rendering paths side by side:

- the TV uses the shared Touch OS UI surface
- the rear-view mirrors use embedded surfaces in `copy` mode
- the back-wall picture opposite the TV uses an externally rendered shader surface in `composite` mode

Desktop controls:

- `W`, `A`, `S`, `D`: fallback keyboard locomotion
- Right mouse drag or `Shift` + left drag: look around
- Left click: interact with the transparent HUD overlay or the TV panel
- Hold the HUD movement controls to drive continuous motion
- Hold the HUD turn controls to rotate; hold the speed controls to adjust move speed

XR behavior:

- Enter XR with the browser XR button in the top-right corner
- A separate head-mounted rear-view mirror remains visible in XR
- The arm-mounted controller panel still appears for interactive controls
- Use the dominant controller ray and hit marker to interact with the arm panel or the TV

Scene notes:

- The wall mirror on the left remains a copy-mode embedded surface
- The animated picture on the back wall is a foreign GPU surface presented through the composite path
