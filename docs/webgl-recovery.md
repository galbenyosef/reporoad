# WebGL failure recovery

The drive, building editor and plot preview share a graphics session. Each canvas
requests WebGL 2 before constructing Three.js. A missing or throwing context,
renderer construction failure, or lost context disables the canvases until the
visitor explicitly selects **Try Again**. Clock updates, tab changes and closing
the help dialog do not retry initialization.

The dismissible dialog explains Chrome, Edge and Firefox hardware acceleration
settings and the restrictions of in-app browsers. **Continue without 3D**, Escape
and the close button leave Chat, Explore and Add accessible. Each unavailable
canvas retains a **Graphics help** button. Retrying remounts only the canvases,
preserving directory filters and building edits. Non-graphics scene errors have
a separate explanation rather than being diagnosed as disabled WebGL.

React Three Fiber 9 awaits renderer creation outside its React error boundary.
The guarded factory catches construction errors and suspends the failed setup
while the shared failure state removes the canvas. The factory explicitly removes
its unconfigured root from Fiber's registry: normal Fiber cleanup assumes a scene
already exists. Successful canvases retain Fiber's normal lifecycle, while a
context-loss listener pauses the renderer and triggers unmounting. Revisit this
workaround when upgrading React Three Fiber.

## Verification

Run the unit suite with Node 22.13 or newer:

```sh
node --experimental-strip-types --test tests/*.test.mjs scripts/broadcast/*.test.mjs scripts/music/*.test.mjs
npx tsc --noEmit
npm run build
```

For browser regression checks, install dependencies with `npm ci`, install a
Playwright browser with `npx playwright install chromium`, and start `npm run dev`
in another terminal. Then run:

```sh
npm run test:graphics:browser
```

`REPOROAD_TEST_URL` can select another localhost port.
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` can select an existing Chromium installation.
`REPOROAD_SCREENSHOTS` optionally saves screenshots to that directory.

The browser suite checks denied and throwing WebGL contexts, exceptions during
Three.js construction, the absence of automatic retries and leaked roots, modal
dismissal, mobile layout and keyboard focus, Chat/Explore/Add interactions, draft
retention, working rendering, context loss and successful recovery, and broadcast
mode. API responses are isolated fixtures: these are UI regression tests, not
end-to-end tests of GitHub, D1, live chat delivery or music. The successful rendering
test uses Chromium's software WebGL renderer; it does not certify every physical
GPU or graphics driver.
